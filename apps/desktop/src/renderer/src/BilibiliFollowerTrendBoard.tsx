import type { BilibiliFollowerMonitorV2, BilibiliFollowerTrendV2 } from "@bmd/contracts"
import { ArrowLeft, ArrowRight, Grip, TrendingUp } from "lucide-react"
import type { FollowerResourceState } from "./BilibiliFollowerWorkspace"
import { FollowerTrendChart } from "./FollowerTrendChart"
import { followerChartHeight, followerChartPoints } from "./follower-trend-presentation"
import { formatFollowerCount, formatFollowerDelta } from "./follower-monitor-presentation"
import { useFollowerTrendDrag } from "./use-follower-trend-drag"
import type { FollowerTrendIndicator } from "./use-follower-trends"
import "./follower-trend-board.css"

export function BilibiliFollowerTrendBoard({ users, trends, indicator = "idle", now, onSwap, onReload }: {
  users: BilibiliFollowerMonitorV2[]; trends: FollowerResourceState<BilibiliFollowerTrendV2[]>; now: number
  indicator?: FollowerTrendIndicator | undefined; onSwap?: ((source: string, target: string) => void) | undefined
  onReload?: (() => void) | undefined
}) {
  const { board, drag, start } = useFollowerTrendDrag(users.map(user => user.id), onSwap)
  const count = users.length
  const data = trends.phase === "success" ? trends.data : []
  const error = trends.phase === "error" ? trends.message : trends.phase === "success" ? trends.staleMessage : undefined
  const help = count === 1 ? "单图放大观察连续变化。" : count === 2 ? "左右并排对照两位用户。"
    : count === 3 ? "首位用户为主图，右侧两图对照；拖动可交换位置。" : count === 4 ? "四位用户网格对照；拖动可交换位置。" : "勾选上方用户，在这里查看粉丝变化。"
  return <section className="panel follower-trends" aria-label="粉丝历史趋势" tabIndex={-1}>
    <div className="panel-header compact"><div><p>FOLLOWER HISTORY</p><h2>粉丝历史趋势</h2></div><span className="follower-limit">最多选择 4 个用户</span></div>
    <div className="follower-trend-toolbar"><p>{help}</p><div className="follower-layout-pills" aria-label="当前趋势布局">
      {["单图", "双列", "主次", "2×2"].map((label, index) => <span key={label} className={count === index + 1 ? "is-current" : ""}>{label}</span>)}
    </div><span className={`follower-trend-refresh is-${indicator}`} role="status" aria-live="polite">
      {indicator === "refreshing" ? "趋势刷新中" : indicator === "done" ? "趋势已更新" : indicator === "error" ? "趋势刷新失败" : ""}
    </span></div>
    {error && <p className="form-error" role="alert">趋势更新失败，保留已有数据：{error} {onReload && <button className="button button-secondary" onClick={onReload}>重试趋势</button>}</p>}
    {count === 0 ? <div className="business-empty"><TrendingUp size={25} /><strong>请选择监控用户</strong><span>勾选上方最多 4 位用户，趋势会显示在同一页。</span></div>
      : <div ref={board} className={`follower-trend-board chart-count-${count}`}>
        {users.map((user, index) => {
          const points = followerChartPoints(user, data.find(trend => trend.user.id === user.id)?.points, now)
          const fallback = !data.some(trend => trend.user.id === user.id && trend.points.length) && !user.recentTrend.length && user.currentFollowerCount !== undefined
          return <article key={user.id} data-trend-user-id={user.id}
            className={`follower-trend-card trend-color-${index % 4}${drag.source === user.id ? " is-dragging" : ""}${drag.target === user.id ? " is-drop-target" : ""}`}
            onPointerDown={event => start(user.id, event)}>
            <header className="follower-chart-heading"><div><h3 title={user.nickname}>{user.nickname}</h3><span>UID {user.mid} · {fallback ? "当前值参考" : `${points.length} 个快照`}</span></div>
              <div className="follower-chart-value"><strong>{formatFollowerCount(user.currentFollowerCount)}</strong><span>较上次 {formatFollowerDelta(user.deltaSincePrevious)}</span></div>
            </header>
            <div className="follower-chart-tools"><span><Grip size={16} />{count > 1 ? "拖动交换" : "粉丝数"}</span><div>
              {count > 1 && <><button type="button" disabled={!onSwap || index === 0} aria-label={`向前交换${user.nickname}`} onClick={() => onSwap?.(user.id, users[index - 1]!.id)}><ArrowLeft size={16} /></button>
                <button type="button" disabled={!onSwap || index === count - 1} aria-label={`向后交换${user.nickname}`} onClick={() => onSwap?.(user.id, users[index + 1]!.id)}><ArrowRight size={16} /></button></>}
            </div></div>
            {trends.phase === "loading" && <span className="follower-history-pending">正在读取粉丝历史趋势</span>}
            <FollowerTrendChart nickname={user.nickname} points={points} height={followerChartHeight(count, index)} />
            {drag.target === user.id && <span className="follower-drop-hint">释放交换位置</span>}
          </article>
        })}
      </div>}
  </section>
}
