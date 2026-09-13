import type { BilibiliLiveRoom, BilibiliLiveTrendPoint } from "@bmd/contracts"

export interface LiveChartSamples {
  points: readonly Pick<BilibiliLiveTrendPoint, "capturedAt" | "onlineCount">[]
  source: "history" | "recent" | "current" | "empty"
  provisionalTime: boolean
}

export function liveChartSamples(room: BilibiliLiveRoom, fetched: readonly BilibiliLiveTrendPoint[] | undefined, now: number): LiveChartSamples {
  if (fetched?.length) return { points: fetched, source: "history", provisionalTime: false }
  if (room.recentTrend.length) return { points: room.recentTrend, source: "recent", provisionalTime: false }
  if (room.onlineCount === undefined) return { points: [], source: "empty", provisionalTime: false }
  // Original display-only fallback. Never supply an invented endpoint or save a new snapshot.
  return { points: [{ capturedAt: room.lastSnapshotAt || new Date(now).toISOString(), onlineCount: room.onlineCount }],
    source: "current", provisionalTime: !room.lastSnapshotAt }
}

export function liveChartHeight(count: number, index: number): number {
  return count === 1 ? 420 : count === 2 ? 320 : count === 3 ? index === 0 ? 420 : 200 : 240
}

export function liveTrendHelp(count: number): string {
  return count === 0 ? "点击直播间的趋势按钮，最多同时查看4个房间。"
    : count === 1 ? "单个房间使用大图，观察连续变化。"
      : count === 2 ? "两个房间左右并排，分别观察热度变化。"
        : count === 3 ? "三个房间采用主次布局，先选中的房间显示在左侧大图。"
          : "四个房间使用2×2网格，按选择顺序排列。"
}

export function formatLiveTrendTime(time: number, span?: number): string {
  if (!Number.isFinite(time)) return "时间不可用"
  return new Intl.DateTimeFormat("zh-CN", {
    ...(span === undefined || span > 86_400_000 ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit", minute: "2-digit", ...(span === undefined || span < 120_000 ? { second: "2-digit" } : {}), hour12: false
  }).format(new Date(time))
}
