import { z } from "zod"
import { BilibiliSubjectLiveRoomSchema } from "./bilibili-subject"
import { BilibiliSubjectWorkbenchV2Schema, BilibiliSubjectSummaryV2Schema,
  BilibiliSubjectTrendPointV2Schema, BilibiliSubjectTrendV2Schema } from "./bilibili-subject-v2"
import { JavaLongStringSchema } from "./java-long"
const online = { onlineCount: JavaLongStringSchema.optional(),
  onlineDelta24h: JavaLongStringSchema.optional(), onlinePeak24h: JavaLongStringSchema.optional() }
export const BilibiliSubjectLiveRoomV3Schema = BilibiliSubjectLiveRoomSchema.extend(online)
export const BilibiliSubjectSummaryV3Schema = BilibiliSubjectSummaryV2Schema.extend(online)
export const BilibiliSubjectWorkbenchV3Schema = BilibiliSubjectWorkbenchV2Schema.extend({
  summary: BilibiliSubjectSummaryV3Schema, bilibiliLiveRoom: BilibiliSubjectLiveRoomV3Schema.optional() })
export const BilibiliSubjectTrendPointV3Schema = BilibiliSubjectTrendPointV2Schema.extend({
  liveOnlineCount: JavaLongStringSchema.optional() })
export const BilibiliSubjectTrendV3Schema = BilibiliSubjectTrendV2Schema.extend({
  points: z.array(BilibiliSubjectTrendPointV3Schema) })
export type BilibiliSubjectLiveRoomV3 = z.infer<typeof BilibiliSubjectLiveRoomV3Schema>
export type BilibiliSubjectSummaryV3 = z.infer<typeof BilibiliSubjectSummaryV3Schema>
export type BilibiliSubjectWorkbenchV3 = z.infer<typeof BilibiliSubjectWorkbenchV3Schema>
export type BilibiliSubjectTrendPointV3 = z.infer<typeof BilibiliSubjectTrendPointV3Schema>
export type BilibiliSubjectTrendV3 = z.infer<typeof BilibiliSubjectTrendV3Schema>
