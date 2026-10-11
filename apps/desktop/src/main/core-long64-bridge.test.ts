import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { createRuntimeEnvelope, type RuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createDesktopBridge } from "../preload/bridge"
import { LocalCoreController } from "./core-client"
import { dispatchBusinessRequest } from "./core-request-router"

const shell = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: shell.fork } }))

const maximum = "9223372036854775807"
const minimum = "-9223372036854775808"
const timestamp = "2026-10-05T04:00:00.000Z"
const userId = "018f0f39-7b5e-4cc1-862d-9a208b3d0500"

describe("Long64 Main/Core/Preload boundary", () => {
  let runtime: LocalCoreRuntime | undefined
  let controller: LocalCoreController | undefined
  let directory: string | undefined
  afterEach(async () => {
    vi.unstubAllEnvs()
    await controller?.stop()
    await runtime?.stop()
    controller = undefined
    runtime = undefined
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = undefined
  })

  async function startCarrier(dispatch: (request: RuntimeEnvelope) => Promise<{ responseType: string; payload: unknown }>) {
    const requests: RuntimeEnvelope[] = []
    const errors: { code: unknown; retryable: boolean }[] = []
    const child = Object.assign(new EventEmitter(), {
      pid: 123 as number | undefined, stderr: new EventEmitter(),
      kill: vi.fn(() => { child.pid = undefined; child.emit("exit", 0) }),
      postMessage: (request: RuntimeEnvelope) => {
        requests.push(structuredClone(request))
        void (async () => {
          try {
            const result = request.type === "core.bootstrap"
              ? { responseType: "core.bootstrap.result", payload: runtime?.bootstrap() ?? {
                coreStatus: { state: "ready", version: "fixture", dataDirectory: "D:/fixture", databaseReady: true,
                  schemaVersion: 14, startedAt: timestamp }, workers: [], sequence: 0 } }
              : request.type === "core.shutdown"
                ? { responseType: "core.shutdown.result", payload: { accepted: true } }
                : await dispatch(request)
            child.emit("message", structuredClone(createRuntimeEnvelope({ ...request,
              type: result.responseType, payload: result.payload })))
          } catch (error) {
            errors.push({ code: typeof error === "object" && error !== null && "code" in error ? error.code : "CORE_REQUEST_FAILED", retryable: false })
            child.emit("message", createRuntimeEnvelope({ ...request, type: "core.error", payload: {
              code: typeof error === "object" && error !== null && "code" in error ? error.code : "CORE_REQUEST_FAILED",
              message: error instanceof Error ? error.message : String(error), retryable: false } }))
          }
          if (request.type === "core.shutdown") child.kill()
        })()
      }
    })
    shell.fork.mockReturnValue(child)
    controller = new LocalCoreController({ entryPath: "D:/fixture/core.js", dataDirectory: directory ?? "D:/fixture",
      douyinOAuth: { mode: "disabled" }, requestTimeoutMs: 1_000 })
    await controller.start()
    return { requests, errors, child, controller }
  }

  it("carries all v2 routes through the real router and SQLite without converting count strings", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-long64-desktop-"))
    let sequence = 0
    let count = maximum
    const evidence = { objectId: `sha256:${"a".repeat(64)}`, relativePath: "cas/fixture.json",
      sha256: "a".repeat(64), sizeBytes: 100, mediaType: "application/json" }
    const fetchCard = vi.fn(async (request: { mid: string }) => ({ mid: request.mid, nickname: "精确桥测试",
      profileUrl: `https://space.bilibili.com/${request.mid}`, followerCount: count, followingCount: minimum,
      fetchedAt: timestamp, sourceEndpoint: "x/web-interface/card" as const, evidenceObject: evidence,
      statusCode: 200, durationMs: 1 }))
    // Exercise the real startup binding, not production throttling for synthetic responses.
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_REQUESTMININTERVALMS", "0")
    const liveMetadata = { fetchedAt: timestamp, statusCode: 200, durationMs: 1, evidenceObject: evidence }
    const fetchLiveStatus = vi.fn(async () => ({ ...liveMetadata, snapshots: [],
      sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const }))
    const fetchLiveOldRoom = vi.fn(async () => ({ ...liveMetadata,
      sourceEndpoint: "room/v1/Room/getRoomInfoOld" as const }))
    const unexpectedLiveDetails = vi.fn(async () => { throw new Error("Unexpected synthetic live room details") })
    runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture", schedulerEnabled: false,
      credentialKey: randomBytes(32), now: () => new Date(timestamp),
      idFactory: () => `018f0f39-ab5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
      followerSource: { fetchCard, fetchRelationStat: async () => { throw new Error("unexpected fallback") } },
      // Subject creation probes its user's live room: a synthetic no-room response
      // keeps this bridge test off the default platform Worker/HTTP boundary.
      liveSource: {
        fetchStatusByUids: fetchLiveStatus, fetchRoomInfoOld: fetchLiveOldRoom,
        fetchRoomInfo: unexpectedLiveDetails, fetchRoomInit: unexpectedLiveDetails
      } })
    const localRuntime = runtime
    const carrier = await startCarrier(async request => await dispatchBusinessRequest(localRuntime, request))
    const host = carrier.controller
    const bridge = createDesktopBridge(async (channel, input) => {
      const methods: Record<string, (input: unknown) => Promise<unknown>> = {
        "bilibili-followers:list.v2": value => host.listBilibiliFollowerMonitorsV2(value),
        "bilibili-followers:add.v2": value => host.addBilibiliFollowerMonitorV2(value),
        "bilibili-followers:update-status.v2": value => host.updateBilibiliFollowerMonitorStatusV2(value),
        "bilibili-followers:update-settings.v2": value => host.updateBilibiliFollowerMonitorSettingsV2(value),
        "bilibili-followers:refresh.v2": value => host.refreshBilibiliFollowerMonitorV2(value),
        "bilibili-followers:delete.v2": value => host.deleteBilibiliFollowerMonitorV2(value),
        "bilibili-followers:trend.v2": value => host.queryBilibiliFollowerTrendV2(value),
        "bilibili-followers:trends.v2": value => host.queryBilibiliFollowerTrendsV2(value),
        "bilibili-subjects:workbench.v2": value => host.getBilibiliSubjectWorkbenchV2(value),
        "bilibili-subjects:trends.v2": value => host.queryBilibiliSubjectTrendsV2(value)
      }
      return methods[channel]!(input)
    })
    const added = await bridge.bilibiliFollowersV2.add({ mid: maximum })
    expect(added).toMatchObject({ mid: maximum, currentFollowerCount: maximum, followingCount: minimum })
    expect((await bridge.bilibiliFollowersV2.list()).items[0]?.currentFollowerCount).toBe(maximum)
    expect((await bridge.bilibiliFollowersV2.updateStatus({ userId: added.id, enabled: false })).currentFollowerCount).toBe(maximum)
    expect((await bridge.bilibiliFollowersV2.updateSettings({ userId: added.id, intervalSeconds: 120 })).followingCount).toBe(minimum)
    count = minimum
    expect((await bridge.bilibiliFollowersV2.refresh({ userId: added.id })).followerCount).toBe(minimum)
    const inspection = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try {
      const stored = inspection.prepare(`SELECT mid, current_follower_count, following_count,
        typeof(current_follower_count) AS storage_type FROM bilibili_follower_monitor`)
      stored.setReadBigInts(true)
      expect(stored.get()).toEqual({ mid: maximum, current_follower_count: BigInt(minimum),
        following_count: BigInt(minimum), storage_type: "integer" })
    } finally { inspection.close() }
    expect((await bridge.bilibiliFollowersV2.trend({ userId: added.id })).points[0]?.followerCount).toBe(minimum)
    expect((await bridge.bilibiliFollowersV2.trends({ userIds: [added.id] }))[0]?.user.currentFollowerCount).toBe(minimum)
    const subject = await host.createBilibiliSubject({ displayName: "精确工作台", bilibiliUserMonitorId: added.id,
      danmuEnabled: false })
    expect(subject.bilibiliBinding?.bilibiliUserMonitorId).toBe(added.id)
    expect(subject.bilibiliBinding?.bilibiliLiveRoomMonitorId).toBeUndefined()
    expect(fetchLiveStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uids: [maximum] }))
    expect(fetchLiveOldRoom).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uid: maximum }))
    expect(unexpectedLiveDetails).not.toHaveBeenCalled()
    expect((await bridge.bilibiliSubjects.workbenchV2({ subjectId: subject.id })).summary.followerCount).toBe(minimum)
    expect((await bridge.bilibiliSubjects.trendsV2({ subjectId: subject.id })).points.at(-1)?.followerCount).toBe(minimum)
    await expect(host.listBilibiliFollowerMonitors({})).rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED" })
    expect(await bridge.bilibiliFollowersV2.remove({ userId: added.id })).toEqual({ deleted: true })
    expect((await bridge.bilibiliFollowersV2.list()).total).toBe(0)
    expect(fetchCard).toHaveBeenCalledTimes(2)
    expect(carrier.child.kill).not.toHaveBeenCalled()
    for (const type of ["bilibili-followers.add.v2", "bilibili-followers.refresh.v2"]) {
      expect(carrier.requests.find(request => request.type === type)).toMatchObject({ version: 1, keepAlive: true })
    }
  })

  it("carries Live v2 and Subject v3 through Preload, Main, router and SQLite with safe legacy exports", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-long64-bridge-"))
    let count = "7"
    let sequence = 0
    const evidence = { objectId: `sha256:${"a".repeat(64)}`, relativePath: "cas/fixture.json",
      sha256: "a".repeat(64), sizeBytes: 2, mediaType: "application/json" }
    const metadata = { fetchedAt: timestamp, evidenceObject: evidence, statusCode: 200, durationMs: 1 }
    const snapshot = () => ({ uid: "22", roomId: "122", uname: "精确直播桥", liveStatus: 1 as const,
      onlineCount: count, attentionCount: "-2" })
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_REQUEST_MIN_INTERVAL_MS", "0")
    runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture", schedulerEnabled: false,
      credentialKey: randomBytes(32), now: () => new Date(timestamp),
      idFactory: () => `018f0f39-ab5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
      liveSource: {
        stop: async () => undefined,
        fetchStatusByUidsV2: async () => ({ ...metadata, snapshots: [snapshot()], sourceEndpoint: "room/v1/Room/get_status_info_by_uids" }),
        fetchRoomInfoV2: async () => ({ ...metadata, ...snapshot(), sourceEndpoint: "room/v1/Room/get_info" }),
        fetchRoomInitV2: async () => ({ ...metadata, ...snapshot(), sourceEndpoint: "room/v1/Room/room_init" }),
        fetchRoomInfoOldV2: async () => ({ ...metadata, snapshot: snapshot(), sourceEndpoint: "room/v1/Room/getRoomInfoOld" })
      },
      liveRankSource: { fetch: async () => ({ rankFamily: "GUARD", rankType: "guard_weekly", periodScope: "CURRENT",
        pageNo: 1, pageSize: 30, totalCount: maximum, countText: maximum,
        sourceEndpoint: "xlive/app-room/v2/guardTab/topListNew", signedRequired: false, capturedAt: timestamp,
        entries: [{ userUid: "0", rankNo: -2147483648, entryKind: "LIST", score: maximum,
          guardLevel: 2, medalLevel: -1, accompanyDays: -2 }], evidenceObject: evidence, statusCode: 200, durationMs: 1 }) },
      followerSource: { fetchCard: async ({ mid }) => ({ mid, nickname: "用户", profileUrl: `https://space.bilibili.com/${mid}`,
        followerCount: "1", fetchedAt: timestamp, sourceEndpoint: "x/web-interface/card", evidenceObject: evidence,
        statusCode: 200, durationMs: 1 }), fetchRelationStat: async () => { throw new Error("unexpected relation") } } })
    const localRuntime = runtime
    const carrier = await startCarrier(async request => await dispatchBusinessRequest(localRuntime, request))
    const host = carrier.controller
    const responses: unknown[] = []
    const bridge = createDesktopBridge(async (channel, input) => {
      const methods: Record<string, (value: unknown) => Promise<unknown>> = {
        "bilibili-live:rooms-add.v2": value => host.addBilibiliLiveRoomV2(value),
        "bilibili-live:rooms-list.v2": value => host.listBilibiliLiveRoomsV2(value),
        "bilibili-live:rooms-refresh.v2": value => host.refreshBilibiliLiveRoomV2(value),
        "bilibili-live:rooms-update-status.v2": value => host.updateBilibiliLiveRoomStatusV2(value),
        "bilibili-live:rooms-update-settings.v2": value => host.updateBilibiliLiveRoomSettingsV2(value),
        "bilibili-live:summary.v2": () => host.getBilibiliLiveSummaryV2(),
        "bilibili-live:trend.v2": value => host.queryBilibiliLiveTrendV2(value),
        "bilibili-live:trends.v2": value => host.queryBilibiliLiveTrendsV2(value),
        "bilibili-live:events.v2": value => host.listBilibiliLiveEventsV2(value),
        "bilibili-live:ranks-summary.v2": value => host.getBilibiliLiveRankSummaryV2(value),
        "bilibili-live:ranks-latest.v2": value => host.getLatestBilibiliLiveRankV2(value),
        "bilibili-live:ranks-refresh.v2": value => host.refreshBilibiliLiveRanksV2(value),
        "bilibili-subjects:workbench.v3": value => host.getBilibiliSubjectWorkbenchV3(value),
        "bilibili-subjects:trends.v3": value => host.queryBilibiliSubjectTrendsV3(value),
        "bilibili-live:rooms-list": value => host.listBilibiliLiveRooms(value),
        "bilibili-live:rooms-refresh": value => host.refreshBilibiliLiveRoom(value)
      }
      const result = await methods[channel]!(input)
      responses.push(result)
      return JSON.parse(JSON.stringify(result))
    })
    const room = await bridge.bilibiliLiveV2.add({ uid: "22" })
    expect((await bridge.bilibiliLive.list()).items[0]?.onlineCount).toBe(7)
    expect((await bridge.bilibiliLiveV2.updateStatus({ roomMonitorId: room.id, enabled: true })).onlineCount).toBe("7")
    expect((await bridge.bilibiliLiveV2.updateSettings({ roomMonitorId: room.id, intervalSeconds: 300 })).attentionCount).toBe("-2")
    count = "9007199254740993"
    await expect(bridge.bilibiliLive.refresh({ roomMonitorId: room.id }))
      .rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED" })
    expect((await bridge.bilibiliLiveV2.list()).items[0]?.onlineCount).toBe(count)
    expect((await bridge.bilibiliLiveV2.refresh({ roomMonitorId: room.id })).onlineCount).toBe(count)
    expect((await bridge.bilibiliLiveV2.summary()).totalOnlineCount).toBe(count)
    expect((await bridge.bilibiliLiveV2.trend({ roomMonitorId: room.id })).points.at(-1)?.onlineCount).toBe(count)
    expect((await bridge.bilibiliLiveV2.trends({ roomMonitorIds: [room.id] }))[0]?.room.onlineCount).toBe(count)
    await bridge.bilibiliLiveV2.events({})
    const subject = await host.createBilibiliSubject({ bilibiliLiveRoomMonitorId: room.id, danmuEnabled: false })
    expect((await bridge.bilibiliSubjects.workbenchV3({ subjectId: subject.id })).summary.onlineCount).toBe(count)
    expect((await bridge.bilibiliSubjects.trendsV3({ subjectId: subject.id })).points.at(-1)?.liveOnlineCount).toBe(count)
    await expect(host.getBilibiliSubjectWorkbenchV2({ subjectId: subject.id }))
      .rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED" })
    expect(responses.every(value => JSON.stringify(value) !== undefined)).toBe(true)
    expect(carrier.errors).toEqual([{ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false },
      { code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false }])
    for (const type of ["bilibili-live.rooms.add.v2", "bilibili-live.rooms.refresh.v2"]) {
      expect(carrier.requests.find(request => request.type === type)).toMatchObject({ version: 1, keepAlive: true })
    }
    expect((await host.getBilibiliLiveRankSummary({ roomMonitorId: room.id })).snapshots).toEqual([])
    const rank = await bridge.bilibiliLiveRankV2.refresh({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(rank).toMatchObject({ successCount: 1, errors: [], summary: { guardCount: maximum,
      snapshots: [{ totalCount: maximum, entries: [{ userUid: "0", rankNo: -2147483648, score: maximum,
        guardLevel: 2, medalLevel: -1, accompanyDays: -2 }] }] } })
    expect(await bridge.bilibiliLiveRankV2.summary({ roomMonitorId: room.id })).toEqual(rank.summary)
    expect(await bridge.bilibiliLiveRankV2.latest({ roomMonitorId: room.id, type: "guard_weekly" })).toEqual(rank.summary.snapshots[0])
    await expect(host.getBilibiliLiveRankSummary({ roomMonitorId: room.id }))
      .rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED" })
    expect(carrier.errors.at(-1)).toEqual({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false })
    expect(carrier.requests.find(request => request.type === "bilibili-live.ranks.refresh.v2"))
      .toMatchObject({ version: 1, keepAlive: true })
  })

  it.each(["9223372036854775808", "+2", " 2", "0"])("router rejects invalid v2 MID %j before collection", async mid => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-long64-invalid-mid-"))
    const fetchCard = vi.fn(async () => { throw new Error("invalid MID must not reach collection") })
    runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture", schedulerEnabled: false,
      credentialKey: randomBytes(32), followerSource: { fetchCard, fetchRelationStat: fetchCard } })
    const localRuntime = runtime
    const request = createRuntimeEnvelope({ id: "invalid", type: "bilibili-followers.add.v2", timestamp,
      correlationId: "invalid", traceId: "invalid", payload: { mid } })
    expect(() => dispatchBusinessRequest(localRuntime, request)).toThrow(/Long64/)
    expect(fetchCard).not.toHaveBeenCalled()
  })

  it("rejects a numeric v2 response and keeps a later exact request alive", async () => {
    let count: unknown = Number(maximum)
    const f = await startCarrier(async request => ({ responseType: `${request.type}.result`, payload: {
      userId, mid: maximum, success: true, followerCount: count, capturedAt: timestamp, message: "ok" } }))
    await expect(f.controller.refreshBilibiliFollowerMonitorV2({ userId })).rejects.toThrow()
    count = minimum
    expect((await f.controller.refreshBilibiliFollowerMonitorV2({ userId })).followerCount).toBe(minimum)
    expect(f.child.kill).not.toHaveBeenCalled()
  })
})
