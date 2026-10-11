import type {
  BilibiliLiveRoomV2,
  BilibiliLiveSessionExportCategory,
  BilibiliLiveSessionSummary,
  BilibiliLiveSessionUser
} from "@bmd/contracts"
import { Download, RefreshCcw, X } from "lucide-react"
import { useState } from "react"
import "./BilibiliLiveSessionPanel.css"

export interface BilibiliLiveSessionPanelProps {
  rooms: readonly BilibiliLiveRoomV2[]
  sessions: readonly BilibiliLiveSessionSummary[]
  users: readonly BilibiliLiveSessionUser[]
  selectedRoomId?: BilibiliLiveRoomV2["id"] | undefined
  selectedSessionId?: BilibiliLiveSessionSummary["id"] | undefined
  detail?: BilibiliLiveSessionSummary | undefined
  loading?: boolean | undefined
  detailLoading?: boolean | undefined
  detailUnavailable?: boolean | undefined
  errorMessage?: string | undefined
  refreshSeconds: number
  exportPending?: boolean | undefined
  exportMessage?: string | undefined
  onRoomChange?: ((roomMonitorId: BilibiliLiveRoomV2["id"]) => void) | undefined
  onSessionChange?: ((sessionId: BilibiliLiveSessionSummary["id"]) => void) | undefined
  onRefresh: () => void
  onRefreshSecondsChange: (seconds: number) => void
  onDismissError?: (() => void) | undefined
  onExport?: ((sessionId: BilibiliLiveSessionSummary["id"], category: BilibiliLiveSessionExportCategory) => void | Promise<void>) | undefined
}

const exportActions: readonly { category: BilibiliLiveSessionExportCategory; label: string }[] = [
  { category: "xlsx", label: "Excel XLSX" },
  { category: "danmaku", label: "弹幕 CSV" },
  { category: "gifts", label: "礼物 CSV" },
  { category: "users", label: "用户 CSV" },
  { category: "all", label: "全部 ZIP" }
]

const captureScopeCaveat = "记录范围仅限本功能部署后，WebSocket 在线期间成功解析并持久化的受支持事件/记录；部署前、断线、未知/畸形帧及持久化失败的数据不在记录范围内。"
const identityMetricsCaveat = "已识别用户仅统计正 UID；未解析身份按事件计数，不代表人数。"

export function BilibiliLiveSessionPanel({
  rooms, sessions, users, selectedRoomId, selectedSessionId, detail, loading = false,
  detailLoading = false, detailUnavailable = false, errorMessage, refreshSeconds = 10,
  exportPending = false, exportMessage, onRoomChange, onSessionChange, onRefresh,
  onRefreshSecondsChange, onDismissError, onExport
}: BilibiliLiveSessionPanelProps) {
  const [exportError, setExportError] = useState<{ sessionId: string; message: string }>()
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? rooms[0]
  const recentSessions = sessions.slice(0, 20)
  const selectionId = selectedSessionId ?? recentSessions[0]?.id
  const selected = detail?.id === selectionId
    ? detail
    : sessions.find(session => session.id === selectionId)
  const topUsers = users.slice(0, 100)

  async function exportSession(sessionId: string, category: BilibiliLiveSessionExportCategory) {
    setExportError(undefined)
    try {
      await onExport?.(sessionId, category)
    } catch (error) {
      setExportError({ sessionId, message: error instanceof Error && error.message ? error.message : "场次导出失败，请重试。" })
    }
  }

  return <section className="live-session-panel bilibili-live-session-panel" aria-label="直播场次边界" aria-busy={loading}>
    <header className="live-session-header">
      <div>
        <h2>直播场次边界</h2>
        <p>场次统计与导出 · {selectedRoom ? `${selectedRoom.uname} · 房间 ${selectedRoom.roomId}` : "请先添加直播间"} · 最近 {recentSessions.length} 场</p>
      </div>
      <div className="session-panel-controls">
        <label className="session-panel-room-select">
          <span>直播间</span>
          <select aria-label="场次直播间" value={selectedRoom?.id ?? ""} disabled={rooms.length === 0} onChange={event => onRoomChange?.(event.currentTarget.value)}>
            {rooms.length === 0 && <option value="">暂无直播间</option>}
            {rooms.map(room => <option key={room.id} value={room.id}>{room.uname} · {room.roomId}</option>)}
          </select>
        </label>
        <div className="session-panel-refresh-controls">
          <label>
            <span>每</span>
            <input type="number" min={1} max={3600} step={1} value={refreshSeconds} aria-label="场次统计自动刷新秒数"
              onChange={event => {
                const value = event.currentTarget.valueAsNumber
                onRefreshSecondsChange(value)
              }} />
            <span>秒刷新</span>
          </label>
          <button className="button" type="button" disabled={loading || !selectedRoom} onClick={onRefresh}>
            <RefreshCcw size={14} aria-hidden="true" />{loading ? "正在刷新" : "立即刷新"}
          </button>
        </div>
      </div>
    </header>

    <p className="session-panel-notice is-warning">{captureScopeCaveat}</p>
    {errorMessage && <div className="session-panel-notice is-error session-panel-error" role="alert">
      <p>{errorMessage}</p>
      {onDismissError && <button type="button" aria-label="关闭场次错误提示" onClick={onDismissError}><X size={14} aria-hidden="true" /></button>}
    </div>}

    {loading && recentSessions.length === 0
      ? <p className="session-panel-empty" role="status">正在读取直播场次</p>
      : recentSessions.length === 0
        ? <p className="session-panel-empty">暂无可用场次记录{rooms.length === 0 ? "，请先添加直播间。" : "。"}</p>
        : <div className="session-panel-layout">
          <aside className="live-session-list" aria-label="最近直播场次">
            {recentSessions.map(session => <button type="button" key={session.id} data-session-id={session.id}
              className={session.id === selectionId ? "is-selected" : ""} aria-pressed={session.id === selectionId}
              onClick={() => onSessionChange?.(session.id)}>
              <span className={`session-panel-state state-${session.state.toLowerCase()}`}>{stateText(session.state)}</span>
              <strong>{formatDateTime(session.startedAt)}</strong>
              <small>{formatDuration(session)}</small>
              <em>{metricCount(session.danmakuCount)} 弹幕 · {metricCount(session.giftEventCount)} 礼物事件</em>
              <small className="session-panel-coverage-label">{coverageText(session.coverageStatus)}</small>
            </button>)}
          </aside>

          <section className="session-panel-detail" aria-label="所选场次详情" aria-busy={detailLoading}>
            {!selected
              ? <p className="session-panel-empty" role="status">{detailLoading ? "明细加载中" : "请选择直播场次"}</p>
              : <>
                <header className="session-panel-detail-heading">
                  <div>
                    <span className={`session-panel-state state-${selected.state.toLowerCase()}`}>{stateText(selected.state)}</span>
                    <h3>{formatDateTime(selected.startedAt)} 场次</h3>
                    <p>场次 #{selected.id} · UID {selected.uid} · 房间 {selected.roomId}</p>
                  </div>
                  {detailLoading && <span className="session-panel-loading" role="status">明细加载中</span>}
                </header>

                {selected.state === "END_PENDING" && <p className="session-panel-notice is-warning">等待结束确认：等待下一次 REST 状态复核；确认下播后关闭。</p>}
                {detailUnavailable && <p className="session-panel-notice">该场次只有可恢复的边界或汇总记录，部分事件和身份记录不可用。</p>}
                <p className={`session-panel-notice${selected.coverageStatus === "RECEIVED_WHILE_ONLINE" ? "" : " is-warning"}`}>
                  {coverageText(selected.coverageStatus)}：{coverageCaveat(selected.coverageStatus)}
                </p>

                <div className="session-panel-time-grid">
                  <div><span>开始</span><strong>{formatDateTime(selected.startedAt)}</strong><small>{sourceText(selected.startSource)}</small></div>
                  <div><span>结束</span><strong>{selected.endedAt ? formatDateTime(selected.endedAt) : selected.state === "INCOMPLETE" ? "结束时间未知" : "进行中"}</strong><small>{sourceText(selected.endSource)}</small></div>
                  <div><span>时长</span><strong>{formatDuration(selected)}</strong><small>首末事件 {eventRangeText(selected)}</small></div>
                </div>

                <div className="session-panel-metrics">
                  {([
                    ["弹幕数", selected.danmakuCount],
                    ["礼物事件", selected.giftEventCount],
                    ["礼物数量", selected.giftCount],
                    ["免费礼物", selected.freeGiftCount],
                    ["已识别送礼用户", selected.giftSenderCount],
                    ["已识别付费用户", selected.paidUserCount],
                    ["已识别互动用户", selected.interactingUserCount],
                    ["未解析互动事件", selected.unresolvedInteractingEventCount],
                    ["未解析送礼事件", selected.unresolvedGiftEventCount],
                    ["未解析付费事件", selected.unresolvedPaidEventCount]
                  ] as const).map(([label, value]) => <div className="session-panel-stat" key={label}><span>{label}</span><strong>{metricCount(value)}</strong></div>)}
                  <div className="session-panel-stat is-money"><span>消费金额</span><strong>{formatMilliYuan(selected.paidAmountMilliYuan)}</strong></div>
                </div>
                <p className="session-panel-identity-caveat">{identityMetricsCaveat}</p>

                <div className="session-panel-export-actions" aria-busy={exportPending}>
                  <strong>导出当前场次</strong>
                  {exportActions.map(action => <button type="button" key={action.category}
                    className={`button${action.category === "xlsx" ? " button-primary" : ""}`} disabled={exportPending || !onExport}
                    onClick={() => void exportSession(selected.id, action.category)}>
                    <Download size={13} aria-hidden="true" />{action.label}
                  </button>)}
                </div>
                {exportPending && <p className="session-panel-export-feedback" role="status">正在导出当前场次…</p>}
                {exportMessage && <p className="session-panel-export-feedback" role="status">{exportMessage}</p>}
                {exportError?.sessionId === selected.id && <p className="session-panel-notice is-error" role="alert">{exportError.message}</p>}

                <section className="session-panel-top-users" aria-label="Top 身份记录">
                  <header>
                    <div><h3>Top 身份记录</h3><p>按统计顺序展示最多 100 条用户或未解析身份记录。</p></div>
                    <span>{topUsers.length} 条</span>
                  </header>
                  {topUsers.length === 0
                    ? <p className="session-panel-empty" role={detailLoading ? "status" : undefined}>{detailLoading ? "身份记录加载中" : "该场次暂无身份记录"}</p>
                    : <div className="session-panel-user-list" role="list">
                      {topUsers.map((user, index) => <article key={user.actorKey} role="listitem">
                        <span className="session-panel-user-rank">{index + 1}</span>
                        <strong className="session-panel-user-name" title={userName(user)}>{userName(user)}</strong>
                        <small className="session-panel-user-identity" title={userIdentityText(user)}>{userIdentityText(user)}</small>
                        <div className="session-panel-user-stats"><span>{user.danmakuCount} 弹幕</span><span>{user.giftCount} 礼物</span><span>{user.paidEventCount} 次付费</span></div>
                        <strong className="session-panel-user-money">{formatMilliYuan(user.paidAmountMilliYuan)}</strong>
                      </article>)}
                    </div>}
                </section>
              </>}
          </section>
        </div>}
  </section>
}

function stateText(state: BilibiliLiveSessionSummary["state"]): string {
  if (state === "END_PENDING") return "等待结束确认"
  if (state === "OPEN") return "进行中"
  if (state === "CLOSED") return "已结束"
  return "历史边界"
}

function coverageText(status: BilibiliLiveSessionSummary["coverageStatus"]): string {
  if (status === "BOUNDARY_ONLY") return "仅历史边界"
  if (status === "RECEIVED_WHILE_ONLINE") return "在线接收覆盖"
  return "无在线覆盖"
}

function coverageCaveat(status: BilibiliLiveSessionSummary["coverageStatus"]): string {
  if (status === "BOUNDARY_ONLY") return "历史边界记录：没有可验证的在线成功解析并持久化区间；空白指标不能解释为 0。"
  if (status === "RECEIVED_WHILE_ONLINE") return "仅覆盖 WebSocket 在线期间成功解析并持久化的受支持事件/记录；不代表平台全量，也不包含未知/畸形帧或持久化失败的数据。"
  return "无在线采集区间：没有可验证的成功解析并持久化记录，当前指标不具备完整覆盖保证。"
}

function formatDateTime(value: string | null): string {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date)
}

function formatDuration(session: BilibiliLiveSessionSummary): string {
  if (!session.endedAt && session.state === "INCOMPLETE") return "--"
  const start = Date.parse(session.startedAt)
  const end = session.endedAt ? Date.parse(session.endedAt) : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "--"
  const seconds = Math.floor((end - start) / 1000)
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}小时 ${minutes}分 ${seconds % 60}秒`
  if (minutes > 0) return `${minutes}分 ${seconds % 60}秒`
  return `${seconds}秒`
}

function sourceText(source: string | null): string {
  return source ? `来源 ${source}` : "来源未知"
}

function eventRangeText(session: BilibiliLiveSessionSummary): string {
  if (!session.firstEventAt && !session.lastEventAt) return "--"
  return `${formatDateTime(session.firstEventAt)} ～ ${formatDateTime(session.lastEventAt)}`
}

function metricCount(value: number | null): string {
  return value == null ? "--" : value.toLocaleString("zh-CN")
}

function formatMilliYuan(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--"
  return `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value / 1000)}`
}

function verifiedUid(user: BilibiliLiveSessionUser): boolean {
  return user.identityQuality === "VERIFIED_UID" && user.userUid != null && /^[1-9]\d*$/.test(user.userUid)
}

function userName(user: BilibiliLiveSessionUser): string {
  return user.displayName?.trim() || (verifiedUid(user) ? `UID ${user.userUid}` : "匿名用户")
}

function userIdentityText(user: BilibiliLiveSessionUser): string {
  return verifiedUid(user) ? `UID ${user.userUid}` : `身份未解析 · ${user.actorKey}`
}
