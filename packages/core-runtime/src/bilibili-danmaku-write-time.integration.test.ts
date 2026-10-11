import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import type { BilibiliLiveDanmakuSourceEvent } from "./bilibili-live-danmaku-service"
import { LocalCoreRuntime } from "./local-core-runtime"

function rows(directory: string) {
  const database = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    return {
      metrics: database.prepare("SELECT bucket_start, danmu_count, heartbeat_popularity, created_at, updated_at FROM bilibili_live_danmaku_metric_bucket ORDER BY bucket_start").all(),
      recent: database.prepare("SELECT message_text, sent_at, created_at FROM bilibili_live_danmaku_recent ORDER BY rowid").all(),
      facts: database.prepare("SELECT message_text, occurred_at, received_at, created_at FROM bilibili_live_session_event WHERE event_kind='DANMAKU' ORDER BY rowid").all()
    }
  } finally { database.close() }
}

function command(occurredAt: string, receivedAt: string, text: string, masked = false): BilibiliLiveDanmakuSourceEvent {
  return { type: "command", receivedAt, event: { command: "DANMU_MSG", kind: "DANMAKU",
    occurredAt, receivedAt, messageText: text, actor: { uid: "123", displayName: masked ? "合成***" : "合成昵称" },
    giftDelta: 0, superChatDelta: 0, rawJson: "{}" } }
}

describe("original ingestion write time through Core and SQLite", () => {
  let fixture: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  let runtime: LocalCoreRuntime | undefined
  let releasePending = () => {}
  let clock = "2026-10-06T12:02:00.000Z", ticks = 0

  afterEach(async () => {
    releasePending()
    try { await runtime?.stop() }
    finally {
      try { await fixture?.close() }
      finally { runtime = undefined; fixture = undefined; releasePending = () => {}; vi.unstubAllEnvs() }
    }
  })

  async function connect(fetchProfile?: () => Promise<{ mid: string; nickname: string }>) {
    fixture = await danmakuConfigurationFixture({ bucketSeconds: 60 })
    const room = await fixture.seedRoom({ liveStatus: 0 })
    runtime = await LocalCoreRuntime.start({ ...fixture.options, schedulerEnabled: false,
      now: () => new Date(Date.parse(clock) + ticks++),
      followerSource: { ...fixture.options.followerSource, ...(fetchProfile ? { fetchProfile } : {}) } })
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const emit = fixture.realtime.listeners.get(connected.sessionId!)!
    emit({ type: "command", receivedAt: "2026-10-06T11:00:00.000Z", event: {
      command: "LIVE", kind: "LIVE", occurredAt: "2026-10-06T11:00:00.000Z", receivedAt: "2026-10-06T11:00:00.000Z",
      liveStartedAt: "2026-10-06T11:00:00.000Z", liveKey: "synthetic-write-time", giftDelta: 0, superChatDelta: 0, rawJson: "{}"
    } })
    return emit
  }

  it("keeps event clocks separate while late updates retain the first bucket creation time", async () => {
    const emit = await connect()
    clock = "2026-10-06T12:03:00.000Z"; ticks = 0
    emit(command("2026-10-06T12:00:40.000Z", "2026-10-06T12:01:00.000Z", "first"))
    expect(rows(fixture!.directory).metrics.at(-1)).toMatchObject({
      bucket_start: "2026-10-06T12:00:00.000Z", created_at: clock, updated_at: clock, danmu_count: 1
    })
    clock = "2026-10-06T12:05:00.000Z"; ticks = 0
    emit(command("2026-10-06T12:00:10.000Z", "2026-10-06T12:04:00.000Z", "late"))
    const stored = rows(fixture!.directory)
    expect(stored.metrics.at(-1)).toMatchObject({ created_at: "2026-10-06T12:03:00.000Z", updated_at: clock, danmu_count: 2 })
    expect(stored.recent).toEqual([
      { message_text: "first", sent_at: "2026-10-06T12:00:40.000Z", created_at: "2026-10-06T12:03:00.000Z" },
      { message_text: "late", sent_at: "2026-10-06T12:00:10.000Z", created_at: clock }
    ])
    expect(stored.facts).toEqual([
      { message_text: "first", occurred_at: "2026-10-06T12:00:40.000Z", received_at: "2026-10-06T12:01:00.000Z", created_at: "2026-10-06T12:03:00.000Z" },
      { message_text: "late", occurred_at: "2026-10-06T12:00:10.000Z", received_at: "2026-10-06T12:04:00.000Z", created_at: clock }
    ])
  })

  it("records the post-resolution write time and keeps heartbeat bucket time independent", async () => {
    let started = () => {}
    const profileStarted = new Promise<void>(resolve => { started = resolve })
    const pending = new Promise<void>(resolve => { releasePending = resolve })
    const emit = await connect(async () => { started(); await pending; return { mid: "123", nickname: "合成完整昵称" } })
    emit(command("2026-10-06T12:00:10.000Z", "2026-10-06T12:01:00.000Z", "resolved", true))
    await profileStarted
    expect(rows(fixture!.directory).recent).toHaveLength(0)
    clock = "2026-10-06T12:06:00.000Z"; ticks = 0; releasePending()
    await vi.waitFor(() => expect(rows(fixture!.directory).facts).toEqual([
      { message_text: "resolved", occurred_at: "2026-10-06T12:00:10.000Z", received_at: "2026-10-06T12:01:00.000Z", created_at: clock }
    ]))
    clock = "2026-10-06T12:07:00.000Z"; ticks = 0
    emit({ type: "heartbeat", receivedAt: "2026-10-06T12:00:50.000Z", popularity: 42 })
    expect(rows(fixture!.directory).metrics.at(-1)).toMatchObject({
      bucket_start: "2026-10-06T12:00:00.000Z", created_at: "2026-10-06T12:06:00.000Z", updated_at: clock,
      danmu_count: 1, heartbeat_popularity: 42
    })
  })
})
