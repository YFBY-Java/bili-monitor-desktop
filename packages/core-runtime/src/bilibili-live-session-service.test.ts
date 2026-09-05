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
    const service = new BilibiliLiveSessionService({
      database,
      idFactory: () => `018f0f39-7b5e-4cc1-862d-${String(++sequence).padStart(12, "0")}`
    })
    try {
      const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)
      if (!room) throw new Error("room missing")
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

      service.ingest(room, transportId, 3, 3, {
        command: "PREPARING",
        kind: "PREPARING",
        occurredAt: "2026-08-29T12:10:00.000Z",
        receivedAt: "2026-08-29T12:10:00.100Z",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      })
      expect(database.findActiveBilibiliLiveSession(monitorId)).toMatchObject({
        state: "END_PENDING",
        endSignalAt: "2026-08-29T12:10:00.000Z"
      })
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
    } finally {
      database.close()
    }
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
