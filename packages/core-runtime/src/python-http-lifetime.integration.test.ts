import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { createRuntimeEnvelope, RuntimeEnvelopeSchema } from "@bmd/contracts"
import { afterEach, describe, expect, it } from "vitest"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"
import { safeWorkerEnvironment } from "./worker-environment"

describe("actual Python HTTP liveness and parent pipe loss", () => {
  let directory: string
  let transport: NdjsonPythonWorkerTransport | undefined
  let child: ChildProcessWithoutNullStreams | undefined
  let exit: Promise<number | null> | undefined
  const pythonPath = resolve(process.cwd(), "../../workers/python/tests/fixtures/live_http_wait")
  const rankType = "bilibili.live.rank.fetch"
  const payload = { taskId: "task", attempt: 1, leaseId: "lease", roomId: "102", ruid: "2",
    family: "GUARD", type: "guard_weekly", page: 1, pageSize: 30, httpConfiguration: { readTimeoutMs: 0 } }
  afterEach(async () => {
    await transport?.stop(); transport = undefined
    if (child) { child.stdin.destroy(); child.stdout.destroy(); if (child.exitCode === null) child.kill(); await exit }
    child = undefined; exit = undefined
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  it("returns an actual rank response after a healthy request exceeds the watchdog interval", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-python-http-slow-"))
    transport = new NdjsonPythonWorkerTransport({ pythonExecutable: process.env.BMD_PYTHON_EXE!, pythonPath,
      dataDirectory: directory, role: "crawler", requestTimeoutMs: 7000 })
    const result = await transport.request(rankType, payload)
    expect(result).toMatchObject({ rankFamily: "GUARD", entries: [{ displayName: "合成长请求观众" }] })
    expect(await readFile(resolve(directory, "http-started"), "utf8")).toBe("started")
  }, 20_000)
  it.each([["bilibili.follower.fetch-card", 20], ["bilibili.follower.fetch-card.v2", "20"]] as const)("returns an actual %s response after the initial watchdog interval", async (type, count) => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-python-follower-slow-"))
    transport = new NdjsonPythonWorkerTransport({ pythonExecutable: process.env.BMD_PYTHON_EXE!, pythonPath,
      dataDirectory: directory, role: "crawler", requestTimeoutMs: 7000 })
    expect(await transport.request(type, { taskId: "t", leaseId: "l", attempt: 1,
      mid: "2", httpConfiguration: { readTimeoutMs: 0 } })).toMatchObject({ nickname: "合成长请求粉丝", followerCount: count })
  }, 20_000)
  it.each(["bilibili.live.fetch-room-init", rankType, "bilibili.follower.fetch-card", "bilibili.follower.fetch-relation-stat", "bilibili.follower.fetch-profile",
    "bilibili.follower.fetch-card.v2", "bilibili.follower.fetch-relation-stat.v2", "bilibili.follower.fetch-profile.v2"])("cancels active HTTP and exits after the parent closes the stdout pipe: %s", async type => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-python-http-pipe-"))
    child = spawn(process.env.BMD_PYTHON_EXE!, ["-m", "bmd_workers.runtime", "--role", "crawler"], {
      cwd: pythonPath, env: safeWorkerEnvironment(process.env, { BMD_DATA_DIR: directory, PYTHONPATH: pythonPath,
        PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" }),
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    })
    exit = new Promise((resolveExit, reject) => { child!.once("exit", resolveExit); child!.once("error", reject) })
    const request = createRuntimeEnvelope({ id: "request", type, timestamp: new Date().toISOString(),
      correlationId: "correlation", traceId: "trace", keepAlive: true,
      payload: type === rankType ? { ...payload, ruid: "3" } : type.startsWith("bilibili.follower.")
        ? { taskId: "task", attempt: 1, leaseId: "lease", mid: "3", httpConfiguration: { readTimeoutMs: 0 } }
        : { taskId: "task", attempt: 1, leaseId: "lease", roomId: "3", httpConfiguration: { readTimeoutMs: 0 } } })
    const lines = createInterface({ input: child.stdout })
    const alive = new Promise<unknown>((resolveFrame, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker emitted no liveness frame")), 10_000)
      lines.once("line", line => { clearTimeout(timer); resolveFrame(JSON.parse(line)) })
      lines.once("close", () => { clearTimeout(timer); reject(new Error("Worker stdout closed before liveness")) })
    })
    child.stdin.write(JSON.stringify(request) + "\n")
    const frame = RuntimeEnvelopeSchema.parse(await alive)
    expect(frame).toMatchObject({ id: request.id, type: "worker.request-alive",
      correlationId: request.correlationId, traceId: request.traceId, payload: { requestType: type } })
    expect(await readFile(resolve(directory, "http-started"), "utf8")).toBe("started")
    lines.close()
    child.stdout.destroy()
    child.stdin.end()
    const code = await exit
    expect(code).not.toBe(0)
    expect(await readFile(resolve(directory, "http-cancelled"), "utf8")).toBe("cancelled")
  }, 20_000)
})
