import { randomBytes } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { BilibiliLiveRankWorkerRequest } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { BilibiliLiveDanmakuService } from "./bilibili-live-danmaku-service"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { liveLifecycleSource } from "./__fixtures__/live-lifecycle"
import { SyntheticAuthSource } from "./__fixtures__/auth-migration"
import { SyntheticRealtimeSource } from "./__fixtures__/login-connections"
import { DouyinBrowserWorkerSource } from "./douyin-browser-worker-source"

const id = "019a0100-0000-7000-8000-000000000001"
const liveOperations: Array<[string, (core: LocalCoreRuntime) => unknown]> = [
  ["add", core => core.addBilibiliLiveRoom({ uid: "9" })],
  ["list", core => core.listBilibiliLiveRooms()],
  ["status", core => core.updateBilibiliLiveRoomStatus(id, true)],
  ["settings", core => core.updateBilibiliLiveRoomSettings(id, 300)],
  ["refresh", core => core.refreshBilibiliLiveRoom(id)],
  ["delete", core => core.deleteBilibiliLiveRoom(id)],
  ["summary", core => core.getBilibiliLiveSummary()],
  ["trend", core => core.queryBilibiliLiveTrend({ roomMonitorId: id })],
  ["trends", core => core.queryBilibiliLiveTrends()],
  ["events", core => core.listBilibiliLiveEvents()],
  ["rank summary", core => core.getBilibiliLiveRankSummary(id)],
  ["rank latest", core => core.getLatestBilibiliLiveRank({ roomMonitorId: id, type: "online" })],
  ["rank refresh", core => core.refreshBilibiliLiveRanks({ roomMonitorId: id, types: ["online"] })],
  ["danmaku start", core => core.startBilibiliLiveDanmaku({ roomMonitorId: id })],
  ["danmaku stop", core => core.stopBilibiliLiveDanmaku(id)],
  ["danmaku status", core => core.getBilibiliLiveDanmakuStatus(id)],
  ["danmaku recent", core => core.getBilibiliLiveDanmakuRecent({ roomMonitorId: id })],
  ["danmaku metrics", core => core.getBilibiliLiveDanmakuMetrics({ roomMonitorId: id })],
  ["sessions", core => core.listBilibiliLiveSessions({ roomMonitorId: id })],
  ["session", core => core.getBilibiliLiveSession(id)],
  ["session users", core => core.listBilibiliLiveSessionUsers({ sessionId: id })],
  ["session events", core => core.queryBilibiliLiveSessionEvents({ sessionId: id })],
  ["session insight", core => core.getBilibiliLiveSessionInsight({ sessionId: id })],
  ["session export", core => core.prepareBilibiliLiveSessionExport({ sessionId: id, category: "all" })]
]
const subjectOperations: Array<[string, (core: LocalCoreRuntime) => unknown]> = [
  ["create", core => core.createBilibiliSubject({ displayName: "Synthetic disabled subject", mid: "9" })],
  ["list", core => core.listBilibiliSubjects()],
  ["get", core => core.getBilibiliSubject(id)],
  ["update", core => core.updateBilibiliSubject({ subjectId: id, displayName: "Changed" })],
  ["delete", core => core.deleteBilibiliSubject(id)],
  ["bind", core => core.bindBilibiliSubject({ subjectId: id, mid: "9" })],
  ["workbench", core => core.getBilibiliSubjectWorkbench(id)],
  ["trends", core => core.queryBilibiliSubjectTrends({ subjectId: id })],
  ["layout", core => core.updateBilibiliSubjectLayout({ subjectId: id, items: [] })]
]

describe("original live storage switch at the real Core composition boundary", () => {
  let directory: string
  let runtime: LocalCoreRuntime | undefined
  afterEach(async () => {
    await runtime?.stop(); runtime = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  async function setup(live: unknown = {}, subject?: unknown) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-storage-"))
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED", undefined)
    vi.stubEnv("APP_SUBJECTMONITOR_ENABLED", undefined)
    await mkdir(resolve(directory, "config"))
    const livePath = resolve(directory, "config", "bilibili-live-collection.json")
    const subjectPath = resolve(directory, "config", "subject-monitor.json")
    await writeFile(livePath, JSON.stringify(live), "utf8")
    if (subject !== undefined) await writeFile(subjectPath, JSON.stringify(subject), "utf8")
    const liveFixture = liveLifecycleSource()
    const realtime = new SyntheticRealtimeSource()
    const auth = new SyntheticAuthSource()
    const options = { dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
      liveSource: liveFixture.source, liveDanmakuSource: realtime, authSource: auth,
      // Every callable platform boundary is explicit, including one reached by a failing gate.
      followerSource: {
        fetchCard: async ({ mid }: { mid: string }) => ({ mid, nickname: "Synthetic storage follower",
          profileUrl: `https://space.bilibili.com/${mid}`, followerCount: 100, followingCount: 2,
          fetchedAt: new Date().toISOString(), sourceEndpoint: "x/web-interface/card" as const,
          evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
            relativePath: "cas/synthetic-storage.json", sizeBytes: 2, mediaType: "application/json" },
          statusCode: 200, durationMs: 1 }),
        fetchRelationStat: async (): Promise<never> => { throw new Error("Synthetic relation response is not configured") }
      },
      liveRankSource: { fetch: async (request: BilibiliLiveRankWorkerRequest) => ({
        rankFamily: request.family, rankType: request.type,
        ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}),
        pageNo: request.page, pageSize: request.pageSize, totalCount: 1,
        sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank" as const,
        signedRequired: true, capturedAt: new Date().toISOString(),
        entries: [{ userUid: "99", rankNo: 1, entryKind: "LIST", displayName: "Synthetic rank", score: 20 }],
        evidenceObject: { objectId: `sha256:${"e".repeat(64)}`, sha256: "e".repeat(64),
          relativePath: "cas/synthetic-storage-rank.json", sizeBytes: 2, mediaType: "application/json" },
        statusCode: 200, durationMs: 1
      }) },
      douyinBrowserSource: new DouyinBrowserWorkerSource({
        request: async (type: string) => {
          if (type === "stopAll") return {}
          if (type !== "health") throw new Error("Synthetic browser only supports health")
          return { status: "UP" }
        },
        stop: async () => {}
      })
    }
    return { livePath, subjectPath, liveFixture, realtime, auth, options,
      start: async (schedulerEnabled = false) => {
        runtime = await LocalCoreRuntime.start({ ...options, schedulerEnabled })
        return runtime
      } }
  }
  it("rejects the original mandatory workbench dependency before opening SQLite", async () => {
    const f = await setup({ storageEnabled: false })
    const error = await f.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID" })
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    expect(f.liveFixture.calls).toEqual([])
  })
  it("does not silently ignore the subject switch while live storage remains enabled", async () => {
    const f = await setup({ enabled: false }, { enabled: false })
    const core = await f.start()
    expect(core.listBilibiliLiveRooms().items).toEqual([])
    for (const [name, call] of subjectOperations) {
      await expect(Promise.resolve().then(() => call(core)), name)
        .rejects.toMatchObject({ code: "SUBJECT_MONITOR_DISABLED" })
    }
    expect(f.liveFixture.calls).toEqual([])
  })
  it.each(["file", "environment"])("disables all live operations through %s without hiding failures as empty data", async mode => {
    const f = await setup({ storageEnabled: mode === "environment" }, { enabled: mode === "environment" })
    if (mode === "environment") {
      vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED", "FALSE")
      vi.stubEnv("APP_SUBJECTMONITOR_ENABLED", "false")
    }
    const before = await readFile(f.livePath, "utf8")
    const core = await f.start()
    for (const [name, call] of liveOperations) {
      await expect(Promise.resolve().then(() => call(core)), name)
        .rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DISABLED", retryable: false })
    }
    expect(f.liveFixture.calls).toEqual([])
    expect(f.realtime.starts).toEqual([])
    expect(await readFile(f.livePath, "utf8")).toBe(before)
    await expect(access(resolve(directory, "exports"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("does not schedule live work or register login upgrades, while followers and authentication still work", async () => {
    const f = await setup({ storageEnabled: false }, { enabled: false })
    vi.useFakeTimers()
    const followerScan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    const danmakuScan = vi.spyOn(BilibiliLiveDanmakuService.prototype, "syncAutoConnections")
    const upgrade = vi.spyOn(BilibiliLiveDanmakuService.prototype, "reconnectAnonymousConnectionsAsync")
    const due = vi.spyOn(ControlDatabase.prototype, "findDueBilibiliLiveRooms")
    const core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(followerScan).toHaveBeenCalledTimes(11) // Original scheduler also scans immediately at startup.
    expect(due).not.toHaveBeenCalled()
    expect(danmakuScan).not.toHaveBeenCalled()
    const qr = await core.startBilibiliQrLogin()
    expect(await core.pollBilibiliQrLogin(qr.loginId)).toMatchObject({ status: "SUCCESS" })
    expect(await core.getBilibiliAuthStatus()).toMatchObject({ loggedIn: true })
    expect(upgrade).not.toHaveBeenCalled()
    expect(core.listBilibiliFollowerMonitors().total).toBe(0)
    expect(await core.getDouyinAuthStatus()).toMatchObject({ enabled: true, workerAvailable: true })
    expect(core.bootstrap().coreStatus.state).toBe("ready")
    await core.stop()
    expect(f.realtime.stopAllCalls).toBe(0)
    expect(f.liveFixture.state.stops).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("preserves persisted rooms, snapshots, orphan connections, ranks, sessions, bindings and export counters across disable/re-enable", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T08:00:00Z"))
    let core = await f.start()
    const subject = await core.createBilibiliSubject({ mid: "9", displayName: "Synthetic retained subject", danmuEnabled: false })
    const roomId = subject.bilibiliBinding!.bilibiliLiveRoomMonitorId!
    core.updateBilibiliLiveRoomSettings(roomId, 450)
    core.updateBilibiliLiveRoomStatus(roomId, false)
    const rank = await core.refreshBilibiliLiveRanks({ roomMonitorId: roomId, types: ["contribution_rank"] })
    expect(rank.successCount).toBe(1)
    const connection = await core.startBilibiliLiveDanmaku({ roomMonitorId: roomId })
    const listener = f.realtime.listeners.get(connection.sessionId!)!
    const timestamp = new Date().toISOString()
    for (const kind of ["LIVE", "DANMAKU", "PREPARING"] as const) {
      listener({ type: "command", receivedAt: timestamp, event: {
        kind, command: kind === "DANMAKU" ? "DANMU_MSG" : kind,
        occurredAt: timestamp, receivedAt: timestamp, actor: { uid: "99", displayName: "Synthetic retained viewer" },
        ...(kind === "DANMAKU" ? { messageText: "Synthetic retained message" } : {}),
        giftDelta: 0, superChatDelta: 0, rawJson: "{}"
      } })
    }
    const session = core.listBilibiliLiveSessions({ roomMonitorId: roomId })[0]!
    expect(session.danmakuCount).toBe(1)
    expect(session.state).toBe("END_PENDING")
    const exported = await core.prepareBilibiliLiveSessionExport({ sessionId: session.id, category: "danmaku" })
    const roomBefore = core.listBilibiliLiveRooms().items[0]!
    await core.stop()
    // Model a previously interrupted socket; disabled startup must not even run orphan recovery.
    const database = await ControlDatabase.open(directory)
    try { database.markBilibiliLiveDanmakuSessionConnected(connection.sessionId!, timestamp) } finally { database.close() }
    const before = storedLiveAndSubjectRows(directory)
    await writeFile(f.livePath, '{"storageEnabled":false}', "utf8")
    await writeFile(f.subjectPath, '{"enabled":false}', "utf8")
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"))
    f.liveFixture.calls.length = 0; f.realtime.starts.length = 0
    const recoverOrphans = vi.spyOn(ControlDatabase.prototype, "markOrphanedBilibiliLiveDanmakuSessions")
    core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(core.listBilibiliFollowerMonitors().total).toBe(1)
    for (const [name, call] of [...liveOperations, ...subjectOperations]) {
      await expect(Promise.resolve().then(() => call(core)), name).rejects.toBeInstanceOf(Error)
    }
    await expect(Promise.resolve().then(() => core.prepareBilibiliLiveSessionExport({ sessionId: session.id, category: "danmaku" })))
      .rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DISABLED" })
    expect(f.liveFixture.calls).toEqual([])
    expect(f.realtime.starts).toEqual([])
    expect(recoverOrphans).not.toHaveBeenCalled()
    await core.stop()
    expect(storedLiveAndSubjectRows(directory)).toEqual(before)

    await writeFile(f.livePath, '{"enabled":false}', "utf8")
    await writeFile(f.subjectPath, '{}', "utf8")
    core = await f.start()
    expect(core.listBilibiliLiveRooms().items[0]).toEqual(roomBefore)
    expect(core.getBilibiliSubject(subject.id).bilibiliBinding).toEqual(subject.bilibiliBinding)
    expect(core.getBilibiliLiveRankSummary(roomId).snapshots).toHaveLength(1)
    expect(core.queryBilibiliLiveSessionEvents({ sessionId: session.id }).items).toHaveLength(1)
    const again = await core.prepareBilibiliLiveSessionExport({ sessionId: session.id, category: "danmaku" })
    expect(again.suggestedFileName).not.toBe(exported.suggestedFileName)
    expect(storedLiveAndSubjectRows(directory).bilibili_live_export_daily_counter).toMatchObject([{ export_count: 2 }])
  })
  it.each([null, { enabled: "false" }, { enabled: null }, { extra: "synthetic-private" }])(
    "rejects invalid subject configuration before database creation: %j", async subject => {
      const f = await setup({}, subject)
      const error = await f.start().then(() => undefined, (caught: unknown) => caught)
      expect(error).toMatchObject({ code: "SUBJECT_MONITOR_CONFIG_INVALID" })
      expect(String(error)).not.toContain("synthetic-private")
      await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    })
})

function storedLiveAndSubjectRows(directory: string): Record<string, unknown[]> {
  const database = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    const result: Record<string, unknown[]> = {}
    for (const { name } of tables) {
      if (typeof name !== "string" || !/^bilibili_(live_\w+|subject_\w+|monitored_subject)$/u.test(name)) continue
      result[name] = database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()
    }
    return result
  } finally { database.close() }
}
