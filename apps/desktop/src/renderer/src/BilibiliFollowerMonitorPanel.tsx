import type { BilibiliFollowerMonitorV2 } from "@bmd/contracts"
import { ChevronDown, ExternalLink, TrendingUp, UsersRound } from "lucide-react"
import { useEffect, useState } from "react"
import { followerSchedule, followerSummary, formatFollowerCount, formatFollowerDelta, formatShortFollowerCount, safeFollowerAvatar } from "./follower-monitor-presentation"
import "./follower-monitor-panel.css"

export function useFollowerClock(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    // Presentation only: the Core owns collection scheduling, including overdue work.
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function FollowerCollectionSummary({ users, available }: { users: BilibiliFollowerMonitorV2[]; available: boolean }) {
  const summary = followerSummary(users)
  return <section className="follower-collection-summary" aria-label="粉丝采集汇总">
    <div><span>总粉丝</span><strong>{available ? formatFollowerCount(summary.totalFollowers) : "—"}</strong></div>
    <div><span>最近净增</span><strong className={summary.totalDelta < 0n ? "is-negative" : summary.totalDelta > 0n ? "is-positive" : ""}>{available ? formatFollowerDelta(summary.totalDelta) : "—"}</strong></div>
    <div><span>下次采集</span><strong className="schedule-value">{!available ? "—" : summary.nextCollectAt
      ? <time dateTime={summary.nextCollectAt}>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(summary.nextCollectAt))}</time> : "未排程"}</strong></div>
    <div><span>采集间隔</span><strong className="schedule-value">{available ? summary.intervalText : "—"}</strong></div>
  </section>
}

export function FollowerRhythm({ user, now, collecting }: { user: BilibiliFollowerMonitorV2; now: number; collecting: boolean }) {
  const schedule = followerSchedule(user, now, collecting)
  return <div className="follower-rhythm" role="progressbar" aria-label={`${user.nickname}采集节奏`}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(schedule.progress)} aria-valuetext={schedule.rhythm}>
    <span style={{ width: `${schedule.progress}%` }} />
  </div>
}

export function FollowerUserStrip({ users, selected, expandedId, collectingIds, now, onExpand, onToggleTrend }: {
  users: BilibiliFollowerMonitorV2[]; selected: string[]; expandedId: string | undefined
  collectingIds: string[]; now: number; onExpand: (id: string) => void; onToggleTrend: ((id: string) => void) | undefined
}) {
  return <div className="follower-user-strip" aria-label="监控用户横向列表">
    {users.map(user => {
      const expanded = expandedId === user.id
      const chosen = selected.includes(user.id)
      const locked = !chosen && selected.length >= 4
      const collecting = collectingIds.includes(user.id)
      const status = user.lastErrorType ? "采集异常" : user.monitorStatus === "ACTIVE" ? "监控中" : "已暂停"
      const avatar = safeFollowerAvatar(user.avatarUrl)
      return <article key={user.id} className={`follower-card follower-user-tile${expanded ? " is-expanded" : ""}${chosen ? " is-selected" : ""}${user.lastErrorType ? " has-error" : ""}`}>
        <button type="button" className="follower-tile-expand" aria-expanded={expanded} aria-controls={`follower-detail-${user.id}`}
          aria-label={`${expanded ? "收起" : "展开"}${user.nickname}的详情`} onClick={() => onExpand(user.id)}>
          <div className="follower-avatar"><div className="follower-avatar-fallback"><UsersRound size={19} /></div>
            {avatar && <img key={user.avatarUrl} src={avatar} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</div>
          <span className="follower-tile-identity"><strong title={user.nickname}>{user.nickname}</strong><span>UID {user.mid}</span></span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <div className="follower-tile-actions">
          <a href={user.profileUrl} target="_blank" rel="noreferrer" aria-label={`打开${user.nickname}的主页`} title="打开主页"><ExternalLink size={16} /></a>
          <label className={`trend-selector${chosen ? " is-selected" : ""}`} title={locked ? "最多选择 4 个用户" : "加入或移出趋势对比"}>
            <input type="checkbox" checked={chosen} disabled={locked} onChange={() => onToggleTrend?.(user.id)} aria-label={`${user.nickname}趋势对比`} /><TrendingUp size={14} />{chosen ? "已选趋势" : "趋势"}
          </label>
        </div>
        <div className="follower-tile-change"><strong className={BigInt(user.deltaSincePrevious ?? "0") < 0n ? "is-negative" : BigInt(user.deltaSincePrevious ?? "0") > 0n ? "is-positive" : ""}>{formatFollowerDelta(user.deltaSincePrevious)}</strong><span>{status}</span></div>
        <div className="follower-tile-timing"><span title={formatFollowerCount(user.currentFollowerCount)}>粉丝 {formatShortFollowerCount(user.currentFollowerCount)}</span><span className="follower-collect-brief">{followerSchedule(user, now, collecting).brief}</span></div>
        <FollowerRhythm user={user} now={now} collecting={collecting} />
      </article>
    })}
  </div>
}
