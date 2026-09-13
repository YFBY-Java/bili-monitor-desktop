import type { BilibiliLiveRoom, BilibiliLiveStatusEvent, BilibiliLiveSummary } from "@bmd/contracts"
import { Clock3, Radio, TrendingUp, UsersRound } from "lucide-react"
import { formatLiveDateTime, formatLiveShortCount } from "./live-monitor-presentation"
import { liveEventName, liveRelativeTime } from "./live-overview-presentation"
import "./live-overview.css"

export function LiveOverviewSummary({ summary, rooms, events, now, available, pending }: {
  summary: BilibiliLiveSummary | undefined; rooms: BilibiliLiveRoom[]; events: BilibiliLiveStatusEvent[]
  now: number; available: boolean; pending: boolean
}) {
  const live = rooms.filter(room => room.liveStatus === 1), latest = summary?.latestEvent ?? events[0]
  const values = [
    ["直播中房间", summary?.liveRooms ?? live.length, Radio],
    ["总在线/热度", formatLiveShortCount(summary?.totalOnlineCount ?? live.reduce((sum, room) => sum + (room.onlineCount ?? 0), 0)), UsersRound],
    ["今日开播次数", summary?.todayLiveStarts ?? 0, TrendingUp],
    ["最近状态变化", latest ? liveRelativeTime(latest.occurredAt, now) : "24 小时内无变化", Clock3]
  ] as const
  return <section className="live-summary-grid live-overview-summary" aria-label="直播监控汇总" aria-busy={pending}>
    {values.map(([label, value, Icon]) => <article className="live-summary-card" key={label}>
      <Icon size={17} aria-hidden="true" /><span>{label}</span>
      <strong title={available && label === "最近状态变化" && latest ? formatLiveDateTime(latest.occurredAt) : undefined}>{available ? value : "—"}</strong>
    </article>)}
  </section>
}

export function LiveStatusEvents({ events, rooms, now, available, pending }: {
  events: BilibiliLiveStatusEvent[]; rooms: BilibiliLiveRoom[]; now: number; available: boolean; pending: boolean
}) {
  return <section className="live-event-panel live-overview-events" aria-label="最近状态事件" aria-busy={pending}>
    <header><h2>最近状态事件</h2><p>记录开播、下播、轮播、标题变化和采集异常。</p></header>
    {!available ? <p role="status">{pending ? "正在读取状态事件…" : "状态事件尚未读取成功，请刷新监控数据重试。"}</p>
      : !events.length ? <p className="live-overview-empty">暂无状态事件</p>
        : <div className="live-event-list">{events.map(event => <article key={event.id}>
          <i className={`event-${event.eventType.toLowerCase()}`} aria-hidden="true" />
          <div><strong title={liveEventName(event, rooms)}>{liveEventName(event, rooms)}</strong>
            <span>UID {event.uid} · 房间 {event.roomId}</span>
            {event.titleBefore !== event.titleAfter && event.titleAfter && <small>{event.titleBefore ?? "无标题"} → {event.titleAfter}</small>}
          </div>
          <time dateTime={event.occurredAt} title={formatLiveDateTime(event.occurredAt)}>{liveRelativeTime(event.occurredAt, now)}</time>
        </article>)}</div>}
  </section>
}
