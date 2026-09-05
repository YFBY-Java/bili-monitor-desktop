import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"

import type { BrowserWorkerTransport } from "./douyin-browser-worker-source"
import { safeWorkerEnvironment } from "./worker-environment"

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class NdjsonBrowserWorkerTransport implements BrowserWorkerTransport {
  private child: ChildProcessWithoutNullStreams | undefined
  private readonly pending = new Map<string, Pending>()
  private stderrTail = ""

  constructor(private readonly options: {
    nodeExecutable: string
    workerEntry: string
    dataDirectory: string
    requestTimeoutMs?: number
  }) {}

  request(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const child = this.ensureStarted()
    const id = randomUUID()
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 75_000)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Browser Worker request ${type} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      child.stdin.write(`${JSON.stringify({ id, type, payload })}\n`)
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!child) return
    child.stdin.end()
    if (child.exitCode === null) child.kill()
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child
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
    this.stderrTail = ""
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString()}`.slice(-4_096)
    })
    createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (line) => this.handleLine(line))
    child.once("exit", (code) => this.handleExit(child, code))
    child.once("error", (error) => this.handleExit(child, null, error))
    return child
  }

  private handleLine(line: string): void {
    let value: unknown
    try { value = JSON.parse(line) as unknown } catch { return }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return
    const response = value as Record<string, unknown>
    if (typeof response.id !== "string" || typeof response.ok !== "boolean") return
    const pending = this.pending.get(response.id)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(response.id)
    if (response.ok) return pending.resolve(response.result)
    const error = typeof response.error === "object" && response.error !== null
      ? response.error as Record<string, unknown>
      : {}
    pending.reject(Object.assign(new Error(typeof error.message === "string" ? error.message : "Browser Worker failed."), {
      code: typeof error.code === "string" ? error.code : "BROWSER_WORKER_FAILED",
      retryable: false
    }))
  }

  private handleExit(child: ChildProcessWithoutNullStreams, code: number | null, cause?: Error): void {
    if (this.child !== child) return
    this.child = undefined
    const error = cause ?? new Error(this.stderrTail.trim() || `Browser Worker exited with code ${code}.`)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}
