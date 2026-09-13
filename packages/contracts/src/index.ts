export const CORE_API_VERSION = "1" as const

export * from "./account-subject"
export * from "./bilibili-auth"
export * from "./bilibili-follower"
export * from "./bilibili-live"
export * from "./bilibili-live-configuration"
export * from "./bilibili-live-danmaku"
export * from "./bilibili-live-session"
export * from "./bilibili-live-rank"
export * from "./bilibili-subject"
export * from "./douyin-auth"
export * from "./runtime-protocol"

import type {
  BindSubjectAccountInput,
  CreatePlatformAccountInput,
  CreateSubjectInput,
  ListPlatformAccountsInput,
  ListSubjectsInput,
  PlatformAccount,
  PlatformAccountList,
  SubjectList,
  SubjectSummary
} from "./account-subject"
import type {
  AddBilibiliFollowerMonitorInput,
  BilibiliFollowerCollectResult,
  BilibiliFollowerMonitor,
  BilibiliFollowerMonitorList,
  BilibiliFollowerTrend,
  DeleteBilibiliFollowerMonitorResult,
  ListBilibiliFollowerMonitorsInput,
  QueryBilibiliFollowerTrendInput,
  QueryBilibiliFollowerTrendsInput,
  RefreshBilibiliFollowerMonitorInput,
  UpdateBilibiliFollowerMonitorSettingsInput,
  UpdateBilibiliFollowerMonitorStatusInput
} from "./bilibili-follower"
import type {
  BilibiliAuthRefreshResult,
  BilibiliAuthStatus,
  BilibiliCredential,
  BilibiliQrLoginStart,
  BilibiliQrLoginStatus,
  RevokeBilibiliAuthResult
} from "./bilibili-auth"
import type {
  AddBilibiliLiveRoomInput,
  BilibiliLiveCollectResult,
  BilibiliLiveRoom,
  BilibiliLiveRoomList,
  BilibiliLiveRoomTrend,
  BilibiliLiveStatusEvent,
  BilibiliLiveSummary,
  DeleteBilibiliLiveRoomResult,
  ListBilibiliLiveRoomsInput,
  QueryBilibiliLiveEventsInput,
  QueryBilibiliLiveTrendInput,
  QueryBilibiliLiveTrendsInput,
  UpdateBilibiliLiveRoomSettingsInput,
  UpdateBilibiliLiveRoomStatusInput
} from "./bilibili-live"
import type {
  BilibiliLiveDanmakuMetricBucket,
  BilibiliLiveDanmakuRecent,
  BilibiliLiveDanmakuStatus,
  QueryBilibiliLiveDanmakuMetricsInput,
  QueryBilibiliLiveDanmakuRecentInput,
  StartBilibiliLiveDanmakuInput
} from "./bilibili-live-danmaku"
import type {
  BilibiliLiveRankLatestInput,
  BilibiliLiveRankRefreshInput,
  BilibiliLiveRankRefreshResult,
  BilibiliLiveRankSnapshot,
  BilibiliLiveRankSummary
} from "./bilibili-live-rank"
import type {
  BilibiliLiveSessionEventPage,
  BilibiliLiveSessionInsight,
  BilibiliLiveSessionSummary,
  BilibiliLiveSessionUser,
  ListBilibiliLiveSessionsInput,
  ListBilibiliLiveSessionUsersInput,
  QueryBilibiliLiveSessionEventsInput,
  QueryBilibiliLiveSessionInsightInput,
  ExportBilibiliLiveSessionInput,
  BilibiliLiveSessionExportResult
} from "./bilibili-live-session"
import type {
  BilibiliSubject,
  BilibiliSubjectBinding,
  BilibiliSubjectTrend,
  BilibiliSubjectWidgetLayout,
  BilibiliSubjectWorkbench,
  CreateBilibiliSubjectInput,
  QueryBilibiliSubjectTrendsInput,
  UpdateBilibiliSubjectBindingInput,
  UpdateBilibiliSubjectInput,
  UpdateBilibiliSubjectLayoutInput
} from "./bilibili-subject"
import type { BootstrapResponse } from "./runtime-protocol"
import type {
  CompleteDouyinOAuthInput,
  DouyinAuthStatus,
  DouyinCredential,
  DouyinCredentialMutationResult,
  DouyinCredentialKind,
  DouyinOAuthStart,
  DouyinOAuthCallbackFailure,
  DouyinQrLoginStart,
  DouyinQrLoginStatus,
  DouyinValidationResult,
  ExportDouyinCredentialResult
} from "./douyin-auth"

export interface DesktopBridge {
  core: {
    bootstrap: () => Promise<BootstrapResponse>
    restart: () => Promise<BootstrapResponse>
  }
  douyinAuth: {
    status: () => Promise<DouyinAuthStatus>
    startWebQr: () => Promise<DouyinQrLoginStart>
    pollWebQr: (input: { loginId: string }) => Promise<DouyinQrLoginStatus>
    validateWeb: () => Promise<DouyinValidationResult>
    startOAuth: () => Promise<DouyinOAuthStart>
    onOAuthCallbackFailure: (
      listener: (failure: DouyinOAuthCallbackFailure) => void
    ) => () => void
    completeOAuth: (input: CompleteDouyinOAuthInput) => Promise<DouyinCredentialMutationResult>
    refreshOAuth: () => Promise<DouyinCredentialMutationResult>
    credential: (input: { kind: DouyinCredentialKind }) => Promise<DouyinCredential>
    exportCredential: (input: { kind: DouyinCredentialKind }) => Promise<ExportDouyinCredentialResult>
    revoke: (input: { kind: DouyinCredentialKind }) => Promise<{ kind: DouyinCredentialKind; revoked: true }>
  }
  platformAccounts: {
    list: (input?: ListPlatformAccountsInput) => Promise<PlatformAccountList>
    create: (input: CreatePlatformAccountInput) => Promise<PlatformAccount>
  }
  subjects: {
    list: (input?: ListSubjectsInput) => Promise<SubjectList>
    create: (input: CreateSubjectInput) => Promise<SubjectSummary>
    bindAccount: (input: BindSubjectAccountInput) => Promise<SubjectSummary>
  }
  bilibiliSubjects: {
    list: (input?: { limit?: number }) => Promise<BilibiliSubject[]>
    create: (input: CreateBilibiliSubjectInput) => Promise<BilibiliSubject>
    get: (input: { subjectId: string }) => Promise<BilibiliSubject>
    update: (input: UpdateBilibiliSubjectInput) => Promise<BilibiliSubject>
    remove: (input: { subjectId: string }) => Promise<{ deleted: true }>
    bind: (input: UpdateBilibiliSubjectBindingInput) => Promise<BilibiliSubjectBinding>
    workbench: (input: { subjectId: string }) => Promise<BilibiliSubjectWorkbench>
    trends: (input: QueryBilibiliSubjectTrendsInput) => Promise<BilibiliSubjectTrend>
    updateLayout: (
      input: UpdateBilibiliSubjectLayoutInput
    ) => Promise<BilibiliSubjectWidgetLayout[]>
  }
  bilibiliFollowers: {
    list: (input?: ListBilibiliFollowerMonitorsInput) => Promise<BilibiliFollowerMonitorList>
    add: (input: AddBilibiliFollowerMonitorInput) => Promise<BilibiliFollowerMonitor>
    updateStatus: (input: UpdateBilibiliFollowerMonitorStatusInput) => Promise<BilibiliFollowerMonitor>
    updateSettings: (input: UpdateBilibiliFollowerMonitorSettingsInput) => Promise<BilibiliFollowerMonitor>
    refresh: (input: RefreshBilibiliFollowerMonitorInput) => Promise<BilibiliFollowerCollectResult>
    remove: (input: RefreshBilibiliFollowerMonitorInput) => Promise<DeleteBilibiliFollowerMonitorResult>
    trend: (input: QueryBilibiliFollowerTrendInput) => Promise<BilibiliFollowerTrend>
    trends: (input: QueryBilibiliFollowerTrendsInput) => Promise<BilibiliFollowerTrend[]>
  }
  bilibiliAuth: {
    startQrLogin: () => Promise<BilibiliQrLoginStart>
    pollQrLogin: (input: { loginId: string }) => Promise<BilibiliQrLoginStatus>
    status: () => Promise<BilibiliAuthStatus>
    refresh: () => Promise<BilibiliAuthRefreshResult>
    credential: () => Promise<BilibiliCredential>
    revoke: () => Promise<RevokeBilibiliAuthResult>
  }
  bilibiliLive: {
    list: (input?: ListBilibiliLiveRoomsInput) => Promise<BilibiliLiveRoomList>
    add: (input: AddBilibiliLiveRoomInput) => Promise<BilibiliLiveRoom>
    updateStatus: (input: UpdateBilibiliLiveRoomStatusInput) => Promise<BilibiliLiveRoom>
    updateSettings: (input: UpdateBilibiliLiveRoomSettingsInput) => Promise<BilibiliLiveRoom>
    refresh: (input: { roomMonitorId: string }) => Promise<BilibiliLiveCollectResult>
    remove: (input: { roomMonitorId: string }) => Promise<DeleteBilibiliLiveRoomResult>
    summary: () => Promise<BilibiliLiveSummary>
    trend: (input: QueryBilibiliLiveTrendInput) => Promise<BilibiliLiveRoomTrend>
    trends: (input: QueryBilibiliLiveTrendsInput) => Promise<BilibiliLiveRoomTrend[]>
    events: (input?: QueryBilibiliLiveEventsInput) => Promise<BilibiliLiveStatusEvent[]>
    rankSummary: (input: { roomMonitorId: string }) => Promise<BilibiliLiveRankSummary>
    rankLatest: (input: BilibiliLiveRankLatestInput) => Promise<BilibiliLiveRankSnapshot>
    rankRefresh: (input: BilibiliLiveRankRefreshInput) => Promise<BilibiliLiveRankRefreshResult>
    danmakuStart: (input: StartBilibiliLiveDanmakuInput) => Promise<BilibiliLiveDanmakuStatus>
    danmakuStop: (input: { roomMonitorId: string }) => Promise<BilibiliLiveDanmakuStatus>
    danmakuStatus: (input: { roomMonitorId: string }) => Promise<BilibiliLiveDanmakuStatus>
    danmakuRecent: (
      input: QueryBilibiliLiveDanmakuRecentInput
    ) => Promise<BilibiliLiveDanmakuRecent[]>
    danmakuMetrics: (
      input: QueryBilibiliLiveDanmakuMetricsInput
    ) => Promise<BilibiliLiveDanmakuMetricBucket[]>
    sessions: (input: ListBilibiliLiveSessionsInput) => Promise<BilibiliLiveSessionSummary[]>
    session: (input: { sessionId: string }) => Promise<BilibiliLiveSessionSummary>
    sessionUsers: (
      input: ListBilibiliLiveSessionUsersInput
    ) => Promise<BilibiliLiveSessionUser[]>
    sessionEvents: (
      input: QueryBilibiliLiveSessionEventsInput
    ) => Promise<BilibiliLiveSessionEventPage>
    sessionInsight: (
      input: QueryBilibiliLiveSessionInsightInput
    ) => Promise<BilibiliLiveSessionInsight>
    sessionExport: (
      input: ExportBilibiliLiveSessionInput
    ) => Promise<BilibiliLiveSessionExportResult>
  }
}
