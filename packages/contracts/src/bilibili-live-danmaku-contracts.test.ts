import { describe, expect, it } from "vitest"

import {
  BilibiliLiveDanmakuMetricBucketSchema,
  BilibiliLiveDanmakuRecentSchema,
  BilibiliLiveDanmakuStatusSchema,
  QueryBilibiliLiveDanmakuRecentInputSchema,
  StartBilibiliLiveDanmakuInputSchema
} from "./bilibili-live-danmaku"

describe("Bilibili live danmaku contracts", () => {
  it("keeps the original start protocol selection and transport status projection", () => {
    for (const protocolVersion of [-2, 4, -2147483648, 2147483647]) {
      expect(StartBilibiliLiveDanmakuInputSchema.parse({ roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900", protocolVersion }))
        .toMatchObject({ protocolVersion })
    }
    expect(StartBilibiliLiveDanmakuInputSchema.parse({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      protocolVersion: -1
    })).toMatchObject({ protocolVersion: -1 })
    expect(BilibiliLiveDanmakuStatusSchema.parse({
      liveRoomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      roomId: "7734200",
      running: true,
      status: "CONNECTED",
      connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
      sessionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
      ratePerMinute: 2,
      last5MinutesCount: 6,
      likeCount: 120,
      likeIncrement: 7,
      watchedCount: 999,
      heartbeatPopularity: 42,
      protocolVersion: 3,
      authMode: "LOGIN",
      authUid: "1001",
      startedAt: "2026-08-29T12:00:00.000Z",
      lastHeartbeatAt: "2026-08-29T12:00:30.000Z"
    })).toMatchObject({ status: "CONNECTED", authMode: "LOGIN", protocolVersion: 3 })
  })

  it("keeps positive sender UID only and the original recent message shape", () => {
    const roomMonitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0900"
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.parse({ roomMonitorId })).toEqual({ roomMonitorId, limit: 30 })
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.parse({ roomMonitorId, limit: 0 })).toEqual({ roomMonitorId, limit: 1 })
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.parse({ roomMonitorId, limit: 201 })).toEqual({ roomMonitorId, limit: 200 })
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.parse({ roomMonitorId, limit: -2_147_483_648 }).limit).toBe(1)
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.parse({ roomMonitorId, limit: 2_147_483_647 }).limit).toBe(200)
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.safeParse({ roomMonitorId, limit: -2_147_483_649 }).success).toBe(false)
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.safeParse({ roomMonitorId, limit: 2_147_483_648 }).success).toBe(false)
    expect(QueryBilibiliLiveDanmakuRecentInputSchema.safeParse({ roomMonitorId, limit: 1.5 }).success).toBe(false)
    expect(BilibiliLiveDanmakuRecentSchema.parse({
      messageText: "hello danmaku",
      senderUid: "1001",
      displayName: "完整昵称",
      medalName: "详细粉丝牌",
      sentAt: "2026-08-29T12:00:00.000Z"
    })).toMatchObject({ senderUid: "1001" })
    expect(() => BilibiliLiveDanmakuRecentSchema.parse({
      messageText: "invalid",
      senderUid: "0",
      sentAt: "2026-08-29T12:00:00.000Z"
    })).toThrow()
  })

  it("keeps the original metric bucket fields", () => {
    expect(BilibiliLiveDanmakuMetricBucketSchema.parse({
      bucketStart: "2026-08-29T12:00:00.000Z",
      bucketSeconds: 60,
      danmuCount: 3,
      likeCount: 120,
      likeIncrement: 7,
      watchedCount: 999,
      heartbeatPopularity: 42,
      rawEventCount: 5
    })).toMatchObject({ bucketSeconds: 60, danmuCount: 3, rawEventCount: 5 })
  })
})
