import { randomBytes, randomUUID } from "node:crypto"
import { resolve } from "node:path"

import type {
  BindSubjectAccountInput,
  AddBilibiliFollowerMonitorInput,
  AddBilibiliFollowerMonitorInputV2,
  BootstrapResponse,
  CreatePlatformAccountInput,
  CreateSubjectInput,
  ListPlatformAccountsInput,
  ListSubjectsInput,
  PlatformAccount,
  PlatformAccountList,
  PlatformAdapterList,
  PlatformCollectionExecution,
  RunPlatformCollectionInput,
  BilibiliFollowerCollectResult,
  BilibiliFollowerCollectResultV2,
  BilibiliFollowerHttpConfiguration,
  BilibiliFollowerMonitor,
  BilibiliFollowerMonitorV2,
  BilibiliFollowerMonitorList,
  BilibiliFollowerMonitorListV2,
  BilibiliFollowerTrend,
  BilibiliFollowerTrendV2,
  BilibiliAuthRefreshResult,
  BilibiliAuthStatus,
  BilibiliCredential,
  BilibiliQrLoginStart,
  BilibiliQrLoginStatus,
  AddBilibiliLiveRoomInput,
  BilibiliLiveHttpConfiguration,
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
  BilibiliSubjectTrendV2,
  BilibiliSubjectWidgetLayout,
  BilibiliSubjectWorkbench,
  BilibiliSubjectWorkbenchV2,
  CreateBilibiliSubjectInput,
  QueryBilibiliSubjectTrendsInput,
  UpdateBilibiliSubjectBindingInput,
  UpdateBilibiliSubjectInput,
  UpdateBilibiliSubjectLayoutInput,
  RevokeBilibiliAuthResult,
  SubjectList,
  SubjectSummary
} from "@bmd/contracts"
import { BilibiliWbiKeysSchema, UpdateBilibiliSubjectLayoutInputSchema } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"

import { AccountSubjectService } from "./account-subject-service"
import { BilibiliAuthService, type BilibiliAuthSource } from "./bilibili-auth-service"
import { BilibiliAuthWorkerSource } from "./bilibili-auth-worker-source"
import {
  BilibiliFollowerMonitorService,
  type BilibiliFollowerSource
} from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { PlatformCollectionService } from "./platform-collection-service"
import {
  BilibiliLiveMonitorService,
  type BilibiliLiveMonitorServiceOptions,
  type BilibiliLiveSource
} from "./bilibili-live-service"
import { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"
import { loadLiveCollectionConfiguration } from "./bilibili-live-collection-config"
import {
  BilibiliLiveRankService,
  type BilibiliLiveRankSource
} from "./bilibili-live-rank-service"
import { LocalRequestRateLimiter } from "./local-request-rate-limiter"
import { BilibiliLiveRankWorkerSource } from "./bilibili-live-rank-worker-source"
import {
  BilibiliLiveDanmakuService,
  type BilibiliLiveDanmakuSource
} from "./bilibili-live-danmaku-service"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { BilibiliLiveSessionExportService } from "./bilibili-live-session-export-service"
import { recoverExportSnapshotWorkspaces } from "./export-snapshot-workspace"
import {
  recoverExportPreparedWorkspaces, resolvePreparedExportMainContext, validatePreparedExportCredentialKey,
  type PreparedExportMainContext
} from "./export-prepared-workspace"
import { BilibiliSubjectService } from "./bilibili-subject-service"
import { legacyFollowerResponse } from "./legacy-follower-response"
import { BILIBILI_LIVE_STORAGE_DEPENDENCY_ERROR_MESSAGE, BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_ERROR_MESSAGE } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"
import { loadSubjectMonitorConfiguration } from "./subject-monitor-config"
import { loadLiveDanmakuConfiguration } from "./bilibili-live-danmaku-config"
import { loadLiveRankConfiguration } from "./bilibili-live-rank-config"
import { loadFollowerCollectionConfiguration } from "./bilibili-follower-collection-config"
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
  liveSource?: BilibiliLiveMonitorServiceOptions["source"]
  liveRankSource?: BilibiliLiveRankSource
  liveDanmakuSource?: BilibiliLiveDanmakuSource
  douyinBrowserSource?: DouyinBrowserWorkerSource
  douyinOAuthSource?: DouyinOAuthSource
  credentialKey?: Uint8Array
  mainContext?: PreparedExportMainContext
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
  private stopPromise: Promise<void> | undefined
  private readonly activeSessionExports = new Set<Promise<PreparedBilibiliLiveSessionExport>>()
  private readonly sessionExportLifetime = new AbortController()
  private sharedRealtimeTransport: NdjsonRealtimeWorkerTransport | undefined

  private constructor(
    private readonly options: ResolvedLocalCoreRuntimeOptions,
    private readonly database: ControlDatabase,
    private readonly accountSubjects: AccountSubjectService,
    private readonly followersInstance: BilibiliFollowerMonitorService | undefined,
    private readonly independentProfileSource: BilibiliFollowerSource | undefined,
    private readonly auth: BilibiliAuthService,
    private readonly liveSessionsInstance: BilibiliLiveSessionService | undefined,
    private readonly liveSessionExportsInstance: BilibiliLiveSessionExportService | undefined,
    private readonly liveInstance: BilibiliLiveMonitorService | undefined,
    private readonly liveRanksInstance: BilibiliLiveRankService | undefined,
    private readonly liveDanmakuInstance: BilibiliLiveDanmakuService | undefined,
    private readonly bilibiliSubjectsInstance: BilibiliSubjectService | undefined,
    private readonly douyinAuth: DouyinAuthService,
    private readonly platformCollection: PlatformCollectionService,
    private readonly startedAt: string
  ) {}

  private followerScheduler: NodeJS.Timeout | undefined
  private liveScheduler: NodeJS.Timeout | undefined
  private liveDanmakuScheduler: NodeJS.Timeout | undefined
  private schedulerEnabled = true
  private liveSchedulerDelayMs = 1_000
  private liveDanmakuSchedulerDelayMs = 5_000
  private followerSchedulerDelayMs = 1_000

  static async start(options: LocalCoreRuntimeOptions): Promise<LocalCoreRuntime> {
    const liveConfiguration = await loadLiveCollectionConfiguration(options.dataDirectory, process.env)
    const followerConfiguration = await loadFollowerCollectionConfiguration(options.dataDirectory, process.env)
    const subjectConfiguration = await loadSubjectMonitorConfiguration(options.dataDirectory, process.env)
    const danmakuConfiguration = await loadLiveDanmakuConfiguration(options.dataDirectory, process.env, liveConfiguration.storageEnabled)
    const rankConfiguration = await loadLiveRankConfiguration(options.dataDirectory, process.env)
    // The original workbench has mandatory live repository/service dependencies.
    // Reject that invalid combination before any database or Worker is opened.
    if (subjectConfiguration.enabled && !liveConfiguration.storageEnabled) {
      throw new CoreApplicationError("BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID", BILIBILI_LIVE_STORAGE_DEPENDENCY_ERROR_MESSAGE)
    }
    if (subjectConfiguration.enabled && !followerConfiguration.storageEnabled) {
      throw new CoreApplicationError("BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID", BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_ERROR_MESSAGE)
    }
    const normalized: ResolvedLocalCoreRuntimeOptions = {
      dataDirectory: options.dataDirectory,
      version: options.version,
      now: options.now ?? (() => new Date()),
      idFactory: options.idFactory ?? randomUUID
    }
    const credentialKey = options.credentialKey ?? credentialKeyFromEnvironment()
    validatePreparedExportCredentialKey(credentialKey)
    const mainContext = resolvePreparedExportMainContext(options.mainContext)
    const exportDirectory = resolve(normalized.dataDirectory, "exports", "temp")
    await recoverExportPreparedWorkspaces(exportDirectory, credentialKey)
    await recoverExportSnapshotWorkspaces(exportDirectory)
    const database = await ControlDatabase.open(normalized.dataDirectory)
    const rateLimiter = new LocalRequestRateLimiter(normalized.now)
    const accountSubjects = new AccountSubjectService({
      database,
      now: normalized.now,
      idFactory: normalized.idFactory
    })
    // The original public card adapter is available independently of monitor storage.
    const followerHttpConfiguration = {
      connectTimeoutMs: followerConfiguration.connectTimeoutMs, readTimeoutMs: followerConfiguration.readTimeoutMs,
      userAgent: followerConfiguration.userAgent, referer: followerConfiguration.referer
    }
    const followerSource = options.followerSource ?? LocalCoreRuntime.defaultFollowerSource(normalized, followerHttpConfiguration)
    const platformCollection = new PlatformCollectionService({ source: followerSource, idFactory: normalized.idFactory })
    const followers = followerConfiguration.storageEnabled && followerSource ? new BilibiliFollowerMonitorService({
      database,
      rateLimiter,
      source: followerSource,
      enabled: followerConfiguration.enabled,
      defaultIntervalSeconds: followerConfiguration.defaultIntervalSeconds,
      minIntervalSeconds: followerConfiguration.minIntervalSeconds,
      maxIntervalSeconds: followerConfiguration.maxIntervalSeconds,
      shortIntervalWarningSeconds: followerConfiguration.shortIntervalWarningSeconds,
      failureBackoffSeconds: followerConfiguration.failureBackoffSeconds,
      dueBatchSize: followerConfiguration.dueBatchSize,
      maxAttempts: followerConfiguration.maxAttempts,
      retryBackoffMs: followerConfiguration.retryBackoffMs,
      requestMinIntervalMs: followerConfiguration.requestMinIntervalMs,
      now: normalized.now,
      idFactory: normalized.idFactory
    }) : undefined
    const authSource = options.authSource ?? LocalCoreRuntime.defaultAuthSource(normalized)
    const auth = new BilibiliAuthService({
      database,
      source: authSource,
      cipher: new CredentialCipher(credentialKey),
      now: normalized.now,
      idFactory: normalized.idFactory,
      ...(liveConfiguration.storageEnabled
        ? { onCredentialActivated: () => liveDanmaku?.reconnectAnonymousConnectionsAsync() }
        : {})
    })
    const liveSessions = liveConfiguration.storageEnabled ? new BilibiliLiveSessionService({
      database,
      idFactory: normalized.idFactory,
      now: normalized.now
    }) : undefined
    const liveSessionExports = liveSessions ? new BilibiliLiveSessionExportService({
      database,
      sessions: liveSessions,
      exportDirectory: resolve(normalized.dataDirectory, "exports", "temp"),
      credentialKey,
      mainContext,
      now: normalized.now,
      idFactory: normalized.idFactory
    }) : undefined
    const liveHttpConfiguration = {
      connectTimeoutMs: liveConfiguration.connectTimeoutMs, readTimeoutMs: liveConfiguration.readTimeoutMs,
      userAgent: liveConfiguration.userAgent, referer: liveConfiguration.referer
    }
    const credentialProvider = async () => {
      try { return auth.connectionCredential() } catch { return undefined }
    }
    const sharedRealtimeTransport = liveConfiguration.storageEnabled && ((rankConfiguration.enabled && !options.liveRankSource) || !options.liveDanmakuSource)
      ? LocalCoreRuntime.defaultRealtimeTransport(normalized, async () => {
        const current = await credentialProvider()
        const authUid = current?.account?.mid
        return current?.cookieHeader && authUid && /^[1-9]\d*$/u.test(authUid)
          ? { cookieHeader: current.cookieHeader, authUid } : undefined
      }) : undefined
    const live = liveSessions ? new BilibiliLiveMonitorService({
      database,
      rateLimiter,
      source: options.liveSource ?? LocalCoreRuntime.defaultLiveSource(normalized, liveHttpConfiguration),
      enabled: liveConfiguration.enabled,
      dueBatchSize: liveConfiguration.dueBatchSize,
      statusBatchSize: liveConfiguration.statusBatchSize,
      defaultIntervalSeconds: liveConfiguration.defaultIntervalSeconds,
      minIntervalSeconds: liveConfiguration.minIntervalSeconds,
      maxIntervalSeconds: liveConfiguration.maxIntervalSeconds,
      shortIntervalWarningSeconds: liveConfiguration.shortIntervalWarningSeconds,
      failureBackoffSeconds: liveConfiguration.failureBackoffSeconds,
      requestMinIntervalMs: liveConfiguration.requestMinIntervalMs,
      maxAttempts: liveConfiguration.maxAttempts,
      retryBackoffMs: liveConfiguration.retryBackoffMs,
      now: normalized.now,
      idFactory: normalized.idFactory,
      sessionObserver: liveSessions
    }) : undefined
    const liveRanks = liveConfiguration.storageEnabled && rankConfiguration.enabled ? new BilibiliLiveRankService({
      database,
      rateLimiter,
      source: options.liveRankSource ?? LocalCoreRuntime.defaultLiveRankSource(normalized, liveHttpConfiguration,
        danmakuConfiguration.wbiCacheSeconds, sharedRealtimeTransport),
      pageSize: rankConfiguration.pageSize,
      guardPageSize: rankConfiguration.guardPageSize,
      maxPages: rankConfiguration.maxPages,
      requestMinIntervalMs: rankConfiguration.requestMinIntervalMs,
      webLocation: rankConfiguration.webLocation,
      now: normalized.now,
      idFactory: normalized.idFactory
    }) : undefined
    const liveDanmaku = liveSessions ? new BilibiliLiveDanmakuService({
      database,
      enabled: danmakuConfiguration.enabled,
      autoStartEnabled: danmakuConfiguration.autoStartEnabled,
      maxConnections: danmakuConfiguration.maxConnections,
      protocolVersion: danmakuConfiguration.protocolVersion,
      recentMessageLimitPerRoom: danmakuConfiguration.recentMessageLimitPerRoom,
      bucketSeconds: danmakuConfiguration.bucketSeconds,
      cacheConfiguration: {
        wbiCacheSeconds: danmakuConfiguration.wbiCacheSeconds,
        buvidCacheSeconds: danmakuConfiguration.buvidCacheSeconds
      },
      connectionConfiguration: {
        heartbeatSeconds: danmakuConfiguration.heartbeatSeconds,
        connectTimeoutMs: danmakuConfiguration.connectTimeoutMs,
        useLoginCredential: danmakuConfiguration.useLoginCredential,
        webLocation: danmakuConfiguration.webLocation,
        clientVersion: danmakuConfiguration.clientVersion
      },
      source: options.liveDanmakuSource ?? LocalCoreRuntime.defaultLiveDanmakuSource(sharedRealtimeTransport, liveHttpConfiguration),
      now: normalized.now,
      idFactory: normalized.idFactory,
      sessionSink: liveSessions,
      resolveDisplayName: async uid => {
        if (!followerSource || !/^[1-9]\d*$/u.test(uid)) return undefined
        const profile = await followerSource.fetchProfile?.({ mid: uid, taskId: normalized.idFactory(),
          leaseId: normalized.idFactory(), attempt: 1 })
        return profile?.nickname.trim() || undefined
      },
      credentialProvider
    }) : undefined
    const bilibiliSubjects = subjectConfiguration.enabled && followers && live && liveDanmaku ? new BilibiliSubjectService({
      database,
      followers,
      live,
      liveDanmaku,
      now: normalized.now,
      idFactory: normalized.idFactory
    }) : undefined
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
      followers ? undefined : followerSource,
      auth,
      liveSessions,
      liveSessionExports,
      live,
      liveRanks,
      liveDanmaku,
      bilibiliSubjects,
      douyinAuth,
      platformCollection,
      normalized.now().toISOString()
    )
    runtime.sharedRealtimeTransport = sharedRealtimeTransport
    runtime.schedulerEnabled = options.schedulerEnabled ?? true
    runtime.liveDanmakuSchedulerDelayMs = danmakuConfiguration.schedulerDelayMs
    runtime.liveSchedulerDelayMs = options.schedulerDelayMs === undefined
      ? liveConfiguration.schedulerDelayMs : Math.max(1_000, options.schedulerDelayMs)
    runtime.followerSchedulerDelayMs = options.schedulerDelayMs === undefined
      ? followerConfiguration.schedulerDelayMs : Math.max(1_000, options.schedulerDelayMs)
    if (runtime.schedulerEnabled) {
      if (followers && followerConfiguration.enabled) runtime.startFollowerScheduler(0)
      if (live && liveConfiguration.enabled) runtime.startLiveScheduler(0)
      if (liveDanmaku) runtime.startLiveDanmakuScheduler(0)
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

  listPlatformAdapters(): PlatformAdapterList {
    this.ensureRunning()
    return this.platformCollection.listAdapters()
  }

  runPlatformCollection(input: RunPlatformCollectionInput): Promise<PlatformCollectionExecution> {
    this.ensureRunning()
    return this.platformCollection.runOnce(input)
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
    return legacyFollowerResponse(() => this.followers.addUser(input))
  }

  listBilibiliFollowerMonitors(input?: { limit?: number }): BilibiliFollowerMonitorList {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.followers.listUsers(input))
  }

  updateBilibiliFollowerMonitorStatus(userId: string, enabled: boolean): BilibiliFollowerMonitor {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.followers.updateStatus(userId, enabled))
  }

  updateBilibiliFollowerMonitorSettings(
    userId: string,
    intervalSeconds: number
  ): BilibiliFollowerMonitor {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.followers.updateInterval(userId, intervalSeconds))
  }

  refreshBilibiliFollowerMonitor(userId: string): Promise<BilibiliFollowerCollectResult> {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.followers.refreshNow(userId))
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
    return legacyFollowerResponse(() => this.followers.trend(userId, input))
  }

  queryBilibiliFollowerTrends(input?: {
    userIds?: string[]
    from?: string
    to?: string
    limitPerUser?: number
  }): BilibiliFollowerTrend[] {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.followers.trends(input))
  }

  addBilibiliFollowerMonitorV2(input: AddBilibiliFollowerMonitorInputV2): Promise<BilibiliFollowerMonitorV2> {
    this.ensureRunning()
    return this.followers.addUserV2(input)
  }

  listBilibiliFollowerMonitorsV2(input?: { limit?: number }): BilibiliFollowerMonitorListV2 {
    this.ensureRunning()
    return this.followers.listUsersV2(input)
  }

  updateBilibiliFollowerMonitorStatusV2(userId: string, enabled: boolean): BilibiliFollowerMonitorV2 {
    this.ensureRunning()
    return this.followers.updateStatusV2(userId, enabled)
  }

  updateBilibiliFollowerMonitorSettingsV2(userId: string, intervalSeconds: number): BilibiliFollowerMonitorV2 {
    this.ensureRunning()
    return this.followers.updateIntervalV2(userId, intervalSeconds)
  }

  refreshBilibiliFollowerMonitorV2(userId: string): Promise<BilibiliFollowerCollectResultV2> {
    this.ensureRunning()
    return this.followers.refreshNowV2(userId)
  }

  queryBilibiliFollowerTrendV2(userId: string, input?: { from?: string; to?: string; limit?: number }): BilibiliFollowerTrendV2 {
    this.ensureRunning()
    return this.followers.trendV2(userId, input)
  }

  queryBilibiliFollowerTrendsV2(input?: { userIds?: string[]; from?: string; to?: string; limitPerUser?: number }): BilibiliFollowerTrendV2[] {
    this.ensureRunning()
    return this.followers.trendsV2(input)
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

  addBilibiliLiveRoomV2(input: AddBilibiliLiveRoomInput): Promise<import("@bmd/contracts").BilibiliLiveRoomV2> {
    this.ensureRunning()
    return this.live.addRoomV2(input)
  }

  listBilibiliLiveRoomsV2(input?: { limit?: number }): import("@bmd/contracts").BilibiliLiveRoomListV2 {
    this.ensureRunning()
    return this.live.listRoomsV2(input)
  }

  updateBilibiliLiveRoomStatusV2(roomMonitorId: string, enabled: boolean): import("@bmd/contracts").BilibiliLiveRoomV2 {
    this.ensureRunning()
    return this.live.updateStatusV2(roomMonitorId, enabled)
  }

  updateBilibiliLiveRoomSettingsV2(roomMonitorId: string, intervalSeconds: number): import("@bmd/contracts").BilibiliLiveRoomV2 {
    this.ensureRunning()
    return this.live.updateIntervalV2(roomMonitorId, intervalSeconds)
  }

  refreshBilibiliLiveRoomV2(roomMonitorId: string): Promise<import("@bmd/contracts").BilibiliLiveCollectResultV2> {
    this.ensureRunning()
    return this.live.refreshNowV2(roomMonitorId)
  }

  getBilibiliLiveSummaryV2(): import("@bmd/contracts").BilibiliLiveSummaryV2 {
    this.ensureRunning()
    return this.live.summaryV2()
  }

  queryBilibiliLiveTrendV2(input: {
    roomMonitorId: string
    from?: string
    to?: string
    limit?: number
  }): import("@bmd/contracts").BilibiliLiveRoomTrendV2 {
    this.ensureRunning()
    return this.live.trendV2(input)
  }

  queryBilibiliLiveTrendsV2(input?: {
    roomMonitorIds?: string[]
    from?: string
    to?: string
    limitPerRoom?: number
  }): import("@bmd/contracts").BilibiliLiveRoomTrendV2[] {
    this.ensureRunning()
    return this.live.trendsV2(input)
  }

  listBilibiliLiveEventsV2(input?: { limit?: number }): import("@bmd/contracts").BilibiliLiveStatusEventV2[] {
    this.ensureRunning()
    return this.live.eventsV2(input)
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

  getBilibiliLiveRankSummaryV2(roomMonitorId: string) {
    this.ensureRunning()
    return this.liveRanks.summaryV2(roomMonitorId)
  }

  getLatestBilibiliLiveRankV2(input: BilibiliLiveRankLatestInput) {
    this.ensureRunning()
    return this.liveRanks.latestV2(input)
  }

  refreshBilibiliLiveRanksV2(input: BilibiliLiveRankRefreshInput) {
    this.ensureRunning()
    return this.liveRanks.refreshV2(input)
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

  async prepareBilibiliLiveSessionExport(
    input: ExportBilibiliLiveSessionInput,
    reportProgress?: () => void
  ): Promise<PreparedBilibiliLiveSessionExport> {
    this.ensureRunning()
    const operation = this.liveSessionExports.prepare(input, reportProgress, this.sessionExportLifetime.signal)
    this.activeSessionExports.add(operation)
    try {
      return await operation
    } finally {
      this.activeSessionExports.delete(operation)
    }
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
    return legacyFollowerResponse(() => this.bilibiliSubjects.workbench(subjectId))
  }

  queryBilibiliSubjectTrends(
    input: QueryBilibiliSubjectTrendsInput
  ): BilibiliSubjectTrend {
    this.ensureRunning()
    return legacyFollowerResponse(() => this.bilibiliSubjects.trends(input))
  }

  getBilibiliSubjectWorkbenchV3(subjectId: string): import("@bmd/contracts").BilibiliSubjectWorkbenchV3 {
    this.ensureRunning()
    return this.bilibiliSubjects.workbenchV3(subjectId)
  }

  queryBilibiliSubjectTrendsV3(input: QueryBilibiliSubjectTrendsInput): import("@bmd/contracts").BilibiliSubjectTrendV3 {
    this.ensureRunning()
    return this.bilibiliSubjects.trendsV3(input)
  }

  getBilibiliSubjectWorkbenchV2(subjectId: string): BilibiliSubjectWorkbenchV2 {
    this.ensureRunning()
    return this.bilibiliSubjects.workbenchV2(subjectId)
  }

  queryBilibiliSubjectTrendsV2(input: QueryBilibiliSubjectTrendsInput): BilibiliSubjectTrendV2 {
    this.ensureRunning()
    return this.bilibiliSubjects.trendsV2(input)
  }

  updateBilibiliSubjectLayout(
    input: UpdateBilibiliSubjectLayoutInput
  ): BilibiliSubjectWidgetLayout[] {
    this.ensureRunning()
    return this.bilibiliSubjects.updateLayout(UpdateBilibiliSubjectLayoutInputSchema.parse(input))
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

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopped = true
    this.sessionExportLifetime.abort()
    this.platformCollection.stop()
    if (this.followerScheduler) clearTimeout(this.followerScheduler)
    if (this.liveScheduler) clearTimeout(this.liveScheduler)
    if (this.liveDanmakuScheduler) clearTimeout(this.liveDanmakuScheduler)
    this.followerScheduler = undefined
    this.liveScheduler = undefined
    this.liveDanmakuScheduler = undefined
    this.stopPromise = this.finishStop()
    return this.stopPromise
  }

  private async finishStop(): Promise<void> {
    // Disable writes/queued upgrades before waiting for any worker's shutdown.
    await Promise.all([this.followersInstance?.stop(), this.independentProfileSource?.stop?.(), this.auth.stop(), this.liveDanmakuInstance?.stopAll(),
      this.liveInstance?.stop(), this.liveRanksInstance?.stop(), this.sharedRealtimeTransport?.stop()])
    await this.douyinAuth.stop()
    // In-flight exports can resume their SQLite snapshot after mkdir/mkdtemp yields.
    // Wait for cancelled output streams and snapshot cleanup before closing the shared database.
    await Promise.allSettled(this.activeSessionExports)
    this.database.close()
  }

  private ensureRunning(): void {
    if (this.stopped) throw new Error("Local Core has already stopped.")
  }

  private get followers(): BilibiliFollowerMonitorService {
    if (!this.followersInstance) {
      throw new CoreApplicationError("BILIBILI_FOLLOWER_STORAGE_DISABLED", "粉丝存储业务已由启动配置关闭。启用 storageEnabled 后重启客户端可恢复，已有数据不会删除。")
    }
    return this.followersInstance
  }
  private get live() { return requireLiveStorageService(this.liveInstance) }
  private get liveRanks(): BilibiliLiveRankService {
    // Preserve the broader storage-disabled error before reporting a rank-only switch.
    requireLiveStorageService(this.liveInstance)
    if (!this.liveRanksInstance) {
      throw new CoreApplicationError("BILIBILI_LIVE_RANK_DISABLED", "榜单业务已由启动配置关闭。启用后重启客户端可恢复，已有榜单数据不会删除。")
    }
    return this.liveRanksInstance
  }
  private get liveDanmaku() { return requireLiveStorageService(this.liveDanmakuInstance) }
  private get liveSessions() { return requireLiveStorageService(this.liveSessionsInstance) }
  private get liveSessionExports() { return requireLiveStorageService(this.liveSessionExportsInstance) }
  private get bilibiliSubjects(): BilibiliSubjectService {
    if (!this.bilibiliSubjectsInstance) {
      throw new CoreApplicationError("SUBJECT_MONITOR_DISABLED", "用户工作台已由启动配置关闭。启用后重启客户端可恢复，已有数据不会删除。")
    }
    return this.bilibiliSubjectsInstance
  }

  private startFollowerScheduler(delayMs = this.followerSchedulerDelayMs): void {
    this.followerScheduler = setTimeout(() => {
      this.followerScheduler = undefined
      if (this.stopped) return
      void this.followers.collectDueUsersV2().catch(() => {
        if (!this.stopped) console.warn(JSON.stringify({
          event: "bilibili.follower.scheduler-failed", code: "BILIBILI_FOLLOWER_SCHEDULER_FAILED"
        }))
      }).finally(() => {
        if (!this.stopped) this.startFollowerScheduler()
      })
    }, delayMs)
    this.followerScheduler.unref()
  }

  private startLiveScheduler(delayMs = this.liveSchedulerDelayMs): void {
    // Original @Scheduled(fixedDelay): do not count time spent fetching toward the next delay.
    this.liveScheduler = setTimeout(() => {
      this.liveScheduler = undefined
      if (this.stopped) return
      void this.live.collectDueRoomsV2().catch(() => {
        if (!this.stopped) console.warn(JSON.stringify({
          event: "bilibili.live.scheduler-failed", code: "BILIBILI_LIVE_SCHEDULER_FAILED"
        }))
      }).finally(() => {
        if (!this.stopped) this.startLiveScheduler()
      })
    }, delayMs)
    this.liveScheduler.unref()
  }

  private startLiveDanmakuScheduler(delayMs = this.liveDanmakuSchedulerDelayMs): void {
    this.liveDanmakuScheduler = setTimeout(() => {
      this.liveDanmakuScheduler = undefined
      if (this.stopped) return
      void this.liveDanmaku.syncAutoConnections().catch(() => {
        if (!this.stopped) console.warn(JSON.stringify({
          event: "bilibili.danmaku.scheduler-failed", code: "BILIBILI_DANMAKU_SCHEDULER_FAILED"
        }))
      }).finally(() => {
        if (!this.stopped) this.startLiveDanmakuScheduler()
      })
    }, delayMs)
    this.liveDanmakuScheduler.unref()
  }

  private static defaultFollowerSource(
    options: ResolvedLocalCoreRuntimeOptions,
    httpConfiguration: BilibiliFollowerHttpConfiguration
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
    }), httpConfiguration)
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
    options: ResolvedLocalCoreRuntimeOptions,
    httpConfiguration: BilibiliLiveHttpConfiguration
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
    }), httpConfiguration)
  }

  private static defaultLiveRankSource(
    options: ResolvedLocalCoreRuntimeOptions,
    httpConfiguration: BilibiliLiveHttpConfiguration,
    wbiCacheSeconds: number,
    sharedRealtimeTransport: NdjsonRealtimeWorkerTransport | undefined
  ): BilibiliLiveRankSource {
    const repositoryRoot = process.env.BMD_REPOSITORY_ROOT
    const pythonExecutable = process.env.BMD_PYTHON_EXE
      ?? (repositoryRoot ? resolve(repositoryRoot, ".venv", "Scripts", "python.exe") : "")
    const pythonPath = process.env.BMD_PYTHON_WORKER_PATH ?? (repositoryRoot
      ? resolve(repositoryRoot, "workers", "python", "src")
      : resolve(process.cwd(), "workers", "python", "src"))
    if (!pythonExecutable || !sharedRealtimeTransport) return unavailableLiveRankSource()
    return new BilibiliLiveRankWorkerSource(new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath,
      dataDirectory: options.dataDirectory,
      role: "crawler",
      standaloneExecutable: process.env.BMD_PYTHON_STANDALONE === "1"
    }), httpConfiguration, wbiCacheSeconds, async (forceRefresh, signal) => BilibiliWbiKeysSchema.parse(
      await sharedRealtimeTransport.request("getWbiKeys", { forceRefresh, wbiCacheSeconds, httpConfiguration }, { signal })
    ))
  }

  private static defaultLiveDanmakuSource(
    sharedRealtimeTransport: NdjsonRealtimeWorkerTransport | undefined,
    httpConfiguration: BilibiliLiveHttpConfiguration
  ): BilibiliLiveDanmakuSource {
    if (!sharedRealtimeTransport) return unavailableLiveDanmakuSource()
    return new BilibiliLiveDanmakuWorkerSource(sharedRealtimeTransport, httpConfiguration)
  }

  private static defaultRealtimeTransport(options: ResolvedLocalCoreRuntimeOptions,
    credentialProvider: () => Promise<{ cookieHeader: string; authUid: string } | undefined>
  ): NdjsonRealtimeWorkerTransport | undefined {
    const nodeExecutable = process.env.BMD_NODE_EXE?.trim()
    const workerEntry = process.env.BMD_REALTIME_WORKER_ENTRY?.trim()
    if (!nodeExecutable || !workerEntry) return undefined
    return new NdjsonRealtimeWorkerTransport({
      nodeExecutable,
      workerEntry,
      dataDirectory: options.dataDirectory,
      requestTimeoutMs: 30_000,
      credentialProvider
    })
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

function requireLiveStorageService<T>(service: T | undefined): T {
  if (service === undefined) {
    throw new CoreApplicationError("BILIBILI_LIVE_STORAGE_DISABLED", "直播存储业务已由启动配置关闭。启用 storageEnabled 后重启客户端可恢复，已有数据不会删除。")
  }
  return service
}

function unavailableFollowerSource(): BilibiliFollowerSource {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("项目 Python Crawler Worker 不可用，请通过 dev.cmd 启动。"), {
      code: "WORKER_RUNTIME_UNAVAILABLE",
      retryable: false
    })
  }
  return {
    fetchProfile: unavailable,
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
