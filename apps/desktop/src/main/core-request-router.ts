import {
  BilibiliLiveRoomListV2Schema,
  BilibiliLiveRoomV2Schema,
  BilibiliLiveCollectResultV2Schema,
  BilibiliLiveSummaryV2Schema,
  BilibiliLiveRoomTrendListV2Schema,
  BilibiliLiveRoomTrendV2Schema,
  BilibiliLiveStatusEventListV2Schema,
  BilibiliSubjectTrendV3Schema,
  BilibiliSubjectWorkbenchV3Schema,
  AddBilibiliFollowerMonitorInputSchema,
  AddBilibiliFollowerMonitorInputV2Schema,
  BilibiliFollowerCollectResultV2Schema,
  BilibiliFollowerMonitorListV2Schema,
  BilibiliFollowerMonitorV2Schema,
  BilibiliFollowerTrendListV2Schema,
  BilibiliFollowerTrendV2Schema,
  BilibiliSubjectTrendV2Schema,
  BilibiliSubjectWorkbenchV2Schema,
  DeleteBilibiliFollowerMonitorResultSchema,
  BilibiliQrLoginIdInputSchema,
  BilibiliFollowerMonitorIdInputSchema,
  BindSubjectAccountInputSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  ListPlatformAccountsInputSchema,
  PlatformAdapterListSchema,
  PlatformCollectionExecutionSchema,
  RunPlatformCollectionInputSchema,
  ListSubjectsInputSchema,
  ListBilibiliFollowerMonitorsInputSchema,
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  UpdateBilibiliFollowerMonitorSettingsInputSchema,
  UpdateBilibiliFollowerMonitorStatusInputSchema,
  AddBilibiliLiveRoomInputSchema,
  BilibiliLiveRoomIdInputSchema,
  ListBilibiliLiveRoomsInputSchema,
  QueryBilibiliLiveEventsInputSchema,
  QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInputSchema,
  UpdateBilibiliLiveRoomSettingsInputSchema,
  UpdateBilibiliLiveRoomStatusInputSchema,
  BilibiliLiveRankLatestInputSchema,
  BilibiliLiveRankRefreshInputSchema,
  StartBilibiliLiveDanmakuInputSchema,
  BilibiliLiveDanmakuRoomInputSchema,
  QueryBilibiliLiveDanmakuRecentInputSchema,
  QueryBilibiliLiveDanmakuMetricsInputSchema,
  BilibiliLiveSessionIdInputSchema,
  ListBilibiliLiveSessionsInputSchema,
  ListBilibiliLiveSessionUsersInputSchema,
  QueryBilibiliLiveSessionEventsInputSchema,
  QueryBilibiliLiveSessionInsightInputSchema,
  ExportBilibiliLiveSessionInputSchema,
  BilibiliSubjectIdInputSchema,
  CreateBilibiliSubjectInputSchema,
  ListBilibiliSubjectsInputSchema,
  QueryBilibiliSubjectTrendsInputSchema,
  UpdateBilibiliSubjectBindingInputSchema,
  UpdateBilibiliSubjectInputSchema,
  UpdateBilibiliSubjectLayoutInputSchema,
  CompleteDouyinOAuthInputSchema,
  DouyinOAuthCallbackFailureSchema,
  DouyinCredentialMutationResultSchema,
  DouyinCredentialKindInputSchema,
  DouyinQrLoginIdInputSchema,
  type DouyinCredential,
  type RuntimeEnvelope
} from "@bmd/contracts"
import { CoreApplicationError, type LocalCoreRuntime } from "@bmd/core-runtime"

export interface BusinessDispatchResult {
  responseType: string
  payload: unknown
}

export function dispatchBusinessRequest(
  runtime: LocalCoreRuntime,
  request: RuntimeEnvelope,
  reportProgress?: () => void
): BusinessDispatchResult | Promise<BusinessDispatchResult> {
  switch (request.type) {
    case "platform.adapters.list":
      return {
        responseType: "platform.adapters.list.result",
        payload: PlatformAdapterListSchema.parse(runtime.listPlatformAdapters())
      }
    case "platform.collection.run-once":
      return runtime.runPlatformCollection(RunPlatformCollectionInputSchema.parse(request.payload))
        .then((payload) => ({
          responseType: "platform.collection.run-once.result",
          payload: PlatformCollectionExecutionSchema.parse(payload)
        }))
    case "platform-accounts.list":
      return {
        responseType: "platform-accounts.list.result",
        payload: runtime.listPlatformAccounts(ListPlatformAccountsInputSchema.parse(request.payload))
      }
    case "platform-accounts.create":
      return {
        responseType: "platform-accounts.create.result",
        payload: runtime.createPlatformAccount(CreatePlatformAccountInputSchema.parse(request.payload))
      }
    case "subjects.list":
      return {
        responseType: "subjects.list.result",
        payload: runtime.listSubjects(ListSubjectsInputSchema.parse(request.payload))
      }
    case "subjects.create":
      return {
        responseType: "subjects.create.result",
        payload: runtime.createSubject(CreateSubjectInputSchema.parse(request.payload))
      }
    case "subjects.bind-account":
      return {
        responseType: "subjects.bind-account.result",
        payload: runtime.bindSubjectAccount(BindSubjectAccountInputSchema.parse(request.payload))
      }
    case "bilibili-subjects.list": {
      const input = ListBilibiliSubjectsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.list.result",
        payload: runtime.listBilibiliSubjects(input.limit)
      }
    }
    case "bilibili-subjects.create":
      return runtime.createBilibiliSubject(CreateBilibiliSubjectInputSchema.parse(request.payload))
        .then((payload) => ({ responseType: "bilibili-subjects.create.result", payload }))
    case "bilibili-subjects.get": {
      const input = BilibiliSubjectIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.get.result",
        payload: runtime.getBilibiliSubject(input.subjectId)
      }
    }
    case "bilibili-subjects.update": {
      const input = UpdateBilibiliSubjectInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.update.result",
        payload: runtime.updateBilibiliSubject(input)
      }
    }
    case "bilibili-subjects.delete": {
      const input = BilibiliSubjectIdInputSchema.parse(request.payload)
      runtime.deleteBilibiliSubject(input.subjectId)
      return {
        responseType: "bilibili-subjects.delete.result",
        payload: { deleted: true }
      }
    }
    case "bilibili-subjects.bind":
      return runtime.bindBilibiliSubject(
        UpdateBilibiliSubjectBindingInputSchema.parse(request.payload)
      ).then((payload) => ({ responseType: "bilibili-subjects.bind.result", payload }))
    case "bilibili-subjects.workbench": {
      const input = BilibiliSubjectIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.workbench.result",
        payload: runtime.getBilibiliSubjectWorkbench(input.subjectId)
      }
    }
    case "bilibili-subjects.trends": {
      const input = QueryBilibiliSubjectTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.trends.result",
        payload: runtime.queryBilibiliSubjectTrends(input)
      }
    }
    case "bilibili-subjects.layout.update": {
      const input = UpdateBilibiliSubjectLayoutInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.layout.update.result",
        payload: runtime.updateBilibiliSubjectLayout(input)
      }
    }
    case "bilibili-subjects.workbench.v3": {
      const input = BilibiliSubjectIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.workbench.v3.result",
        payload: BilibiliSubjectWorkbenchV3Schema.parse(runtime.getBilibiliSubjectWorkbenchV3(input.subjectId))
      }
    }
    case "bilibili-subjects.trends.v3": {
      const input = QueryBilibiliSubjectTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.trends.v3.result",
        payload: BilibiliSubjectTrendV3Schema.parse(runtime.queryBilibiliSubjectTrendsV3(input))
      }
    }
    case "bilibili-subjects.workbench.v2": {
      const input = BilibiliSubjectIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.workbench.v2.result",
        payload: BilibiliSubjectWorkbenchV2Schema.parse(runtime.getBilibiliSubjectWorkbenchV2(input.subjectId))
      }
    }
    case "bilibili-subjects.trends.v2": {
      const input = QueryBilibiliSubjectTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-subjects.trends.v2.result",
        payload: BilibiliSubjectTrendV2Schema.parse(runtime.queryBilibiliSubjectTrendsV2(input))
      }
    }
    case "bilibili-followers.list.v2":
      return {
        responseType: "bilibili-followers.list.v2.result",
        payload: BilibiliFollowerMonitorListV2Schema.parse(runtime.listBilibiliFollowerMonitorsV2(
          ListBilibiliFollowerMonitorsInputSchema.parse(request.payload)
        ))
      }
    case "bilibili-followers.add.v2":
      return runtime.addBilibiliFollowerMonitorV2(AddBilibiliFollowerMonitorInputV2Schema.parse(request.payload))
        .then(payload => ({ responseType: "bilibili-followers.add.v2.result", payload: BilibiliFollowerMonitorV2Schema.parse(payload) }))
    case "bilibili-followers.update-status.v2": {
      const input = UpdateBilibiliFollowerMonitorStatusInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.update-status.v2.result",
        payload: BilibiliFollowerMonitorV2Schema.parse(runtime.updateBilibiliFollowerMonitorStatusV2(input.userId, input.enabled))
      }
    }
    case "bilibili-followers.update-settings.v2": {
      const input = UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.update-settings.v2.result",
        payload: BilibiliFollowerMonitorV2Schema.parse(runtime.updateBilibiliFollowerMonitorSettingsV2(input.userId, input.intervalSeconds))
      }
    }
    case "bilibili-followers.refresh.v2": {
      const input = BilibiliFollowerMonitorIdInputSchema.parse(request.payload)
      return runtime.refreshBilibiliFollowerMonitorV2(input.userId)
        .then(payload => ({ responseType: "bilibili-followers.refresh.v2.result", payload: BilibiliFollowerCollectResultV2Schema.parse(payload) }))
    }
    case "bilibili-followers.delete.v2": {
      const input = BilibiliFollowerMonitorIdInputSchema.parse(request.payload)
      runtime.deleteBilibiliFollowerMonitor(input.userId)
      return {
        responseType: "bilibili-followers.delete.v2.result",
        payload: DeleteBilibiliFollowerMonitorResultSchema.parse({ deleted: true })
      }
    }
    case "bilibili-followers.trend.v2": {
      const input = QueryBilibiliFollowerTrendInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.trend.v2.result",
        payload: BilibiliFollowerTrendV2Schema.parse(runtime.queryBilibiliFollowerTrendV2(input.userId, {
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
          limit: input.limit
        }))
      }
    }
    case "bilibili-followers.trends.v2": {
      const input = QueryBilibiliFollowerTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.trends.v2.result",
        payload: BilibiliFollowerTrendListV2Schema.parse(runtime.queryBilibiliFollowerTrendsV2(input))
      }
    }
    case "bilibili-followers.list":
      return {
        responseType: "bilibili-followers.list.result",
        payload: runtime.listBilibiliFollowerMonitors(
          ListBilibiliFollowerMonitorsInputSchema.parse(request.payload)
        )
      }
    case "bilibili-followers.add":
      return runtime
        .addBilibiliFollowerMonitor(AddBilibiliFollowerMonitorInputSchema.parse(request.payload))
        .then((payload) => ({ responseType: "bilibili-followers.add.result", payload }))
    case "bilibili-followers.update-status": {
      const input = UpdateBilibiliFollowerMonitorStatusInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.update-status.result",
        payload: runtime.updateBilibiliFollowerMonitorStatus(input.userId, input.enabled)
      }
    }
    case "bilibili-followers.update-settings": {
      const input = UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.update-settings.result",
        payload: runtime.updateBilibiliFollowerMonitorSettings(input.userId, input.intervalSeconds)
      }
    }
    case "bilibili-followers.refresh": {
      const input = BilibiliFollowerMonitorIdInputSchema.parse(request.payload)
      return runtime.refreshBilibiliFollowerMonitor(input.userId)
        .then((payload) => ({ responseType: "bilibili-followers.refresh.result", payload }))
    }
    case "bilibili-followers.delete": {
      const input = BilibiliFollowerMonitorIdInputSchema.parse(request.payload)
      runtime.deleteBilibiliFollowerMonitor(input.userId)
      return {
        responseType: "bilibili-followers.delete.result",
        payload: { deleted: true }
      }
    }
    case "bilibili-followers.trend": {
      const input = QueryBilibiliFollowerTrendInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.trend.result",
        payload: runtime.queryBilibiliFollowerTrend(input.userId, {
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
          limit: input.limit
        })
      }
    }
    case "bilibili-followers.trends": {
      const input = QueryBilibiliFollowerTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-followers.trends.result",
        payload: runtime.queryBilibiliFollowerTrends(input)
      }
    }
    case "bilibili-auth.qr.start":
      return runtime.startBilibiliQrLogin()
        .then((payload) => ({ responseType: "bilibili-auth.qr.start.result", payload }))
    case "bilibili-auth.qr.poll": {
      const input = BilibiliQrLoginIdInputSchema.parse(request.payload)
      return runtime.pollBilibiliQrLogin(input.loginId)
        .then((payload) => ({ responseType: "bilibili-auth.qr.poll.result", payload }))
    }
    case "bilibili-auth.status":
      return runtime.getBilibiliAuthStatus()
        .then((payload) => ({ responseType: "bilibili-auth.status.result", payload }))
    case "bilibili-auth.refresh":
      return runtime.refreshBilibiliAuth()
        .then((payload) => ({ responseType: "bilibili-auth.refresh.result", payload }))
    case "bilibili-auth.credential":
      return runtime.getBilibiliCredential()
        .then((payload) => ({ responseType: "bilibili-auth.credential.result", payload }))
    case "bilibili-auth.revoke":
      return runtime.revokeBilibiliAuth()
        .then((payload) => ({ responseType: "bilibili-auth.revoke.result", payload }))
    case "bilibili-live.rooms.list.v2":
      return {
        responseType: "bilibili-live.rooms.list.v2.result",
        payload: runtime.listBilibiliLiveRoomsV2(ListBilibiliLiveRoomsInputSchema.parse(request.payload))
      }
    case "bilibili-live.rooms.add.v2":
      return runtime.addBilibiliLiveRoomV2(AddBilibiliLiveRoomInputSchema.parse(request.payload))
        .then((payload) => ({ responseType: "bilibili-live.rooms.add.v2.result", payload }))
    case "bilibili-live.rooms.update-status.v2": {
      const input = UpdateBilibiliLiveRoomStatusInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.rooms.update-status.v2.result",
        payload: runtime.updateBilibiliLiveRoomStatusV2(input.roomMonitorId, input.enabled)
      }
    }
    case "bilibili-live.rooms.update-settings.v2": {
      const input = UpdateBilibiliLiveRoomSettingsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.rooms.update-settings.v2.result",
        payload: runtime.updateBilibiliLiveRoomSettingsV2(input.roomMonitorId, input.intervalSeconds)
      }
    }
    case "bilibili-live.rooms.refresh.v2": {
      const input = BilibiliLiveRoomIdInputSchema.parse(request.payload)
      return runtime.refreshBilibiliLiveRoomV2(input.roomMonitorId)
        .then((payload) => ({ responseType: "bilibili-live.rooms.refresh.v2.result", payload }))
    }
    case "bilibili-live.summary.v2":
      return {
        responseType: "bilibili-live.summary.v2.result",
        payload: runtime.getBilibiliLiveSummaryV2()
      }
    case "bilibili-live.trend.v2": {
      const input = QueryBilibiliLiveTrendInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.trend.v2.result",
        payload: runtime.queryBilibiliLiveTrendV2(input)
      }
    }
    case "bilibili-live.trends.v2": {
      const input = QueryBilibiliLiveTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.trends.v2.result",
        payload: runtime.queryBilibiliLiveTrendsV2(input)
      }
    }
    case "bilibili-live.events.v2": {
      const input = QueryBilibiliLiveEventsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.events.v2.result",
        payload: runtime.listBilibiliLiveEventsV2(input)
      }
    }
    case "bilibili-live.rooms.list":
      return {
        responseType: "bilibili-live.rooms.list.result",
        payload: runtime.listBilibiliLiveRooms(ListBilibiliLiveRoomsInputSchema.parse(request.payload))
      }
    case "bilibili-live.rooms.add":
      return runtime.addBilibiliLiveRoom(AddBilibiliLiveRoomInputSchema.parse(request.payload))
        .then((payload) => ({ responseType: "bilibili-live.rooms.add.result", payload }))
    case "bilibili-live.rooms.update-status": {
      const input = UpdateBilibiliLiveRoomStatusInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.rooms.update-status.result",
        payload: runtime.updateBilibiliLiveRoomStatus(input.roomMonitorId, input.enabled)
      }
    }
    case "bilibili-live.rooms.update-settings": {
      const input = UpdateBilibiliLiveRoomSettingsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.rooms.update-settings.result",
        payload: runtime.updateBilibiliLiveRoomSettings(input.roomMonitorId, input.intervalSeconds)
      }
    }
    case "bilibili-live.rooms.refresh": {
      const input = BilibiliLiveRoomIdInputSchema.parse(request.payload)
      return runtime.refreshBilibiliLiveRoom(input.roomMonitorId)
        .then((payload) => ({ responseType: "bilibili-live.rooms.refresh.result", payload }))
    }
    case "bilibili-live.rooms.delete": {
      const input = BilibiliLiveRoomIdInputSchema.parse(request.payload)
      runtime.deleteBilibiliLiveRoom(input.roomMonitorId)
      return { responseType: "bilibili-live.rooms.delete.result", payload: { deleted: true } }
    }
    case "bilibili-live.summary":
      return {
        responseType: "bilibili-live.summary.result",
        payload: runtime.getBilibiliLiveSummary()
      }
    case "bilibili-live.trend": {
      const input = QueryBilibiliLiveTrendInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.trend.result",
        payload: runtime.queryBilibiliLiveTrend(input)
      }
    }
    case "bilibili-live.trends": {
      const input = QueryBilibiliLiveTrendsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.trends.result",
        payload: runtime.queryBilibiliLiveTrends(input)
      }
    }
    case "bilibili-live.events": {
      const input = QueryBilibiliLiveEventsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.events.result",
        payload: runtime.listBilibiliLiveEvents(input)
      }
    }
    case "bilibili-live.ranks.summary.v2": {
      const input = BilibiliLiveRoomIdInputSchema.parse(request.payload)
      return { responseType: "bilibili-live.ranks.summary.v2.result",
        payload: runtime.getBilibiliLiveRankSummaryV2(input.roomMonitorId) }
    }
    case "bilibili-live.ranks.latest.v2": {
      const input = BilibiliLiveRankLatestInputSchema.parse(request.payload)
      return { responseType: "bilibili-live.ranks.latest.v2.result", payload: runtime.getLatestBilibiliLiveRankV2(input) }
    }
    case "bilibili-live.ranks.refresh.v2": {
      const input = BilibiliLiveRankRefreshInputSchema.parse(request.payload)
      return runtime.refreshBilibiliLiveRanksV2(input)
        .then(payload => ({ responseType: "bilibili-live.ranks.refresh.v2.result", payload }))
    }
    case "bilibili-live.ranks.summary": {
      const input = BilibiliLiveRoomIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.ranks.summary.result",
        payload: runtime.getBilibiliLiveRankSummary(input.roomMonitorId)
      }
    }
    case "bilibili-live.ranks.latest": {
      const input = BilibiliLiveRankLatestInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.ranks.latest.result",
        payload: runtime.getLatestBilibiliLiveRank(input)
      }
    }
    case "bilibili-live.ranks.refresh": {
      const input = BilibiliLiveRankRefreshInputSchema.parse(request.payload)
      return runtime.refreshBilibiliLiveRanks(input)
        .then((payload) => ({ responseType: "bilibili-live.ranks.refresh.result", payload }))
    }
    case "bilibili-live.danmaku.start": {
      const input = StartBilibiliLiveDanmakuInputSchema.parse(request.payload)
      return runtime.startBilibiliLiveDanmaku(input)
        .then((payload) => ({ responseType: "bilibili-live.danmaku.start.result", payload }))
    }
    case "bilibili-live.danmaku.stop": {
      const input = BilibiliLiveDanmakuRoomInputSchema.parse(request.payload)
      return runtime.stopBilibiliLiveDanmaku(input.roomMonitorId)
        .then((payload) => ({ responseType: "bilibili-live.danmaku.stop.result", payload }))
    }
    case "bilibili-live.danmaku.status": {
      const input = BilibiliLiveDanmakuRoomInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.danmaku.status.result",
        payload: runtime.getBilibiliLiveDanmakuStatus(input.roomMonitorId)
      }
    }
    case "bilibili-live.danmaku.recent": {
      const input = QueryBilibiliLiveDanmakuRecentInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.danmaku.recent.result",
        payload: runtime.getBilibiliLiveDanmakuRecent(input)
      }
    }
    case "bilibili-live.danmaku.metrics": {
      const input = QueryBilibiliLiveDanmakuMetricsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.danmaku.metrics.result",
        payload: runtime.getBilibiliLiveDanmakuMetrics(input)
      }
    }
    case "bilibili-live.sessions": {
      const input = ListBilibiliLiveSessionsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.sessions.result",
        payload: runtime.listBilibiliLiveSessions(input)
      }
    }
    case "bilibili-live.session": {
      const input = BilibiliLiveSessionIdInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.session.result",
        payload: runtime.getBilibiliLiveSession(input.sessionId)
      }
    }
    case "bilibili-live.session.users": {
      const input = ListBilibiliLiveSessionUsersInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.session.users.result",
        payload: runtime.listBilibiliLiveSessionUsers(input)
      }
    }
    case "bilibili-live.session.events": {
      const input = QueryBilibiliLiveSessionEventsInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.session.events.result",
        payload: runtime.queryBilibiliLiveSessionEvents(input)
      }
    }
    case "bilibili-live.session.insight": {
      const input = QueryBilibiliLiveSessionInsightInputSchema.parse(request.payload)
      return {
        responseType: "bilibili-live.session.insight.result",
        payload: runtime.getBilibiliLiveSessionInsight(input)
      }
    }
    case "bilibili-live.session.export": {
      const input = ExportBilibiliLiveSessionInputSchema.parse(request.payload)
      return runtime.prepareBilibiliLiveSessionExport(input, reportProgress)
        .then((payload) => ({ responseType: "bilibili-live.session.export.result", payload }))
    }
    case "douyin-auth.status":
      return runtime.getDouyinAuthStatus()
        .then((payload) => ({ responseType: "douyin-auth.status.result", payload }))
    case "douyin-auth.web.start":
      return runtime.startDouyinWebQr()
        .then((payload) => ({ responseType: "douyin-auth.web.start.result", payload }))
    case "douyin-auth.web.poll": {
      const input = DouyinQrLoginIdInputSchema.parse(request.payload)
      return runtime.pollDouyinWebQr(input.loginId)
        .then((payload) => ({ responseType: "douyin-auth.web.poll.result", payload }))
    }
    case "douyin-auth.web.validate":
      return runtime.validateDouyinWeb()
        .then((payload) => ({ responseType: "douyin-auth.web.validate.result", payload }))
    case "douyin-auth.oauth.start":
      return {
        responseType: "douyin-auth.oauth.start.result",
        payload: runtime.startDouyinOAuth()
      }
    case "douyin-auth.oauth.complete":
      return runtime.completeDouyinOAuth(CompleteDouyinOAuthInputSchema.parse(request.payload))
        .then((credential) => ({
          responseType: "douyin-auth.oauth.complete.result",
          payload: douyinCredentialMutation(credential)
        }))
    case "douyin-auth.oauth.fail-callback":
      return {
        responseType: "douyin-auth.oauth.fail-callback.result",
        payload: runtime.failDouyinOAuthCallback(
          DouyinOAuthCallbackFailureSchema.parse(request.payload)
        )
      }
    case "douyin-auth.oauth.refresh":
      return runtime.refreshDouyinOAuth()
        .then((credential) => ({
          responseType: "douyin-auth.oauth.refresh.result",
          payload: douyinCredentialMutation(credential)
        }))
    case "douyin-auth.credential": {
      const input = DouyinCredentialKindInputSchema.parse(request.payload)
      return { responseType: "douyin-auth.credential.result", payload: runtime.getDouyinCredential(input.kind) }
    }
    case "douyin-auth.revoke": {
      const input = DouyinCredentialKindInputSchema.parse(request.payload)
      return { responseType: "douyin-auth.revoke.result", payload: runtime.revokeDouyinCredential(input.kind) }
    }
    default:
      throw new CoreApplicationError(
        "CORE_METHOD_NOT_FOUND",
        `不支持的 Local Core 消息类型：${request.type}`
      )
  }
}

function douyinCredentialMutation(credential: DouyinCredential) {
  return DouyinCredentialMutationResultSchema.parse({
    credentialId: credential.credentialId,
    authType: credential.authType,
    status: credential.status,
    ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {})
  })
}
