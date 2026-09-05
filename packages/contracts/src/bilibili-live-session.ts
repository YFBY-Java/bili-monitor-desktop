import { z } from "zod"

import { BilibiliLiveNumericIdSchema } from "./bilibili-live"

export const BilibiliLiveSessionStateSchema = z.enum([
  "OPEN",
  "END_PENDING",
  "CLOSED",
  "INCOMPLETE"
])
export const BilibiliLiveSessionCoverageSchema = z.enum([
  "BOUNDARY_ONLY",
  "NO_ONLINE_COVERAGE",
  "RECEIVED_WHILE_ONLINE"
])
export const BilibiliLiveSessionEventKindSchema = z.enum([
  "DANMAKU",
  "GIFT",
  "SUPER_CHAT",
  "GUARD_BUY"
])

const NullableCountSchema = z.number().int().nonnegative().nullable()

export const BilibiliLiveSessionSummarySchema = z.object({
  id: z.uuid(),
  monitorId: z.uuid(),
  uid: BilibiliLiveNumericIdSchema,
  roomId: BilibiliLiveNumericIdSchema,
  state: BilibiliLiveSessionStateSchema,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  startSource: z.string().min(1),
  endSource: z.string().min(1).nullable(),
  coverageStatus: BilibiliLiveSessionCoverageSchema,
  transportSessionCount: z.number().int().nonnegative(),
  captureStartedAt: z.iso.datetime().nullable(),
  captureEndedAt: z.iso.datetime().nullable(),
  danmakuCount: NullableCountSchema,
  giftEventCount: NullableCountSchema,
  giftCount: NullableCountSchema,
  freeGiftCount: NullableCountSchema,
  giftSenderCount: NullableCountSchema,
  paidUserCount: NullableCountSchema,
  interactingUserCount: NullableCountSchema,
  unresolvedInteractingEventCount: NullableCountSchema,
  unresolvedGiftEventCount: NullableCountSchema,
  unresolvedPaidEventCount: NullableCountSchema,
  paidEventCount: NullableCountSchema,
  paidAmountMilliYuan: NullableCountSchema,
  firstEventAt: z.iso.datetime().nullable(),
  lastEventAt: z.iso.datetime().nullable()
}).strict()
export const BilibiliLiveSessionSummaryListSchema = z.array(BilibiliLiveSessionSummarySchema)

export const BilibiliLiveSessionEventSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  eventKind: BilibiliLiveSessionEventKindSchema,
  command: z.string().nullable(),
  senderUid: BilibiliLiveNumericIdSchema.nullable(),
  senderName: z.string().nullable(),
  medalName: z.string().nullable(),
  messageText: z.string().nullable(),
  giftId: BilibiliLiveNumericIdSchema.nullable(),
  giftName: z.string().nullable(),
  giftCount: z.number().int().nonnegative().nullable(),
  paid: z.boolean(),
  paidAmountMilliYuan: z.number().int().nonnegative().nullable(),
  guardLevel: z.number().int().nonnegative().nullable(),
  occurredAt: z.iso.datetime(),
  receivedAt: z.iso.datetime()
}).strict()

export const BilibiliLiveSessionEventPageSchema = z.object({
  items: z.array(BilibiliLiveSessionEventSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  size: z.number().int().positive()
}).strict()

export const BilibiliLiveSessionUserSchema = z.object({
  actorKey: z.string().min(1),
  identityQuality: z.enum(["VERIFIED_UID", "UNRESOLVED_EVENT"]),
  userUid: BilibiliLiveNumericIdSchema.nullable(),
  displayName: z.string().nullable(),
  danmakuCount: z.number().int().nonnegative(),
  giftEventCount: z.number().int().nonnegative(),
  giftCount: z.number().int().nonnegative(),
  freeGiftCount: z.number().int().nonnegative(),
  paidEventCount: z.number().int().nonnegative(),
  paidAmountMilliYuan: z.number().int().nonnegative(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime()
}).strict()
export const BilibiliLiveSessionUserListSchema = z.array(BilibiliLiveSessionUserSchema)

export const BilibiliLiveSessionInsightSchema = z.object({
  sessionId: z.uuid(),
  bucketSeconds: z.union([z.literal(60), z.literal(300), z.literal(900)]),
  kpis: z.object({
    danmakuPerMinute: z.number().nonnegative().nullable(),
    payerConversionRate: z.number().nonnegative().nullable(),
    arppuMilliYuan: NullableCountSchema,
    paidAmountMilliYuan: NullableCountSchema,
    topFiveRevenueShare: z.number().nonnegative().nullable()
  }).strict(),
  timeline: z.array(z.object({
    bucketStart: z.iso.datetime(),
    danmakuCount: z.number().int().nonnegative(),
    paidEventCount: z.number().int().nonnegative(),
    paidAmountMilliYuan: z.number().int().nonnegative(),
    activeUserCount: z.number().int().nonnegative()
  }).strict()),
  peaks: z.array(z.object({
    type: z.enum(["INTERACTION", "REVENUE"]),
    bucketStart: z.iso.datetime(),
    value: z.number().int().nonnegative(),
    label: z.string().min(1)
  }).strict()),
  userSegments: z.array(z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    userCount: z.number().int().nonnegative(),
    description: z.string().min(1)
  }).strict()),
  giftMix: z.array(z.object({
    giftName: z.string().min(1),
    eventKind: z.string().min(1),
    giftCount: z.number().int().nonnegative(),
    paidAmountMilliYuan: z.number().int().nonnegative(),
    revenueShare: z.number().nonnegative()
  }).strict()),
  findings: z.array(z.object({
    code: z.string().min(1),
    level: z.enum(["INFO", "OPPORTUNITY", "RISK"]),
    title: z.string().min(1),
    description: z.string().min(1)
  }).strict()),
  danmakuDepth: z.object({
    identifiedDanmakuUserCount: NullableCountSchema,
    identifiedDanmakuCount: NullableCountSchema,
    messagesPerActiveUser: z.number().nonnegative().nullable(),
    repeatInteractionRate: z.number().nonnegative().nullable(),
    sustainedParticipationRate: z.number().nonnegative().nullable(),
    duplicateMessageRate: z.number().nonnegative().nullable(),
    stages: z.array(z.object({
      code: z.string().min(1),
      label: z.string().min(1),
      danmakuCount: z.number().int().nonnegative(),
      activeUserCount: z.number().int().nonnegative(),
      messageShare: z.number().nonnegative()
    }).strict()),
    repeatedMessages: z.array(z.object({
      messageText: z.string().min(1),
      messageCount: z.number().int().nonnegative(),
      userCount: z.number().int().nonnegative()
    }).strict())
  }).strict(),
  paymentDepth: z.object({
    payerCount: NullableCountSchema,
    repeatPayerRate: z.number().nonnegative().nullable(),
    engagedPayerRate: z.number().nonnegative().nullable(),
    returningPayerRate: z.number().nonnegative().nullable(),
    medianPayerAmountMilliYuan: NullableCountSchema,
    medianConversionLagSeconds: NullableCountSchema,
    topOneRevenueShare: z.number().nonnegative().nullable(),
    spendTiers: z.array(z.object({
      code: z.string().min(1),
      label: z.string().min(1),
      userCount: z.number().int().nonnegative(),
      paidAmountMilliYuan: z.number().int().nonnegative(),
      revenueShare: z.number().nonnegative()
    }).strict())
  }).strict(),
  quality: z.object({
    coverageStatus: BilibiliLiveSessionCoverageSchema,
    coveredSeconds: z.number().int().nonnegative(),
    identityResolvedEventShare: z.number().nonnegative().nullable(),
    supportedEventCount: z.number().int().nonnegative(),
    unresolvedInteractionEventCount: z.number().int().nonnegative(),
    eventLatencyP95Millis: NullableCountSchema,
    caveat: z.string().min(1)
  }).strict()
}).strict()

export const ListBilibiliLiveSessionsInputSchema = z.object({
  roomMonitorId: z.uuid(),
  limit: z.number().int().min(1).max(100).default(20)
}).strict()
export const BilibiliLiveSessionIdInputSchema = z.object({ sessionId: z.uuid() }).strict()
export const ListBilibiliLiveSessionUsersInputSchema = z.object({
  sessionId: z.uuid(),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
export const QueryBilibiliLiveSessionEventsInputSchema = z.object({
  sessionId: z.uuid(),
  kind: BilibiliLiveSessionEventKindSchema.optional(),
  keyword: z.string().trim().max(100).optional(),
  userUid: BilibiliLiveNumericIdSchema.optional(),
  paid: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  size: z.number().int().min(1).max(100).default(50)
}).strict()
export const QueryBilibiliLiveSessionInsightInputSchema = z.object({
  sessionId: z.uuid(),
  bucketSeconds: z.union([z.literal(60), z.literal(300), z.literal(900)]).default(300)
}).strict()
export const BilibiliLiveSessionExportCategorySchema = z.enum([
  "danmaku",
  "gifts",
  "users",
  "xlsx",
  "all"
])
export const ExportBilibiliLiveSessionInputSchema = z.object({
  sessionId: z.uuid(),
  category: BilibiliLiveSessionExportCategorySchema
}).strict()
export const PreparedBilibiliLiveSessionExportSchema = z.object({
  sessionId: z.uuid(),
  category: BilibiliLiveSessionExportCategorySchema,
  temporaryPath: z.string().min(1),
  suggestedFileName: z.string().min(1),
  mediaType: z.string().min(1),
  schemaVersion: z.literal("2"),
  coverageStatus: BilibiliLiveSessionCoverageSchema
}).strict()
export const BilibiliLiveSessionExportResultSchema = z.object({
  category: BilibiliLiveSessionExportCategorySchema,
  canceled: z.boolean(),
  savedPath: z.string().min(1).optional()
}).strict()

export type BilibiliLiveSessionSummary = z.infer<typeof BilibiliLiveSessionSummarySchema>
export type BilibiliLiveSessionEvent = z.infer<typeof BilibiliLiveSessionEventSchema>
export type BilibiliLiveSessionEventPage = z.infer<typeof BilibiliLiveSessionEventPageSchema>
export type BilibiliLiveSessionUser = z.infer<typeof BilibiliLiveSessionUserSchema>
export type BilibiliLiveSessionInsight = z.infer<typeof BilibiliLiveSessionInsightSchema>
export type ListBilibiliLiveSessionsInput = z.input<typeof ListBilibiliLiveSessionsInputSchema>
export type ListBilibiliLiveSessionUsersInput = z.input<typeof ListBilibiliLiveSessionUsersInputSchema>
export type QueryBilibiliLiveSessionEventsInput = z.input<typeof QueryBilibiliLiveSessionEventsInputSchema>
export type QueryBilibiliLiveSessionInsightInput = z.input<typeof QueryBilibiliLiveSessionInsightInputSchema>
export type BilibiliLiveSessionExportCategory = z.infer<typeof BilibiliLiveSessionExportCategorySchema>
export type ExportBilibiliLiveSessionInput = z.input<typeof ExportBilibiliLiveSessionInputSchema>
export type PreparedBilibiliLiveSessionExport = z.infer<typeof PreparedBilibiliLiveSessionExportSchema>
export type BilibiliLiveSessionExportResult = z.infer<typeof BilibiliLiveSessionExportResultSchema>
