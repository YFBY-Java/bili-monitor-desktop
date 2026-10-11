import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { createLiveSessionFixture } from "./__fixtures__/live-session"
import { BilibiliLiveDanmakuService, type BilibiliLiveDanmakuSourceEvent,
  type NormalizedBilibiliDanmakuEvent } from "./bilibili-live-danmaku-service"

function event(kind: NormalizedBilibiliDanmakuEvent["kind"], occurredAt = "2026-09-13T04:15:00.000Z"): NormalizedBilibiliDanmakuEvent {
  return { command: kind === "DANMAKU" ? "DANMU_MSG" : kind === "GIFT" ? "SEND_GIFT" : kind,
    kind, occurredAt, receivedAt: "2026-09-13T04:20:00.000Z", giftDelta: kind === "GIFT" ? 1 : 0,
    superChatDelta: kind === "SUPER_CHAT" ? 1 : 0, rawJson: "{}",
    actor: { uid: "99", displayName: "测试用户" }, messageText: "离线也可以聊天", quantity: 1,
    ...(kind === "GIFT" ? { gift: { giftId: "31036", quantity: 1, paid: true, amountMilliYuan: 100 } } : {}) }
}

describe("original 441d423 session boundary parity", () => {
  it.each([0, 2, 1])("never infers a session from activity with cached room liveStatus=%i", async liveStatus => {
    const fixture = await createLiveSessionFixture()
    try {
      const { service, room, transportId } = fixture
      let ordinal = 0
      for (const kind of ["DANMAKU", "GIFT", "SUPER_CHAT", "GUARD_BUY"] as const) {
        expect(service.ingest({ ...room, liveStatus }, transportId, ++ordinal, 3, event(kind))).toBe(false)
        expect(service.list({ roomMonitorId: room.monitorId })).toEqual([])
      }
    } finally { await fixture.close() }
  })

  it("keeps END_PENDING after later activity until authoritative REST confirms", async () => {
    const fixture = await createLiveSessionFixture()
    const { service, room, transportId, database, start } = fixture
    try {
      const session = service.reconcileRest(room, { liveStatus: 1, liveTime: start, title: room.title, fetchedAt: start })!
      service.ingest(room, transportId, 1, 3, event("PREPARING", "2026-09-13T04:10:00.000Z"))
      const pending = database.findActiveBilibiliLiveSession(room.monitorId)
      for (const [index, kind] of (["DANMAKU", "GIFT", "SUPER_CHAT", "GUARD_BUY"] as const).entries()) {
        expect(service.ingest(room, transportId, index + 2, 3, event(kind))).toBe(true)
        expect(database.findActiveBilibiliLiveSession(room.monitorId)).toEqual(pending)
      }
      service.reconcileRest(room, { liveStatus: 0, liveTime: null, title: room.title, fetchedAt: "2026-09-13T04:21:00.000Z" })
      expect(database.findActiveBilibiliLiveSession(room.monitorId)).toBeUndefined()
      expect(service.get(session.sessionId)).toMatchObject({ state: "CLOSED", endedAt: "2026-09-13T04:10:00.000000000Z" })
    } finally { await fixture.close() }
  })

  it.each(["OPEN", "END_PENDING"])("does not close %s on an unknown REST status", async state => {
    const fixture = await createLiveSessionFixture()
    const { service, room, transportId, database, start } = fixture
    try {
      service.reconcileRest(room, { liveStatus: 1, liveTime: start, title: room.title, fetchedAt: start })
      if (state === "END_PENDING") service.ingest(room, transportId, 1, 3, event("PREPARING"))
      const previous = database.findActiveBilibiliLiveSession(room.monitorId)
      service.reconcileRest(room, { liveStatus: null, liveTime: null, title: null, fetchedAt: "2026-09-13T04:21:00.000Z" })
      expect(database.findActiveBilibiliLiveSession(room.monitorId)).toEqual(previous)
    } finally { await fixture.close() }
  })

  it("routes late history without reopening it and rejects activity in the gap before the new session", async () => {
    const fixture = await createLiveSessionFixture()
    const { service, room, transportId, database, start } = fixture
    try {
      const old = service.reconcileRest(room, { liveStatus: 1, liveTime: start, title: room.title, fetchedAt: start })!
      service.reconcileRest(room, { liveStatus: 0, liveTime: null, title: room.title, fetchedAt: "2026-09-13T04:10:00.000Z" })
      expect(service.ingest(room, transportId, 1, 3, event("GIFT", "2026-09-13T04:05:00.000Z"))).toBe(true)
      expect(database.findActiveBilibiliLiveSession(room.monitorId)).toBeUndefined()
      expect(service.ingest(room, transportId, 2, 3, event("GIFT"))).toBe(false)
      const current = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-09-13T04:18:00.000Z",
        title: room.title, fetchedAt: "2026-09-13T04:18:01.000Z" })!
      expect(service.ingest(room, transportId, 3, 3, event("GIFT"))).toBe(false)
      expect(service.ingest(room, transportId, 4, 3, event("GIFT", "2026-09-13T04:06:00.000Z"))).toBe(true)
      expect(service.events({ sessionId: old.sessionId }).total).toBe(2)
      expect(service.events({ sessionId: current.sessionId }).total).toBe(0)
      expect(service.list({ roomMonitorId: room.monitorId })).toHaveLength(2)
    } finally { await fixture.close() }
  })

  it("still opens from LIVE and accepts subsequent confirmed-session activity", async () => {
    const fixture = await createLiveSessionFixture()
    const { service, room, transportId, database } = fixture
    try {
      service.ingest({ ...room, liveStatus: 0 }, transportId, 1, 3,
        { ...event("LIVE", "2026-09-13T04:10:00.000Z"), liveKey: "new-live" })
      const current = database.findActiveBilibiliLiveSession(room.monitorId)!
      expect(current).toMatchObject({ state: "OPEN", startSource: "WS_LIVE" })
      expect(service.ingest(room, transportId, 2, 3, event("DANMAKU"))).toBe(true)
      expect(service.events({ sessionId: current.sessionId }).total).toBe(1)
    } finally { await fixture.close() }
  })

  it("keeps offline recent danmaku and minute metrics without inventing session facts", async () => {
    const fixture = await createLiveSessionFixture()
    const { service, room, database } = fixture
    let receive: ((event: BilibiliLiveDanmakuSourceEvent) => void) | undefined
    const danmaku = new BilibiliLiveDanmakuService({ database, sessionSink: service,
      idFactory: randomUUID, now: () => new Date("2026-09-13T04:20:00.000Z"),
      credentialProvider: async () => undefined,
      source: { start: async (_input, listener) => { receive = listener; return {
        connectHost: "wss://example.test", protocolVersion: 3, authMode: "ANONYMOUS" } },
      stop: async () => undefined, stopAll: async () => undefined }
    })
    try {
      await danmaku.start({ roomMonitorId: room.monitorId })
      receive?.({ type: "command", receivedAt: "2026-09-13T04:20:00.000Z", event: event("DANMAKU") })
      expect(danmaku.recent({ roomMonitorId: room.monitorId })).toMatchObject([{ messageText: "离线也可以聊天" }])
      expect(danmaku.metrics({ roomMonitorId: room.monitorId, range: "1h" })).toMatchObject([{ danmuCount: 1 }])
      expect(service.list({ roomMonitorId: room.monitorId })).toEqual([])
    } finally { await danmaku.stopAll(); await fixture.close() }
  })
})
