import { randomUUID } from "node:crypto"

import {
  AddBilibiliFollowerMonitorInputSchema,
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
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  RevokeBilibiliAuthResultSchema,
  RuntimeEnvelopeSchema,
  RuntimeErrorSchema,
  SubjectListSchema,
  SubjectSummarySchema,
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
  LIVE_HTTP_CORE_REQUESTS,
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
  "bilibili-followers.add",
  "bilibili-followers.refresh",
  "bilibili-auth.qr.start",
  "bilibili-auth.qr.poll",
  "bilibili-auth.status",
  "bilibili-auth.refresh",
  "bilibili-auth.credential",
  "bilibili-live.rooms.add",
  "bilibili-live.rooms.refresh",
  "bilibili-live.ranks.refresh",
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

    const childEnvironment = { ...process.env }
    for (const key of [
      "BMD_CREDENTIAL_KEY_BASE64",
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
      if (error instanceof CoreRequestError && error.code === "BILIBILI_LIVE_CONFIG_INVALID") throw error
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
    const envelope = await this.request(
      "bilibili-live.session.export",
      ExportBilibiliLiveSessionInputSchema.parse(input)
    )
    return PreparedBilibiliLiveSessionExportSchema.parse(envelope.payload)
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
      ...(LIVE_HTTP_CORE_REQUESTS.some(request => request === type) ? { keepAlive: true } : {}),
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
    if (envelope.type === "core.request-alive") {
      const payload = RequestKeepAliveSchema.safeParse(envelope.payload)
      if (pending.envelope.keepAlive && payload.success && payload.data.requestType === pending.envelope.type
        && envelope.traceId === pending.envelope.traceId && envelope.correlationId === pending.envelope.correlationId) {
        pending.timeout.refresh()
      }
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(envelope.id)
    if (envelope.type === "core.error") {
      const runtimeError = RuntimeErrorSchema.parse(envelope.payload)
      pending.reject(new CoreRequestError(runtimeError))
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
