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
  BootstrapResponseSchema,
  DeleteBilibiliFollowerMonitorResultSchema,
  ListBilibiliFollowerMonitorsInputSchema,
  PlatformAccountListSchema,
  PlatformAccountSchema,
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  RevokeBilibiliAuthResultSchema,
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
  BilibiliLiveSessionExportResultSchema,
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
  DouyinCredentialKindInputSchema,
  DouyinCredentialMutationResultSchema,
  DouyinCredentialSchema,
  ExportDouyinCredentialInputSchema,
  ExportDouyinCredentialResultSchema,
  DouyinOAuthStartSchema,
  DouyinOAuthCallbackFailureSchema,
  DouyinQrLoginIdInputSchema,
  DouyinQrLoginStartSchema,
  DouyinQrLoginStatusSchema,
  DouyinValidationResultSchema,
  RevokeDouyinCredentialResultSchema,
  type DesktopBridge
} from "@bmd/contracts"

export type DesktopInvoke = (channel: string, input?: unknown) => Promise<unknown>
export type DesktopSubscribe = (
  channel: string,
  listener: (value: unknown) => void
) => () => void

export function createDesktopBridge(
  invoke: DesktopInvoke,
  subscribe: DesktopSubscribe = () => () => undefined
): DesktopBridge {
  return {
    core: {
      bootstrap: async () => BootstrapResponseSchema.parse(await invoke("core:bootstrap")),
      restart: async () => BootstrapResponseSchema.parse(await invoke("core:restart"))
    },
    douyinAuth: {
      status: async () => DouyinAuthStatusSchema.parse(await invoke("douyin-auth:status")),
      startWebQr: async () => DouyinQrLoginStartSchema.parse(await invoke("douyin-auth:web-start")),
      pollWebQr: async (input) => DouyinQrLoginStatusSchema.parse(
        await invoke("douyin-auth:web-poll", DouyinQrLoginIdInputSchema.parse(input))
      ),
      validateWeb: async () => DouyinValidationResultSchema.parse(await invoke("douyin-auth:web-validate")),
      startOAuth: async () => DouyinOAuthStartSchema.parse(await invoke("douyin-auth:oauth-start")),
      onOAuthCallbackFailure: (listener) => subscribe(
        "douyin-auth:oauth-callback-failed",
        (value) => listener(DouyinOAuthCallbackFailureSchema.parse(value))
      ),
      completeOAuth: async (input) => DouyinCredentialMutationResultSchema.parse(
        await invoke("douyin-auth:oauth-complete", CompleteDouyinOAuthInputSchema.parse(input))
      ),
      refreshOAuth: async () => DouyinCredentialMutationResultSchema.parse(await invoke("douyin-auth:oauth-refresh")),
      credential: async (input) => DouyinCredentialSchema.parse(
        await invoke("douyin-auth:credential", DouyinCredentialKindInputSchema.parse(input))
      ),
      exportCredential: async (input) => ExportDouyinCredentialResultSchema.parse(
        await invoke("douyin-auth:export", ExportDouyinCredentialInputSchema.parse(input))
      ),
      revoke: async (input) => RevokeDouyinCredentialResultSchema.parse(
        await invoke("douyin-auth:revoke", DouyinCredentialKindInputSchema.parse(input))
      )
    },
    platformAccounts: {
      list: async (input) => PlatformAccountListSchema.parse(
        await invoke("platform-accounts:list", input ?? {})
      ),
      create: async (input) => PlatformAccountSchema.parse(
        await invoke("platform-accounts:create", input)
      )
    },
    subjects: {
      list: async (input) => SubjectListSchema.parse(await invoke("subjects:list", input ?? {})),
      create: async (input) => SubjectSummarySchema.parse(await invoke("subjects:create", input)),
      bindAccount: async (input) => SubjectSummarySchema.parse(
        await invoke("subjects:bind-account", input)
      )
    },
    bilibiliSubjects: {
      list: async (input) => BilibiliSubjectListSchema.parse(
        await invoke(
          "bilibili-subjects:list",
          ListBilibiliSubjectsInputSchema.parse(input ?? {})
        )
      ),
      create: async (input) => BilibiliSubjectSchema.parse(
        await invoke(
          "bilibili-subjects:create",
          CreateBilibiliSubjectInputSchema.parse(input)
        )
      ),
      get: async (input) => BilibiliSubjectSchema.parse(
        await invoke("bilibili-subjects:get", BilibiliSubjectIdInputSchema.parse(input))
      ),
      update: async (input) => BilibiliSubjectSchema.parse(
        await invoke(
          "bilibili-subjects:update",
          UpdateBilibiliSubjectInputSchema.parse(input)
        )
      ),
      remove: async (input) => DeleteBilibiliSubjectResultSchema.parse(
        await invoke("bilibili-subjects:delete", BilibiliSubjectIdInputSchema.parse(input))
      ),
      bind: async (input) => BilibiliSubjectBindingSchema.parse(
        await invoke(
          "bilibili-subjects:bind",
          UpdateBilibiliSubjectBindingInputSchema.parse(input)
        )
      ),
      workbench: async (input) => BilibiliSubjectWorkbenchSchema.parse(
        await invoke(
          "bilibili-subjects:workbench",
          BilibiliSubjectIdInputSchema.parse(input)
        )
      ),
      trends: async (input) => BilibiliSubjectTrendSchema.parse(
        await invoke(
          "bilibili-subjects:trends",
          QueryBilibiliSubjectTrendsInputSchema.parse(input)
        )
      ),
      workbenchV2: async (input) => BilibiliSubjectWorkbenchV2Schema.parse(
        await invoke("bilibili-subjects:workbench.v2", BilibiliSubjectIdInputSchema.parse(input))
      ),
      trendsV2: async (input) => BilibiliSubjectTrendV2Schema.parse(
        await invoke("bilibili-subjects:trends.v2", QueryBilibiliSubjectTrendsInputSchema.parse(input))
      ),
      updateLayout: async (input) => BilibiliSubjectWidgetLayoutSchema.array().parse(
        await invoke(
          "bilibili-subjects:layout-update",
          UpdateBilibiliSubjectLayoutInputSchema.parse(input)
        )
      )
    },
    bilibiliFollowersV2: {
      list: async (input) => BilibiliFollowerMonitorListV2Schema.parse(
        await invoke("bilibili-followers:list.v2", ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {}))
      ),
      add: async (input) => BilibiliFollowerMonitorV2Schema.parse(
        await invoke("bilibili-followers:add.v2", AddBilibiliFollowerMonitorInputV2Schema.parse(input))
      ),
      updateStatus: async (input) => BilibiliFollowerMonitorV2Schema.parse(
        await invoke("bilibili-followers:update-status.v2", UpdateBilibiliFollowerMonitorStatusInputSchema.parse(input))
      ),
      updateSettings: async (input) => BilibiliFollowerMonitorV2Schema.parse(
        await invoke("bilibili-followers:update-settings.v2", UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(input))
      ),
      refresh: async (input) => BilibiliFollowerCollectResultV2Schema.parse(
        await invoke("bilibili-followers:refresh.v2", BilibiliFollowerMonitorIdInputSchema.parse(input))
      ),
      remove: async (input) => DeleteBilibiliFollowerMonitorResultSchema.parse(
        await invoke("bilibili-followers:delete.v2", BilibiliFollowerMonitorIdInputSchema.parse(input))
      ),
      trend: async (input) => BilibiliFollowerTrendV2Schema.parse(
        await invoke("bilibili-followers:trend.v2", QueryBilibiliFollowerTrendInputSchema.parse(input))
      ),
      trends: async (input) => BilibiliFollowerTrendListV2Schema.parse(
        await invoke("bilibili-followers:trends.v2", QueryBilibiliFollowerTrendsInputSchema.parse(input))
      )
    },
    bilibiliFollowers: {
      list: async (input) => BilibiliFollowerMonitorListSchema.parse(
        await invoke("bilibili-followers:list", ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {}))
      ),
      add: async (input) => BilibiliFollowerMonitorSchema.parse(
        await invoke("bilibili-followers:add", AddBilibiliFollowerMonitorInputSchema.parse(input))
      ),
      updateStatus: async (input) => BilibiliFollowerMonitorSchema.parse(
        await invoke(
          "bilibili-followers:update-status",
          UpdateBilibiliFollowerMonitorStatusInputSchema.parse(input)
        )
      ),
      updateSettings: async (input) => BilibiliFollowerMonitorSchema.parse(
        await invoke(
          "bilibili-followers:update-settings",
          UpdateBilibiliFollowerMonitorSettingsInputSchema.parse(input)
        )
      ),
      refresh: async (input) => BilibiliFollowerCollectResultSchema.parse(
        await invoke("bilibili-followers:refresh", BilibiliFollowerMonitorIdInputSchema.parse(input))
      ),
      remove: async (input) => DeleteBilibiliFollowerMonitorResultSchema.parse(
        await invoke("bilibili-followers:delete", BilibiliFollowerMonitorIdInputSchema.parse(input))
      ),
      trend: async (input) => BilibiliFollowerTrendSchema.parse(
        await invoke("bilibili-followers:trend", QueryBilibiliFollowerTrendInputSchema.parse(input))
      ),
      trends: async (input) => BilibiliFollowerTrendListSchema.parse(
        await invoke("bilibili-followers:trends", QueryBilibiliFollowerTrendsInputSchema.parse(input))
      )
    },
    bilibiliAuth: {
      startQrLogin: async () => BilibiliQrLoginStartSchema.parse(
        await invoke("bilibili-auth:qr-start")
      ),
      pollQrLogin: async (input) => BilibiliQrLoginStatusSchema.parse(
        await invoke("bilibili-auth:qr-poll", BilibiliQrLoginIdInputSchema.parse(input))
      ),
      status: async () => BilibiliAuthStatusSchema.parse(
        await invoke("bilibili-auth:status")
      ),
      refresh: async () => BilibiliAuthRefreshResultSchema.parse(
        await invoke("bilibili-auth:refresh")
      ),
      credential: async () => BilibiliCredentialSchema.parse(
        await invoke("bilibili-auth:credential")
      ),
      revoke: async () => RevokeBilibiliAuthResultSchema.parse(
        await invoke("bilibili-auth:revoke")
      )
    },
    bilibiliLive: {
      list: async (input) => BilibiliLiveRoomListSchema.parse(
        await invoke("bilibili-live:rooms-list", ListBilibiliLiveRoomsInputSchema.parse(input ?? {}))
      ),
      add: async (input) => BilibiliLiveRoomSchema.parse(
        await invoke("bilibili-live:rooms-add", AddBilibiliLiveRoomInputSchema.parse(input))
      ),
      updateStatus: async (input) => BilibiliLiveRoomSchema.parse(
        await invoke(
          "bilibili-live:rooms-update-status",
          UpdateBilibiliLiveRoomStatusInputSchema.parse(input)
        )
      ),
      updateSettings: async (input) => BilibiliLiveRoomSchema.parse(
        await invoke(
          "bilibili-live:rooms-update-settings",
          UpdateBilibiliLiveRoomSettingsInputSchema.parse(input)
        )
      ),
      refresh: async (input) => BilibiliLiveCollectResultSchema.parse(
        await invoke("bilibili-live:rooms-refresh", BilibiliLiveRoomIdInputSchema.parse(input))
      ),
      remove: async (input) => DeleteBilibiliLiveRoomResultSchema.parse(
        await invoke("bilibili-live:rooms-delete", BilibiliLiveRoomIdInputSchema.parse(input))
      ),
      summary: async () => BilibiliLiveSummarySchema.parse(
        await invoke("bilibili-live:summary")
      ),
      trend: async (input) => BilibiliLiveRoomTrendSchema.parse(
        await invoke("bilibili-live:trend", QueryBilibiliLiveTrendInputSchema.parse(input))
      ),
      trends: async (input) => BilibiliLiveRoomTrendListSchema.parse(
        await invoke("bilibili-live:trends", QueryBilibiliLiveTrendsInputSchema.parse(input))
      ),
      events: async (input) => BilibiliLiveStatusEventListSchema.parse(
        await invoke("bilibili-live:events", QueryBilibiliLiveEventsInputSchema.parse(input ?? {}))
      ),
      rankSummary: async (input) => BilibiliLiveRankSummarySchema.parse(
        await invoke("bilibili-live:ranks-summary", BilibiliLiveRoomIdInputSchema.parse(input))
      ),
      rankLatest: async (input) => BilibiliLiveRankSnapshotSchema.parse(
        await invoke("bilibili-live:ranks-latest", BilibiliLiveRankLatestInputSchema.parse(input))
      ),
      rankRefresh: async (input) => BilibiliLiveRankRefreshResultSchema.parse(
        await invoke("bilibili-live:ranks-refresh", BilibiliLiveRankRefreshInputSchema.parse(input))
      ),
      danmakuStart: async (input) => BilibiliLiveDanmakuStatusSchema.parse(
        await invoke("bilibili-live:danmaku-start", StartBilibiliLiveDanmakuInputSchema.parse(input))
      ),
      danmakuStop: async (input) => BilibiliLiveDanmakuStatusSchema.parse(
        await invoke("bilibili-live:danmaku-stop", BilibiliLiveDanmakuRoomInputSchema.parse(input))
      ),
      danmakuStatus: async (input) => BilibiliLiveDanmakuStatusSchema.parse(
        await invoke("bilibili-live:danmaku-status", BilibiliLiveDanmakuRoomInputSchema.parse(input))
      ),
      danmakuRecent: async (input) => BilibiliLiveDanmakuRecentListSchema.parse(
        await invoke(
          "bilibili-live:danmaku-recent",
          QueryBilibiliLiveDanmakuRecentInputSchema.parse(input)
        )
      ),
      danmakuMetrics: async (input) => BilibiliLiveDanmakuMetricBucketListSchema.parse(
        await invoke(
          "bilibili-live:danmaku-metrics",
          QueryBilibiliLiveDanmakuMetricsInputSchema.parse(input)
        )
      ),
      sessions: async (input) => BilibiliLiveSessionSummaryListSchema.parse(
        await invoke("bilibili-live:sessions", ListBilibiliLiveSessionsInputSchema.parse(input))
      ),
      session: async (input) => BilibiliLiveSessionSummarySchema.parse(
        await invoke("bilibili-live:session", BilibiliLiveSessionIdInputSchema.parse(input))
      ),
      sessionUsers: async (input) => BilibiliLiveSessionUserListSchema.parse(
        await invoke(
          "bilibili-live:session-users",
          ListBilibiliLiveSessionUsersInputSchema.parse(input)
        )
      ),
      sessionEvents: async (input) => BilibiliLiveSessionEventPageSchema.parse(
        await invoke(
          "bilibili-live:session-events",
          QueryBilibiliLiveSessionEventsInputSchema.parse(input)
        )
      ),
      sessionInsight: async (input) => BilibiliLiveSessionInsightSchema.parse(
        await invoke(
          "bilibili-live:session-insight",
          QueryBilibiliLiveSessionInsightInputSchema.parse(input)
        )
      ),
      sessionExport: async (input) => BilibiliLiveSessionExportResultSchema.parse(
        await invoke(
          "bilibili-live:session-export",
          ExportBilibiliLiveSessionInputSchema.parse(input)
        )
      )
    }
  }
}
