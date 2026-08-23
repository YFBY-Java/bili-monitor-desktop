import { z } from "zod"

export const RUNTIME_PROTOCOL_VERSION = 1 as const

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
