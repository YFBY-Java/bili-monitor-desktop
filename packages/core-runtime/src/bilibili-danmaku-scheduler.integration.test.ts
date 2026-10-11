import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"

describe("completion-relative automatic danmaku scheduler", () => {
  let f: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  let release = () => {}
  afterEach(async () => { release(); await f?.close(); f = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })
  it("runs at registration zero and waits sub-second delay after a held source completes", async () => {
    f = await danmakuConfigurationFixture({ schedulerDelayMs: 250 })
    const a = await f.seedRoom({ liveStatus: 1 })
    let entered = false
    const gate = new Promise<void>(resolveGate => { release = resolveGate })
    f.realtime.startWait = async () => { entered = true; await gate }
    vi.useFakeTimers()
    const scan = vi.spyOn(ControlDatabase.prototype, "listBilibiliLiveDanmakuAutoStartRoomIds")
    const runtime = await f.start({ schedulerEnabled: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(entered).toBe(true)
    expect(runtime.getBilibiliLiveDanmakuStatus(a.id).status).toBe("CONNECTING")
    await vi.advanceTimersByTimeAsync(1000)
    expect(scan).toHaveBeenCalledTimes(1)
    release(); await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getBilibiliLiveDanmakuStatus(a.id)).toMatchObject({ running: true, status: "CONNECTED" })
    const b = await f.seedRoom({ liveStatus: 1 })
    await vi.advanceTimersByTimeAsync(249)
    expect(runtime.getBilibiliLiveDanmakuStatus(b.id).status).toBe("NOT_STARTED")
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.getBilibiliLiveDanmakuStatus(b.id).status).toBe("CONNECTED")
    expect(scan).toHaveBeenCalledTimes(2)
  })
  it("logs only a constant failure and retries with real SQLite next round", async () => {
    f = await danmakuConfigurationFixture({ schedulerDelayMs: 25 })
    const room = await f.seedRoom({ liveStatus: 1 })
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(ControlDatabase.prototype, "listBilibiliLiveDanmakuAutoStartRoomIds").mockImplementationOnce(() => { throw new Error("synthetic-private-failure") })
    const runtime = await f.start({ schedulerEnabled: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(warn.mock.calls).toEqual([[JSON.stringify({ event: "bilibili.danmaku.scheduler-failed", code: "BILIBILI_DANMAKU_SCHEDULER_FAILED" })]])
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id).status).toBe("NOT_STARTED")
    await vi.advanceTimersByTimeAsync(25)
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id).status).toBe("CONNECTED")
  })
  it("stop before first tick removes the timer without making a session", async () => {
    f = await danmakuConfigurationFixture()
    const room = await f.seedRoom({ liveStatus: 1 })
    vi.useFakeTimers()
    await f.start({ schedulerEnabled: true }); await f.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(vi.getTimerCount()).toBe(0)
    const db = await ControlDatabase.open(f.directory)
    try { expect(db.findLatestBilibiliLiveDanmakuSession(room.id)).toBeUndefined() } finally { db.close() }
  })
  it("stops a held first pass and ignores late source completion after SQLite closes", async () => {
    f = await danmakuConfigurationFixture({ schedulerDelayMs: 25 })
    const room = await f.seedRoom({ liveStatus: 1 })
    const gate = new Promise<void>(resolveGate => { release = resolveGate })
    f.realtime.startWait = () => gate
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const runtime = await f.start({ schedulerEnabled: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id).status).toBe("CONNECTING")
    expect(f.realtime.listeners.size).toBe(1)
    await f.stop()
    expect(f.realtime.stopAllCalls).toBe(1)
    release(); await vi.advanceTimersByTimeAsync(1000)
    expect(vi.getTimerCount()).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    expect(f.realtime.starts).toHaveLength(1)
    const db = await ControlDatabase.open(f.directory)
    // A held pre-info start has no original transport session to persist.
    try { expect(db.findLatestBilibiliLiveDanmakuSession(room.id)).toBeUndefined() } finally { db.close() }
  })
})
