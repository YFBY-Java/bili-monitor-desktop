import { z } from "zod"

import { BilibiliLiveNumericIdSchema } from "./bilibili-live"

export const BilibiliLiveDanmakuConnectionStateSchema = z.enum([
  "NOT_STARTED",
  "CONNECTING",
  "AUTHENTICATING",
  "CONNECTED",
  "CLOSED",
  "STOPPED",
  "ERROR"
])
export const BilibiliLiveDanmakuProtocolVersionSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
export const BilibiliLiveDanmakuAuthModeSchema = z.enum(["ANONYMOUS", "LOGIN"])

export const BilibiliLiveDanmakuStatusSchema = z.object({
  liveRoomMonitorId: z.uuid(),
  roomId: BilibiliLiveNumericIdSchema.optional(),
  running: z.boolean(),
  status: BilibiliLiveDanmakuConnectionStateSchema,
  connectHost: z.string().url().optional(),
  sessionId: z.uuid().optional(),
  ratePerMinute: z.number().int().nonnegative(),
  last5MinutesCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative().optional(),
  likeIncrement: z.number().int().nonnegative(),
  watchedCount: z.number().int().nonnegative().optional(),
  heartbeatPopularity: z.number().int().nonnegative().optional(),
  protocolVersion: z.number().int().min(0).max(3).optional(),
  authMode: BilibiliLiveDanmakuAuthModeSchema.optional(),
  authUid: BilibiliLiveNumericIdSchema.optional(),
  startedAt: z.iso.datetime().optional(),
  lastHeartbeatAt: z.iso.datetime().optional(),
  lastErrorAt: z.iso.datetime().optional(),
  lastErrorType: z.string().min(1).optional(),
  lastErrorMessage: z.string().min(1).optional()
}).strict()

export const BilibiliLiveDanmakuRecentSchema = z.object({
  messageText: z.string().max(500),
  senderUid: BilibiliLiveNumericIdSchema.optional(),
  displayName: z.string().max(160).optional(),
  medalName: z.string().max(80).optional(),
  sentAt: z.iso.datetime()
}).strict()
export const BilibiliLiveDanmakuRecentListSchema = z.array(BilibiliLiveDanmakuRecentSchema)

export const BilibiliLiveDanmakuMetricBucketSchema = z.object({
  bucketStart: z.iso.datetime(),
  bucketSeconds: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  danmuCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative().optional(),
  likeIncrement: z.number().int().nonnegative(),
  watchedCount: z.number().int().nonnegative().optional(),
  heartbeatPopularity: z.number().int().nonnegative().optional(),
  rawEventCount: z.number().int().nonnegative()
}).strict()
export const BilibiliLiveDanmakuMetricBucketListSchema = z.array(
  BilibiliLiveDanmakuMetricBucketSchema
)

export const StartBilibiliLiveDanmakuInputSchema = z.object({
  roomMonitorId: z.uuid(),
  protocolVersion: BilibiliLiveDanmakuProtocolVersionSchema.optional()
}).strict()
export const BilibiliLiveDanmakuRoomInputSchema = z.object({
  roomMonitorId: z.uuid()
}).strict()
export const QueryBilibiliLiveDanmakuRecentInputSchema = z.object({
  roomMonitorId: z.uuid(),
  // The original controller accepts a Java int; the service then clamps it.
  limit: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(30)
    .transform(value => Math.min(Math.max(value, 1), 200))
}).strict()
export const QueryBilibiliLiveDanmakuMetricsInputSchema = z.object({
  roomMonitorId: z.uuid(),
  // Preserve the raw input: the original service, not the transport, parses it.
  range: z.string().nullish().transform(value => value ?? "1h")
}).strict()

export type BilibiliLiveDanmakuStatus = z.infer<typeof BilibiliLiveDanmakuStatusSchema>
export type BilibiliLiveDanmakuRecent = z.infer<typeof BilibiliLiveDanmakuRecentSchema>
export type BilibiliLiveDanmakuMetricBucket = z.infer<
  typeof BilibiliLiveDanmakuMetricBucketSchema
>
export type StartBilibiliLiveDanmakuInput = z.input<
  typeof StartBilibiliLiveDanmakuInputSchema
>
export type QueryBilibiliLiveDanmakuRecentInput = z.input<
  typeof QueryBilibiliLiveDanmakuRecentInputSchema
>
export type QueryBilibiliLiveDanmakuMetricsInput = z.input<
  typeof QueryBilibiliLiveDanmakuMetricsInputSchema
>
