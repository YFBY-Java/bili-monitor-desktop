import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import { LocalCoreRuntime } from "./local-core-runtime"

const now = "2026-10-06T12:00:00.500Z"

describe("original danmaku metrics range through Core and SQLite", () => {
  let fixture: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  let runtime: LocalCoreRuntime | undefined

  afterEach(async () => {
    try { await runtime?.stop() }
    finally {
      try { await fixture?.close() }
      finally { runtime = undefined; fixture = undefined; vi.unstubAllEnvs() }
    }
  })

  async function seed() {
    fixture = await danmakuConfigurationFixture({ bucketSeconds: 60 })
    const room = await fixture.seedRoom({ liveStatus: 0 })
    runtime = await LocalCoreRuntime.start({ ...fixture.options, schedulerEnabled: false, now: () => new Date(now) })
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const emit = fixture.realtime.listeners.get(connected.sessionId!)!
    for (const time of ["09:00", "10:00", "11:00", "11:59", "12:00", "12:01"]) {
      emit({ type: "command", receivedAt: now, event: {
        command: "DANMU_MSG", kind: "DANMAKU", occurredAt: `2026-10-06T${time}:00.000Z`,
        receivedAt: now, messageText: "合成时间范围弹幕", giftDelta: 0, superChatDelta: 0, rawJson: "{}"
      } })
    }
    return room.id
  }

  it("preserves Java input forms and fallback with exact closed bucket boundaries", async () => {
    const roomMonitorId = await seed()
    const buckets = runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "\u001f+０２H\u0000" })
    expect(buckets.map(bucket => bucket.bucketStart)).toEqual([
      "2026-10-06T11:00:00.000Z", "2026-10-06T11:59:00.000Z", "2026-10-06T12:00:00.000Z"
    ])
    const fallback = buckets.slice(1)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId })).toEqual(fallback)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: null })).toEqual(fallback)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "\u00a02h\u00a0" })).toEqual(fallback)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "invalid" })).toEqual(fallback)
  })

  it("distinguishes Long and Duration fallback from valid wide windows and date overflow", async () => {
    const roomMonitorId = await seed()
    const fallback = runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "1h" })
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "9223372036854775808m" })).toEqual(fallback)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "153722867280912931m" })).toEqual(fallback)
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "-9223372036854775808m" })).toEqual(fallback.slice(-1))
    expect(runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "1000000000000m" })
      .map(bucket => bucket.bucketStart)).toEqual([
      "2026-10-06T09:00:00.000Z", "2026-10-06T10:00:00.000Z", "2026-10-06T11:00:00.000Z",
      "2026-10-06T11:59:00.000Z", "2026-10-06T12:00:00.000Z"
    ])
    expect(() => runtime!.getBilibiliLiveDanmakuMetrics({ roomMonitorId, range: "153722867280912930m" }))
      .toThrow("Danmaku metrics window exceeds the original date range")
  })
})
