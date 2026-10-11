import {
  BilibiliLiveRankSummaryV2Schema,
  BilibiliLiveRankSnapshotV2Schema,
  BilibiliLiveRankRefreshResultV2Schema,
  BilibiliLiveRoomListV2Schema,
  BilibiliLiveRoomV2Schema,
  BilibiliLiveCollectResultV2Schema,
  BilibiliLiveSummaryV2Schema,
  BilibiliLiveRoomTrendListV2Schema,
  BilibiliLiveRoomTrendV2Schema,
  BilibiliLiveStatusEventListV2Schema,
  BilibiliSubjectTrendV3Schema,
  BilibiliSubjectWorkbenchV3Schema } from "@bmd/contracts"
import { randomUUID } from "node:crypto"

import {
  AddBilibiliFollowerMonitorInputSchema,
  AddBilibiliFollowerMonitorInputV2Schema,
  BilibiliFollowerCollectResultV2Schema,
  BilibiliFollowerMonitorListV2Schema,
  BilibiliFollowerMonitorV2Schema,
  BilibiliFollowerTrendListV2Schema,
  BilibiliFollowerTrendV2Schema,
  BilibiliSubjectTrendV2Schema,
  BilibiliSubjectWorkbenchV2Schema,
  BilibiliAuthRefreshResultSchema,
  BilibiliAuthStatusSchema,
  BilibiliCredentialSchema,
  BilibiliQrLoginIdInputSchema,
  BilibiliQrLoginStartSchema,
  BilibiliQrLoginStatusSchema,
  BilibiliFollowerCollectResultSchema,
  BilibiliFollowerMonitorIdInputSchema,
  BilibiliFollowerMonitorListSchema,
  BilibiliFollowerMonitorSchema,
  BilibiliFollowerTrendListSchema,
  BilibiliFollowerTrendSchema,
  BindSubjectAccountInputSchema,
  BootstrapResponseSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  DeleteBilibiliFollowerMonitorResultSchema,
  ListBilibiliFollowerMonitorsInputSchema,
  ListPlatformAccountsInputSchema,
  ListSubjectsInputSchema,
  PlatformAccountListSchema,
  PlatformAccountSchema,
  PlatformAdapterListSchema,
  PlatformCollectionExecutionSchema,
  RunPlatformCollectionInputSchema,
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  RevokeBilibiliAuthResultSchema,
  RuntimeEnvelopeSchema,
  RuntimeErrorSchema,
  SubjectListSchema,
  SubjectSummarySchema,
  startupConfigurationErrorMessage,
  UpdateBilibiliFollowerMonitorSettingsInputSchema,
  UpdateBilibiliFollowerMonitorStatusInputSchema,
  AddBilibiliLiveRoomInputSchema,
  BilibiliLiveCollectResultSchema,
  BilibiliLiveRoomIdInputSchema,
  BilibiliLiveRoomListSchema,
  BilibiliLiveRoomSchema,
  BilibiliLiveRoomTrendListSchema,
  BilibiliLiveRoomTrendSchema,
  BilibiliLiveStatusEventListSchema,
  BilibiliLiveSummarySchema,
  DeleteBilibiliLiveRoomResultSchema,
  ListBilibiliLiveRoomsInputSchema,
  QueryBilibiliLiveEventsInputSchema,
  QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInputSchema,
  UpdateBilibiliLiveRoomSettingsInputSchema,
  UpdateBilibiliLiveRoomStatusInputSchema,
  BilibiliLiveRankLatestInputSchema,
  BilibiliLiveRankRefreshInputSchema,
  BilibiliLiveRankRefreshResultSchema,
  BilibiliLiveRankSnapshotSchema,
  BilibiliLiveRankSummarySchema,
  BilibiliLiveDanmakuStatusSchema,
  BilibiliLiveDanmakuRecentListSchema,
  BilibiliLiveDanmakuMetricBucketListSchema,
  StartBilibiliLiveDanmakuInputSchema,
  BilibiliLiveDanmakuRoomInputSchema,
  QueryBilibiliLiveDanmakuRecentInputSchema,
  QueryBilibiliLiveDanmakuMetricsInputSchema,
  BilibiliLiveSessionSummarySchema,
  BilibiliLiveSessionSummaryListSchema,
  BilibiliLiveSessionEventPageSchema,
  BilibiliLiveSessionUserListSchema,
  BilibiliLiveSessionInsightSchema,
  BilibiliLiveSessionIdInputSchema,
  ListBilibiliLiveSessionsInputSchema,
  ListBilibiliLiveSessionUsersInputSchema,
  QueryBilibiliLiveSessionEventsInputSchema,
  QueryBilibiliLiveSessionInsightInputSchema,
  ExportBilibiliLiveSessionInputSchema,
  PreparedBilibiliLiveSessionExportSchema,
  BilibiliSubjectBindingSchema,
  BilibiliSubjectIdInputSchema,
  BilibiliSubjectListSchema,
  BilibiliSubjectSchema,
  BilibiliSubjectTrendSchema,
  BilibiliSubjectWidgetLayoutSchema,
  BilibiliSubjectWorkbenchSchema,
  CreateBilibiliSubjectInputSchema,
  DeleteBilibiliSubjectResultSchema,
  ListBilibiliSubjectsInputSchema,
  QueryBilibiliSubjectTrendsInputSchema,
  UpdateBilibiliSubjectBindingInputSchema,
  UpdateBilibiliSubjectInputSchema,
  UpdateBilibiliSubjectLayoutInputSchema,
  CompleteDouyinOAuthInputSchema,
  DouyinAuthStatusSchema,
  DouyinOAuthCallbackFailureSchema,
  DouyinOAuthSessionSummarySchema,
  DouyinCredentialKindInputSchema,
  DouyinCredentialMutationResultSchema,
  DouyinCredentialSchema,
  DouyinOAuthStartSchema,
  DouyinQrLoginIdInputSchema,
  DouyinQrLoginStartSchema,
  DouyinQrLoginStatusSchema,
  DouyinValidationResultSchema,
  RevokeDouyinCredentialResultSchema,
  createRuntimeEnvelope,
  CORE_KEEP_ALIVE_REQUESTS,
  RequestKeepAliveSchema,
  type BootstrapResponse,
  type RuntimeError,
  type RuntimeEnvelope
} from "@bmd/contracts"
import { utilityProcess, type UtilityProcess } from "electron"

import type { DouyinOAuthRuntimeConfiguration } from "./oauth-config"

interface LocalCoreControllerOptions {
  entryPath: string
  realtimeWorkerEntry?: string
  browserWorkerEntry?: string
  dataDirectory: string
  credentialKeyBase64?: string
  mainInstanceId?: string
  douyinOAuth: DouyinOAuthRuntimeConfiguration
  version?: string
  startupTimeoutMs?: number
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (envelope: RuntimeEnvelope) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  envelope: RuntimeEnvelope
}

class CoreRequestError extends Error {
  readonly code: string
  constructor(error: RuntimeError) {
    super(`${error.code}: ${error.message}`)
    this.code = error.code
  }
}

const LONG_RUNNING_CORE_REQUESTS = new Set([
  "platform.collection.run-once",
  "bilibili-followers.add",
  "bilibili-followers.refresh",
  "bilibili-followers.add.v2",
  "bilibili-followers.refresh.v2",
  "bilibili-auth.qr.start",
  "bilibili-auth.qr.poll",
  "bilibili-auth.status",
  "bilibili-auth.refresh",
  "bilibili-auth.credential",
  "bilibili-live.rooms.add",
  "bilibili-live.rooms.add.v2",
  "bilibili-live.rooms.refresh.v2",
  "bilibili-live.rooms.refresh",
  "bilibili-live.ranks.refresh",
  "bilibili-live.ranks.refresh.v2",
  "bilibili-live.danmaku.start",
  "bilibili-live.session.export",
  "bilibili-subjects.create",
  "bilibili-subjects.bind",
  "douyin-auth.web.start",
  "douyin-auth.web.poll",
  "douyin-auth.web.validate",
  "douyin-auth.oauth.complete",
  "douyin-auth.oauth.refresh"
])

export function resolveCoreRequestTimeout(type: string, defaultTimeoutMs: number): number {
  return LONG_RUNNING_CORE_REQUESTS.has(type) ? Math.max(defaultTimeoutMs, 90_000) : defaultTimeoutMs
}

export class LocalCoreController {
  private readonly mainInstanceId: string
  private readonly startupTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly pending = new Map<string, PendingRequest>()
  private readonly activeExports = new Set<Promise<unknown>>()
  private stopping = false
  private stopPromise: Promise<void> | undefined
  private child?: UtilityProcess
  private lastBootstrap?: BootstrapResponse
  private stderrTail = ""

  constructor(private readonly options: LocalCoreControllerOptions) {
    this.mainInstanceId = options.mainInstanceId ?? randomUUID()
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
    if (this.stopPromise) await this.stopPromise
    if (this.isRunning()) return this.bootstrap()
    await this.forceStop()
    this.stopping = false
    this.stopPromise = undefined
    this.stderrTail = ""

    const childEnvironment = { ...process.env }
    for (const key of [
      "BMD_CREDENTIAL_KEY_BASE64",
      "BMD_MAIN_INSTANCE_ID",
      "BMD_MAIN_PID",
      "BMD_DOUYIN_OAUTH_MODE",
      "BMD_DOUYIN_OAUTH_CLIENT_KEY",
      "BMD_DOUYIN_OAUTH_CLIENT_SECRET",
      "BMD_DOUYIN_OAUTH_REDIRECT_URI",
      "BMD_DOUYIN_OAUTH_SCOPE"
    ]) delete childEnvironment[key]
    childEnvironment.BMD_DOUYIN_OAUTH_MODE = this.options.douyinOAuth.mode
    if (this.options.douyinOAuth.mode === "live") {
      childEnvironment.BMD_DOUYIN_OAUTH_CLIENT_KEY = this.options.douyinOAuth.clientKey
      childEnvironment.BMD_DOUYIN_OAUTH_CLIENT_SECRET = this.options.douyinOAuth.clientSecret
      childEnvironment.BMD_DOUYIN_OAUTH_REDIRECT_URI = this.options.douyinOAuth.redirectUri
      childEnvironment.BMD_DOUYIN_OAUTH_SCOPE = this.options.douyinOAuth.scope
    }
    const child = utilityProcess.fork(this.options.entryPath, [], {
      env: {
        ...childEnvironment,
        BMD_DATA_DIR: this.options.dataDirectory,
        BMD_CORE_VERSION: this.options.version ?? "0.2.0",
        BMD_MAIN_INSTANCE_ID: this.mainInstanceId,
        BMD_MAIN_PID: String(process.pid),
        ...(this.options.credentialKeyBase64
          ? { BMD_CREDENTIAL_KEY_BASE64: this.options.credentialKeyBase64 }
          : {}),
        ...(this.options.realtimeWorkerEntry
          ? { BMD_REALTIME_WORKER_ENTRY: this.options.realtimeWorkerEntry }
          : {}),
        ...(this.options.browserWorkerEntry
          ? { BMD_BROWSER_WORKER_ENTRY: this.options.browserWorkerEntry }
          : {})
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
      // Known actionable configuration errors already carry a fixed, safe protocol message.
      if (error instanceof CoreRequestError && startupConfigurationErrorMessage(error.code) !== undefined) throw error
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

  async listPlatformAdapters() {
    const envelope = await this.request("platform.adapters.list", {})
    return PlatformAdapterListSchema.parse(envelope.payload)
  }

  async runPlatformCollection(input: unknown) {
    const envelope = await this.request(
      "platform.collection.run-once",
      RunPlatformCollectionInputSchema.parse(input)
    )
    return PlatformCollectionExecutionSchema.parse(envelope.payload)
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

  async listBilibiliSubjects(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.list",
      ListBilibiliSubjectsInputSchema.parse(input ?? {})
    )
    return BilibiliSubjectListSchema.parse(envelope.payload)
  }

  async createBilibiliSubject(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.create",
      CreateBilibiliSubjectInputSchema.parse(input)
    )
    return BilibiliSubjectSchema.parse(envelope.payload)
  }

  async getBilibiliSubject(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.get",
      BilibiliSubjectIdInputSchema.parse(input)
    )
    return BilibiliSubjectSchema.parse(envelope.payload)
  }

  async updateBilibiliSubject(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.update",
      UpdateBilibiliSubjectInputSchema.parse(input)
    )
    return BilibiliSubjectSchema.parse(envelope.payload)
  }

  async deleteBilibiliSubject(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.delete",
      BilibiliSubjectIdInputSchema.parse(input)
    )
    return DeleteBilibiliSubjectResultSchema.parse(envelope.payload)
  }

  async bindBilibiliSubject(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.bind",
      UpdateBilibiliSubjectBindingInputSchema.parse(input)
    )
    return BilibiliSubjectBindingSchema.parse(envelope.payload)
  }

  async getBilibiliSubjectWorkbench(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.workbench",
      BilibiliSubjectIdInputSchema.parse(input)
    )
    return BilibiliSubjectWorkbenchSchema.parse(envelope.payload)
  }

  async queryBilibiliSubjectTrends(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.trends",
      QueryBilibiliSubjectTrendsInputSchema.parse(input)
    )
    return BilibiliSubjectTrendSchema.parse(envelope.payload)
  }

  async updateBilibiliSubjectLayout(input: unknown) {
    const envelope = await this.request(
      "bilibili-subjects.layout.update",
      UpdateBilibiliSubjectLayoutInputSchema.parse(input)
    )
    return BilibiliSubjectWidgetLayoutSchema.array().parse(envelope.payload)
  }

  async getBilibiliSubjectWorkbenchV3(input: unknown) {
    const envelope = await this.request("bilibili-subjects.workbench.v3", BilibiliSubjectIdInputSchema.parse(input))
    return BilibiliSubjectWorkbenchV3Schema.parse(envelope.payload)
  }

  async queryBilibiliSubjectTrendsV3(input: unknown) {
    const envelope = await this.request("bilibili-subjects.trends.v3", QueryBilibiliSubjectTrendsInputSchema.parse(input))
    return BilibiliSubjectTrendV3Schema.parse(envelope.payload)
  }

  async getBilibiliSubjectWorkbenchV2(input: unknown) {
    const envelope = await this.request("bilibili-subjects.workbench.v2", BilibiliSubjectIdInputSchema.parse(input))
    return BilibiliSubjectWorkbenchV2Schema.parse(envelope.payload)
  }

  async queryBilibiliSubjectTrendsV2(input: unknown) {
    const envelope = await this.request("bilibili-subjects.trends.v2", QueryBilibiliSubjectTrendsInputSchema.parse(input))
    return BilibiliSubjectTrendV2Schema.parse(envelope.payload)
  }

  async listBilibiliFollowerMonitorsV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.list.v2", ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {}))
    return BilibiliFollowerMonitorListV2Schema.parse(envelope.payload)
  }

  async addBilibiliFollowerMonitorV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.add.v2", AddBilibiliFollowerMonitorInputV2Schema.parse(input))
    return BilibiliFollowerMonitorV2Schema.parse(envelope.payload)
  }

  async updateBilibiliFollowerMonitorStatusV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.update-status.v2", UpdateBilibiliFollowerMonitorStatusInputSchema.parse(input))
    return BilibiliFollowerMonitorV2Schema.parse(envelope.payload)
  }

  async updateBilibiliFollowerMonitorSettingsV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.update-settings.v2", UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(input))
    return BilibiliFollowerMonitorV2Schema.parse(envelope.payload)
  }

  async refreshBilibiliFollowerMonitorV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.refresh.v2", BilibiliFollowerMonitorIdInputSchema.parse(input))
    return BilibiliFollowerCollectResultV2Schema.parse(envelope.payload)
  }

  async deleteBilibiliFollowerMonitorV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.delete.v2", BilibiliFollowerMonitorIdInputSchema.parse(input))
    return DeleteBilibiliFollowerMonitorResultSchema.parse(envelope.payload)
  }

  async queryBilibiliFollowerTrendV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.trend.v2", QueryBilibiliFollowerTrendInputSchema.parse(input))
    return BilibiliFollowerTrendV2Schema.parse(envelope.payload)
  }

  async queryBilibiliFollowerTrendsV2(input: unknown) {
    const envelope = await this.request("bilibili-followers.trends.v2", QueryBilibiliFollowerTrendsInputSchema.parse(input))
    return BilibiliFollowerTrendListV2Schema.parse(envelope.payload)
  }

  async listBilibiliFollowerMonitors(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.list",
      ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {})
    )
    return BilibiliFollowerMonitorListSchema.parse(envelope.payload)
  }

  async addBilibiliFollowerMonitor(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.add",
      AddBilibiliFollowerMonitorInputSchema.parse(input)
    )
    return BilibiliFollowerMonitorSchema.parse(envelope.payload)
  }

  async updateBilibiliFollowerMonitorStatus(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.update-status",
      UpdateBilibiliFollowerMonitorStatusInputSchema.parse(input)
    )
    return BilibiliFollowerMonitorSchema.parse(envelope.payload)
  }

  async updateBilibiliFollowerMonitorSettings(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.update-settings",
      UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(input)
    )
    return BilibiliFollowerMonitorSchema.parse(envelope.payload)
  }

  async refreshBilibiliFollowerMonitor(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.refresh",
      BilibiliFollowerMonitorIdInputSchema.parse(input)
    )
    return BilibiliFollowerCollectResultSchema.parse(envelope.payload)
  }

  async deleteBilibiliFollowerMonitor(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.delete",
      BilibiliFollowerMonitorIdInputSchema.parse(input)
    )
    return DeleteBilibiliFollowerMonitorResultSchema.parse(envelope.payload)
  }

  async queryBilibiliFollowerTrend(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.trend",
      QueryBilibiliFollowerTrendInputSchema.parse(input)
    )
    return BilibiliFollowerTrendSchema.parse(envelope.payload)
  }

  async queryBilibiliFollowerTrends(input: unknown) {
    const envelope = await this.request(
      "bilibili-followers.trends",
      QueryBilibiliFollowerTrendsInputSchema.parse(input)
    )
    return BilibiliFollowerTrendListSchema.parse(envelope.payload)
  }

  async startBilibiliQrLogin() {
    const envelope = await this.request("bilibili-auth.qr.start", {})
    return BilibiliQrLoginStartSchema.parse(envelope.payload)
  }

  async pollBilibiliQrLogin(input: unknown) {
    const envelope = await this.request(
      "bilibili-auth.qr.poll",
      BilibiliQrLoginIdInputSchema.parse(input)
    )
    return BilibiliQrLoginStatusSchema.parse(envelope.payload)
  }

  async getBilibiliAuthStatus() {
    const envelope = await this.request("bilibili-auth.status", {})
    return BilibiliAuthStatusSchema.parse(envelope.payload)
  }

  async refreshBilibiliAuth() {
    const envelope = await this.request("bilibili-auth.refresh", {})
    return BilibiliAuthRefreshResultSchema.parse(envelope.payload)
  }

  async getBilibiliCredential() {
    const envelope = await this.request("bilibili-auth.credential", {})
    return BilibiliCredentialSchema.parse(envelope.payload)
  }

  async revokeBilibiliAuth() {
    const envelope = await this.request("bilibili-auth.revoke", {})
    return RevokeBilibiliAuthResultSchema.parse(envelope.payload)
  }

  async listBilibiliLiveRoomsV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.list.v2",
      ListBilibiliLiveRoomsInputSchema.parse(input ?? {})
    )
    return BilibiliLiveRoomListV2Schema.parse(envelope.payload)
  }

  async addBilibiliLiveRoomV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.add.v2",
      AddBilibiliLiveRoomInputSchema.parse(input)
    )
    return BilibiliLiveRoomV2Schema.parse(envelope.payload)
  }

  async updateBilibiliLiveRoomStatusV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.update-status.v2",
      UpdateBilibiliLiveRoomStatusInputSchema.parse(input)
    )
    return BilibiliLiveRoomV2Schema.parse(envelope.payload)
  }

  async updateBilibiliLiveRoomSettingsV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.update-settings.v2",
      UpdateBilibiliLiveRoomSettingsInputSchema.parse(input)
    )
    return BilibiliLiveRoomV2Schema.parse(envelope.payload)
  }

  async refreshBilibiliLiveRoomV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.refresh.v2",
      BilibiliLiveRoomIdInputSchema.parse(input)
    )
    return BilibiliLiveCollectResultV2Schema.parse(envelope.payload)
  }

  async getBilibiliLiveSummaryV2() {
    const envelope = await this.request("bilibili-live.summary.v2", {})
    return BilibiliLiveSummaryV2Schema.parse(envelope.payload)
  }

  async queryBilibiliLiveTrendV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.trend.v2",
      QueryBilibiliLiveTrendInputSchema.parse(input)
    )
    return BilibiliLiveRoomTrendV2Schema.parse(envelope.payload)
  }

  async queryBilibiliLiveTrendsV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.trends.v2",
      QueryBilibiliLiveTrendsInputSchema.parse(input)
    )
    return BilibiliLiveRoomTrendListV2Schema.parse(envelope.payload)
  }

  async listBilibiliLiveEventsV2(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.events.v2",
      QueryBilibiliLiveEventsInputSchema.parse(input ?? {})
    )
    return BilibiliLiveStatusEventListV2Schema.parse(envelope.payload)
  }

  async listBilibiliLiveRooms(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.list",
      ListBilibiliLiveRoomsInputSchema.parse(input ?? {})
    )
    return BilibiliLiveRoomListSchema.parse(envelope.payload)
  }

  async addBilibiliLiveRoom(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.add",
      AddBilibiliLiveRoomInputSchema.parse(input)
    )
    return BilibiliLiveRoomSchema.parse(envelope.payload)
  }

  async updateBilibiliLiveRoomStatus(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.update-status",
      UpdateBilibiliLiveRoomStatusInputSchema.parse(input)
    )
    return BilibiliLiveRoomSchema.parse(envelope.payload)
  }

  async updateBilibiliLiveRoomSettings(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.update-settings",
      UpdateBilibiliLiveRoomSettingsInputSchema.parse(input)
    )
    return BilibiliLiveRoomSchema.parse(envelope.payload)
  }

  async refreshBilibiliLiveRoom(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.refresh",
      BilibiliLiveRoomIdInputSchema.parse(input)
    )
    return BilibiliLiveCollectResultSchema.parse(envelope.payload)
  }

  async deleteBilibiliLiveRoom(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.rooms.delete",
      BilibiliLiveRoomIdInputSchema.parse(input)
    )
    return DeleteBilibiliLiveRoomResultSchema.parse(envelope.payload)
  }

  async getBilibiliLiveSummary() {
    const envelope = await this.request("bilibili-live.summary", {})
    return BilibiliLiveSummarySchema.parse(envelope.payload)
  }

  async queryBilibiliLiveTrend(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.trend",
      QueryBilibiliLiveTrendInputSchema.parse(input)
    )
    return BilibiliLiveRoomTrendSchema.parse(envelope.payload)
  }

  async queryBilibiliLiveTrends(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.trends",
      QueryBilibiliLiveTrendsInputSchema.parse(input)
    )
    return BilibiliLiveRoomTrendListSchema.parse(envelope.payload)
  }

  async listBilibiliLiveEvents(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.events",
      QueryBilibiliLiveEventsInputSchema.parse(input ?? {})
    )
    return BilibiliLiveStatusEventListSchema.parse(envelope.payload)
  }

  async getBilibiliLiveRankSummary(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.ranks.summary",
      BilibiliLiveRoomIdInputSchema.parse(input)
    )
    return BilibiliLiveRankSummarySchema.parse(envelope.payload)
  }

  async getBilibiliLiveRankSummaryV2(input: unknown) {
    const envelope = await this.request("bilibili-live.ranks.summary.v2", BilibiliLiveRoomIdInputSchema.parse(input))
    return BilibiliLiveRankSummaryV2Schema.parse(envelope.payload)
  }

  async getLatestBilibiliLiveRankV2(input: unknown) {
    const envelope = await this.request("bilibili-live.ranks.latest.v2", BilibiliLiveRankLatestInputSchema.parse(input))
    return BilibiliLiveRankSnapshotV2Schema.parse(envelope.payload)
  }

  async refreshBilibiliLiveRanksV2(input: unknown) {
    const envelope = await this.request("bilibili-live.ranks.refresh.v2", BilibiliLiveRankRefreshInputSchema.parse(input))
    return BilibiliLiveRankRefreshResultV2Schema.parse(envelope.payload)
  }

  async getLatestBilibiliLiveRank(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.ranks.latest",
      BilibiliLiveRankLatestInputSchema.parse(input)
    )
    return BilibiliLiveRankSnapshotSchema.parse(envelope.payload)
  }

  async refreshBilibiliLiveRanks(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.ranks.refresh",
      BilibiliLiveRankRefreshInputSchema.parse(input)
    )
    return BilibiliLiveRankRefreshResultSchema.parse(envelope.payload)
  }

  async startBilibiliLiveDanmaku(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.danmaku.start",
      StartBilibiliLiveDanmakuInputSchema.parse(input)
    )
    return BilibiliLiveDanmakuStatusSchema.parse(envelope.payload)
  }

  async stopBilibiliLiveDanmaku(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.danmaku.stop",
      BilibiliLiveDanmakuRoomInputSchema.parse(input)
    )
    return BilibiliLiveDanmakuStatusSchema.parse(envelope.payload)
  }

  async getBilibiliLiveDanmakuStatus(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.danmaku.status",
      BilibiliLiveDanmakuRoomInputSchema.parse(input)
    )
    return BilibiliLiveDanmakuStatusSchema.parse(envelope.payload)
  }

  async getBilibiliLiveDanmakuRecent(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.danmaku.recent",
      QueryBilibiliLiveDanmakuRecentInputSchema.parse(input)
    )
    return BilibiliLiveDanmakuRecentListSchema.parse(envelope.payload)
  }

  async getBilibiliLiveDanmakuMetrics(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.danmaku.metrics",
      QueryBilibiliLiveDanmakuMetricsInputSchema.parse(input)
    )
    return BilibiliLiveDanmakuMetricBucketListSchema.parse(envelope.payload)
  }

  async listBilibiliLiveSessions(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.sessions",
      ListBilibiliLiveSessionsInputSchema.parse(input)
    )
    return BilibiliLiveSessionSummaryListSchema.parse(envelope.payload)
  }

  async getBilibiliLiveSession(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.session",
      BilibiliLiveSessionIdInputSchema.parse(input)
    )
    return BilibiliLiveSessionSummarySchema.parse(envelope.payload)
  }

  async listBilibiliLiveSessionUsers(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.session.users",
      ListBilibiliLiveSessionUsersInputSchema.parse(input)
    )
    return BilibiliLiveSessionUserListSchema.parse(envelope.payload)
  }

  async queryBilibiliLiveSessionEvents(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.session.events",
      QueryBilibiliLiveSessionEventsInputSchema.parse(input)
    )
    return BilibiliLiveSessionEventPageSchema.parse(envelope.payload)
  }

  async getBilibiliLiveSessionInsight(input: unknown) {
    const envelope = await this.request(
      "bilibili-live.session.insight",
      QueryBilibiliLiveSessionInsightInputSchema.parse(input)
    )
    return BilibiliLiveSessionInsightSchema.parse(envelope.payload)
  }

  async prepareBilibiliLiveSessionExport(input: unknown) {
    const operation = this.request(
      "bilibili-live.session.export",
      ExportBilibiliLiveSessionInputSchema.parse(input)
    ).then(envelope => PreparedBilibiliLiveSessionExportSchema.parse(envelope.payload))
    this.activeExports.add(operation)
    try {
      return await operation
    } finally {
      this.activeExports.delete(operation)
    }
  }

  async getDouyinAuthStatus() {
    const envelope = await this.request("douyin-auth.status", {})
    return DouyinAuthStatusSchema.parse(envelope.payload)
  }

  async startDouyinWebQr() {
    const envelope = await this.request("douyin-auth.web.start", {})
    return DouyinQrLoginStartSchema.parse(envelope.payload)
  }

  async pollDouyinWebQr(input: unknown) {
    const envelope = await this.request(
      "douyin-auth.web.poll",
      DouyinQrLoginIdInputSchema.parse(input)
    )
    return DouyinQrLoginStatusSchema.parse(envelope.payload)
  }

  async validateDouyinWeb() {
    const envelope = await this.request("douyin-auth.web.validate", {})
    return DouyinValidationResultSchema.parse(envelope.payload)
  }

  async startDouyinOAuth() {
    const envelope = await this.request("douyin-auth.oauth.start", {})
    return DouyinOAuthStartSchema.parse(envelope.payload)
  }

  async completeDouyinOAuth(input: unknown) {
    const envelope = await this.request(
      "douyin-auth.oauth.complete",
      CompleteDouyinOAuthInputSchema.parse(input)
    )
    return DouyinCredentialMutationResultSchema.parse(envelope.payload)
  }

  async failDouyinOAuthCallback(input: unknown) {
    const envelope = await this.request(
      "douyin-auth.oauth.fail-callback",
      DouyinOAuthCallbackFailureSchema.parse(input)
    )
    return DouyinOAuthSessionSummarySchema.parse(envelope.payload)
  }

  async refreshDouyinOAuth() {
    const envelope = await this.request("douyin-auth.oauth.refresh", {})
    return DouyinCredentialMutationResultSchema.parse(envelope.payload)
  }

  async getDouyinCredential(input: unknown) {
    const envelope = await this.request(
      "douyin-auth.credential",
      DouyinCredentialKindInputSchema.parse(input)
    )
    return DouyinCredentialSchema.parse(envelope.payload)
  }

  async revokeDouyinCredential(input: unknown) {
    const envelope = await this.request(
      "douyin-auth.revoke",
      DouyinCredentialKindInputSchema.parse(input)
    )
    return RevokeDouyinCredentialResultSchema.parse(envelope.payload)
  }

  snapshot(): BootstrapResponse | undefined {
    return this.lastBootstrap
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopping = true
    this.stopPromise = this.finishStop()
    return this.stopPromise
  }

  private async finishStop(): Promise<void> {
    const child = this.child
    if (!child) return
    try {
      if (child.pid !== undefined) await this.request("core.shutdown", { reason: "desktop quit" })
    } catch {
      // forceStop remains the final lifecycle guard when the child is already gone.
    }
    // Core shutdown keeps SQLite open until these preparations finish. Their normal
    // 90-second liveness watchdog still terminates an unresponsive utility process.
    await Promise.allSettled(this.activeExports)
    await this.waitForExit(child, 1_500)
    await this.forceStop()
  }

  private request<T>(type: string, payload: T): Promise<RuntimeEnvelope> {
    if (this.stopping && type !== "core.shutdown") throw new Error("The local Core utility process is stopping.")
    const child = this.child
    if (!child?.pid) throw new Error("The local Core utility process is not running.")

    const id = randomUUID()
    const envelope = createRuntimeEnvelope({
      id,
      type,
      timestamp: new Date().toISOString(),
      correlationId: id,
      traceId: randomUUID(),
      ...(CORE_KEEP_ALIVE_REQUESTS.some(request => request === type) ? { keepAlive: true } : {}),
      payload
    })

    return new Promise((resolve, reject) => {
      const requestTimeoutMs = resolveCoreRequestTimeout(type, this.requestTimeoutMs)
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Local Core request ${type} timed out after ${requestTimeoutMs} ms.`))
        if (envelope.keepAlive) void this.forceStop()
      }, requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timeout, envelope })
      child.postMessage(envelope)
    })
  }

  private handleMessage(message: unknown): void {
    const parsed = RuntimeEnvelopeSchema.safeParse(message)
    if (!parsed.success) return
    const envelope = parsed.data as RuntimeEnvelope
    const pending = this.pending.get(envelope.id)
    if (!pending) return
    if (envelope.traceId !== pending.envelope.traceId || envelope.correlationId !== pending.envelope.correlationId) return
    if (envelope.type === "core.request-alive") {
      const payload = RequestKeepAliveSchema.safeParse(envelope.payload)
      if (pending.envelope.keepAlive && payload.success && payload.data.requestType === pending.envelope.type) {
        if (this.activeExports.size > 0) {
          // A synchronous export can leave newly sent long requests in Core's
          // message queue. Its validated liveness also covers that shared queue.
          for (const request of this.pending.values()) {
            if (request.envelope.keepAlive) request.timeout.refresh()
          }
        } else {
          pending.timeout.refresh()
        }
      }
      return
    }
    if (envelope.type !== "core.error" && envelope.type !== `${pending.envelope.type}.result`) return
    const runtimeError = envelope.type === "core.error" ? RuntimeErrorSchema.safeParse(envelope.payload) : undefined
    if (runtimeError && !runtimeError.success) return

    clearTimeout(pending.timeout)
    this.pending.delete(envelope.id)
    if (runtimeError?.success) {
      pending.reject(new CoreRequestError(runtimeError.data))
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
