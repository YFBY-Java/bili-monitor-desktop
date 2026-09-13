import {
  BILIBILI_LIVE_CONFIG_ERROR_MESSAGE,
  RuntimeEnvelopeSchema,
  createRuntimeEnvelope,
  type RuntimeEnvelope,
  type RuntimeError
} from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"

import { dispatchBusinessRequest } from "./core-request-router"

const parentPort = process.parentPort
if (!parentPort) throw new Error("Local Core must run as an Electron utility process.")

const dataDirectory = process.env.BMD_DATA_DIR
if (!dataDirectory) throw new Error("BMD_DATA_DIR is required.")

let startupError: RuntimeError | undefined
const runtime = await LocalCoreRuntime.start({
  dataDirectory,
  version: process.env.BMD_CORE_VERSION ?? "0.2.0"
}).catch((error: unknown) => {
  if (applicationErrorDetails(error)?.code !== "BILIBILI_LIVE_CONFIG_INVALID") throw error
  // Keep the bootstrap channel alive for this actionable startup error. No raw stderr/stack.
  startupError = { code: "BILIBILI_LIVE_CONFIG_INVALID", message: BILIBILI_LIVE_CONFIG_ERROR_MESSAGE, retryable: false }
  return undefined
})

function response<T>(request: RuntimeEnvelope, type: string, payload: T): RuntimeEnvelope<T> {
  return createRuntimeEnvelope({
    id: request.id,
    type,
    timestamp: new Date().toISOString(),
    correlationId: request.correlationId,
    causationId: request.id,
    traceId: request.traceId,
    payload
  })
}

function applicationErrorDetails(error: unknown): { code: string; retryable: boolean } | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined
  if (typeof error.code !== "string") return undefined
  const retryable = "retryable" in error && typeof error.retryable === "boolean"
    ? error.retryable
    : false
  return { code: error.code, retryable }
}

async function handleMessage(message: unknown): Promise<void> {
  const parsed = RuntimeEnvelopeSchema.safeParse(message)
  if (!parsed.success) return
  const request = parsed.data as RuntimeEnvelope

  try {
    if (request.type === "core.shutdown") {
      parentPort.postMessage(response(request, "core.shutdown.result", { accepted: true }))
      await runtime?.stop()
      setImmediate(() => process.exit(0))
      return
    }
    if (startupError) {
      parentPort.postMessage(response(request, "core.error", startupError))
      return
    }
    if (!runtime) throw new Error("Local Core initialization did not complete.")
    if (request.type === "core.bootstrap") {
      parentPort.postMessage(response(request, "core.bootstrap.result", runtime.bootstrap()))
      return
    }
    const result = await dispatchBusinessRequest(runtime, request)
    parentPort.postMessage(response(request, result.responseType, result.payload))
  } catch (error) {
    const details = applicationErrorDetails(error)
    const payload: RuntimeError = {
      code: details?.code ?? "CORE_REQUEST_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: details?.retryable ?? false
    }
    parentPort.postMessage(response(request, "core.error", payload))
  }
}

parentPort.on("message", (event) => {
  void handleMessage(event.data)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (runtime?.stop() ?? Promise.resolve()).finally(() => process.exit(0))
  })
}
