import {
  startupConfigurationErrorMessage,
  RuntimeEnvelopeSchema,
  createRuntimeEnvelope,
  CORE_KEEP_ALIVE_REQUESTS,
  REQUEST_KEEP_ALIVE_INTERVAL_MS,
  type RuntimeEnvelope,
  type RuntimeError
} from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"
import { preparedExportMainContextFromEnvironment } from "@bmd/core-runtime/export-prepared-workspace"

import { dispatchBusinessRequest } from "./core-request-router"

const parentPort = process.parentPort
if (!parentPort) throw new Error("Local Core must run as an Electron utility process.")

const dataDirectory = process.env.BMD_DATA_DIR
if (!dataDirectory) throw new Error("BMD_DATA_DIR is required.")

let startupError: RuntimeError | undefined
const mainContext = preparedExportMainContextFromEnvironment(process.env)
const runtime = await LocalCoreRuntime.start({
  dataDirectory,
  ...(mainContext ? { mainContext } : {}),
  version: process.env.BMD_CORE_VERSION ?? "0.2.0"
}).catch((error: unknown) => {
  const details = applicationErrorDetails(error)
  const message = startupConfigurationErrorMessage(details?.code)
  if (!details || message === undefined) throw error
  // Keep the bootstrap channel alive for this actionable startup error. No raw stderr/stack.
  startupError = { code: details.code, message, retryable: false }
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

const activeKeepAliveReporters = new Set<(now: number) => void>()

async function handleMessage(message: unknown): Promise<void> {
  const parsed = RuntimeEnvelopeSchema.safeParse(message)
  if (!parsed.success) return
  const request = parsed.data as RuntimeEnvelope
  let heartbeat: NodeJS.Timeout | undefined
  let reportProgress: (() => void) | undefined
  let keepAliveReporter: ((now: number) => void) | undefined

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
    if (request.keepAlive && CORE_KEEP_ALIVE_REQUESTS.some(type => type === request.type)) {
      const report = () => parentPort.postMessage(response(request, "core.request-alive", { requestType: request.type }))
      let lastReportedAt = Date.now()
      keepAliveReporter = (now) => {
        if (now - lastReportedAt >= REQUEST_KEEP_ALIVE_INTERVAL_MS) {
          report()
          lastReportedAt = now
        }
      }
      activeKeepAliveReporters.add(keepAliveReporter)
      // Synchronous snapshots block every request's interval. Traversal must keep
      // all already accepted long requests alive using their own matching envelopes.
      reportProgress = () => {
        const now = Date.now()
        for (const reporter of activeKeepAliveReporters) reporter(now)
      }
      report()
      heartbeat = setInterval(() => {
        try {
          report()
          lastReportedAt = Date.now()
        } catch {
          clearInterval(heartbeat)
          // Stop workers and drain current exports before leaving on supervising Main loss.
          void runtime.stop().finally(() => process.exit(1))
        }
      }, REQUEST_KEEP_ALIVE_INTERVAL_MS)
    }
    const result = await dispatchBusinessRequest(runtime, request, reportProgress)
    parentPort.postMessage(response(request, result.responseType, result.payload))
  } catch (error) {
    const details = applicationErrorDetails(error)
    const payload: RuntimeError = {
      code: details?.code ?? "CORE_REQUEST_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: details?.retryable ?? false
    }
    parentPort.postMessage(response(request, "core.error", payload))
  } finally {
    clearInterval(heartbeat)
    if (keepAliveReporter) activeKeepAliveReporters.delete(keepAliveReporter)
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
