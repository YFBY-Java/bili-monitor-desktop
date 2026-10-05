import type { BilibiliFollowerMonitorV2 } from "@bmd/contracts"
import { describe, expect, it } from "vitest"

import { clampFollowerInterval, followerIntervalStep, syncFollowerIntervalDrafts } from "./follower-interval-draft"

const user: BilibiliFollowerMonitorV2 = {
  id: "018f0f39-7b5e-7cc1-962d-000000000000", mid: "2", nickname: "合成用户",
  profileUrl: "https://space.bilibili.com/2", intervalSeconds: 60,
  monitorStatus: "ACTIVE", version: 1, recentTrend: []
}

describe("original follower interval draft policy", () => {
  it.each([[NaN, 1], [Infinity, 1], [-Infinity, 1], [-3, 1], [0, 1], [1.5, 2], [60.5, 61], [2_592_001, 2_592_000]])(
    "rounds and clamps %s to %i", (value, result) => { expect(clampFollowerInterval(value)).toBe(result) }
  )
  it.each([[1, 1], [59, 1], [60, 60], [3_599, 60], [3_600, 300], [86_399, 300], [86_400, 3_600], [2_592_000, 3_600]])(
    "uses the source step for %i seconds", (value, result) => { expect(followerIntervalStep(value)).toBe(result) }
  )
  it("seeds clean drafts and prunes removed users on a successful read", () => {
    expect(syncFollowerIntervalDrafts({ gone: { value: 120, dirty: true } }, [user]))
      .toEqual({ [user.id]: { value: 60, dirty: false } })
  })
  it("overwrites a committed clean draft even with an old server interval", () => {
    expect(syncFollowerIntervalDrafts({ [user.id]: { value: 120, dirty: false } }, [user]))
      .toEqual({ [user.id]: { value: 60, dirty: false } })
  })
  it("preserves the explicit dirty flag through matching and then differing reads", () => {
    const draft = { [user.id]: { value: 120, dirty: true } }
    const matching = syncFollowerIntervalDrafts(draft, [{ ...user, intervalSeconds: 120 }])
    expect(matching).toEqual(draft)
    expect(syncFollowerIntervalDrafts(matching, [user])).toEqual(draft)
    expect(draft).toEqual({ [user.id]: { value: 120, dirty: true } })
  })
})
