import { describe, expect, it, vi } from "vitest"
import { RealtimeSessionManager } from "./realtime-session-manager"
import type { BilibiliDanmakuConnectionInput, RunningBilibiliDanmakuConnection } from "./bilibili-danmaku-connection"

function gate() {
  let release!: (value: RunningBilibiliDanmakuConnection) => void
  const pending = new Promise<RunningBilibiliDanmakuConnection>(resolve => { release = resolve })
  return { pending, release }
}
function connection() {
  return { connectHost: "wss://example.test/sub", protocolVersion: 3, authMode: "ANONYMOUS" as const, stop: vi.fn(async () => {}) }
}
describe("realtime in-flight connection ownership", () => {
  it("aborts pending HTTP when stopped and closes a late connection without registering it", async () => {
    const g = gate(), socket = connection()
    let signal: AbortSignal | undefined
    const manager = new RealtimeSessionManager(async input => { signal = input.signal; return g.pending })
    const pending = manager.start({ connectionId: "one", roomId: "33" }, () => {}).catch(error => error)
    await Promise.resolve()
    await manager.stop("one")
    expect(signal?.aborted).toBe(true)
    g.release(socket)
    expect(await pending).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(socket.stop).toHaveBeenCalledOnce()
    await manager.shutdown()
  })
  it("does not let a replaced start remove or emit events for its newer connection", async () => {
    const first = gate(), second = gate(), a = connection(), b = connection(), events = vi.fn()
    const inputs: BilibiliDanmakuConnectionInput[] = []
    const callbacks: Array<Parameters<typeof import("./bilibili-danmaku-connection").startBilibiliDanmakuConnection>[1]> = []
    const manager = new RealtimeSessionManager(async (input, callback) => {
      inputs.push(input); callbacks.push(callback)
      return inputs.length === 1 ? first.pending : second.pending
    })
    const older = manager.start({ connectionId: "one", roomId: "33" }, events).catch(error => error)
    await Promise.resolve()
    const newer = manager.start({ connectionId: "one", roomId: "33" }, events)
    await Promise.resolve()
    expect(inputs[0]?.signal?.aborted).toBe(true)
    first.release(a); second.release(b)
    expect(await older).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(await newer).toBe(b)
    callbacks[0]!({ type: "heartbeat", popularity: 42, receivedAt: new Date().toISOString() })
    expect(events).not.toHaveBeenCalled()
    await manager.stop("one")
    expect(b.stop).toHaveBeenCalledOnce()
  })
  it("makes shutdown terminal and aborts all starts before waiting on established connections", async () => {
    const inputSignals: Array<AbortSignal | undefined> = []
    const manager = new RealtimeSessionManager(async input => {
      inputSignals.push(input.signal)
      return new Promise((_resolve, reject) => input.signal?.addEventListener("abort", () => reject(new Error("fixture cancelled"))))
    })
    const pending = ["a", "b"].map(connectionId => manager.start({ connectionId, roomId: "33" }, () => {}).catch(error => error))
    await Promise.resolve()
    await manager.shutdown()
    expect(inputSignals.map(signal => signal?.aborted)).toEqual([true, true])
    await Promise.all(pending)
    await expect(manager.start({ connectionId: "c", roomId: "33" }, () => {})).rejects.toMatchObject({ code: "REALTIME_WORKER_STOPPED" })
  })
})
