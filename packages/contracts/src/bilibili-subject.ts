import { z } from "zod"

import { BilibiliUidSchema } from "./bilibili-follower"
import {
  BilibiliLiveMonitorStatusSchema,
  BilibiliLiveCounterSchema,
  BilibiliLiveNumericIdSchema,
  BilibiliLiveStatusSchema
} from "./bilibili-live"

const OptionalUrlSchema = z.url().optional()
const OptionalDateTimeSchema = z.iso.datetime().optional()
const MonitorIdSchema = z.uuid()
// SubjectService cleans/deduplicates input tags before taking the first 12.
// Response text is already normalized with Java trim, not Unicode JS trim.
const SubjectTagSchema = z.string().min(1)
const SubjectTagsInputSchema = z.array(z.string().nullable())
const SubjectNameInputSchema = z.string().max(160).nullish().transform(value => value ?? undefined)
const SubjectTextInputSchema = z.string().nullish().transform(value => value ?? undefined)
const JsonObjectSchema = z.record(z.string(), z.unknown())
// @NotBlank validates Java whitespace without changing the original key text.
// PostgreSQL VARCHAR(80) counts characters, including supplementary code points.
const SubjectWidgetKeySchema = z.string().regex(
  /[^\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/,
  "组件 key 必须包含非 Java 空白字符。"
).refine(value => Array.from(value).length <= 80, "组件 key 不能超过 80 个字符。")

export const BilibiliSubjectStatusSchema = z.enum(["ACTIVE", "PAUSED"])
// The original binding stores List<String> verbatim, including null entries.
// A persisted extension name does not imply that its capability is implemented.
export const BilibiliSubjectCapabilitySchema = z.string().nullable()

export const BilibiliSubjectBindingSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  bilibiliUserMonitorId: MonitorIdSchema.optional(),
  bilibiliLiveRoomMonitorId: MonitorIdSchema.optional(),
  mid: BilibiliUidSchema.optional(),
  roomId: BilibiliLiveNumericIdSchema.optional(),
  enabledCapabilities: z.array(BilibiliSubjectCapabilitySchema),
  danmuEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
}).strict()

export const BilibiliSubjectSchema = z.object({
  id: z.uuid(),
  // Imported follower profiles are raw text; the database bound is characters,
  // not UTF-16 units. Manual names retain the DTO's raw UTF-16 bound below.
  displayName: z.string().min(1).refine(value => Array.from(value).length <= 160),
  avatarUrl: z.string().optional(),
  remark: z.string().optional(),
  tags: z.array(SubjectTagSchema).max(12),
  monitorStatus: BilibiliSubjectStatusSchema,
  healthScore: z.number().min(0).max(100).optional(),
  lastSuccessAt: OptionalDateTimeSchema,
  lastEventAt: OptionalDateTimeSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  bilibiliBinding: BilibiliSubjectBindingSchema.optional()
}).strict()
export const BilibiliSubjectListSchema = z.array(BilibiliSubjectSchema)
export const DeleteBilibiliSubjectResultSchema = z.object({ deleted: z.literal(true) }).strict()

export const CreateBilibiliSubjectInputSchema = z.object({
  displayName: SubjectNameInputSchema,
  avatarUrl: SubjectTextInputSchema,
  remark: SubjectTextInputSchema,
  tags: SubjectTagsInputSchema.nullish().transform(value => value ?? []),
  bilibiliUserMonitorId: MonitorIdSchema.nullish().transform(value => value ?? undefined),
  bilibiliLiveRoomMonitorId: MonitorIdSchema.nullish().transform(value => value ?? undefined),
  mid: BilibiliUidSchema.nullish().transform(value => value ?? undefined),
  roomId: BilibiliLiveNumericIdSchema.nullish().transform(value => value ?? undefined),
  danmuEnabled: z.boolean().nullish().transform(value => value ?? undefined)
}).strict().superRefine((value, context) => {
  if (
    value.displayName === undefined
    && value.bilibiliUserMonitorId === undefined
    && value.bilibiliLiveRoomMonitorId === undefined
    && value.mid === undefined
    && value.roomId === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "工作台名称或 B站绑定至少填写一项。"
    })
  }
})

export const BilibiliSubjectIdInputSchema = z.object({ subjectId: z.uuid() }).strict()
export const ListBilibiliSubjectsInputSchema = z.object({
  limit: z.number().int().min(1).optional()
}).strict()

export const UpdateBilibiliSubjectInputSchema = BilibiliSubjectIdInputSchema.extend({
  displayName: SubjectNameInputSchema,
  avatarUrl: SubjectTextInputSchema,
  remark: SubjectTextInputSchema,
  tags: SubjectTagsInputSchema.nullish().transform(value => value ?? undefined),
  enabled: z.boolean().nullish().transform(value => value ?? undefined)
}).strict()

export const UpdateBilibiliSubjectBindingInputSchema = BilibiliSubjectIdInputSchema.extend({
  bilibiliUserMonitorId: MonitorIdSchema.nullish().transform(value => value ?? undefined),
  bilibiliLiveRoomMonitorId: MonitorIdSchema.nullish().transform(value => value ?? undefined),
  mid: BilibiliUidSchema.nullish().transform(value => value ?? undefined),
  roomId: BilibiliLiveNumericIdSchema.nullish().transform(value => value ?? undefined),
  enabledCapabilities: z.array(BilibiliSubjectCapabilitySchema).nullish()
    .transform(value => value ?? undefined),
  danmuEnabled: z.boolean().nullish().transform(value => value ?? undefined)
}).strict()

export const BilibiliSubjectWidgetLayoutSchema = z.object({
  widgetKey: SubjectWidgetKeySchema,
  enabled: z.boolean(),
  position: JsonObjectSchema,
  settings: JsonObjectSchema
}).strict()

export const BilibiliSubjectLayoutItemInputSchema = z.object({
  widgetKey: SubjectWidgetKeySchema,
  enabled: z.boolean().nullish().transform(value => value ?? true),
  position: JsonObjectSchema.nullish().transform(value => value ?? {}),
  settings: JsonObjectSchema.nullish().transform(value => value ?? {})
}).strict()

export const UpdateBilibiliSubjectLayoutInputSchema = BilibiliSubjectIdInputSchema.extend({
  items: z.array(BilibiliSubjectLayoutItemInputSchema)
}).strict()

export const BilibiliSubjectUserSchema = z.object({
  monitorId: MonitorIdSchema,
  mid: BilibiliUidSchema,
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  profileUrl: OptionalUrlSchema,
  followerCount: z.number().int().nonnegative().optional(),
  followingCount: z.number().int().nonnegative().optional(),
  followerDelta24h: z.number().int().optional(),
  monitorStatus: z.enum(["ACTIVE", "PAUSED"]),
  lastSuccessAt: OptionalDateTimeSchema,
  nextCollectAt: OptionalDateTimeSchema,
  lastErrorType: z.string().optional(),
  lastErrorMessage: z.string().optional()
}).strict()

export const BilibiliSubjectLiveRoomSchema = z.object({
  monitorId: MonitorIdSchema,
  uid: BilibiliUidSchema,
  roomId: BilibiliLiveNumericIdSchema,
  uname: z.string(),
  faceUrl: z.string().optional(),
  title: z.string().optional(),
  coverUrl: z.string().optional(),
  keyframeUrl: z.string().optional(),
  areaName: z.string().optional(),
  parentAreaName: z.string().optional(),
  liveStatus: BilibiliLiveStatusSchema,
  liveTime: OptionalDateTimeSchema,
  onlineCount: BilibiliLiveCounterSchema.optional(),
  onlineDelta24h: z.number().int().optional(),
  onlinePeak24h: BilibiliLiveCounterSchema.optional(),
  monitorStatus: BilibiliLiveMonitorStatusSchema,
  lastSuccessAt: OptionalDateTimeSchema,
  nextCollectAt: OptionalDateTimeSchema,
  lastErrorType: z.string().optional(),
  lastErrorMessage: z.string().optional()
}).strict()

export const BilibiliSubjectSummarySchema = z.object({
  followerCount: z.number().int().nonnegative().optional(),
  followerDelta24h: z.number().int().optional(),
  liveStatus: BilibiliLiveStatusSchema.optional(),
  onlineCount: BilibiliLiveCounterSchema.optional(),
  onlineDelta24h: z.number().int().optional(),
  onlinePeak24h: BilibiliLiveCounterSchema.optional(),
  danmuPerMinute: z.number().int().nonnegative().optional(),
  danmuLast5Minutes: z.number().int().nonnegative().optional(),
  healthScore: z.number().min(0).max(100),
  enabledModuleCount: z.number().int().min(1).max(4),
  totalModuleCount: z.literal(4),
  lastSuccessAt: OptionalDateTimeSchema,
  nextCollectAt: OptionalDateTimeSchema
}).strict()

export const BilibiliSubjectDanmuRecentSchema = z.object({
  displayName: z.string().optional(),
  messageText: z.string(),
  medalName: z.string().optional(),
  sentAt: z.iso.datetime()
}).strict()

export const BilibiliSubjectDanmuSchema = z.object({
  enabled: z.boolean(),
  status: z.string().min(1),
  ratePerMinute: z.number().int().nonnegative().optional(),
  last5MinutesCount: z.number().int().nonnegative().optional(),
  likeIncrement: z.number().int().nonnegative().optional(),
  watchedCount: z.number().int().nonnegative().optional(),
  lastMessageAt: OptionalDateTimeSchema,
  recentMessages: z.array(BilibiliSubjectDanmuRecentSchema)
}).strict()

export const BilibiliSubjectHealthEventSchema = z.object({
  eventType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  source: z.string().min(1),
  occurredAt: z.iso.datetime(),
  level: z.enum(["info", "success", "warning", "error"])
}).strict()

export const BilibiliSubjectWorkbenchSchema = z.object({
  subject: BilibiliSubjectSchema,
  bilibiliBinding: BilibiliSubjectBindingSchema.optional(),
  bilibiliUser: BilibiliSubjectUserSchema.optional(),
  bilibiliLiveRoom: BilibiliSubjectLiveRoomSchema.optional(),
  summary: BilibiliSubjectSummarySchema,
  danmu: BilibiliSubjectDanmuSchema,
  layout: z.array(BilibiliSubjectWidgetLayoutSchema),
  recentEvents: z.array(BilibiliSubjectHealthEventSchema)
}).strict()

export const BilibiliSubjectTrendMetricSchema = z.enum(["follower", "live_online"])
export const QueryBilibiliSubjectTrendsInputSchema = BilibiliSubjectIdInputSchema.extend({
  metrics: z.array(BilibiliSubjectTrendMetricSchema).min(1).max(2)
    .default(["follower", "live_online"]),
  range: z.string().trim().regex(/^\d+[mhd]$/i).default("24h"),
  bucket: z.string().trim().regex(/^\d+[mhd]$/i).default("5m")
}).strict()

export const BilibiliSubjectTrendPointSchema = z.object({
  bucketAt: z.iso.datetime(),
  followerCount: z.number().int().nonnegative().optional(),
  liveOnlineCount: BilibiliLiveCounterSchema.optional()
}).strict()

export const BilibiliSubjectTrendSchema = z.object({
  subjectId: z.uuid(),
  metrics: z.array(BilibiliSubjectTrendMetricSchema),
  range: z.string(),
  bucket: z.string(),
  points: z.array(BilibiliSubjectTrendPointSchema)
}).strict()

export type BilibiliSubject = z.infer<typeof BilibiliSubjectSchema>
export type BilibiliSubjectBinding = z.infer<typeof BilibiliSubjectBindingSchema>
export type BilibiliSubjectWidgetLayout = z.infer<typeof BilibiliSubjectWidgetLayoutSchema>
export type BilibiliSubjectWorkbench = z.infer<typeof BilibiliSubjectWorkbenchSchema>
export type BilibiliSubjectTrend = z.infer<typeof BilibiliSubjectTrendSchema>
export type CreateBilibiliSubjectInput = z.input<typeof CreateBilibiliSubjectInputSchema>
export type UpdateBilibiliSubjectInput = z.input<typeof UpdateBilibiliSubjectInputSchema>
export type UpdateBilibiliSubjectBindingInput = z.input<
  typeof UpdateBilibiliSubjectBindingInputSchema
>
export type UpdateBilibiliSubjectLayoutInput = z.input<
  typeof UpdateBilibiliSubjectLayoutInputSchema
>
export type QueryBilibiliSubjectTrendsInput = z.input<
  typeof QueryBilibiliSubjectTrendsInputSchema
>
