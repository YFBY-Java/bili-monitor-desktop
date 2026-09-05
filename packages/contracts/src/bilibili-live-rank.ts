import { z } from "zod"

import { ObjectRefSchema } from "./bilibili-follower"
import { BilibiliLiveNumericIdSchema } from "./bilibili-live"

export const BilibiliLiveRankFamilySchema = z.enum(["AUDIENCE", "GUARD"])
export const BilibiliLiveRankEndpointSchema = z.enum([
  "xlive/general-interface/v1/rank/queryContributionRank",
  "xlive/general-interface/v1/rank/getOnlineGoldRank",
  "xlive/app-room/v2/guardTab/topListNew"
])

export const BilibiliLiveRankEntrySchema = z.object({
  userUid: BilibiliLiveNumericIdSchema.optional(),
  rankNo: z.number().int().positive().optional(),
  entryKind: z.string().trim().min(1).max(32),
  displayName: z.string().max(512).optional(),
  faceUrl: z.url().optional(),
  score: z.number().int().nonnegative().optional(),
  guardLevel: z.number().int().nonnegative().optional(),
  wealthLevel: z.number().int().nonnegative().optional(),
  medalName: z.string().max(128).optional(),
  medalLevel: z.number().int().nonnegative().optional(),
  guardExpiredText: z.string().max(128).optional(),
  accompanyDays: z.number().int().nonnegative().optional()
}).strict()

export const BilibiliLiveRankSnapshotSchema = z.object({
  id: z.uuid(),
  roomMonitorId: z.uuid(),
  roomId: BilibiliLiveNumericIdSchema,
  ruid: BilibiliLiveNumericIdSchema,
  rankFamily: BilibiliLiveRankFamilySchema,
  rankType: z.string().trim().min(1).max(64),
  rankSwitch: z.string().trim().min(1).max(64).optional(),
  periodScope: z.string().trim().min(1).max(32).optional(),
  pageNo: z.number().int().min(1).max(5),
  pageSize: z.number().int().min(1).max(100),
  totalCount: z.number().int().nonnegative().optional(),
  countText: z.string().max(64).optional(),
  valueText: z.string().max(64).optional(),
  remindMsg: z.string().max(512).optional(),
  sourceEndpoint: BilibiliLiveRankEndpointSchema,
  signedRequired: z.boolean(),
  capturedAt: z.iso.datetime(),
  entries: z.array(BilibiliLiveRankEntrySchema).max(200)
}).strict()

export const BilibiliLiveRankSummarySchema = z.object({
  roomMonitorId: z.uuid(),
  roomId: BilibiliLiveNumericIdSchema,
  ruid: BilibiliLiveNumericIdSchema,
  audienceCount: z.number().int().nonnegative().optional(),
  audienceCountText: z.string().max(64).optional(),
  guardCount: z.number().int().nonnegative().optional(),
  guardCountText: z.string().max(64).optional(),
  updatedAt: z.iso.datetime().optional(),
  snapshots: z.array(BilibiliLiveRankSnapshotSchema)
}).strict()

export const BilibiliLiveRankLatestInputSchema = z.object({
  roomMonitorId: z.uuid(),
  family: BilibiliLiveRankFamilySchema.optional(),
  type: z.string().trim().min(1).max(64).optional(),
  rankSwitch: z.string().trim().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(200).default(50)
}).strict()

export const BilibiliLiveRankRefreshInputSchema = z.object({
  roomMonitorId: z.uuid(),
  families: z.array(BilibiliLiveRankFamilySchema).default([]),
  types: z.array(z.string().trim().min(1).max(64)).default([]),
  maxPages: z.number().int().min(1).max(5).default(1),
  force: z.boolean().default(false)
}).strict()

export const BilibiliLiveRankRefreshResultSchema = z.object({
  roomMonitorId: z.uuid(),
  successCount: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  summary: BilibiliLiveRankSummarySchema
}).strict()

export const BilibiliLiveRankWorkerRequestSchema = z.object({
  taskId: z.string().min(1),
  attempt: z.number().int().positive(),
  leaseId: z.string().min(1),
  roomId: BilibiliLiveNumericIdSchema,
  ruid: BilibiliLiveNumericIdSchema,
  family: BilibiliLiveRankFamilySchema,
  type: z.string().trim().min(1).max(64),
  rankSwitch: z.string().trim().min(1).max(64).optional(),
  periodScope: z.string().trim().min(1).max(32).optional(),
  guardTyp: z.number().int().min(1).max(4).optional(),
  page: z.number().int().min(1).max(5),
  pageSize: z.number().int().min(1).max(100),
  endpoint: BilibiliLiveRankEndpointSchema.optional(),
  forceRefreshWbi: z.boolean().default(false)
}).strict()

export const BilibiliLiveRankFetchedSnapshotSchema = z.object({
  rankFamily: BilibiliLiveRankFamilySchema,
  rankType: z.string().trim().min(1).max(64),
  rankSwitch: z.string().trim().min(1).max(64).optional(),
  periodScope: z.string().trim().min(1).max(32).optional(),
  pageNo: z.number().int().min(1).max(5),
  pageSize: z.number().int().min(1).max(100),
  totalCount: z.number().int().nonnegative().optional(),
  countText: z.string().max(64).optional(),
  valueText: z.string().max(64).optional(),
  remindMsg: z.string().max(512).optional(),
  sourceEndpoint: BilibiliLiveRankEndpointSchema,
  signedRequired: z.boolean(),
  capturedAt: z.iso.datetime(),
  entries: z.array(BilibiliLiveRankEntrySchema).max(200),
  evidenceObject: ObjectRefSchema,
  statusCode: z.number().int().positive(),
  durationMs: z.number().int().nonnegative()
}).strict()

export type BilibiliLiveRankFamily = z.infer<typeof BilibiliLiveRankFamilySchema>
export type BilibiliLiveRankEntry = z.infer<typeof BilibiliLiveRankEntrySchema>
export type BilibiliLiveRankSnapshot = z.infer<typeof BilibiliLiveRankSnapshotSchema>
export type BilibiliLiveRankSummary = z.infer<typeof BilibiliLiveRankSummarySchema>
export type BilibiliLiveRankLatestInput = z.input<typeof BilibiliLiveRankLatestInputSchema>
export type BilibiliLiveRankRefreshInput = z.input<typeof BilibiliLiveRankRefreshInputSchema>
export type BilibiliLiveRankRefreshResult = z.infer<typeof BilibiliLiveRankRefreshResultSchema>
export type BilibiliLiveRankWorkerRequest = z.infer<typeof BilibiliLiveRankWorkerRequestSchema>
export type BilibiliLiveRankFetchedSnapshot = z.infer<typeof BilibiliLiveRankFetchedSnapshotSchema>
