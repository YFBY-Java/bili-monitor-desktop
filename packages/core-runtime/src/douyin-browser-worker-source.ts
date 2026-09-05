export interface BrowserWorkerTransport {
  request: (type: string, payload: Record<string, unknown>) => Promise<unknown>
  stop: () => Promise<void>
}

export interface DouyinWebWorkerStatus {
  status: "STARTING" | "WAITING" | "SCANNED" | "VALIDATING" | "SUCCESS" | "EXPIRED" | "USER_ACTION_REQUIRED" | "FAILED"
  message: string
  details?: Record<string, unknown>
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Douyin Browser Worker returned an invalid object.")
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Douyin Browser Worker response has no ${label}.`)
  return value
}

function workerStatus(value: unknown): DouyinWebWorkerStatus {
  const result = record(value)
  const status = requiredString(result.status, "status") as DouyinWebWorkerStatus["status"]
  if (!["STARTING", "WAITING", "SCANNED", "VALIDATING", "SUCCESS", "EXPIRED", "USER_ACTION_REQUIRED", "FAILED"].includes(status)) {
    throw new Error(`Unsupported Douyin Browser Worker status: ${status}`)
  }
  return {
    status,
    message: typeof result.message === "string" ? result.message : "",
    ...(typeof result.details === "object" && result.details !== null && !Array.isArray(result.details)
      ? { details: result.details as Record<string, unknown> }
      : {})
  }
}

export class DouyinBrowserWorkerSource {
  constructor(private readonly transport: BrowserWorkerTransport) {}

  async start(expiresInSeconds: number): Promise<{ workerSessionId: string; status: DouyinWebWorkerStatus["status"]; expiresAt: string }> {
    const result = record(await this.transport.request("douyin.web.start", { expiresInSeconds }))
    return {
      workerSessionId: requiredString(result.workerSessionId, "workerSessionId"),
      status: requiredString(result.status, "status") as DouyinWebWorkerStatus["status"],
      expiresAt: requiredString(result.expiresAt, "expiresAt")
    }
  }

  async qr(workerSessionId: string): Promise<string> {
    const result = record(await this.transport.request("douyin.web.qr", { workerSessionId }))
    return `data:image/png;base64,${requiredString(result.imageBase64, "imageBase64")}`
  }

  status(workerSessionId: string): Promise<DouyinWebWorkerStatus> {
    return this.transport.request("douyin.web.status", { workerSessionId }).then(workerStatus)
  }

  async consume(workerSessionId: string): Promise<Record<string, unknown>> {
    const result = record(await this.transport.request("douyin.web.consume", { workerSessionId }))
    return record(result.bundle)
  }

  async validate(bundle: Record<string, unknown>): Promise<{
    valid: boolean
    message: string
    details: Record<string, unknown>
    bundle?: Record<string, unknown>
  }> {
    const result = record(await this.transport.request("douyin.web.validate", { bundle }))
    return {
      valid: result.valid === true,
      message: typeof result.message === "string" ? result.message : "",
      details: typeof result.details === "object" && result.details !== null && !Array.isArray(result.details)
        ? result.details as Record<string, unknown>
        : {},
      ...(typeof result.bundle === "object" && result.bundle !== null && !Array.isArray(result.bundle)
        ? { bundle: result.bundle as Record<string, unknown> }
        : {})
    }
  }

  async health(): Promise<string> {
    const result = record(await this.transport.request("health", {}))
    return typeof result.status === "string" ? result.status : "DOWN"
  }

  async delete(workerSessionId: string): Promise<void> {
    await this.transport.request("douyin.web.delete", { workerSessionId })
  }

  async stop(): Promise<void> {
    try { await this.transport.request("stopAll", {}) } catch { /* child may already be gone */ }
    await this.transport.stop()
  }
}
