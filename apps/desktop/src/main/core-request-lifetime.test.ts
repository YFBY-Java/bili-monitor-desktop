import { EventEmitter } from "node:events"
import { createRuntimeEnvelope, type RuntimeEnvelope } from "@bmd/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreController } from "./core-client"

const adapter = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: adapter.fork } }))

describe("desktop Core liveness watchdog", () => {
  let controller: LocalCoreController
  afterEach(async () => { await controller?.stop(); vi.useRealTimers() })
  async function setup(deferShutdown = false) {
    vi.useFakeTimers()
    const requests: RuntimeEnvelope[] = []
    const child = Object.assign(new EventEmitter(), { pid: 123 as number | undefined, stderr: new EventEmitter(),
      kill: vi.fn(() => { child.pid = undefined; child.emit("exit", 1) }),
      postMessage: (request: RuntimeEnvelope) => {
        requests.push(request)
        if (request.type === "core.bootstrap") respond(request, { coreStatus: { state: "ready", version: "test",
          dataDirectory: "D:/fixture", databaseReady: true, schemaVersion: 13, startedAt: new Date().toISOString() },
          workers: [], sequence: 0 }, "core.bootstrap.result")
        if (request.type === "core.shutdown") {
          respond(request, { accepted: true }, "core.shutdown.result")
          if (!deferShutdown) child.kill()
        }
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
  it("keeps a 240-second export alive and drains it before stopping Core", async () => {
    const f = await setup(true)
    let settled = false
    const pending = controller.prepareBilibiliLiveSessionExport({ sessionId: id, category: "all" })
      .then(value => { settled = true; return value }, (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    // Main has sent this request, but a synchronous Core snapshot has not yet
    // accepted it. Only the active export can send correlated heartbeats.
    const queuedHttp = controller.refreshBilibiliLiveRoom({ roomMonitorId: id })
      .catch((error: unknown) => error)
    const queuedRequest = f.requests.at(-1)!
    let stopping: Promise<void> | undefined
    try {
      expect(request.keepAlive).toBe(true)
      for (let count = 0; count < 4; count++) {
        await vi.advanceTimersByTimeAsync(60_000)
        f.respond(request, { requestType: request.type })
        if (count === 0) stopping = controller.stop()
        expect(settled).toBe(false)
        expect(f.child.kill).not.toHaveBeenCalled()
      }
      f.respond(request, { sessionId: id, category: "all", temporaryPath: "D:/fixture/export.zip",
        suggestedFileName: "export.zip", mediaType: "application/zip", schemaVersion: "2",
        coverageStatus: "RECEIVED_WHILE_ONLINE" }, request.type + ".result")
      expect(await pending).toMatchObject({ category: "all", temporaryPath: "D:/fixture/export.zip" })
      f.respond(queuedRequest, { code: "SYNTHETIC_QUEUED_HTTP_STOP", message: "fixture", retryable: false }, "core.error")
      expect(await queuedHttp).toMatchObject({ code: "SYNTHETIC_QUEUED_HTTP_STOP" })
      f.child.pid = undefined
      f.child.emit("exit", 0)
      await stopping
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      f.respond(request, { code: "SYNTHETIC_STOP", message: "fixture", retryable: false }, "core.error")
      f.respond(queuedRequest, { code: "SYNTHETIC_STOP", message: "fixture", retryable: false }, "core.error")
      f.child.pid = undefined
      f.child.emit("exit", 0)
      await pending
      await queuedHttp
      await stopping
    }
  })
  it.each(["add", "refresh", "add.v2", "refresh.v2"])("keeps a follower %s pending across multiple 90-second windows", async action => {
    const f = await setup()
    let settled = false
    const operation = action === "add" ? controller.addBilibiliFollowerMonitor({ mid: "2" })
      : action === "refresh" ? controller.refreshBilibiliFollowerMonitor({ userId: id })
      : action === "add.v2" ? controller.addBilibiliFollowerMonitorV2({ mid: "9223372036854775807" })
      : controller.refreshBilibiliFollowerMonitorV2({ userId: id })
    const pending = operation.then(value => { settled = true; return value },
      (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    try {
      expect(request.keepAlive).toBe(true)
      for (let n = 0; n < 4; n++) {
        await vi.advanceTimersByTimeAsync(60_000)
        f.respond(request, { requestType: request.type })
        expect(settled).toBe(false)
      }
      f.respond(request, { code: "SYNTHETIC_FOLLOWER_RESULT", message: "fixture", retryable: false }, "core.error")
      expect(await pending).toMatchObject({ code: "SYNTHETIC_FOLLOWER_RESULT" })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      f.respond(request, { code: "SYNTHETIC_STOP", message: "fixture", retryable: false }, "core.error")
      await pending
    }
  })
  it("keeps a danmaku start alive instead of cancelling a configured long HTTP request", async () => {
    const f = await setup()
    let settled = false
    const pending = controller.startBilibiliLiveDanmaku({ roomMonitorId: id })
      .then(value => { settled = true; return value }, (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    try {
      expect(request.keepAlive).toBe(true)
      for (let n = 0; n < 4; n++) {
        await vi.advanceTimersByTimeAsync(60_000)
        f.respond(request, { requestType: request.type })
        expect(settled).toBe(false)
      }
      f.respond(request, { liveRoomMonitorId: id, running: true, status: "CONNECTED",
        ratePerMinute: 0, last5MinutesCount: 0, likeIncrement: 0 }, request.type + ".result")
      expect(await pending).toMatchObject({ running: true, status: "CONNECTED" })
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { f.respond(request, { code: "SYNTHETIC_STOP", message: "fixture", retryable: false }, "core.error"); await pending }
  })
  it("keeps a rank refresh alive across multiple 90-second windows", async () => {
    const f = await setup()
    let settled = false
    const pending = controller.refreshBilibiliLiveRanks({ roomMonitorId: id })
      .then(value => { settled = true; return value }, (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    expect(request.keepAlive).toBe(true)
    for (let count = 0; count < 4; count++) {
      await vi.advanceTimersByTimeAsync(60_000)
      f.respond(request, { requestType: request.type })
      await Promise.resolve()
      expect(settled).toBe(false)
    }
    f.respond(request, { roomMonitorId: id, successCount: 1, errors: [],
      summary: { roomMonitorId: id, roomId: "102", ruid: "2", snapshots: [] } }, request.type + ".result")
    expect(await pending).toMatchObject({ successCount: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })
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
