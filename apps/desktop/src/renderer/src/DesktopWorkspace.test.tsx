import { renderToReadableStream } from "react-dom/server"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import type { DesktopBridge } from "@bmd/contracts"

import { DesktopWorkspace } from "./DesktopWorkspace"

async function renderWorkspace(workspace: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(workspace)
  await stream.allReady
  return new Response(stream).text()
}

describe("DesktopWorkspace", () => {
  const bridge: DesktopBridge = {
    bilibiliLiveRankV2: {
      summary: async () => { throw new Error("not used during server render") },
      latest: async () => { throw new Error("not used during server render") },
      refresh: async () => { throw new Error("not used during server render") }
    },
    core: {
      bootstrap: async () => { throw new Error("not used during server render") },
      restart: async () => { throw new Error("not used during server render") }
    },
    douyinAuth: {
      status: async () => ({ enabled: true, oauthMode: "disabled", workerAvailable: false, workerStatus: "DOWN", pollIntervalMs: 2_000 }),
      startWebQr: async () => { throw new Error("not used during server render") },
      pollWebQr: async () => { throw new Error("not used during server render") },
      validateWeb: async () => { throw new Error("not used during server render") },
      startOAuth: async () => { throw new Error("not used during server render") },
      onOAuthCallbackFailure: () => () => undefined,
      completeOAuth: async () => { throw new Error("not used during server render") },
      refreshOAuth: async () => { throw new Error("not used during server render") },
      credential: async () => { throw new Error("not used during server render") },
      exportCredential: async () => { throw new Error("not used during server render") },
      revoke: async (input) => ({ kind: input.kind, revoked: true })
    },
    platformAccounts: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-23T08:00:00.000Z" }),
      create: async () => { throw new Error("not used during server render") }
    },
    platformCollection: {
      listAdapters: async () => [],
      runOnce: async () => { throw new Error("not used during server render") }
    },
    subjects: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-23T08:00:00.000Z" }),
      create: async () => { throw new Error("not used during server render") },
      bindAccount: async () => { throw new Error("not used during server render") }
    },
    bilibiliSubjects: {
      list: async () => [],
      create: async () => { throw new Error("not used during server render") },
      get: async () => { throw new Error("not used during server render") },
      update: async () => { throw new Error("not used during server render") },
      remove: async () => ({ deleted: true }),
      bind: async () => { throw new Error("not used during server render") },
      workbench: async () => { throw new Error("not used during server render") },
      trends: async () => { throw new Error("not used during server render") },
      workbenchV3: async () => { throw new Error("preview unavailable") },
      trendsV3: async () => { throw new Error("preview unavailable") },
      workbenchV2: async () => { throw new Error("not used during server render") },
      trendsV2: async () => { throw new Error("not used during server render") },
      updateLayout: async () => []
    },
    bilibiliFollowers: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-29T12:00:00.000Z" }),
      add: async () => { throw new Error("not used during server render") },
      updateStatus: async () => { throw new Error("not used during server render") },
      updateSettings: async () => { throw new Error("not used during server render") },
      refresh: async () => { throw new Error("not used during server render") },
      remove: async () => ({ deleted: true }),
      trend: async () => { throw new Error("not used during server render") },
      trends: async () => []
    },
    bilibiliFollowersV2: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-29T12:00:00.000Z" }),
      add: async () => { throw new Error("not used during server render") },
      updateStatus: async () => { throw new Error("not used during server render") },
      updateSettings: async () => { throw new Error("not used during server render") },
      refresh: async () => { throw new Error("not used during server render") },
      remove: async () => ({ deleted: true }),
      trend: async () => { throw new Error("not used during server render") },
      trends: async () => []
    },
    bilibiliAuth: {
      startQrLogin: async () => { throw new Error("not used during server render") },
      pollQrLogin: async () => { throw new Error("not used during server render") },
      status: async () => ({ loggedIn: false, status: "NONE" }),
      refresh: async () => { throw new Error("not used during server render") },
      credential: async () => { throw new Error("not used during server render") },
      revoke: async () => ({ revoked: true })
    },
    bilibiliLiveV2: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-29T12:00:00.000Z" }),
      add: async () => { throw new Error("not used during server render") },
      updateStatus: async () => { throw new Error("not used during server render") },
      updateSettings: async () => { throw new Error("not used during server render") },
      refresh: async () => { throw new Error("not used during server render") },
      remove: async () => ({ deleted: true }),
      summary: async () => ({
        totalRooms: 0,
        activeRooms: 0,
        liveRooms: 0,
        roundRooms: 0,
        offlineRooms: 0,
        errorRooms: 0,
        totalOnlineCount: "0",
        todayLiveStarts: 0
      }),
      trend: async () => { throw new Error("not used during server render") },
      trends: async () => [],
      events: async () => [],
    },
    bilibiliLive: {
      list: async () => ({ items: [], total: 0, snapshotAt: "2026-08-29T12:00:00.000Z" }),
      add: async () => { throw new Error("not used during server render") },
      updateStatus: async () => { throw new Error("not used during server render") },
      updateSettings: async () => { throw new Error("not used during server render") },
      refresh: async () => { throw new Error("not used during server render") },
      remove: async () => ({ deleted: true }),
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
      trend: async () => { throw new Error("not used during server render") },
      trends: async () => [],
      events: async () => [],
      rankSummary: async () => { throw new Error("not used during server render") },
      rankLatest: async () => { throw new Error("not used during server render") },
      rankRefresh: async () => { throw new Error("not used during server render") },
      danmakuStart: async () => { throw new Error("not used during server render") },
      danmakuStop: async () => { throw new Error("not used during server render") },
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
      session: async () => { throw new Error("not configured") },
      sessionUsers: async () => [],
      sessionEvents: async (input) => ({ items: [], total: 0, page: input.page ?? 1, size: input.size ?? 50 }),
      sessionInsight: async () => { throw new Error("not configured") },
      sessionExport: async () => ({ category: "all", canceled: true })
    }
  }

  it("renders the pale light theme and exposes a dark-theme switch", async () => {
    const html = await renderWorkspace(<DesktopWorkspace initialPageId="bilibili-followers" />)

    expect(html).toContain("desktop-shell theme-light")
    expect(html).toContain('aria-label="切换至深色主题"')
  })

  it("shows only the real follower workspace and removes the explanatory side rail", async () => {
    const html = await renderWorkspace(
      <DesktopWorkspace initialPageId="bilibili-followers" bridge={bridge} />
    )

    expect(html).toContain("粉丝监控")
    expect(html).not.toContain("信号总览")
    expect(html).not.toContain("Agent 工作台")
    expect(html).not.toContain("模型路由")
    expect(html).not.toContain("ORIGINAL BUSINESS FLOW")
    expect(html).not.toContain("粉丝采集链路")
    expect(html).not.toContain("筛选")
    expect(html).not.toContain('aria-label="刷新"')
    expect(html).not.toContain('aria-label="通知"')
    expect(html).not.toContain('aria-label="本地用户"')
    expect(html).not.toContain("搜索页面、对象、工具")
    expect(html).toContain("workspace-layout is-single-pane")
  })

  it("renders the real local Core and SQLite bootstrap state in the sidebar", async () => {
    const html = await renderWorkspace(
      <DesktopWorkspace
        initialPageId="bilibili-followers"
        runtime={{
          phase: "ready",
          version: "0.1.0",
          schemaVersion: 1,
          workerCount: 0
        }}
      />
    )

    expect(html).toContain("Core 0.1.0 · SQLite v1")
    expect(html).not.toContain("18 / 18 服务在线")
  })

  it("routes the B/S follower business to the real local follower workspace", async () => {
    const html = await renderWorkspace(
      <DesktopWorkspace initialPageId="bilibili-followers" bridge={bridge} />
    )

    expect(html).toContain("B站用户粉丝监控")
    expect(html).toContain("监控用户")
    expect(html).toContain("趋势对比")
    expect(html).toContain("正在读取粉丝监控列表")
    expect(html).toContain("SQLite v3")
    expect(html).not.toContain("当前控制面")
    expect(html).not.toContain("UI DRAFT")
  })

  it("routes the B/S live REST business to the real local live workspace", async () => {
    const html = await renderWorkspace(
      <DesktopWorkspace initialPageId="bilibili-live" bridge={bridge} />
    )

    expect(html).toContain("B站直播间监控")
    expect(html).toContain("直播间")
    expect(html).toContain("趋势对比")
    expect(html).toContain("状态事件")
    expect(html).toContain("正在读取直播间监控")
    expect(html).toContain("正在读取本地保存的直播间数据。")
    expect(html).not.toContain("SQLite v6")
    expect(html).not.toContain("示例直播间")
    expect(html).not.toContain("Agent 工作台")
    expect(html).not.toContain("UI DRAFT")
  })

  it("routes the original Douyin self-auth business to the real local auth workspace", async () => {
    const html = await renderWorkspace(
      <DesktopWorkspace initialPageId="douyin-auth" bridge={bridge} />
    )

    expect(html).toContain("我的抖音登录态")
    expect(html).toContain("Web 扫码登录")
    expect(html).toContain("官方 OAuth")
    expect(html).toContain("正在读取抖音登录态")
    expect(html).toContain("SQLite v11")
    expect(html).not.toContain("UI DRAFT")
  })

  it.each([
    { pageId: "live-data", title: "数据中心", content: "数据中心暂无来源" },
    { pageId: "live-analytics", title: "分析看板", content: 'aria-label="分析看板"' }
  ] as const)("opens $title as a standalone real business workspace", async ({ pageId, title, content }) => {
    const html = await renderWorkspace(<DesktopWorkspace initialPageId={pageId} bridge={bridge} />)

    expect(html).toContain(`<h1>${title}</h1>`)
    expect(html).toContain(content)
    expect(html).toMatch(new RegExp(`aria-current="page"[^>]*>.*?<span>${title}</span>`, "s"))
    expect(html).toContain("workspace-layout is-single-pane")
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain("UI DRAFT")
  })
})
