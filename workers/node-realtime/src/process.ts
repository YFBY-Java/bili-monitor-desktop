import { createInterface } from "node:readline"

import { RealtimeWorkerRequestSchema, REQUEST_KEEP_ALIVE_INTERVAL_MS, type RealtimeWorkerRequest } from "@bmd/contracts"
import type { BilibiliDanmakuConnectionEvent } from "./bilibili-danmaku-connection"
import { RealtimeSessionManager } from "./realtime-session-manager"

const manager = new RealtimeSessionManager()
const aliveTimers = new Set<NodeJS.Timeout>()
let shuttingDown = false

function send(value: unknown): void {
  if (shuttingDown) return
  if (process.stdout.destroyed || process.stdout.writableLength > 4 * 1024 * 1024) { void shutdown(1); return }
  process.stdout.write(`${JSON.stringify(value)}\n`, error => { if (error) void shutdown(1) })
}

function sendError(id: string, error: unknown): void {
  send({
    id,
    ok: false,
    error: {
      code: errorCode(error) ?? "REALTIME_WORKER_FAILED",
      message: error instanceof Error ? error.message : String(error)
    }
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
      const connection = await manager.start(request.payload, event => sendEvent(connectionId, event))
      send({
        id: request.id,
        ok: true,
        result: {
          connectHost: connection.connectHost,
          protocolVersion: connection.protocolVersion,
          authMode: connection.authMode,
          ...(connection.authUid ? { authUid: connection.authUid } : {})
        }
      })
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

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
lines.on("line", (line) => {
  try {
    const request = JSON.parse(line) as unknown
    if (!isRecord(request)) return
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
