import { randomUUID } from "node:crypto"

import type {
  BindSubjectAccountInput,
  BootstrapResponse,
  CreatePlatformAccountInput,
  CreateSubjectInput,
  ListPlatformAccountsInput,
  ListSubjectsInput,
  PlatformAccount,
  PlatformAccountList,
  SubjectList,
  SubjectSummary
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"

import { AccountSubjectService } from "./account-subject-service"

export interface LocalCoreRuntimeOptions {
  dataDirectory: string
  version: string
  now?: () => Date
  idFactory?: () => string
}

export class LocalCoreRuntime {
  private stopped = false

  private constructor(
    private readonly options: Required<LocalCoreRuntimeOptions>,
    private readonly database: ControlDatabase,
    private readonly accountSubjects: AccountSubjectService,
    private readonly startedAt: string
  ) {}

  static async start(options: LocalCoreRuntimeOptions): Promise<LocalCoreRuntime> {
    const normalized: Required<LocalCoreRuntimeOptions> = {
      ...options,
      now: options.now ?? (() => new Date()),
      idFactory: options.idFactory ?? randomUUID
    }
    const database = await ControlDatabase.open(normalized.dataDirectory)
    const accountSubjects = new AccountSubjectService({
      database,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    return new LocalCoreRuntime(
      normalized,
      database,
      accountSubjects,
      normalized.now().toISOString()
    )
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

  createPlatformAccount(input: CreatePlatformAccountInput): PlatformAccount {
    this.ensureRunning()
    return this.accountSubjects.createPlatformAccount(input)
  }

  listPlatformAccounts(input?: ListPlatformAccountsInput): PlatformAccountList {
    this.ensureRunning()
    return this.accountSubjects.listPlatformAccounts(input)
  }

  createSubject(input: CreateSubjectInput): SubjectSummary {
    this.ensureRunning()
    return this.accountSubjects.createSubject(input)
  }

  bindSubjectAccount(input: BindSubjectAccountInput): SubjectSummary {
    this.ensureRunning()
    return this.accountSubjects.bindSubjectAccount(input)
  }

  listSubjects(input?: ListSubjectsInput): SubjectList {
    this.ensureRunning()
    return this.accountSubjects.listSubjects(input)
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.database.close()
  }

  private ensureRunning(): void {
    if (this.stopped) throw new Error("Local Core has already stopped.")
  }
}
