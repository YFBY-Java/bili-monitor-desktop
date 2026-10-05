import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { LocalCoreRuntime } from "@bmd/core-runtime"
import { build } from "vite"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

describe("actual realtime Worker HTTP configuration and cancellation", () => {
  let buildDirectory: string, directory: string, core: LocalCoreRuntime | undefined
  const children: ChildProcessWithoutNullStreams[] = []
  beforeAll(async () => {
    buildDirectory = await mkdtemp(resolve(tmpdir(), "bmd-realtime-http-build-"))
    const fixture = fileURLToPath(new URL("./__fixtures__/realtime-network.ts", import.meta.url))
    await build({ configFile: false, logLevel: "silent", ssr: { noExternal: true },
      resolve: { alias: [{ find: /^node:https$/, replacement: fixture }, { find: /^ws$/, replacement: fixture }] },
      build: { ssr: fileURLToPath(new URL("../../../../workers/node-realtime/src/process.ts", import.meta.url)),
        outDir: buildDirectory, emptyOutDir: false, target: "node24", rollupOptions: { output: { entryFileNames: "worker.mjs" } } } })
  }, 30_000)
  afterEach(async () => {
    await core?.stop(); core = undefined
    for (const child of children.splice(0)) {
      if (child.exitCode === null) { const exited = new Promise<void>(done => child.once("exit", () => done())); child.kill(); await exited }
    }
    vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  afterAll(async () => { if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true }) })

  it.each([false, true])("loads disk/env HTTP settings through Core into all three Node endpoints (env=%s)", async environment => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-realtime-http-config-"))
    await mkdir(resolve(directory, "config"))
    const configuration = { connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture rank configuration/2", referer: "https://live.bilibili.com/configured-rank" }
    const path = resolve(directory, "config/bilibili-live-collection.json")
    const contents = JSON.stringify({ enabled: false, ...(environment ? {} : configuration) })
    await writeFile(path, contents)
    for (const [key, value] of Object.entries({ CONNECT_TIMEOUT_MS: "1250", READ_TIMEOUT_MS: "0",
      USER_AGENT: configuration.userAgent, REFERER: configuration.referer })) {
      vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${key}`, environment ? value : undefined)
    }
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", resolve(buildDirectory, "worker.mjs"))
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const started = await core.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    expect(started).toMatchObject({ running: true, status: "CONNECTED" })
    const requests = (await readFile(resolve(directory, "fixture-http.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(requests.map(item => [item.userAgent, item.referer])).toEqual([
      [configuration.userAgent, "https://www.bilibili.com/"], [configuration.userAgent, "https://www.bilibili.com/"],
      [configuration.userAgent, configuration.referer]
    ])
    await core.stopBilibiliLiveDanmaku(room.id)
    expect(await readFile(path, "utf8")).toBe(contents)
  }, 20_000)

  it.each([undefined, false, true])("answers stop while HTTP is pending (keepAlive=%s)", async keepAlive => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-realtime-http-stop-"))
    const child = spawn(process.execPath, [resolve(buildDirectory, "worker.mjs")], {
      cwd: directory, env: { ...process.env, BMD_DATA_DIR: directory }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    children.push(child)
    const messages: Array<{ id: string; ok?: boolean; type?: string; error?: { code: string } }> = []
    const lines = createInterface({ input: child.stdout })
    lines.on("line", line => messages.push(JSON.parse(line)))
    child.stdin.write(JSON.stringify({ id: "starting", type: "start", ...(keepAlive === undefined ? {} : { keepAlive }), payload: { connectionId: "one", roomId: "33",
      httpConfiguration: { connectTimeoutMs: 0, readTimeoutMs: 0, userAgent: "Fixture wait" } } }) + "\n")
    await vi.waitFor(async () => expect(await readFile(resolve(directory, "fixture-http.jsonl"), "utf8")).toContain("Fixture wait"))
    if (keepAlive) await vi.waitFor(() => expect(messages.filter(item => item.type === "request-alive")).toHaveLength(2), { timeout: 7000 })
    child.stdin.write(JSON.stringify({ id: "stopping", type: "stop", payload: { connectionId: "one" } }) + "\n")
    await vi.waitFor(() => expect(messages.find(item => item.id === "starting" && item.ok !== undefined)).toMatchObject({ ok: false,
      error: { code: "BILIBILI_DANMAKU_CANCELLED" } }))
    expect(messages.find(item => item.id === "stopping")).toMatchObject({ ok: true })
    expect(messages.some(item => item.type === "request-alive")).toBe(keepAlive === true)
    expect(await readFile(resolve(directory, "fixture-cancelled.txt"), "utf8")).toContain("cancelled")
  }, 10_000)

  it.each(["stdin", "stdout"] as const)("cancels actual pending HTTP and exits when its %s pipe is lost", async pipe => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-realtime-pipe-"))
    const child = spawn(process.execPath, [resolve(buildDirectory, "worker.mjs")], {
      cwd: directory, env: { ...process.env, BMD_DATA_DIR: directory }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    children.push(child)
    child.stdout.resume(); child.stderr.resume()
    child.stdin.write(JSON.stringify({ id: "starting", type: "start", keepAlive: true,
      payload: { connectionId: "one", roomId: "33", httpConfiguration: {
        connectTimeoutMs: 0, readTimeoutMs: 0, userAgent: "Fixture wait" } } }) + "\n")
    await vi.waitFor(async () => expect(await readFile(resolve(directory, "fixture-http.jsonl"), "utf8")).toContain("Fixture wait"))
    if (pipe === "stdin") child.stdin.end()
    else child.stdout.destroy()
    await vi.waitFor(() => expect(child.exitCode).not.toBeNull(), { timeout: 8000 })
    expect(child.exitCode).toBe(pipe === "stdin" ? 0 : 1)
    expect(await readFile(resolve(directory, "fixture-cancelled.txt"), "utf8")).toContain("cancelled")
    expect(() => process.kill(child.pid!, 0)).toThrow()
  }, 10_000)
})
