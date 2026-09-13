import type { BilibiliFollowerMonitor, BilibiliFollowerPoint } from "@bmd/contracts"

export { trendValueBounds as followerValueBounds, trendTimeBounds as followerTimeBounds, formatTrendAxisNumber as formatFollowerAxisNumber } from "./trend-axis"
export type { TrendBounds } from "./trend-axis"

export function followerChartHeight(count: number, index: number): number {
  if (count === 1) return 440
  if (count === 2) return 360
  if (count === 3) return index === 0 ? 440 : 204
  return 248
}

export function swapFollowerTrends(ids: readonly string[], sourceId: string, targetId: string): string[] {
  const next = [...ids], source = next.indexOf(sourceId), target = next.indexOf(targetId)
  if (source >= 0 && target >= 0) [next[source], next[target]] = [next[target]!, next[source]!]
  return next
}

export function followerChartPoints(user: BilibiliFollowerMonitor, fetched: readonly BilibiliFollowerPoint[] | undefined, now: number): readonly BilibiliFollowerPoint[] {
  if (fetched?.length) return fetched
  if (user.recentTrend.length) return user.recentTrend
  if (user.currentFollowerCount === undefined) return []
  // Display-only fallback from the source page; never written as a new snapshot.
  return [{ capturedAt: user.lastSnapshotAt || new Date(now).toISOString(), followerCount: user.currentFollowerCount,
    ...(user.followingCount === undefined ? {} : { followingCount: user.followingCount }), sourceEndpoint: user.sourceEndpoint || "local" }]
}
