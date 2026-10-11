import type { BilibiliLiveRoomV2, BilibiliLiveTrendPointV2 } from "@bmd/contracts"
import { describe, expect, it } from "vitest"
import { formatLiveTrendTime, liveChartHeight, liveChartSamples, liveTrendHelp } from "./live-trend-presentation"
import { formatTrendAxisNumber, trendTimeBounds, trendValueBounds } from "./trend-axis"

const time = Date.parse("2026-09-13T04:00:00Z")
const point: BilibiliLiveTrendPointV2 = { roomId: "100", uid: "20", capturedAt: new Date(time).toISOString(),
  liveStatus: 1, onlineCount: "100", sourceEndpoint: "room/v1/Room/get_info" }
const room: BilibiliLiveRoomV2 = { id: "018f0f39-7b5e-4cc1-862d-000000000000", uid: "20", roomId: "100",
  uname: "合成主播", monitorStatus: "ACTIVE", liveStatus: 1, intervalSeconds: 300, recentTrend: [point], onlineCount: "300", version: 1 }

describe("original live trend presentation rules", () => {
  it("prefers nonempty queried points over embedded recent points and preserves their source values", () => {
    const history = [{ ...point, onlineCount: "200" }]
    const before = JSON.stringify({ room, history })
    expect(liveChartSamples(room, history, time).points).toBe(history)
    expect(liveChartSamples(room, history, time).source).toBe("history")
    expect(liveChartSamples(room, [], time).points).toBe(room.recentTrend)
    expect(liveChartSamples(room, undefined, time).source).toBe("recent")
    expect(JSON.stringify({ room, history })).toBe(before)
  })

  it("distinguishes current zero and missing value and never adds a synthetic source endpoint", () => {
    const current = { ...room, recentTrend: [], onlineCount: "0" }
    const samples = liveChartSamples(current, [], time)
    expect(samples).toEqual({ points: [{ capturedAt: new Date(time).toISOString(), onlineCount: "0" }], source: "current", provisionalTime: true })
    expect(current.recentTrend).toEqual([])
    expect(liveChartSamples({ ...current, onlineCount: undefined }, [], time).source).toBe("empty")
    expect(liveChartSamples({ ...current, lastSnapshotAt: point.capturedAt }, [], time + 1000).provisionalTime).toBe(false)
  })

  it("does not treat a history containing missing heat as empty or overwrite its null fact", () => {
    const { onlineCount: _, ...missing } = point
    const samples = liveChartSamples(room, [missing], time)
    expect(samples.source).toBe("history")
    expect(samples.points).toEqual([missing])
    expect(Object.hasOwn(samples.points[0]!, "onlineCount")).toBe(false)
  })

  it("uses exact original chart heights and selection-count help", () => {
    expect([1, 2, 3, 4].map(count => Array.from({ length: count }, (_, index) => liveChartHeight(count, index))))
      .toEqual([[420], [320, 320], [420, 200, 200], [240, 240, 240, 240]])
    expect(liveTrendHelp(3)).toContain("先选中")
    expect(liveTrendHelp(0)).toContain("最多同时查看4个房间")
  })

  it("preserves the original constant/small-change/magnitude floors instead of stretching every change", () => {
    expect(trendValueBounds([100])).toMatchObject({ min: 95, max: 105 })
    expect(trendValueBounds([10000, 10010])).toMatchObject({ min: 9957, max: 10053 })
    expect(trendValueBounds([100_000_000])).toMatchObject({ min: 99_997_935, max: 100_002_065 })
    expect(trendValueBounds([10000, 10010]).span).toBeCloseTo(94.4)
  })

  it("preserves signed counts, zero lower bound and an empty geometry without NaN", () => {
    expect(trendValueBounds([-20, -10])).toMatchObject({ min: -28, max: -2 })
    expect(trendValueBounds([-10, 10])).toMatchObject({ min: -26, max: 26 })
    expect(trendValueBounds([0])).toMatchObject({ min: 0, max: 5 })
    expect(trendValueBounds([NaN, Infinity])).toEqual({ min: 0, max: 1, span: 0 })
  })

  it("pads singleton and irregular time ranges with the source 30min/30sec/60sec/4percent rules", () => {
    expect(trendTimeBounds([time])).toEqual({ min: time - 1_800_000, max: time + 1_800_000, span: 3_600_000 })
    expect(trendTimeBounds([0, 10000])).toEqual({ min: -30000, max: 40000, span: 70000 })
    expect(trendTimeBounds([0, 120000])).toEqual({ min: -60000, max: 180000, span: 240000 })
    expect(trendTimeBounds([0, 3_600_000])).toEqual({ min: -144000, max: 3_744_000, span: 3_888_000 })
    expect(trendTimeBounds([])).toEqual({ min: 0, max: 1, span: 0 })
  })

  it("formats precise wan and yi thresholds without changing follower compact formatting", () => {
    expect(formatTrendAxisNumber(10023, 94.4, true)).toBe("1.002万")
    expect(formatTrendAxisNumber(12345, 1000, true)).toBe("1.23万")
    expect(formatTrendAxisNumber(12345, 200000, true)).toBe("1.2万")
    expect(formatTrendAxisNumber(123_456_789, 1000, true)).toBe("1.235亿")
    expect(formatTrendAxisNumber(123_456_789, 10_000_000, true)).toBe("1.23亿")
    expect(formatTrendAxisNumber(123_456_789, 1_000_000_000, true)).toBe("1.2亿")
    expect(formatTrendAxisNumber(10023, 94.4)).toBe("1万")
    // Preserve original Number.toFixed binary rounding, not decimal arithmetic rounding.
    expect(formatTrendAxisNumber(-12345, 94.4, true)).toBe("-1.234万")
    expect(formatTrendAxisNumber(0, 0, true)).toBe("0")
  })

  it("changes time tick precision at the original two-minute and one-day boundaries", () => {
    expect(formatLiveTrendTime(time, 119999).split(":" )).toHaveLength(3)
    expect(formatLiveTrendTime(time, 120000).split(":" )).toHaveLength(2)
    expect(formatLiveTrendTime(time, 86_400_001)).toContain("09/13")
    expect(formatLiveTrendTime(time)).toContain("09/13")
    expect(formatLiveTrendTime(NaN)).toBe("时间不可用")
  })
})
