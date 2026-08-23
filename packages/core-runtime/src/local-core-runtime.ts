import type { BootstrapResponse } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"

export interface LocalCoreRuntimeOptions {
  dataDirectory: string
  version: string
  now?: () => Date
}

export class LocalCoreRuntime {
  private stopped = false

  private constructor(
    private readonly options: Required<LocalCoreRuntimeOptions>,
    private readonly database: ControlDatabase,
    private readonly startedAt: string
  ) {}

  static async start(options: LocalCoreRuntimeOptions): Promise<LocalCoreRuntime> {
    const normalized: Required<LocalCoreRuntimeOptions> = {
      ...options,
      now: options.now ?? (() => new Date())
    }
    const database = await ControlDatabase.open(normalized.dataDirectory)
    return new LocalCoreRuntime(normalized, database, normalized.now().toISOString())
  }

  bootstrap(): BootstrapResponse {
    if (this.stopped) throw new Error("Local Core has already stopped.")
    const databaseStatus = this.database.status()
    return {
      coreStatus: {
        state: "ready",
        version: this.options.version,
        dataDirectory: this.options.dataDirectory,
        databaseReady: true,
        schemaVersion: databaseStatus.schemaVersion,
        startedAt: this.startedAt
      },
      workers: this.database.listWorkerStatuses().map((worker) => ({
        workerId: worker.workerId,
        workerType: worker.workerType,
        state: worker.state as "idle" | "starting" | "running" | "backoff" | "stopped" | "failed",
        restartCount: worker.restartCount,
        ...(worker.lastError ? { lastError: worker.lastError } : {})
      })),
      sequence: 1
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.database.close()
  }
}
