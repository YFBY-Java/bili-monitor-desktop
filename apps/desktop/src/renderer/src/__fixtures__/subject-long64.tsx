import type { BilibiliFollowerMonitorV2, BilibiliSubject, BilibiliSubjectTrendV3, BilibiliSubjectWorkbenchV3, CreateBilibiliSubjectInput, DesktopBridge, UpdateBilibiliSubjectInput } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ConnectedBilibiliSubjectWorkspace } from "../BilibiliSubjectWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const timestamp = "2026-10-05T01:00:00Z"
const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0900"
const userId = "018f0f39-7b5e-4cc1-862d-9a208b3d0901"
const mid = "9223372036854775807"
const subject: BilibiliSubject = {
  id: subjectId, displayName: "Long64工作台", tags: [], monitorStatus: "ACTIVE", createdAt: timestamp, updatedAt: timestamp,
  bilibiliBinding: {
    id: "018f0f39-7b5e-4cc1-862d-9a208b3d0902", subjectId, bilibiliUserMonitorId: userId, mid,
    enabledCapabilities: ["follower"], danmuEnabled: false, createdAt: timestamp, updatedAt: timestamp
  }
}
const user: BilibiliFollowerMonitorV2 = {
  id: userId, mid, nickname: "Long64用户", profileUrl: `https://space.bilibili.com/${mid}`, monitorStatus: "ACTIVE",
  intervalSeconds: 300, currentFollowerCount: mid, followingCount: "-9223372036854775808", recentTrend: [], version: 1
}
const workbench: BilibiliSubjectWorkbenchV3 = {
  subject, bilibiliBinding: subject.bilibiliBinding,
  bilibiliUser: { monitorId: userId, mid, nickname: user.nickname, followerCount: mid,
    avatarUrl: "https://i0.hdslb.com/subject-fixture-avatar.svg",
    followerDelta24h: "-9223372036854775808", monitorStatus: "ACTIVE" },
  summary: { followerCount: mid, followerDelta24h: "-9223372036854775808", onlineCount: "200",
    healthScore: 82, enabledModuleCount: 1, totalModuleCount: 4,
    lastSuccessAt: timestamp, nextCollectAt: "2026-10-05T01:15:00Z" },
  danmu: { enabled: false, status: "disabled", recentMessages: [] }, layout: [], recentEvents: [
    { eventType: "LIVE_COLLECT_OK", title: "直播间采集成功", source: "bilibili-live",
      occurredAt: "2026-10-05T01:09:30Z", level: "success" },
    { eventType: "SUBJECT_CREATED", title: "未来记录", source: "subject",
      occurredAt: "2026-10-05T01:15:00Z", level: "info" }
  ]
}
const trend: BilibiliSubjectTrendV3 = {
  subjectId, metrics: ["follower", "live_online"], range: "24h", bucket: "5m",
  points: [{ bucketAt: timestamp, followerCount: "9223372036854775806", liveOnlineCount: "200" },
    { bucketAt: "2026-10-05T01:01:00Z", followerCount: mid, liveOnlineCount: "100" },
    { bucketAt: "2026-10-05T01:10:00Z", liveOnlineCount: "150" },
    { bucketAt: "2026-10-05T01:20:00Z", followerCount: mid, liveOnlineCount: "200" }]
}
const fixture = {
  workbench,
  calls: [] as string[], legacyCalls: [] as string[], createRequests: [] as CreateBilibiliSubjectInput[],
  subjects: [subject], updateFailures: 0, removeFailures: 0,
  listRequests: [] as Parameters<DesktopBridge["bilibiliSubjects"]["list"]>[0][],
  updateRequests: [] as UpdateBilibiliSubjectInput[],
  removeRequests: [] as Parameters<DesktopBridge["bilibiliSubjects"]["remove"]>[0][],
  workbenchRequests: [] as Parameters<DesktopBridge["bilibiliSubjects"]["workbenchV2"]>[0][],
  trendRequests: [] as Parameters<DesktopBridge["bilibiliSubjects"]["trendsV2"]>[0][]
}
if (new URLSearchParams(location.search).has("long64-heat")) {
  trend.points = trend.points.slice(0, 2).map((point, index) => ({
    ...point, liveOnlineCount: (-9223372036854775808n + BigInt(index)).toString()
  }))
}
declare global { interface Window { subjectLong64Fixture: typeof fixture } }
window.subjectLong64Fixture = fixture
const bridge = createBrowserPreviewBridge()
bridge.bilibiliSubjects.list = async input => {
  fixture.calls.push("subjects.list"); fixture.listRequests.push(input); return [...fixture.subjects]
}
bridge.bilibiliSubjects.workbenchV3 = async input => {
  fixture.calls.push("workbenchV2"); fixture.workbenchRequests.push(input)
  const current = fixture.subjects.find(item => item.id === input.subjectId)
  if (!current) throw new Error("Fixture subject has been deleted")
  return structuredClone({ ...workbench, subject: current })
}
bridge.bilibiliSubjects.trendsV3 = async input => {
  fixture.calls.push("trendsV2"); fixture.trendRequests.push(input)
  if (!fixture.subjects.some(item => item.id === input.subjectId)) throw new Error("Fixture subject has been deleted")
  return trend
}
bridge.bilibiliSubjects.update = async input => {
  fixture.updateRequests.push(input)
  if (fixture.updateFailures > 0) { fixture.updateFailures -= 1; throw new Error("工作台状态保存失败") }
  const index = fixture.subjects.findIndex(item => item.id === input.subjectId)
  const current = fixture.subjects[index]
  if (!current) throw new Error("Fixture subject not found")
  const updated: BilibiliSubject = { ...current }
  if (input.enabled !== undefined) updated.monitorStatus = input.enabled ? "ACTIVE" : "PAUSED"
  fixture.subjects[index] = updated
  return updated
}
bridge.bilibiliSubjects.remove = async input => {
  fixture.removeRequests.push(input)
  if (fixture.removeFailures > 0) { fixture.removeFailures -= 1; throw new Error("删除工作台失败") }
  fixture.subjects = fixture.subjects.filter(item => item.id !== input.subjectId)
  return { deleted: true }
}
bridge.bilibiliSubjects.create = async input => { fixture.createRequests.push(input); return subject }
bridge.bilibiliSubjects.workbench = async () => { fixture.legacyCalls.push("workbench"); throw new Error("Fixture requires the v2 workbench") }
bridge.bilibiliSubjects.trends = async () => { fixture.legacyCalls.push("trends"); throw new Error("Fixture requires the v2 trends") }
bridge.bilibiliFollowersV2.list = async () => {
  fixture.calls.push("followersV2.list"); return { items: [user], total: 1, snapshotAt: timestamp }
}
bridge.bilibiliFollowers.list = async () => { fixture.legacyCalls.push("followers.list"); throw new Error("Fixture requires the v2 followers") }
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
function Fixture() {
  const [view, setView] = useState<"监控对象" | "用户工作台">("用户工作台")
  const [creationOpen, setCreationOpen] = useState(false)
  return <QueryClientProvider client={client}><main className="theme-light" style={{ padding: 24, height: "100vh", overflow: "auto", color: "var(--text)", background: "var(--bg)" }}>
    <button type="button" className="button button-secondary" onClick={() => setCreationOpen(true)}>创建用户工作台</button>
    <button type="button" className="button button-secondary" onClick={() => setView("用户工作台")}>查看用户工作台</button>
    <ConnectedBilibiliSubjectWorkspace bridge={bridge} view={view} creationOpen={creationOpen}
      onCloseCreation={() => setCreationOpen(false)} onOpenWorkbench={() => setView("用户工作台")} onBackToList={() => setView("监控对象")} />
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
