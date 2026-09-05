import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"

import { safeWorkerEnvironment } from "./worker-environment"

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export interface RealtimeWorkerTransport {
  request: (type: "start" | "stop" | "stopAll", payload: Record<string, unknown>) => Promise<unknown>
  subscribe: (connectionId: string, listener: (event: unknown) => void) => () => void
  stop: () => Promise<void>
}

export interface NdjsonRealtimeWorkerTransportOptions {
  nodeExecutable: string
  workerEntry: string
  dataDirectory: string
  requestTimeoutMs?: number
}

export class NdjsonRealtimeWorkerTransport implements RealtimeWorkerTransport {
  private child: ChildProcessWithoutNullStreams | undefined
  private readonly pending = new Map<string, PendingRequest>()
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  private stderrTail = ""

  constructor(private readonly options: NdjsonRealtimeWorkerTransportOptions) {}

  async request(
    type: "start" | "stop" | "stopAll",
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const child = this.ensureStarted()
    const id = randomUUID()
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 30_000)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Realtime Worker request ${type} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      child.stdin.write(`${JSON.stringify({ id, type, payload })}\n`)
    })
  }

  subscribe(connectionId: string, listener: (event: unknown) => void): () => void {
    const current = this.listeners.get(connectionId) ?? new Set()
    current.add(listener)
    this.listeners.set(connectionId, current)
    return () => {
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(connectionId)
    }
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!child) return
    child.stdin.end()
    if (child.exitCode === null) child.kill()
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      const timeout = setTimeout(resolve, 1_500)
      child.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child
    this.stderrTail = ""
    const child = spawn(this.options.nodeExecutable, [this.options.workerEntry], {
      cwd: this.options.dataDirectory,
      env: safeWorkerEnvironment(process.env, {
        BMD_DATA_DIR: this.options.dataDirectory,
        ...(process.env.BMD_NODE_RUN_AS_ELECTRON === "1" ? { ELECTRON_RUN_AS_NODE: "1" } : {})
      }),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    })
    this.child = child
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString()}`.slice(-4_096)
    })
    const lines = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY })
    lines.on("line", (line) => this.handleLine(line))
    child.once("exit", (code) => this.handleExit(child, code))
    child.once("error", (error) => this.handleExit(child, null, error))
    return child
  }

  private handleLine(line: string): void {
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch {
      return
    }
    if (!isRecord(value)) return
    if (value.type === "event" && typeof value.connectionId === "string") {
      for (const listener of this.listeners.get(value.connectionId) ?? []) listener(value.event)
      return
    }
    if (typeof value.id !== "string" || typeof value.ok !== "boolean") return
    const pending = this.pending.get(value.id)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(value.id)
    if (value.ok) {
      pending.resolve(value.result)
      return
    }
    const error = isRecord(value.error) ? value.error : {}
    pending.reject(Object.assign(
      new Error(typeof error.message === "string" ? error.message : "Realtime Worker failed."),
      {
        code: typeof error.code === "string" ? error.code : "REALTIME_WORKER_FAILED",
        retryable: true
      }
    ))
  }

  private handleExit(
    child: ChildProcessWithoutNullStreams,
    code: number | null,
    cause?: Error
  ): void {
    if (this.child !== child) return
    this.child = undefined
    const details = this.stderrTail.trim()
    const error = cause ?? new Error(
      details
        ? `Realtime Worker exited with code ${code}. ${details}`
        : `Realtime Worker exited with code ${code}.`
    )
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
    const receivedAt = new Date().toISOString()
    for (const listeners of this.listeners.values()) {
      for (const listener of listeners) {
        listener({
          type: "error",
          receivedAt,
          errorType: "REALTIME_WORKER_EXITED",
          message: error.message
        })
      }
    }
    this.listeners.clear()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
