import type {
  AddBilibiliLiveRoomInput,
  BilibiliLiveRoomV2,
  BilibiliLiveRoomTrendV2,
  BilibiliLiveRankSummary,
  BilibiliLiveRankSummaryV2,
  BilibiliLiveDanmakuMetricBucket,
  BilibiliLiveDanmakuRecent,
  BilibiliLiveDanmakuStatus,
  BilibiliLiveSessionEventPage,
  BilibiliLiveSessionExportCategory,
  BilibiliLiveSessionInsight,
  BilibiliLiveSessionSummary,
  BilibiliLiveSessionUser,
  BilibiliLiveStatusEventV2,
  BilibiliLiveSummaryV2,
  DesktopBridge,
  QueryBilibiliLiveSessionEventsInput
} from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  Crown,
  Download,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCcw,
  TrendingUp,
  UsersRound,
  X
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX, type ReactNode } from "react"
import { ConnectedBilibiliLiveDataWidget } from "./ConnectedBilibiliLiveDataWidget"
import { BilibiliLiveMonitorPanel, useLiveMonitorPanel } from "./BilibiliLiveMonitorPanel"
import { BilibiliLiveTrendBoard } from "./BilibiliLiveTrendBoard"
import { useLiveTrendQuery } from "./useLiveTrendQuery"
import { useLiveOverviewQuery } from "./useLiveOverviewQuery"
import { LiveOverviewSummary, LiveStatusEvents } from "./BilibiliLiveOverview"
import { normalizeFollowerUidInput } from "./follower-uid-input"
import { BilibiliLiveSessionPanel } from "./BilibiliLiveSessionPanel"
import { BilibiliLiveAnalysis } from "./BilibiliLiveAnalysis"
import { useLiveSessionPanel } from "./useLiveSessionPanel"
import { SessionEventPagination } from "./SessionEventPagination"
import { SearchableSelect } from "./SearchableSelect"

const emptyLiveRooms: BilibiliLiveRoomV2[] = []

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
  renderRoomData?: (room: BilibiliLiveRoomV2) => ReactNode
  view: BilibiliLiveView
  creationOpen: boolean
  rooms: BilibiliLiveRoomV2[]
  roomsRevision?: number
  summary?: BilibiliLiveSummaryV2
  events: BilibiliLiveStatusEventV2[]
  trends: BilibiliLiveRoomTrendV2[]
  rankSummary?: BilibiliLiveRankSummary | BilibiliLiveRankSummaryV2
  danmakuStatus?: BilibiliLiveDanmakuStatus
  danmakuRecent?: BilibiliLiveDanmakuRecent[]
  danmakuMetrics?: BilibiliLiveDanmakuMetricBucket[]
  sessions?: BilibiliLiveSessionSummary[]
  sessionUsers?: BilibiliLiveSessionUser[]
  sessionDetail?: BilibiliLiveSessionSummary
  sessionDetailLoading?: boolean
  sessionDetailUnavailable?: boolean
  sessionPanelError?: string
  sessionRefreshSeconds?: number
  onSessionRefresh?: () => void
  onSessionRefreshSecondsChange?: (seconds: number) => void
  onDismissSessionError?: () => void
  sessionEvents?: BilibiliLiveSessionEventPage
  sessionInsight?: BilibiliLiveSessionInsight
  sessionEventFilters?: QueryBilibiliLiveSessionEventsInput
  selectedTrendIds?: string[]
  selectedRankRoomId?: string
  selectedDanmakuRoomId?: string
  selectedSessionRoomId?: string
  selectedSessionId?: string
  insightBucketSeconds?: 60 | 300 | 900
  insightError?: string
  insightAutoRefresh?: boolean
  insightRefreshSeconds?: number
  onInsightRefresh?: () => void
  onInsightAutoRefreshChange?: (enabled: boolean) => void
  onInsightRefreshSecondsChange?: (seconds: number) => void
  rankPending?: boolean
  danmakuPending?: boolean
  sessionPending?: boolean
  sessionEventsPending?: boolean
  sessionUsersPending?: boolean
  sessionEventsError?: string
  sessionUsersError?: string
  sessionEventsStale?: boolean
  onRetrySessionEvents?: () => Promise<unknown>
  onRetrySessionUsers?: () => Promise<unknown>
  exportPending?: boolean
  exportMessage?: string
  rankErrors?: string[]
  pending: boolean
  overviewAvailable?: boolean
  overviewStale?: boolean
  errorMessage?: string
  busyRoomIds?: string[]
  roomActionErrors?: Record<string, string | undefined>
  refreshing?: boolean
  onReload?: () => Promise<void>
  trendPending?: boolean
  trendError?: string
  onReloadTrends?: () => Promise<unknown>
  onAdd: (input: AddBilibiliLiveRoomInput) => Promise<BilibiliLiveRoomV2 | void>
  onRoomAction: (
    action: BilibiliLiveRoomAction,
    room: BilibiliLiveRoomV2,
    intervalSeconds?: number,
    onCommitted?: () => void
  ) => Promise<boolean | void>
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
  renderRoomData,
  view,
  creationOpen,
  rooms,
  roomsRevision,
  summary,
  events,
  trends,
  rankSummary,
  danmakuStatus,
  danmakuRecent = [],
  danmakuMetrics = [],
  sessions = [],
  sessionUsers = [],
  sessionDetail,
  sessionDetailLoading = false,
  sessionDetailUnavailable = false,
  sessionPanelError,
  sessionRefreshSeconds = 10,
  onSessionRefresh,
  onSessionRefreshSecondsChange,
  onDismissSessionError,
  sessionEvents,
  sessionInsight,
  sessionEventFilters,
  selectedTrendIds = [],
  selectedRankRoomId,
  selectedDanmakuRoomId,
  selectedSessionRoomId,
  selectedSessionId,
  insightBucketSeconds = 300,
  insightError,
  insightAutoRefresh = false,
  insightRefreshSeconds = 10,
  onInsightRefresh = () => {},
  onInsightAutoRefreshChange = () => {},
  onInsightRefreshSecondsChange = () => {},
  rankPending = false,
  danmakuPending = false,
  sessionPending = false,
  sessionEventsPending = false,
  sessionUsersPending = false,
  sessionEventsError,
  sessionUsersError,
  sessionEventsStale = false,
  onRetrySessionEvents,
  onRetrySessionUsers,
  exportPending = false,
  exportMessage,
  rankErrors = [],
  pending,
  overviewAvailable = !pending,
  overviewStale = false,
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
  const monitorPanel = useLiveMonitorPanel(rooms, roomsRevision)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const value = normalizeFollowerUidInput(identifier)
    const seconds = Number(interval)
    if (value === undefined) {
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
      const added = await onAdd({ [addMode]: value, intervalSeconds: seconds })
      if (added) monitorPanel.setExpandedId(added.id)
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
            <button type="button" className="icon-button" disabled={submitting} onClick={onCloseCreation} aria-label="关闭添加直播间">
              <X size={16} />
            </button>
          </div>
          <div className="live-add-grid">
            <label>
              <span>添加类型</span>
              <select value={addMode} disabled={submitting} onChange={(event) => setAddMode(event.target.value as "roomId" | "uid")}>
                <option value="roomId">房间号</option>
                <option value="uid">主播 UID</option>
              </select>
            </label>
            <label>
              <span>{addMode === "roomId" ? "房间号" : "主播 UID"}</span>
              <input
                value={identifier}
                disabled={submitting}
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
                disabled={submitting}
                onChange={(event) => setIntervalValue(event.target.value)}
              />
            </label>
            <button type="submit" className="button button-primary live-add-submit" disabled={submitting}>
              <Plus size={16} />{submitting ? "正在解析并添加" : "添加监控"}
            </button>
          </div>
          {formError && <p className="inline-error" role="alert">{formError}</p>}
        </form>
      )}

      {errorMessage && <div className="business-error" role="alert">{errorMessage}</div>}
      {overviewStale && <p className="live-overview-stale" role="status">本次读取未完成，保留上次完整读取的数据；房间、汇总和事件均未更新。请刷新监控数据重试。</p>}
      {((creationOpen && Number(interval) < 120 && Number(interval) > 0)
        || rooms.some(room => (monitorPanel.drafts[room.id] ?? room.intervalSeconds) < 120)) &&
        <p className="inline-warning">短间隔会增加 B站接口请求频率，请确认确有需要。</p>}
      {onReload && (
        <div className="live-data-toolbar">
          <span>自动同步本地采集结果；立即采集请使用房间内的“立即刷新”。</span>
          <button type="button" className="button button-secondary" disabled={refreshing} onClick={() => void onReload()}>
            <RefreshCcw size={15} />刷新监控数据
          </button>
        </div>
      )}
      <div className="live-overview-toolbar" aria-label="房间统计">
        <span>{overviewAvailable ? summary?.totalRooms ?? rooms.length : "—"} 个房间</span>
        <span>{overviewAvailable ? summary?.liveRooms ?? rooms.filter(room => room.liveStatus === 1).length : "—"} 个直播中</span>
        <span>{overviewAvailable ? summary?.errorRooms ?? rooms.filter(room => room.lastErrorType).length : "—"} 个异常</span>
        <span>{overviewAvailable ? summary?.todayLiveStarts ?? 0 : "—"} 个今日开播</span>
      </div>
      <LiveOverviewSummary summary={summary} rooms={rooms} events={events} now={monitorPanel.now} available={overviewAvailable} pending={pending} />

      {view === "直播间" && (
        pending
          ? <LiveState title="正在读取直播间监控" detail="正在读取本地保存的直播间数据。" />
          : !overviewAvailable
            ? <LiveState title="未能读取直播监控数据" detail="请刷新监控数据重试；当前无法确定房间、汇总和事件。" />
          : rooms.length === 0
            ? <LiveState title="尚未监控直播间" detail="点击“添加直播间”后，应用会立即请求 B站公开直播接口并保存首个快照。" />
            : <BilibiliLiveMonitorPanel rooms={rooms} state={monitorPanel} selectedTrendIds={selectedTrendIds}
                busyRoomIds={busyRoomIds} roomActionErrors={roomActionErrors} onAction={onRoomAction} renderRoomData={renderRoomData}
                onToggleTrend={id => onTrendSelectionChange(toggleTrendId(selectedTrendIds, id))} />
      )}

      {overviewAvailable && (view === "趋势对比" || (view === "直播间" && !pending)) && (
        <BilibiliLiveTrendBoard
          showSelector={view === "趋势对比"}
          rooms={rooms}
          trends={trends}
          selectedIds={selectedTrendIds}
          pending={trendPending}
          errorMessage={trendError}
          onReload={onReloadTrends}
          onSelectionChange={onTrendSelectionChange}
        />
      )}

      {(view === "状态事件" || (view === "直播间" && overviewAvailable && rooms.length > 0)) &&
        <LiveStatusEvents events={events} rooms={rooms} now={monitorPanel.now} available={overviewAvailable} pending={pending} />}

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
        <BilibiliLiveSessionPanel
          rooms={rooms}
          sessions={sessions}
          users={sessionUsers}
          detail={sessionDetail}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          loading={sessionPending}
          detailLoading={sessionDetailLoading}
          detailUnavailable={sessionDetailUnavailable}
          errorMessage={sessionPanelError}
          refreshSeconds={sessionRefreshSeconds}
          exportPending={exportPending}
          exportMessage={exportMessage}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
          onRefresh={() => onSessionRefresh?.()}
          onRefreshSecondsChange={seconds => onSessionRefreshSecondsChange?.(seconds)}
          onDismissError={onDismissSessionError}
          onExport={onSessionExport}
        />
      )}

      {view === "数据中心" && (
        <LiveSessionDataView
          key={selectedSessionId ?? selectedSessionRoomId ?? "unselected"}
          rooms={rooms}
          sessions={sessions}
          users={sessionUsers}
          events={sessionEvents}
          filters={sessionEventFilters}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          pending={sessionPending}
          eventsPending={sessionEventsPending}
          usersPending={sessionUsersPending}
          eventsError={sessionEventsError}
          usersError={sessionUsersError}
          eventsStale={sessionEventsStale}
          onRetryEvents={onRetrySessionEvents}
          onRetryUsers={onRetrySessionUsers}
          exportPending={exportPending}
          exportMessage={exportMessage}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
          onFiltersChange={onSessionEventFiltersChange}
          onExport={onSessionExport}
        />
      )}

      {view === "场次分析" && (
        <BilibiliLiveAnalysis
          rooms={rooms}
          sessions={sessions}
          insight={sessionInsight}
          selectedRoomId={selectedSessionRoomId}
          selectedSessionId={selectedSessionId}
          bucketSeconds={insightBucketSeconds}
          loading={sessionPending}
          errorMessage={insightError}
          autoRefresh={insightAutoRefresh}
          refreshSeconds={insightRefreshSeconds}
          onRefresh={onInsightRefresh}
          onAutoRefreshChange={onInsightAutoRefreshChange}
          onRefreshSecondsChange={onInsightRefreshSecondsChange}
          onRoomChange={onSessionRoomChange}
          onSessionChange={onSessionChange}
          onBucketChange={onInsightBucketChange}
        />
      )}
    </section>
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
  rooms: BilibiliLiveRoomV2[]
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
  const running = status?.running === true
  const connected = running && status?.status === "CONNECTED"
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
          {running
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
  rooms: BilibiliLiveRoomV2[]
  summary?: BilibiliLiveRankSummary | BilibiliLiveRankSummaryV2
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
                            <em>{entry.score !== undefined ? formatCount(entry.score) : entry.accompanyDays !== undefined ? `${entry.accompanyDays} 天` : entry.guardLevel !== undefined ? `Lv.${entry.guardLevel}` : "—"}</em>
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

function LiveSessionDataView({
  rooms,
  sessions,
  users,
  events,
  filters,
  selectedRoomId,
  selectedSessionId,
  pending,
  eventsPending,
  usersPending,
  eventsError,
  usersError,
  eventsStale,
  onRetryEvents,
  onRetryUsers,
  exportPending,
  exportMessage,
  onRoomChange,
  onSessionChange,
  onFiltersChange,
  onExport
}: {
  rooms: BilibiliLiveRoomV2[]
  sessions: BilibiliLiveSessionSummary[]
  users: BilibiliLiveSessionUser[]
  events?: BilibiliLiveSessionEventPage
  filters?: QueryBilibiliLiveSessionEventsInput
  selectedRoomId?: string
  selectedSessionId?: string
  pending: boolean
  eventsPending: boolean
  usersPending: boolean
  eventsError?: string
  usersError?: string
  eventsStale: boolean
  onRetryEvents?: () => Promise<unknown>
  onRetryUsers?: () => Promise<unknown>
  exportPending: boolean
  exportMessage?: string
  onRoomChange?: (roomMonitorId: string) => void
  onSessionChange?: (sessionId: string) => void
  onFiltersChange?: (filters: QueryBilibiliLiveSessionEventsInput) => void
  onExport?: (sessionId: string, category: BilibiliLiveSessionExportCategory) => Promise<void>
}): JSX.Element {
  const initialFilters = filters?.sessionId === selectedSessionId ? filters : undefined
  const [draft, setDraft] = useState(() => ({
    kind: initialFilters?.kind ?? "",
    keyword: initialFilters?.keyword ?? "",
    userUid: initialFilters?.userUid ?? "",
    paid: initialFilters?.paid === undefined ? "" : String(initialFilters.paid)
  }))
  const [filterError, setFilterError] = useState<string>()
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
  const applyFilters = (event: FormEvent): void => {
    event.preventDefault()
    if (!sessionId) return
    const userUid = draft.userUid.trim() ? normalizeFollowerUidInput(draft.userUid) : undefined
    if (draft.userUid.trim() && !userUid) {
      setFilterError("请输入有效的正整数 UID，不支持小数或越界值。")
      return
    }
    setFilterError(undefined)
    onFiltersChange?.({
      sessionId, page: 1, size: currentFilters.size,
      ...(draft.kind ? { kind: draft.kind as QueryBilibiliLiveSessionEventsInput["kind"] } : {}),
      ...(draft.keyword.trim() ? { keyword: draft.keyword.trim() } : {}),
      ...(userUid ? { userUid } : {}),
      ...(draft.paid === "" ? {} : { paid: draft.paid === "true" })
    })
  }
  const selectedSession = sessions.find(session => session.id === sessionId)
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
      {pending
        ? <LiveState title="正在读取直播场次" detail="读取本地场次与在线采集覆盖。" />
        : !sessionId
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
              {selectedSession && <section className="live-session-quality" aria-label="场次数据质量">
                <div>
                  <article><span>覆盖状态</span><strong>{coverageLabel(selectedSession.coverageStatus)}</strong></article>
                  <article><span>传输连接</span><strong>{selectedSession.transportSessionCount} 个</strong></article>
                  <article><span>未解析互动事件</span><strong>{formatNullableCount(selectedSession.unresolvedInteractingEventCount)}</strong></article>
                  <article><span>未解析付费事件</span><strong>{formatNullableCount(selectedSession.unresolvedPaidEventCount)}</strong></article>
                </div>
                <p>{sessionCoverageCaveat(selectedSession.coverageStatus)}</p>
              </section>}
              <form className="live-event-filters" onSubmit={applyFilters} aria-label="事件筛选">
                <label>事件类型
                  <select
                    value={draft.kind}
                    onChange={event => setDraft(value => ({ ...value, kind: event.target.value }))}
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
                    value={draft.keyword}
                    maxLength={100}
                    placeholder="昵称、弹幕或礼物关键词"
                    onChange={event => setDraft(value => ({ ...value, keyword: event.target.value }))}
                  />
                </label>
                <label>用户 UID
                  <input
                    value={draft.userUid}
                    inputMode="numeric"
                    placeholder="精确 UID"
                    aria-invalid={Boolean(filterError)}
                    onChange={event => { setFilterError(undefined); setDraft(value => ({ ...value, userUid: event.target.value })) }}
                  />
                </label>
                <label>付费
                  <select
                    value={draft.paid}
                    onChange={event => setDraft(value => ({ ...value, paid: event.target.value }))}
                  >
                    <option value="">全部</option>
                    <option value="true">仅付费</option>
                    <option value="false">仅非付费</option>
                  </select>
                </label>
                <button type="submit" className="button button-secondary">筛选</button>
              </form>
              {filterError && <p className="inline-error" role="alert">{filterError}</p>}
                    <div className="live-data-grid">
                      <section className="live-session-events-table">
                        <header><strong>事件明细</strong><span>{events ? `${events.total} 条` : "—"}</span></header>
                        {eventsPending && <p className="live-query-notice" role="status">正在查询事件；已有结果保留。</p>}
                        {eventsError && <div className="live-query-notice" role="alert">
                          <span>{eventsError}{events ? "；保留上次成功结果。" : "；尚未取得查询结果。"}</span>
                          <button type="button" disabled={eventsPending} onClick={() => void onRetryEvents?.()}>重试事件查询</button>
                        </div>}
                        {eventsStale && events && <p className="live-query-notice" role="status">当前显示上次成功结果，本次查询尚未成功。</p>}
                        {events?.items.length === 0
                          ? <p className="live-table-empty">当前筛选条件没有已保存事件。</p>
                          : events?.items.map((event) => (
                              <article key={event.id}>
                                <span>{sessionEventKindLabel(event.eventKind)}</span>
                                <div>
                                  <strong>{event.senderName ?? "身份未解析"}</strong>
                                  <small>{event.senderUid ? `UID ${event.senderUid}` : "UID 未解析"}</small>
                                </div>
                                <p><span>{event.messageText ?? event.giftName ?? event.command ?? event.eventKind}</span>
                                  <small>数量 {event.giftCount ?? "—"}</small>
                                </p>
                                <em>{formatMilliYuan(event.paidAmountMilliYuan)}</em>
                                <time>{formatTime(event.occurredAt)}</time>
                              </article>
                            ))}
                        <SessionEventPagination result={events} pending={eventsPending} size={currentFilters.size ?? 50}
                          onPageChange={page => onFiltersChange?.({ ...currentFilters, page })}
                          onSizeChange={size => onFiltersChange?.({ ...currentFilters, page: 1, size })} />
                      </section>
                      <aside className="live-session-users-table">
                        <header><strong>用户聚合</strong><span>{users.length === 0 && (usersPending || usersError) ? "尚未取得结果" : `前 ${users.length} 条 · 最多 500 条`}</span></header>
                        {usersPending && <p className="live-query-notice" role="status">正在查询用户；已有结果保留。</p>}
                        {usersError && <div className="live-query-notice" role="alert">
                          <span>{usersError}{users.length ? "；保留上次成功结果。" : "；尚未取得查询结果。"}</span>
                          <button type="button" disabled={usersPending} onClick={() => void onRetryUsers?.()}>重试用户查询</button>
                        </div>}
                        {users.length === 0 && !usersPending && !usersError
                          ? <p className="live-table-empty">暂无可聚合用户事实。</p>
                          : users.map((user) => (
                              <article key={user.actorKey}>
                                <div><strong>{user.displayName ?? "身份未解析"}</strong><small>{user.userUid ? `UID ${user.userUid}` : "未解析事件"}</small></div>
                                <div className="live-user-event-counts">
                                  <span>弹幕 {user.danmakuCount}</span>
                                  <span>礼物事件 {user.giftEventCount}</span>
                                  <span>付费事件 {user.paidEventCount}</span>
                                </div>
                                <em>{formatMilliYuan(user.paidAmountMilliYuan)}</em>
                              </article>
                            ))}
                      </aside>
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
  rooms: BilibiliLiveRoomV2[]
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
        <SearchableSelect label="直播间" value={selectedRoomId} placeholder="选择直播间"
          onChange={value => onRoomChange?.(value)}
          options={rooms.map(room => ({ value: room.id, label: `${room.uname || "未知主播"} · 房间 ${room.roomId}` }))} />
      </label>
      {showSession && (
        <label>直播场次
          <SearchableSelect label="直播场次" value={selectedSessionId ?? ""} placeholder="选择场次"
            disabled={sessions.length === 0} onChange={value => onSessionChange?.(value)}
            options={sessions.length === 0 ? [{ value: "", label: "暂无场次" }]
              : sessions.map(session => ({ value: session.id,
                  label: `#${session.id} · ${formatTime(session.startedAt)} · ${sessionStateLabel(session.state)}` }))} />
        </label>
      )}
    </div>
  )
}

function LiveState({ title, detail }: { title: string; detail: string }): JSX.Element {
  return <div className="live-state"><Radio size={25} /><strong>{title}</strong><span>{detail}</span></div>
}

function useLastSuccessfulLiveTrends(
  rooms: BilibiliLiveRoomV2[],
  data: BilibiliLiveRoomTrendV2[] | undefined,
  updatedAt: number
): BilibiliLiveRoomTrendV2[] {
  // View-only stale snapshots, bounded by the monitored rooms. A changed selection
  // has a different Query key, but must not erase successfully loaded room curves.
  const [saved, setSaved] = useState(() => new Map<string, { trend: BilibiliLiveRoomTrendV2; updatedAt: number }>())
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
  const roomLocks = useRef(new Set<string>())
  const deletedRoomIds = useRef(new Set<string>())
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
  const [insightAutoRefresh, setInsightAutoRefresh] = useState(false)
  const [insightRefreshSeconds, setInsightRefreshSeconds] = useState(10)
  const [exportMessage, setExportMessage] = useState<string>()
  const [rankErrors, setRankErrors] = useState<string[]>([])
  const overviewQuery = useLiveOverviewQuery(bridge)
  const rooms = overviewQuery.data?.roomList.items ?? emptyLiveRooms
  const validSelection = useMemo(
    () => selectedTrendIds.filter((id) => !deletedRoomIds.current.has(id) && rooms.some((room) => room.id === id)).slice(0, 4),
    [rooms, selectedTrendIds]
  )
  const trendsQuery = useLiveTrendQuery(bridge, rooms, overviewQuery.dataUpdatedAt, validSelection, deletedRoomIds.current)
  const lastSuccessfulTrends = useLastSuccessfulLiveTrends(rooms, trendsQuery.data, trendsQuery.dataUpdatedAt)
  const rankQuery = useQuery({
    queryKey: ["bilibili-live", "rank.v2", selectedRankRoomId],
    queryFn: () => {
      if (!selectedRankRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLiveRankV2.summary({ roomMonitorId: selectedRankRoomId })
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
  const sessionPanel = useLiveSessionPanel(bridge, view === "直播场次", selectedSessionRoomId, selectedSessionId, setSelectedSessionId)
  const sessionView = view === "数据中心" || view === "场次分析"
  const sessionLimit = 200
  const sessionsQuery = useQuery({
    queryKey: ["bilibili-live", "sessions", selectedSessionRoomId, sessionLimit],
    queryFn: () => {
      if (!selectedSessionRoomId) throw new Error("尚未选择直播间。")
      return bridge.bilibiliLive.sessions({ roomMonitorId: selectedSessionRoomId, limit: sessionLimit })
    },
    enabled: sessionView && selectedSessionRoomId !== undefined,
    refetchInterval: view === "数据中心" ? 10_000 : false,
    refetchOnWindowFocus: view === "数据中心"
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
    queryFn: async ({ signal }) => {
      const result = await bridge.bilibiliLive.sessionEvents(sessionEventFilters)
      // A bounded page projection, scoped to its session, survives a new filter's failure.
      if (!signal.aborted) queryClient.setQueryData(["bilibili-live", "session-events-success", sessionEventFilters.sessionId], {
        filters: sessionEventFilters, page: result
      })
      return result
    },
    staleTime: 0,
    enabled: view === "数据中心" && selectedSessionId !== undefined
      && sessionEventFilters.sessionId === selectedSessionId,
    refetchInterval: view === "数据中心" ? 10_000 : false
  })
  const successfulSessionEventsQuery = useQuery<{
    filters: QueryBilibiliLiveSessionEventsInput
    page: BilibiliLiveSessionEventPage
  }>({
    queryKey: ["bilibili-live", "session-events-success", selectedSessionId],
    enabled: false
  })
  const sessionInsightQuery = useQuery({
    queryKey: ["bilibili-live", "session-insight", selectedSessionId, insightBucketSeconds],
    queryFn: async ({ signal }) => {
      if (!selectedSessionId) throw new Error("尚未选择直播场次。")
      const result = await bridge.bilibiliLive.sessionInsight({
        sessionId: selectedSessionId,
        bucketSeconds: insightBucketSeconds
      })
      signal.throwIfAborted()
      queryClient.setQueryData(["bilibili-live", "session-insight-success", selectedSessionId], result)
      return result
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: view === "场次分析" && selectedSessionId !== undefined,
    refetchInterval: false
  })
  const successfulSessionInsightQuery = useQuery<BilibiliLiveSessionInsight>({
    queryKey: ["bilibili-live", "session-insight-success", selectedSessionId],
    enabled: false
  })
  const refreshInsight = sessionInsightQuery.refetch
  const insightFetching = sessionInsightQuery.isFetching
  useEffect(() => {
    if (view !== "场次分析" || !insightAutoRefresh || !selectedSessionId || insightFetching) return
    // Like the original fixed-delay loop: the next delay starts after the request settles.
    const timer = setTimeout(() => { void refreshInsight({ cancelRefetch: false }) }, insightRefreshSeconds * 1_000)
    return () => clearTimeout(timer)
  }, [view, insightAutoRefresh, selectedSessionId, insightBucketSeconds, insightFetching, insightRefreshSeconds, refreshInsight])
  const refreshQueries = async (): Promise<void> => {
    const result = await overviewQuery.reload()
    if (!result.isSuccess || result.isFetching) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "rank.v2"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "danmaku"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-users"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-events"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-insight"] })
    ])
    if (view === "直播场次") await sessionPanel.refreshNow()
  }
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: refreshQueries
  })
  const handleRoomAction: BilibiliLiveWorkspacePresentationProps["onRoomAction"] = async (action, room, intervalSeconds, onCommitted) => {
    if (roomLocks.current.has(room.id)) return false
    roomLocks.current.add(room.id)
    setBusyRoomIds([...roomLocks.current])
    setRoomActionErrors((errors) => ({ ...errors, [room.id]: undefined }))
    try {
      if (action === "refresh") {
        const result = await bridge.bilibiliLiveV2.refresh({ roomMonitorId: room.id })
        if (!result.success) throw new Error(result.message)
      } else if (action === "toggle") {
        await bridge.bilibiliLiveV2.updateStatus({ roomMonitorId: room.id, enabled: room.monitorStatus !== "ACTIVE" })
      } else if (action === "interval") {
        await bridge.bilibiliLiveV2.updateSettings({ roomMonitorId: room.id, intervalSeconds: intervalSeconds ?? room.intervalSeconds })
      } else {
        await bridge.bilibiliLive.remove({ roomMonitorId: room.id })
        deletedRoomIds.current.add(room.id)
        await queryClient.cancelQueries({ queryKey: ["bilibili-live", "trends"] })
        setSelectedTrendIds((ids) => ids.filter((id) => id !== room.id))
      }
      // Original actions acknowledge local interaction state before awaiting loadAll.
      onCommitted?.()
      return true
    } catch (error) {
      setRoomActionErrors((errors) => ({ ...errors, [room.id]: errorMessageOf(error) }))
      return false
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
    mutationFn: (roomMonitorId: string) => bridge.bilibiliLiveRankV2.refresh({ roomMonitorId }),
    onSuccess: async (result) => {
      setRankErrors(result.errors)
      await queryClient.invalidateQueries({ queryKey: ["bilibili-live", "rank.v2", result.roomMonitorId] })
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
    if (!overviewQuery.isSuccess) return
    for (const id of deletedRoomIds.current) if (!rooms.some(room => room.id === id)) deletedRoomIds.current.delete(id)
    // normalizeSelection belongs to a successful reread, never to a user's clear click.
    setSelectedTrendIds(current => {
      const valid = current.filter(id => rooms.some(room => room.id === id)).slice(0, 4)
      const initial = rooms.find(room => room.liveStatus === 1) ?? rooms[0]
      const next = valid.length || !initial ? valid : [initial.id]
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next
    })
  }, [overviewQuery.isSuccess, overviewQuery.dataUpdatedAt, rooms])
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
  const sessions = view === "直播场次" ? sessionPanel.sessions : sessionsQuery.data ?? []
  useEffect(() => {
    // A new room/limit query is not an empty result until it has actually loaded.
    if (!sessionView || !sessionsQuery.data) return
    const next = sessions.find((session) => session.id === selectedSessionId)?.id ?? sessions[0]?.id
    if (next !== selectedSessionId) setSelectedSessionId(next)
  }, [selectedSessionId, sessionView, sessions, sessionsQuery.data])
  useEffect(() => {
    if (!selectedSessionId || sessionEventFilters.sessionId === selectedSessionId) return
    setSessionEventFilters(previous => ({ sessionId: selectedSessionId, page: 1, size: previous.size ?? 50 }))
  }, [selectedSessionId, sessionEventFilters.sessionId])
  const retainedSessionEvents = selectedSessionId && sessionEventFilters.sessionId === selectedSessionId
    ? successfulSessionEventsQuery.data
    : undefined
  const displayedSessionEvents = sessionEventFilters.sessionId === selectedSessionId
    ? retainedSessionEvents?.page
    : undefined

  return (
    <BilibiliLiveWorkspacePresentation
      renderRoomData={room => <ConnectedBilibiliLiveDataWidget key={room.id} bridge={bridge}
        room={{ monitorId: room.id, liveStatus: room.liveStatus }} />}
      view={view}
      creationOpen={creationOpen}
      rooms={rooms}
      roomsRevision={overviewQuery.dataUpdatedAt}
      summary={overviewQuery.data?.summary}
      events={overviewQuery.data?.events ?? []}
      trends={lastSuccessfulTrends.filter((trend) => validSelection.includes(trend.room.id))}
      rankSummary={rankQuery.data}
      danmakuStatus={danmakuStatusQuery.data}
      danmakuRecent={danmakuRecentQuery.data ?? []}
      danmakuMetrics={danmakuMetricsQuery.data ?? []}
      sessions={sessions}
      sessionUsers={view === "直播场次" ? sessionPanel.users : sessionUsersQuery.data ?? []}
      sessionDetail={sessionPanel.detail}
      sessionDetailLoading={sessionPanel.detailLoading}
      sessionDetailUnavailable={sessionPanel.detailUnavailable}
      sessionPanelError={sessionPanel.errorMessage}
      sessionRefreshSeconds={sessionPanel.refreshSeconds}
      onSessionRefresh={() => { void sessionPanel.refreshNow() }}
      onSessionRefreshSecondsChange={sessionPanel.setRefreshSeconds}
      onDismissSessionError={sessionPanel.dismissError}
      sessionEvents={displayedSessionEvents}
      sessionInsight={successfulSessionInsightQuery.data}
      sessionEventFilters={sessionEventFilters}
      selectedTrendIds={validSelection}
      selectedRankRoomId={selectedRankRoomId}
      selectedDanmakuRoomId={selectedDanmakuRoomId}
      selectedSessionRoomId={selectedSessionRoomId}
      selectedSessionId={selectedSessionId}
      insightBucketSeconds={insightBucketSeconds}
      insightError={sessionInsightQuery.error ? errorMessageOf(sessionInsightQuery.error) : undefined}
      insightAutoRefresh={insightAutoRefresh}
      insightRefreshSeconds={insightRefreshSeconds}
      onInsightRefresh={() => { void refreshInsight({ cancelRefetch: false }) }}
      onInsightAutoRefreshChange={setInsightAutoRefresh}
      onInsightRefreshSecondsChange={seconds => setInsightRefreshSeconds(
        Number.isFinite(seconds) ? Math.min(3_600, Math.max(3, Math.round(seconds))) : 10
      )}
      rankPending={rankQuery.isPending || rankMutation.isPending}
      danmakuPending={danmakuMutation.isPending || danmakuStatusQuery.isPending}
      sessionPending={view === "直播场次" ? sessionPanel.loading : sessionsQuery.isPending
        || (view === "场次分析" && sessionInsightQuery.isFetching)}
      sessionEventsPending={sessionEventsQuery.isFetching}
      sessionUsersPending={sessionUsersQuery.isFetching}
      sessionEventsError={sessionEventsQuery.error ? errorMessageOf(sessionEventsQuery.error) : undefined}
      sessionUsersError={sessionUsersQuery.error ? errorMessageOf(sessionUsersQuery.error) : undefined}
      sessionEventsStale={Boolean(retainedSessionEvents && (sessionEventsQuery.error
        || !sameSessionEventFilters(retainedSessionEvents.filters, sessionEventFilters)))}
      onRetrySessionEvents={() => sessionEventsQuery.refetch()}
      onRetrySessionUsers={() => sessionUsersQuery.refetch()}
      exportPending={exportMutation.isPending}
      exportMessage={exportMessage}
      rankErrors={rankErrors}
      pending={overviewQuery.isPending && overviewQuery.isFetching}
      overviewAvailable={Boolean(overviewQuery.data)}
      overviewStale={Boolean(overviewQuery.data && overviewQuery.error) && !overviewQuery.isFetching}
      busyRoomIds={busyRoomIds}
      roomActionErrors={roomActionErrors}
      refreshing={overviewQuery.isFetching}
      onReload={refreshQueries}
      trendPending={trendsQuery.pending}
      trendError={trendsQuery.error ? errorMessageOf(trendsQuery.error) : undefined}
      onReloadTrends={() => trendsQuery.refetch()}
      errorMessage={firstErrorMessage(
        overviewQuery.isFetching ? null : overviewQuery.error,
        mutation.error,
        rankQuery.error,
        rankMutation.error,
        danmakuStatusQuery.error,
        danmakuRecentQuery.error,
        danmakuMetricsQuery.error,
        danmakuMutation.error,
        view === "直播场次" ? null : sessionsQuery.error,
        view === "数据中心" ? null : sessionUsersQuery.error,
        view === "数据中心" ? null : sessionEventsQuery.error,
        view === "场次分析" ? null : sessionInsightQuery.error,
        exportMutation.error
      )}
      onAdd={async (input) => {
        let added: BilibiliLiveRoomV2 | undefined
        await mutation.mutateAsync(async () => {
          const room = await bridge.bilibiliLiveV2.add(input)
          added = room
        })
        if (added) {
          const roomId = added.id
          setSelectedTrendIds((ids) => ids.includes(roomId) || ids.length >= 4 ? ids : [...ids, roomId])
        }
        return added
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
        if (view === "直播场次") void sessionPanel.select(sessionId)
        setSelectedSessionId(sessionId)
        setSessionEventFilters(previous => ({ sessionId, page: 1, size: previous.size ?? 50 }))
        setExportMessage(undefined)
      }}
      onSessionEventFiltersChange={filters => {
        // A submitted filter/page always refreshes, even when its cache is still fresh.
        void queryClient.invalidateQueries({ queryKey: ["bilibili-live", "session-events", filters], exact: true, refetchType: "none" })
        setSessionEventFilters(filters)
        if (sameSessionEventFilters(filters, sessionEventFilters)) {
          void sessionEventsQuery.refetch()
        }
      }}
      onInsightBucketChange={setInsightBucketSeconds}
      onSessionExport={async (sessionId, category) => {
        try {
          await exportMutation.mutateAsync({ sessionId, category })
        } catch (error) {
          setExportMessage(errorMessageOf(error))
        }
      }}
    />
  )
}

function toggleTrendId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((value) => value !== id)
  return ids.length >= 4 ? ids : [...ids, id]
}

function sameSessionEventFilters(left: QueryBilibiliLiveSessionEventsInput, right: QueryBilibiliLiveSessionEventsInput): boolean {
  return (["sessionId", "page", "size", "kind", "keyword", "userUid", "paid"] as const)
    .every(field => left[field] === right[field])
}

function formatCount(value: number | string | undefined): string {
  return value === undefined ? "暂无" : typeof value === "string" ? BigInt(value).toLocaleString("zh-CN") : value.toLocaleString("zh-CN")
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

function sessionCoverageCaveat(status: BilibiliLiveSessionSummary["coverageStatus"]): string {
  if (status === "BOUNDARY_ONLY") {
    return "历史边界记录：没有可验证的在线成功解析并持久化区间；空白指标不能解释为 0。"
  }
  if (status === "RECEIVED_WHILE_ONLINE") {
    return "仅覆盖 WebSocket 在线期间成功解析并持久化的受支持事件/记录；不代表平台全量，也不包含未知/畸形帧或持久化失败的数据。"
  }
  return "无在线采集区间：没有可验证的成功解析并持久化记录，当前指标不具备完整覆盖保证。"
}

function formatNullableCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "不可用" : value.toLocaleString("zh-CN")
}

function formatMilliYuan(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "不可用"
    : `¥${(value / 1_000).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
