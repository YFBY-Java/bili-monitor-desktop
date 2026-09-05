import { z } from "zod"

export const BilibiliUidSchema = z.string().trim().regex(/^[1-9]\d*$/, "Bilibili UID 必须是大于 0 的数字。")
export const BilibiliFollowerIntervalSecondsSchema = z.number().int().min(1).max(2_592_000)
export const BilibiliFollowerMonitorStatusSchema = z.enum(["ACTIVE", "PAUSED"])

export const ObjectRefSchema = z.object({
  objectId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  relativePath: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string().min(1)
}).strict()

export const BilibiliFollowerPointSchema = z.object({
  capturedAt: z.iso.datetime(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative().optional(),
  sourceEndpoint: z.string().min(1)
}).strict()

export const BilibiliFollowerMonitorSchema = z.object({
  id: z.uuid(),
  mid: BilibiliUidSchema,
  nickname: z.string().trim().min(1).max(160),
  avatarUrl: z.url().optional(),
  profileUrl: z.url(),
  currentFollowerCount: z.number().int().nonnegative().optional(),
  followingCount: z.number().int().nonnegative().optional(),
  deltaSincePrevious: z.number().int().optional(),
  growthRateSincePrevious: z.number().optional(),
  lastSnapshotAt: z.iso.datetime().optional(),
  lastSuccessAt: z.iso.datetime().optional(),
  nextCollectAt: z.iso.datetime().optional(),
  monitorStatus: BilibiliFollowerMonitorStatusSchema,
  intervalSeconds: BilibiliFollowerIntervalSecondsSchema,
  lastErrorType: z.string().min(1).optional(),
  lastErrorMessage: z.string().min(1).optional(),
  lastErrorAt: z.iso.datetime().optional(),
  sourceEndpoint: z.string().min(1).optional(),
  recentTrend: z.array(BilibiliFollowerPointSchema),
  version: z.number().int().positive()
}).strict()

export const BilibiliFollowerMonitorListSchema = z.object({
  items: z.array(BilibiliFollowerMonitorSchema),
  total: z.number().int().nonnegative(),
  snapshotAt: z.iso.datetime()
}).strict()

export const BilibiliFollowerTrendSchema = z.object({
  user: BilibiliFollowerMonitorSchema,
  points: z.array(BilibiliFollowerPointSchema)
}).strict()

export const BilibiliFollowerTrendListSchema = z.array(BilibiliFollowerTrendSchema)

export const BilibiliFollowerCollectResultSchema = z.object({
  userId: z.uuid(),
  mid: BilibiliUidSchema,
  success: z.boolean(),
  followerCount: z.number().int().nonnegative().optional(),
  capturedAt: z.iso.datetime(),
  sourceEndpoint: z.string().min(1).optional(),
  message: z.string().min(1)
}).strict()

export const DeleteBilibiliFollowerMonitorResultSchema = z.object({
  deleted: z.literal(true)
}).strict()

export const AddBilibiliFollowerMonitorInputSchema = z.object({
  mid: BilibiliUidSchema,
  intervalSeconds: BilibiliFollowerIntervalSecondsSchema.optional()
}).strict()

export const ListBilibiliFollowerMonitorsInputSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100)
}).strict()

export const BilibiliFollowerMonitorIdInputSchema = z.object({
  userId: z.uuid()
}).strict()

export const RefreshBilibiliFollowerMonitorInputSchema = BilibiliFollowerMonitorIdInputSchema

export const UpdateBilibiliFollowerMonitorStatusInputSchema = z.object({
  userId: z.uuid(),
  enabled: z.boolean()
}).strict()

export const UpdateBilibiliFollowerMonitorSettingsInputSchema = z.object({
  userId: z.uuid(),
  intervalSeconds: BilibiliFollowerIntervalSecondsSchema
}).strict()

export const QueryBilibiliFollowerTrendInputSchema = z.object({
  userId: z.uuid(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.number().int().min(1).max(2_000).default(500)
}).strict()

export const QueryBilibiliFollowerTrendsInputSchema = z.object({
  userIds: z.array(z.uuid()).max(100).default([]),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limitPerUser: z.number().int().min(1).max(2_000).default(500)
}).strict()

export const BilibiliFollowerFetchRequestSchema = z.object({
  taskId: z.string().min(1),
  attempt: z.number().int().positive(),
  leaseId: z.string().min(1),
  mid: BilibiliUidSchema
}).strict()

export const BilibiliFollowerFetchedSnapshotSchema = z.object({
  mid: BilibiliUidSchema,
  nickname: z.string().trim().min(1).max(160).optional(),
  avatarUrl: z.url().optional(),
  profileUrl: z.url(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative().optional(),
  fetchedAt: z.iso.datetime(),
  sourceEndpoint: z.enum(["x/web-interface/card", "x/relation/stat"]),
  evidenceObject: ObjectRefSchema,
  statusCode: z.number().int().positive(),
  durationMs: z.number().int().nonnegative()
}).strict()

export type BilibiliFollowerMonitor = z.infer<typeof BilibiliFollowerMonitorSchema>
export type BilibiliFollowerMonitorList = z.infer<typeof BilibiliFollowerMonitorListSchema>
export type BilibiliFollowerPoint = z.infer<typeof BilibiliFollowerPointSchema>
export type BilibiliFollowerTrend = z.infer<typeof BilibiliFollowerTrendSchema>
export type BilibiliFollowerCollectResult = z.infer<typeof BilibiliFollowerCollectResultSchema>
export type DeleteBilibiliFollowerMonitorResult = z.infer<typeof DeleteBilibiliFollowerMonitorResultSchema>
export type AddBilibiliFollowerMonitorInput = z.input<typeof AddBilibiliFollowerMonitorInputSchema>
export type ListBilibiliFollowerMonitorsInput = z.input<typeof ListBilibiliFollowerMonitorsInputSchema>
export type RefreshBilibiliFollowerMonitorInput = z.input<typeof RefreshBilibiliFollowerMonitorInputSchema>
export type UpdateBilibiliFollowerMonitorStatusInput = z.input<typeof UpdateBilibiliFollowerMonitorStatusInputSchema>
export type UpdateBilibiliFollowerMonitorSettingsInput = z.input<typeof UpdateBilibiliFollowerMonitorSettingsInputSchema>
export type QueryBilibiliFollowerTrendInput = z.input<typeof QueryBilibiliFollowerTrendInputSchema>
export type QueryBilibiliFollowerTrendsInput = z.input<typeof QueryBilibiliFollowerTrendsInputSchema>
export type BilibiliFollowerFetchRequest = z.infer<typeof BilibiliFollowerFetchRequestSchema>
export type BilibiliFollowerFetchedSnapshot = z.infer<typeof BilibiliFollowerFetchedSnapshotSchema>
export type ObjectRef = z.infer<typeof ObjectRefSchema>
