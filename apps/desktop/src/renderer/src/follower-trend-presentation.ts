import type { BilibiliFollowerMonitor, BilibiliFollowerPoint } from "@bmd/contracts"

export interface TrendBounds { min: number; max: number; span: number }
// Original TrendChart.vue bounds: preserve scale for tiny changes and constant values.
export function followerValueBounds(values: readonly number[]): TrendBounds {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return { min: 0, max: 1, span: 0 }
  const low = Math.min(...finite), high = Math.max(...finite), center = (low + high) / 2
  const magnitude = Math.max(Math.abs(center), Math.abs(low), Math.abs(high), 1)
  const absoluteFloor = magnitude >= 1_000_000 ? 400 : magnitude >= 10_000 ? 80 : 8
  const span = Math.max((high - low) * 2.2, magnitude * 0.000035, absoluteFloor) * 1.18
  const min = low >= 0 ? Math.max(0, center - span / 2) : center - span / 2
  const max = center + span / 2
  return { min: Math.floor(min), max: Math.ceil(max), span: Math.max(1, max - min) }
}

export function followerTimeBounds(timestamps: readonly number[]): TrendBounds {
  if (!timestamps.length) return { min: 0, max: 1, span: 0 }
  const min = Math.min(...timestamps), max = Math.max(...timestamps), span = max - min
  const padding = span <= 0 ? 1_800_000 : Math.max(span * 0.04, span < 120_000 ? 30_000 : 60_000)
  return { min: min - padding, max: max + padding, span: span + 2 * padding }
}

export function formatFollowerAxisNumber(value: number, span: number): string {
  const fixed = (scale: number, digits: number) => (value / scale).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
  if (Math.abs(value) >= 100_000_000) return `${fixed(100_000_000, span > 0 && span < 10_000_000 ? 2 : 1)}亿`
  if (Math.abs(value) >= 10_000) return `${fixed(10_000, span > 0 && span / 10_000 < 10 ? 2 : 1)}万`
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value)
}

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
