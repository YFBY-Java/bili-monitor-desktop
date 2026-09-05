import type { BilibiliCredential } from "@bmd/contracts"
import type { ControlDatabase } from "@bmd/storage"
import { describe, expect, it, vi } from "vitest"

import {
  BilibiliLiveDanmakuService,
  type BilibiliLiveDanmakuSource,
  type BilibiliLiveDanmakuSourceEvent
} from "./bilibili-live-danmaku-service"

describe("BilibiliLiveDanmakuService", () => {
  it("runs the original start, event persistence, status, recent, metrics and stop flow", async () => {
    let listener: ((event: BilibiliLiveDanmakuSourceEvent) => void) | undefined
    const database = {
      markOrphanedBilibiliLiveDanmakuSessions: vi.fn(() => 0),
      findBilibiliLiveRoomById: vi.fn(() => ({
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        liveStatus: 1,
        monitorStatus: "ACTIVE"
      })),
      createBilibiliLiveDanmakuSession: vi.fn((input) => ({ ...input, status: "CONNECTING" })),
      updateBilibiliLiveDanmakuSessionTransport: vi.fn(),
      markBilibiliLiveDanmakuSessionConnected: vi.fn(),
      markBilibiliLiveDanmakuSessionStatus: vi.fn(),
      markBilibiliLiveDanmakuSessionHeartbeat: vi.fn(),
      markBilibiliLiveDanmakuSessionError: vi.fn(),
      findLatestBilibiliLiveDanmakuSession: vi.fn(() => undefined),
      getBilibiliLiveDanmakuStats: vi.fn(() => ({
        ratePerMinute: 1,
        last5MinutesCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        latestBucketAt: "2026-08-29T12:00:00.000Z",
        latestMessageAt: "2026-08-29T12:00:05.000Z"
      })),
      recordBilibiliLiveDanmakuEvent: vi.fn(),
      runInTransaction: vi.fn((operation: () => unknown) => operation()),
      findBilibiliLiveDanmakuRecent: vi.fn(() => [{
        recentId: "recent-1",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        senderUid: "1001",
        messageText: "hello danmaku",
        displayName: "完整昵称",
        medalName: "详细粉丝牌",
        sentAt: "2026-08-29T12:00:05.000Z",
        createdAt: "2026-08-29T12:00:05.000Z"
      }]),
      findBilibiliLiveDanmakuMetricBuckets: vi.fn(() => [{
        bucketId: "bucket-1",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        sessionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
        roomId: "7734200",
        bucketStart: "2026-08-29T12:00:00.000Z",
        bucketSeconds: 60,
        danmuCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        giftCount: 0,
        superChatCount: 0,
        rawEventCount: 2,
        updatedAt: "2026-08-29T12:00:20.000Z",
        createdAt: "2026-08-29T12:00:05.000Z"
      }]),
      listBilibiliLiveDanmakuAutoStartRoomIds: vi.fn(() => [])
    } as unknown as ControlDatabase
    const source: BilibiliLiveDanmakuSource = {
      start: vi.fn(async (_input, callback) => {
        listener = callback
        return {
          connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
          protocolVersion: 3,
          authMode: "LOGIN" as const,
          authUid: "1001"
        }
      }),
      stop: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined)
    }
    const credential = {
      cookieHeader: "SESSDATA=secret",
      account: { mid: "1001" }
    } as BilibiliCredential
    const resolveDisplayName = vi.fn(async () => "完整昵称")
    const service = new BilibiliLiveDanmakuService({
      database,
      source,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: vi.fn()
        .mockReturnValueOnce("018f0f39-7b5e-7cc1-962d-9a208b3d0901"),
      credentialProvider: async () => credential,
      resolveDisplayName
    })

    const started = await service.start({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      protocolVersion: -1
    })
    expect(started).toMatchObject({
      running: true,
      status: "CONNECTED",
      protocolVersion: 3,
      authMode: "LOGIN",
      authUid: "1001"
    })
    listener?.({
      type: "command",
      receivedAt: "2026-08-29T12:00:05.000Z",
      event: {
        command: "DANMU_MSG",
        kind: "DANMAKU",
        occurredAt: "2026-08-29T12:00:05.000Z",
        receivedAt: "2026-08-29T12:00:05.000Z",
        actor: { uid: "1001", displayName: "用**户", medalName: "详细粉丝牌" },
        messageText: "hello danmaku",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
    })
    listener?.({
      type: "heartbeat",
      popularity: 42,
      receivedAt: "2026-08-29T12:00:30.000Z"
    })
    listener?.({
      type: "command",
      receivedAt: "2026-08-29T12:00:31.000Z",
      event: {
        command: "NOTICE_MSG",
        kind: "UNKNOWN",
        occurredAt: "2026-08-29T12:00:31.000Z",
        receivedAt: "2026-08-29T12:00:31.000Z",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
    })
    await vi.waitFor(() => {
      expect(database.recordBilibiliLiveDanmakuEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          danmuDelta: 1,
          rawEventDelta: 1,
          recent: expect.objectContaining({
            senderUid: "1001",
            displayName: "完整昵称",
            messageText: "hello danmaku"
          })
        })
      )
    })
    expect(resolveDisplayName).toHaveBeenCalledTimes(1)
    expect(database.markBilibiliLiveDanmakuSessionHeartbeat).toHaveBeenCalled()
    expect(database.recordBilibiliLiveDanmakuEvent).toHaveBeenCalledWith(
      expect.objectContaining({ rawEventDelta: 1, danmuDelta: 0 })
    )
    expect(service.recent({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      limit: 30
    })).toMatchObject([{ senderUid: "1001", messageText: "hello danmaku" }])
    expect(service.metrics({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      range: "1h"
    })).toMatchObject([{ danmuCount: 1, likeIncrement: 7, rawEventCount: 2 }])

    const stopped = await service.stop("018f0f39-7b5e-7cc1-962d-9a208b3d0900")
    expect(stopped).toMatchObject({ running: false, status: "STOPPED" })
    expect(source.stop).toHaveBeenCalledWith("018f0f39-7b5e-7cc1-962d-9a208b3d0901")
  })

  it("reports persisted active transport as PROCESS_RESTART instead of pretending it is live", () => {
    const database = {
      markOrphanedBilibiliLiveDanmakuSessions: vi.fn(() => 1),
      findBilibiliLiveRoomById: vi.fn(() => ({ roomId: "7734200" })),
      findLatestBilibiliLiveDanmakuSession: vi.fn(() => ({
        sessionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        status: "CONNECTED",
        connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
        startedAt: "2026-08-29T11:55:00.000Z",
        connectedAt: "2026-08-29T11:55:01.000Z",
        endedAt: null,
        reconnectCount: 0,
        lastHeartbeatAt: "2026-08-29T11:59:30.000Z",
        lastErrorAt: null,
        lastErrorType: null,
        lastErrorMessage: null,
        createdAt: "2026-08-29T11:55:00.000Z"
      })),
      getBilibiliLiveDanmakuStats: vi.fn(() => ({
        ratePerMinute: 0,
        last5MinutesCount: 0,
        likeCount: null,
        likeIncrement: 0,
        watchedCount: null,
        heartbeatPopularity: null,
        latestBucketAt: null,
        latestMessageAt: null
      }))
    } as unknown as ControlDatabase
    const service = new BilibiliLiveDanmakuService({
      database,
      source: { start: vi.fn(), stop: vi.fn(), stopAll: vi.fn() },
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: vi.fn(),
      credentialProvider: async () => undefined
    })
    expect(service.status("018f0f39-7b5e-7cc1-962d-9a208b3d0900")).toMatchObject({
      running: false,
      status: "ERROR",
      lastErrorType: "PROCESS_RESTART"
    })
  })
})
