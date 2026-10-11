import type { BilibiliLiveRoomV2 } from "@bmd/contracts"
import { describe, expect, it } from "vitest"
import { clampLiveInterval, formatLiveDateTime, formatLiveDelta, formatLiveShortCount, liveCollectionSchedule,
  liveDurationText, liveFieldHealth, liveIntervalStep, liveMonitorStatus } from "./live-monitor-presentation"

const now = Date.parse("2026-09-13T04:00:00Z")
const room: BilibiliLiveRoomV2 = { id: "018f0f39-7b5e-4cc1-862d-000000000000", uid: "2", roomId: "102",
  uname: "合成主播", monitorStatus: "ACTIVE", liveStatus: 1, intervalSeconds: 300, recentTrend: [], version: 1 }

describe("original live monitor presentation boundaries", () => {
  it("prioritizes paused before error before live status without changing stored facts", () => {
    const error = { ...room, lastErrorType: "BILIBILI_RISK_CONTROL" }
    expect(liveMonitorStatus({ ...error, monitorStatus: "PAUSED" }).label).toBe("暂停")
    expect(liveMonitorStatus(error).label).toBe("异常")
    expect(liveMonitorStatus(room).label).toBe("LIVE")
    expect(liveMonitorStatus({ ...room, liveStatus: 2 }).label).toBe("轮播")
    expect(liveMonitorStatus({ ...room, liveStatus: 0 }).label).toBe("未开播")
    expect(room.liveStatus).toBe(1)
  })

  it("handles unscheduled, paused, error and overdue rhythms without inferred new samples", () => {
    expect(liveCollectionSchedule(room, now)).toEqual({ brief: "未排程", progress: 0 })
    expect(liveCollectionSchedule({ ...room, monitorStatus: "PAUSED", lastErrorType: "ERROR" }, now)).toEqual({ brief: "已停用", progress: 0 })
    expect(liveCollectionSchedule({ ...room, lastErrorType: "ERROR" }, now)).toEqual({ brief: "异常退避", progress: 100 })
    const later = { ...room, nextCollectAt: "2026-09-13T04:05:00Z" }
    expect(liveCollectionSchedule(later, now)).toEqual({ brief: "5 分后", progress: 4 })
    expect(liveCollectionSchedule(later, now + 150_000)).toEqual({ brief: "3 分后", progress: 50 })
    expect(liveCollectionSchedule(later, now + 300_000)).toEqual({ brief: "待采集", progress: 100 })
    expect(room.recentTrend).toEqual([])
  })

  it("uses last snapshot before last success and falls back to interval only without both", () => {
    const nextCollectAt = "2026-09-13T04:05:00Z"
    expect(liveCollectionSchedule({ ...room, nextCollectAt, lastSnapshotAt: "2026-09-13T03:55:00Z",
      lastSuccessAt: "2026-09-13T03:50:00Z" }, now).progress).toBe(50)
    expect(liveCollectionSchedule({ ...room, nextCollectAt, lastSuccessAt: "2026-09-13T03:50:00Z" }, now).progress).toBeCloseTo(100 * 2 / 3)
    expect(liveCollectionSchedule({ ...room, nextCollectAt, lastSnapshotAt: nextCollectAt }, now).progress).toBe(100)
  })

  it("rounds countdown up across the second, minute, hour and day thresholds", () => {
    for (const [milliseconds, brief] of [[1, "1 秒后"], [59001, "60 秒后"], [60000, "1 分后"],
      [3_600_000, "1 小时后"], [86_400_000, "1 天后"], [86_400_001, "2 天后"]] as const) {
      expect(liveCollectionSchedule({ ...room, nextCollectAt: new Date(now + milliseconds).toISOString() }, now).brief).toBe(brief)
    }
    expect(liveCollectionSchedule({ ...room, lastErrorType: "ERROR", backoffUntil: "2026-09-13T04:01:00Z" }, now).brief).toMatch(/^退避至 /)
  })

  it("clamps interval values while preserving the original dynamic relative steps", () => {
    expect([0, 1.5, Infinity, NaN, 3_000_000].map(clampLiveInterval)).toEqual([1, 2, 1, 1, 2_592_000])
    expect([1, 59, 60, 3599, 3600, 86399, 86400].map(liveIntervalStep)).toEqual([1, 1, 60, 60, 300, 300, 3600])
  })

  it("formats signed compact counts without turning missing measurements into zero", () => {
    expect([undefined, 0, 1234, 10_000, 12345, -45_678, 100_000_000].map(formatLiveShortCount))
      .toEqual(["—", "0", "1,234", "1万", "1.2万", "-4.6万", "1亿"])
    expect([undefined, -12345, 0, 12345].map(formatLiveDelta)).toEqual(["—", "-1.2万", "0", "+1.2万"])
  })

  it("ticks live duration only for live rooms and guards missing, invalid and future dates", () => {
    expect(liveDurationText(room, now)).toBe("—")
    expect(liveDurationText({ ...room, liveTime: "bad" }, now)).toBe("—")
    expect(liveDurationText({ ...room, liveTime: "2026-09-13T04:01:00Z" }, now)).toBe("0 分钟")
    expect(liveDurationText({ ...room, liveTime: "2026-09-13T02:59:00Z" }, now)).toBe("1 小时 1 分")
    expect(liveDurationText({ ...room, liveStatus: 0, liveTime: "2026-09-13T02:59:00Z" }, now)).toBe("—")
    expect(formatLiveDateTime(undefined)).toBe("—")
    expect(formatLiveDateTime("bad")).toBe("—")
    expect(formatLiveDateTime("2026-09-13T04:00:00Z")).toContain("09/13")
  })

  it("distinguishes missing fields from zero and offline rooms without live time", () => {
    expect(liveFieldHealth(room).filter(field => !field.ok).map(field => field.label))
      .toEqual(["头像", "封面", "分区", "在线", "关注", "标题", "开播时间"])
    const complete = { ...room, faceUrl: "https://synthetic.invalid/face", keyframeUrl: "https://synthetic.invalid/cover",
      parentAreaName: "合成分区", onlineCount: "0", attentionCount: "0", title: "标题", liveStatus: 0 as const }
    expect(liveFieldHealth(complete).every(field => field.ok)).toBe(true)
  })
})
