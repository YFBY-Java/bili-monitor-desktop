import { createInterface } from "node:readline"
import { randomUUID } from "node:crypto"

import { RealtimeWorkerRequestSchema, RealtimeCredentialResponseSchema, BilibiliLiveHttpConfigurationSchema,
  RealtimeWorkerErrorSchema, RealtimeWorkerErrorMetadataSchema,
  REQUEST_KEEP_ALIVE_INTERVAL_MS, type RealtimeWorkerRequest, type BilibiliDanmakuCredential } from "@bmd/contracts"
import type { BilibiliDanmakuConnectionEvent } from "./bilibili-danmaku-connection"
import { RealtimeSessionManager } from "./realtime-session-manager"
import { bilibiliAnonymousMaterialProvider } from "./bilibili-anonymous-material-provider"
import { danmakuCancelled } from "./bilibili-http"

const manager = new RealtimeSessionManager()
const aliveTimers = new Set<NodeJS.Timeout>()
const materialRequests = new Map<string, AbortController>()
const credentialRequests = new Map<string, {
  resolve: (credential: BilibiliDanmakuCredential | undefined) => void
  cancel: () => void
}>()
let shuttingDown = false

function send(value: unknown): void {
  if (shuttingDown) return
  if (process.stdout.destroyed || process.stdout.writableLength > 4 * 1024 * 1024) { void shutdown(1); return }
  process.stdout.write(`${JSON.stringify(value)}\n`, error => { if (error) void shutdown(1) })
}

function sendError(id: string, error: unknown): void {
  const details = isRecord(error) ? error : {}
  const metadata = Object.fromEntries(Object.entries(RealtimeWorkerErrorMetadataSchema.shape).flatMap(([key, schema]) => {
    const parsed = schema.safeParse(details[key])
    return parsed.success && parsed.data !== undefined ? [[key, parsed.data]] : []
  }))
  send({
    id,
    ok: false,
    error: RealtimeWorkerErrorSchema.parse({
      code: errorCode(error) || "REALTIME_WORKER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...metadata
    })
  })
}

async function handle(request: RealtimeWorkerRequest): Promise<void> {
  let alive: NodeJS.Timeout | undefined
  try {
    if (shuttingDown) return
    if (request.type === "start") {
      const { connectionId } = request.payload
      if (request.keepAlive === true) {
        const report = () => send({ id: request.id, type: "request-alive", requestType: "start", connectionId })
        report()
        alive = setInterval(report, REQUEST_KEEP_ALIVE_INTERVAL_MS)
        aliveTimers.add(alive)
      }
      const connection = await manager.start(request.payload, event => sendEvent(connectionId, event),
        signal => currentCredential(request.id, connectionId, signal))
      send({
        id: request.id,
        ok: true,
        result: {
          status: "AUTHENTICATING",
          attempt: connection.attempt,
          connectHost: connection.connectHost,
          protocolVersion: connection.protocolVersion,
          authMode: connection.authMode,
          ...(connection.authUid ? { authUid: connection.authUid } : {})
        }
      })
      return
    }
    if (request.type === "getWbiKeys") {
      const controller = new AbortController()
      materialRequests.set(request.id, controller)
      if (request.keepAlive) {
        const report = () => send({ id: request.id, type: "request-alive", requestType: "getWbiKeys" })
        report()
        alive = setInterval(report, REQUEST_KEEP_ALIVE_INTERVAL_MS)
        aliveTimers.add(alive)
      }
      try {
        const keys = await bilibiliAnonymousMaterialProvider.getWbiKeys(request.payload.forceRefresh,
          BilibiliLiveHttpConfigurationSchema.parse(request.payload.httpConfiguration ?? {}),
          request.payload.wbiCacheSeconds, controller.signal)
        if (!controller.signal.aborted) send({ id: request.id, ok: true, result: keys })
      } finally { materialRequests.delete(request.id) }
      return
    }
    if (request.type === "cancelWbiKeys") {
      materialRequests.get(request.payload.requestId)?.abort()
      send({ id: request.id, ok: true, result: { stopped: true } })
      return
    }
    if (request.type === "stop") {
      await manager.stop(request.payload.connectionId)
      send({ id: request.id, ok: true, result: { stopped: true } })
      return
    }
    await manager.stopAll()
    send({ id: request.id, ok: true, result: { stopped: true } })
  } catch (error) {
    sendError(request.id, error)
  } finally {
    if (alive) { clearInterval(alive); aliveTimers.delete(alive) }
  }
}

function sendEvent(connectionId: string, event: BilibiliDanmakuConnectionEvent): void {
  send({ type: "event", connectionId, event })
}

function currentCredential(startRequestId: string, connectionId: string,
  signal: AbortSignal): Promise<BilibiliDanmakuCredential | undefined> {
  if (signal.aborted || shuttingDown) return Promise.reject(danmakuCancelled())
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener("abort", cancel)
      credentialRequests.delete(id)
    }
    const cancel = () => { cleanup(); reject(danmakuCancelled()) }
    const timeout = setTimeout(cancel, 30_000)
    credentialRequests.set(id, { resolve: credential => { cleanup(); resolve(credential) }, cancel })
    signal.addEventListener("abort", cancel, { once: true })
    send({ id, type: "credential-request", startRequestId, connectionId })
  })
}

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
lines.on("line", (line) => {
  try {
    const request = JSON.parse(line) as unknown
    if (!isRecord(request)) return
    if (request.type === "credential-response") {
      const credential = RealtimeCredentialResponseSchema.safeParse(request)
      if (credential.success) credentialRequests.get(credential.data.id)?.resolve(credential.data.credential ?? undefined)
      return
    }
    const parsed = RealtimeWorkerRequestSchema.safeParse(request)
    if (!parsed.success) {
      if (typeof request.id === "string") sendError(request.id,
        Object.assign(new Error("Invalid realtime worker request."), { code: "REALTIME_WORKER_INVALID_REQUEST" }))
      return
    }
    void handle(parsed.data)
  } catch {
    process.stderr.write("realtime worker request rejected: invalid JSON\n")
  }
})
lines.once("close", () => void shutdown())

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  for (const controller of materialRequests.values()) controller.abort()
  materialRequests.clear()
  for (const request of credentialRequests.values()) request.cancel()
  credentialRequests.clear()
  for (const timer of aliveTimers) clearInterval(timer)
  aliveTimers.clear()
  try { await manager.shutdown() } finally { process.exit(exitCode) }
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())
process.stdout.on("error", () => void shutdown(1))

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" ? error.code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
