import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { parse, resolve } from "node:path"

import {
  RuntimeEnvelopeSchema,
  RequestKeepAliveSchema,
  HTTP_WORKER_REQUESTS,
  createRuntimeEnvelope,
  type RuntimeEnvelope
} from "@bmd/contracts"

import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"
import { safeWorkerEnvironment } from "./worker-environment"

export interface NdjsonPythonWorkerTransportOptions {
  pythonExecutable: string
  pythonPath: string
  dataDirectory: string
  role: "agent" | "auth" | "crawler" | "data"
  standaloneExecutable?: boolean
  requestTimeoutMs?: number
}

export const DEFAULT_PYTHON_WORKER_REQUEST_TIMEOUT_MS = 35_000

export function pythonWorkerArguments(
  role: NdjsonPythonWorkerTransportOptions["role"],
  standaloneExecutable: boolean
): string[] {
  return standaloneExecutable
    ? ["--role", role]
    : ["-m", "bmd_workers.runtime", "--role", role]
}

interface PendingWorkerRequest {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  envelope: RuntimeEnvelope
}

export class BilibiliWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly endpoint?: string,
    readonly statusCode?: number,
    readonly biliCode?: number
  ) {
    super(message)
    this.name = "BilibiliWorkerError"
  }
}

export class NdjsonPythonWorkerTransport implements WorkerRequestTransport {
  private readonly requestTimeoutMs: number
  private readonly pending = new Map<string, PendingWorkerRequest>()
  private child: ChildProcessWithoutNullStreams | undefined
  private stdoutBuffer = ""
  private stderrTail = ""
  private stopping = false

  constructor(private readonly options: NdjsonPythonWorkerTransportOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_PYTHON_WORKER_REQUEST_TIMEOUT_MS
    this.assertNonSystemDrive(options.pythonExecutable, "Python executable")
    this.assertNonSystemDrive(options.dataDirectory, "Worker data directory")
  }

  request(type: string, payload: unknown): Promise<unknown> {
    const child = this.ensureStarted()
    const id = randomUUID()
    const envelope = createRuntimeEnvelope({
      id,
      type,
      timestamp: new Date().toISOString(),
      correlationId: id,
      traceId: randomUUID(),
      ...(HTTP_WORKER_REQUESTS.some(request => request === type) ? { keepAlive: true } : {}),
      payload
    })

    return new Promise((resolveRequest, reject) => {
      const timeout = setTimeout(() => {
        const error = new BilibiliWorkerError("WORKER_UNRESPONSIVE",
          `Python worker request ${type} received no response for ${this.requestTimeoutMs} ms.`, false)
        this.child = undefined
        this.rejectAll(error)
        child.stdin.end()
        child.kill()
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve: resolveRequest, reject, timeout, envelope })
      child.stdin.write(`${JSON.stringify(envelope)}\n`, "utf8", (error) => {
        if (!error) return
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.stopping = true
    this.child = undefined
    child.stdin.end()
    if (child.exitCode === null) child.kill()
    await new Promise<void>((resolveStop) => {
      if (child.exitCode !== null) {
        resolveStop()
        return
      }
      const timeout = setTimeout(resolveStop, 1_500)
      child.once("exit", () => {
        clearTimeout(timeout)
        resolveStop()
      })
    })
    this.rejectAll(new Error("Python worker stopped."))
    this.stopping = false
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child
    this.stdoutBuffer = ""
    this.stderrTail = ""
    const child = spawn(
      this.options.pythonExecutable,
      pythonWorkerArguments(this.options.role, this.options.standaloneExecutable === true),
      {
        cwd: this.options.pythonPath,
        env: safeWorkerEnvironment(process.env, {
          BMD_DATA_DIR: resolve(this.options.dataDirectory),
          ...(this.options.standaloneExecutable ? {} : { PYTHONPATH: this.options.pythonPath }),
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1"
        }),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    )
    this.child = child
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => { if (this.child === child) this.handleStdout(chunk) })
    child.stderr.on("data", (chunk: string) => {
      if (this.child !== child) return
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4_096)
    })
    child.on("error", (error) => { if (this.child === child) this.rejectAll(error) })
    child.on("exit", (code) => {
      if (this.child !== child) return
      if (this.child === child) this.child = undefined
      if (this.stopping) return
      const details = this.stderrTail.trim()
      this.rejectAll(new Error(
        details
          ? `Python worker exited with code ${code}. ${details}`
          : `Python worker exited with code ${code}.`
      ))
    })
    return child
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n")
      if (newline < 0) return
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line) continue
      this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let decoded: unknown
    try {
      decoded = JSON.parse(line)
    } catch {
      this.rejectAll(new Error("Python worker emitted invalid NDJSON."))
      return
    }
    const parsed = RuntimeEnvelopeSchema.safeParse(decoded)
    if (!parsed.success) {
      this.rejectAll(new Error("Python worker emitted an invalid runtime envelope."))
      return
    }
    const envelope = parsed.data as RuntimeEnvelope
    const request = this.pending.get(envelope.id)
    if (!request) return
    if (envelope.type === "worker.request-alive") {
      const payload = RequestKeepAliveSchema.safeParse(envelope.payload)
      if (request.envelope.keepAlive && payload.success && payload.data.requestType === request.envelope.type
        && envelope.traceId === request.envelope.traceId && envelope.correlationId === request.envelope.correlationId) {
        // Python handles requests serially: a live active request also accounts for queued live work.
        for (const queued of this.pending.values()) if (queued.envelope.keepAlive) queued.timeout.refresh()
      }
      return
    }
    clearTimeout(request.timeout)
    this.pending.delete(envelope.id)
    if (envelope.type === "worker.error") {
      request.reject(this.toWorkerError(envelope.payload))
      return
    }
    request.resolve(envelope.payload)
  }

  private toWorkerError(payload: unknown): BilibiliWorkerError {
    const value = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {}
    return new BilibiliWorkerError(
      typeof value.code === "string" ? value.code : "WORKER_ERROR",
      typeof value.message === "string" ? value.message : "Python worker request failed.",
      typeof value.retryable === "boolean" ? value.retryable : false,
      typeof value.endpoint === "string" ? value.endpoint : undefined,
      typeof value.statusCode === "number" ? value.statusCode : undefined,
      typeof value.biliCode === "number" ? value.biliCode : undefined
    )
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout)
      request.reject(error)
    }
    this.pending.clear()
  }

  private assertNonSystemDrive(path: string, label: string): void {
    if (parse(resolve(path)).root.toLowerCase() === "c:\\") {
      throw new Error(`${label} must not use the C drive.`)
    }
  }
}
