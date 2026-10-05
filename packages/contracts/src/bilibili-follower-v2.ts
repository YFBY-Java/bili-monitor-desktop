import { z } from "zod"
import {
  AddBilibiliFollowerMonitorInputSchema,
  BilibiliFollowerCollectResultSchema,
  BilibiliFollowerFetchedSnapshotSchema,
  BilibiliFollowerFetchRequestSchema,
  BilibiliFollowerMonitorListSchema,
  BilibiliFollowerMonitorSchema,
  BilibiliFollowerPointSchema,
  BilibiliFollowerProfileSchema,
  BilibiliFollowerTrendSchema
} from "./bilibili-follower"
import { JavaLongStringSchema, PositiveJavaLongStringSchema, javaLongToLegacyNumber } from "./java-long"

export const BilibiliFollowerProfileV2Schema = BilibiliFollowerProfileSchema.extend({
  mid: JavaLongStringSchema
})
export const BilibiliFollowerPointV2Schema = BilibiliFollowerPointSchema.extend({
  followerCount: JavaLongStringSchema,
  followingCount: JavaLongStringSchema.optional()
})
export const BilibiliFollowerMonitorV2Schema = BilibiliFollowerMonitorSchema.extend({
  mid: PositiveJavaLongStringSchema,
  currentFollowerCount: JavaLongStringSchema.optional(),
  followingCount: JavaLongStringSchema.optional(),
  deltaSincePrevious: JavaLongStringSchema.optional(),
  recentTrend: z.array(BilibiliFollowerPointV2Schema)
})
export const BilibiliFollowerMonitorListV2Schema = BilibiliFollowerMonitorListSchema.extend({
  items: z.array(BilibiliFollowerMonitorV2Schema)
})
export const BilibiliFollowerTrendV2Schema = BilibiliFollowerTrendSchema.extend({
  user: BilibiliFollowerMonitorV2Schema,
  points: z.array(BilibiliFollowerPointV2Schema)
})
export const BilibiliFollowerTrendListV2Schema = z.array(BilibiliFollowerTrendV2Schema)
export const BilibiliFollowerCollectResultV2Schema = BilibiliFollowerCollectResultSchema.extend({
  mid: PositiveJavaLongStringSchema,
  followerCount: JavaLongStringSchema.optional()
})
export const BilibiliFollowerFetchedSnapshotV2Schema = BilibiliFollowerFetchedSnapshotSchema.extend({
  mid: JavaLongStringSchema,
  followerCount: JavaLongStringSchema,
  followingCount: JavaLongStringSchema.optional()
})
export const BilibiliFollowerFetchRequestV2Schema = BilibiliFollowerFetchRequestSchema.extend({
  mid: PositiveJavaLongStringSchema
})
export const AddBilibiliFollowerMonitorInputV2Schema = AddBilibiliFollowerMonitorInputSchema.extend({
  mid: PositiveJavaLongStringSchema
})

export type BilibiliFollowerProfileV2 = z.infer<typeof BilibiliFollowerProfileV2Schema>
export type BilibiliFollowerPointV2 = z.infer<typeof BilibiliFollowerPointV2Schema>
export type BilibiliFollowerMonitorV2 = z.infer<typeof BilibiliFollowerMonitorV2Schema>
export type BilibiliFollowerMonitorListV2 = z.infer<typeof BilibiliFollowerMonitorListV2Schema>
export type BilibiliFollowerTrendV2 = z.infer<typeof BilibiliFollowerTrendV2Schema>
export type BilibiliFollowerTrendListV2 = z.infer<typeof BilibiliFollowerTrendListV2Schema>
export type BilibiliFollowerCollectResultV2 = z.infer<typeof BilibiliFollowerCollectResultV2Schema>
export type BilibiliFollowerFetchedSnapshotV2 = z.infer<typeof BilibiliFollowerFetchedSnapshotV2Schema>
export type BilibiliFollowerFetchRequestV2 = z.infer<typeof BilibiliFollowerFetchRequestV2Schema>
export type AddBilibiliFollowerMonitorInputV2 = z.input<typeof AddBilibiliFollowerMonitorInputV2Schema>

function pointToV1(value: BilibiliFollowerPointV2) {
  const point = BilibiliFollowerPointV2Schema.parse(value)
  return BilibiliFollowerPointSchema.parse({
    ...point,
    followerCount: javaLongToLegacyNumber(point.followerCount),
    ...(point.followingCount !== undefined ? { followingCount: javaLongToLegacyNumber(point.followingCount) } : {})
  })
}

// Explicit compatibility boundaries: never let a rounded number enter v1.
// The original v1 schemas still enforce their narrower nonnegative counts.
export function followerMonitorToV1(value: BilibiliFollowerMonitorV2) {
  const monitor = BilibiliFollowerMonitorV2Schema.parse(value)
  return BilibiliFollowerMonitorSchema.parse({
    ...monitor,
    ...(monitor.currentFollowerCount !== undefined ? { currentFollowerCount: javaLongToLegacyNumber(monitor.currentFollowerCount) } : {}),
    ...(monitor.followingCount !== undefined ? { followingCount: javaLongToLegacyNumber(monitor.followingCount) } : {}),
    ...(monitor.deltaSincePrevious !== undefined ? { deltaSincePrevious: javaLongToLegacyNumber(monitor.deltaSincePrevious) } : {}),
    recentTrend: monitor.recentTrend.map(pointToV1)
  })
}

export function followerSnapshotToV1(value: BilibiliFollowerFetchedSnapshotV2) {
  const snapshot = BilibiliFollowerFetchedSnapshotV2Schema.parse(value)
  return BilibiliFollowerFetchedSnapshotSchema.parse({
    ...snapshot,
    followerCount: javaLongToLegacyNumber(snapshot.followerCount),
    ...(snapshot.followingCount !== undefined ? { followingCount: javaLongToLegacyNumber(snapshot.followingCount) } : {})
  })
}

export function followerCollectResultToV1(value: BilibiliFollowerCollectResultV2) {
  const result = BilibiliFollowerCollectResultV2Schema.parse(value)
  return BilibiliFollowerCollectResultSchema.parse({
    ...result,
    ...(result.followerCount !== undefined ? { followerCount: javaLongToLegacyNumber(result.followerCount) } : {})
  })
}

export function followerTrendToV1(value: BilibiliFollowerTrendV2) {
  const trend = BilibiliFollowerTrendV2Schema.parse(value)
  return BilibiliFollowerTrendSchema.parse({
    user: followerMonitorToV1(trend.user),
    points: trend.points.map(pointToV1)
  })
}

export function followerMonitorListToV1(value: BilibiliFollowerMonitorListV2) {
  const list = BilibiliFollowerMonitorListV2Schema.parse(value)
  return BilibiliFollowerMonitorListSchema.parse({ ...list, items: list.items.map(followerMonitorToV1) })
}
