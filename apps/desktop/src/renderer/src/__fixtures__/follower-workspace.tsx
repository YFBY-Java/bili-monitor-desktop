import type { AddBilibiliFollowerMonitorInputV2, BilibiliFollowerCollectResultV2, BilibiliFollowerMonitorListV2, BilibiliFollowerMonitorV2, BilibiliFollowerPointV2, ListBilibiliFollowerMonitorsInput, QueryBilibiliFollowerTrendsInput, RefreshBilibiliFollowerMonitorInput, UpdateBilibiliFollowerMonitorSettingsInput } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { ConnectedBilibiliFollowerWorkspace } from "../BilibiliFollowerWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const timestamp = "2026-09-05T02:00:00.000Z"
let users: BilibiliFollowerMonitorV2[] = Array.from({ length: 5 }, (_, index) => ({
  id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`,
  mid: String(index + 2), nickname: `测试用户${index + 1}`, profileUrl: `https://space.bilibili.com/${index + 2}`,
  currentFollowerCount: "100", followingCount: "12", monitorStatus: "ACTIVE", intervalSeconds: 3600,
  version: 1, lastSuccessAt: timestamp, recentTrend: [
    { capturedAt: timestamp, followerCount: "120", sourceEndpoint: "x/web-interface/card" },
    { capturedAt: "2026-09-05T02:01:00.000Z", followerCount: "110", sourceEndpoint: "x/web-interface/card" },
    { capturedAt: "2026-09-05T02:10:00.000Z", followerCount: "100", sourceEndpoint: "x/web-interface/card" }
  ]
}))
type FixtureCallPhase = "pending" | "fulfilled" | "failed"
type AddPlan = { hold?: boolean; error?: string; removeIds?: string[] }
type ListPlan = { hold?: boolean; error?: string }
const fixtureParameters = new URLSearchParams(window.location.search)
const addWaiters = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
const listWaiters = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
let nextCreatedUserIndex = users.length
const addFlow = {
  enabled: fixtureParameters.get("add-flow") === "1",
  listFailure: "",
  addPlans: [] as AddPlan[],
  listPlans: (fixtureParameters.has("hold-initial-list") ? [{ hold: true }] : []) as ListPlan[],
  addCalls: [] as { input: AddBilibiliFollowerMonitorInputV2; phase: FixtureCallPhase; userId?: string }[],
  listCalls: [] as { snapshotIds: string[]; snapshotIntervals: Record<string, number>; phase: FixtureCallPhase; error?: string }[],
  releaseAdd: (index: number) => {
    const waiter = addWaiters.get(index)
    if (!waiter) throw new Error(`No held add at index ${index}`)
    waiter.resolve()
  },
  rejectAdd: (index: number, message: string) => {
    const waiter = addWaiters.get(index)
    if (!waiter) throw new Error(`No held add at index ${index}`)
    waiter.reject(new Error(message))
  },
  releaseList: (index: number) => {
    const waiter = listWaiters.get(index)
    if (!waiter) throw new Error(`No held list at index ${index}`)
    waiter.resolve()
  },
  rejectList: (index: number, message: string) => {
    const waiter = listWaiters.get(index)
    if (!waiter) throw new Error(`No held list at index ${index}`)
    waiter.reject(new Error(message))
  }
}
type SettingsPlan = { hold?: boolean; error?: string; intervalSeconds?: number }
const settingsWaiters = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
const intervalFlow = {
  enabled: fixtureParameters.get("interval-flow") === "1",
  settingsPlans: [] as SettingsPlan[],
  settingsCalls: [] as { input: UpdateBilibiliFollowerMonitorSettingsInput; phase: FixtureCallPhase; resultInterval?: number }[],
  releaseSettings: (index: number) => {
    const waiter = settingsWaiters.get(index)
    if (!waiter) throw new Error(`No held settings at index ${index}`)
    waiter.resolve()
  },
  rejectSettings: (index: number, message: string) => {
    const waiter = settingsWaiters.get(index)
    if (!waiter) throw new Error(`No held settings at index ${index}`)
    waiter.reject(new Error(message))
  }
}
type RefreshPlan = { hold?: boolean; error?: string; followerCount?: string }
const refreshWaiters = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
const refreshFlow = {
  enabled: fixtureParameters.get("refresh-flow") === "1",
  refreshPlans: [] as RefreshPlan[],
  refreshCalls: [] as { input: RefreshBilibiliFollowerMonitorInput; phase: FixtureCallPhase }[],
  releaseRefresh: (index: number) => {
    const waiter = refreshWaiters.get(index)
    if (!waiter) throw new Error(`No held refresh at index ${index}`)
    waiter.resolve()
  },
  rejectRefresh: (index: number, message: string) => {
    const waiter = refreshWaiters.get(index)
    if (!waiter) throw new Error(`No held refresh at index ${index}`)
    waiter.reject(new Error(message))
  }
}
const fixture = {
  addFlow,
  intervalFlow,
  refreshFlow,
  actionError: "", readError: "", calls: [] as string[],
  legacyCalls: [] as string[], addRequests: [] as AddBilibiliFollowerMonitorInputV2[],
  holdRefresh: false,
  releaseRefresh: () => {},
  holdListAfterRefresh: false,
  holdList: false,
  listWaiting: false,
  releaseList: () => {},
  holdTrends: false,
  trendError: "",
  trendRequests: [] as QueryBilibiliFollowerTrendsInput[],
  trendStartedAt: [] as number[],
  trendFinishedAt: [] as number[],
  trendReleases: [] as (() => void)[],
  activeTrends: 0,
  maxActiveTrends: 0,
  history: {} as Record<string, BilibiliFollowerPointV2[]>,
  patchUser: (index: number, patch: Partial<BilibiliFollowerMonitorV2>) => {
    users = users.map((user, position) => position === index ? { ...user, ...patch } : user)
  },
  listRequests: [] as ListBilibiliFollowerMonitorsInput[],
  expandList: () => {
    const first = users[0]!
    users = Array.from({ length: 505 }, (_, index) => ({ ...first,
      id: `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`,
      mid: String(index + 2), nickname: `测试用户${index + 1}`, profileUrl: `https://space.bilibili.com/${index + 2}` }))
  },
  updateFirst: (count: string, interval = 3600) => { users = users.map((user, index) => index === 0
    ? { ...user, currentFollowerCount: count, intervalSeconds: interval, version: user.version + 1 } : user) }
}
declare global { interface Window { followerFixture: typeof fixture } }
window.followerFixture = fixture
const bridge = createBrowserPreviewBridge()
function action(name: string): void {
  fixture.calls.push(name)
  if (fixture.actionError) throw new Error(fixture.actionError)
}
function requireUser(id: string): BilibiliFollowerMonitorV2 {
  const user = users.find((user) => user.id === id)
  if (!user) throw new Error("监控用户不存在")
  return user
}
async function controlledList(input: ListBilibiliFollowerMonitorsInput): Promise<BilibiliFollowerMonitorListV2> {
  const plan = addFlow.listPlans.shift() ?? {}
  // Capture before awaiting: a real pending read cannot gain a later commit retroactively.
  const snapshot = structuredClone(users)
  const index = addFlow.listCalls.length
  const record: (typeof addFlow.listCalls)[number] = {
    snapshotIds: snapshot.map(user => user.id), snapshotIntervals: Object.fromEntries(snapshot.map(user => [user.id, user.intervalSeconds])), phase: "pending"
  }
  addFlow.listCalls.push(record)
  const error = plan.error || addFlow.listFailure || fixture.readError
  try {
    if (plan.hold) await new Promise<void>((resolve, reject) => { listWaiters.set(index, { resolve, reject }) })
    if (error) throw new Error(error)
    record.phase = "fulfilled"
    return { items: input.limit ? snapshot.slice(0, input.limit) : snapshot, total: snapshot.length, snapshotAt: timestamp }
  } catch (failure) {
    record.phase = "failed"
    record.error = failure instanceof Error ? failure.message : String(failure)
    throw failure
  } finally { listWaiters.delete(index) }
}
async function controlledAdd(input: AddBilibiliFollowerMonitorInputV2): Promise<BilibiliFollowerMonitorV2> {
  const plan = addFlow.addPlans.shift() ?? {}
  const index = addFlow.addCalls.length
  const record: (typeof addFlow.addCalls)[number] = { input, phase: "pending" }
  addFlow.addCalls.push(record)
  try {
    if (plan.hold) await new Promise<void>((resolve, reject) => { addWaiters.set(index, { resolve, reject }) })
    if (plan.error) throw new Error(plan.error)
    const existing = users.find(user => user.mid === input.mid)
    const result: BilibiliFollowerMonitorV2 = existing
      ? { ...existing, intervalSeconds: input.intervalSeconds ?? 3600, version: existing.version + 1 }
      : { ...users[0]!, id: `018f0f39-7b5e-7cc1-962d-${String(nextCreatedUserIndex++).padStart(12, "0")}`,
          mid: input.mid, nickname: `新增用户${input.mid}`, profileUrl: `https://space.bilibili.com/${input.mid}`,
          intervalSeconds: input.intervalSeconds ?? 3600, version: 1 }
    users = users.filter(user => !plan.removeIds?.includes(user.id))
    users = existing ? users.map(user => user.id === existing.id ? result : user) : [...users, result]
    record.userId = result.id
    record.phase = "fulfilled"
    return result
  } catch (failure) {
    record.phase = "failed"
    throw failure
  } finally { addWaiters.delete(index) }
}
async function controlledSettings(input: UpdateBilibiliFollowerMonitorSettingsInput): Promise<BilibiliFollowerMonitorV2> {
  const plan = intervalFlow.settingsPlans.shift() ?? {}
  const index = intervalFlow.settingsCalls.length
  const record: (typeof intervalFlow.settingsCalls)[number] = { input: structuredClone(input), phase: "pending" }
  intervalFlow.settingsCalls.push(record)
  try {
    if (plan.hold) await new Promise<void>((resolve, reject) => { settingsWaiters.set(index, { resolve, reject }) })
    if (plan.error) throw new Error(plan.error)
    const current = requireUser(input.userId)
    const result = { ...current, intervalSeconds: plan.intervalSeconds ?? input.intervalSeconds, version: current.version + 1 }
    users = users.map(user => user.id === input.userId ? result : user)
    record.resultInterval = result.intervalSeconds
    record.phase = "fulfilled"
    return result
  } catch (failure) {
    record.phase = "failed"
    throw failure
  } finally { settingsWaiters.delete(index) }
}
async function controlledRefresh(input: RefreshBilibiliFollowerMonitorInput): Promise<BilibiliFollowerCollectResultV2> {
  const plan = refreshFlow.refreshPlans.shift() ?? {}
  const index = refreshFlow.refreshCalls.length
  const record: (typeof refreshFlow.refreshCalls)[number] = { input: structuredClone(input), phase: "pending" }
  refreshFlow.refreshCalls.push(record)
  try {
    if (plan.hold) await new Promise<void>((resolve, reject) => { refreshWaiters.set(index, { resolve, reject }) })
    if (plan.error) throw new Error(plan.error)
    const current = requireUser(input.userId)
    const followerCount = plan.followerCount ?? "101"
    users = users.map(user => user.id === input.userId ? { ...user, currentFollowerCount: followerCount, version: user.version + 1 } : user)
    record.phase = "fulfilled"
    return { userId: input.userId, mid: current.mid, success: true, followerCount, capturedAt: timestamp,
      sourceEndpoint: "x/web-interface/card", message: "ok" }
  } catch (failure) {
    record.phase = "failed"
    throw failure
  } finally { refreshWaiters.delete(index) }
}
bridge.bilibiliFollowers.list = async () => { fixture.legacyCalls.push("list"); throw new Error("Fixture requires the precision-safe v2 bridge") }
bridge.bilibiliFollowers.add = async () => { fixture.legacyCalls.push("add"); throw new Error("Fixture requires the precision-safe v2 bridge") }
bridge.bilibiliFollowers.trends = async () => { fixture.legacyCalls.push("trends"); throw new Error("Fixture requires the precision-safe v2 bridge") }
bridge.bilibiliFollowersV2 = {
  list: async (input = {}) => {
    fixture.calls.push("list")
    fixture.listRequests.push(input)
    if (addFlow.enabled || intervalFlow.enabled || refreshFlow.enabled) return controlledList(input)
    if (fixture.readError) throw new Error(fixture.readError)
    if (fixture.holdList) {
      fixture.listWaiting = true
      await new Promise<void>(resolve => { fixture.releaseList = () => { fixture.holdList = false; resolve() } })
      fixture.listWaiting = false
    }
    return { items: input.limit ? users.slice(0, input.limit) : users, total: users.length, snapshotAt: timestamp }
  },
  add: async (input) => { fixture.addRequests.push(input); action("add"); return addFlow.enabled ? controlledAdd(input) : users[0]! },
  updateStatus: async ({ userId, enabled }) => {
    action("status")
    users = users.map((user) => user.id === userId ? { ...user, monitorStatus: enabled ? "ACTIVE" : "PAUSED" } : user)
    return requireUser(userId)
  },
  updateSettings: async (input) => {
    action("settings")
    if (intervalFlow.enabled) return controlledSettings(input)
    const { userId, intervalSeconds } = input
    users = users.map((user) => user.id === userId ? { ...user, intervalSeconds } : user)
    return requireUser(userId)
  },
  refresh: async (input) => {
    action("refresh")
    if (refreshFlow.enabled) return controlledRefresh(input)
    const { userId } = input
    if (fixture.holdRefresh) await new Promise<void>(resolve => { fixture.releaseRefresh = resolve })
    if (fixture.holdListAfterRefresh) fixture.holdList = true
    return { userId, mid: requireUser(userId).mid, success: true, followerCount: "100", capturedAt: timestamp, message: "ok" }
  },
  remove: async ({ userId }) => { action("delete"); users = users.filter((user) => user.id !== userId); return { deleted: true } },
  trend: async ({ userId }) => { const user = requireUser(userId); return { user, points: user.recentTrend } },
  trends: async (input) => {
    fixture.calls.push("trends")
    fixture.trendRequests.push(input)
    fixture.trendStartedAt.push(performance.now())
    fixture.activeTrends++
    fixture.maxActiveTrends = Math.max(fixture.maxActiveTrends, fixture.activeTrends)
    const failure = fixture.trendError || (addFlow.enabled || intervalFlow.enabled || refreshFlow.enabled ? "" : fixture.readError)
    try {
      const result = (input.userIds ?? []).map(id => { const user = requireUser(id); return { user, points: fixture.history[user.mid] ?? user.recentTrend } })
      if (fixture.holdTrends) await new Promise<void>(resolve => { fixture.trendReleases.push(resolve) })
      if (failure) throw new Error(failure)
      return result
    } finally { fixture.activeTrends--; fixture.trendFinishedAt.push(performance.now()) }
  }
}
// Opt-in add/settings tests reproduce the production default; the follower Query must
// override retry itself to preserve the original single-read business flow.
const client = new QueryClient({ defaultOptions: { queries: { retry: addFlow.enabled || intervalFlow.enabled || refreshFlow.enabled ? 1 : false, staleTime: 0 } } })
function Fixture() {
  const [view, setView] = useState<"监控用户" | "趋势对比">("监控用户")
  const [creationOpen, setCreationOpen] = useState(false)
  const [mounted, setMounted] = useState(true)
  return <QueryClientProvider client={client}><main className="theme-light" style={{ padding: 24, height: "100vh", overflow: "auto", color: "var(--text)", background: "var(--bg)" }}>
    <button className="button button-secondary" onClick={() => setView("监控用户")}>查看用户列表</button>
    <button className="button button-secondary" onClick={() => setView("趋势对比")}>查看趋势</button>
    <button className="button button-secondary" onClick={() => setCreationOpen(true)}>添加用户</button>
    <button className="button button-secondary" onClick={() => setMounted(value => !value)}>挂载或卸载粉丝页</button>
    {mounted && <ConnectedBilibiliFollowerWorkspace bridge={bridge} view={view} creationOpen={creationOpen} onCloseCreation={() => setCreationOpen(false)} />}
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
