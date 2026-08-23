import { randomUUID } from "node:crypto"

import {
  BindSubjectAccountInputSchema,
  BootstrapResponseSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  ListPlatformAccountsInputSchema,
  ListSubjectsInputSchema,
  PlatformAccountListSchema,
  PlatformAccountSchema,
  RuntimeEnvelopeSchema,
  RuntimeErrorSchema,
  SubjectListSchema,
  SubjectSummarySchema,
  createRuntimeEnvelope,
  type BootstrapResponse,
  type RuntimeEnvelope
} from "@bmd/contracts"
import { utilityProcess, type UtilityProcess } from "electron"

interface LocalCoreControllerOptions {
  entryPath: string
  dataDirectory: string
  version?: string
  startupTimeoutMs?: number
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (envelope: RuntimeEnvelope) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class LocalCoreController {
  private readonly startupTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly pending = new Map<string, PendingRequest>()
  private child?: UtilityProcess
  private lastBootstrap?: BootstrapResponse
  private stderrTail = ""

  constructor(private readonly options: LocalCoreControllerOptions) {
    this.startupTimeoutMs = options.startupTimeoutMs ?? 8_000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000
  }

  get processId(): number | undefined {
    return this.child?.pid
  }

  isRunning(): boolean {
    return this.child?.pid !== undefined
  }

  async start(): Promise<BootstrapResponse> {
    if (this.isRunning()) return this.bootstrap()
    await this.forceStop()
    this.stderrTail = ""

    const child = utilityProcess.fork(this.options.entryPath, [], {
      env: {
        ...process.env,
        BMD_DATA_DIR: this.options.dataDirectory,
        BMD_CORE_VERSION: this.options.version ?? "0.2.0"
      },
      serviceName: "BiliMonitor Local Core",
      stdio: ["ignore", "pipe", "pipe"]
    })
    this.child = child
    child.on("message", (message) => this.handleMessage(message))
    child.on("exit", (code) => this.handleExit(code))
    child.stderr?.on("data", (chunk: Buffer | string) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString()}`.slice(-4_096)
    })

    try {
      await this.waitForSpawn(child)
      return await this.bootstrap()
    } catch (error) {
      await this.forceStop()
      const message = error instanceof Error ? error.message : String(error)
      const details = this.stderrTail.trim()
      throw new Error(details ? `${message}\n${details}` : message)
    }
  }

  async bootstrap(): Promise<BootstrapResponse> {
    const envelope = await this.request("core.bootstrap", {})
    const response = BootstrapResponseSchema.parse(envelope.payload)
    this.lastBootstrap = response
    return response
  }

  async listPlatformAccounts(input: unknown) {
    const envelope = await this.request(
      "platform-accounts.list",
      ListPlatformAccountsInputSchema.parse(input ?? {})
    )
    return PlatformAccountListSchema.parse(envelope.payload)
  }

  async createPlatformAccount(input: unknown) {
    const envelope = await this.request(
      "platform-accounts.create",
      CreatePlatformAccountInputSchema.parse(input)
    )
    return PlatformAccountSchema.parse(envelope.payload)
  }

  async listSubjects(input: unknown) {
    const envelope = await this.request("subjects.list", ListSubjectsInputSchema.parse(input ?? {}))
    return SubjectListSchema.parse(envelope.payload)
  }

  async createSubject(input: unknown) {
    const envelope = await this.request("subjects.create", CreateSubjectInputSchema.parse(input))
    return SubjectSummarySchema.parse(envelope.payload)
  }

  async bindSubjectAccount(input: unknown) {
    const envelope = await this.request(
      "subjects.bind-account",
      BindSubjectAccountInputSchema.parse(input)
    )
    return SubjectSummarySchema.parse(envelope.payload)
  }

  snapshot(): BootstrapResponse | undefined {
    return this.lastBootstrap
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    try {
      if (child.pid !== undefined) await this.request("core.shutdown", { reason: "desktop quit" })
    } catch {
      // forceStop remains the final lifecycle guard when the child is already gone.
    }
    await this.waitForExit(child, 1_500)
    await this.forceStop()
  }

  private request<T>(type: string, payload: T): Promise<RuntimeEnvelope> {
    const child = this.child
    if (!child?.pid) throw new Error("The local Core utility process is not running.")

    const id = randomUUID()
    const envelope = createRuntimeEnvelope({
      id,
      type,
      timestamp: new Date().toISOString(),
      correlationId: id,
      traceId: randomUUID(),
      payload
    })

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Local Core request ${type} timed out after ${this.requestTimeoutMs} ms.`))
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      child.postMessage(envelope)
    })
  }

  private handleMessage(message: unknown): void {
    const parsed = RuntimeEnvelopeSchema.safeParse(message)
    if (!parsed.success) return
    const envelope = parsed.data as RuntimeEnvelope
    const pending = this.pending.get(envelope.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(envelope.id)
    if (envelope.type === "core.error") {
      const runtimeError = RuntimeErrorSchema.parse(envelope.payload)
      pending.reject(new Error(`${runtimeError.code}: ${runtimeError.message}`))
      return
    }
    pending.resolve(envelope)
  }

  private handleExit(code: number): void {
    this.child = undefined
    this.lastBootstrap = undefined
    const details = this.stderrTail.trim()
    const error = new Error(
      details ? `Local Core exited with code ${code}.\n${details}` : `Local Core exited with code ${code}.`
    )
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private waitForSpawn(child: UtilityProcess): Promise<void> {
    if (child.pid !== undefined) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Local Core did not spawn after ${this.startupTimeoutMs} ms.`))
      }, this.startupTimeoutMs)
      child.once("spawn", () => {
        clearTimeout(timeout)
        resolve()
      })
      child.once("exit", (code) => {
        clearTimeout(timeout)
        reject(new Error(`Local Core exited during startup with code ${code}.`))
      })
    })
  }

  private waitForExit(child: UtilityProcess, timeoutMs: number): Promise<void> {
    if (child.pid === undefined) return Promise.resolve()
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, timeoutMs)
      child.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  private async forceStop(): Promise<void> {
    const child = this.child
    this.child = undefined
    this.lastBootstrap = undefined
    if (!child?.pid) return
    child.kill()
    await this.waitForExit(child, 1_500)
  }
}
