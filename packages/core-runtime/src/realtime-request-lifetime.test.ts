import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NdjsonRealtimeWorkerTransport } from "./ndjson-realtime-worker-transport"

const host = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn: host.spawn }))
describe("realtime request liveness watchdog", () => {
  let transport: NdjsonRealtimeWorkerTransport
  afterEach(async () => { await transport?.stop(); vi.useRealTimers(); host.spawn.mockReset() })
  function setup() {
    vi.useFakeTimers()
    const requests: Array<{ id: string; type: string; keepAlive?: boolean; payload: { connectionId: string } }> = []
    const child = Object.assign(new EventEmitter(), { exitCode: null as number | null,
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill: vi.fn(() => { child.exitCode = 1; child.emit("exit", 1); return true }) })
    child.stdin.on("data", chunk => requests.push(JSON.parse(chunk.toString())))
    host.spawn.mockReturnValue(child)
    transport = new NdjsonRealtimeWorkerTransport({ nodeExecutable: "D:/fixture/node.exe", workerEntry: "D:/fixture/worker.js",
      dataDirectory: "D:/fixture", requestTimeoutMs: 30_000 })
    const send = (value: object) => child.stdout.write(JSON.stringify(value) + "\n")
    return { requests, child, send }
  }
  it("keeps start pending across 30-second windows but resolves only the actual result", async () => {
    const f = setup()
    let settled = false
    const pending = transport.request("start", { connectionId: "one", roomId: "33" })
      .then(result => { settled = true; return result }, error => { settled = true; return error })
    const request = f.requests[0]!
    try {
      expect(request.keepAlive).toBe(true)
      for (let n = 0; n < 5; n++) {
        await vi.advanceTimersByTimeAsync(20_000)
        f.send({ id: request.id, type: "request-alive", requestType: "start", connectionId: "one" })
        expect(settled).toBe(false)
      }
      f.send({ id: request.id, ok: true, result: { authMode: "ANONYMOUS" } })
      expect(await pending).toEqual({ authMode: "ANONYMOUS" })
      expect(vi.getTimerCount()).toBe(0)
    } finally { await transport.stop(); await pending }
  })
  it.each(["wrong-id", "wrong-connection", "stop"])("rejects %s keep-alive and kills the unresponsive process", async mismatch => {
    const f = setup()
    const pending = transport.request(mismatch === "stop" ? "stop" : "start", { connectionId: "one", roomId: "33" }).catch(error => error)
    const request = f.requests[0]!
    await vi.advanceTimersByTimeAsync(20_000)
    f.send({ id: mismatch === "wrong-id" ? "another" : request.id, type: "request-alive", requestType: "start",
      connectionId: mismatch === "wrong-connection" ? "another" : "one" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toMatchObject({ code: "REALTIME_WORKER_TIMEOUT" })
    expect(f.child.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("reserves bounded control capacity so a full start queue can still be cancelled", async () => {
    const f = setup()
    const pending = Array.from({ length: 100 }, (_, index) => transport.request("start", { connectionId: `c-${index}` }).catch(error => error))
    try {
      const extra = await transport.request("start", { connectionId: "extra" }).catch(error => error)
      expect(extra).toMatchObject({ code: "REALTIME_WORKER_BUSY" })
      const stopping = transport.request("stopAll", {}).catch(error => error)
      pending.push(stopping)
      expect(f.requests.at(-1)?.type).toBe("stopAll")
      f.send({ id: f.requests.at(-1)!.id, ok: true, result: { stopped: true } })
      expect(await stopping).toEqual({ stopped: true })
    } finally { await transport.stop(); await Promise.all(pending) }
  })
})
