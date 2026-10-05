import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"
import { RealtimeRequestAliveSchema } from "@bmd/contracts"

import { safeWorkerEnvironment } from "./worker-environment"

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  type: "start" | "stop" | "stopAll"
  connectionId: string | undefined
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
  private stopped = false
  private stopPromise: Promise<void> | undefined

  constructor(private readonly options: NdjsonRealtimeWorkerTransportOptions) {}

  async request(
    type: "start" | "stop" | "stopAll",
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // Reserve a bounded control lane; a saturated start queue must still be stoppable.
    if (this.pending.size >= (type === "start" ? 100 : 120)) throw Object.assign(new Error("Realtime Worker request queue is full."),
      { code: "REALTIME_WORKER_BUSY", retryable: true })
    const child = this.ensureStarted()
    const id = randomUUID()
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 30_000)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handleExit(child, null, Object.assign(new Error(`Realtime Worker did not respond for ${timeoutMs} ms.`),
          { code: "REALTIME_WORKER_TIMEOUT", retryable: true }))
        child.kill()
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout, type,
        connectionId: typeof payload.connectionId === "string" ? payload.connectionId : undefined })
      child.stdin.write(`${JSON.stringify({ id, type, payload, ...(type === "start" ? { keepAlive: true } : {}) })}\n`)
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

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopped = true
    const child = this.child
    this.child = undefined
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(stoppedError())
    }
    this.pending.clear()
    this.listeners.clear()
    this.stopPromise = (async () => {
      if (!child) return
      child.stdin.end()
      if (child.exitCode === null) child.kill()
      await new Promise<void>((resolveStop) => {
        if (child.exitCode !== null) return resolveStop()
        const timeout = setTimeout(resolveStop, 1_500)
        child.once("exit", () => {
          clearTimeout(timeout)
          resolveStop()
        })
      })
    })()
    return this.stopPromise
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.stopped) throw stoppedError()
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
      if (this.child !== child) return
      this.stderrTail = `${this.stderrTail}${chunk.toString()}`.slice(-4_096)
    })
    const lines = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY })
    lines.on("line", (line) => { if (this.child === child) this.handleLine(line) })
    child.once("exit", (code) => this.handleExit(child, code))
    child.once("error", (error) => this.handleExit(child, null, error))
    child.stdin.on("error", () => {
      if (this.child !== child) return
      this.handleExit(child, null)
      child.kill()
    })
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
    if (value.type === "request-alive") {
      const parsed = RealtimeRequestAliveSchema.safeParse(value)
      if (!parsed.success) return
      const pending = this.pending.get(parsed.data.id)
      if (pending?.type === "start" && pending.connectionId === parsed.data.connectionId) pending.timeout.refresh()
      return
    }
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
    const error = cause && "code" in cause && cause.code === "REALTIME_WORKER_TIMEOUT" ? cause
      : Object.assign(new Error(`Realtime Worker exited with code ${code}.`), { code: "REALTIME_WORKER_EXITED", retryable: true })
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

function stoppedError(): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error("Realtime Worker stopped."), { code: "REALTIME_WORKER_STOPPED", retryable: false })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
