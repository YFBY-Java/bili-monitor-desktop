import type { BilibiliFollowerMonitor, ListBilibiliFollowerMonitorsInput } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { ConnectedBilibiliFollowerWorkspace } from "../BilibiliFollowerWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const timestamp = "2026-09-05T02:00:00.000Z"
let users: BilibiliFollowerMonitor[] = Array.from({ length: 5 }, (_, index) => ({
  id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`,
  mid: String(index + 2), nickname: `测试用户${index + 1}`, profileUrl: `https://space.bilibili.com/${index + 2}`,
  currentFollowerCount: 100, followingCount: 12, monitorStatus: "ACTIVE", intervalSeconds: 3600,
  version: 1, lastSuccessAt: timestamp, recentTrend: [
    { capturedAt: timestamp, followerCount: 120, sourceEndpoint: "x/web-interface/card" },
    { capturedAt: "2026-09-05T02:01:00.000Z", followerCount: 110, sourceEndpoint: "x/web-interface/card" },
    { capturedAt: "2026-09-05T02:10:00.000Z", followerCount: 100, sourceEndpoint: "x/web-interface/card" }
  ]
}))
const fixture = {
  actionError: "", readError: "", calls: [] as string[],
  listRequests: [] as ListBilibiliFollowerMonitorsInput[],
  expandList: () => {
    const first = users[0]!
    users = Array.from({ length: 505 }, (_, index) => ({ ...first,
      id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`,
      mid: String(index + 2), nickname: `测试用户${index + 1}`, profileUrl: `https://space.bilibili.com/${index + 2}` }))
  },
  updateFirst: (count: number, interval = 3600) => { users = users.map((user, index) => index === 0
    ? { ...user, currentFollowerCount: count, intervalSeconds: interval, version: user.version + 1 } : user) }
}
declare global { interface Window { followerFixture: typeof fixture } }
window.followerFixture = fixture
const bridge = createBrowserPreviewBridge()
function action(name: string): void {
  fixture.calls.push(name)
  if (fixture.actionError) throw new Error(fixture.actionError)
}
function requireUser(id: string): BilibiliFollowerMonitor {
  const user = users.find((user) => user.id === id)
  if (!user) throw new Error("监控用户不存在")
  return user
}
bridge.bilibiliFollowers = {
  list: async (input = {}) => {
    fixture.calls.push("list")
    fixture.listRequests.push(input)
    if (fixture.readError) throw new Error(fixture.readError)
    return { items: input.limit ? users.slice(0, input.limit) : users, total: users.length, snapshotAt: timestamp }
  },
  add: async () => { action("add"); return users[0]! },
  updateStatus: async ({ userId, enabled }) => {
    action("status")
    users = users.map((user) => user.id === userId ? { ...user, monitorStatus: enabled ? "ACTIVE" : "PAUSED" } : user)
    return requireUser(userId)
  },
  updateSettings: async ({ userId, intervalSeconds }) => {
    action("settings")
    users = users.map((user) => user.id === userId ? { ...user, intervalSeconds } : user)
    return requireUser(userId)
  },
  refresh: async ({ userId }) => {
    action("refresh")
    return { userId, mid: requireUser(userId).mid, success: true, followerCount: 100, capturedAt: timestamp, message: "ok" }
  },
  remove: async ({ userId }) => { action("delete"); users = users.filter((user) => user.id !== userId); return { deleted: true } },
  trend: async ({ userId }) => { const user = requireUser(userId); return { user, points: user.recentTrend } },
  trends: async ({ userIds = [] }) => {
    fixture.calls.push("trends")
    if (fixture.readError) throw new Error(fixture.readError)
    return userIds.map((id) => { const user = requireUser(id); return { user, points: user.recentTrend } })
  }
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
function Fixture() {
  const [view, setView] = useState<"监控用户" | "趋势对比">("监控用户")
  const [creationOpen, setCreationOpen] = useState(false)
  return <QueryClientProvider client={client}><main className="theme-light" style={{ padding: 24 }}>
    <button onClick={() => setView("监控用户")}>查看用户列表</button>
    <button onClick={() => setView("趋势对比")}>查看趋势</button>
    <button onClick={() => setCreationOpen(true)}>添加用户</button>
    <ConnectedBilibiliFollowerWorkspace bridge={bridge} view={view} creationOpen={creationOpen} onCloseCreation={() => setCreationOpen(false)} />
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
