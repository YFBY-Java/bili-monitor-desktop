import type { BilibiliFollowerMonitor } from "@bmd/contracts"

// BilibiliView.vue formatInterval: seconds are omitted once displaying hours/days.
export function formatFollowerInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分${seconds % 60 ? ` ${seconds % 60} 秒` : ""}`
  if (seconds < 86400) {
    const minutes = Math.floor(seconds % 3600 / 60)
    return `${Math.floor(seconds / 3600)} 小时${minutes ? ` ${minutes} 分` : ""}`
  }
  const hours = Math.floor(seconds % 86400 / 3600)
  return `${Math.floor(seconds / 86400)} 天${hours ? ` ${hours} 小时` : ""}`
}

export function formatFollowerCount(value: number | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("zh-CN").format(value)
}

export function formatShortFollowerCount(value: number | undefined): string {
  if (value === undefined) return "—"
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  return formatFollowerCount(value)
}

export function formatFollowerDelta(value: number | undefined): string {
  if (value === undefined) return "—"
  return `${value > 0 ? "+" : ""}${formatShortFollowerCount(value)}`
}

export function followerSummary(users: readonly BilibiliFollowerMonitor[]) {
  const intervals = [...new Set(users.map(user => user.intervalSeconds))]
  const schedules = users.flatMap(user => user.nextCollectAt ? [user.nextCollectAt] : []).sort()
  return {
    totalFollowers: users.reduce((sum, user) => sum + (user.currentFollowerCount ?? 0), 0),
    totalDelta: users.reduce((sum, user) => sum + (user.deltaSincePrevious ?? 0), 0),
    // The source includes paused users' stored schedules here; their tiles still say paused.
    nextCollectAt: schedules[0],
    intervalText: intervals.length === 0 ? "默认" : intervals.length === 1 ? formatFollowerInterval(intervals[0]!)
      : `${formatFollowerInterval(Math.min(...intervals))} - ${formatFollowerInterval(Math.max(...intervals))}`
  }
}

export function followerSchedule(user: BilibiliFollowerMonitor, now: number, collecting: boolean) {
  if (user.monitorStatus === "PAUSED") return { brief: "已暂停", progress: 0, rhythm: "已暂停" }
  if (user.lastErrorType) return { brief: user.lastErrorType, progress: 100, rhythm: user.lastErrorType }
  if (collecting) return { brief: "采集中", progress: 100, rhythm: "采集中" }
  const scheduled = Date.parse(user.nextCollectAt ?? "")
  const last = Date.parse(user.lastSnapshotAt || user.lastSuccessAt || "")
  const end = Number.isFinite(scheduled) ? scheduled : Number.isFinite(last) ? last + user.intervalSeconds * 1000 : now
  const start = Number.isFinite(last) ? last : end - user.intervalSeconds * 1000
  const progress = end <= start ? (now >= end ? 100 : 0) : Math.min(100, Math.max(4, (now - start) / (end - start) * 100))
  const diff = end - now
  const brief = diff <= 0 ? "待采集" : diff < 60_000 ? `${Math.ceil(diff / 1000)} 秒后`
    : diff < 3_600_000 ? `${Math.ceil(diff / 60_000)} 分后`
      : diff < 86_400_000 ? `${Math.ceil(diff / 3_600_000)} 小时后` : `${Math.ceil(diff / 86_400_000)} 天后`
  return { brief, progress, rhythm: diff <= 0 ? brief : `${brief} · ${Math.round(progress)}%` }
}
