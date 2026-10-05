import type { BilibiliFollowerMonitorV2 } from "@bmd/contracts"

// This is a display projection only; raw avatar text stays unchanged in Core.
export function safeFollowerAvatar(value: string | undefined): string | undefined {
  if (!value) return undefined
  const text = value.trim()
  if (!/^(?:https?:\/\/|\/\/)/i.test(text)) return undefined
  try {
    const url = new URL(text.startsWith("//") ? `https:${text}` : text)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined
    // Match the existing production img-src allowlist, without broadening CSP.
    if (url.protocol === "http:" && ["i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com", "archive.biliimg.com"].includes(url.hostname)) {
      url.protocol = "https:"
    }
    return url.href
  } catch { return undefined }
}

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

export function formatFollowerCount(value: string | bigint | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("zh-CN").format(BigInt(value))
}

export function formatFollowerFixed(value: bigint, scale: bigint, digits: number, trimZeros = false): string {
  const magnitude = value < 0n ? -value : value
  const power = 10n ** BigInt(digits)
  const rounded = (magnitude * power + scale / 2n) / scale
  const fraction = (rounded % power).toString().padStart(digits, "0")
  const text = `${value < 0n ? "-" : ""}${rounded / power}${digits ? `.${fraction}` : ""}`
  return trimZeros ? text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : text
}

export function formatShortFollowerCount(value: string | bigint | undefined): string {
  if (value === undefined) return "—"
  const exact = BigInt(value), magnitude = exact < 0n ? -exact : exact
  if (magnitude >= 100_000_000n) return `${formatFollowerFixed(exact, 100_000_000n, 1)}亿`
  if (magnitude >= 10_000n) return `${formatFollowerFixed(exact, 10_000n, 1)}万`
  return formatFollowerCount(exact)
}

export function formatFollowerDelta(value: string | bigint | undefined): string {
  if (value === undefined) return "—"
  return `${BigInt(value) > 0n ? "+" : ""}${formatShortFollowerCount(value)}`
}

export function followerSummary(users: readonly BilibiliFollowerMonitorV2[]) {
  const intervals = [...new Set(users.map(user => user.intervalSeconds))]
  const schedules = users.flatMap(user => user.nextCollectAt ? [user.nextCollectAt] : []).sort()
  return {
    // UI aggregation is deliberately unbounded; only Core's stored delta uses Java Long wrap.
    totalFollowers: users.reduce((sum, user) => sum + BigInt(user.currentFollowerCount ?? "0"), 0n),
    totalDelta: users.reduce((sum, user) => sum + BigInt(user.deltaSincePrevious ?? "0"), 0n),
    // The source includes paused users' stored schedules here; their tiles still say paused.
    nextCollectAt: schedules[0],
    intervalText: intervals.length === 0 ? "默认" : intervals.length === 1 ? formatFollowerInterval(intervals[0]!)
      : `${formatFollowerInterval(Math.min(...intervals))} - ${formatFollowerInterval(Math.max(...intervals))}`
  }
}

export function followerSchedule(user: BilibiliFollowerMonitorV2, now: number, collecting: boolean) {
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
