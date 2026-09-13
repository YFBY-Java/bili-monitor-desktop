import type { AddBilibiliLiveRoomInput, BilibiliLiveRoom, BilibiliLiveSessionSummary,
  BilibiliLiveStatusEvent, ListBilibiliLiveSessionsInput } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { ConnectedBilibiliLiveWorkspace, type BilibiliLiveView } from "../BilibiliLiveWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const timestamp = "2026-09-05T02:00:00.000Z"
let rooms: BilibiliLiveRoom[] = Array.from({ length: 5 }, (_, index) => ({
  id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`, uid: String(index + 20), roomId: String(index + 120),
  uname: `测试主播${index + 1}`, title: "迁移测试直播间", monitorStatus: "ACTIVE", liveStatus: index === 1 ? 1 : 0,
  intervalSeconds: 300, onlineCount: 1234, attentionCount: 100, version: 1,
  lastSuccessAt: timestamp, nextCollectAt: "2026-09-05T02:05:00.000Z", sourceEndpoint: "room/v1/Room/get_info",
  recentTrend: [0, 1, 10].map((minute, pointIndex) => ({
    roomId: String(index + 120), uid: String(index + 20), capturedAt: new Date(Date.parse(timestamp) + minute * 60_000).toISOString(),
    liveStatus: 1, onlineCount: 100 - pointIndex * 10, sourceEndpoint: "room/v1/Room/get_info"
  }))
}))
let events: BilibiliLiveStatusEvent[] = []
// Synthetic histories are confined to this test entry; no production demo records.
const sessions: BilibiliLiveSessionSummary[] = rooms.flatMap((room, roomIndex) => Array.from({ length: 205 }, (_, index) => ({
  id: `018f0f39-7b5e-4cc1-962d-${String(roomIndex * 1000 + index).padStart(12, "0")}`,
  monitorId: room.id, uid: room.uid, roomId: room.roomId, state: "CLOSED",
  startedAt: new Date(Date.parse(timestamp) - index * 3_600_000).toISOString(), endedAt: timestamp,
  startSource: "REST_STATUS", endSource: "REST_STATUS", coverageStatus: "BOUNDARY_ONLY",
  transportSessionCount: 0, captureStartedAt: null, captureEndedAt: null,
  danmakuCount: null, giftEventCount: null, giftCount: null, freeGiftCount: null, giftSenderCount: null,
  paidUserCount: null, interactingUserCount: null, unresolvedInteractingEventCount: null,
  unresolvedGiftEventCount: null, unresolvedPaidEventCount: null, paidEventCount: null,
  paidAmountMilliYuan: null, firstEventAt: null, lastEventAt: null
})))
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
let releaseAction = (): void => undefined
const fixture = {
  actionError: "", listError: "", trendError: "", summaryError: "", holdAction: false,
  addResultIndex: undefined as number | undefined,
  calls: [] as string[], addInputs: [] as AddBilibiliLiveRoomInput[], missingTrendIds: [] as string[],
  sessionRequests: [] as ListBilibiliLiveSessionsInput[], sessionEventIds: [] as string[],
  sessionInsightIds: [] as string[],
  expandRoomList: () => {
    const template = rooms[0]!
    rooms = Array.from({ length: 505 }, (_, index) => ({ ...template,
      id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`,
      uid: String(index + 20), roomId: String(index + 120), uname: `测试主播${index + 1}`,
      recentTrend: template.recentTrend.map(point => ({ ...point, uid: String(index + 20), roomId: String(index + 120) }))
    }))
  },
  reload: () => client.invalidateQueries({ queryKey: ["bilibili-live"] }),
  release: () => releaseAction(),
  updateFirst: (intervalSeconds: number) => {
    rooms = rooms.map((room, index) => index === 0 ? { ...room, intervalSeconds } : room)
  },
  updateRoom: (index: number, values: Partial<BilibiliLiveRoom>) => {
    rooms = rooms.map((room, roomIndex) => roomIndex === index ? { ...room, ...values } : room)
  },
  missingHeat: () => {
    rooms = rooms.map((room) => ({ ...room, recentTrend: room.recentTrend.map((point, index) => {
      if (index !== 1) return point
      const { onlineCount: _, ...missing } = point
      return missing
    }) }))
  }
}
declare global { interface Window { liveFixture: typeof fixture } }
window.liveFixture = fixture
const bridge = createBrowserPreviewBridge()
function requireRoom(id: string): BilibiliLiveRoom {
  const room = rooms.find((room) => room.id === id)
  if (!room) throw new Error("监控直播间不存在")
  return room
}
async function action(name: string, roomId?: string): Promise<void> {
  fixture.calls.push(name)
  if (fixture.holdAction) await new Promise<void>((resolve) => { releaseAction = resolve })
  if (fixture.actionError) {
    if (roomId) rooms = rooms.map((room) => room.id === roomId ? {
      ...room, lastErrorType: "BILIBILI_RISK_CONTROL", lastErrorMessage: fixture.actionError
    } : room)
    throw new Error(fixture.actionError)
  }
}
bridge.bilibiliLive = {
  ...bridge.bilibiliLive,
  list: async (input) => {
    fixture.calls.push("list")
    if (fixture.listError) throw new Error(fixture.listError)
    const items = input?.limit === undefined ? rooms : rooms.slice(0, input.limit)
    return { items, total: items.length, snapshotAt: timestamp }
  },
  add: async (input) => {
    fixture.addInputs.push(input)
    await action("add")
    if (fixture.addResultIndex !== undefined) return rooms[fixture.addResultIndex]!
    const room: BilibiliLiveRoom = { ...rooms[0]!, id: crypto.randomUUID(), roomId: input.roomId ?? "999",
      uid: input.uid ?? "99", uname: `新主播${rooms.length + 1}`, intervalSeconds: input.intervalSeconds ?? 300 }
    rooms = [...rooms, room]
    return room
  },
  refresh: async ({ roomMonitorId }) => {
    await action("refresh", roomMonitorId)
    const room = requireRoom(roomMonitorId)
    rooms = rooms.map((item) => item.id === room.id ? { ...item, onlineCount: 45678, version: item.version + 1 } : item)
    return { roomMonitorId, uid: room.uid, roomId: room.roomId, success: true, onlineCount: 45678, capturedAt: timestamp, message: "ok" }
  },
  updateStatus: async ({ roomMonitorId, enabled }) => {
    await action("status", roomMonitorId)
    rooms = rooms.map((room) => room.id === roomMonitorId ? { ...room, monitorStatus: enabled ? "ACTIVE" : "PAUSED" } : room)
    return requireRoom(roomMonitorId)
  },
  updateSettings: async ({ roomMonitorId, intervalSeconds }) => {
    await action("settings", roomMonitorId)
    rooms = rooms.map((room) => room.id === roomMonitorId ? { ...room, intervalSeconds } : room)
    return requireRoom(roomMonitorId)
  },
  remove: async ({ roomMonitorId }) => {
    await action("delete", roomMonitorId)
    rooms = rooms.filter((room) => room.id !== roomMonitorId)
    return { deleted: true }
  },
  summary: async () => {
    if (fixture.summaryError) throw new Error(fixture.summaryError)
    return { totalRooms: rooms.length, activeRooms: rooms.filter((room) => room.monitorStatus === "ACTIVE").length,
      liveRooms: rooms.filter((room) => room.liveStatus === 1).length, roundRooms: 0, offlineRooms: rooms.length - 1,
      errorRooms: rooms.filter((room) => room.lastErrorType).length, totalOnlineCount: 1234, todayLiveStarts: 2 }
  },
  trends: async ({ roomMonitorIds = [] }) => {
    fixture.calls.push("trends")
    if (fixture.trendError) throw new Error(fixture.trendError)
    return roomMonitorIds.map((id) => {
      if (!rooms.some((room) => room.id === id)) fixture.missingTrendIds.push(id)
      const room = requireRoom(id)
      return { room, points: room.recentTrend }
    })
  },
  events: async () => events,
  sessions: async (input) => {
    fixture.sessionRequests.push(input)
    return sessions.filter(session => session.monitorId === input.roomMonitorId).slice(0, input.limit ?? 20)
  },
  sessionEvents: async (input) => {
    fixture.sessionEventIds.push(input.sessionId)
    return { items: [], total: 0, page: input.page ?? 1, size: input.size ?? 50 }
  },
  sessionInsight: async ({ sessionId, bucketSeconds = 300 }) => {
    fixture.sessionInsightIds.push(sessionId)
    return {
      sessionId, bucketSeconds,
      kpis: { danmakuPerMinute: null, payerConversionRate: null, arppuMilliYuan: null,
        paidAmountMilliYuan: null, topFiveRevenueShare: null },
      timeline: [], peaks: [], userSegments: [], giftMix: [], findings: [],
      danmakuDepth: { identifiedDanmakuUserCount: null, identifiedDanmakuCount: null,
        messagesPerActiveUser: null, repeatInteractionRate: null, sustainedParticipationRate: null,
        duplicateMessageRate: null, stages: [], repeatedMessages: [] },
      paymentDepth: { payerCount: null, repeatPayerRate: null, engagedPayerRate: null,
        returningPayerRate: null, medianPayerAmountMilliYuan: null, medianConversionLagSeconds: null,
        topOneRevenueShare: null, spendTiers: [] },
      quality: { coverageStatus: "BOUNDARY_ONLY", coveredSeconds: 0, identityResolvedEventShare: null,
        supportedEventCount: 0, unresolvedInteractionEventCount: 0, eventLatencyP95Millis: null,
        caveat: "合成边界场次，无在线采集覆盖。" }
    }
  }
}
function Fixture() {
  const [view, setView] = useState<BilibiliLiveView>("直播间")
  const [creationOpen, setCreationOpen] = useState(false)
  return <QueryClientProvider client={client}><main className="theme-light" style={{ padding: 24, minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
    <nav aria-label="测试页面导航">
    <button onClick={() => setView("直播间")}>查看直播间</button>
    <button onClick={() => setView("趋势对比")}>查看趋势</button>
    <button onClick={() => setView("状态事件")}>查看事件</button>
    <button onClick={() => setView("直播场次")}>查看场次</button>
    <button onClick={() => setView("数据中心")}>查看数据中心</button>
    <button onClick={() => setView("场次分析")}>查看场次分析</button>
    <button onClick={() => setCreationOpen(true)}>添加直播间</button>
    <button onClick={() => { events = [{ id: crypto.randomUUID(), monitorId: rooms[0]!.id,
      uid: rooms[0]!.uid, roomId: rooms[0]!.roomId, eventType: "TITLE_CHANGED",
      titleBefore: "旧标题", titleAfter: "新标题", occurredAt: timestamp }]; void fixture.reload() }}>注入测试事件</button>
    </nav>
    <ConnectedBilibiliLiveWorkspace bridge={bridge} view={view} creationOpen={creationOpen} onCloseCreation={() => setCreationOpen(false)} />
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
