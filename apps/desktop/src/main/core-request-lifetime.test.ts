import { EventEmitter } from "node:events"
import { createRuntimeEnvelope, type RuntimeEnvelope } from "@bmd/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreController } from "./core-client"

const adapter = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: adapter.fork } }))

describe("desktop Core liveness watchdog", () => {
  let controller: LocalCoreController
  afterEach(async () => { await controller?.stop(); vi.useRealTimers() })
  async function setup() {
    vi.useFakeTimers()
    const requests: RuntimeEnvelope[] = []
    const child = Object.assign(new EventEmitter(), { pid: 123 as number | undefined, stderr: new EventEmitter(),
      kill: vi.fn(() => { child.pid = undefined; child.emit("exit", 1) }),
      postMessage: (request: RuntimeEnvelope) => {
        requests.push(request)
        if (request.type === "core.bootstrap") respond(request, { coreStatus: { state: "ready", version: "test",
          dataDirectory: "D:/fixture", databaseReady: true, schemaVersion: 13, startedAt: new Date().toISOString() },
          workers: [], sequence: 0 }, "core.bootstrap.result")
        if (request.type === "core.shutdown") { respond(request, { accepted: true }, "core.shutdown.result"); child.kill() }
      } })
    function respond(request: RuntimeEnvelope, payload: unknown, type = "core.request-alive", overrides: object = {}) {
      child.emit("message", { ...createRuntimeEnvelope({ ...request, type, payload }), ...overrides })
    }
    adapter.fork.mockReturnValue(child)
    controller = new LocalCoreController({ entryPath: "D:/fixture/core.js", dataDirectory: "D:/fixture",
      douyinOAuth: { mode: "disabled" }, credentialKeyBase64: Buffer.alloc(32, 1).toString("base64") })
    await controller.start()
    return { child, requests, respond }
  }
  const id = "11111111-1111-4111-8111-111111111111"
  it("keeps a live command pending for longer than 90 seconds and returns its actual result", async () => {
    const f = await setup()
    let settled = false
    const pending = controller.refreshBilibiliLiveRoom({ roomMonitorId: id })
      .then(value => { settled = true; return value }, (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    expect(request.keepAlive).toBe(true)
    for (let count = 0; count < 4; count++) {
      await vi.advanceTimersByTimeAsync(60_000)
      f.respond(request, { requestType: request.type })
      await Promise.resolve()
      expect(settled).toBe(false)
    }
    f.respond(request, { roomMonitorId: id, uid: "2", roomId: "102", success: true,
      capturedAt: new Date().toISOString(), message: "ok" }, request.type + ".result")
    expect(await pending).toMatchObject({ success: true })
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(["type", "trace", "correlation"])("rejects invalid %s liveness and stops unresponsive Core", async mismatch => {
    const f = await setup()
    const pending = controller.refreshBilibiliLiveRoom({ roomMonitorId: id }).catch((error: unknown) => error)
    const request = f.requests.at(-1)!
    await vi.advanceTimersByTimeAsync(60_000)
    f.respond(request, { requestType: mismatch === "type" ? "core.bootstrap" : request.type }, undefined,
      mismatch === "trace" ? { traceId: "wrong" } : mismatch === "correlation" ? { correlationId: "wrong" } : {})
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await pending).toBeInstanceOf(Error)
    expect(f.child.kill).toHaveBeenCalledOnce()
    expect(controller.isRunning()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
