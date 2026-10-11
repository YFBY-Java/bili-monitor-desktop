import { z } from "zod"

export const RUNTIME_PROTOCOL_VERSION = 1 as const
export const REQUEST_KEEP_ALIVE_INTERVAL_MS = 5_000
export const LIVE_HTTP_WORKER_REQUESTS = ["bilibili.live.fetch-room-init", "bilibili.live.fetch-room-info",
  "bilibili.live.fetch-room-info-old", "bilibili.live.fetch-status-by-uids", "bilibili.live.rank.fetch", "bilibili.live.rank.fetch.v2",
  "bilibili.live.fetch-room-init.v2", "bilibili.live.fetch-room-info.v2",
  "bilibili.live.fetch-room-info-old.v2", "bilibili.live.fetch-status-by-uids.v2"] as const
export const LIVE_HTTP_CORE_REQUESTS = ["bilibili-live.rooms.add.v2", "bilibili-live.rooms.refresh.v2","bilibili-live.rooms.add", "bilibili-live.rooms.refresh",
  "bilibili-subjects.create", "bilibili-subjects.bind", "bilibili-live.ranks.refresh", "bilibili-live.ranks.refresh.v2", "bilibili-live.danmaku.start"] as const
export const HTTP_WORKER_REQUESTS = [...LIVE_HTTP_WORKER_REQUESTS,
  "bilibili.follower.fetch-card", "bilibili.follower.fetch-relation-stat", "bilibili.follower.fetch-profile",
  "bilibili.follower.fetch-card.v2", "bilibili.follower.fetch-relation-stat.v2", "bilibili.follower.fetch-profile.v2",
  "bilibili.platform.fetch-account.v1"] as const
export const HTTP_CORE_REQUESTS = [...LIVE_HTTP_CORE_REQUESTS,
  "platform.collection.run-once",
  "bilibili-followers.add", "bilibili-followers.refresh",
  "bilibili-followers.add.v2", "bilibili-followers.refresh.v2"] as const
export const CORE_KEEP_ALIVE_REQUESTS = [...HTTP_CORE_REQUESTS, "bilibili-live.session.export"] as const
export const RequestKeepAliveSchema = z.object({ requestType: z.string().min(1) }).strict()

export const CoreStatusSchema = z.object({
  state: z.enum(["starting", "ready", "degraded", "stopping", "offline"]),
  version: z.string().min(1),
  dataDirectory: z.string().min(1),
  databaseReady: z.boolean(),
  schemaVersion: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  lastError: z.string().optional()
})

export const WorkerStatusSchema = z.object({
  workerId: z.string().min(1),
  workerType: z.string().min(1),
  state: z.enum(["idle", "starting", "running", "backoff", "stopped", "failed"]),
  restartCount: z.number().int().nonnegative(),
  lastError: z.string().optional()
})

export const BootstrapResponseSchema = z.object({
  coreStatus: CoreStatusSchema,
  workers: z.array(WorkerStatusSchema),
  sequence: z.number().int().nonnegative()
})

export const RuntimeEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  version: z.literal(RUNTIME_PROTOCOL_VERSION),
  timestamp: z.iso.datetime(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  traceId: z.string().min(1),
  keepAlive: z.boolean().optional(),
  payload: z.unknown()
})

export type CoreStatus = z.infer<typeof CoreStatusSchema>
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>
export type RuntimeEnvelope<T = unknown> = Omit<
  z.infer<typeof RuntimeEnvelopeSchema>,
  "payload"
> & { payload: T }

export type NewRuntimeEnvelope<T> = Omit<RuntimeEnvelope<T>, "version">

export function createRuntimeEnvelope<T>(input: NewRuntimeEnvelope<T>): RuntimeEnvelope<T> {
  return RuntimeEnvelopeSchema.parse({
    ...input,
    version: RUNTIME_PROTOCOL_VERSION
  }) as RuntimeEnvelope<T>
}

export const RuntimeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean()
})

export type RuntimeError = z.infer<typeof RuntimeErrorSchema>
