import { z } from "zod"
import { BilibiliLiveHttpConfigurationSchema } from "./bilibili-live-http"
import { BilibiliLiveDanmakuConnectionConfigurationSchema, BilibiliLiveDanmakuCacheConfigurationSchema } from "./bilibili-live-danmaku-configuration"

const Id = z.string().min(1)
const PositiveId = z.string().regex(/^[1-9][0-9]*$/u)
export const BilibiliWbiKeysSchema = z.object({ imgKey: Id, subKey: Id }).strict()
export type BilibiliWbiKeys = z.infer<typeof BilibiliWbiKeysSchema>
export const RealtimeWorkerErrorMetadataSchema = z.object({
  retryable: z.boolean().optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  biliCode: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  endpoint: z.literal("x/web-interface/nav").optional()
}).strict()
export const RealtimeWorkerErrorSchema = RealtimeWorkerErrorMetadataSchema.extend({
  code: Id, message: z.string()
}).strict()
export type RealtimeWorkerError = z.infer<typeof RealtimeWorkerErrorSchema>
export const BilibiliDanmakuCredentialSchema = z.object({
  cookieHeader: z.string().min(1).regex(/^[\t\x20-\x7e]*$/u), authUid: PositiveId
}).strict()
export type BilibiliDanmakuCredential = z.infer<typeof BilibiliDanmakuCredentialSchema>
export const BilibiliDanmakuWorkerStartSchema = z.object({
  connectionId: Id,
  roomId: PositiveId,
  protocolVersion: z.number().int().min(0).max(3).optional(),
  preferredProtocolVersion: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  credential: BilibiliDanmakuCredentialSchema.optional(),
  httpConfiguration: BilibiliLiveHttpConfigurationSchema.optional(),
  connectionConfiguration: BilibiliLiveDanmakuConnectionConfigurationSchema.optional(),
  cacheConfiguration: BilibiliLiveDanmakuCacheConfigurationSchema.optional()
}).strict()

export const RealtimeWorkerRequestSchema = z.discriminatedUnion("type", [
  z.object({ id: Id, type: z.literal("start"), keepAlive: z.boolean().optional(), payload: BilibiliDanmakuWorkerStartSchema }).strict(),
  z.object({ id: Id, type: z.literal("stop"), payload: z.object({ connectionId: Id }).strict() }).strict(),
  z.object({ id: Id, type: z.literal("stopAll"), payload: z.object({}).strict() }).strict(),
  z.object({ id: Id, type: z.literal("getWbiKeys"), keepAlive: z.boolean().optional(), payload: z.object({
    forceRefresh: z.boolean(), wbiCacheSeconds: z.number().int(),
    httpConfiguration: BilibiliLiveHttpConfigurationSchema.optional()
  }).strict() }).strict(),
  z.object({ id: Id, type: z.literal("cancelWbiKeys"), payload: z.object({ requestId: Id }).strict() }).strict()
])
export const RealtimeRequestAliveSchema = z.discriminatedUnion("requestType", [
  z.object({ id: Id, type: z.literal("request-alive"), requestType: z.literal("start"), connectionId: Id }).strict(),
  z.object({ id: Id, type: z.literal("request-alive"), requestType: z.literal("getWbiKeys") }).strict()
])
export const RealtimeCredentialRequestSchema = z.object({
  id: Id, type: z.literal("credential-request"), startRequestId: Id, connectionId: Id
}).strict()
export const RealtimeCredentialResponseSchema = z.object({
  id: Id, type: z.literal("credential-response"), credential: BilibiliDanmakuCredentialSchema.nullable()
}).strict()
export type RealtimeWorkerRequest = z.infer<typeof RealtimeWorkerRequestSchema>
export type BilibiliDanmakuWorkerStart = z.infer<typeof BilibiliDanmakuWorkerStartSchema>

const TransportMetadata = z.object({
  connectHost: z.string().url(),
  protocolVersion: z.number().int().min(0).max(3),
  authMode: z.enum(["ANONYMOUS", "LOGIN"]),
  authUid: PositiveId.optional()
})
export const BilibiliDanmakuWorkerStartResultSchema = TransportMetadata.extend({
  status: z.enum(["AUTHENTICATING", "CONNECTED"]),
  attempt: z.number().int().positive()
}).strict()
const AttemptTime = z.object({ attempt: z.number().int().positive(), receivedAt: z.string().datetime() })
export const BilibiliDanmakuWorkerLifecycleEventSchema = z.discriminatedUnion("type", [
  AttemptTime.extend({ type: z.literal("connecting"), ...TransportMetadata.shape }).strict(),
  AttemptTime.extend({ type: z.literal("attempt-failed"), code: Id, message: z.string() }).strict(),
  AttemptTime.extend({ type: z.literal("connected") }).strict(),
  AttemptTime.extend({ type: z.literal("heartbeat-sent") }).strict()
])
export type BilibiliDanmakuWorkerStartResult = z.infer<typeof BilibiliDanmakuWorkerStartResultSchema>
export type BilibiliDanmakuWorkerLifecycleEvent = z.infer<typeof BilibiliDanmakuWorkerLifecycleEventSchema>
