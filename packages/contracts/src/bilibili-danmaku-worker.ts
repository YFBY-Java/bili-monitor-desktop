import { z } from "zod"
import { BilibiliLiveHttpConfigurationSchema } from "./bilibili-live-http"

const Id = z.string().min(1)
const PositiveId = z.string().regex(/^[1-9][0-9]*$/u)
export const BilibiliDanmakuWorkerStartSchema = z.object({
  connectionId: Id,
  roomId: PositiveId,
  protocolVersion: z.number().int().min(0).max(3).optional(),
  credential: z.object({ cookieHeader: z.string().min(1).regex(/^[\t\x20-\x7e]*$/u), authUid: PositiveId }).strict().optional(),
  httpConfiguration: BilibiliLiveHttpConfigurationSchema.optional()
}).strict()

export const RealtimeWorkerRequestSchema = z.discriminatedUnion("type", [
  z.object({ id: Id, type: z.literal("start"), keepAlive: z.boolean().optional(), payload: BilibiliDanmakuWorkerStartSchema }).strict(),
  z.object({ id: Id, type: z.literal("stop"), payload: z.object({ connectionId: Id }).strict() }).strict(),
  z.object({ id: Id, type: z.literal("stopAll"), payload: z.object({}).strict() }).strict()
])
export const RealtimeRequestAliveSchema = z.object({
  id: Id, type: z.literal("request-alive"), requestType: z.literal("start"), connectionId: Id
}).strict()
export type RealtimeWorkerRequest = z.infer<typeof RealtimeWorkerRequestSchema>
export type BilibiliDanmakuWorkerStart = z.infer<typeof BilibiliDanmakuWorkerStartSchema>
