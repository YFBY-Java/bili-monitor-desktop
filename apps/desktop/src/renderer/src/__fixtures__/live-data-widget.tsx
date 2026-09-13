import type { BilibiliLiveDanmakuRecent, BilibiliLiveDanmakuStatus, BilibiliLiveRankRefreshInput,
  BilibiliLiveRankSnapshot, BilibiliLiveRankSummary, BilibiliLiveRoom, BilibiliSubjectWorkbench,
  QueryBilibiliLiveDanmakuRecentInput, StartBilibiliLiveDanmakuInput } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { ConnectedBilibiliLiveWorkspace } from "../BilibiliLiveWorkspace"
import { ConnectedBilibiliSubjectWorkspace } from "../BilibiliSubjectWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const timestamp = "2026-09-13T04:00:00.000Z"
const rooms: BilibiliLiveRoom[] = [0, 1].map(index => ({
  id: `018f0f39-7b5e-4cc1-862d-00000000000${index}`, uid: String(22 + index), roomId: String(33 + index),
  uname: `合成房间${index + 1}`, monitorStatus: "ACTIVE", liveStatus: 0, intervalSeconds: 300, version: 1,
  recentTrend: []
}))
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
let release = () => {}
const fixture = {
  roomId: rooms[0]!.id, enabled: true, bound: true, empty: false, status: "CONNECTED" as BilibiliLiveDanmakuStatus["status"],
  requestError: "", rankError: "", partial: false, hold: false, holdRead: false, revision: 0, noRanks: false,
  rankRequests: [] as BilibiliLiveRankRefreshInput[], starts: [] as StartBilibiliLiveDanmakuInput[], stops: [] as string[],
  recentRequests: [] as QueryBilibiliLiveDanmakuRecentInput[],
  release: () => release(), reload: () => client.invalidateQueries(),
  metadata: () => client.invalidateQueries({ queryKey: ["bilibili-subject-workbench"] })
}
declare global { interface Window { widgetFixture: typeof fixture } }
window.widgetFixture = fixture
const waitForRelease = () => new Promise<void>(resolve => { release = resolve })
function recent(roomMonitorId: string): BilibiliLiveDanmakuRecent[] {
  return fixture.empty ? [] : Array.from({ length: 60 }, (_, index) => ({
    senderUid: String(index + 100), displayName: index === 0 ? "  " : `读者${index}`,
    messageText: `${roomMonitorId === rooms[0]!.id ? "房间一" : "房间二"}消息${index}-${fixture.revision}`,
    sentAt: new Date(Date.parse(timestamp) + index * 1000).toISOString()
  }))
}
function summary(roomMonitorId: string): BilibiliLiveRankSummary {
  const specs = [["online_rank", "contribution_rank"], ["online_rank", "entry_time_rank"],
    ["daily_rank", "today_rank"], ["weekly_rank", "current_week_rank"], ["monthly_rank", "current_month_rank"],
    ["guard_weekly"], ["guard_monthly"], ["guard_accompany"]]
  const snapshots: BilibiliLiveRankSnapshot[] = specs.map(([type, rankSwitch], index) => ({
    id: `018f0f39-7b5e-4cc1-862d-00000000010${index}`, roomMonitorId, roomId: "33", ruid: "22",
    rankFamily: index < 5 ? "AUDIENCE" : "GUARD", rankType: type!, ...(rankSwitch ? { rankSwitch } : {}),
    pageNo: 1, pageSize: 50, capturedAt: timestamp,
    sourceEndpoint: "xlive/general-interface/v1/rank/getOnlineGoldRank", signedRequired: false,
    entries: index === 7 ? [
      { entryKind: "ENTRY", rankNo: 1, displayName: "短陪伴", accompanyDays: 7, guardLevel: 3 },
      { entryKind: "ENTRY", rankNo: 2, displayName: "长陪伴", accompanyDays: 365, guardLevel: 1 }
    ] : index >= 5 ? [
      { entryKind: "EXTOP", rankNo: 1, displayName: "上期用户", guardLevel: 2, score: 999 },
      { entryKind: "ENTRY", rankNo: 2, displayName: "舰长用户", guardLevel: 3 }
    ] : [
      { entryKind: "ENTRY", rankNo: 1, displayName: "低贡献", score: 1, faceUrl: "http://avatar.invalid/fail.jpg" },
      { entryKind: "ENTRY", rankNo: 2, displayName: "高贡献", score: 900, medalName: "花", medalLevel: 3 },
      ...Array.from({ length: 100 }, (_, i) => ({ entryKind: "ENTRY", rankNo: i + 3, displayName: `普通${i}`, score: 2 }))
    ]
  }))
  // Older duplicate must not replace the current day snapshot or create duplicate tabs.
  if (fixture.revision > 0) snapshots[0]!.entries[1]!.displayName = `更新后的高贡献${fixture.revision}`
  snapshots.push({ ...snapshots[2]!, id: "018f0f39-7b5e-4cc1-862d-000000000200",
    capturedAt: "2026-09-12T04:00:00.000Z", entries: [{ entryKind: "ENTRY", displayName: "旧快照" }] })
  return { roomMonitorId, roomId: "33", ruid: "22", audienceCount: 12345, guardCount: 2,
    guardCountText: "2 位", updatedAt: timestamp, snapshots: fixture.noRanks ? [] : snapshots }
}
function workbench(): BilibiliSubjectWorkbench {
  const room = rooms.find(item => item.id === fixture.roomId)!
  return {
    subject: { id: "018f0f39-7b5e-4cc1-862d-000000000300", displayName: "合成工作台", tags: [],
      monitorStatus: "ACTIVE", healthScore: 100, createdAt: timestamp, updatedAt: timestamp },
    ...(fixture.bound ? { bilibiliLiveRoom: { monitorId: room.id, uid: room.uid, roomId: room.roomId,
      uname: room.uname, liveStatus: room.liveStatus, monitorStatus: room.monitorStatus } } : {}),
    summary: { healthScore: 100, enabledModuleCount: 4, totalModuleCount: 4 },
    danmu: { enabled: fixture.enabled, status: !fixture.enabled ? "disabled" : !fixture.bound ? "missing_live_room" : "waiting",
      recentMessages: [] }, layout: [], recentEvents: []
  }
}
const bridge = createBrowserPreviewBridge()
bridge.bilibiliSubjects = { ...bridge.bilibiliSubjects,
  list: async () => [workbench().subject], workbench: async () => workbench(),
  trends: async ({ subjectId }) => ({ subjectId, metrics: ["follower"], range: "24h", bucket: "5m", points: [] }) }
bridge.bilibiliLive = { ...bridge.bilibiliLive,
  list: async () => ({ items: rooms, total: rooms.length, snapshotAt: timestamp }),
  summary: async () => ({ totalRooms: 2, activeRooms: 2, roundRooms: 0, offlineRooms: 2, liveRooms: 0, errorRooms: 0,
    totalOnlineCount: 0, todayLiveStarts: 0 }), events: async () => [],
  rankSummary: async ({ roomMonitorId }) => {
    const result = summary(roomMonitorId)
    if (fixture.holdRead) await waitForRelease()
    if (fixture.rankError) throw new Error(fixture.rankError)
    return result
  },
  rankRefresh: async input => {
    fixture.rankRequests.push(input)
    if (fixture.hold) await waitForRelease()
    if (fixture.rankError) throw new Error(fixture.rankError)
    return { roomMonitorId: input.roomMonitorId, summary: summary(input.roomMonitorId),
      successCount: 1, errors: fixture.partial ? ["合成榜单请求失败"] : [] }
  },
  danmakuStatus: async ({ roomMonitorId }) => {
    if (fixture.requestError) throw new Error(fixture.requestError)
    return { liveRoomMonitorId: roomMonitorId, running: fixture.status === "CONNECTED", status: fixture.status,
      ratePerMinute: 5, last5MinutesCount: 25, likeIncrement: 3, watchedCount: 12345 }
  },
  danmakuRecent: async input => {
    fixture.recentRequests.push(input)
    const result = recent(input.roomMonitorId)
    if (fixture.holdRead) await waitForRelease()
    if (fixture.requestError) throw new Error(fixture.requestError)
    return result
  },
  danmakuStart: async input => {
    fixture.starts.push(input)
    if (fixture.hold) await waitForRelease()
    if (fixture.requestError) throw new Error(fixture.requestError)
    fixture.status = "CONNECTED"
    return bridge.bilibiliLive.danmakuStatus(input)
  },
  danmakuStop: async input => {
    fixture.stops.push(input.roomMonitorId)
    if (fixture.hold) await waitForRelease()
    if (fixture.requestError) throw new Error(fixture.requestError)
    fixture.status = "STOPPED"
    return bridge.bilibiliLive.danmakuStatus(input)
  }
}
function Fixture() {
  const [view, setView] = useState<"subject" | "live">("subject")
  return <QueryClientProvider client={client}><div className="desktop-shell theme-light" style={{ display: "block", overflow: "auto", padding: 24 }}>
    <button onClick={() => setView("subject")}>查看工作台</button><button onClick={() => setView("live")}>查看直播间</button>
    {view === "subject" ? <ConnectedBilibiliSubjectWorkspace bridge={bridge} view="用户工作台" creationOpen={false}
      onCloseCreation={() => {}} onOpenWorkbench={() => {}} onBackToList={() => {}} />
      : <ConnectedBilibiliLiveWorkspace bridge={bridge} view="直播间" creationOpen={false} onCloseCreation={() => {}} />}
  </div></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
