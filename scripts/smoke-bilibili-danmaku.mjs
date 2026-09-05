import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface } from "node:readline"

const projectDirectory = resolve(import.meta.dirname, "..")
const workerEntry = resolve(projectDirectory, "apps/desktop/out/main/realtime-worker.js")
const roomId = process.argv[2] ?? "21144080"
if (!existsSync(workerEntry)) {
  throw new Error(`Realtime Worker bundle does not exist: ${workerEntry}`)
}

const worker = spawn(process.execPath, [workerEntry], {
  cwd: projectDirectory,
  env: { ...process.env, BMD_DATA_DIR: process.env.BMD_DATA_DIR ?? projectDirectory },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true
})
const lines = createInterface({ input: worker.stdout, crlfDelay: Number.POSITIVE_INFINITY })
const startId = randomUUID()
const stopId = randomUUID()
let started = false
let stderr = ""

worker.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk.toString()}`.slice(-4_096)
})

const timeout = setTimeout(() => {
  worker.kill()
  throw new Error(`Bilibili danmaku smoke timed out. ${stderr.trim()}`)
}, 30_000)

lines.on("line", (line) => {
  const message = JSON.parse(line)
  if (message.id === startId) {
    if (!message.ok) {
      clearTimeout(timeout)
      worker.kill()
      throw new Error(message.error?.message ?? "Realtime Worker start failed.")
    }
    started = true
    process.stdout.write(`${JSON.stringify({ roomId, connected: true, ...message.result })}\n`)
    worker.stdin.write(`${JSON.stringify({ id: stopId, type: "stop", payload: { connectionId: startId } })}\n`)
    return
  }
  if (message.id === stopId) {
    clearTimeout(timeout)
    worker.stdin.end()
  }
})

worker.once("exit", (code) => {
  clearTimeout(timeout)
  if (!started || (code !== 0 && code !== null)) {
    process.stderr.write(stderr)
    process.exitCode = 1
  }
})

worker.stdin.write(`${JSON.stringify({
  id: startId,
  type: "start",
  payload: { connectionId: startId, roomId }
})}\n`)
