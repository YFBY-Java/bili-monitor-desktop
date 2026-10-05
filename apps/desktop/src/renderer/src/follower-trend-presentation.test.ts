import type { BilibiliFollowerMonitorV2 } from "@bmd/contracts"
import { describe, expect, it } from "vitest"
import { followerChartHeight, followerChartPoints, followerTimeBounds, followerValueBounds, formatFollowerAxisNumber, swapFollowerTrends } from "./follower-trend-presentation"

describe("original follower trend presentation", () => {
  it("pads the value domain instead of stretching a small change across the whole chart", () => {
    expect(followerValueBounds(["100", "120"])).toEqual({ min: 84n, max: 136n, span: 52n })
    expect(followerValueBounds(["1000000"])).toEqual({ min: 999764n, max: 1000236n, span: 472n })
    expect(followerValueBounds(["0"])).toEqual({ min: 0n, max: 5n, span: 5n })
    const range = followerValueBounds(["1000000000", "1000000001"])
    expect(range.span).toBeGreaterThan(40000n)
    expect(followerValueBounds([]).span).toBe(0n)
  })
  it("pads a single timestamp by half an hour and short/long spans by the original floors", () => {
    expect(followerTimeBounds([0])).toEqual({ min: -1_800_000, max: 1_800_000, span: 3_600_000 })
    expect(followerTimeBounds([0, 60_000])).toEqual({ min: -30_000, max: 90_000, span: 120_000 })
    expect(followerTimeBounds([0, 600_000])).toEqual({ min: -60_000, max: 660_000, span: 720_000 })
    expect(followerTimeBounds([0, 100_000_000])).toEqual({ min: -4_000_000, max: 104_000_000, span: 108_000_000 })
  })
  it.each([[1_234, 40, "1,234"], [12_345, 100, "1.23万"], [12_345, 200_000, "1.2万"], [123_450_000, 1_000, "1.23亿"], [100_000_000, 1_000, "1亿"]])(
    "formats %i with span %i as %s", (value, span, expected) => { expect(formatFollowerAxisNumber(BigInt(value), BigInt(span))).toBe(expected) }
  )
  it("uses the selected count and index for original chart heights", () => {
    expect([1, 2, 3, 4].map(count => followerChartHeight(count, 0))).toEqual([440, 360, 440, 248])
    expect(followerChartHeight(3, 1)).toBe(204)
    expect(followerChartHeight(3, 2)).toBe(204)
  })
  it("swaps exactly two slots without moving intermediate users or mutating the selection", () => {
    const ids = ["a", "b", "c", "d"]
    expect(swapFollowerTrends(ids, "a", "c")).toEqual(["c", "b", "a", "d"])
    expect(ids).toEqual(["a", "b", "c", "d"])
    expect(swapFollowerTrends(ids, "a", "missing")).toEqual(ids)
    expect(swapFollowerTrends(ids, "a", "a")).toEqual(ids)
  })
  it("prefers nonempty fetched history, then recent points, then a known current value including zero", () => {
    const now = Date.parse("2026-09-13T00:00:00Z")
    const recent = { capturedAt: "2026-09-12T00:00:00Z", followerCount: "10", sourceEndpoint: "card" }
    const user: BilibiliFollowerMonitorV2 = { id: "018f0f39-7b5e-4cc1-862d-000000000001", mid: "2", nickname: "合成用户",
      profileUrl: "https://space.bilibili.com/2", monitorStatus: "ACTIVE", intervalSeconds: 60, recentTrend: [recent], version: 1, currentFollowerCount: "0" }
    expect(followerChartPoints(user, [{ ...recent, followerCount: "20" }], now)[0]?.followerCount).toBe("20")
    expect(followerChartPoints(user, [], now)).toEqual([recent])
    const empty = { ...user, recentTrend: [] }
    expect(followerChartPoints(empty, undefined, now)).toEqual([{ capturedAt: new Date(now).toISOString(), followerCount: "0", sourceEndpoint: "local" }])
    expect(followerChartPoints({ ...empty, lastSnapshotAt: recent.capturedAt, followingCount: "5", sourceEndpoint: "card" }, [], now))
      .toEqual([{ ...recent, followerCount: "0", followingCount: "5" }])
    const { currentFollowerCount: _current, ...unknown } = empty
    expect(followerChartPoints(unknown, [], now)).toEqual([])
    expect(empty.recentTrend).toEqual([])
  })
})
