import type {
  AddBilibiliLiveRoomInput,
  BilibiliLiveRoom,
  BilibiliLiveRoomList,
  BilibiliLiveRoomTrend,
  BilibiliLiveRankSummary,
  BilibiliLiveDanmakuMetricBucket,
  BilibiliLiveDanmakuRecent,
  BilibiliLiveDanmakuStatus,
  BilibiliLiveSessionEventPage,
  BilibiliLiveSessionExportCategory,
  BilibiliLiveSessionInsight,
  BilibiliLiveSessionSummary,
  BilibiliLiveSessionUser,
  BilibiliLiveStatusEvent,
  BilibiliLiveSummary,
  DesktopBridge,
  QueryBilibiliLiveSessionEventsInput
} from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  Clock3,
  Crown,
  Download,
  ExternalLink,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCcw,
  Trash2,
  TrendingUp,
  UsersRound,
  X
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from "react"

export type BilibiliLiveView =
  | "直播间"
  | "趋势对比"
  | "状态事件"
  | "实时弹幕"
  | "观众榜单"
  | "直播场次"
  | "数据中心"
  | "场次分析"
export type BilibiliLiveRoomAction = "refresh" | "toggle" | "interval" | "delete"

export interface BilibiliLiveWorkspacePresentationProps {
  view: BilibiliLiveView
  creationOpen: boolean
  rooms: BilibiliLiveRoom[]
  summary?: BilibiliLiveSummary
  events: BilibiliLiveStatusEvent[]
  trends: BilibiliLiveRoomTrend[]
  rankSummary?: BilibiliLiveRankSummary
  danmakuStatus?: BilibiliLiveDanmakuStatus
  danmakuRecent?: BilibiliLiveDanmakuRecent[]
  danmakuMetrics?: BilibiliLiveDanmakuMetricBucket[]
  sessions?: BilibiliLiveSessionSummary[]
  sessionUsers?: BilibiliLiveSessionUser[]
  sessionEvents?: BilibiliLiveSessionEventPage
  sessionInsight?: BilibiliLiveSessionInsight
  sessionEventFilters?: QueryBilibiliLiveSessionEventsInput
  selectedTrendIds?: string[]
  selectedRankRoomId?: string
  selectedDanmakuRoomId?: string
  selectedSessionRoomId?: string
  selectedSessionId?: string
  insightBucketSeconds?: 60 | 300 | 900
  rankPending?: boolean
  danmakuPending?: boolean
  sessionPending?: boolean
  exportPending?: boolean
  exportMessage?: string
  rankErrors?: string[]
  pending: boolean
  errorMessage?: string
  busyRoomIds?: string[]
  roomActionErrors?: Record<string, string | undefined>
  refreshing?: boolean
  onReload?: () => Promise<void>
  trendPending?: boolean
  trendError?: string
  onReloadTrends?: () => Promise<unknown>
  onAdd: (input: AddBilibiliLiveRoomInput) => Promise<void>
  onRoomAction: (
    action: BilibiliLiveRoomAction,
    room: BilibiliLiveRoom,
    intervalSeconds?: number
  ) => Promise<void>
  onCloseCreation: () => void
  onTrendSelectionChange: (ids: string[]) => void
  onRankRoomChange?: (roomMonitorId: string) => void
  onRankRefresh?: (roomMonitorId: string) => Promise<void>
  onDanmakuRoomChange?: (roomMonitorId: string) => void
  onDanmakuStart?: (roomMonitorId: string, protocolVersion?: number) => Promise<void>
  onDanmakuStop?: (roomMonitorId: string) => Promise<void>
  onSessionRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
  onSessionEventFiltersChange?: (filters: QueryBilibiliLiveSessionEventsInput) => void
  onInsightBucketChange?: (bucketSeconds: 60 | 300 | 900) => void
  onSessionExport?: (
    sessionId: string,
    category: BilibiliLiveSessionExportCategory
  ) => Promise<void>
}

export function BilibiliLiveWorkspacePresentation({
  view,
  creationOpen,
  rooms,
  summary,
  events,
  trends,
  rankSummary,
  danmakuStatus,
  danmakuRecent = [],
  danmakuMetrics = [],
  sessions = [],
  sessionUsers = [],
  sessionEvents,
  sessionInsight,
  sessionEventFilters,
  selectedTrendIds = [],
  selectedRankRoomId,
  selectedDanmakuRoomId,
  selectedSessionRoomId,
  selectedSessionId,
  insightBucketSeconds = 300,
  rankPending = false,
  danmakuPending = false,
  sessionPending = false,
  exportPending = false,
  exportMessage,
  rankErrors = [],
  pending,
  errorMessage,
  busyRoomIds = [],
  roomActionErrors = {},
  refreshing = false,
  onReload,
  trendPending = false,
  trendError,
  onReloadTrends,
  onAdd,
  onRoomAction,
  onCloseCreation,
  onTrendSelectionChange,
  onRankRoomChange,
  onRankRefresh,
  onDanmakuRoomChange,
  onDanmakuStart,
  onDanmakuStop,
  onSessionRoomChange,
  onSessionChange,
  onSessionEventFiltersChange,
  onInsightBucketChange,
  onSessionExport
}: BilibiliLiveWorkspacePresentationProps): JSX.Element {
  const [addMode, setAddMode] = useState<"roomId" | "uid">("roomId")
  const [identifier, setIdentifier] = useState("")
  const [interval, setIntervalValue] = useState("300")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string>()

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const value = identifier.trim()
    const seconds = Number(interval)
    if (!/^[1-9]\d*$/.test(value)) {
      setFormError(`请输入有效${addMode === "roomId" ? "房间号" : "UID"}。`)
      return
    }
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 2_592_000) {
      setFormError("采集间隔必须是 1 到 2592000 秒的整数。")
      return
    }
    setSubmitting(true)
    setFormError(undefined)
    try {
      await onAdd({ [addMode]: value, intervalSeconds: seconds })
      setIdentifier("")
      onCloseCreation()
    } catch (error) {
      setFormError(errorMessageOf(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="live-workspace" aria-label="B站直播间监控">
      {creationOpen && (
        <form className="live-add-panel" onSubmit={(event) => void submit(event)}>
          <div className="live-panel-heading">
            <div>
              <span>ORIGINAL BILIMONITOR FLOW</span>
              <h2>添加直播间监控</h2>
              <p>按原业务填写房间号或主播 UID，二选一；房间号会先解析为真实长房间号。</p>
            </div>
            <button type="button" className="icon-button" onClick={onCloseCreation} aria-label="关闭添加直播间">
              <X size={16} />
            </button>
          </div>
          <div className="live-add-grid">
            <label>
              <span>添加类型</span>
              <select value={addMode} onChange={(event) => setAddMode(event.target.value as "roomId" | "uid")}>
                <option value="roomId">房间号</option>
                <option value="uid">主播 UID</option>
              </select>
            </label>
            <label>
              <span>{addMode === "roomId" ? "房间号" : "主播 UID"}</span>
              <input
                value={identifier}
                inputMode="numeric"
                placeholder={addMode === "roomId" ? "例如 6 或 21987615" : "例如 672328094"}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>
            <label>
              <span>采集间隔（秒）</span>
              <input
                type="number"
                min={1}
                max={2_592_000}
                value={interval}
                onChange={(event) => setIntervalValue(event.target.value)}
              />
            </label>
            <button type="submit" className="button button-primary live-add-submit" disabled={submitting}>
              <Plus size={16} />{submitting ? "正在解析并添加" : "添加监控"}
            </button>
          </div>
          {Number(interval) < 120 && Number(interval) > 0 && (
            <p className="inline-warning">短间隔会增加 B站接口请求频率，请确认确有需要。</p>
          )}
          {formError && <p className="inline-error" role="alert">{formError}</p>}
        </form>
      )}

      {errorMessage && <div className="business-error" role="alert">{errorMessage}</div>}
      {onReload && (
        <div className="live-data-toolbar">
          <span>自动同步本地采集结果；立即采集请使用房间内的“立即刷新”。</span>
          <button type="button" className="button" disabled={refreshing} onClick={() => void onReload()}>
            <RefreshCcw size={15} />刷新监控数据
          </button>
        </div>
      )}
      <LiveSummary summary={summary} rooms={rooms} />

      {view === "直播间" && (
        pending
          ? <LiveState title="正在读取直播间监控" detail="从 Local Core 的 SQLite v6 读取真实房间投影。" />
          : rooms.length === 0
            ? <LiveState title="尚未监控直播间" detail="点击“添加直播间”后，应用会立即请求 B站公开直播接口并保存首个快照。" />
            : <div className="live-room-grid">
                {rooms.map((room) => (
                  <LiveRoomCard
                    key={room.id}
                    room={room}
                    busy={busyRoomIds.includes(room.id)}
                    actionError={roomActionErrors[room.id]}
                    trendSelected={selectedTrendIds.includes(room.id)}
                    trendLocked={!selectedTrendIds.includes(room.id) && selectedTrendIds.length >= 4}
                    onToggleTrend={() => onTrendSelectionChange(toggleTrendId(selectedTrendIds, room.id))}
                    onAction={onRoomAction}
                  />
                ))}
              </div>
      )}

      {view === "趋势对比" && (
        <LiveTrendView
          rooms={rooms}
          trends={trends}
          selectedIds={selectedTrendIds}
          pending={trendPending}
          errorMessage={trendError}
          onReload={onReloadTrends}
          onSelectionChange={onTrendSelectionChange}
        />
      )}

      {view === "状态事件" && <LiveEvents events={events} />}

      {view === "实时弹幕" && (
        <LiveDanmakuView
          rooms={rooms}
          status={danmakuStatus}
          recent={danmakuRecent}
          metrics={danmakuMetrics}
          selectedRoomId={selectedDanmakuRoomId}
          pending={danmakuPending}
          onRoomChange={onDanmakuRoomChange}
          onStart={onDanmakuStart}
          onStop={onDanmakuStop}
        />
      )}

      {view === "观众榜单" && (
        <LiveRankView
          rooms={rooms}
          summary={rankSummary}
          selectedRoomId={selectedRankRoomId}
          pending={rankPending}
          errors={rankErrors}
          onRoomChange={onRankRoomChange}
          onRefresh={onRankRefresh}
        />
      )}

      {view === "直播场次" && (
        <LiveSessionBoundaryView
          rooms={rooms}
          sessions={sessions}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          pending={sessionPending}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
        />
      )}

      {view === "数据中心" && (
        <LiveSessionDataView
          rooms={rooms}
          sessions={sessions}
          users={sessionUsers}
          events={sessionEvents}
          filters={sessionEventFilters}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          pending={sessionPending}
          exportPending={exportPending}
          exportMessage={exportMessage}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
          onFiltersChange={onSessionEventFiltersChange}
          onExport={onSessionExport}
        />
      )}

      {view === "场次分析" && (
        <LiveSessionInsightView
          rooms={rooms}
          sessions={sessions}
          insight={sessionInsight}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          bucketSeconds={insightBucketSeconds}
          pending={sessionPending}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
          onBucketChange={onInsightBucketChange}
        />
      )}
    </section>
  )
}

function LiveSummary({ summary, rooms }: { summary?: BilibiliLiveSummary; rooms: BilibiliLiveRoom[] }): JSX.Element {
  const fallbackLive = rooms.filter((room) => room.liveStatus === 1)
  const values = [
    ["直播中", summary?.liveRooms ?? fallbackLive.length, Radio],
    ["总热度", formatCount(summary?.totalOnlineCount ?? fallbackLive.reduce((sum, room) => sum + (room.onlineCount ?? 0), 0)), UsersRound],
    ["今日开播", summary?.todayLiveStarts ?? 0, TrendingUp],
    ["采集异常", summary?.errorRooms ?? rooms.filter((room) => room.lastErrorType).length, Activity]
  ] as const
  return (
    <div className="live-summary-grid">
      {values.map(([label, value, Icon]) => (
        <article className="live-summary-card" key={label}>
          <Icon size={17} />
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  )
}

function LiveRoomCard({
  room,
  busy,
  actionError,
  trendSelected,
  trendLocked,
  onToggleTrend,
  onAction
}: {
  room: BilibiliLiveRoom
  busy: boolean
  actionError?: string
  trendSelected: boolean
  trendLocked: boolean
  onToggleTrend: () => void
  onAction: BilibiliLiveWorkspacePresentationProps["onRoomAction"]
}): JSX.Element {
  const [intervalDraft, setIntervalDraft] = useState<string>()
  const interval = intervalDraft ?? String(room.intervalSeconds)
  useEffect(() => {
    if (intervalDraft !== undefined && Number(intervalDraft) === room.intervalSeconds) setIntervalDraft(undefined)
  }, [intervalDraft, room.intervalSeconds])
  const status = liveStatus(room.liveStatus)
  const deleteRoom = (): void => {
    if (typeof window === "undefined" || window.confirm(`删除 ${room.uname} 的直播间监控？历史快照与状态事件也会删除。`)) {
      void onAction("delete", room)
    }
  }
  return (
    <article className={`live-room-card live-status-${room.liveStatus}`} aria-busy={busy}>
      <div className="live-room-cover">
        {room.keyframeUrl || room.coverUrl
          ? <img src={room.keyframeUrl ?? room.coverUrl} alt="" referrerPolicy="no-referrer" />
          : <div className="live-cover-placeholder"><Radio size={24} /><span>ROOM {room.roomId}</span></div>}
        <span className={`live-status-badge is-${status.tone}`}>{status.label}</span>
      </div>
      <div className="live-room-body">
        <div className="live-room-owner">
          {room.faceUrl ? <img src={room.faceUrl} alt="" referrerPolicy="no-referrer" /> : <span>{room.uname.slice(0, 1)}</span>}
          <div>
            <h3>{room.uname}</h3>
            <p>UID {room.uid} · 房间 {room.roomId}{room.shortId ? ` / 短号 ${room.shortId}` : ""}</p>
          </div>
          <a href={`https://live.bilibili.com/${room.roomId}`} target="_blank" rel="noreferrer" aria-label="打开 B站直播间">
            <ExternalLink size={15} />
          </a>
        </div>
        <h4>{room.title ?? "暂无直播标题"}</h4>
        <p className="live-area">{[room.parentAreaName, room.areaName].filter(Boolean).join(" / ") || "分区未知"}</p>
        <div className="live-room-metrics">
          <span><small>当前热度</small><strong>{formatCount(room.onlineCount)}</strong></span>
          <span><small>关注</small><strong>{formatCount(room.attentionCount)}</strong></span>
          <span><small>较上次</small><strong>{formatDelta(room.onlineDelta)}</strong></span>
        </div>
        <div className="live-room-timing">
          <span><Clock3 size={13} />上次成功 {formatTime(room.lastSuccessAt)}</span>
          <span><Clock3 size={13} />下次采集 {room.monitorStatus === "PAUSED" ? "已暂停" : formatTime(room.nextCollectAt)}</span>
          <span><Activity size={13} />来源 {room.sourceEndpoint ?? "尚无"}</span>
        </div>
        {room.lastErrorMessage && (
          <div className="live-room-error">
            <strong>{room.lastErrorType ?? "采集异常"}</strong>
            <span>{room.lastErrorMessage}</span>
            {room.backoffUntil && <small>回退至 {formatTime(room.backoffUntil)}</small>}
          </div>
        )}
        {actionError && <p className="inline-error" role="alert">{actionError}</p>}
        {busy && <p className="live-action-progress" role="status">正在处理，请稍候…</p>}
        <div className="live-room-actions">
          <button type="button" disabled={busy} onClick={() => void onAction("refresh", room)}><RefreshCcw size={14} />立即刷新</button>
          <button type="button" disabled={busy} onClick={() => void onAction("toggle", room)}>
            {room.monitorStatus === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
            {room.monitorStatus === "ACTIVE" ? "暂停监控" : "恢复监控"}
          </button>
          <button type="button" className={trendSelected ? "is-selected" : ""} disabled={trendLocked} onClick={onToggleTrend}>
            <TrendingUp size={14} />{trendSelected ? "已选趋势" : trendLocked ? "趋势已满" : "加入趋势"}
          </button>
          <button type="button" className="danger-button" disabled={busy} onClick={deleteRoom}><Trash2 size={14} />删除</button>
        </div>
        <div className="live-interval-editor">
          <label htmlFor={`interval-${room.id}`}>采集间隔</label>
          <input
            id={`interval-${room.id}`}
            type="number"
            min={1}
            max={2_592_000}
            value={interval}
            disabled={busy}
            onChange={(event) => setIntervalDraft(event.target.value)}
          />
          <span>秒</span>
          <button
            type="button"
            disabled={busy || !Number.isInteger(Number(interval)) || Number(interval) < 1 || Number(interval) > 2_592_000 || Number(interval) === room.intervalSeconds}
            onClick={() => void onAction("interval", room, Number(interval))}
          >保存</button>
        </div>
      </div>
    </article>
  )
}

function LiveTrendView({
  rooms,
  trends,
  selectedIds,
  pending,
  errorMessage,
  onReload,
  onSelectionChange
}: {
  rooms: BilibiliLiveRoom[]
  trends: BilibiliLiveRoomTrend[]
  selectedIds: string[]
  pending: boolean
  errorMessage?: string
  onReload?: () => Promise<unknown>
  onSelectionChange: (ids: string[]) => void
}): JSX.Element {
  return (
    <div className="live-trend-panel">
      <header>
        <div><span>LIVE HISTORY</span><h2>在线趋势对比</h2></div>
        <small>最多选择 4 个直播间</small>
      </header>
      <div className="live-trend-selector">
        {rooms.map((room) => (
          <label key={room.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(room.id)}
              disabled={!selectedIds.includes(room.id) && selectedIds.length >= 4}
              onChange={() => onSelectionChange(toggleTrendId(selectedIds, room.id))}
            />
            <span>{room.uname}</span>
          </label>
        ))}
      </div>
      {errorMessage && selectedIds.length > 0 && (
        <div className="business-error" role="alert">
          <span>{errorMessage}{trends.length > 0 ? "；以下保留上次成功读取的数据。" : ""}</span>
          {onReload && <button type="button" className="button" disabled={pending} onClick={() => void onReload()}>重试趋势查询</button>}
        </div>
      )}
      {pending && selectedIds.length > 0 && <p role="status">正在读取趋势…</p>}
      {selectedIds.length === 0
        ? <LiveState title="尚未选择直播间" detail="选择直播间后查看 SQLite 快照形成的真实在线趋势。" />
        : trends.filter((trend) => selectedIds.includes(trend.room.id)).map((trend) => (
            <article className="live-chart-card" key={trend.room.id}>
              <div><strong>{trend.room.uname}</strong><span>房间 {trend.room.roomId} · {trend.points.length} 个快照</span></div>
              <LiveTrendChart trend={trend} />
            </article>
          ))}
    </div>
  )
}

function LiveTrendChart({ trend }: { trend: BilibiliLiveRoomTrend }): JSX.Element {
  const points = [...trend.points].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
  const first = points[0]
  const last = points.at(-1)
  const values = points.flatMap((point) => point.onlineCount === undefined ? [] : [point.onlineCount])
  if (!first || !last || values.length === 0) return <p>尚无可用热度快照。</p>
  const min = Math.min(...values)
  const range = Math.max(1, Math.max(...values) - min)
  const from = Date.parse(first.capturedAt)
  const duration = Math.max(1, Date.parse(last.capturedAt) - from)
  const coordinates = points.map((point) => point.onlineCount === undefined ? undefined : {
    x: 20 + ((Date.parse(point.capturedAt) - from) / duration) * 680,
    y: 160 - ((point.onlineCount - min) / range) * 140,
    point
  })
  const path = coordinates.map((coordinate, index) => coordinate
    ? `${coordinates[index - 1] ? "L" : "M"}${coordinate.x.toFixed(1)},${coordinate.y.toFixed(1)}`
    : "").join(" ")
  return <>
    <svg viewBox="0 0 720 180" role="img" aria-label={`${trend.room.uname} 在线趋势`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" />
      {coordinates.map((coordinate, index) => coordinate && (
        <circle key={`${coordinate.point.capturedAt}-${index}`} cx={coordinate.x} cy={coordinate.y} r="4" fill="currentColor">
          <title>{formatTime(coordinate.point.capturedAt)} · 热度 {formatCount(coordinate.point.onlineCount)}</title>
        </circle>
      ))}
    </svg>
    <div className="live-chart-time-range"><time>{formatTime(first.capturedAt)}</time><time>{formatTime(last.capturedAt)}</time></div>
    {values.length === 1 && <p>仅有 1 个有效采样点，等待后续采集。</p>}
  </>
}

function LiveEvents({ events }: { events: BilibiliLiveStatusEvent[] }): JSX.Element {
  if (events.length === 0) return <LiveState title="暂无状态事件" detail="开播、下播、轮播、标题变化、错误与恢复会在真实变化后写入。" />
  return (
    <div className="live-event-panel">
      <header><span>STATUS EVENTS</span><h2>最近状态事件</h2></header>
      <div className="live-event-list">
        {events.map((event) => (
          <article key={event.id}>
            <i className={`event-${event.eventType.toLowerCase()}`} />
            <div>
              <strong>{eventLabel(event.eventType)}</strong>
              <span>UID {event.uid} · 房间 {event.roomId}</span>
              {event.titleBefore !== event.titleAfter && event.titleAfter && (
                <small>{event.titleBefore ?? "无标题"} → {event.titleAfter}</small>
              )}
            </div>
            <time>{formatTime(event.occurredAt)}</time>
          </article>
        ))}
      </div>
    </div>
  )
}

function LiveDanmakuView({
  rooms,
  status,
  recent,
  metrics,
  selectedRoomId,
  pending,
  onRoomChange,
  onStart,
  onStop
}: {
  rooms: BilibiliLiveRoom[]
  status?: BilibiliLiveDanmakuStatus
  recent: BilibiliLiveDanmakuRecent[]
  metrics: BilibiliLiveDanmakuMetricBucket[]
  selectedRoomId?: string
  pending: boolean
  onRoomChange?: (roomMonitorId: string) => void
  onStart?: (roomMonitorId: string, protocolVersion?: number) => Promise<void>
  onStop?: (roomMonitorId: string) => Promise<void>
}): JSX.Element {
  const [protocolVersion, setProtocolVersion] = useState(-1)
  if (rooms.length === 0) {
    return <LiveState title="尚无可监听的直播间" detail="请先添加真实直播间监控，再建立 B站弹幕 WebSocket。" />
  }
  const selected = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]
  if (!selected) return <LiveState title="尚无直播间" detail="请先添加真实直播间监控。" />
  const connected = status?.running === true && status.status === "CONNECTED"
  return (
    <section className="live-danmaku-panel" aria-label="实时弹幕监听">
      <header className="live-danmaku-header">
        <div>
          <span>ORIGINAL DANMAKU WEBSOCKET</span>
          <h2>实时弹幕监听</h2>
          <p>按原项目通过 getDanmuInfo、WebSocket 鉴权与心跳采集；页面只展示已落入 SQLite 的消息和指标。</p>
        </div>
        <div className="live-danmaku-controls">
          <label>
            <span>直播间</span>
            <select value={selected.id} onChange={(event) => onRoomChange?.(event.target.value)}>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.uname} · {room.roomId}</option>
              ))}
            </select>
          </label>
          <label>
            <span>协议</span>
            <select
              value={protocolVersion}
              onChange={(event) => setProtocolVersion(Number(event.target.value))}
            >
              <option value={-1}>自动兼容</option>
              <option value={3}>protover=3</option>
              <option value={2}>protover=2</option>
              <option value={1}>protover=1</option>
              <option value={0}>protover=0</option>
            </select>
          </label>
          {connected
            ? (
                <button
                  type="button"
                  className="button"
                  disabled={pending}
                  onClick={() => void onStop?.(selected.id)}
                ><Pause size={15} />{pending ? "正在停止" : "停止弹幕监控"}</button>
              )
            : (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={pending}
                  onClick={() => void onStart?.(
                    selected.id,
                    protocolVersion < 0 ? undefined : protocolVersion
                  )}
                ><Play size={15} />{pending ? "正在连接" : "开启弹幕监控"}</button>
              )}
        </div>
      </header>

      <div className="live-danmaku-status-line">
        <span className={`live-danmaku-state state-${(status?.status ?? "NOT_STARTED").toLowerCase()}`}>
          {danmakuStatusLabel(status)}
        </span>
        <span>{status?.authMode === "LOGIN" ? `登录态 UID ${status.authUid ?? "未识别"}` : "匿名连接"}</span>
        <span>{status?.protocolVersion === undefined ? "协议待协商" : `protover=${status.protocolVersion}`}</span>
        <span>{status?.connectHost ?? "尚未建立连接"}</span>
      </div>

      <div className="live-danmaku-metrics">
        <span><small>最近 5 分钟弹幕</small><strong>{formatCount(status?.last5MinutesCount)}</strong></span>
        <span><small>每分钟弹幕</small><strong>{formatCount(status?.ratePerMinute)}</strong></span>
        <span><small>点赞增量</small><strong>{formatDelta(status?.likeIncrement)}</strong></span>
        <span><small>看过人数</small><strong>{formatCount(status?.watchedCount)}</strong></span>
        <span><small>心跳人气</small><strong>{formatCount(status?.heartbeatPopularity)}</strong></span>
      </div>

      {status?.lastErrorMessage && (
        <div className="live-danmaku-error" role="alert">
          <strong>{status.lastErrorType ?? "弹幕连接异常"}</strong>
          <span>{status.lastErrorMessage}</span>
        </div>
      )}

      <div className="live-danmaku-content">
        <section className="live-danmaku-stream">
          <header><strong>最近弹幕</strong><span>{recent.length} 条</span></header>
          {recent.length === 0
            ? <LiveState title={connected ? "等待直播间弹幕" : "尚未监听"} detail={connected ? "连接已经建立，新弹幕会在持久化后出现在这里。" : "点击开启弹幕监控建立真实 WebSocket。"} />
            : (
                <div className="live-danmaku-list">
                  {recent.map((message, index) => (
                    <article key={`${message.sentAt}:${index}:${message.messageText}`}>
                      <div>
                        <strong>{message.displayName ?? "游客"}</strong>
                        <span>{message.senderUid ? `UID ${message.senderUid}` : "UID 未解析"}</span>
                        {message.medalName && <em>{message.medalName}</em>}
                      </div>
                      <p>{message.messageText}</p>
                      <time>{formatTime(message.sentAt)}</time>
                    </article>
                  ))}
                </div>
              )}
        </section>
        <aside className="live-danmaku-buckets">
          <header><strong>分钟指标桶</strong><span>最近 1 小时</span></header>
          {metrics.length === 0
            ? <p>暂无已保存指标桶</p>
            : metrics.slice(-12).map((bucket) => (
                <div key={`${bucket.bucketStart}:${bucket.bucketSeconds}`}>
                  <time>{new Date(bucket.bucketStart).toLocaleTimeString("zh-CN", { hour12: false })}</time>
                  <span>弹幕 {bucket.danmuCount}</span>
                  <span>事件 {bucket.rawEventCount}</span>
                </div>
              ))}
        </aside>
      </div>
    </section>
  )
}

function LiveRankView({
  rooms,
  summary,
  selectedRoomId,
  pending,
  errors,
  onRoomChange,
  onRefresh
}: {
  rooms: BilibiliLiveRoom[]
  summary?: BilibiliLiveRankSummary
  selectedRoomId?: string
  pending: boolean
  errors: string[]
  onRoomChange?: (roomMonitorId: string) => void
  onRefresh?: (roomMonitorId: string) => Promise<void>
}): JSX.Element {
  if (rooms.length === 0) {
    return <LiveState title="尚无可采集榜单的直播间" detail="请先添加真实直播间监控。" />
  }
  const selected = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]
  if (!selected) return <LiveState title="尚无直播间" detail="请先添加真实直播间监控。" />
  return (
    <section className="live-rank-panel" aria-label="直播间观众榜单">
      <header className="live-rank-header">
        <div>
          <span>ORIGINAL LIVE RANKS</span>
          <h2>观众榜单与大航海榜</h2>
          <p>读取最近一次已保存快照；手动刷新会按原项目依次采集 8 类榜单。</p>
        </div>
        <div className="live-rank-controls">
          <label>
            <span>直播间</span>
            <select
              value={selected.id}
              onChange={(event) => onRoomChange?.(event.target.value)}
            >
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.uname} · {room.roomId}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="button button-primary"
            disabled={pending}
            onClick={() => void onRefresh?.(selected.id)}
          ><RefreshCcw size={15} />{pending ? "正在采集" : "刷新全部榜单"}</button>
        </div>
      </header>
      <div className="live-rank-summary">
        <span><small>观众榜人数</small><strong>{formatCount(summary?.audienceCount)}</strong></span>
        <span><small>大航海人数</small><strong>{formatCount(summary?.guardCount)}</strong></span>
        <span><small>最近更新</small><strong>{formatTime(summary?.updatedAt)}</strong></span>
      </div>
      {errors.length > 0 && (
        <div className="live-rank-errors" role="alert">
          <strong>部分榜单采集失败</strong>
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}
      {pending && !summary
        ? <LiveState title="正在采集榜单" detail="按原项目顺序执行在线、进房、日/周/月和大航海榜请求。" />
        : !summary || summary.snapshots.length === 0
          ? <LiveState title="暂无榜单快照" detail="点击“刷新全部榜单”后才会写入真实平台结果，不展示示例排行。" />
          : <div className="live-rank-grid">
              {summary.snapshots.map((snapshot) => (
                <article className="live-rank-card" key={`${snapshot.rankFamily}:${snapshot.rankType}:${snapshot.rankSwitch ?? ""}`}>
                  <header>
                    <div><Crown size={16} /><strong>{rankLabel(snapshot.rankType, snapshot.rankSwitch)}</strong></div>
                    <span>{snapshot.countText ?? formatCount(snapshot.totalCount)}</span>
                  </header>
                  {snapshot.remindMsg && <p>{snapshot.remindMsg}</p>}
                  {snapshot.entries.length === 0
                    ? <div className="live-rank-empty">本次快照没有返回榜单条目</div>
                    : <div className="live-rank-table" role="table">
                        {snapshot.entries.map((entry, index) => (
                          <div role="row" key={`${entry.userUid ?? "anonymous"}:${entry.rankNo ?? index}`}>
                            <b>{entry.rankNo ?? index + 1}</b>
                            {entry.faceUrl ? <img src={entry.faceUrl} alt="" referrerPolicy="no-referrer" /> : <i>{(entry.displayName ?? "?").slice(0, 1)}</i>}
                            <span>
                              <strong>{entry.displayName ?? "未公开昵称"}</strong>
                              <small>{entry.userUid ? `UID ${entry.userUid}` : "UID 未解析"}{entry.medalName ? ` · ${entry.medalName} ${entry.medalLevel ?? ""}` : ""}</small>
                            </span>
                            <em>{entry.score !== undefined ? entry.score.toLocaleString("zh-CN") : entry.accompanyDays !== undefined ? `${entry.accompanyDays} 天` : entry.guardLevel !== undefined ? `Lv.${entry.guardLevel}` : "—"}</em>
                          </div>
                        ))}
                      </div>}
                  <footer>{snapshot.sourceEndpoint} · {snapshot.signedRequired ? "WBI 签名" : "公开接口"}</footer>
                </article>
              ))}
            </div>}
    </section>
  )
}

function LiveSessionBoundaryView({
  rooms,
  sessions,
  selectedRoomId,
  selectedSessionId,
  pending,
  onRoomChange,
  onSessionChange
}: {
  rooms: BilibiliLiveRoom[]
  sessions: BilibiliLiveSessionSummary[]
  selectedRoomId?: string
  selectedSessionId?: string
  pending: boolean
  onRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
}): JSX.Element {
  if (rooms.length === 0) {
    return <LiveState title="尚无直播场次来源" detail="请先添加直播间；场次只会来自真实 REST 状态和 WebSocket 边界。" />
  }
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]
  if (!selectedRoom) return <LiveState title="尚无直播间" detail="请先添加真实直播间监控。" />
  return (
    <section className="live-session-panel" aria-label="直播场次边界">
      <header className="live-session-header">
        <div>
          <span>ORIGINAL LIVE SESSION BOUNDARY</span>
          <h2>直播场次边界</h2>
          <p>REST 状态负责确认开播与下播，PREPARING 只进入待确认；历史状态事件会回填为边界场次。</p>
        </div>
        <SessionSelectors
          rooms={rooms}
          sessions={sessions}
          selectedRoomId={selectedRoom.id}
          selectedSessionId={selectedSessionId}
          onRoomChange={onRoomChange}
          onSessionChange={onSessionChange}
          showSession={false}
        />
      </header>
      {pending
        ? <LiveState title="正在读取直播场次" detail="从 SQLite v10 查询场次边界和在线采集覆盖。" />
        : sessions.length === 0
          ? <LiveState title="暂无直播场次" detail="直播状态变化或在线弹幕事实出现后，Local Core 才会创建真实场次。" />
          : (
              <div className="live-session-list">
                {sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    className={session.id === selectedSessionId ? "is-selected" : ""}
                    onClick={() => onSessionChange?.(session.id)}
                  >
                    <div className="live-session-card-title">
                      <span className={`session-state state-${session.state.toLowerCase()}`}>
                        {sessionStateLabel(session.state)}
                      </span>
                      <strong>{formatTime(session.startedAt)}</strong>
                      <em>{coverageLabel(session.coverageStatus)}</em>
                    </div>
                    <p>{formatTime(session.startedAt)} → {session.endedAt ? formatTime(session.endedAt) : "仍在进行"}</p>
                    <div className="live-session-card-metrics">
                      <span><small>弹幕</small><strong>{formatNullableCount(session.danmakuCount)}</strong></span>
                      <span><small>礼物事件</small><strong>{formatNullableCount(session.giftEventCount)}</strong></span>
                      <span><small>付费用户</small><strong>{formatNullableCount(session.paidUserCount)}</strong></span>
                      <span><small>付费金额</small><strong>{formatMilliYuan(session.paidAmountMilliYuan)}</strong></span>
                    </div>
                    <footer>
                      <span>{session.startSource}</span>
                      <span>{session.transportSessionCount} 个 WebSocket 传输会话</span>
                    </footer>
                  </button>
                ))}
              </div>
            )}
    </section>
  )
}

function LiveSessionDataView({
  rooms,
  sessions,
  users,
  events,
  filters,
  selectedRoomId,
  selectedSessionId,
  pending,
  exportPending,
  exportMessage,
  onRoomChange,
  onSessionChange,
  onFiltersChange,
  onExport
}: {
  rooms: BilibiliLiveRoom[]
  sessions: BilibiliLiveSessionSummary[]
  users: BilibiliLiveSessionUser[]
  events?: BilibiliLiveSessionEventPage
  filters?: QueryBilibiliLiveSessionEventsInput
  selectedRoomId?: string
  selectedSessionId?: string
  pending: boolean
  exportPending: boolean
  exportMessage?: string
  onRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
  onFiltersChange?: (filters: QueryBilibiliLiveSessionEventsInput) => void
  onExport?: (sessionId: string, category: BilibiliLiveSessionExportCategory) => Promise<void>
}): JSX.Element {
  if (rooms.length === 0) {
    return <LiveState title="数据中心暂无来源" detail="请先添加直播间并形成真实直播场次。" />
  }
  const roomId = selectedRoomId ?? rooms[0]?.id
  const sessionId = selectedSessionId ?? sessions[0]?.id
  if (!roomId) return <LiveState title="尚无直播间" detail="请先添加真实直播间监控。" />
  const currentFilters: QueryBilibiliLiveSessionEventsInput = {
    sessionId: sessionId ?? "00000000-0000-4000-8000-000000000000",
    page: filters?.page ?? 1,
    size: filters?.size ?? 50,
    ...(filters?.kind ? { kind: filters.kind } : {}),
    ...(filters?.keyword ? { keyword: filters.keyword } : {}),
    ...(filters?.userUid ? { userUid: filters.userUid } : {}),
    ...(filters?.paid === undefined ? {} : { paid: filters.paid })
  }
  return (
    <section className="live-data-panel" aria-label="直播场次数据中心">
      <header className="live-session-header">
        <div>
          <span>ORIGINAL SESSION DATA CENTER</span>
          <h2>场次事件与用户数据</h2>
          <p>只查询已持久化的受支持事件；未解析 UID 和无在线覆盖不会伪装成零。</p>
        </div>
        <SessionSelectors
          rooms={rooms}
          sessions={sessions}
          selectedRoomId={roomId}
          selectedSessionId={sessionId}
          onRoomChange={onRoomChange}
          onSessionChange={onSessionChange}
        />
      </header>
      {!sessionId
        ? <LiveState title="暂无可查询场次" detail="场次形成后才能筛选事件、聚合用户和导出。" />
        : (
            <>
              <div className="live-export-bar">
                <div>
                  {([
                    ["xlsx", "Excel XLSX"],
                    ["danmaku", "弹幕 CSV"],
                    ["gifts", "礼物 CSV"],
                    ["users", "用户 CSV"],
                    ["all", "完整 ZIP"]
                  ] as const).map(([category, label]) => (
                    <button
                      type="button"
                      key={category}
                      disabled={exportPending}
                      onClick={() => void onExport?.(sessionId, category)}
                    ><Download size={14} />{label}</button>
                  ))}
                </div>
                <span>{exportMessage ?? "导出 schema v2 · 默认保存到 D 盘本地数据目录"}</span>
              </div>
              <div className="live-event-filters">
                <label>事件类型
                  <select
                    value={currentFilters.kind ?? ""}
                    onChange={(event) => onFiltersChange?.({
                      ...currentFilters,
                      page: 1,
                      ...(event.target.value
                        ? { kind: event.target.value as QueryBilibiliLiveSessionEventsInput["kind"] }
                        : { kind: undefined })
                    })}
                  >
                    <option value="">全部事件</option>
                    <option value="DANMAKU">弹幕</option>
                    <option value="GIFT">礼物</option>
                    <option value="SUPER_CHAT">醒目留言</option>
                    <option value="GUARD_BUY">大航海</option>
                  </select>
                </label>
                <label>关键词
                  <input
                    value={currentFilters.keyword ?? ""}
                    placeholder="消息、昵称、勋章或礼物"
                    onChange={(event) => onFiltersChange?.({
                      ...currentFilters,
                      page: 1,
                      keyword: event.target.value || undefined
                    })}
                  />
                </label>
                <label>用户 UID
                  <input
                    value={currentFilters.userUid ?? ""}
                    inputMode="numeric"
                    placeholder="精确 UID"
                    onChange={(event) => onFiltersChange?.({
                      ...currentFilters,
                      page: 1,
                      userUid: event.target.value || undefined
                    })}
                  />
                </label>
                <label>付费
                  <select
                    value={currentFilters.paid === undefined ? "" : String(currentFilters.paid)}
                    onChange={(event) => onFiltersChange?.({
                      ...currentFilters,
                      page: 1,
                      paid: event.target.value === "" ? undefined : event.target.value === "true"
                    })}
                  >
                    <option value="">全部</option>
                    <option value="true">仅付费</option>
                    <option value="false">仅非付费</option>
                  </select>
                </label>
              </div>
              {pending
                ? <LiveState title="正在查询场次数据" detail="读取 SQLite 中的事件事实和用户聚合。" />
                : (
                    <div className="live-data-grid">
                      <section className="live-session-events-table">
                        <header><strong>事件明细</strong><span>{events?.total ?? 0} 条</span></header>
                        {!events || events.items.length === 0
                          ? <p className="live-table-empty">当前筛选条件没有已保存事件。</p>
                          : events.items.map((event) => (
                              <article key={event.id}>
                                <span>{sessionEventKindLabel(event.eventKind)}</span>
                                <div>
                                  <strong>{event.senderName ?? "身份未解析"}</strong>
                                  <small>{event.senderUid ? `UID ${event.senderUid}` : "UID 未解析"}</small>
                                </div>
                                <p>{event.messageText ?? event.giftName ?? event.command ?? event.eventKind}</p>
                                <em>{event.paidAmountMilliYuan ? formatMilliYuan(event.paidAmountMilliYuan) : "—"}</em>
                                <time>{formatTime(event.occurredAt)}</time>
                              </article>
                            ))}
                        <footer>
                          <button
                            type="button"
                            disabled={(events?.page ?? 1) <= 1}
                            onClick={() => onFiltersChange?.({ ...currentFilters, page: Math.max(1, (events?.page ?? 1) - 1) })}
                          >上一页</button>
                          <span>第 {events?.page ?? 1} 页</span>
                          <button
                            type="button"
                            disabled={!events || events.page * events.size >= events.total}
                            onClick={() => onFiltersChange?.({ ...currentFilters, page: (events?.page ?? 1) + 1 })}
                          >下一页</button>
                        </footer>
                      </section>
                      <aside className="live-session-users-table">
                        <header><strong>用户聚合</strong><span>前 {users.length} 条</span></header>
                        {users.length === 0
                          ? <p className="live-table-empty">暂无可聚合用户事实。</p>
                          : users.map((user) => (
                              <article key={user.actorKey}>
                                <div><strong>{user.displayName ?? "身份未解析"}</strong><small>{user.userUid ? `UID ${user.userUid}` : "未解析事件"}</small></div>
                                <span>弹幕 {user.danmakuCount}</span>
                                <span>礼物 {user.giftCount}</span>
                                <em>{formatMilliYuan(user.paidAmountMilliYuan)}</em>
                              </article>
                            ))}
                      </aside>
                    </div>
                  )}
            </>
          )}
    </section>
  )
}

function LiveSessionInsightView({
  rooms,
  sessions,
  insight,
  selectedRoomId,
  selectedSessionId,
  bucketSeconds,
  pending,
  onRoomChange,
  onSessionChange,
  onBucketChange
}: {
  rooms: BilibiliLiveRoom[]
  sessions: BilibiliLiveSessionSummary[]
  insight?: BilibiliLiveSessionInsight
  selectedRoomId?: string
  selectedSessionId?: string
  bucketSeconds: 60 | 300 | 900
  pending: boolean
  onRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
  onBucketChange?: (bucketSeconds: 60 | 300 | 900) => void
}): JSX.Element {
  if (rooms.length === 0) return <LiveState title="暂无分析来源" detail="请先形成真实直播场次。" />
  const roomId = selectedRoomId ?? rooms[0]?.id
  const sessionId = selectedSessionId ?? sessions[0]?.id
  if (!roomId) return <LiveState title="尚无直播间" detail="请先添加真实直播间监控。" />
  return (
    <section className="live-insight-panel" aria-label="直播场次分析">
      <header className="live-session-header">
        <div>
          <span>ORIGINAL SESSION INSIGHTS</span>
          <h2>场次分析</h2>
          <p>互动、付费、参与深度和历史复购均按原项目规则从本地事实计算。</p>
        </div>
        <div className="live-insight-selectors">
          <SessionSelectors
            rooms={rooms}
            sessions={sessions}
            selectedRoomId={roomId}
            selectedSessionId={sessionId}
            onRoomChange={onRoomChange}
            onSessionChange={onSessionChange}
          />
          <label>时间桶
            <select value={bucketSeconds} onChange={(event) => onBucketChange?.(Number(event.target.value) as 60 | 300 | 900)}>
              <option value={60}>1 分钟</option>
              <option value={300}>5 分钟</option>
              <option value={900}>15 分钟</option>
            </select>
          </label>
        </div>
      </header>
      {!sessionId
        ? <LiveState title="暂无可分析场次" detail="场次形成后才会计算洞察。" />
        : pending
          ? <LiveState title="正在计算场次分析" detail="从本地事件事实按当前时间桶重新聚合。" />
          : !insight
            ? <LiveState title="暂无场次分析" detail="当前场次没有可计算的受支持事件。" />
            : (
                <>
                  <div className="live-insight-kpis">
                    <span><small>每分钟弹幕</small><strong>{formatNullableNumber(insight.kpis.danmakuPerMinute)}</strong></span>
                    <span><small>付费转化率</small><strong>{formatRate(insight.kpis.payerConversionRate)}</strong></span>
                    <span><small>ARPPU</small><strong>{formatMilliYuan(insight.kpis.arppuMilliYuan)}</strong></span>
                    <span><small>付费金额</small><strong>{formatMilliYuan(insight.kpis.paidAmountMilliYuan)}</strong></span>
                    <span><small>Top 5 收入占比</small><strong>{formatRate(insight.kpis.topFiveRevenueShare)}</strong></span>
                  </div>
                  <div className="live-insight-grid">
                    <section className="live-insight-timeline">
                      <header><strong>时间线</strong><span>{insight.bucketSeconds / 60} 分钟桶</span></header>
                      {insight.timeline.length === 0
                        ? <p className="live-table-empty">暂无时间桶数据。</p>
                        : insight.timeline.map((bucket) => (
                            <article key={bucket.bucketStart}>
                              <time>{new Date(bucket.bucketStart).toLocaleTimeString("zh-CN", { hour12: false })}</time>
                              <span>弹幕 {bucket.danmakuCount}</span>
                              <span>活跃用户 {bucket.activeUserCount}</span>
                              <span>付费 {formatMilliYuan(bucket.paidAmountMilliYuan)}</span>
                            </article>
                          ))}
                    </section>
                    <aside className="live-insight-findings">
                      <header><strong>规则洞察</strong><span>{insight.findings.length} 条</span></header>
                      {insight.findings.map((finding) => (
                        <article key={finding.code} className={`finding-${finding.level.toLowerCase()}`}>
                          <span>{finding.level}</span>
                          <strong>{finding.title}</strong>
                          <p>{finding.description}</p>
                        </article>
                      ))}
                    </aside>
                  </div>
                  <div className="live-insight-depth-grid">
                    <section>
                      <header><strong>互动深度</strong></header>
                      <p>已识别弹幕用户 <b>{formatNullableCount(insight.danmakuDepth.identifiedDanmakuUserCount)}</b></p>
                      <p>重复互动率 <b>{formatRate(insight.danmakuDepth.repeatInteractionRate)}</b></p>
                      <p>持续参与率 <b>{formatRate(insight.danmakuDepth.sustainedParticipationRate)}</b></p>
                      <p>重复消息率 <b>{formatRate(insight.danmakuDepth.duplicateMessageRate)}</b></p>
                    </section>
                    <section>
                      <header><strong>付费深度</strong></header>
                      <p>付费用户 <b>{formatNullableCount(insight.paymentDepth.payerCount)}</b></p>
                      <p>场内复购率 <b>{formatRate(insight.paymentDepth.repeatPayerRate)}</b></p>
                      <p>历史复购率 <b>{formatRate(insight.paymentDepth.returningPayerRate)}</b></p>
                      <p>Top 1 收入占比 <b>{formatRate(insight.paymentDepth.topOneRevenueShare)}</b></p>
                    </section>
                    <section>
                      <header><strong>数据质量</strong></header>
                      <p>覆盖 <b>{coverageLabel(insight.quality.coverageStatus)}</b></p>
                      <p>覆盖秒数 <b>{insight.quality.coveredSeconds.toLocaleString("zh-CN")}</b></p>
                      <p>身份解析率 <b>{formatRate(insight.quality.identityResolvedEventShare)}</b></p>
                      <small>{insight.quality.caveat}</small>
                    </section>
                  </div>
                </>
              )}
    </section>
  )
}

function SessionSelectors({
  rooms,
  sessions,
  selectedRoomId,
  selectedSessionId,
  onRoomChange,
  onSessionChange,
  showSession = true
}: {
  rooms: BilibiliLiveRoom[]
  sessions: BilibiliLiveSessionSummary[]
  selectedRoomId: string
  selectedSessionId?: string
  onRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
  showSession?: boolean
}): JSX.Element {
  return (
    <div className="live-session-selectors">
      <label>直播间
        <select value={selectedRoomId} onChange={(event) => onRoomChange?.(event.target.value)}>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.uname} · {room.roomId}</option>)}
        </select>
      </label>
      {showSession && (
        <label>直播场次
          <select value={selectedSessionId ?? ""} onChange={(event) => onSessionChange?.(event.target.value)}>
            {sessions.length === 0 && <option value="">暂无场次</option>}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatTime(session.startedAt)} · {sessionStateLabel(session.state)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function LiveState({ title, detail }: { title: string; detail: string }): JSX.Element {
  return <div className="live-state"><Radio size={25} /><strong>{title}</strong><span>{detail}</span></div>
}

function useLastSuccessfulLiveTrends(
  rooms: BilibiliLiveRoom[],
  data: BilibiliLiveRoomTrend[] | undefined,
  updatedAt: number
): BilibiliLiveRoomTrend[] {
  // View-only stale snapshots, bounded by the monitored rooms. A changed selection
  // has a different Query key, but must not erase successfully loaded room curves.
  const [saved, setSaved] = useState(() => new Map<string, { trend: BilibiliLiveRoomTrend; updatedAt: number }>())
  useEffect(() => {
    const roomIds = new Set(rooms.map((room) => room.id))
    setSaved((previous) => {
      const next = new Map([...previous].filter(([id]) => roomIds.has(id)))
      let changed = next.size !== previous.size
      for (const trend of data ?? []) {
        if (roomIds.has(trend.room.id) && updatedAt > (next.get(trend.room.id)?.updatedAt ?? -1)) {
          next.set(trend.room.id, { trend, updatedAt })
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [rooms, data, updatedAt])
  const latest = new Map(saved)
  for (const trend of data ?? []) {
    if (updatedAt >= (latest.get(trend.room.id)?.updatedAt ?? -1)) latest.set(trend.room.id, { trend, updatedAt })
  }
  return rooms.flatMap((room) => {
    const entry = latest.get(room.id)
    return entry ? [entry.trend] : []
  })
}

export function ConnectedBilibiliLiveWorkspace({
  bridge,
  view,
  creationOpen,
  onCloseCreation
}: {
  bridge: DesktopBridge
  view: BilibiliLiveView
  creationOpen: boolean
  onCloseCreation: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const [selectedTrendIds, setSelectedTrendIds] = useState<string[]>([])
  const initializedTrendSelection = useRef(false)
  const roomLocks = useRef(new Set<string>())
  const [busyRoomIds, setBusyRoomIds] = useState<string[]>([])
  const [roomActionErrors, setRoomActionErrors] = useState<Record<string, string | undefined>>({})
  const [selectedRankRoomId, setSelectedRankRoomId] = useState<string>()
  const [selectedDanmakuRoomId, setSelectedDanmakuRoomId] = useState<string>()
  const [selectedSessionRoomId, setSelectedSessionRoomId] = useState<string>()
  const [selectedSessionId, setSelectedSessionId] = useState<string>()
  const [sessionEventFilters, setSessionEventFilters] = useState<QueryBilibiliLiveSessionEventsInput>({
    sessionId: "00000000-0000-4000-8000-000000000000",
    page: 1,
    size: 50
  })
  const [insightBucketSeconds, setInsightBucketSeconds] = useState<60 | 300 | 900>(300)
  const [exportMessage, setExportMessage] = useState<string>()
  const [rankErrors, setRankErrors] = useState<string[]>([])
  const roomsQuery = useQuery({
    queryKey: ["bilibili-live", "rooms"],
    queryFn: () => bridge.bilibiliLive.list({ limit: 100 }),
    refetchInterval: 15_000
  })
  const rooms = roomsQuery.data?.items ?? []
  const validSelection = useMemo(
    () => selectedTrendIds.filter((id) => rooms.some((room) => room.id === id)).slice(0, 4),
    [rooms, selectedTrendIds]
  )
  const summaryQuery = useQuery({
    queryKey: ["bilibili-live", "summary"],
    queryFn: () => bridge.bilibiliLive.summary(),
    refetchInterval: 15_000
  })
  const eventsQuery = useQuery({
    queryKey: ["bilibili-live", "events"],
    queryFn: () => bridge.bilibiliLive.events({ limit: 20 }),
    refetchInterval: 15_000
  })
  const trendsQuery = useQuery({
    queryKey: ["bilibili-live", "trends", validSelection],
    queryFn: () => {
      // A deletion can invalidate an old query before React commits its new selection.
      const currentRooms = queryClient.getQueryData<BilibiliLiveRoomList>(["bilibili-live", "rooms"])?.items ?? []
      const ids = validSelection.filter((id) => currentRooms.some((room) => room.id === id))
      return ids.length === 0 ? Promise.resolve([]) : bridge.bilibiliLive.trends({ roomMonitorIds: ids, limitPerRoom: 500 })
    },
    enabled: view === "趋势对比" && validSelection.length > 0,
    refetchInterval: 30_000
  })
  const lastSuccessfulTrends = useLastSuccessfulLiveTrends(rooms, trendsQuery.data, trendsQuery.dataUpdatedAt)
  const rankQuery = useQuery({
    queryKey: ["bilibili-live", "rank", selectedRankRoomId],
    queryFn: () => {
      if (!selectedRankRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.rankSummary({ roomMonitorId: selectedRankRoomId })
    },
    enabled: view === "观众榜单" && selectedRankRoomId !== undefined,
    refetchInterval: view === "观众榜单" ? 30_000 : false
  })
  const danmakuStatusQuery = useQuery({
    queryKey: ["bilibili-live", "danmaku", "status", selectedDanmakuRoomId],
    queryFn: () => {
      if (!selectedDanmakuRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.danmakuStatus({ roomMonitorId: selectedDanmakuRoomId })
    },
    enabled: view === "实时弹幕" && selectedDanmakuRoomId !== undefined,
    refetchInterval: view === "实时弹幕" ? 2_000 : false
  })
  const danmakuRecentQuery = useQuery({
    queryKey: ["bilibili-live", "danmaku", "recent", selectedDanmakuRoomId],
    queryFn: () => {
      if (!selectedDanmakuRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.danmakuRecent({ roomMonitorId: selectedDanmakuRoomId, limit: 30 })
    },
    enabled: view === "实时弹幕" && selectedDanmakuRoomId !== undefined,
    refetchInterval: view === "实时弹幕" ? 2_000 : false
  })
  const danmakuMetricsQuery = useQuery({
    queryKey: ["bilibili-live", "danmaku", "metrics", selectedDanmakuRoomId],
    queryFn: () => {
      if (!selectedDanmakuRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.danmakuMetrics({ roomMonitorId: selectedDanmakuRoomId, range: "1h" })
    },
    enabled: view === "实时弹幕" && selectedDanmakuRoomId !== undefined,
    refetchInterval: view === "实时弹幕" ? 2_000 : false
  })
  const sessionView = view === "直播场次" || view === "数据中心" || view === "场次分析"
  const sessionLimit = view === "直播场次" ? 20 : 200
  const sessionsQuery = useQuery({
    queryKey: ["bilibili-live", "sessions", selectedSessionRoomId, sessionLimit],
    queryFn: () => {
      if (!selectedSessionRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.sessions({ roomMonitorId: selectedSessionRoomId, limit: sessionLimit })
    },
    enabled: sessionView && selectedSessionRoomId !== undefined,
    refetchInterval: sessionView ? 10_000 : false
  })
  const sessionUsersQuery = useQuery({
    queryKey: ["bilibili-live", "session-users", selectedSessionId],
    queryFn: () => {
      if (!selectedSessionId) throw new Error("尚未选择直播场次。")
      return bridge.bilibiliLive.sessionUsers({ sessionId: selectedSessionId, limit: 500 })
    },
    enabled: view === "数据中心" && selectedSessionId !== undefined,
    refetchInterval: view === "数据中心" ? 10_000 : false
  })
  const sessionEventsQuery = useQuery({
    queryKey: ["bilibili-live", "session-events", sessionEventFilters],
    queryFn: () => bridge.bilibiliLive.sessionEvents(sessionEventFilters),
    enabled: view === "数据中心" && selectedSessionId !== undefined
      && sessionEventFilters.sessionId === selectedSessionId,
    refetchInterval: view === "数据中心" ? 10_000 : false
  })
  const sessionInsightQuery = useQuery({
    queryKey: ["bilibili-live", "session-insight", selectedSessionId, insightBucketSeconds],
    queryFn: () => {
      if (!selectedSessionId) throw new Error("尚未选择直播场次。")
      return bridge.bilibiliLive.sessionInsight({
        sessionId: selectedSessionId,
        bucketSeconds: insightBucketSeconds
      })
    },
    enabled: view === "场次分析" && selectedSessionId !== undefined,
    refetchInterval: view === "场次分析" ? 10_000 : false
  })
  const refreshQueries = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "rooms"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "summary"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "events"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "trends"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "rank"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "danmaku"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-users"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-events"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-insight"] })
    ])
  }
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: refreshQueries
  })
  const cacheRoom = (room: BilibiliLiveRoom): void => {
    queryClient.setQueryData<BilibiliLiveRoomList>(["bilibili-live", "rooms"], (current) => {
      if (!current) return { items: [room], total: 1, snapshotAt: new Date().toISOString() }
      const exists = current.items.some((item) => item.id === room.id)
      return { ...current, items: exists ? current.items.map((item) => item.id === room.id ? room : item) : [...current.items, room],
        total: current.total + (exists ? 0 : 1) }
    })
  }
  const handleRoomAction: BilibiliLiveWorkspacePresentationProps["onRoomAction"] = async (action, room, intervalSeconds) => {
    if (roomLocks.current.has(room.id)) return
    roomLocks.current.add(room.id)
    setBusyRoomIds([...roomLocks.current])
    setRoomActionErrors((errors) => ({ ...errors, [room.id]: undefined }))
    try {
      if (action === "refresh") {
        const result = await bridge.bilibiliLive.refresh({ roomMonitorId: room.id })
        if (!result.success) throw new Error(result.message)
      } else if (action === "toggle") {
        cacheRoom(await bridge.bilibiliLive.updateStatus({ roomMonitorId: room.id, enabled: room.monitorStatus !== "ACTIVE" }))
      } else if (action === "interval") {
        cacheRoom(await bridge.bilibiliLive.updateSettings({ roomMonitorId: room.id, intervalSeconds: intervalSeconds ?? room.intervalSeconds }))
      } else {
        await bridge.bilibiliLive.remove({ roomMonitorId: room.id })
        queryClient.setQueryData<BilibiliLiveRoomList>(["bilibili-live", "rooms"], (current) => current && ({
          ...current, items: current.items.filter((item) => item.id !== room.id),
          total: Math.max(0, current.total - Number(current.items.some((item) => item.id === room.id)))
        }))
        setSelectedTrendIds((ids) => ids.filter((id) => id !== room.id))
      }
    } catch (error) {
      setRoomActionErrors((errors) => ({ ...errors, [room.id]: errorMessageOf(error) }))
    } finally {
      try {
        // Failed platform requests also persist error/backoff state that must reach the card.
        await refreshQueries()
      } finally {
        roomLocks.current.delete(room.id)
        setBusyRoomIds([...roomLocks.current])
      }
    }
  }
  const rankMutation = useMutation({
    mutationFn: (roomMonitorId: string) => bridge.bilibiliLive.rankRefresh({ roomMonitorId }),
    onSuccess: async (result) => {
      setRankErrors(result.errors)
      await queryClient.invalidateQueries({ queryKey: ["bilibili-live", "rank", result.roomMonitorId] })
    }
  })
  const danmakuMutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bilibili-live", "danmaku"] })
    }
  })
  const exportMutation = useMutation({
    mutationFn: (input: { sessionId: string; category: BilibiliLiveSessionExportCategory }) =>
      bridge.bilibiliLive.sessionExport(input),
    onSuccess: (result) => {
      setExportMessage(result.canceled
        ? "已取消导出。"
        : `已保存：${result.savedPath ?? "本地文件"}`)
    },
    onError: (error) => setExportMessage(errorMessageOf(error))
  })
  useEffect(() => {
    if (!initializedTrendSelection.current && roomsQuery.isSuccess) {
      initializedTrendSelection.current = true
      const initial = rooms.find((room) => room.liveStatus === 1) ?? rooms[0]
      if (initial && selectedTrendIds.length === 0) setSelectedTrendIds([initial.id])
      return
    }
    if (validSelection.length !== selectedTrendIds.length) setSelectedTrendIds(validSelection)
  }, [roomsQuery.isSuccess, rooms, selectedTrendIds, validSelection])
  useEffect(() => {
    if (rooms.length === 0) {
      if (selectedRankRoomId !== undefined) setSelectedRankRoomId(undefined)
      if (selectedDanmakuRoomId !== undefined) setSelectedDanmakuRoomId(undefined)
      if (selectedSessionRoomId !== undefined) setSelectedSessionRoomId(undefined)
      return
    }
    if (!rooms.some((room) => room.id === selectedRankRoomId)) setSelectedRankRoomId(rooms[0]?.id)
    if (!rooms.some((room) => room.id === selectedDanmakuRoomId)) setSelectedDanmakuRoomId(rooms[0]?.id)
    if (!rooms.some((room) => room.id === selectedSessionRoomId)) setSelectedSessionRoomId(rooms[0]?.id)
  }, [rooms, selectedDanmakuRoomId, selectedRankRoomId, selectedSessionRoomId])
  const sessions = sessionsQuery.data ?? []
  useEffect(() => {
    // A new room/limit query is not an empty result until it has actually loaded.
    if (!sessionsQuery.data) return
    const next = sessions.find((session) => session.id === selectedSessionId)?.id ?? sessions[0]?.id
    if (next !== selectedSessionId) setSelectedSessionId(next)
  }, [selectedSessionId, sessions, sessionsQuery.data])
  useEffect(() => {
    if (!selectedSessionId || sessionEventFilters.sessionId === selectedSessionId) return
    setSessionEventFilters({ sessionId: selectedSessionId, page: 1, size: 50 })
  }, [selectedSessionId, sessionEventFilters.sessionId])

  return (
    <BilibiliLiveWorkspacePresentation
      view={view}
      creationOpen={creationOpen}
      rooms={rooms}
      summary={summaryQuery.data}
      events={eventsQuery.data ?? []}
      trends={lastSuccessfulTrends.filter((trend) => validSelection.includes(trend.room.id))}
      rankSummary={rankQuery.data}
      danmakuStatus={danmakuStatusQuery.data}
      danmakuRecent={danmakuRecentQuery.data ?? []}
      danmakuMetrics={danmakuMetricsQuery.data ?? []}
      sessions={sessions}
      sessionUsers={sessionUsersQuery.data ?? []}
      sessionEvents={sessionEventsQuery.data}
      sessionInsight={sessionInsightQuery.data}
      sessionEventFilters={sessionEventFilters}
      selectedTrendIds={validSelection}
      selectedRankRoomId={selectedRankRoomId}
      selectedDanmakuRoomId={selectedDanmakuRoomId}
      selectedSessionRoomId={selectedSessionRoomId}
      selectedSessionId={selectedSessionId}
      insightBucketSeconds={insightBucketSeconds}
      rankPending={rankQuery.isPending || rankMutation.isPending}
      danmakuPending={danmakuMutation.isPending || danmakuStatusQuery.isPending}
      sessionPending={sessionsQuery.isPending
        || (view === "数据中心" && (sessionUsersQuery.isPending || sessionEventsQuery.isPending))
        || (view === "场次分析" && sessionInsightQuery.isPending)}
      exportPending={exportMutation.isPending}
      exportMessage={exportMessage}
      rankErrors={rankErrors}
      pending={roomsQuery.isPending}
      busyRoomIds={busyRoomIds}
      roomActionErrors={roomActionErrors}
      refreshing={roomsQuery.isFetching || summaryQuery.isFetching || eventsQuery.isFetching}
      onReload={refreshQueries}
      trendPending={trendsQuery.isFetching}
      trendError={trendsQuery.error ? errorMessageOf(trendsQuery.error) : undefined}
      onReloadTrends={() => trendsQuery.refetch()}
      errorMessage={firstErrorMessage(
        roomsQuery.error,
        summaryQuery.error,
        eventsQuery.error,
        mutation.error,
        rankQuery.error,
        rankMutation.error,
        danmakuStatusQuery.error,
        danmakuRecentQuery.error,
        danmakuMetricsQuery.error,
        danmakuMutation.error,
        sessionsQuery.error,
        sessionUsersQuery.error,
        sessionEventsQuery.error,
        sessionInsightQuery.error,
        exportMutation.error
      )}
      onAdd={async (input) => {
        await mutation.mutateAsync(async () => {
          const room = await bridge.bilibiliLive.add(input)
          cacheRoom(room)
          setSelectedTrendIds((ids) => ids.includes(room.id) || ids.length >= 4 ? ids : [...ids, room.id])
        })
      }}
      onRoomAction={handleRoomAction}
      onCloseCreation={onCloseCreation}
      onTrendSelectionChange={setSelectedTrendIds}
      onRankRoomChange={(roomMonitorId) => {
        setRankErrors([])
        setSelectedRankRoomId(roomMonitorId)
      }}
      onRankRefresh={async (roomMonitorId) => {
        await rankMutation.mutateAsync(roomMonitorId)
      }}
      onDanmakuRoomChange={setSelectedDanmakuRoomId}
      onDanmakuStart={async (roomMonitorId, protocolVersion) => {
        await danmakuMutation.mutateAsync(() => bridge.bilibiliLive.danmakuStart({
          roomMonitorId,
          ...(protocolVersion === undefined ? {} : { protocolVersion })
        }))
      }}
      onDanmakuStop={async (roomMonitorId) => {
        await danmakuMutation.mutateAsync(() => bridge.bilibiliLive.danmakuStop({ roomMonitorId }))
      }}
      onSessionRoomChange={(roomMonitorId) => {
        setSelectedSessionRoomId(roomMonitorId)
        setSelectedSessionId(undefined)
        setExportMessage(undefined)
      }}
      onSessionChange={(sessionId) => {
        setSelectedSessionId(sessionId)
        setSessionEventFilters({ sessionId, page: 1, size: 50 })
        setExportMessage(undefined)
      }}
      onSessionEventFiltersChange={setSessionEventFilters}
      onInsightBucketChange={setInsightBucketSeconds}
      onSessionExport={async (sessionId, category) => {
        await exportMutation.mutateAsync({ sessionId, category })
      }}
    />
  )
}

function toggleTrendId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((value) => value !== id)
  return ids.length >= 4 ? ids : [...ids, id]
}

function liveStatus(status: 0 | 1 | 2): { label: string; tone: string } {
  if (status === 1) return { label: "直播中", tone: "live" }
  if (status === 2) return { label: "轮播中", tone: "round" }
  return { label: "未开播", tone: "offline" }
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "暂无" : value.toLocaleString("zh-CN")
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return "暂无"
  return `${value > 0 ? "+" : ""}${value.toLocaleString("zh-CN")}`
}

function formatTime(value: string | undefined): string {
  if (!value) return "暂无"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false })
}

function eventLabel(type: string): string {
  return ({
    LIVE_STARTED: "直播开始",
    LIVE_ENDED: "直播结束",
    ROUND_STARTED: "轮播开始",
    TITLE_CHANGED: "标题变化",
    ERROR_OCCURRED: "采集异常",
    ERROR_RECOVERED: "采集恢复"
  } as Record<string, string>)[type] ?? type
}

function sessionStateLabel(state: BilibiliLiveSessionSummary["state"]): string {
  return ({
    OPEN: "进行中",
    END_PENDING: "等待下播确认",
    CLOSED: "已结束",
    INCOMPLETE: "历史边界不完整"
  } as const)[state]
}

function coverageLabel(coverage: BilibiliLiveSessionSummary["coverageStatus"]): string {
  return ({
    RECEIVED_WHILE_ONLINE: "在线接收覆盖",
    NO_ONLINE_COVERAGE: "无在线采集覆盖",
    BOUNDARY_ONLY: "仅有历史边界"
  } as const)[coverage]
}

function sessionEventKindLabel(kind: string): string {
  return ({
    DANMAKU: "弹幕",
    GIFT: "礼物",
    SUPER_CHAT: "醒目留言",
    GUARD_BUY: "大航海"
  } as Record<string, string>)[kind] ?? kind
}

function formatNullableCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "不可用" : value.toLocaleString("zh-CN")
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "不可用" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 })
}

function formatMilliYuan(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "不可用"
    : `¥${(value / 1_000).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "不可用"
    : `${(value * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`
}

function danmakuStatusLabel(status: BilibiliLiveDanmakuStatus | undefined): string {
  if (!status) return "尚未监听"
  return ({
    NOT_STARTED: "尚未监听",
    CONNECTING: "正在连接",
    AUTHENTICATING: "正在鉴权",
    CONNECTED: "监听中",
    CLOSED: "连接已关闭",
    STOPPED: "已停止",
    ERROR: "连接异常"
  } as const)[status.status]
}

function rankLabel(type: string, rankSwitch: string | undefined): string {
  const key = rankSwitch ?? type
  return ({
    contribution_rank: "房间观众在线贡献榜",
    entry_time_rank: "房间观众进房时间榜",
    today_rank: "房间观众日榜",
    current_week_rank: "房间观众周榜",
    current_month_rank: "房间观众月榜",
    guard_weekly: "大航海周榜",
    guard_monthly: "大航海月榜",
    guard_accompany: "大航海陪伴榜"
  } as Record<string, string>)[key] ?? key
}

function firstErrorMessage(...errors: unknown[]): string | undefined {
  const error = errors.find(Boolean)
  return error ? errorMessageOf(error) : undefined
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
