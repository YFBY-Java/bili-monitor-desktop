import { randomBytes, randomUUID } from "node:crypto"
import { resolve } from "node:path"

import type {
  BindSubjectAccountInput,
  AddBilibiliFollowerMonitorInput,
  BootstrapResponse,
  CreatePlatformAccountInput,
  CreateSubjectInput,
  ListPlatformAccountsInput,
  ListSubjectsInput,
  PlatformAccount,
  PlatformAccountList,
  BilibiliFollowerCollectResult,
  BilibiliFollowerMonitor,
  BilibiliFollowerMonitorList,
  BilibiliFollowerTrend,
  BilibiliAuthRefreshResult,
  BilibiliAuthStatus,
  BilibiliCredential,
  BilibiliQrLoginStart,
  BilibiliQrLoginStatus,
  AddBilibiliLiveRoomInput,
  BilibiliLiveCollectResult,
  BilibiliLiveRoom,
  BilibiliLiveRoomList,
  BilibiliLiveRoomTrend,
  BilibiliLiveStatusEvent,
  BilibiliLiveSummary,
  BilibiliLiveRankLatestInput,
  BilibiliLiveRankRefreshInput,
  BilibiliLiveRankRefreshResult,
  BilibiliLiveRankSnapshot,
  BilibiliLiveRankSummary,
  BilibiliLiveDanmakuMetricBucket,
  BilibiliLiveDanmakuRecent,
  BilibiliLiveDanmakuStatus,
  QueryBilibiliLiveDanmakuMetricsInput,
  QueryBilibiliLiveDanmakuRecentInput,
  StartBilibiliLiveDanmakuInput,
  BilibiliLiveSessionSummary,
  BilibiliLiveSessionUser,
  BilibiliLiveSessionEventPage,
  BilibiliLiveSessionInsight,
  ListBilibiliLiveSessionsInput,
  ListBilibiliLiveSessionUsersInput,
  QueryBilibiliLiveSessionEventsInput,
  QueryBilibiliLiveSessionInsightInput,
  ExportBilibiliLiveSessionInput,
  PreparedBilibiliLiveSessionExport,
  BilibiliSubject,
  BilibiliSubjectBinding,
  BilibiliSubjectTrend,
  BilibiliSubjectWidgetLayout,
  BilibiliSubjectWorkbench,
  CreateBilibiliSubjectInput,
  QueryBilibiliSubjectTrendsInput,
  UpdateBilibiliSubjectBindingInput,
  UpdateBilibiliSubjectInput,
  UpdateBilibiliSubjectLayoutInput,
  RevokeBilibiliAuthResult,
  SubjectList,
  SubjectSummary
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"

import { AccountSubjectService } from "./account-subject-service"
import { BilibiliAuthService, type BilibiliAuthSource } from "./bilibili-auth-service"
import { BilibiliAuthWorkerSource } from "./bilibili-auth-worker-source"
import {
  BilibiliFollowerMonitorService,
  type BilibiliFollowerSource
} from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import {
  BilibiliLiveMonitorService,
  type BilibiliLiveSource
} from "./bilibili-live-service"
import { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"
import {
  BilibiliLiveRankService,
  type BilibiliLiveRankSource
} from "./bilibili-live-rank-service"
import { BilibiliLiveRankWorkerSource } from "./bilibili-live-rank-worker-source"
import {
  BilibiliLiveDanmakuService,
  type BilibiliLiveDanmakuSource
} from "./bilibili-live-danmaku-service"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { BilibiliLiveSessionExportService } from "./bilibili-live-session-export-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"
import { CredentialCipher } from "./credential-cipher"
import { DouyinAuthService, type DouyinOAuthSource } from "./douyin-auth-service"
import { DouyinBrowserWorkerSource } from "./douyin-browser-worker-source"
import { DouyinOAuthWorkerSource } from "./douyin-oauth-worker-source"
import { NdjsonBrowserWorkerTransport } from "./ndjson-browser-worker-transport"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"
import { NdjsonRealtimeWorkerTransport } from "./ndjson-realtime-worker-transport"

export interface LocalCoreRuntimeOptions {
  dataDirectory: string
  version: string
  now?: () => Date
  idFactory?: () => string
  followerSource?: BilibiliFollowerSource
  authSource?: BilibiliAuthSource
  liveSource?: BilibiliLiveSource
  liveRankSource?: BilibiliLiveRankSource
  liveDanmakuSource?: BilibiliLiveDanmakuSource
  douyinBrowserSource?: DouyinBrowserWorkerSource
  douyinOAuthSource?: DouyinOAuthSource
  credentialKey?: Uint8Array
  schedulerEnabled?: boolean
  schedulerDelayMs?: number
}

interface ResolvedLocalCoreRuntimeOptions {
  dataDirectory: string
  version: string
  now: () => Date
  idFactory: () => string
}

export class LocalCoreRuntime {
  private stopped = false

  private constructor(
    private readonly options: ResolvedLocalCoreRuntimeOptions,
    private readonly database: ControlDatabase,
    private readonly accountSubjects: AccountSubjectService,
    private readonly followers: BilibiliFollowerMonitorService,
    private readonly auth: BilibiliAuthService,
    private readonly liveSessions: BilibiliLiveSessionService,
    private readonly liveSessionExports: BilibiliLiveSessionExportService,
    private readonly live: BilibiliLiveMonitorService,
    private readonly liveRanks: BilibiliLiveRankService,
    private readonly liveDanmaku: BilibiliLiveDanmakuService,
    private readonly bilibiliSubjects: BilibiliSubjectService,
    private readonly douyinAuth: DouyinAuthService,
    private readonly startedAt: string
  ) {}

  private followerScheduler: NodeJS.Timeout | undefined
  private liveScheduler: NodeJS.Timeout | undefined
  private liveDanmakuScheduler: NodeJS.Timeout | undefined
  private followerCollectionRunning = false
  private liveCollectionRunning = false
  private schedulerEnabled = true
  private schedulerDelayMs = 60_000
  private followerSchedulerDelayMs = 1_000

  static async start(options: LocalCoreRuntimeOptions): Promise<LocalCoreRuntime> {
    const normalized: ResolvedLocalCoreRuntimeOptions = {
      dataDirectory: options.dataDirectory,
      version: options.version,
      now: options.now ?? (() => new Date()),
      idFactory: options.idFactory ?? randomUUID
    }
    const database = await ControlDatabase.open(normalized.dataDirectory)
    const credentialKey = options.credentialKey ?? credentialKeyFromEnvironment()
    const accountSubjects = new AccountSubjectService({
      database,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    const followerSource = options.followerSource ?? LocalCoreRuntime.defaultFollowerSource(normalized)
    const followers = new BilibiliFollowerMonitorService({
      database,
      source: followerSource,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    const authSource = options.authSource ?? LocalCoreRuntime.defaultAuthSource(normalized)
    const auth = new BilibiliAuthService({
      database,
      source: authSource,
      cipher: new CredentialCipher(credentialKey),
      now: normalized.now,
      idFactory: normalized.idFactory,
      onCredentialActivated: () => liveDanmaku.reconnectAnonymousConnectionsAsync()
    })
    const liveSessions = new BilibiliLiveSessionService({
      database,
      idFactory: normalized.idFactory,
      now: normalized.now
    })
    const liveSessionExports = new BilibiliLiveSessionExportService({
      database,
      sessions: liveSessions,
      exportDirectory: resolve(normalized.dataDirectory, "exports", "temp"),
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    const liveSource = options.liveSource ?? LocalCoreRuntime.defaultLiveSource(normalized)
    const live = new BilibiliLiveMonitorService({
      database,
      source: liveSource,
      now: normalized.now,
      idFactory: normalized.idFactory,
      sessionObserver: liveSessions
    })
    const liveRankSource = options.liveRankSource ?? LocalCoreRuntime.defaultLiveRankSource(normalized)
    const liveRanks = new BilibiliLiveRankService({
      database,
      source: liveRankSource,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    const liveDanmakuSource = options.liveDanmakuSource
      ?? LocalCoreRuntime.defaultLiveDanmakuSource(normalized)
    const liveDanmaku = new BilibiliLiveDanmakuService({
      database,
      source: liveDanmakuSource,
      now: normalized.now,
      idFactory: normalized.idFactory,
      sessionSink: liveSessions,
      resolveDisplayName: (uid) => followers.resolveDisplayName(uid),
      credentialProvider: async () => {
        try {
          return auth.connectionCredential()
        } catch {
          return undefined
        }
      }
    })
    const bilibiliSubjects = new BilibiliSubjectService({
      database,
      followers,
      live,
      liveDanmaku,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    const douyinBrowser = options.douyinBrowserSource
      ?? LocalCoreRuntime.defaultDouyinBrowserSource(normalized)
    const douyinOAuthSource = options.douyinOAuthSource
      ?? LocalCoreRuntime.defaultDouyinOAuthSource(normalized)
    const douyinAuth = new DouyinAuthService({
      database,
      browser: douyinBrowser,
      ...(douyinOAuthSource ? { oauthSource: douyinOAuthSource } : {}),
      cipher: new CredentialCipher(credentialKey),
      now: normalized.now,
      idFactory: normalized.idFactory,
      oauth: {
        mode: process.env.BMD_DOUYIN_OAUTH_MODE === "live" ? "live" : "disabled",
        ...(process.env.BMD_DOUYIN_OAUTH_CLIENT_KEY ? { clientKey: process.env.BMD_DOUYIN_OAUTH_CLIENT_KEY } : {}),
        ...(process.env.BMD_DOUYIN_OAUTH_CLIENT_SECRET ? { clientSecret: process.env.BMD_DOUYIN_OAUTH_CLIENT_SECRET } : {}),
        ...(process.env.BMD_DOUYIN_OAUTH_REDIRECT_URI ? { redirectUri: process.env.BMD_DOUYIN_OAUTH_REDIRECT_URI } : {}),
        ...(process.env.BMD_DOUYIN_OAUTH_SCOPE ? { scope: process.env.BMD_DOUYIN_OAUTH_SCOPE } : {})
      }
    })
    const runtime = new LocalCoreRuntime(
      normalized,
      database,
      accountSubjects,
      followers,
      auth,
      liveSessions,
      liveSessionExports,
      live,
      liveRanks,
      liveDanmaku,
      bilibiliSubjects,
      douyinAuth,
      normalized.now().toISOString()
    )
    runtime.schedulerEnabled = options.schedulerEnabled ?? true
    runtime.schedulerDelayMs = Math.max(1_000, options.schedulerDelayMs ?? 60_000)
    // The original follower page checked due users every second. Core owns that timer locally.
    runtime.followerSchedulerDelayMs = Math.max(1_000, options.schedulerDelayMs ?? 1_000)
    if (runtime.schedulerEnabled) {
      runtime.startFollowerScheduler()
      runtime.startLiveScheduler()
      runtime.startLiveDanmakuScheduler()
    }
    return runtime
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

  addBilibiliFollowerMonitor(input: AddBilibiliFollowerMonitorInput): Promise<BilibiliFollowerMonitor> {
    this.ensureRunning()
    return this.followers.addUser(input)
  }

  listBilibiliFollowerMonitors(input?: { limit?: number }): BilibiliFollowerMonitorList {
    this.ensureRunning()
    return this.followers.listUsers(input)
  }

  updateBilibiliFollowerMonitorStatus(userId: string, enabled: boolean): BilibiliFollowerMonitor {
    this.ensureRunning()
    return this.followers.updateStatus(userId, enabled)
  }

  updateBilibiliFollowerMonitorSettings(
    userId: string,
    intervalSeconds: number
  ): BilibiliFollowerMonitor {
    this.ensureRunning()
    return this.followers.updateInterval(userId, intervalSeconds)
  }

  refreshBilibiliFollowerMonitor(userId: string): Promise<BilibiliFollowerCollectResult> {
    this.ensureRunning()
    return this.followers.refreshNow(userId)
  }

  deleteBilibiliFollowerMonitor(userId: string): void {
    this.ensureRunning()
    this.followers.deleteUser(userId)
  }

  queryBilibiliFollowerTrend(
    userId: string,
    input?: { from?: string; to?: string; limit?: number }
  ): BilibiliFollowerTrend {
    this.ensureRunning()
    return this.followers.trend(userId, input)
  }

  queryBilibiliFollowerTrends(input?: {
    userIds?: string[]
    from?: string
    to?: string
    limitPerUser?: number
  }): BilibiliFollowerTrend[] {
    this.ensureRunning()
    return this.followers.trends(input)
  }

  startBilibiliQrLogin(): Promise<BilibiliQrLoginStart> {
    this.ensureRunning()
    return this.auth.startQrLogin()
  }

  pollBilibiliQrLogin(loginId: string): Promise<BilibiliQrLoginStatus> {
    this.ensureRunning()
    return this.auth.pollQrLogin(loginId)
  }

  getBilibiliAuthStatus(): Promise<BilibiliAuthStatus> {
    this.ensureRunning()
    return this.auth.currentStatus()
  }

  refreshBilibiliAuth(): Promise<BilibiliAuthRefreshResult> {
    this.ensureRunning()
    return this.auth.refreshCurrentCredential()
  }

  getBilibiliCredential(): Promise<BilibiliCredential> {
    this.ensureRunning()
    return this.auth.currentCredential()
  }

  revokeBilibiliAuth(): Promise<RevokeBilibiliAuthResult> {
    this.ensureRunning()
    return this.auth.revokeCurrentCredential()
  }

  addBilibiliLiveRoom(input: AddBilibiliLiveRoomInput): Promise<BilibiliLiveRoom> {
    this.ensureRunning()
    return this.live.addRoom(input)
  }

  listBilibiliLiveRooms(input?: { limit?: number }): BilibiliLiveRoomList {
    this.ensureRunning()
    return this.live.listRooms(input)
  }

  updateBilibiliLiveRoomStatus(roomMonitorId: string, enabled: boolean): BilibiliLiveRoom {
    this.ensureRunning()
    return this.live.updateStatus(roomMonitorId, enabled)
  }

  updateBilibiliLiveRoomSettings(roomMonitorId: string, intervalSeconds: number): BilibiliLiveRoom {
    this.ensureRunning()
    return this.live.updateInterval(roomMonitorId, intervalSeconds)
  }

  refreshBilibiliLiveRoom(roomMonitorId: string): Promise<BilibiliLiveCollectResult> {
    this.ensureRunning()
    return this.live.refreshNow(roomMonitorId)
  }

  deleteBilibiliLiveRoom(roomMonitorId: string): void {
    this.ensureRunning()
    this.live.deleteRoom(roomMonitorId)
  }

  getBilibiliLiveSummary(): BilibiliLiveSummary {
    this.ensureRunning()
    return this.live.summary()
  }

  queryBilibiliLiveTrend(input: {
    roomMonitorId: string
    from?: string
    to?: string
    limit?: number
  }): BilibiliLiveRoomTrend {
    this.ensureRunning()
    return this.live.trend(input)
  }

  queryBilibiliLiveTrends(input?: {
    roomMonitorIds?: string[]
    from?: string
    to?: string
    limitPerRoom?: number
  }): BilibiliLiveRoomTrend[] {
    this.ensureRunning()
    return this.live.trends(input)
  }

  listBilibiliLiveEvents(input?: { limit?: number }): BilibiliLiveStatusEvent[] {
    this.ensureRunning()
    return this.live.events(input)
  }

  getBilibiliLiveRankSummary(roomMonitorId: string): BilibiliLiveRankSummary {
    this.ensureRunning()
    return this.liveRanks.summary(roomMonitorId)
  }

  getLatestBilibiliLiveRank(input: BilibiliLiveRankLatestInput): BilibiliLiveRankSnapshot {
    this.ensureRunning()
    return this.liveRanks.latest(input)
  }

  refreshBilibiliLiveRanks(
    input: BilibiliLiveRankRefreshInput
  ): Promise<BilibiliLiveRankRefreshResult> {
    this.ensureRunning()
    return this.liveRanks.refresh(input)
  }

  startBilibiliLiveDanmaku(
    input: StartBilibiliLiveDanmakuInput
  ): Promise<BilibiliLiveDanmakuStatus> {
    this.ensureRunning()
    return this.liveDanmaku.start(input)
  }

  stopBilibiliLiveDanmaku(roomMonitorId: string): Promise<BilibiliLiveDanmakuStatus> {
    this.ensureRunning()
    return this.liveDanmaku.stop(roomMonitorId)
  }

  getBilibiliLiveDanmakuStatus(roomMonitorId: string): BilibiliLiveDanmakuStatus {
    this.ensureRunning()
    return this.liveDanmaku.status(roomMonitorId)
  }

  getBilibiliLiveDanmakuRecent(
    input: QueryBilibiliLiveDanmakuRecentInput
  ): BilibiliLiveDanmakuRecent[] {
    this.ensureRunning()
    return this.liveDanmaku.recent(input)
  }

  getBilibiliLiveDanmakuMetrics(
    input: QueryBilibiliLiveDanmakuMetricsInput
  ): BilibiliLiveDanmakuMetricBucket[] {
    this.ensureRunning()
    return this.liveDanmaku.metrics(input)
  }

  listBilibiliLiveSessions(
    input: ListBilibiliLiveSessionsInput
  ): BilibiliLiveSessionSummary[] {
    this.ensureRunning()
    return this.liveSessions.list(input)
  }

  getBilibiliLiveSession(sessionId: string): BilibiliLiveSessionSummary {
    this.ensureRunning()
    return this.liveSessions.get(sessionId)
  }

  listBilibiliLiveSessionUsers(
    input: ListBilibiliLiveSessionUsersInput
  ): BilibiliLiveSessionUser[] {
    this.ensureRunning()
    return this.liveSessions.users(input)
  }

  queryBilibiliLiveSessionEvents(
    input: QueryBilibiliLiveSessionEventsInput
  ): BilibiliLiveSessionEventPage {
    this.ensureRunning()
    return this.liveSessions.events(input)
  }

  getBilibiliLiveSessionInsight(
    input: QueryBilibiliLiveSessionInsightInput
  ): BilibiliLiveSessionInsight {
    this.ensureRunning()
    return this.liveSessions.insight(input)
  }

  prepareBilibiliLiveSessionExport(
    input: ExportBilibiliLiveSessionInput
  ): Promise<PreparedBilibiliLiveSessionExport> {
    this.ensureRunning()
    return this.liveSessionExports.prepare(input)
  }

  createBilibiliSubject(input: CreateBilibiliSubjectInput): Promise<BilibiliSubject> {
    this.ensureRunning()
    return this.bilibiliSubjects.create(input)
  }

  listBilibiliSubjects(limit?: number): BilibiliSubject[] {
    this.ensureRunning()
    return this.bilibiliSubjects.list(limit)
  }

  getBilibiliSubject(subjectId: string): BilibiliSubject {
    this.ensureRunning()
    return this.bilibiliSubjects.get(subjectId)
  }

  updateBilibiliSubject(input: UpdateBilibiliSubjectInput): BilibiliSubject {
    this.ensureRunning()
    return this.bilibiliSubjects.update(input)
  }

  deleteBilibiliSubject(subjectId: string): void {
    this.ensureRunning()
    this.bilibiliSubjects.remove(subjectId)
  }

  bindBilibiliSubject(
    input: UpdateBilibiliSubjectBindingInput
  ): Promise<BilibiliSubjectBinding> {
    this.ensureRunning()
    return this.bilibiliSubjects.bind(input)
  }

  getBilibiliSubjectWorkbench(subjectId: string): BilibiliSubjectWorkbench {
    this.ensureRunning()
    return this.bilibiliSubjects.workbench(subjectId)
  }

  queryBilibiliSubjectTrends(
    input: QueryBilibiliSubjectTrendsInput
  ): BilibiliSubjectTrend {
    this.ensureRunning()
    return this.bilibiliSubjects.trends(input)
  }

  updateBilibiliSubjectLayout(
    input: UpdateBilibiliSubjectLayoutInput
  ): BilibiliSubjectWidgetLayout[] {
    this.ensureRunning()
    return this.bilibiliSubjects.updateLayout(input)
  }

  getDouyinAuthStatus() {
    this.ensureRunning()
    return this.douyinAuth.status()
  }

  startDouyinWebQr() {
    this.ensureRunning()
    return this.douyinAuth.startWebQr()
  }

  pollDouyinWebQr(loginId: string) {
    this.ensureRunning()
    return this.douyinAuth.pollWebQr(loginId)
  }

  validateDouyinWeb() {
    this.ensureRunning()
    return this.douyinAuth.validateWeb()
  }

  startDouyinOAuth() {
    this.ensureRunning()
    return this.douyinAuth.startOAuth()
  }

  completeDouyinOAuth(input: { state: string; code: string }) {
    this.ensureRunning()
    return this.douyinAuth.completeOAuth(input)
  }

  failDouyinOAuthCallback(input: { state: string; message: string }) {
    this.ensureRunning()
    return this.douyinAuth.failOAuthCallback(input)
  }

  refreshDouyinOAuth() {
    this.ensureRunning()
    return this.douyinAuth.refreshOAuth()
  }

  getDouyinCredential(kind: "oauth" | "web") {
    this.ensureRunning()
    return this.douyinAuth.credential(kind)
  }

  revokeDouyinCredential(kind: "oauth" | "web") {
    this.ensureRunning()
    return this.douyinAuth.revoke(kind)
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.followerScheduler) clearInterval(this.followerScheduler)
    if (this.liveScheduler) clearInterval(this.liveScheduler)
    if (this.liveDanmakuScheduler) clearInterval(this.liveDanmakuScheduler)
    this.followerScheduler = undefined
    this.liveScheduler = undefined
    this.liveDanmakuScheduler = undefined
    // Disable writes/queued upgrades before waiting for any worker's shutdown.
    await Promise.all([this.followers.stop?.(), this.auth.stop(), this.liveDanmaku.stopAll()])
    await this.live.stop()
    await this.liveRanks.stop()
    await this.douyinAuth.stop()
    this.database.close()
  }

  private ensureRunning(): void {
    if (this.stopped) throw new Error("Local Core has already stopped.")
  }

  private startFollowerScheduler(): void {
    this.followerScheduler = setInterval(() => {
      if (this.followerCollectionRunning || this.stopped) return
      this.followerCollectionRunning = true
      void this.followers.collectDueUsers().finally(() => {
        this.followerCollectionRunning = false
      })
    }, this.followerSchedulerDelayMs)
    this.followerScheduler.unref()
  }

  private startLiveScheduler(): void {
    this.liveScheduler = setInterval(() => {
      if (this.liveCollectionRunning || this.stopped) return
      this.liveCollectionRunning = true
      void this.live.collectDueRooms().finally(() => {
        this.liveCollectionRunning = false
      })
    }, this.schedulerDelayMs)
    this.liveScheduler.unref()
  }

  private startLiveDanmakuScheduler(): void {
    this.liveDanmakuScheduler = setInterval(() => {
      if (this.stopped) return
      void this.liveDanmaku.syncAutoConnections()
    }, 5_000)
    this.liveDanmakuScheduler.unref()
  }

  private static defaultFollowerSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): BilibiliFollowerSource {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable) return unavailableFollowerSource()
    return new BilibiliFollowerWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "crawler",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }))
  }

  private static defaultAuthSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): BilibiliAuthSource {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable) return unavailableAuthSource()
    return new BilibiliAuthWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "auth",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }))
  }

  private static defaultLiveSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): BilibiliLiveSource {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable) return unavailableLiveSource()
    return new BilibiliLiveWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "crawler",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }))
  }

  private static defaultLiveRankSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): BilibiliLiveRankSource {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable) return unavailableLiveRankSource()
    return new BilibiliLiveRankWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "crawler",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }))
  }

  private static defaultLiveDanmakuSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): BilibiliLiveDanmakuSource {
    const nodeExecutable = process.env.BMD_NODE_EXE?.trim()
    const workerEntry = process.env.BMD_REALTIME_WORKER_ENTRY?.trim()
    if (!nodeExecutable || !workerEntry) return unavailableLiveDanmakuSource()
    return new BilibiliLiveDanmakuWorkerSource(new NdjsonRealtimeWorkerTransport({
      nodeExecutable,
      workerEntry,
      dataDirectory: options.dataDirectory,
      requestTimeoutMs: 30_000
    }))
  }

  private static defaultDouyinBrowserSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): DouyinBrowserWorkerSource {
    const nodeExecutable = process.env.BMD_NODE_EXE?.trim()
    const workerEntry = process.env.BMD_BROWSER_WORKER_ENTRY?.trim()
    if (!nodeExecutable || !workerEntry) return unavailableDouyinBrowserSource()
    return new DouyinBrowserWorkerSource(new NdjsonBrowserWorkerTransport({
      nodeExecutable,
      workerEntry,
      dataDirectory: options.dataDirectory,
      requestTimeoutMs: 75_000
    }))
  }

  private static defaultDouyinOAuthSource(
    options: ResolvedLocalCoreRuntimeOptions
  ): DouyinOAuthSource | undefined {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable) return undefined
    return new DouyinOAuthWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "auth",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }))
  }
}

function unavailableFollowerSource(): BilibiliFollowerSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Python Crawler Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return {
    fetchCard: unavailable,
    fetchRelationStat: unavailable
  }
}

function unavailableAuthSource(): BilibiliAuthSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Python Auth Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return {
    generate: unavailable,
    poll: unavailable,
    validate: unavailable
  }
}

function unavailableLiveSource(): BilibiliLiveSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Python Crawler Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return {
    fetchRoomInit: unavailable,
    fetchRoomInfo: unavailable,
    fetchRoomInfoOld: unavailable,
    fetchStatusByUids: unavailable
  }
}

function unavailableLiveRankSource(): BilibiliLiveRankSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Python Crawler Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return { fetch: unavailable }
}

function unavailableLiveDanmakuSource(): BilibiliLiveDanmakuSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Node Realtime Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return {
    start: unavailable,
    stop: async () => undefined,
    stopAll: async () => undefined
  }
}

function unavailableDouyinBrowserSource(): DouyinBrowserWorkerSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Node Browser Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return new DouyinBrowserWorkerSource({ request: unavailable, stop: async () => undefined })
}

function credentialKeyFromEnvironment(): Uint8Array {
  const configured = process.env.BMD_CREDENTIAL_KEY_BASE64?.trim()
  if (!configured) return randomBytes(32)
  const key = Buffer.from(configured, "base64")
  if (key.byteLength !== 32 || key.toString("base64") !== configured) {
    throw new Error("BMD_CREDENTIAL_KEY_BASE64 must be canonical Base64 containing 32 bytes.")
  }
  return key
}
