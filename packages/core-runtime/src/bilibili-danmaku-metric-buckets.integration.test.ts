import { writeFile } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import type { BilibiliLiveDanmakuSourceEvent } from "./bilibili-live-danmaku-service"

function command(occurredAt: string): BilibiliLiveDanmakuSourceEvent {
  const receivedAt = new Date().toISOString()
  return { type: "command", receivedAt, event: {
    command: "DANMU_MSG", kind: "DANMAKU", occurredAt, receivedAt,
    messageText: "合成分桶弹幕", giftDelta: 0, superChatDelta: 0, rawJson: "{}"
  } }
}

describe("original metric bucket configuration through Core and SQLite", () => {
  let fixture: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  afterEach(async () => {
    try { await fixture?.close() } finally { fixture = undefined; vi.unstubAllEnvs() }
  })

  it("uses the original alias above 3600 with epoch boundaries and heartbeat reception time", async () => {
    fixture = await danmakuConfigurationFixture()
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS", "7200")
    const room = await fixture.seedRoom({ liveStatus: 0 }), runtime = await fixture.start()
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const emit = fixture.realtime.listeners.get(connected.sessionId!)!
    const start = Math.floor(Date.now() / 7_200_000) * 7_200_000
    emit(command(new Date(start - 1).toISOString()))
    emit(command(new Date(start).toISOString()))
    emit(command(new Date(start + 1).toISOString()))
    emit({ type: "heartbeat", receivedAt: new Date().toISOString(), popularity: 42 })
    expect(runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "1d" }))
      .toMatchObject([
        { bucketStart: new Date(start - 7_200_000).toISOString(), bucketSeconds: 7200, danmuCount: 1, rawEventCount: 1 },
        { bucketStart: new Date(start).toISOString(), bucketSeconds: 7200, danmuCount: 2, rawEventCount: 2, heartbeatPopularity: 42 }
      ])
  })

  it("keeps low raw values distinct across restart instead of rewriting old buckets", async () => {
    fixture = await danmakuConfigurationFixture({ bucketSeconds: 60, listenProbeSeconds: 20 })
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS", "9")
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_BUCKETSECONDS", "-8")
    const room = await fixture.seedRoom({ liveStatus: 0 })
    let runtime = await fixture.start()
    let connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const timestamp = new Date(Math.floor(Date.now() / 10_000) * 10_000 + 1).toISOString()
    fixture.realtime.listeners.get(connected.sessionId!)!(command(timestamp))
    const original = runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" })
    expect(original).toMatchObject([{ bucketSeconds: -8, danmuCount: 1 }])
    await fixture.stop()
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS", undefined)
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_BUCKETSECONDS", undefined)
    await writeFile(fixture.path, '{"bucketSeconds":9,"listenProbeSeconds":-2147483648}', "utf8")
    runtime = await fixture.start()
    expect(runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" })).toEqual(original)
    connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    fixture.realtime.listeners.get(connected.sessionId!)!(command(timestamp))
    const buckets = runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" })
    expect(buckets).toHaveLength(2)
    expect(buckets[0]).toEqual(original[0])
    expect(buckets[1]).toMatchObject({ bucketStart: original[0]!.bucketStart, bucketSeconds: 9, danmuCount: 1 })
  })
})
