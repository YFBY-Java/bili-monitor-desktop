import type { BilibiliLiveRoomV2, BilibiliLiveStatusEventV2 } from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { LiveOverviewSummary } from "./BilibiliLiveOverview"
import { formatLiveDateTime } from "./live-monitor-presentation"
import { liveEventName, liveRelativeTime } from "./live-overview-presentation"

const now = Date.parse("2026-09-13T04:00:00Z")
const event: BilibiliLiveStatusEventV2 = { id: "018f0f39-7b5e-7cc1-962d-000000000000", monitorId: "018f0f39-7b5e-7cc1-962d-000000000001",
  uid: "20", roomId: "120", eventType: "LIVE_STARTED", occurredAt: "2026-09-13T03:00:00Z" }
const room: BilibiliLiveRoomV2 = { id: event.monitorId, uid: "20", roomId: "120", uname: "当前主播", liveStatus: 1,
  monitorStatus: "ACTIVE", intervalSeconds: 300, onlineCount: "12345", version: 1, recentTrend: [] }

describe("original live overview presentation", () => {
  it("uses exact minute/hour/day boundaries, including future and invalid timestamps", () => {
    const before = (ms: number) => new Date(now - ms).toISOString()
    expect(liveRelativeTime(undefined, now)).toBe("-")
    expect(liveRelativeTime("invalid", now)).toBe("-")
    expect(liveRelativeTime(before(-60000), now)).toBe("刚刚")
    expect(liveRelativeTime(before(59999), now)).toBe("刚刚")
    expect(liveRelativeTime(before(60000), now)).toBe("1 分钟前")
    expect(liveRelativeTime(before(3599999), now)).toBe("59 分钟前")
    expect(liveRelativeTime(before(3600000), now)).toBe("1 小时前")
    expect(liveRelativeTime(before(86399999), now)).toBe("23 小时前")
    expect(liveRelativeTime(before(86400000), now)).toBe(formatLiveDateTime(before(86400000)))
  })

  it("maps all six source event types using current monitor identity", () => {
    const cases = [["LIVE_STARTED", "开播"], ["LIVE_ENDED", "下播"], ["ROUND_STARTED", "开始轮播"],
      ["TITLE_CHANGED", "标题变化"], ["ERROR_OCCURRED", "采集异常"], ["ERROR_RECOVERED", "异常恢复"]] as const
    for (const [eventType, label] of cases) expect(liveEventName({ ...event, eventType }, [room])).toBe(`当前主播 · ${label}`)
    expect(liveEventName(event, [{ ...room, id: event.id, uname: "同UID不同监控" }])).toBe("房间 120 · 开播")
    expect(liveEventName(event, [])).toBe("房间 120 · 开播")
  })

  it("falls back to live-room facts and the first event when summary is absent", () => {
    const html = renderToStaticMarkup(createElement(LiveOverviewSummary, { summary: undefined,
      rooms: [room, { ...room, id: event.id, liveStatus: 0, onlineCount: "999999" }], events: [event], now, available: true, pending: false }))
    expect(html).toContain("1.2万")
    expect(html).toContain("1 小时前")
    expect(html).not.toContain("999,999")
  })

  it("only reports no recent changes for a successfully loaded projection", () => {
    const render = (available: boolean) => renderToStaticMarkup(createElement(LiveOverviewSummary, {
      summary: undefined, rooms: [], events: [], now, available, pending: false }))
    expect(render(true)).toContain("24 小时内无变化")
    expect(render(false)).not.toContain("24 小时内无变化")
    expect(render(false).match(/<strong>—<\/strong>/g)).toHaveLength(4)
  })
})
