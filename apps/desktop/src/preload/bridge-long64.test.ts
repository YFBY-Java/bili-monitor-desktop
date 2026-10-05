import { describe, expect, it, vi } from "vitest"

import { createDesktopBridge } from "./bridge"

const timestamp = "2026-10-05T04:00:00.000Z"
const userId = "018f0f39-7b5e-4cc1-862d-9a208b3d0500"
const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0501"
const maximum = "9223372036854775807"
const minimum = "-9223372036854775808"
const point = { capturedAt: timestamp, followerCount: maximum, followingCount: minimum,
  sourceEndpoint: "x/web-interface/card" }
const monitor = { id: userId, mid: maximum, nickname: "精确粉丝", profileUrl: `https://space.bilibili.com/${maximum}`,
  currentFollowerCount: maximum, followingCount: minimum, deltaSincePrevious: "-1", monitorStatus: "ACTIVE",
  intervalSeconds: 3600, recentTrend: [point], version: 1 }
const collected = { userId, mid: maximum, success: true, followerCount: minimum,
  capturedAt: timestamp, sourceEndpoint: "x/relation/stat", message: "ok" }
const workbench = {
  subject: { id: subjectId, displayName: "精确工作台", tags: [], monitorStatus: "ACTIVE",
    createdAt: timestamp, updatedAt: timestamp },
  summary: { followerCount: maximum, followerDelta24h: minimum,
    healthScore: 40, enabledModuleCount: 1, totalModuleCount: 4 },
  danmu: { enabled: false, status: "disabled", recentMessages: [] }, layout: [], recentEvents: []
}
const subjectTrend = { subjectId, metrics: ["follower", "live_online"], range: "24h", bucket: "5m",
  points: [{ bucketAt: timestamp, followerCount: minimum }] }

describe("exact Long64 Preload bridge", () => {
  it("exposes all v2 follower methods with canonical strings and distinct IPC channels", async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "bilibili-followers:list.v2") return { items: [monitor], total: 1, snapshotAt: timestamp }
      if (channel === "bilibili-followers:refresh.v2") return collected
      if (channel === "bilibili-followers:trend.v2") return { user: monitor, points: [point] }
      if (channel === "bilibili-followers:trends.v2") return [{ user: monitor, points: [point] }]
      if (channel === "bilibili-followers:delete.v2") return { deleted: true }
      return monitor
    })
    const bridge = createDesktopBridge(invoke)
    expect((await bridge.bilibiliFollowersV2.list()).items[0]?.currentFollowerCount).toBe(maximum)
    expect((await bridge.bilibiliFollowersV2.add({ mid: maximum })).followingCount).toBe(minimum)
    await bridge.bilibiliFollowersV2.updateStatus({ userId, enabled: false })
    await bridge.bilibiliFollowersV2.updateSettings({ userId, intervalSeconds: 120 })
    expect((await bridge.bilibiliFollowersV2.refresh({ userId })).followerCount).toBe(minimum)
    expect((await bridge.bilibiliFollowersV2.trend({ userId })).points[0]?.followerCount).toBe(maximum)
    expect((await bridge.bilibiliFollowersV2.trends({ userIds: [userId] }))[0]?.points[0]?.followingCount).toBe(minimum)
    await bridge.bilibiliFollowersV2.remove({ userId })
    expect(invoke.mock.calls).toEqual([
      ["bilibili-followers:list.v2", {}], ["bilibili-followers:add.v2", { mid: maximum }],
      ["bilibili-followers:update-status.v2", { userId, enabled: false }],
      ["bilibili-followers:update-settings.v2", { userId, intervalSeconds: 120 }],
      ["bilibili-followers:refresh.v2", { userId }],
      ["bilibili-followers:trend.v2", { userId, limit: 500 }],
      ["bilibili-followers:trends.v2", { userIds: [userId], limitPerUser: 500 }],
      ["bilibili-followers:delete.v2", { userId }]
    ])
  })

  it("adds precise workbench and subject trends without replacing legacy methods", async () => {
    const invoke = vi.fn(async (channel: string) => channel.endsWith("workbench.v2") ? workbench : subjectTrend)
    const bridge = createDesktopBridge(invoke)
    expect((await bridge.bilibiliSubjects.workbenchV2({ subjectId })).summary.followerDelta24h).toBe(minimum)
    expect((await bridge.bilibiliSubjects.trendsV2({ subjectId })).points[0]?.followerCount).toBe(minimum)
    expect(invoke.mock.calls).toEqual([
      ["bilibili-subjects:workbench.v2", { subjectId }],
      ["bilibili-subjects:trends.v2", { subjectId, metrics: ["follower", "live_online"], range: "24h", bucket: "5m" }]
    ])
    expect(typeof bridge.bilibiliSubjects.workbench).toBe("function")
    expect(typeof bridge.bilibiliFollowers.list).toBe("function")
  })

  it.each(["9223372036854775808", "-1", "0", "+2", "02", " 2", "2\n", "２"])(
    "rejects invalid request MID %j before invoking Main", async mid => {
      const invoke = vi.fn(async () => monitor)
      await expect(createDesktopBridge(invoke).bilibiliFollowersV2.add({ mid })).rejects.toThrow()
      expect(invoke).not.toHaveBeenCalled()
    })

  it.each([9007199254740992, "9223372036854775808", "01", "-0", "2\n"])(
    "rejects noncanonical response count %j instead of coercing it", async currentFollowerCount => {
      const bridge = createDesktopBridge(async () => ({ ...monitor, currentFollowerCount }))
      await expect(bridge.bilibiliFollowersV2.add({ mid: maximum })).rejects.toThrow()
    })

  it.each(["WORKER_CONTRACT_PRECISION_UNSUPPORTED", "LONG64_LEGACY_PRECISION_UNSUPPORTED"])(
    "retains business precision error %s from Main", async code => {
      const precisionError = new Error(`${code}: legacy caller cannot represent this count`)
      const bridge = createDesktopBridge(async () => { throw precisionError })
      await expect(bridge.bilibiliFollowersV2.refresh({ userId })).rejects.toBe(precisionError)
    })
})
