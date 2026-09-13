import type { BilibiliLiveRoom, BilibiliLiveStatusEvent } from "@bmd/contracts"
import { formatLiveDateTime } from "./live-monitor-presentation"

export function liveRelativeTime(value: string | undefined, now: number): string {
  if (!value) return "-"
  const diff = now - Date.parse(value)
  if (!Number.isFinite(diff)) return "-"
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return formatLiveDateTime(value)
}

export function liveEventName(event: BilibiliLiveStatusEvent, rooms: readonly BilibiliLiveRoom[]): string {
  const room = rooms.find(item => item.id === event.monitorId)
  const labels: Record<BilibiliLiveStatusEvent["eventType"], string> = {
    LIVE_STARTED: "开播", LIVE_ENDED: "下播", ROUND_STARTED: "开始轮播", TITLE_CHANGED: "标题变化",
    ERROR_OCCURRED: "采集异常", ERROR_RECOVERED: "异常恢复"
  }
  return `${room?.uname || `房间 ${event.roomId}`} · ${labels[event.eventType] ?? event.eventType}`
}
