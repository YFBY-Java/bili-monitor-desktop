import { describe, expect, it } from "vitest"

import {
  BilibiliLiveSessionSummarySchema,
  ListBilibiliLiveSessionsInputSchema,
  QueryBilibiliLiveSessionEventsInputSchema,
  QueryBilibiliLiveSessionInsightInputSchema
} from "./bilibili-live-session"

describe("Bilibili live session contracts", () => {
  it.each([[undefined, 20], [0, 20], [-5, 20], [1, 1], [150, 150], [200, 200], [201, 200]])(
    "normalizes recent-session limit %s to %s like the original query service", (limit, expected) => {
      const roomMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0801"
      expect(ListBilibiliLiveSessionsInputSchema.parse({ roomMonitorId, limit })).toEqual({ roomMonitorId, limit: expected })
    }
  )

  it("rejects invalid session-list inputs instead of coercing IPC values", () => {
    const roomMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0801"
    for (const limit of [1.5, "200", null, NaN, Infinity]) {
      expect(ListBilibiliLiveSessionsInputSchema.safeParse({ roomMonitorId, limit }).success).toBe(false)
    }
    expect(ListBilibiliLiveSessionsInputSchema.safeParse({ roomMonitorId: "22" }).success).toBe(false)
    expect(ListBilibiliLiveSessionsInputSchema.safeParse({ roomMonitorId, extra: true }).success).toBe(false)
  })

  it("keeps original event filters and insight bucket defaults", () => {
    const sessionId = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
    expect(QueryBilibiliLiveSessionEventsInputSchema.parse({ sessionId })).toEqual({
      sessionId,
      page: 1,
      size: 50
    })
    expect(QueryBilibiliLiveSessionInsightInputSchema.parse({ sessionId })).toEqual({
      sessionId,
      bucketSeconds: 300
    })
    expect(() => QueryBilibiliLiveSessionInsightInputSchema.parse({
      sessionId,
      bucketSeconds: 120
    })).toThrow()
  })

  it("distinguishes boundary-only unknown metrics from measured zero", () => {
    expect(BilibiliLiveSessionSummarySchema.parse({
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0800",
      monitorId: "018f0f39-7b5e-4cc1-862d-9a208b3d0801",
      uid: "22",
      roomId: "33",
      state: "INCOMPLETE",
      startedAt: "2026-08-29T12:00:00.000Z",
      endedAt: null,
      startSource: "STATUS_EVENT_BACKFILL_INCOMPLETE",
      endSource: null,
      coverageStatus: "BOUNDARY_ONLY",
      transportSessionCount: 0,
      captureStartedAt: null,
      captureEndedAt: null,
      danmakuCount: null,
      giftEventCount: null,
      giftCount: null,
      freeGiftCount: null,
      giftSenderCount: null,
      paidUserCount: null,
      interactingUserCount: null,
      unresolvedInteractingEventCount: null,
      unresolvedGiftEventCount: null,
      unresolvedPaidEventCount: null,
      paidEventCount: null,
      paidAmountMilliYuan: null,
      firstEventAt: null,
      lastEventAt: null
    })).toMatchObject({ coverageStatus: "BOUNDARY_ONLY", danmakuCount: null })
  })
})
