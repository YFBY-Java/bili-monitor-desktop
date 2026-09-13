import type { BilibiliLiveRoom, BilibiliLiveRoomTrend, BilibiliLiveTrendPoint } from "@bmd/contracts"
import { useMemo } from "react"
import { LiveTrendChart } from "./LiveTrendChart"
import { formatLiveDelta, formatLiveShortCount } from "./live-monitor-presentation"
import { liveChartHeight, liveChartSamples, liveTrendHelp } from "./live-trend-presentation"
import "./live-trend-board.css"

export function BilibiliLiveTrendBoard({ rooms, trends, selectedIds, pending, errorMessage, onReload, onSelectionChange, showSelector }: {
  rooms: BilibiliLiveRoom[]; trends: BilibiliLiveRoomTrend[]; selectedIds: string[]; pending: boolean
  errorMessage?: string; onReload?: () => Promise<unknown>; onSelectionChange: (ids: string[]) => void; showSelector: boolean
}) {
  const selected = selectedIds.flatMap(id => rooms.find(room => room.id === id) ?? [])
  return <section className="live-trend-board" aria-label="直播间趋势">
    <header className="live-trend-heading"><div><h2>在线/热度趋势</h2><p>{liveTrendHelp(selected.length)}</p></div>
      <span>最近500次采集 · 各图独立缩放</span></header>
    {showSelector && <div className="live-trend-picker" aria-label="趋势房间选择">{rooms.map(room => <label key={room.id}>
      <input type="checkbox" checked={selectedIds.includes(room.id)} disabled={!selectedIds.includes(room.id) && selectedIds.length >= 4}
        onChange={() => onSelectionChange(selectedIds.includes(room.id) ? selectedIds.filter(id => id !== room.id) : [...selectedIds, room.id].slice(0, 4))} />
      <span>{room.uname}</span></label>)}</div>}
    {selected.length > 0 && errorMessage && <div className="business-error" role="alert"><span>{errorMessage}；保留已读取的历史或房间当前可用数据。</span>
      {onReload && <button className="button" type="button" disabled={pending} onClick={() => void onReload()}>重试趋势查询</button>}</div>}
    {selected.length > 0 && pending && <p className="live-trend-refresh" role="status">正在读取趋势…</p>}
    {selected.length === 0 ? <div className="live-trend-empty"><h3>尚未选择直播间</h3><p>选择直播间后查看在线趋势。</p></div>
      : <div className={`live-trend-grid count-${selected.length}`}>{selected.map((room, index) => <LiveTrendCard key={room.id} room={room}
        fetched={trends.find(trend => trend.room.id === room.id)?.points} height={liveChartHeight(selected.length, index)} color={index} />)}</div>}
  </section>
}

function LiveTrendCard({ room, fetched, height, color }: { room: BilibiliLiveRoom; fetched: BilibiliLiveTrendPoint[] | undefined; height: number; color: number }) {
  const samples = useMemo(() => liveChartSamples(room, fetched, Date.now()), [room, fetched])
  const sourceLabel = { history: "历史快照", recent: "房间近期快照", current: "当前值参考（非新增历史）", empty: "暂无数据" }[samples.source]
  return <article className={`live-chart-card live-trend-card trend-color-${color}`}>
    <header className="live-chart-heading"><div><h3 aria-label={`${room.uname}的在线趋势`} title={room.uname}>{room.uname}</h3>
      <span>房间 {room.roomId} · {samples.points.length} 个点</span></div><div className="live-chart-current">
      <strong title={room.onlineCount?.toLocaleString("zh-CN")}>{formatLiveShortCount(room.onlineCount)}</strong><span>较上次 {formatLiveDelta(room.onlineDelta)}</span></div></header>
    <p className="live-chart-source">{sourceLabel}</p>
    <LiveTrendChart roomName={room.uname} samples={samples} height={height} />
    {samples.points.length < 2 && <p className="live-chart-note">至少需要2次采集形成趋势。</p>}
    {samples.provisionalTime && <p className="live-chart-note">缺少采样时间；单点横坐标为本次展示时间。</p>}
    {samples.points.some(point => point.onlineCount === undefined) && <p className="live-chart-note">空心点：原始热度缺失，沿用原页面以0绘制，不代表实测为0。</p>}
  </article>
}
