import { access, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import { loadLiveDanmakuConfiguration } from "./bilibili-live-danmaku-config"
import type { BilibiliLiveDanmakuSourceEvent } from "./bilibili-live-danmaku-service"

type Fixture = Awaited<ReturnType<typeof danmakuConfigurationFixture>>

type RetentionFixtureOwner = { current: { close: () => Promise<void> } | undefined; disposed: boolean; cleanupErrors: unknown[]; cleanupPromise: Promise<void> | undefined }
const fixtureOwner = (): RetentionFixtureOwner => ({ current: undefined, disposed: false, cleanupErrors: [], cleanupPromise: undefined })
function cleanOwnedRetentionFixture(owner: RetentionFixtureOwner,
  restoreEnvironment: () => void = () => { vi.unstubAllEnvs() }, restoreMocks: () => void = () => { vi.restoreAllMocks() }): Promise<void> {
  if (owner.cleanupPromise) return owner.cleanupPromise
  owner.disposed = true
  const fixture = takeOwnedFixture(owner)
  owner.cleanupPromise = (async () => {
    for (const cleanup of [() => fixture?.close(), restoreEnvironment, restoreMocks]) {
      try { await cleanup() } catch (error) { owner.cleanupErrors.push(error) }
    }
  })()
  return owner.cleanupPromise
}
async function withOwnedRetentionFixture(owner: RetentionFixtureOwner, operation: () => Promise<void>,
  restoreEnvironment: () => void = () => { vi.unstubAllEnvs() }, restoreMocks: () => void = () => { vi.restoreAllMocks() }): Promise<void> {
  const errors: unknown[] = []
  try { await operation() } catch (error) { errors.push(error) }
  await cleanOwnedRetentionFixture(owner, restoreEnvironment, restoreMocks)
  errors.push(...owner.cleanupErrors)
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, "Retention test and fixture cleanup failed")
}

function takeOwnedFixture(owner: RetentionFixtureOwner): RetentionFixtureOwner["current"] {
  const fixture = owner.current
  owner.current = undefined
  return fixture
}

describe("retention fixture cleanup fault injection", () => {
  it("clears fixture ownership before close awaits, restores globals after close rejection and preserves the sole error", async () => {
    const close = new Error("close"), calls: string[] = [], owner = fixtureOwner()
    owner.current = { close: async () => { calls.push("close"); expect(owner.current).toBeUndefined(); await Promise.resolve(); throw close } }
    const original = process.env.BMD_RETENTION_CLEANUP_SYNTHETIC
    const target = { method: () => "original" }
    try {
      vi.stubEnv("BMD_RETENTION_CLEANUP_SYNTHETIC", "synthetic")
      vi.spyOn(target, "method").mockReturnValue("stubbed")
      const error = await withOwnedRetentionFixture(owner, async () => {},
        () => { calls.push("env"); vi.unstubAllEnvs() }, () => { calls.push("mocks"); vi.restoreAllMocks() }).catch((caught: unknown) => caught)
      expect(error).toBe(close)
      expect(owner.current).toBeUndefined()
      expect(calls).toEqual(["close", "env", "mocks"])
      expect(process.env.BMD_RETENTION_CLEANUP_SYNTHETIC).toBe(original)
      expect(target.method()).toBe("original")
    } finally { vi.unstubAllEnvs(); vi.restoreAllMocks() }
  })
  it("exposes simultaneous setup, close and restoration errors while attempting all cleanup", async () => {
    const primary = new Error("setup"), close = new Error("close"), environment = new Error("env"), calls: string[] = []
    const owner = fixtureOwner()
    owner.current = { close: async () => { calls.push("close"); throw close } }
    const error = await withOwnedRetentionFixture(owner, async () => { throw primary },
      () => { calls.push("env"); throw environment }, () => { calls.push("mocks") }).catch((caught: unknown) => caught)
    expect(owner.current).toBeUndefined()
    expect(calls).toEqual(["close", "env", "mocks"])
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected aggregate cleanup evidence")
    expect(error.errors).toHaveLength(3)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toBe(close)
    expect(error.errors[2]).toBe(environment)
  })
  it("cleans a deferred operation through teardown first, then settles without touching the next owner or globals", async () => {
    const owner = fixtureOwner(), laterOwner = fixtureOwner(), calls: string[] = []
    let release = () => {}
    const pending = new Promise<void>(resolve => { release = resolve })
    owner.current = { close: async () => { expect(owner.current).toBeUndefined(); calls.push("close") } }
    const running = withOwnedRetentionFixture(owner, () => pending,
      () => { calls.push("env") }, () => { calls.push("mocks") })
    await withOwnedRetentionFixture(owner, async () => {},
      () => { calls.push("env") }, () => { calls.push("mocks") })
    const laterFixture = { close: async () => { calls.push("later") } }
    laterOwner.current = laterFixture
    release()
    await running
    expect(calls).toEqual(["close", "env", "mocks"])
    expect(laterOwner.current).toBe(laterFixture)
    await withOwnedRetentionFixture(laterOwner, async () => {}, () => {}, () => {})
    expect(calls).toEqual(["close", "env", "mocks", "later"])
  })
})

// Inspect real committed rows rather than inferring retention from the capped query API.
function stored(directory: string, monitorId: string) {
  const database = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    return {
      recent: database.prepare("SELECT recent_id, message_text, sent_at FROM bilibili_live_danmaku_recent WHERE monitor_id = ? ORDER BY sent_at, rowid").all(monitorId),
      facts: database.prepare("SELECT event_id, message_text, live_session_id, transport_session_id, receipt_ordinal FROM bilibili_live_session_event WHERE monitor_id = ? AND event_kind = 'DANMAKU' ORDER BY rowid").all(monitorId),
      sessions: database.prepare("SELECT session_id, state FROM bilibili_live_session WHERE monitor_id = ?").all(monitorId),
      metrics: database.prepare("SELECT SUM(danmu_count) AS danmu, SUM(raw_event_count) AS raw FROM bilibili_live_danmaku_metric_bucket WHERE monitor_id = ?").get(monitorId)
    }
  } finally { database.close() }
}

function command(kind: "LIVE" | "DANMAKU" | "UNKNOWN", timestamp: string, text = "synthetic", sourceEventId = text): BilibiliLiveDanmakuSourceEvent {
  return { type: "command", receivedAt: timestamp, event: {
    command: kind === "DANMAKU" ? "DANMU_MSG" : kind === "LIVE" ? "LIVE" : "NOTICE_MSG",
    kind, occurredAt: timestamp, receivedAt: timestamp, sourceEventId,
    actor: { uid: "123", displayName: "合成保留昵称" }, messageText: text,
    ...(kind === "LIVE" ? { liveStartedAt: timestamp, liveKey: "synthetic-retention-live" } : {}),
    giftDelta: 0, superChatDelta: 0, rawJson: "{}"
  } }
}

async function connect(fixture: Fixture, runtime: Awaited<ReturnType<Fixture["start"]>>, monitorId: string, timestamp: string) {
  const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: monitorId })
  const emit = fixture.realtime.listeners.get(connected.sessionId!)!
  emit(command("LIVE", new Date(Date.parse(timestamp) - 1000).toISOString(), "live", `live:${monitorId}`))
  expect(stored(fixture.directory, monitorId).sessions).toMatchObject([{ state: "OPEN" }])
  return { emit, sessionId: connected.sessionId! }
}

describe("original recent retention through actual Core configuration and SQLite", () => {
  let activeOwner: RetentionFixtureOwner | undefined
  afterEach(async () => {
    const owner = activeOwner
    activeOwner = undefined
    if (owner) await withOwnedRetentionFixture(owner, async () => {})
  })
  const retentionCase = (operation: (acquire: (fixture: Fixture) => Promise<void>) => Promise<void>) => async () => {
    const owner = fixtureOwner()
    activeOwner = owner
    await withOwnedRetentionFixture(owner, () => operation(async fixture => {
      if (owner.disposed) {
        await fixture.close()
        throw new Error("Retention fixture acquired after teardown")
      }
      owner.current = fixture
    }))
  }

  it("consumes the original environment alias as 25 through real ingestion with permanent history", retentionCase(async acquire => {
    const f = await danmakuConfigurationFixture({ recentMessageLimitPerRoom: 75 })
    await acquire(f)
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT", "25")
    const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
    const { emit, sessionId } = await connect(f, runtime, room.id, timestamp)
    for (let i = 1; i <= 26; i++) emit(command("DANMAKU", timestamp, `message:${i}`))
    const rows = stored(f.directory, room.id)
    expect(rows.recent).toHaveLength(25)
    expect(rows.facts).toHaveLength(26)
    expect(rows.facts.every(row => row.transport_session_id === sessionId && row.live_session_id === rows.sessions[0]?.session_id)).toBe(true)
    expect(rows.metrics?.danmu).toBe(26)
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id, limit: 200 }).map(row => row.messageText))
      .toEqual(Array.from({ length: 25 }, (_, i) => `message:${i + 2}`))
  }))

  it.each([-2147483648, 0, 1, 19, 20])("keeps raw recent %i while consuming a floor of 20", async raw => retentionCase(async acquire => {
    const f = await danmakuConfigurationFixture({ recentMessageLimitPerRoom: raw })
    await acquire(f)
    expect(await loadLiveDanmakuConfiguration(f.directory, {}, true)).toMatchObject({ recentMessageLimitPerRoom: raw })
    const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
    const { emit } = await connect(f, runtime, room.id, timestamp)
    for (let i = 1; i <= 21; i++) emit(command("DANMAKU", timestamp, `floor:${i}`))
    expect(stored(f.directory, room.id).recent).toHaveLength(20)
    expect(stored(f.directory, room.id).facts).toHaveLength(21)
  })())

  it("retains 501 actual recent rows, all 502 eligible permanent facts and metrics, but reads at most 200", retentionCase(async acquire => {
    const f = await danmakuConfigurationFixture({ recentMessageLimitPerRoom: 501 })
    await acquire(f)
    const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
    const { emit, sessionId } = await connect(f, runtime, room.id, timestamp)
    for (let i = 1; i <= 502; i++) emit(command("DANMAKU", timestamp, `large:${i}`))
    const rows = stored(f.directory, room.id)
    expect(rows.recent).toHaveLength(501)
    expect(rows.recent[0]?.message_text).toBe("large:2")
    expect(rows.recent[500]?.message_text).toBe("large:502")
    expect(rows.facts).toHaveLength(502)
    expect(new Set(rows.facts.map(row => row.event_id)).size).toBe(502)
    expect(rows.facts.every(row => row.transport_session_id === sessionId && row.live_session_id === rows.sessions[0]?.session_id)).toBe(true)
    expect(rows.facts[0]?.receipt_ordinal).toBe(2) // LIVE establishes the routed broadcast before DANMAKU.
    expect(rows.facts[501]?.receipt_ordinal).toBe(503)
    expect(rows.metrics).toMatchObject({ danmu: 502, raw: 503 })
    const recent = runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id, limit: 200 })
    expect(recent).toHaveLength(200)
    expect(recent[0]?.messageText).toBe("large:303")
    expect(recent[199]?.messageText).toBe("large:502")
    // Original service clamps requests above 200 rather than rejecting them.
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id, limit: 201 })).toEqual(recent)
    expect(runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" }).reduce((sum, bucket) => sum + bucket.danmuCount, 0)).toBe(502)
  }))

  it("uses event time then insertion ties independently per monitor, dropping an older out-of-order message", retentionCase(async acquire => {
    const f = await danmakuConfigurationFixture({ recentMessageLimitPerRoom: 25 })
    await acquire(f)
    const a = await f.seedRoom({ liveStatus: 1 }), b = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
    const first = await connect(f, runtime, a.id, timestamp), second = await connect(f, runtime, b.id, timestamp)
    for (let i = 1; i <= 27; i++) {
      first.emit(command("DANMAKU", timestamp, `a:${i}`))
      second.emit(command("DANMAKU", timestamp, `b:${i}`))
    }
    first.emit(command("DANMAKU", new Date(Date.parse(timestamp) - 500).toISOString(), "a:old-late"))
    for (const [room, prefix, facts] of [[a, "a", 28], [b, "b", 27]] as const) {
      const rows = stored(f.directory, room.id)
      expect(rows.recent.map(row => row.message_text)).toEqual(Array.from({ length: 25 }, (_, i) => `${prefix}:${i + 3}`))
      expect(rows.facts).toHaveLength(facts)
      expect(rows.metrics?.danmu).toBe(facts)
      expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id, limit: 200 }).map(row => row.messageText))
        .toEqual(rows.recent.map(row => row.message_text))
    }
  }))

  it("applies a lower restart limit only after a new DANMAKU, preserving facts, metrics and higher-restart survivors", retentionCase(async acquire => {
    const f = await danmakuConfigurationFixture({ recentMessageLimitPerRoom: 30 })
    await acquire(f)
    const room = await f.seedRoom({ liveStatus: 1 }), timestamp = new Date().toISOString()
    let runtime = await f.start()
    const first = await connect(f, runtime, room.id, timestamp)
    for (let i = 1; i <= 30; i++) first.emit(command("DANMAKU", timestamp, `restart:${i}`))
    const before = stored(f.directory, room.id)
    await f.stop()
    await writeFile(f.path, '{"recentMessageLimitPerRoom":1}', "utf8")
    runtime = await f.start()
    expect(stored(f.directory, room.id).recent).toEqual(before.recent)
    const lower = await connect(f, runtime, room.id, timestamp)
    lower.emit({ type: "heartbeat", popularity: 42, receivedAt: timestamp })
    lower.emit(command("UNKNOWN", timestamp, "non-danmaku"))
    expect(stored(f.directory, room.id).recent).toEqual(before.recent)
    lower.emit(command("DANMAKU", timestamp, "restart:31"))
    const afterLower = stored(f.directory, room.id)
    expect(afterLower.recent.map(row => row.message_text)).toEqual(Array.from({ length: 20 }, (_, i) => `restart:${i + 12}`))
    expect(afterLower.facts.slice(0, 30)).toEqual(before.facts)
    expect(afterLower.facts).toHaveLength(31)
    expect(afterLower.metrics?.danmu).toBe(31)
    await f.stop()
    await writeFile(f.path, '{"recentMessageLimitPerRoom":40}', "utf8")
    runtime = await f.start()
    expect(stored(f.directory, room.id).recent).toEqual(afterLower.recent)
    expect(stored(f.directory, room.id).facts).toEqual(afterLower.facts)
    const higher = await connect(f, runtime, room.id, timestamp)
    higher.emit(command("DANMAKU", timestamp, "restart:32"))
    expect(stored(f.directory, room.id).recent).toHaveLength(21)
    expect(stored(f.directory, room.id).facts).toHaveLength(32)
    expect(stored(f.directory, room.id).metrics?.danmu).toBe(32)
  }))

  it.each([{ configuration: { recentMessageLimitPerRoom: "synthetic-private" }, environment: undefined },
    { configuration: {}, environment: "synthetic-private" }, { configuration: { recentMessageLimitPerRoom: 2147483648 }, environment: "25" }])
    ("rejects invalid retention before SQLite even with storage and scheduler disabled: %j", async ({ configuration, environment }) => retentionCase(async acquire => {
      const f = await danmakuConfigurationFixture(configuration)
      await acquire(f)
      await writeFile(resolve(f.directory, "config/bilibili-live-collection.json"), '{"storageEnabled":false}', "utf8")
      if (environment !== undefined) vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_RECENTMESSAGELIMITPERROOM", environment)
      const opened = vi.spyOn(ControlDatabase, "open")
      const error = await f.start().catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
      expect(String(error)).not.toContain("synthetic-private")
      expect(String(error)).not.toContain("at ")
      expect(opened).not.toHaveBeenCalled()
      expect(f.realtime.starts).toEqual([])
      await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    })())
})
