import { createInterface } from "node:readline"

import { douyinBrowserConfigFromEnvironment, PlaywrightDouyinDriver } from "./douyin-playwright-driver"
import { DouyinSessionManager } from "./douyin-session-manager"

const manager = new DouyinSessionManager(
  new PlaywrightDouyinDriver(douyinBrowserConfigFromEnvironment()),
  { ttlSeconds: 180 }
)
let shuttingDown = false

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`)
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

async function handle(id: string, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    let result: unknown
    if (type === "douyin.web.start") {
      result = await manager.create(typeof payload.expiresInSeconds === "number" ? payload.expiresInSeconds : undefined)
    } else if (type === "douyin.web.qr") {
      const bytes = await manager.qr(requiredString(payload.workerSessionId, "workerSessionId"))
      result = { imageBase64: bytes.toString("base64"), contentType: "image/png" }
    } else if (type === "douyin.web.status") {
      result = await manager.status(requiredString(payload.workerSessionId, "workerSessionId"))
    } else if (type === "douyin.web.consume") {
      result = { bundle: await manager.consume(requiredString(payload.workerSessionId, "workerSessionId")) }
    } else if (type === "douyin.web.validate") {
      result = await manager.validate(record(payload.bundle))
    } else if (type === "douyin.web.delete") {
      await manager.remove(requiredString(payload.workerSessionId, "workerSessionId"))
      result = { deleted: true }
    } else if (type === "health") {
      result = { status: "UP" }
    } else if (type === "stopAll") {
      await manager.closeAll()
      result = { stopped: true }
    } else {
      throw Object.assign(new Error(`Unknown browser worker request: ${type}`), { code: "UNKNOWN_REQUEST" })
    }
    send({ id, ok: true, result })
  } catch (error) {
    send({
      id,
      ok: false,
      error: {
        code: typeof error === "object" && error !== null && "code" in error ? error.code : "BROWSER_WORKER_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    })
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
lines.on("line", (line) => {
  try {
    const request = record(JSON.parse(line) as unknown)
    void handle(requiredString(request.id, "id"), requiredString(request.type, "type"), record(request.payload))
  } catch (error) {
    process.stderr.write(`browser worker request rejected: ${error instanceof Error ? error.message : String(error)}\n`)
  }
})
lines.once("close", () => void shutdown())

async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  await manager.closeAll()
  process.exit(0)
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())
