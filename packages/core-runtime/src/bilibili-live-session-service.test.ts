import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it } from "vitest"

import { BilibiliLiveSessionService } from "./bilibili-live-session-service"

describe("BilibiliLiveSessionService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("keeps PREPARING pending until REST confirmation and persists strong facts once", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-service-"))
    const database = await ControlDatabase.open(directory)
    let sequence = 0
    let currentTime = "2026-08-29T12:10:00.200Z"
    const idFactory = () => `018f0f39-7b5e-4cc1-862d-${String(++sequence).padStart(12, "0")}`
    const service = new BilibiliLiveSessionService({
      database,
      idFactory,
      now: () => new Date(currentTime)
    })
    try {
      const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)
      if (!room) throw new Error("room missing")
      const deferRest = () => database.markBilibiliLiveRoomFailure({ monitorId,
        nextCollectAt: "2026-08-29T13:00:00.000Z", errorAt: "2026-08-29T12:09:00.000Z",
        errorType: "NETWORK_ERROR", errorMessage: "合成退避", eventId: idFactory(),
        outbox: { messageId: idFactory(), topic: "seed.failure", envelopeJson: "{}", createdAt: currentTime } })
      const transportId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b01"
      database.createBilibiliLiveDanmakuSession({
        sessionId: transportId,
        monitorId,
        roomId: room.roomId,
        connectHost: "wss://example.test/sub",
        startedAt: "2026-08-29T12:00:01.000Z"
      })
      database.markBilibiliLiveDanmakuSessionConnected(
        transportId,
        "2026-08-29T12:00:02.000Z"
      )
      const opened = service.reconcileRest(room, {
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        title: "直播标题",
        fetchedAt: "2026-08-29T12:00:03.000Z"
      })
      if (!opened) throw new Error("session did not open")
      expect(opened).toMatchObject({ state: "OPEN", startSource: "REST_STATUS" })

      const danmaku = {
        command: "DANMU_MSG",
        kind: "DANMAKU" as const,
        eventKey: "DANMU_MSG:dm-1",
        sourceEventId: "dm-1",
        occurredAt: "2026-08-29T12:00:05.000Z",
        receivedAt: "2026-08-29T12:00:05.100Z",
        actor: { uid: "99", displayName: "Alice", medalName: "测试牌" },
        messageText: "hello",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
      expect(service.ingest(room, transportId, 1, 3, danmaku)).toBe(true)
      expect(service.ingest(room, transportId, 2, 3, danmaku)).toBe(false)

      const preparing = {
        command: "PREPARING",
        kind: "PREPARING" as const,
        occurredAt: "2026-08-29T12:10:00.000Z",
        receivedAt: "2026-08-29T12:10:00.100Z",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
      deferRest()
      expect(database.findDueBilibiliLiveRooms(currentTime, 1)).toEqual([])
      service.ingest(room, transportId, 3, 3, preparing)
      expect(database.findBilibiliLiveRoomById(monitorId)).toMatchObject({
        nextCollectAt: currentTime, backoffUntil: null, monitorStatus: "ACTIVE", intervalSeconds: 300
      })
      expect(database.findDueBilibiliLiveRooms(currentTime, 1).map(candidate => candidate.monitorId)).toEqual([monitorId])
      expect(database.findActiveBilibiliLiveSession(monitorId)).toMatchObject({
        state: "END_PENDING",
        endSignalAt: "2026-08-29T12:10:00.000Z"
      })
      currentTime = "2026-08-29T12:10:01.200Z"
      deferRest()
      service.ingest(room, transportId, 4, 3, preparing, currentTime)
      expect(database.findBilibiliLiveRoomById(monitorId)).toMatchObject({ nextCollectAt: currentTime, backoffUntil: null })
      service.reconcileRest(room, {
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        title: "直播标题",
        fetchedAt: "2026-08-29T12:09:59.000Z"
      })
      expect(database.findActiveBilibiliLiveSession(monitorId)?.state).toBe("END_PENDING")
      service.reconcileRest(room, {
        liveStatus: 0,
        liveTime: null,
        title: "直播结束",
        fetchedAt: "2026-08-29T12:10:02.000Z"
      })
      expect(database.findActiveBilibiliLiveSession(monitorId)).toBeUndefined()

      const summary = service.get(opened.sessionId)
      expect(summary).toMatchObject({
        state: "CLOSED",
        coverageStatus: "RECEIVED_WHILE_ONLINE",
        danmakuCount: 1,
        interactingUserCount: 1,
        paidAmountMilliYuan: 0
      })
      expect(service.users({ sessionId: opened.sessionId })).toMatchObject([{
        actorKey: "uid:99",
        identityQuality: "VERIFIED_UID",
        danmakuCount: 1
      }])
      expect(service.events({ sessionId: opened.sessionId, kind: "DANMAKU" })).toMatchObject({
        total: 1,
        page: 1,
        size: 50,
        items: [{ senderUid: "99", messageText: "hello" }]
      })
      expect(service.insight({ sessionId: opened.sessionId })).toMatchObject({
        bucketSeconds: 300,
        quality: { coverageStatus: "RECEIVED_WHILE_ONLINE", supportedEventCount: 1 }
      })
      currentTime = "2026-08-29T12:10:03.200Z"
      database.updateBilibiliLiveRoomStatus(monitorId, false, currentTime,
        { messageId: idFactory(), topic: "seed.pause", envelopeJson: "{}", createdAt: currentTime })
      deferRest()
      service.ingest(room, transportId, 5, 3, preparing)
      expect(database.findBilibiliLiveRoomById(monitorId)).toMatchObject({
        nextCollectAt: currentTime, backoffUntil: null, monitorStatus: "PAUSED"
      })
      expect(database.findDueBilibiliLiveRooms(currentTime, 1)).toEqual([])
      expect(database.findActiveBilibiliLiveSession(monitorId)).toBeUndefined()
      expect(service.get(opened.sessionId)).toMatchObject({ state: "CLOSED", danmakuCount: 1 })
    } finally {
      database.close()
    }
  })

  it("keeps equivalent REST and LIVE start times in one session and routes facts by instant", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-instant-"))
    const database = await ControlDatabase.open(directory)
    const service = new BilibiliLiveSessionService({ database, idFactory: () => crypto.randomUUID() })
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0d00"
    try {
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)!
      database.createBilibiliLiveDanmakuSession({ sessionId: "instant-transport", monitorId,
        roomId: room.roomId, connectHost: "wss://example.test/sub", startedAt: "2026-08-29T12:00:00Z" })
      const opened = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00Z",
        title: room.title, fetchedAt: "2026-08-29T12:00:01.000Z" })!
      const repeated = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00.000000000Z",
        title: room.title, fetchedAt: "2026-08-29T12:00:02.000Z" })!
      expect(repeated.sessionId).toBe(opened.sessionId)
      expect(repeated.liveKey).toBe("platform:2026-08-29T12:00:00Z")
      service.ingest(room, "instant-transport", 1, 3, { command: "LIVE", kind: "LIVE",
        occurredAt: "2026-08-29T12:00:03Z", receivedAt: "2026-08-29T12:00:03.100Z",
        liveStartedAt: "2026-08-29T20:00:00+08:00", giftDelta: 0, superChatDelta: 0, rawJson: "{}" })
      expect(database.findActiveBilibiliLiveSession(monitorId)?.sessionId).toBe(opened.sessionId)
      expect(service.ingest(room, "instant-transport", 2, 3, { command: "DANMU_MSG", kind: "DANMAKU",
        occurredAt: "2026-08-29T12:00:00.100Z", receivedAt: "2026-08-29T12:00:04.000Z",
        messageText: "同一场直播", giftDelta: 0, superChatDelta: 0, rawJson: "{}" })).toBe(true)
      expect(service.events({ sessionId: opened.sessionId })).toMatchObject({ total: 1,
        items: [{ messageText: "同一场直播" }] })
      expect(database.listBilibiliLiveSessions(monitorId, 20)).toHaveLength(1)
      service.reconcileRest(room, { liveStatus: 0, liveTime: null, title: room.title,
        fetchedAt: "2026-08-29T12:00:00.100Z" })
      expect(database.findBilibiliLiveSessionById(opened.sessionId)).toMatchObject({
        state: "CLOSED", endedAt: "2026-08-29T12:00:00.100000000Z"
      })
    } finally { database.close() }
  })

  it("recovers a closed session by equivalent platform time but splits a genuinely new start", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-recovery-instant-"))
    const database = await ControlDatabase.open(directory)
    const service = new BilibiliLiveSessionService({ database, idFactory: () => crypto.randomUUID() })
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0d10"
    try {
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)!
      const opened = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00.000Z",
        title: room.title, fetchedAt: "2026-08-29T12:00:01.000Z" })!
      service.reconcileRest(room, { liveStatus: 0, liveTime: null, title: room.title,
        fetchedAt: "2026-08-29T12:01:00.000Z" })
      const recovered = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00Z",
        title: room.title, fetchedAt: "2026-08-29T12:02:00.000Z" })!
      expect(recovered.sessionId).toBe(opened.sessionId)
      const restarted = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00.000000001Z",
        title: room.title, fetchedAt: "2026-08-29T12:03:00.000Z" })!
      expect(restarted.sessionId).not.toBe(opened.sessionId)
      expect(restarted.liveKey).toBe("platform:2026-08-29T12:00:00.000000001Z")
      expect(database.findBilibiliLiveSessionById(opened.sessionId)?.endSource).toBe("RESTART_DETECTED")
      expect(database.listBilibiliLiveSessions(monitorId, 20)).toHaveLength(2)
      const known = sessionRecord(crypto.randomUUID(), monitorId,
        "2026-08-29T12:00:00.000000002Z", "2026-08-29T12:01:00Z")
      database.insertBilibiliLiveSession(known)
      database.createBilibiliLiveDanmakuSession({ sessionId: "instant-recovery-transport", monitorId,
        roomId: room.roomId, connectHost: "wss://example.test/sub", startedAt: "2026-08-29T12:03:00Z" })
      service.ingest(room, "instant-recovery-transport", 1, 3, { command: "LIVE", kind: "LIVE",
        occurredAt: "2026-08-29T12:04:00Z", receivedAt: "2026-08-29T12:04:00.100Z",
        liveStartedAt: "2026-08-29T12:00:00.000000002Z", giftDelta: 0, superChatDelta: 0, rawJson: "{}" })
      expect(database.findActiveBilibiliLiveSession(monitorId)).toMatchObject({ sessionId: known.sessionId, state: "OPEN", endedAt: null })
      expect(database.listBilibiliLiveSessions(monitorId, 20)).toHaveLength(3)
    } finally { database.close() }
  })

  it("matches original analytics statistics for captured and unresolved session facts", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-analytics-"))
    const database = await ControlDatabase.open(directory)
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0f00"
    const sessionId = "018f0f39-7b5e-4cc1-862d-9a208b3d0f01"
    const service = new BilibiliLiveSessionService({ database, idFactory: () => crypto.randomUUID() })
    const start = "2026-08-29T12:00:00.000Z"
    const at = (milliseconds: number) => new Date(Date.parse(start) + milliseconds).toISOString()
    try {
      seedRoom(database, monitorId)
      database.insertBilibiliLiveSession(sessionRecord(sessionId, monitorId, start, at(300_000)))
      // Original coverage clips to the live boundary and floors each disjoint interval separately.
      for (const [connected, ended] of [[100, 101_800], [102_200, 600_000]]) {
        const transportId = crypto.randomUUID()
        database.createBilibiliLiveDanmakuSession({ sessionId: transportId, monitorId, roomId: "33",
          connectHost: "wss://example.test/sub", startedAt: at(connected!) })
        database.markBilibiliLiveDanmakuSessionConnected(transportId, at(connected!))
        database.markBilibiliLiveDanmakuSessionStatus(transportId, "CLOSED", at(ended!))
      }
      const facts = [
        [null, "DANMAKU", 0, null], ["99", "DANMAKU", 100_000, null],
        ["99", "GIFT", 100_900, 0], ["99", "DANMAKU", 120_000, null],
        [null, "DANMAKU", 300_000, null], ["88", "GIFT", 150_000, 1], ["77", "GIFT", 160_000, 2]
      ] as const
      facts.forEach(([uid, kind, milliseconds, amount], index) => {
        database.insertBilibiliLiveSessionEvent({
          ...sessionEvent({ eventId: crypto.randomUUID(), sessionId, monitorId, ordinal: index + 1,
            kind, uid: uid ?? "0", occurredAt: at(milliseconds), paidAmount: amount }),
          senderUid: uid, paid: kind === "GIFT", giftName: kind === "GIFT" ? `礼物-${index}` : null,
          receivedAt: at(milliseconds + (index === 2 ? 1000 : 0))
        })
      })
      const insight = service.insight({ sessionId, bucketSeconds: 60 })
      expect.soft(insight.paymentDepth).toMatchObject({ payerCount: 3,
        medianPayerAmountMilliYuan: 1, medianConversionLagSeconds: 1,
        spendTiers: [{ code: "LIGHT", userCount: 3, paidAmountMilliYuan: 3 },
          { code: "STANDARD", userCount: 0 }, { code: "CORE", userCount: 0 }] })
      expect.soft(insight.danmakuDepth.sustainedParticipationRate).toBe(0)
      expect.soft(insight.danmakuDepth.stages[1]).toMatchObject({ danmakuCount: 2, activeUserCount: 1 })
      expect.soft(insight.quality).toMatchObject({ coveredSeconds: 298, eventLatencyP95Millis: 700,
        supportedEventCount: 7, identityResolvedEventShare: 0.71429 })
      expect.soft(insight.kpis.danmakuPerMinute).toBe(0.805)
      expect.soft(insight.giftMix[1]?.revenueShare).toBe(0.33333)
      // Payment depth counts paid events; source user-segment classification remains amount based.
      expect.soft(insight.userSegments.find(segment => segment.code === "CASUAL_INTERACTOR")?.userCount).toBe(1)
    } finally { database.close() }
  })

  it("uses the original historical payer, user segment and milli-yuan tier rules", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-insight-history-"))
    const database = await ControlDatabase.open(directory)
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c00"
    const priorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c01"
    const currentId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c02"
    const service = new BilibiliLiveSessionService({
      database,
      idFactory: () => crypto.randomUUID()
    })
    try {
      seedRoom(database, monitorId)
      database.insertBilibiliLiveSession(sessionRecord(
        priorId,
        monitorId,
        "2026-08-29T10:00:00.000Z",
        "2026-08-29T11:00:00.000Z"
      ))
      database.insertBilibiliLiveSession(sessionRecord(
        currentId,
        monitorId,
        "2026-08-29T12:00:00.000Z",
        "2026-08-29T13:00:00.000Z"
      ))
      database.insertBilibiliLiveSessionEvent(sessionEvent({
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c10",
        sessionId: priorId,
        monitorId,
        ordinal: 1,
        kind: "GIFT",
        uid: "99",
        occurredAt: "2026-08-29T10:30:00.000Z",
        paidAmount: 5000
      }))
      for (let index = 0; index < 3; index += 1) {
        database.insertBilibiliLiveSessionEvent(sessionEvent({
          eventId: `018f0f39-7b5e-4cc1-862d-9a208b3d0c2${index}`,
          sessionId: currentId,
          monitorId,
          ordinal: index + 1,
          kind: "DANMAKU",
          uid: "99",
          occurredAt: `2026-08-29T12:0${index + 1}:00.000Z`,
          paidAmount: null
        }))
      }
      database.insertBilibiliLiveSessionEvent(sessionEvent({
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c30",
        sessionId: currentId,
        monitorId,
        ordinal: 4,
        kind: "GIFT",
        uid: "99",
        occurredAt: "2026-08-29T12:05:00.000Z",
        paidAmount: 5000
      }))
      database.insertBilibiliLiveSessionEvent(sessionEvent({
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c31",
        sessionId: currentId,
        monitorId,
        ordinal: 5,
        kind: "DANMAKU",
        uid: "88",
        occurredAt: "2026-08-29T12:06:00.000Z",
        paidAmount: null
      }))

      const insight = service.insight({ sessionId: currentId, bucketSeconds: 60 })
      expect(insight.paymentDepth).toMatchObject({
        payerCount: 1,
        returningPayerRate: 1,
        spendTiers: [
          { code: "LIGHT", userCount: 0, paidAmountMilliYuan: 0 },
          { code: "STANDARD", userCount: 1, paidAmountMilliYuan: 5000 },
          { code: "CORE", userCount: 0 }
        ]
      })
      expect(insight.userSegments).toEqual([
        expect.objectContaining({ code: "CORE_SUPPORTER", userCount: 1 }),
        expect.objectContaining({ code: "SILENT_PAYER", userCount: 0 }),
        expect.objectContaining({ code: "ACTIVE_UNPAID", userCount: 0 }),
        expect.objectContaining({ code: "CASUAL_INTERACTOR", userCount: 1 })
      ])
    } finally {
      database.close()
    }
  })

  it("pages the latest facts while keeping complete session aggregates", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-session-query-"))
    const database = await ControlDatabase.open(directory)
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0e00"
    const sessionId = "018f0f39-7b5e-4cc1-862d-9a208b3d0e01"
    const service = new BilibiliLiveSessionService({ database, idFactory: () => crypto.randomUUID() })
    const danmakuCount = 100_001
    const earlyGiftId = "018f0f39-7b5e-4cc1-862d-000000900003"
    const earlierTieId = "018f0f39-7b5e-4cc1-862d-000000900002"
    const latestTieId = "018f0f39-7b5e-4cc1-862d-000000900001"
    try {
      seedRoom(database, monitorId)
      database.insertBilibiliLiveSession(sessionRecord(
        sessionId, monitorId, "2026-08-29T12:00:00.000Z", "2026-08-29T13:00:00.000Z"
      ))
      database.runInTransaction(() => {
        for (let ordinal = 1; ordinal <= danmakuCount; ordinal += 1) {
          database.insertBilibiliLiveSessionEvent({
            ...sessionEvent({
              eventId: `018f0f39-7b5e-4cc1-862d-${String(ordinal).padStart(12, "0")}`,
              sessionId, monitorId, ordinal, kind: "DANMAKU", uid: "99",
              occurredAt: "2026-08-29T12:01:00.000Z", paidAmount: null
            }),
            messageText: "hello"
          })
        }
        database.insertBilibiliLiveSessionEvent({
          ...sessionEvent({
            eventId: earlyGiftId, sessionId, monitorId, ordinal: danmakuCount + 1,
            kind: "GIFT", uid: "99", occurredAt: "2026-08-29T12:01:30.000Z", paidAmount: 1000
          }),
          giftName: "Ålpha_100%"
        })
        database.insertBilibiliLiveSessionEvent({
          ...sessionEvent({
            eventId: earlierTieId, sessionId, monitorId, ordinal: danmakuCount + 2,
            kind: "GIFT", uid: "99", occurredAt: "2026-08-29T12:02:00.000Z", paidAmount: 2000
          }),
          senderName: "latest-99",
          giftName: "Ålpha_100%"
        })
        database.insertBilibiliLiveSessionEvent({
          ...sessionEvent({
            eventId: latestTieId, sessionId, monitorId, ordinal: danmakuCount + 3,
            kind: "GIFT", uid: "88", occurredAt: "2026-08-29T12:02:00.000Z", paidAmount: 4000
          }),
          medalName: "medal-only"
        })
      })

      expect.soft(service.events({ sessionId, size: 2 })).toMatchObject({
        total: danmakuCount + 3,
        items: [{ id: latestTieId }, { id: earlierTieId }]
      })
      expect.soft(service.events({ sessionId, kind: "GIFT", page: 2, size: 1 })).toMatchObject({
        total: 3, page: 2, size: 1, items: [{ id: earlierTieId }]
      })
      expect.soft(service.events({
        sessionId, kind: "GIFT", userUid: "99", paid: true, keyword: " ÅLPHA_100% "
      })).toMatchObject({ total: 2, items: [{ id: earlierTieId }, { id: earlyGiftId }] })
      expect.soft(service.events({ sessionId, kind: "GIFT", keyword: "%" })).toMatchObject({
        total: 3, items: [{ id: latestTieId }, { id: earlierTieId }, { id: earlyGiftId }]
      })
      expect.soft(service.events({ sessionId, kind: "GIFT", keyword: "medal-only" })).toMatchObject({
        total: 0, items: []
      })
      expect.soft(service.get(sessionId)).toMatchObject({
        danmakuCount, giftEventCount: 3, giftCount: 3,
        interactingUserCount: 2, paidUserCount: 2, paidEventCount: 3, paidAmountMilliYuan: 7000,
        firstEventAt: "2026-08-29T12:01:00.000Z", lastEventAt: "2026-08-29T12:02:00.000Z"
      })
      expect.soft(service.users({ sessionId })).toMatchObject([
        { userUid: "88", paidAmountMilliYuan: 4000 },
        { userUid: "99", displayName: "latest-99", danmakuCount, paidEventCount: 2,
          paidAmountMilliYuan: 3000, firstSeenAt: "2026-08-29T12:01:00.000Z",
          lastSeenAt: "2026-08-29T12:02:00.000Z" }
      ])
      expect.soft(service.insight({ sessionId, bucketSeconds: 60 })).toMatchObject({
        quality: { supportedEventCount: danmakuCount + 3 },
        kpis: { paidAmountMilliYuan: 7000 },
        paymentDepth: { payerCount: 2, medianConversionLagSeconds: 30 },
        timeline: [
          { bucketStart: "2026-08-29T12:01:00.000Z", danmakuCount, paidAmountMilliYuan: 1000 },
          { bucketStart: "2026-08-29T12:02:00.000Z", danmakuCount: 0, paidAmountMilliYuan: 6000 }
        ]
      })
    } finally {
      database.close()
    }
  }, 30_000)
})

function sessionRecord(
  sessionId: string,
  monitorId: string,
  startedAt: string,
  endedAt: string
) {
  return {
    sessionId,
    monitorId,
    uid: "22",
    roomId: "33",
    state: "CLOSED" as const,
    platformLiveTime: startedAt,
    liveKey: `platform:${startedAt}`,
    startedAt,
    startDetectedAt: startedAt,
    startSource: "REST_STATUS",
    endSignalAt: endedAt,
    endedAt,
    endDetectedAt: endedAt,
    endSource: "REST_STATUS",
    lastLiveObservedAt: endedAt,
    lastObservedAt: endedAt,
    titleAtStart: "直播标题",
    titleAtEnd: "直播结束",
    createdAt: startedAt,
    updatedAt: endedAt
  }
}

function sessionEvent(input: {
  eventId: string
  sessionId: string
  monitorId: string
  ordinal: number
  kind: "DANMAKU" | "GIFT"
  uid: string
  occurredAt: string
  paidAmount: number | null
}) {
  return {
    eventId: input.eventId,
    liveSessionId: input.sessionId,
    transportSessionId: null,
    receiptOrdinal: input.ordinal,
    monitorId: input.monitorId,
    roomId: "33",
    eventKey: `${input.kind}:${input.eventId}`,
    sourceEventId: input.eventId,
    eventKind: input.kind,
    command: input.kind === "DANMAKU" ? "DANMU_MSG" : "SEND_GIFT",
    protocolVersion: 3,
    senderUid: input.uid,
    senderName: `user-${input.uid}`,
    medalName: null,
    messageText: input.kind === "DANMAKU" ? `message-${input.ordinal}` : null,
    giftId: input.kind === "GIFT" ? "1" : null,
    giftName: input.kind === "GIFT" ? "礼物" : null,
    giftCount: input.kind === "GIFT" ? 1 : null,
    coinType: input.kind === "GIFT" ? "gold" : null,
    unitPriceMilliYuan: input.paidAmount,
    paidAmountMilliYuan: input.paidAmount,
    paid: (input.paidAmount ?? 0) > 0,
    guardLevel: null,
    amountSource: input.kind === "GIFT" ? "TOTAL_COIN" : null,
    occurredAt: input.occurredAt,
    receivedAt: input.occurredAt,
    rawPayloadJson: "{}",
    createdAt: input.occurredAt
  }
}

function seedRoom(database: ControlDatabase, monitorId: string): void {
  database.applyBilibiliLiveRoomSnapshot({
    monitor: {
      monitorId,
      uid: "22",
      roomId: "33",
      shortId: null,
      uname: "anchor",
      faceUrl: null,
      title: "直播标题",
      coverUrl: null,
      keyframeUrl: null,
      areaId: null,
      areaName: null,
      parentAreaId: null,
      parentAreaName: null,
      liveStatus: 1,
      liveTime: "2026-08-29T12:00:00.000Z",
      onlineCount: 1,
      attentionCount: 2,
      intervalSeconds: 300,
      nextCollectAt: "2026-08-29T12:05:00.000Z",
      capturedAt: "2026-08-29T12:00:00.000Z",
      sourceEndpoint: "room/v1/Room/get_info"
    },
    snapshot: {
      snapshotId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b02",
      capturedBucket: "2026-08-29T12:00:00.000Z"
    },
    artifact: {
      objectId: `sha256:${"b".repeat(64)}`,
      sha256: "b".repeat(64),
      relativePath: "cas/b.json",
      sizeBytes: 1,
      mediaType: "application/json",
      createdAt: "2026-08-29T12:00:00.000Z"
    },
    outbox: {
      messageId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b03",
      topic: "seed",
      envelopeJson: "{}",
      createdAt: "2026-08-29T12:00:00.000Z"
    }
  })
}
