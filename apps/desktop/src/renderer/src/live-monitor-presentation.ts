import type { BilibiliLiveRoom } from "@bmd/contracts"

// BilibiliLiveView.vue: these are display rules, never a collection scheduler.
export function liveCollectionSchedule(room: BilibiliLiveRoom, now: number) {
  if (room.monitorStatus === "PAUSED") return { brief: "已停用", progress: 0 }
  if (room.lastErrorType) return { brief: room.backoffUntil ? `退避至 ${formatLiveClock(room.backoffUntil)}` : "异常退避", progress: 100 }
  if (!room.nextCollectAt) return { brief: "未排程", progress: 0 }
  const end = Date.parse(room.nextCollectAt)
  const startSource = room.lastSnapshotAt || room.lastSuccessAt
  const start = startSource ? Date.parse(startSource) : end - room.intervalSeconds * 1000
  const progress = !Number.isFinite(start) || !Number.isFinite(end) || end <= start ? 100
    : Math.min(100, Math.max(4, (now - start) / (end - start) * 100))
  const diff = end - now
  const brief = !Number.isFinite(end) ? "未排程" : diff <= 0 ? "待采集" : diff < 60_000 ? `${Math.ceil(diff / 1000)} 秒后`
    : diff < 3_600_000 ? `${Math.ceil(diff / 60_000)} 分后` : diff < 86_400_000 ? `${Math.ceil(diff / 3_600_000)} 小时后`
      : `${Math.ceil(diff / 86_400_000)} 天后`
  return { brief, progress }
}

export function liveMonitorStatus(room: BilibiliLiveRoom) {
  if (room.monitorStatus === "PAUSED") return { label: "暂停", tone: "paused" }
  if (room.lastErrorType) return { label: "异常", tone: "error" }
  if (room.liveStatus === 1) return { label: "LIVE", tone: "live" }
  if (room.liveStatus === 2) return { label: "轮播", tone: "round" }
  return { label: "未开播", tone: "offline" }
}

export function clampLiveInterval(value: number): number {
  return Number.isFinite(value) ? Math.min(2_592_000, Math.max(1, Math.round(value))) : 1
}

export function liveIntervalStep(value: number): number {
  return value < 60 ? 1 : value < 3600 ? 60 : value < 86400 ? 300 : 3600
}

export function formatLiveShortCount(value: number | undefined): string {
  if (value === undefined) return "—"
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万`
  return new Intl.NumberFormat("zh-CN").format(value)
}

export function formatLiveDelta(value: number | undefined): string {
  return value === undefined ? "—" : `${value > 0 ? "+" : ""}${formatLiveShortCount(value)}`
}

export function formatLiveDateTime(value: string | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—"
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value))
}

function formatLiveClock(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "—"
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value))
}

export function liveDurationText(room: BilibiliLiveRoom, now: number): string {
  if (room.liveStatus !== 1 || !room.liveTime || !Number.isFinite(Date.parse(room.liveTime))) return "—"
  const diff = Math.max(0, now - Date.parse(room.liveTime))
  const hours = Math.floor(diff / 3_600_000), minutes = Math.floor(diff % 3_600_000 / 60_000)
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`
}

export function liveFieldHealth(room: BilibiliLiveRoom) {
  return [
    { label: "头像", ok: Boolean(room.faceUrl) },
    { label: "封面", ok: Boolean(room.keyframeUrl || room.coverUrl) },
    { label: "分区", ok: Boolean(room.areaName || room.parentAreaName) },
    { label: "在线", ok: room.onlineCount != null },
    { label: "关注", ok: room.attentionCount != null },
    { label: "标题", ok: Boolean(room.title) },
    { label: "开播时间", ok: room.liveStatus !== 1 || Boolean(room.liveTime) }
  ]
}
