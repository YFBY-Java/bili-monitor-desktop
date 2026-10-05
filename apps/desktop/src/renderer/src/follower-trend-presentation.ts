import type { BilibiliFollowerMonitorV2, BilibiliFollowerPointV2 } from "@bmd/contracts"
import { formatFollowerCount, formatFollowerFixed } from "./follower-monitor-presentation"

export { trendTimeBounds as followerTimeBounds } from "./trend-axis"
export type { TrendBounds } from "./trend-axis"

export interface FollowerLongBounds { min: bigint; max: bigint; span: bigint }
const absolute = (value: bigint) => value < 0n ? -value : value
const maximum = (...values: bigint[]) => values.reduce((result, value) => value > result ? value : result)
const floorDivide = (value: bigint, divisor: bigint) => value / divisor - (value % divisor < 0n ? 1n : 0n)

export function followerValueBounds(values: readonly (string | bigint)[]): FollowerLongBounds {
  if (!values.length) return { min: 0n, max: 1n, span: 0n }
  const exact = values.map(value => BigInt(value))
  const low = exact.reduce((result, value) => value < result ? value : result)
  const high = exact.reduce((result, value) => value > result ? value : result)
  const magnitude = maximum(absolute(low), absolute(high), 1n)
  const unsafeBase = magnitude > BigInt(Number.MAX_SAFE_INTEGER)
  // Keep the original safe-value padded scale. At an unsafe large base, using
  // magnitude as padding would erase a real one-unit change from the display.
  const floor = unsafeBase ? 8n : magnitude >= 1_000_000n ? 400n : magnitude >= 10_000n ? 80n : 8n
  const scaledSpan = maximum((high - low) * 440_000n, unsafeBase ? 0n : magnitude * 7n, floor * 200_000n) * 118n
  const denominator = 20_000_000n
  const lower = floorDivide((low + high) * denominator - scaledSpan, 2n * denominator)
  const upper = -floorDivide(-((low + high) * denominator + scaledSpan), 2n * denominator)
  const min = low >= 0n && lower < 0n ? 0n : lower
  return { min, max: upper, span: maximum(1n, upper - min) }
}

export function followerValueRatio(value: bigint, bounds: FollowerLongBounds): number {
  const span = bounds.max - bounds.min
  if (span <= 0n) return 0
  const offset = value - bounds.min
  const bounded = offset < 0n ? 0n : offset > span ? span : offset
  // The only Number conversion is a bounded display coordinate, never a count.
  return Number(bounded * 1_000_000_000n / span) / 1_000_000_000
}

export function followerValueTicks(bounds: FollowerLongBounds): bigint[] {
  return [...new Set(Array.from({ length: 5 }, (_, index) =>
    bounds.min + ((bounds.max - bounds.min) * BigInt(index) + 2n) / 4n))]
}

export function formatFollowerAxisNumber(value: bigint, span: bigint): string {
  const magnitude = absolute(value)
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) return formatFollowerCount(value)
  if (magnitude >= 100_000_000n) return `${formatFollowerFixed(value, 100_000_000n, span > 0n && span < 10_000_000n ? 2 : 1, true)}亿`
  if (magnitude >= 10_000n) return `${formatFollowerFixed(value, 10_000n, span > 0n && span < 100_000n ? 2 : 1, true)}万`
  return formatFollowerCount(value)
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

export function followerChartPoints(user: BilibiliFollowerMonitorV2, fetched: readonly BilibiliFollowerPointV2[] | undefined, now: number): readonly BilibiliFollowerPointV2[] {
  if (fetched?.length) return fetched
  if (user.recentTrend.length) return user.recentTrend
  if (user.currentFollowerCount === undefined) return []
  // Display-only fallback from the source page; never written as a new snapshot.
  return [{ capturedAt: user.lastSnapshotAt || new Date(now).toISOString(), followerCount: user.currentFollowerCount,
    ...(user.followingCount === undefined ? {} : { followingCount: user.followingCount }), sourceEndpoint: user.sourceEndpoint || "local" }]
}
