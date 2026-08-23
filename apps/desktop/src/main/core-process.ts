import {
  RuntimeEnvelopeSchema,
  createRuntimeEnvelope,
  type RuntimeEnvelope,
  type RuntimeError
} from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"

const parentPort = process.parentPort
if (!parentPort) throw new Error("Local Core must run as an Electron utility process.")

const dataDirectory = process.env.BMD_DATA_DIR
if (!dataDirectory) throw new Error("BMD_DATA_DIR is required.")

const runtime = await LocalCoreRuntime.start({
  dataDirectory,
  version: process.env.BMD_CORE_VERSION ?? "0.2.0"
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

async function handleMessage(message: unknown): Promise<void> {
  const parsed = RuntimeEnvelopeSchema.safeParse(message)
  if (!parsed.success) return
  const request = parsed.data as RuntimeEnvelope

  try {
    if (request.type === "core.bootstrap") {
      parentPort.postMessage(response(request, "core.bootstrap.result", runtime.bootstrap()))
      return
    }
    if (request.type === "core.shutdown") {
      parentPort.postMessage(response(request, "core.shutdown.result", { accepted: true }))
      await runtime.stop()
      setImmediate(() => process.exit(0))
      return
    }
    throw new Error(`Unsupported local Core message type: ${request.type}`)
  } catch (error) {
    const payload: RuntimeError = {
      code: "CORE_REQUEST_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: false
    }
    parentPort.postMessage(response(request, "core.error", payload))
  }
}

parentPort.on("message", (event) => {
  void handleMessage(event.data)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void runtime.stop().finally(() => process.exit(0))
  })
}
