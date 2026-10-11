import { z } from "zod"
import * as v1 from "./bilibili-live"
import { JavaLongStringSchema } from "./java-long"

const counters = { onlineCount: JavaLongStringSchema.optional(), attentionCount: JavaLongStringSchema.optional() }
export const BilibiliLiveTrendPointV2Schema = v1.BilibiliLiveTrendPointSchema.extend(counters)
export const BilibiliLiveRoomV2Schema = v1.BilibiliLiveRoomSchema.extend({ ...counters,
  onlineDelta: JavaLongStringSchema.optional(), recentTrend: z.array(BilibiliLiveTrendPointV2Schema) })
export const BilibiliLiveRoomListV2Schema = v1.BilibiliLiveRoomListSchema.extend({ items: z.array(BilibiliLiveRoomV2Schema) })
export const BilibiliLiveStatusEventV2Schema = v1.BilibiliLiveStatusEventSchema.extend({ onlineCount: JavaLongStringSchema.optional() })
export const BilibiliLiveSummaryV2Schema = v1.BilibiliLiveSummarySchema.extend({ totalOnlineCount: JavaLongStringSchema,
  latestEvent: BilibiliLiveStatusEventV2Schema.optional() })
export const BilibiliLiveCollectResultV2Schema = v1.BilibiliLiveCollectResultSchema.extend({ onlineCount: JavaLongStringSchema.optional() })
export const BilibiliLiveRoomTrendV2Schema = v1.BilibiliLiveRoomTrendSchema.extend({ room: BilibiliLiveRoomV2Schema,
  points: z.array(BilibiliLiveTrendPointV2Schema) })
export const BilibiliLiveRoomTrendListV2Schema = z.array(BilibiliLiveRoomTrendV2Schema)
export const BilibiliLiveStatusEventListV2Schema = z.array(BilibiliLiveStatusEventV2Schema)
export const BilibiliLiveSnapshotDataV2Schema = v1.BilibiliLiveSnapshotDataSchema.extend(counters)
export const BilibiliLiveFetchedSnapshotV2Schema = v1.BilibiliLiveFetchedSnapshotSchema.extend(counters)
export const BilibiliLiveFetchedOptionalSnapshotV2Schema = v1.BilibiliLiveFetchedOptionalSnapshotSchema.extend({ snapshot: BilibiliLiveSnapshotDataV2Schema.optional() })
export const BilibiliLiveFetchedStatusBatchV2Schema = v1.BilibiliLiveFetchedStatusBatchSchema.extend({ snapshots: z.array(BilibiliLiveSnapshotDataV2Schema) })

export type BilibiliLiveTrendPointV2 = z.infer<typeof BilibiliLiveTrendPointV2Schema>
export type BilibiliLiveRoomV2 = z.infer<typeof BilibiliLiveRoomV2Schema>
export type BilibiliLiveRoomListV2 = z.infer<typeof BilibiliLiveRoomListV2Schema>
export type BilibiliLiveStatusEventV2 = z.infer<typeof BilibiliLiveStatusEventV2Schema>
export type BilibiliLiveSummaryV2 = z.infer<typeof BilibiliLiveSummaryV2Schema>
export type BilibiliLiveCollectResultV2 = z.infer<typeof BilibiliLiveCollectResultV2Schema>
export type BilibiliLiveRoomTrendV2 = z.infer<typeof BilibiliLiveRoomTrendV2Schema>
export type BilibiliLiveSnapshotDataV2 = z.infer<typeof BilibiliLiveSnapshotDataV2Schema>
export type BilibiliLiveFetchedSnapshotV2 = z.infer<typeof BilibiliLiveFetchedSnapshotV2Schema>
export type BilibiliLiveFetchedOptionalSnapshotV2 = z.infer<typeof BilibiliLiveFetchedOptionalSnapshotV2Schema>
export type BilibiliLiveFetchedStatusBatchV2 = z.infer<typeof BilibiliLiveFetchedStatusBatchV2Schema>
