import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { expect, it } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"

it("exposes precise v2 follower and Subject workflows without crossing a legacy-number boundary", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-core-follower-long64-"))
  const state = { count: "9223372036854775807", fetchedAt: "2026-10-05T12:00:00.000Z" }
  const core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "long64-fixture",
    schedulerEnabled: false, now: () => new Date("2026-10-05T12:00:01.000Z"),
    followerSource: { fetchCard: async ({ mid }) => ({ mid, nickname: "合成本地长整数用户",
      profileUrl: `https://space.bilibili.com/${mid}`, followerCount: state.count,
      fetchedAt: state.fetchedAt, sourceEndpoint: "x/web-interface/card", durationMs: 1, statusCode: 200,
      evidenceObject: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64),
        relativePath: "cas/synthetic-core-long64.json", mediaType: "application/json", sizeBytes: 2 } }),
    fetchRelationStat: async () => { throw new Error("unexpected relation request") } },
    liveSource: { fetchRoomInfo: async () => { throw new Error("unexpected room info") },
      fetchRoomInit: async () => { throw new Error("unexpected room init") },
      fetchRoomInfoOld: async () => ({ fetchedAt: state.fetchedAt, sourceEndpoint: "room/v1/Room/getRoomInfoOld",
        durationMs: 1, statusCode: 200, evidenceObject: { objectId: `sha256:${"c".repeat(64)}`, sha256: "c".repeat(64),
          relativePath: "cas/synthetic-core-empty-room.json", mediaType: "application/json", sizeBytes: 2 } }),
      fetchStatusByUids: async () => ({ snapshots: [], fetchedAt: state.fetchedAt,
        sourceEndpoint: "room/v1/Room/get_status_info_by_uids", durationMs: 1, statusCode: 200,
        evidenceObject: { objectId: `sha256:${"c".repeat(64)}`, sha256: "c".repeat(64),
          relativePath: "cas/synthetic-core-empty-room.json", mediaType: "application/json", sizeBytes: 2 } }) } })
  try {
    const monitor = await core.addBilibiliFollowerMonitorV2({ mid: "9223372036854775807" })
    expect(monitor.currentFollowerCount).toBe(state.count)
    expect(core.listBilibiliFollowerMonitorsV2().items[0]?.mid).toBe("9223372036854775807")
    expect(core.updateBilibiliFollowerMonitorStatusV2(monitor.id, false).monitorStatus).toBe("PAUSED")
    expect(core.updateBilibiliFollowerMonitorSettingsV2(monitor.id, 60).intervalSeconds).toBe(60)
    state.count = "-9223372036854775808"
    state.fetchedAt = "2026-10-05T12:00:01.000Z"
    expect(await core.refreshBilibiliFollowerMonitorV2(monitor.id)).toMatchObject({ success: true, followerCount: state.count })
    const trend = core.queryBilibiliFollowerTrendV2(monitor.id)
    expect(trend.points.map(point => point.followerCount)).toEqual(["9223372036854775807", state.count])
    expect(trend.user.deltaSincePrevious).toBe("1")
    expect(core.queryBilibiliFollowerTrendsV2({ userIds: [monitor.id] })).toEqual([trend])
    let legacyError: unknown
    try { core.listBilibiliFollowerMonitors() } catch (error) { legacyError = error }
    expect(legacyError).toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false })
    const subject = await core.createBilibiliSubject({ displayName: "精确用户工作台" })
    await core.bindBilibiliSubject({ subjectId: subject.id, bilibiliUserMonitorId: monitor.id, danmuEnabled: false })
    expect(core.getBilibiliSubjectWorkbenchV2(subject.id).summary.followerCount).toBe(state.count)
    expect(core.queryBilibiliSubjectTrendsV2({ subjectId: subject.id }).points.at(-1)?.followerCount).toBe(state.count)
  } finally { await core.stop(); await rm(directory, { recursive: true, force: true }) }
})
