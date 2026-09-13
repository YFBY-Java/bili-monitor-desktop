import type { BilibiliFollowerMonitor } from "@bmd/contracts"
import { describe, expect, it } from "vitest"
import { followerSchedule, followerSummary, formatFollowerInterval } from "./follower-monitor-presentation"

const start = Date.parse("2026-09-13T04:00:00Z")
const user: BilibiliFollowerMonitor = {
  id: "018f0f39-7b5e-4cc1-862d-000000000001", mid: "2", nickname: "合成用户",
  profileUrl: "https://space.bilibili.com/2", monitorStatus: "ACTIVE", intervalSeconds: 60,
  lastSnapshotAt: "2026-09-13T04:00:00Z", nextCollectAt: "2026-09-13T04:01:00Z",
  currentFollowerCount: 100, deltaSincePrevious: -2, recentTrend: [], version: 1
}

describe("original follower monitor presentation", () => {
  it("sums all users and includes paused schedules and interval range like the original page", () => {
    expect(followerSummary([user, { ...user, monitorStatus: "PAUSED", intervalSeconds: 3600,
      currentFollowerCount: 200, deltaSincePrevious: 10, nextCollectAt: "2026-09-13T04:00:30Z" }]))
      .toEqual({ totalFollowers: 300, totalDelta: 8, nextCollectAt: "2026-09-13T04:00:30Z", intervalText: "1 分 - 1 小时" })
    expect(followerSummary([])).toEqual({ totalFollowers: 0, totalDelta: 0, nextCollectAt: undefined, intervalText: "默认" })
    const { currentFollowerCount: _count, deltaSincePrevious: _delta, ...unknown } = user
    expect(followerSummary([unknown]).totalFollowers).toBe(0)
  })

  it("uses elapsed time with a four percent minimum and a hundred percent ceiling", () => {
    expect(followerSchedule(user, start, false)).toEqual({ brief: "1 分后", progress: 4, rhythm: "1 分后 · 4%" })
    expect(followerSchedule(user, start + 30_000, false)).toEqual({ brief: "30 秒后", progress: 50, rhythm: "30 秒后 · 50%" })
    expect(followerSchedule(user, start + 60_000, false)).toEqual({ brief: "待采集", progress: 100, rhythm: "待采集" })
  })

  it("prioritizes pause, error, and actual collecting without inventing countdowns", () => {
    expect(followerSchedule({ ...user, monitorStatus: "PAUSED", lastErrorType: "RISK" }, start, true))
      .toEqual({ brief: "已暂停", progress: 0, rhythm: "已暂停" })
    expect(followerSchedule({ ...user, lastErrorType: "RISK" }, start, true))
      .toEqual({ brief: "RISK", progress: 100, rhythm: "RISK" })
    expect(followerSchedule(user, start, true)).toEqual({ brief: "采集中", progress: 100, rhythm: "采集中" })
  })

  it("falls back to last snapshot, then last success, then now when no schedule exists", () => {
    const { nextCollectAt: _next, ...noNext } = user
    expect(followerSchedule(noNext, start + 30_000, false).progress).toBe(50)
    const { lastSnapshotAt: _snapshot, ...noSnapshot } = noNext
    expect(followerSchedule({ ...noSnapshot, lastSuccessAt: user.lastSnapshotAt! }, start + 30_000, false).brief).toBe("30 秒后")
    expect(followerSchedule(noSnapshot, start, false).brief).toBe("待采集")
    expect(followerSchedule({ ...user, nextCollectAt: user.lastSnapshotAt! }, start - 1, false).progress).toBe(0)
    expect(followerSchedule({ ...user, nextCollectAt: user.lastSnapshotAt! }, start, false).progress).toBe(100)
  })

  it.each([[1001, "2 秒后"], [60_001, "2 分后"], [3_600_001, "2 小时后"], [86_400_001, "2 天后"]])(
    "rounds up %i milliseconds as %s", (remaining, brief) => {
      expect(followerSchedule({ ...user, nextCollectAt: new Date(start + remaining).toISOString() }, start, false).brief).toBe(brief)
    }
  )

  it.each([[1, "1 秒"], [61, "1 分 1 秒"], [3601, "1 小时"], [3660, "1 小时 1 分"], [90000, "1 天 1 小时"], [2592000, "30 天"]])(
    "formats interval %i as %s", (seconds, text) => { expect(formatFollowerInterval(seconds)).toBe(text) }
  )
})
