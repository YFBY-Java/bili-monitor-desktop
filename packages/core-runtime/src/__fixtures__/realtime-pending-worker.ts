import { createInterface } from "node:readline"

// Synthetic NDJSON process: acknowledge receipt, but deliberately leave start pending.
const lines = createInterface({ input: process.stdin })
lines.on("line", line => {
  const request: { type: string; id: string; payload: { connectionId: string } } = JSON.parse(line)
  if (request.type === "start") {
    process.stdout.write(`${JSON.stringify({ type: "event", connectionId: request.payload.connectionId,
      event: { type: "heartbeat", popularity: process.pid, receivedAt: new Date().toISOString() } })}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: { stopped: true } })}\n`)
})
lines.once("close", () => process.exit(0))
