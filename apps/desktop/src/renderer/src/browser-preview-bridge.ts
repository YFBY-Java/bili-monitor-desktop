import type { DesktopBridge } from "@bmd/contracts"

function readOnlyError(): Error {
  return new Error("BROWSER_PREVIEW_READ_ONLY: 普通浏览器只用于查看 UI，请在 Electron 客户端中执行真实业务操作。")
}

export function createBrowserPreviewBridge(): DesktopBridge {
  const timestamp = new Date().toISOString()
  const bootstrap = async () => ({
    coreStatus: {
      state: "offline" as const,
      version: "browser-preview",
      dataDirectory: "Electron 客户端本地数据目录",
      databaseReady: false,
      schemaVersion: 11,
      startedAt: timestamp,
      lastError: "普通浏览器只读预览"
    },
    workers: [],
    sequence: 0
  })

  return {
    core: { bootstrap, restart: bootstrap },
    douyinAuth: {
      status: async () => ({
        enabled: true,
        oauthMode: "disabled",
        workerAvailable: false,
        workerStatus: "BROWSER_PREVIEW",
        pollIntervalMs: 2_000
      }),
      startWebQr: async () => { throw readOnlyError() },
      pollWebQr: async () => { throw readOnlyError() },
      validateWeb: async () => { throw readOnlyError() },
      startOAuth: async () => { throw readOnlyError() },
      onOAuthCallbackFailure: () => () => undefined,
      completeOAuth: async () => { throw readOnlyError() },
      refreshOAuth: async () => { throw readOnlyError() },
      credential: async () => { throw readOnlyError() },
      exportCredential: async () => { throw readOnlyError() },
      revoke: async () => { throw readOnlyError() }
    },
    platformAccounts: {
      list: async () => ({ items: [], total: 0, snapshotAt: timestamp }),
      create: async () => { throw readOnlyError() }
    },
    subjects: {
      list: async () => ({ items: [], total: 0, snapshotAt: timestamp }),
      create: async () => { throw readOnlyError() },
      bindAccount: async () => { throw readOnlyError() }
    },
    bilibiliSubjects: {
      list: async () => [],
      create: async () => { throw readOnlyError() },
      get: async () => { throw readOnlyError() },
      update: async () => { throw readOnlyError() },
      remove: async () => { throw readOnlyError() },
      bind: async () => { throw readOnlyError() },
      workbench: async () => { throw readOnlyError() },
      trends: async () => { throw readOnlyError() },
      updateLayout: async () => { throw readOnlyError() }
    },
    bilibiliFollowers: {
      list: async () => ({ items: [], total: 0, snapshotAt: timestamp }),
      add: async () => { throw readOnlyError() },
      updateStatus: async () => { throw readOnlyError() },
      updateSettings: async () => { throw readOnlyError() },
      refresh: async () => { throw readOnlyError() },
      remove: async () => { throw readOnlyError() },
      trend: async () => { throw readOnlyError() },
      trends: async () => []
    },
    bilibiliAuth: {
      startQrLogin: async () => { throw readOnlyError() },
      pollQrLogin: async () => { throw readOnlyError() },
      status: async () => ({ loggedIn: false, status: "NONE" }),
      refresh: async () => { throw readOnlyError() },
      credential: async () => { throw readOnlyError() },
      revoke: async () => { throw readOnlyError() }
    },
    bilibiliLive: {
      list: async () => ({ items: [], total: 0, snapshotAt: timestamp }),
      add: async () => { throw readOnlyError() },
      updateStatus: async () => { throw readOnlyError() },
      updateSettings: async () => { throw readOnlyError() },
      refresh: async () => { throw readOnlyError() },
      remove: async () => { throw readOnlyError() },
      summary: async () => ({
        totalRooms: 0,
        activeRooms: 0,
        liveRooms: 0,
        roundRooms: 0,
        offlineRooms: 0,
        errorRooms: 0,
        totalOnlineCount: 0,
        todayLiveStarts: 0
      }),
      trend: async () => { throw readOnlyError() },
      trends: async () => [],
      events: async () => [],
      rankSummary: async () => { throw readOnlyError() },
      rankLatest: async () => { throw readOnlyError() },
      rankRefresh: async () => { throw readOnlyError() },
      danmakuStart: async () => { throw readOnlyError() },
      danmakuStop: async () => { throw readOnlyError() },
      danmakuStatus: async (input) => ({
        liveRoomMonitorId: input.roomMonitorId,
        running: false,
        status: "NOT_STARTED",
        ratePerMinute: 0,
        last5MinutesCount: 0,
        likeIncrement: 0
      }),
      danmakuRecent: async () => [],
      danmakuMetrics: async () => [],
      sessions: async () => [],
      session: async () => { throw readOnlyError() },
      sessionUsers: async () => [],
      sessionEvents: async (input) => ({ items: [], total: 0, page: input.page ?? 1, size: input.size ?? 50 }),
      sessionInsight: async () => { throw readOnlyError() },
      sessionExport: async () => { throw readOnlyError() }
    }
  }
}
