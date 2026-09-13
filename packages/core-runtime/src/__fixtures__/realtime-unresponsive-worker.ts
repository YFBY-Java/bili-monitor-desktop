import { createInterface } from "node:readline"

// Synthetic live process which accepts start but never answers control requests.
const lines = createInterface({ input: process.stdin })
lines.on("line", line => {
  const request: { type: string; payload: { connectionId: string } } = JSON.parse(line)
  if (request.type !== "start") return
  process.stdout.write(`${JSON.stringify({ type: "event", connectionId: request.payload.connectionId,
    event: { type: "heartbeat", popularity: process.pid, receivedAt: new Date().toISOString() } })}\n`)
})
lines.once("close", () => process.exit(0))
