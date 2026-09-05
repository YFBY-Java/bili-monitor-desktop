import { createInterface } from "node:readline"

import {
  startBilibiliDanmakuConnection,
  type BilibiliDanmakuConnectionEvent,
  type RunningBilibiliDanmakuConnection
} from "./bilibili-danmaku-connection"

interface WorkerRequest {
  id: string
  type: "start" | "stop" | "stopAll"
  payload: Record<string, unknown>
}

const connections = new Map<string, RunningBilibiliDanmakuConnection>()
let shuttingDown = false

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
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

async function handle(request: WorkerRequest): Promise<void> {
  try {
    if (request.type === "start") {
      const connectionId = requiredString(request.payload.connectionId, "connectionId")
      await connections.get(connectionId)?.stop()
      const credentialValue = request.payload.credential
      const credential = isRecord(credentialValue)
        ? {
            cookieHeader: requiredString(credentialValue.cookieHeader, "credential.cookieHeader"),
            authUid: requiredString(credentialValue.authUid, "credential.authUid")
          }
        : undefined
      const connection = await startBilibiliDanmakuConnection({
        roomId: requiredString(request.payload.roomId, "roomId"),
        ...(typeof request.payload.protocolVersion === "number"
          ? { protocolVersion: request.payload.protocolVersion }
          : {}),
        ...(credential ? { credential } : {})
      }, (event) => sendEvent(connectionId, event))
      connections.set(connectionId, connection)
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
      const connectionId = requiredString(request.payload.connectionId, "connectionId")
      const connection = connections.get(connectionId)
      connections.delete(connectionId)
      await connection?.stop()
      send({ id: request.id, ok: true, result: { stopped: true } })
      return
    }
    const current = [...connections.values()]
    connections.clear()
    await Promise.all(current.map((connection) => connection.stop()))
    send({ id: request.id, ok: true, result: { stopped: true } })
  } catch (error) {
    sendError(request.id, error)
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
    const id = requiredString(request.id, "id")
    const type = request.type
    if (type !== "start" && type !== "stop" && type !== "stopAll") {
      throw new Error("Unknown realtime worker request type.")
    }
    void handle({ id, type, payload: isRecord(request.payload) ? request.payload : {} })
  } catch (error) {
    process.stderr.write(`realtime worker request rejected: ${error instanceof Error ? error.message : String(error)}\n`)
  }
})
lines.once("close", () => void shutdown())

async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  const current = [...connections.values()]
  connections.clear()
  await Promise.all(current.map((connection) => connection.stop()))
  process.exit(0)
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`)
  return value
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" ? error.code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
