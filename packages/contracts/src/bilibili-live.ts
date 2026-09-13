import { z } from "zod"

import { ObjectRefSchema } from "./bilibili-follower"

export const BilibiliLiveNumericIdSchema = z.string().trim()
  .regex(/^[1-9]\d*$/, "B站 UID/房间号必须是大于 0 的数字。")
// Public responses use 0 for an absent short number or uncategorized area.
export const BilibiliLiveAuxiliaryIdSchema = z.string().regex(/^[0-9]+$/)
export const BilibiliLiveCounterSchema = z.number().int()
export const BilibiliLiveIntervalSecondsSchema = z.number().int().min(1).max(2_592_000)
export const BilibiliLiveMonitorStatusSchema = z.enum(["ACTIVE", "PAUSED"])
export const BilibiliLiveStatusSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
export const BilibiliLiveEndpointSchema = z.enum([
  "room/v1/Room/get_status_info_by_uids",
  "room/v1/Room/room_init",
  "room/v1/Room/get_info",
  "room/v1/Room/getRoomInfoOld"
])

export const BilibiliLiveTrendPointSchema = z.object({
  roomId: BilibiliLiveNumericIdSchema,
  uid: BilibiliLiveNumericIdSchema,
  capturedAt: z.iso.datetime(),
  liveStatus: BilibiliLiveStatusSchema,
  onlineCount: BilibiliLiveCounterSchema.optional(),
  attentionCount: BilibiliLiveCounterSchema.optional(),
  sourceEndpoint: BilibiliLiveEndpointSchema
}).strict()

export const BilibiliLiveRoomSchema = z.object({
  id: z.uuid(),
  uid: BilibiliLiveNumericIdSchema,
  roomId: BilibiliLiveNumericIdSchema,
  shortId: BilibiliLiveAuxiliaryIdSchema.optional(),
  uname: z.string().min(1).max(160),
  faceUrl: z.url().optional(),
  title: z.string().optional(),
  coverUrl: z.url().optional(),
  keyframeUrl: z.url().optional(),
  areaId: BilibiliLiveAuxiliaryIdSchema.optional(),
  areaName: z.string().max(120).optional(),
  parentAreaId: BilibiliLiveAuxiliaryIdSchema.optional(),
  parentAreaName: z.string().max(120).optional(),
  liveStatus: BilibiliLiveStatusSchema,
  liveTime: z.iso.datetime().optional(),
  onlineCount: BilibiliLiveCounterSchema.optional(),
  attentionCount: BilibiliLiveCounterSchema.optional(),
  onlineDelta: z.number().int().optional(),
  monitorStatus: BilibiliLiveMonitorStatusSchema,
  intervalSeconds: BilibiliLiveIntervalSecondsSchema,
  nextCollectAt: z.iso.datetime().optional(),
  lastSnapshotAt: z.iso.datetime().optional(),
  lastSuccessAt: z.iso.datetime().optional(),
  lastErrorAt: z.iso.datetime().optional(),
  lastErrorType: z.string().min(1).optional(),
  lastErrorMessage: z.string().min(1).optional(),
  backoffUntil: z.iso.datetime().optional(),
  sourceEndpoint: BilibiliLiveEndpointSchema.optional(),
  recentTrend: z.array(BilibiliLiveTrendPointSchema),
  version: z.number().int().positive()
}).strict()

export const BilibiliLiveRoomListSchema = z.object({
  items: z.array(BilibiliLiveRoomSchema),
  total: z.number().int().nonnegative(),
  snapshotAt: z.iso.datetime()
}).strict()

export const BilibiliLiveStatusEventTypeSchema = z.enum([
  "LIVE_STARTED",
  "LIVE_ENDED",
  "ROUND_STARTED",
  "TITLE_CHANGED",
  "ERROR_OCCURRED",
  "ERROR_RECOVERED"
])

export const BilibiliLiveStatusEventSchema = z.object({
  id: z.uuid(),
  monitorId: z.uuid(),
  uid: BilibiliLiveNumericIdSchema,
  roomId: BilibiliLiveNumericIdSchema,
  eventType: BilibiliLiveStatusEventTypeSchema,
  fromLiveStatus: BilibiliLiveStatusSchema.optional(),
  toLiveStatus: BilibiliLiveStatusSchema.optional(),
  titleBefore: z.string().optional(),
  titleAfter: z.string().optional(),
  onlineCount: BilibiliLiveCounterSchema.optional(),
  occurredAt: z.iso.datetime()
}).strict()

export const BilibiliLiveSummarySchema = z.object({
  totalRooms: z.number().int().nonnegative(),
  activeRooms: z.number().int().nonnegative(),
  liveRooms: z.number().int().nonnegative(),
  roundRooms: z.number().int().nonnegative(),
  offlineRooms: z.number().int().nonnegative(),
  errorRooms: z.number().int().nonnegative(),
  totalOnlineCount: BilibiliLiveCounterSchema,
  todayLiveStarts: z.number().int().nonnegative(),
  latestEvent: BilibiliLiveStatusEventSchema.optional()
}).strict()

export const BilibiliLiveCollectResultSchema = z.object({
  roomMonitorId: z.uuid(),
  uid: BilibiliLiveNumericIdSchema,
  roomId: BilibiliLiveNumericIdSchema,
  success: z.boolean(),
  liveStatus: BilibiliLiveStatusSchema.optional(),
  onlineCount: BilibiliLiveCounterSchema.optional(),
  capturedAt: z.iso.datetime(),
  sourceEndpoint: BilibiliLiveEndpointSchema.optional(),
  message: z.string().min(1)
}).strict()

export const BilibiliLiveRoomTrendSchema = z.object({
  room: BilibiliLiveRoomSchema,
  points: z.array(BilibiliLiveTrendPointSchema)
}).strict()
export const BilibiliLiveRoomTrendListSchema = z.array(BilibiliLiveRoomTrendSchema)
export const BilibiliLiveStatusEventListSchema = z.array(BilibiliLiveStatusEventSchema)

export const AddBilibiliLiveRoomInputSchema = z.object({
  uid: BilibiliLiveNumericIdSchema.optional(),
  roomId: BilibiliLiveNumericIdSchema.optional(),
  intervalSeconds: BilibiliLiveIntervalSecondsSchema.optional()
}).strict().superRefine((value, context) => {
  if ((value.uid === undefined) === (value.roomId === undefined)) {
    context.addIssue({
      code: "custom",
      message: "请填写 UID 或房间号，二选一。"
    })
  }
})

export const ListBilibiliLiveRoomsInputSchema = z.object({
  limit: z.number().int().min(1).max(500).optional()
}).strict()

export const BilibiliLiveRoomIdInputSchema = z.object({ roomMonitorId: z.uuid() }).strict()
export const UpdateBilibiliLiveRoomStatusInputSchema = z.object({
  roomMonitorId: z.uuid(),
  enabled: z.boolean()
}).strict()
export const UpdateBilibiliLiveRoomSettingsInputSchema = z.object({
  roomMonitorId: z.uuid(),
  intervalSeconds: BilibiliLiveIntervalSecondsSchema
}).strict()
// Original service: non-positive/missing history counts become 500, positive counts cap at 2000.
const LiveHistoryLimitSchema = z.number().int().default(500)
  .transform(value => value <= 0 ? 500 : Math.min(value, 2_000))

export const QueryBilibiliLiveTrendInputSchema = z.object({
  roomMonitorId: z.uuid(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: LiveHistoryLimitSchema
}).strict()
export const QueryBilibiliLiveTrendsInputSchema = z.object({
  roomMonitorIds: z.array(z.uuid()).default([]),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limitPerRoom: LiveHistoryLimitSchema
}).strict()
export const QueryBilibiliLiveEventsInputSchema = z.object({
  limit: z.number().int().default(20).transform(value => Math.min(Math.max(value, 1), 200))
}).strict()

const BilibiliLiveWorkerRequestBaseSchema = z.object({
  taskId: z.string().min(1),
  attempt: z.number().int().positive(),
  leaseId: z.string().min(1)
})
export const BilibiliLiveRoomRequestSchema = BilibiliLiveWorkerRequestBaseSchema.extend({
  roomId: BilibiliLiveNumericIdSchema
}).strict()
export const BilibiliLiveUidRequestSchema = BilibiliLiveWorkerRequestBaseSchema.extend({
  uid: BilibiliLiveNumericIdSchema
}).strict()
export const BilibiliLiveStatusByUidsRequestSchema = BilibiliLiveWorkerRequestBaseSchema.extend({
  uids: z.array(BilibiliLiveNumericIdSchema).min(1)
}).strict()

export const BilibiliLiveSnapshotDataSchema = z.object({
  uid: BilibiliLiveNumericIdSchema,
  roomId: BilibiliLiveNumericIdSchema,
  shortId: BilibiliLiveAuxiliaryIdSchema.optional(),
  uname: z.string().min(1).max(160).optional(),
  faceUrl: z.url().optional(),
  title: z.string().optional(),
  coverUrl: z.url().optional(),
  keyframeUrl: z.url().optional(),
  areaId: BilibiliLiveAuxiliaryIdSchema.optional(),
  areaName: z.string().max(120).optional(),
  parentAreaId: BilibiliLiveAuxiliaryIdSchema.optional(),
  parentAreaName: z.string().max(120).optional(),
  liveStatus: BilibiliLiveStatusSchema,
  liveTime: z.iso.datetime().optional(),
  onlineCount: BilibiliLiveCounterSchema.optional(),
  attentionCount: BilibiliLiveCounterSchema.optional()
}).strict()

export const BilibiliLiveFetchedSnapshotSchema = BilibiliLiveSnapshotDataSchema.extend({
  fetchedAt: z.iso.datetime(),
  sourceEndpoint: BilibiliLiveEndpointSchema,
  evidenceObject: ObjectRefSchema,
  statusCode: z.number().int().positive(),
  durationMs: z.number().int().nonnegative()
}).strict()

export const BilibiliLiveFetchedOptionalSnapshotSchema = z.object({
  snapshot: BilibiliLiveSnapshotDataSchema.optional(),
  fetchedAt: z.iso.datetime(),
  sourceEndpoint: BilibiliLiveEndpointSchema,
  evidenceObject: ObjectRefSchema,
  statusCode: z.number().int().positive(),
  durationMs: z.number().int().nonnegative()
}).strict()

export const BilibiliLiveFetchedStatusBatchSchema = z.object({
  snapshots: z.array(BilibiliLiveSnapshotDataSchema),
  fetchedAt: z.iso.datetime(),
  sourceEndpoint: z.literal("room/v1/Room/get_status_info_by_uids"),
  evidenceObject: ObjectRefSchema,
  statusCode: z.number().int().positive(),
  durationMs: z.number().int().nonnegative()
}).strict()

export const DeleteBilibiliLiveRoomResultSchema = z.object({ deleted: z.literal(true) }).strict()

export type BilibiliLiveRoom = z.infer<typeof BilibiliLiveRoomSchema>
export type BilibiliLiveRoomList = z.infer<typeof BilibiliLiveRoomListSchema>
export type BilibiliLiveSummary = z.infer<typeof BilibiliLiveSummarySchema>
export type BilibiliLiveStatusEvent = z.infer<typeof BilibiliLiveStatusEventSchema>
export type BilibiliLiveCollectResult = z.infer<typeof BilibiliLiveCollectResultSchema>
export type BilibiliLiveRoomTrend = z.infer<typeof BilibiliLiveRoomTrendSchema>
export type BilibiliLiveTrendPoint = z.infer<typeof BilibiliLiveTrendPointSchema>
export type AddBilibiliLiveRoomInput = z.input<typeof AddBilibiliLiveRoomInputSchema>
export type ListBilibiliLiveRoomsInput = z.input<typeof ListBilibiliLiveRoomsInputSchema>
export type UpdateBilibiliLiveRoomStatusInput = z.input<typeof UpdateBilibiliLiveRoomStatusInputSchema>
export type UpdateBilibiliLiveRoomSettingsInput = z.input<typeof UpdateBilibiliLiveRoomSettingsInputSchema>
export type QueryBilibiliLiveTrendInput = z.input<typeof QueryBilibiliLiveTrendInputSchema>
export type QueryBilibiliLiveTrendsInput = z.input<typeof QueryBilibiliLiveTrendsInputSchema>
export type QueryBilibiliLiveEventsInput = z.input<typeof QueryBilibiliLiveEventsInputSchema>
export type BilibiliLiveRoomRequest = z.infer<typeof BilibiliLiveRoomRequestSchema>
export type BilibiliLiveUidRequest = z.infer<typeof BilibiliLiveUidRequestSchema>
export type BilibiliLiveStatusByUidsRequest = z.infer<typeof BilibiliLiveStatusByUidsRequestSchema>
export type BilibiliLiveSnapshotData = z.infer<typeof BilibiliLiveSnapshotDataSchema>
export type BilibiliLiveFetchedSnapshot = z.infer<typeof BilibiliLiveFetchedSnapshotSchema>
export type BilibiliLiveFetchedOptionalSnapshot = z.infer<typeof BilibiliLiveFetchedOptionalSnapshotSchema>
export type BilibiliLiveFetchedStatusBatch = z.infer<typeof BilibiliLiveFetchedStatusBatchSchema>
export type DeleteBilibiliLiveRoomResult = z.infer<typeof DeleteBilibiliLiveRoomResultSchema>
