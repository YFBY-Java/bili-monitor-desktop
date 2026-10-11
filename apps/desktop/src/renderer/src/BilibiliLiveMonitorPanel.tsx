import type { BilibiliLiveRoomV2 } from "@bmd/contracts"
import { ChevronDown, ExternalLink, Pause, Play, Radio, RefreshCcw, Trash2, TrendingUp } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import type { BilibiliLiveWorkspacePresentationProps } from "./BilibiliLiveWorkspace"
import { clampLiveInterval, formatLiveDateTime, formatLiveDelta, formatLiveShortCount, liveCollectionSchedule,
  liveDurationText, liveFieldHealth, liveIntervalStep, liveMonitorStatus } from "./live-monitor-presentation"
import "./live-monitor-panel.css"

// Owned by Workspace, not a tab/card: switching tabs or collapsing must not erase drafts.
export function useLiveMonitorPanel(rooms: BilibiliLiveRoomV2[], revision: number | undefined) {
  const [now, setNow] = useState(Date.now)
  const [expandedId, setExpandedId] = useState<string | undefined>(rooms[0]?.id)
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [savedDrafts, setSavedDrafts] = useState<Record<string, number>>({})
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    // Original normalizeSelection runs on successful loadAll, not on each toggle.
    setExpandedId(current => rooms.some(room => room.id === current) ? current : rooms[0]?.id)
    setSavedDrafts({})
    setDrafts(current => {
      const retained = Object.entries(current).filter(([id, value]) => {
        const room = rooms.find(item => item.id === id)
        return room && value !== room.intervalSeconds
      })
      return retained.length === Object.keys(current).length ? current : Object.fromEntries(retained)
    })
  }, [rooms, revision])
  const clearDraft = (id: string) => setDrafts(current => {
    if (!(id in current)) return current
    const { [id]: _, ...rest } = current
    return rest
  })
  const editInterval = (room: BilibiliLiveRoomV2, value: number) => {
    const next = clampLiveInterval(value)
    if (next === (savedDrafts[room.id] ?? room.intervalSeconds)) clearDraft(room.id)
    else setDrafts(current => ({ ...current, [room.id]: next }))
  }
  const markSaved = (id: string, value: number) => {
    clearDraft(id)
    // A successful command is not undone by a failed overview read.
    setSavedDrafts(current => ({ ...current, [id]: value }))
  }
  const isDirty = (room: BilibiliLiveRoomV2) => (drafts[room.id] ?? savedDrafts[room.id] ?? room.intervalSeconds)
    !== (savedDrafts[room.id] ?? room.intervalSeconds)
  return { now, expandedId, setExpandedId, drafts: { ...savedDrafts, ...drafts }, clearDraft, editInterval, markSaved, isDirty }
}

export function BilibiliLiveMonitorPanel({ rooms, state, selectedTrendIds, busyRoomIds, roomActionErrors,
  onToggleTrend, onAction, renderRoomData }: {
  rooms: BilibiliLiveRoomV2[]
  state: ReturnType<typeof useLiveMonitorPanel>
  selectedTrendIds: string[]
  busyRoomIds: string[]
  roomActionErrors: Record<string, string | undefined>
  onToggleTrend: (id: string) => void
  onAction: BilibiliLiveWorkspacePresentationProps["onRoomAction"]
  renderRoomData: ((room: BilibiliLiveRoomV2) => ReactNode) | undefined
}) {
  const room = rooms.find(item => item.id === state.expandedId)
  return <div className="live-monitor-panel">
    <div className="live-monitor-strip-heading"><h2>监控直播间</h2><span>{rooms.length} 个房间 · {selectedTrendIds.length}/4 已选趋势</span></div>
    <div className="live-monitor-strip" aria-label="监控直播间横向列表">
      {rooms.map(item => <LiveRoomTile key={item.id} room={item} now={state.now} expanded={item.id === state.expandedId}
        selected={selectedTrendIds.includes(item.id)} locked={!selectedTrendIds.includes(item.id) && selectedTrendIds.length >= 4}
        busy={busyRoomIds.includes(item.id)} onExpand={() => state.setExpandedId(current => current === item.id ? undefined : item.id)}
        onToggleTrend={() => onToggleTrend(item.id)} />)}
    </div>
    {room && <LiveRoomDetail key={room.id} room={room} now={state.now} draft={state.drafts[room.id] ?? room.intervalSeconds}
      dirty={state.isDirty(room)}
      busy={busyRoomIds.includes(room.id)} actionError={roomActionErrors[room.id]} onAction={onAction}
      onEdit={value => state.editInterval(room, value)} onSaved={value => state.markSaved(room.id, value)}
      onDeleted={() => state.setExpandedId(current => current === room.id ? undefined : current)} />}
    {room && renderRoomData && <section className="live-room-data-detail" aria-label={`${room.uname}直播数据`}>
      <h2>{room.uname} · 直播数据</h2>{renderRoomData(room)}
    </section>}
  </div>
}

function LiveRoomTile({ room, now, expanded, selected, locked, busy, onExpand, onToggleTrend }: {
  room: BilibiliLiveRoomV2; now: number; expanded: boolean; selected: boolean; locked: boolean; busy: boolean
  onExpand: () => void; onToggleTrend: () => void
}) {
  const status = liveMonitorStatus(room), schedule = liveCollectionSchedule(room, now)
  return <article className={`live-room-card live-monitor-tile is-${status.tone}${expanded ? " is-expanded" : ""}${selected ? " is-selected" : ""}`} aria-busy={busy}>
    <button className="live-monitor-expand" type="button" aria-expanded={expanded} aria-controls={`live-detail-${room.id}`}
      aria-label={`${expanded ? "收起" : "展开"}${room.uname}的详情`} onClick={onExpand}>
      <div className="live-monitor-identity">
        <div className="live-monitor-avatar"><span>{room.uname ? room.uname.slice(0, 1).toUpperCase() : room.uid.slice(-2)}</span>
          {room.faceUrl && <img key={room.faceUrl} src={room.faceUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</div>
        <div><h3 title={room.uname}>{room.uname}</h3><span>UID {room.uid} · 房间 {room.roomId}</span></div>
        <ChevronDown size={17} aria-hidden="true" />
      </div>
      <div className="live-monitor-tile-title"><span title={room.title || "未获取到房间标题"}>{room.title || "未获取到房间标题"}</span><span className={`live-monitor-status is-${status.tone}`}>{status.label}</span></div>
      <div className="live-monitor-metrics"><div><span>在线/热度</span><strong title={room.onlineCount}>{formatLiveShortCount(room.onlineCount)}</strong></div>
        <div><span>变化</span><strong title={room.onlineDelta} aria-label={room.onlineDelta === undefined ? undefined : `变化 ${room.onlineDelta}`}>{formatLiveDelta(room.onlineDelta)}</strong></div></div>
      <span className="live-monitor-next">{schedule.brief}</span>
    </button>
    <div className="live-monitor-rhythm" role="progressbar" aria-label={`${room.uname}采集节奏`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(schedule.progress)} aria-valuetext={schedule.brief}><span style={{ width: `${schedule.progress}%` }} /></div>
    <div className="live-monitor-tile-actions"><a href={`https://live.bilibili.com/${room.roomId}`} target="_blank" rel="noreferrer" aria-label={`打开${room.uname}的直播间`}><ExternalLink size={15} />打开直播间</a>
      <button type="button" aria-pressed={selected} disabled={locked} onClick={onToggleTrend}><TrendingUp size={15} />{selected ? "已选趋势" : locked ? "趋势已满" : "加入趋势"}</button></div>
  </article>
}

function LiveRoomDetail({ room, now, draft, dirty, busy, actionError, onAction, onEdit, onSaved, onDeleted }: {
  room: BilibiliLiveRoomV2; now: number; draft: number; dirty: boolean; busy: boolean; actionError: string | undefined
  onAction: BilibiliLiveWorkspacePresentationProps["onRoomAction"]; onEdit: (value: number) => void; onSaved: (value: number) => void; onDeleted: () => void
}) {
  const status = liveMonitorStatus(room)
  const preview = room.keyframeUrl || room.coverUrl
  const facts = [
    ["在线/热度", formatLiveShortCount(room.onlineCount)], ["关注数", formatLiveShortCount(room.attentionCount)],
    ["开播时间", formatLiveDateTime(room.liveTime)], ["开播时长", liveDurationText(room, now)],
    ["最后成功", formatLiveDateTime(room.lastSuccessAt)], ["下次采集", room.monitorStatus === "PAUSED" ? "已停用" : formatLiveDateTime(room.nextCollectAt)],
    ["来源接口", room.sourceEndpoint || "—"], ["退避到期", formatLiveDateTime(room.backoffUntil)]
  ]
  const save = async () => { await onAction("interval", room, draft, () => onSaved(draft)) }
  const remove = async () => {
    if (window.confirm(`删除 ${room.uname} 的直播间监控？关联的历史快照、状态事件与场次数据也会删除。`)) {
      await onAction("delete", room, undefined, onDeleted)
    }
  }
  return <section className="live-monitor-detail" id={`live-detail-${room.id}`} aria-label={`${room.uname}房间详情`} aria-busy={busy}>
    <header className="live-monitor-detail-heading">
      <div className="live-monitor-preview"><div><Radio size={24} /><span>暂无封面</span></div>
        {preview && <img key={preview} src={preview} alt={room.title || room.uname} referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}
        <span className={`live-monitor-status is-${status.tone}`}>{status.label}</span></div>
      <div className="live-monitor-detail-copy"><h2>{room.uname} · 房间 {room.roomId}</h2><p>{room.title || "未获取到房间标题"}</p>
        <div><span>UID {room.uid}</span><span>房间 {room.roomId}</span>{room.shortId && <span>短号 {room.shortId}</span>}
          <span>{[room.parentAreaName, room.areaName].filter(Boolean).join(" / ") || "—"}</span></div></div>
    </header>
    <div className="live-monitor-detail-actions"><a href={`https://live.bilibili.com/${room.roomId}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />打开直播间</a>
      <button type="button" disabled={busy} onClick={() => void onAction("refresh", room)}><RefreshCcw size={15} />立即刷新</button>
      <button type="button" disabled={busy} onClick={() => void onAction("toggle", room)}>{room.monitorStatus === "ACTIVE" ? <Pause size={15} /> : <Play size={15} />}{room.monitorStatus === "ACTIVE" ? "暂停监控" : "恢复监控"}</button>
      <button type="button" disabled={busy} className="is-danger" onClick={remove}><Trash2 size={15} />删除</button>
    </div>
    {room.lastErrorType && <p className="live-monitor-error">{room.lastErrorType}: {room.lastErrorMessage || "采集失败"}</p>}
    {actionError && <p className="inline-error" role="alert">{actionError}</p>}
    {busy && <p role="status">正在处理，请稍候…</p>}
    <dl className="live-monitor-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={label === "关注数" ? room.attentionCount : label === "在线/热度" ? room.onlineCount : value}>{value}</dd></div>)}</dl>
    <div className="live-monitor-detail-bottom"><div className="live-monitor-interval">
      <label htmlFor={`interval-${room.id}`}>{dirty ? "采集间隔（未保存）" : "采集间隔"}</label>
      <input id={`interval-${room.id}`} type="text" inputMode="numeric" role="spinbutton" aria-valuemin={1} aria-valuemax={2_592_000}
        aria-valuenow={draft} value={draft} disabled={busy}
        onKeyDown={event => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
          event.preventDefault()
          // Explicit spinbutton semantics avoid native min-based steps and wheel edits.
          onEdit(draft + (event.key === "ArrowUp" ? 1 : -1) * liveIntervalStep(draft))
        }}
        onChange={event => onEdit(Number(event.target.value))} /><span>秒</span>
      <button type="button" disabled={busy || !dirty} onClick={() => void save()}>{dirty ? "保存修改" : "已保存"}</button>
    </div><div className="live-monitor-health" aria-label="数据完整性"><span>数据完整性</span><div>{liveFieldHealth(room).map(item =>
      <span key={item.label} className={item.ok ? "is-present" : "is-missing"}>{item.label}{item.ok ? "" : "缺失"}</span>)}</div></div></div>
  </section>
}
