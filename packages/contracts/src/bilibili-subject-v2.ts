import { z } from "zod"
import {
  BilibiliSubjectSummarySchema,
  BilibiliSubjectSchema,
  BilibiliSubjectBindingSchema,
  BilibiliSubjectTrendPointSchema,
  BilibiliSubjectTrendSchema,
  BilibiliSubjectUserSchema,
  BilibiliSubjectWorkbenchSchema
} from "./bilibili-subject"
import { JavaLongStringSchema, PositiveJavaLongStringSchema } from "./java-long"

const SubjectBindingV2Schema = BilibiliSubjectBindingSchema.extend({ mid: PositiveJavaLongStringSchema.optional() })
const SubjectV2Schema = BilibiliSubjectSchema.extend({ bilibiliBinding: SubjectBindingV2Schema.optional() })

export const BilibiliSubjectUserV2Schema = BilibiliSubjectUserSchema.extend({
  mid: PositiveJavaLongStringSchema,
  followerCount: JavaLongStringSchema.optional(),
  followingCount: JavaLongStringSchema.optional(),
  followerDelta24h: JavaLongStringSchema.optional()
})
export const BilibiliSubjectSummaryV2Schema = BilibiliSubjectSummarySchema.extend({
  followerCount: JavaLongStringSchema.optional(),
  followerDelta24h: JavaLongStringSchema.optional()
})
export const BilibiliSubjectWorkbenchV2Schema = BilibiliSubjectWorkbenchSchema.extend({
  subject: SubjectV2Schema,
  bilibiliBinding: SubjectBindingV2Schema.optional(),
  bilibiliUser: BilibiliSubjectUserV2Schema.optional(),
  summary: BilibiliSubjectSummaryV2Schema
})
export const BilibiliSubjectTrendPointV2Schema = BilibiliSubjectTrendPointSchema.extend({
  followerCount: JavaLongStringSchema.optional()
})
export const BilibiliSubjectTrendV2Schema = BilibiliSubjectTrendSchema.extend({
  points: z.array(BilibiliSubjectTrendPointV2Schema)
})

export type BilibiliSubjectUserV2 = z.infer<typeof BilibiliSubjectUserV2Schema>
export type BilibiliSubjectSummaryV2 = z.infer<typeof BilibiliSubjectSummaryV2Schema>
export type BilibiliSubjectWorkbenchV2 = z.infer<typeof BilibiliSubjectWorkbenchV2Schema>
export type BilibiliSubjectTrendPointV2 = z.infer<typeof BilibiliSubjectTrendPointV2Schema>
export type BilibiliSubjectTrendV2 = z.infer<typeof BilibiliSubjectTrendV2Schema>
