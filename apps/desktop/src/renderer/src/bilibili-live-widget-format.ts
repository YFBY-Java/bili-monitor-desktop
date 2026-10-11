import type { BilibiliLiveRankEntry, BilibiliLiveRankEntryV2, BilibiliLiveRankFamily, BilibiliLiveRankSnapshot, BilibiliLiveRankSnapshotV2 } from "@bmd/contracts"
import { formatFollowerFixed } from "./follower-monitor-presentation"

type RankEntry = BilibiliLiveRankEntry | BilibiliLiveRankEntryV2
type RankSnapshot = BilibiliLiveRankSnapshot | BilibiliLiveRankSnapshotV2

const rankKeys = ["online_rank:contribution_rank", "online_rank:entry_time_rank", "daily_rank:today_rank",
  "weekly_rank:current_week_rank", "monthly_rank:current_month_rank", "guard_weekly", "guard_monthly", "guard_accompany"]
const labels = ["在线榜", "进房", "日榜", "周榜", "月榜", "周榜", "月榜", "陪伴榜"]
const titles = ["在线榜 · 贡献值", "在线榜 · 进房时间", "日榜 · 今日", "周榜 · 本周", "月榜 · 本月", "周榜", "月榜", "陪伴榜"]
export function widgetRankKey(snapshot: RankSnapshot): string {
  return snapshot.rankFamily === "GUARD" ? snapshot.rankType : `${snapshot.rankType}:${snapshot.rankSwitch || ""}`
}
export function widgetRankLabel(snapshot: RankSnapshot, title = false): string {
  return (title ? titles : labels)[rankKeys.indexOf(widgetRankKey(snapshot))] ?? snapshot.rankType
}
export function widgetRankSnapshots(snapshots: RankSnapshot[], family: BilibiliLiveRankFamily): RankSnapshot[] {
  const latest = new Map<string, RankSnapshot>()
  for (const snapshot of snapshots.filter(item => item.rankFamily === family)) {
    const key = widgetRankKey(snapshot), existing = latest.get(key)
    if (!existing || Date.parse(snapshot.capturedAt) >= Date.parse(existing.capturedAt)) latest.set(key, snapshot)
  }
  const order = (snapshot: RankSnapshot) => {
    const index = rankKeys.indexOf(widgetRankKey(snapshot))
    return index < 0 ? 99 : index
  }
  return [...latest.values()].sort((a, b) => order(a) - order(b))
}
export function widgetRankEntries(snapshot: RankSnapshot, direction: "asc" | "desc"): RankEntry[] {
  const value = (entry: RankEntry): bigint | undefined => {
    if (snapshot.rankFamily === "GUARD") return BigInt(snapshot.rankType === "guard_accompany"
      ? entry.accompanyDays ?? 0 : entry.score ?? entry.accompanyDays ?? entry.guardLevel ?? 0)
    if (snapshot.rankSwitch === "entry_time_rank") return entry.rankNo == null ? undefined : -BigInt(entry.rankNo)
    return BigInt(entry.score ?? 0)
  }
  const compare = (left: bigint | undefined, right: bigint | undefined) => left === right ? 0
    : left === undefined ? -1 : right === undefined ? 1 : left < right ? -1 : 1
  return [...snapshot.entries].sort((a, b) => {
    const diff = compare(value(b), value(a))
    // Missing entry ranks remain tied and preserve source order.
    const result = diff === 0
      ? (a.rankNo ?? Number.MAX_SAFE_INTEGER) - (b.rankNo ?? Number.MAX_SAFE_INTEGER) : diff
    return direction === "desc" ? result : -result
  }).slice(0, 100)
}
export function widgetCount(value?: number | string): string {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return "--"
  if (typeof value === "string") {
    const exact = BigInt(value), magnitude = exact < 0n ? -exact : exact
    if (magnitude >= 100_000_000n) return `${formatFollowerFixed(exact, 100_000_000n, 2, true)}亿`
    if (magnitude >= 10_000n) return `${formatFollowerFixed(exact, 10_000n, 1, true)}万`
    return exact.toLocaleString("zh-CN")
  }
  const short = (number: number, digits: number) => number.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
  if (Math.abs(value) >= 1e8) return `${short(value / 1e8, 2)}亿`
  if (Math.abs(value) >= 1e4) return `${short(value / 1e4, 1)}万`
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })
}
export function widgetRelativeTime(value?: string): string {
  if (!value) return "--"
  const diff = Date.now() - Date.parse(value)
  if (!Number.isFinite(diff)) return "--"
  if (diff < 0) return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${Math.max(1, seconds)} 秒前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}
export function widgetGuardLevel(level?: number): string {
  return level === 1 ? "总督" : level === 2 ? "提督" : level === 3 ? "舰长" : "未上舰"
}
export function widgetRankValue(snapshot: RankSnapshot, entry: RankEntry): string {
  if (snapshot.rankFamily === "GUARD") {
    if (entry.entryKind === "EXTOP") return "上期TOP"
    return entry.accompanyDays == null ? widgetGuardLevel(entry.guardLevel) : `${entry.accompanyDays} 天`
  }
  if (snapshot.rankSwitch === "entry_time_rank") return "在房"
  return entry.score == null ? widgetGuardLevel(entry.guardLevel) : widgetCount(entry.score)
}
export function widgetRankHint(snapshot: RankSnapshot): string {
  if (snapshot.rankFamily === "GUARD") return snapshot.rankType === "guard_accompany"
    ? "舰长、提督、总督的陪伴天数排行" : "舰长、提督、总督周期榜单"
  if (snapshot.rankSwitch === "entry_time_rank") return "按进房时间记录活跃观众"
  return snapshot.rankType === "online_rank" ? "投喂、发弹幕均可获得贡献值" : "按当前周期统计的贡献值榜单"
}
export function widgetRankSortLabel(snapshot: RankSnapshot): string {
  if (snapshot.rankFamily === "GUARD") return snapshot.rankType === "guard_accompany" ? "陪伴天数排序" : "亲密度排序"
  return snapshot.rankSwitch === "entry_time_rank" ? "进房时间排序" : "贡献值排序"
}
export function widgetAvatarUrl(url?: string): string {
  const value = url?.trim() ?? ""
  if (value.startsWith("//")) return `https:${value}`
  if (/^http:\/\//i.test(value)) return value.replace(/^http:\/\//i, "https://")
  if (/^[\w.-]+\//.test(value)) return `https://${value}`
  return value
}
