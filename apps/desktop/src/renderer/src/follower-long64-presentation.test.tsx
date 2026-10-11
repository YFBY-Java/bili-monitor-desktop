import type { BilibiliFollowerMonitorV2, BilibiliSubjectTrendV3, BilibiliSubjectWorkbenchV3 } from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import * as presentation from "./follower-monitor-presentation"
import * as axis from "./follower-trend-presentation"
import { FollowerTrendChart } from "./FollowerTrendChart"
import { BilibiliSubjectWorkbenchView } from "./BilibiliSubjectWorkspace"

const timestamp = "2026-10-05T01:00:00.000Z"
const next = "2026-10-05T01:01:00.000Z"
const id = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
const user: BilibiliFollowerMonitorV2 = { id, mid: "2", nickname: "Long64用户", profileUrl: "https://space.bilibili.com/2",
  currentFollowerCount: "9223372036854775807", deltaSincePrevious: "-9223372036854775808", monitorStatus: "ACTIVE",
  intervalSeconds: 300, recentTrend: [], version: 1 }

describe("exact Long64 renderer presentation", () => {
  it.each([
    ["9007199254740993", "9,007,199,254,740,993"],
    ["9223372036854775807", "9,223,372,036,854,775,807"],
    ["-9223372036854775808", "-9,223,372,036,854,775,808"],
    ["0", "0"]
  ])("groups the exact wire value %s", (value, expected) => {
    expect(presentation.formatFollowerCount(value)).toBe(expected)
    expect(presentation.formatFollowerCount(BigInt(value))).toBe(expected)
  })
  it("rounds compact BigInt values without converting their magnitude to Number", () => {
    expect(presentation.formatShortFollowerCount(9223372036854775807n)).toBe("92233720368.5亿")
    expect(presentation.formatShortFollowerCount(-9223372036854775808n)).toBe("-92233720368.5亿")
    expect(presentation.formatShortFollowerCount(100500n)).toBe("10.1万")
    expect(presentation.formatFollowerDelta(-100500n)).toBe("-10.1万")
    expect(presentation.formatFollowerDelta("1")).toBe("+1")
    expect(presentation.formatFollowerDelta("0")).toBe("0")
    expect(presentation.formatFollowerCount(undefined)).toBe("—")
    expect(presentation.formatFollowerDelta(undefined)).toBe("—")
  })
  it("sums counts and deltas with an unbounded display accumulator, not Long wrap or string concatenation", () => {
    const result = presentation.followerSummary([user, { ...user, id: "018f0f39-7b5e-4cc1-862d-9a208b3d0801" }])
    expect(result.totalFollowers).toBe(18446744073709551614n)
    expect(result.totalDelta).toBe(-18446744073709551616n)
    expect(presentation.formatFollowerCount(result.totalFollowers)).toBe("18,446,744,073,709,551,614")
    expect(presentation.followerSummary([]).totalFollowers).toBe(0n)
  })
  it("keeps a tiny range at a huge base exact in bounds, ticks and display coordinates", () => {
    const values = ["9223372036854775805", "9223372036854775806", "9223372036854775807"]
    const bounds = axis.followerValueBounds(values)
    expect(typeof bounds.min).toBe("bigint")
    expect(bounds.min).toBeLessThanOrEqual(BigInt(values[0]!))
    expect(bounds.max).toBeGreaterThanOrEqual(BigInt(values[2]!))
    expect(bounds.span).toBeLessThan(20n)
    expect(axis).toHaveProperty("followerValueRatio")
    expect(axis).toHaveProperty("followerValueTicks")
    const ratios = values.map(value => axis.followerValueRatio(BigInt(value), bounds))
    expect(ratios[0]).toBeLessThan(ratios[1]!)
    expect(ratios[1]).toBeLessThan(ratios[2]!)
    const ticks = axis.followerValueTicks(bounds)
    expect(ticks.every(value => typeof value === "bigint")).toBe(true)
    expect(new Set(ticks).size).toBe(ticks.length)
    expect(axis.formatFollowerAxisNumber(9223372036854775807n, bounds.span)).toBe("9,223,372,036,854,775,807")
    expect(axis.formatFollowerAxisNumber(-9223372036854775808n, bounds.span)).toBe("-9,223,372,036,854,775,808")
  })
  it("renders exact chart titles, bounds and an unbounded negative interval difference", () => {
    const html = renderToStaticMarkup(<FollowerTrendChart nickname="Long64用户" height={300} points={[
      { capturedAt: timestamp, followerCount: "9007199254740993", sourceEndpoint: "card" },
      { capturedAt: next, followerCount: "9007199254740992", sourceEndpoint: "card" }
    ]} />)
    expect(html).toContain("粉丝 9,007,199,254,740,993")
    expect(html).toContain("最低 9,007,199,254,740,992")
    expect(html).toContain("最高 9,007,199,254,740,993")
    expect(html).toContain("区间净变化 -1")
    const heights = [...html.matchAll(/<circle[^>]+cy="([^"]+)"/g)].map(match => match[1])
    expect(new Set(heights).size).toBe(2)
    const wrapBoundary = renderToStaticMarkup(<FollowerTrendChart nickname="跨域展示" height={300} points={[
      { capturedAt: timestamp, followerCount: "-9223372036854775808", sourceEndpoint: "card" },
      { capturedAt: next, followerCount: "9223372036854775807", sourceEndpoint: "card" }
    ]} />)
    expect(wrapBoundary).toContain("区间净变化 +18,446,744,073,709,551,615")
  })
  it("renders Subject follower strings as a real series while retaining numeric live geometry", () => {
    const workbench: BilibiliSubjectWorkbenchV3 = {
      subject: { id, displayName: "Long64用户", tags: [], monitorStatus: "ACTIVE", createdAt: timestamp, updatedAt: timestamp },
      summary: { followerCount: "9223372036854775807", followerDelta24h: "-9223372036854775808", onlineCount: "200",
        healthScore: 100, enabledModuleCount: 2, totalModuleCount: 4 },
      danmu: { enabled: false, status: "disabled", recentMessages: [] }, layout: [], recentEvents: []
    }
    const trend: BilibiliSubjectTrendV3 = { subjectId: id, metrics: ["follower", "live_online"], range: "24h", bucket: "5m",
      points: [{ bucketAt: timestamp, followerCount: "9223372036854775806", liveOnlineCount: "200" },
        { bucketAt: next, followerCount: "9223372036854775807", liveOnlineCount: "100" }] }
    const html = renderToStaticMarkup(<BilibiliSubjectWorkbenchView workbench={workbench} trend={trend} loading={false} error={null}
      onBack={() => {}} onRefresh={() => {}} onToggleStatus={() => {}} onOpenBinding={() => {}} />)
    expect(html).toContain("9,223,372,036,854,775,807")
    expect(html).toContain("今日 -9,223,372,036,854,775,808")
    // The original widget uses padded independent axes and smooth lines, not
    // min/max-to-edge polylines. Adjacent Long values must still be distinct.
    expect(html).toMatch(/<path class="subject-line follower" d="M[^\"]+ C/)
    expect(html).toMatch(/<path class="subject-line live" d="M[^\"]+ C/)
    const followerPoints = [...html.matchAll(/<circle class="subject-trend-point follower"[^>]*cy="([^"]+)"[^>]*data-value="([^"]+)"/g)]
    expect(followerPoints.map(point => point[2])).toEqual(["9223372036854775806", "9223372036854775807"])
    expect(Number(followerPoints[0]?.[1])).toBeGreaterThan(Number(followerPoints[1]?.[1]))
    const heatPoints = [...html.matchAll(/<circle class="subject-trend-point live"[^>]*cy="([^"]+)"[^>]*data-value="([^"]+)"/g)]
    expect(heatPoints.map(point => point[2])).toEqual(["200", "100"])
    expect(Number(heatPoints[0]?.[1])).toBeLessThan(Number(heatPoints[1]?.[1]))
  })
})
