import { z } from "zod"
import * as v1 from "./bilibili-live-rank"
import { JavaLongStringSchema } from "./java-long"
import { BilibiliRawPayloadStorageStatusSchema } from "./bilibili-follower"

const int32 = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const entryValues = {
  userUid: JavaLongStringSchema.optional(), rankNo: int32.optional(), score: JavaLongStringSchema.optional(),
  guardLevel: int32.optional(), wealthLevel: int32.optional(), medalLevel: int32.optional(), accompanyDays: int32.optional()
}
export const BilibiliLiveRankEntryV2Schema = v1.BilibiliLiveRankEntrySchema.extend(entryValues)
export const BilibiliLiveRankSnapshotV2Schema = v1.BilibiliLiveRankSnapshotSchema.extend({
  totalCount: JavaLongStringSchema.optional(), entries: z.array(BilibiliLiveRankEntryV2Schema).max(200)
})
export const BilibiliLiveRankSummaryV2Schema = v1.BilibiliLiveRankSummarySchema.extend({
  audienceCount: JavaLongStringSchema.optional(), guardCount: JavaLongStringSchema.optional(),
  snapshots: z.array(BilibiliLiveRankSnapshotV2Schema)
})
export const BilibiliLiveRankRefreshResultV2Schema = v1.BilibiliLiveRankRefreshResultSchema.extend({
  summary: BilibiliLiveRankSummaryV2Schema
})
export const BilibiliLiveRankFetchedSnapshotV2Schema = v1.BilibiliLiveRankFetchedSnapshotSchema.extend({
  totalCount: JavaLongStringSchema.optional(),
  entries: z.array(v1.BilibiliLiveRankFetchedSnapshotSchema.shape.entries.element.extend({
    ...entryValues, medalRuid: JavaLongStringSchema.optional(), medalIsLight: int32.optional(),
    rawEntryJson: z.string().optional(), rawEntryStorageStatus: BilibiliRawPayloadStorageStatusSchema.optional()
  })).max(200)
})
export type BilibiliLiveRankEntryV2 = z.infer<typeof BilibiliLiveRankEntryV2Schema>
export type BilibiliLiveRankSnapshotV2 = z.infer<typeof BilibiliLiveRankSnapshotV2Schema>
export type BilibiliLiveRankSummaryV2 = z.infer<typeof BilibiliLiveRankSummaryV2Schema>
export type BilibiliLiveRankRefreshResultV2 = z.infer<typeof BilibiliLiveRankRefreshResultV2Schema>
export type BilibiliLiveRankFetchedSnapshotV2 = z.infer<typeof BilibiliLiveRankFetchedSnapshotV2Schema>
