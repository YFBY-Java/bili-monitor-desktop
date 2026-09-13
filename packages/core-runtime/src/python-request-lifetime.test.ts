import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

const processAdapter = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn: processAdapter.spawn }))

describe("Python request watchdog with opt-in liveness frames", () => {
  let transport: NdjsonPythonWorkerTransport
  afterEach(async () => { await transport?.stop(); vi.useRealTimers() })
  function setup() {
    vi.useFakeTimers()
    const frames: Array<{ id: string; type: string; correlationId: string; traceId: string; keepAlive?: boolean }> = []
    const child = Object.assign(new EventEmitter(), { exitCode: null as number | null,
      stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
      stdin: { write: (line: string, _encoding: string, done: () => void) => { frames.push(JSON.parse(line)); done() }, end: vi.fn() },
      kill: vi.fn(() => { child.exitCode = 1; child.emit("exit", 1); return true }) })
    processAdapter.spawn.mockReturnValue(child)
    transport = new NdjsonPythonWorkerTransport({ pythonExecutable: "D:/fixture/python.exe", pythonPath: "D:/fixture",
      dataDirectory: "D:/fixture/data", role: "crawler", requestTimeoutMs: 20_000 })
    function respond(index: number, payload: unknown, type = "worker.request-alive", overrides: object = {}) {
      const frame = frames[index]!
      child.stdout.emit("data", JSON.stringify({ ...frame, type, payload, ...overrides }) + "\n")
    }
    return { frames, child, respond }
  }
  it("keeps healthy active and queued live requests pending past the old total limit", async () => {
    const f = setup()
    const settled: unknown[] = []
    const first = transport.request("bilibili.live.fetch-room-init", {}).then(value => { settled.push(value); return value })
      .catch((error: unknown) => { settled.push(error); return error })
    const second = transport.request("bilibili.live.fetch-room-info", {}).then(value => { settled.push(value); return value })
      .catch((error: unknown) => { settled.push(error); return error })
    expect(f.frames.every(frame => frame.keepAlive === true)).toBe(true)
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(15_000)
      f.respond(0, { requestType: f.frames[0]!.type })
      await Promise.resolve()
      expect(settled).toEqual([])
    }
    f.respond(0, { completed: 1 }, f.frames[0]!.type + ".result")
    f.respond(1, { completed: 2 }, f.frames[1]!.type + ".result")
    expect(await first).toEqual({ completed: 1 })
    expect(await second).toEqual({ completed: 2 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(["type", "trace", "correlation", "id"])("does not renew on a mismatched %s; kills the unresponsive worker", async mismatch => {
    const f = setup()
    const pending = transport.request("bilibili.live.fetch-room-init", {}).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(15_000)
    f.respond(0, { requestType: mismatch === "type" ? "worker.ping" : f.frames[0]!.type }, undefined,
      mismatch === "trace" ? { traceId: "wrong" } : mismatch === "id" ? { id: "wrong" }
        : mismatch === "correlation" ? { correlationId: "wrong" } : {})
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBeInstanceOf(Error)
    expect(f.child.kill).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("does not opt in ordinary requests or accept unsolicited liveness as a result", async () => {
    const f = setup()
    const pending = transport.request("worker.ping", {}).catch((error: unknown) => error)
    expect(f.frames[0]?.keepAlive).not.toBe(true)
    f.respond(0, { requestType: "worker.ping" })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toBeInstanceOf(Error)
  })
  it("stops and rejects both active and queued work without retaining watchdogs", async () => {
    const f = setup()
    const first = transport.request("bilibili.live.fetch-room-init", {}).catch((error: unknown) => error)
    const second = transport.request("bilibili.live.fetch-room-info", {}).catch((error: unknown) => error)
    await transport.stop()
    expect(await first).toBeInstanceOf(Error)
    expect(await second).toBeInstanceOf(Error)
    expect(f.child.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
