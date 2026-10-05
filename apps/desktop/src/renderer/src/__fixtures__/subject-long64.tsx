import type { BilibiliFollowerMonitorV2, BilibiliSubject, BilibiliSubjectTrendV2, BilibiliSubjectWorkbenchV2, CreateBilibiliSubjectInput } from "@bmd/contracts"
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
const workbench: BilibiliSubjectWorkbenchV2 = {
  subject, bilibiliBinding: subject.bilibiliBinding,
  bilibiliUser: { monitorId: userId, mid, nickname: user.nickname, followerCount: mid,
    followerDelta24h: "-9223372036854775808", monitorStatus: "ACTIVE" },
  summary: { followerCount: mid, followerDelta24h: "-9223372036854775808", onlineCount: 200,
    healthScore: 100, enabledModuleCount: 1, totalModuleCount: 4 },
  danmu: { enabled: false, status: "disabled", recentMessages: [] }, layout: [], recentEvents: []
}
const trend: BilibiliSubjectTrendV2 = {
  subjectId, metrics: ["follower", "live_online"], range: "24h", bucket: "5m",
  points: [{ bucketAt: timestamp, followerCount: "9223372036854775806", liveOnlineCount: 200 },
    { bucketAt: "2026-10-05T01:01:00Z", followerCount: mid, liveOnlineCount: 100 }]
}
const fixture = { calls: [] as string[], legacyCalls: [] as string[], createRequests: [] as CreateBilibiliSubjectInput[] }
declare global { interface Window { subjectLong64Fixture: typeof fixture } }
window.subjectLong64Fixture = fixture
const bridge = createBrowserPreviewBridge()
bridge.bilibiliSubjects.list = async () => { fixture.calls.push("subjects.list"); return [subject] }
bridge.bilibiliSubjects.workbenchV2 = async () => { fixture.calls.push("workbenchV2"); return workbench }
bridge.bilibiliSubjects.trendsV2 = async () => { fixture.calls.push("trendsV2"); return trend }
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
    <ConnectedBilibiliSubjectWorkspace bridge={bridge} view={view} creationOpen={creationOpen}
      onCloseCreation={() => setCreationOpen(false)} onOpenWorkbench={() => setView("用户工作台")} onBackToList={() => setView("监控对象")} />
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
