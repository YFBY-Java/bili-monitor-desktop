import type {
  BilibiliFollowerMonitor,
  BilibiliLiveRankFamily,
  BilibiliLiveRankSnapshot,
  BilibiliLiveRankSummary,
  BilibiliLiveRoom,
  BilibiliSubject,
  BilibiliSubjectTrend,
  BilibiliSubjectWorkbench,
  DesktopBridge
} from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  ArrowLeft,
  CircleAlert,
  Clock3,
  Database,
  LayoutGrid,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Trash2,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { useMemo, useState, type FormEvent, type JSX } from "react"

export interface BilibiliSubjectListViewProps {
  subjects: BilibiliSubject[]
  loading: boolean
  error: string | null
  onOpen: (subjectId: string) => void
  onDelete: (subjectId: string) => void
  onRefresh: () => void
}

export interface BilibiliSubjectWorkbenchViewProps {
  workbench?: BilibiliSubjectWorkbench
  trend?: BilibiliSubjectTrend
  rankSummary?: BilibiliLiveRankSummary
  rankPending: boolean
  loading: boolean
  error: string | null
  onBack: () => void
  onRefresh: () => void
  onToggleStatus: () => void
  onOpenBinding: () => void
  onResetLayout: () => void
  onDanmakuStart: (protocolVersion: number) => void
  onDanmakuStop: () => void
  onRankRefresh: (family: BilibiliLiveRankFamily) => void
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("zh-CN").format(value)
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return "暂无对比"
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("zh-CN").format(value)}`
}

function formatTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未采集"
}

function liveText(status: 0 | 1 | 2 | undefined): string {
  if (status === 1) return "直播中"
  if (status === 2) return "轮播中"
  if (status === 0) return "未开播"
  return "未绑定直播间"
}

function danmuText(status: string): string {
  if (status === "connected") return "弹幕采集中"
  if (status === "waiting") return "等待连接"
  if (status === "error") return "连接异常"
  if (status === "missing_live_room") return "未绑定直播间"
  if (status === "disabled") return "未启用"
  return status
}

function rankSnapshotKey(snapshot: BilibiliLiveRankSnapshot): string {
  return [snapshot.rankType, snapshot.rankSwitch, snapshot.periodScope].filter(Boolean).join(":")
}

function rankSnapshotLabel(snapshot: BilibiliLiveRankSnapshot): string {
  const key = rankSnapshotKey(snapshot)
  const labels: Record<string, string> = {
    "online_rank:contribution_rank": "在线贡献",
    "online_rank:online_rank": "在线榜",
    "entry_rank": "进房榜",
    "contribution_rank:day": "日榜",
    "contribution_rank:week": "周榜",
    "contribution_rank:month": "月榜",
    guard_weekly: "大航海周榜",
    guard_monthly: "大航海月榜"
  }
  return labels[key] ?? labels[snapshot.rankType] ?? snapshot.rankType
}

function SubjectDanmakuWidget({
  workbench,
  rankSummary,
  rankPending,
  onDanmakuStart,
  onDanmakuStop,
  onRankRefresh
}: {
  workbench: BilibiliSubjectWorkbench
  rankSummary?: BilibiliLiveRankSummary
  rankPending: boolean
  onDanmakuStart: (protocolVersion: number) => void
  onDanmakuStop: () => void
  onRankRefresh: (family: BilibiliLiveRankFamily) => void
}): JSX.Element {
  const [mode, setMode] = useState<"danmu" | "audience" | "guard">("danmu")
  const [protocolVersion, setProtocolVersion] = useState(-1)
  const [selectedRankKey, setSelectedRankKey] = useState<string>()
  const family: BilibiliLiveRankFamily = mode === "guard" ? "GUARD" : "AUDIENCE"
  const snapshots = rankSummary?.snapshots.filter((item) => item.rankFamily === family) ?? []
  const activeSnapshot = snapshots.find((item) => rankSnapshotKey(item) === selectedRankKey)
    ?? snapshots[0]
  const count = family === "GUARD"
    ? rankSummary?.guardCountText ?? rankSummary?.guardCount
    : rankSummary?.audienceCountText ?? rankSummary?.audienceCount

  return (
    <article className="panel subject-widget subject-live-data-widget">
      <div className="panel-header compact">
        <div><p>LIVE ROOM DATA</p><h2>{mode === "danmu" ? "直播弹幕" : mode === "guard" ? "大航海榜单" : "房间观众榜单"}</h2></div>
        <span className={`subject-status ${workbench.danmu.status === "connected" ? "is-active" : ""}`}>{danmuText(workbench.danmu.status)}</span>
      </div>
      <div className="subject-data-modes" role="tablist" aria-label="直播间数据视图">
        {([[
          "danmu", "弹幕", "实时流"
        ], ["audience", "房间观众", "榜单"], ["guard", "大航海", "舰长"]] as const).map(([value, label, hint]) => (
          <button key={value} type="button" className={mode === value ? "is-active" : ""} aria-selected={mode === value} onClick={() => { setMode(value); setSelectedRankKey(undefined) }}>
            <strong>{label}</strong><span>{hint}</span>
          </button>
        ))}
      </div>

      {mode === "danmu" ? <>
        <div className="subject-danmu-metrics">
          <div><span>每分钟</span><strong>{workbench.danmu.ratePerMinute ?? "—"}</strong></div>
          <div><span>近 5 分钟</span><strong>{workbench.danmu.last5MinutesCount ?? "—"}</strong></div>
          <div><span>点赞增量</span><strong>{workbench.danmu.likeIncrement ?? "—"}</strong></div>
        </div>
        {workbench.danmu.enabled && workbench.bilibiliLiveRoom && (
          <div className="subject-danmu-actions">
            <select aria-label="弹幕协议版本" value={protocolVersion} onChange={(event) => setProtocolVersion(Number(event.target.value))}>
              <option value={-1}>自动兼容</option><option value={3}>protover=3</option><option value={2}>protover=2</option><option value={1}>protover=1</option><option value={0}>protover=0</option>
            </select>
            {workbench.danmu.status === "connected"
              ? <button className="button button-secondary" type="button" onClick={onDanmakuStop}>停止弹幕监控</button>
              : <button className="button button-primary" type="button" onClick={() => onDanmakuStart(protocolVersion)}>手动开启弹幕监控</button>}
          </div>
        )}
        <div className="subject-danmu-list">
          {workbench.danmu.recentMessages.length === 0 ? <span>暂无实时弹幕</span> : workbench.danmu.recentMessages.map((message, index) => (
            <div key={`${message.sentAt}-${index}`}><strong>{message.displayName || "匿名用户"}</strong><span>{message.messageText}</span><time>{new Date(message.sentAt).toLocaleTimeString("zh-CN", { hour12: false })}</time></div>
          ))}
        </div>
      </> : <div className="subject-rank-panel">
        <div className="subject-rank-summary"><span>{family === "GUARD" ? "大航海人数" : "房间观众"}</span><strong>{count ?? "—"}</strong><button className="button button-secondary" type="button" disabled={rankPending || !workbench.bilibiliLiveRoom} onClick={() => onRankRefresh(family)}>{rankPending ? "读取中…" : "刷新榜单"}</button></div>
        {!workbench.bilibiliLiveRoom ? <div className="subject-rank-empty"><strong>需要先绑定直播间监控</strong><span>绑定直播间后才能读取真实榜单。</span></div> : snapshots.length === 0 ? <div className="subject-rank-empty"><strong>暂无榜单快照</strong><span>点击刷新榜单后读取 B站真实数据。</span></div> : <>
          <div className="subject-rank-tabs">{snapshots.map((snapshot) => {
            const key = rankSnapshotKey(snapshot)
            return <button key={snapshot.id} type="button" className={activeSnapshot?.id === snapshot.id ? "is-active" : ""} onClick={() => setSelectedRankKey(key)}>{rankSnapshotLabel(snapshot)}</button>
          })}</div>
          <div className="subject-rank-list">{activeSnapshot?.entries.length ? activeSnapshot.entries.slice().sort((left, right) => (left.rankNo ?? 9999) - (right.rankNo ?? 9999)).slice(0, 100).map((entry, index) => (
            <div key={`${entry.userUid ?? "anonymous"}-${entry.rankNo ?? index}`}><em>{entry.rankNo ?? index + 1}</em><span>{entry.faceUrl ? <img src={entry.faceUrl} alt="" referrerPolicy="no-referrer" /> : (entry.displayName || "匿").slice(0, 1)}</span><strong>{entry.displayName || "匿名用户"}</strong><small>{entry.guardLevel ? `大航海等级 ${entry.guardLevel}` : entry.medalName ? `${entry.medalName} ${entry.medalLevel ?? ""}` : `UID ${entry.userUid ?? "—"}`}</small><b>{entry.score === undefined ? "—" : formatCount(entry.score)}</b></div>
          )) : <span>这个榜单暂无明细</span>}</div>
        </>}
      </div>}
    </article>
  )
}

function SubjectAvatar({ subject }: { subject: BilibiliSubject }): JSX.Element {
  return (
    <div className="subject-avatar">
      {subject.avatarUrl
        ? <img src={subject.avatarUrl} alt="" referrerPolicy="no-referrer" />
        : <span>{subject.displayName.slice(0, 1).toUpperCase()}</span>}
    </div>
  )
}

export function BilibiliSubjectListView({
  subjects,
  loading,
  error,
  onOpen,
  onDelete,
  onRefresh
}: BilibiliSubjectListViewProps): JSX.Element {
  const followerCount = subjects.filter((item) => item.bilibiliBinding?.bilibiliUserMonitorId).length
  const liveCount = subjects.filter((item) => item.bilibiliBinding?.bilibiliLiveRoomMonitorId).length
  const danmuCount = subjects.filter((item) => item.bilibiliBinding?.danmuEnabled).length

  return (
    <>
      <section className="business-metrics subject-metrics" aria-label="用户监控统计">
        <div><span>监控对象</span><strong>{subjects.length}</strong></div>
        <div><span>已绑定粉丝</span><strong>{followerCount}</strong></div>
        <div><span>已绑定直播</span><strong>{liveCount}</strong></div>
        <div><span>弹幕监控</span><strong>{danmuCount}</strong></div>
      </section>

      {loading ? (
        <div className="follower-state" role="status">
          <LoaderCircle className="spin" size={20} />
          <div><strong>正在读取用户监控对象</strong><span>主体、绑定和布局来自本机 SQLite v10。</span></div>
        </div>
      ) : error ? (
        <div className="follower-state is-error" role="alert">
          <CircleAlert size={20} />
          <div><strong>用户监控暂时不可用</strong><span>{error}</span></div>
          <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCcw size={14} />重新加载</button>
        </div>
      ) : (
        <section className="panel subject-directory">
          <div className="panel-header compact">
            <div><p>BILIBILI USER WORKBENCHES</p><h2>用户监控对象</h2></div>
            <span className="business-safety"><Activity size={14} />真实本地聚合</span>
          </div>
          {subjects.length === 0 ? (
            <div className="business-empty">
              <UserRoundPlus size={26} />
              <strong>还没有用户监控对象</strong>
              <span>点击右上角“创建用户工作台”，输入 B站 UID 后自动复用或创建粉丝、直播监控。</span>
            </div>
          ) : (
            <div className="subject-list">
              {subjects.map((subject) => (
                <article className="subject-card" key={subject.id}>
                  <div className="subject-card-profile">
                    <SubjectAvatar subject={subject} />
                    <div>
                      <strong>{subject.displayName}</strong>
                      <span>{subject.remark || "Bilibili 指定用户工作台"}</span>
                    </div>
                    <em className={subject.monitorStatus === "ACTIVE" ? "is-active" : ""}>
                      {subject.monitorStatus === "ACTIVE" ? "启用" : "停用"}
                    </em>
                  </div>
                  <div className="subject-binding-tags">
                    {subject.bilibiliBinding?.mid && <span>UID {subject.bilibiliBinding.mid}</span>}
                    {subject.bilibiliBinding?.bilibiliUserMonitorId && <span>粉丝监控</span>}
                    {subject.bilibiliBinding?.roomId && <span>房间 {subject.bilibiliBinding.roomId}</span>}
                    {subject.bilibiliBinding?.danmuEnabled && <span>弹幕已启用</span>}
                    {!subject.bilibiliBinding && <span>未绑定 B站资源</span>}
                  </div>
                  <div className="subject-card-meta">
                    <span>健康 <strong>{Math.round(subject.healthScore ?? 0)}</strong></span>
                    <span>最近成功 <strong>{formatTime(subject.lastSuccessAt)}</strong></span>
                  </div>
                  <div className="subject-card-actions">
                    <button className="button button-secondary" type="button" onClick={() => onOpen(subject.id)}>打开工作台</button>
                    <button className="icon-button is-danger" type="button" aria-label={`删除 ${subject.displayName}`} onClick={() => onDelete(subject.id)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

function SubjectTrendChart({ trend }: { trend?: BilibiliSubjectTrend }): JSX.Element {
  const points = trend?.points ?? []
  const width = 720
  const height = 220
  const line = (key: "followerCount" | "liveOnlineCount") => {
    const values = points.map((point) => point[key]).filter((value): value is number => value !== undefined)
    if (values.length === 0) return ""
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const span = Math.max(1, maximum - minimum)
    return points.map((point, index) => {
      const value = point[key]
      if (value === undefined) return null
      const x = points.length === 1 ? width / 2 : 18 + (index / (points.length - 1)) * (width - 36)
      const y = height - 18 - ((value - minimum) / span) * (height - 36)
      return `${x},${y}`
    }).filter(Boolean).join(" ")
  }
  const followerLine = line("followerCount")
  const liveLine = line("liveOnlineCount")
  return (
    <div className="subject-trend-chart">
      {points.length === 0 ? <span>暂无趋势点，等待粉丝或直播采集快照</span> : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="粉丝与直播热度趋势">
          <path d={`M 0 ${height - 18} H ${width}`} className="chart-axis" />
          {followerLine && <polyline points={followerLine} className="subject-line follower" />}
          {liveLine && <polyline points={liveLine} className="subject-line live" />}
        </svg>
      )}
      <div className="subject-chart-legend"><span className="follower">粉丝数</span><span className="live">直播间热度</span></div>
    </div>
  )
}

export function BilibiliSubjectWorkbenchView({
  workbench,
  trend,
  rankSummary,
  rankPending,
  loading,
  error,
  onBack,
  onRefresh,
  onToggleStatus,
  onOpenBinding,
  onResetLayout,
  onDanmakuStart,
  onDanmakuStop,
  onRankRefresh
}: BilibiliSubjectWorkbenchViewProps): JSX.Element {
  if (loading) return (
    <div className="follower-state" role="status">
      <LoaderCircle className="spin" size={20} />
      <div><strong>正在聚合用户工作台</strong><span>读取粉丝、直播、弹幕、布局和健康事件。</span></div>
    </div>
  )
  if (error) return (
    <div className="follower-state is-error" role="alert">
      <CircleAlert size={20} />
      <div><strong>工作台加载失败</strong><span>{error}</span></div>
      <button className="button button-secondary" type="button" onClick={onRefresh}>重试</button>
    </div>
  )
  if (!workbench) return (
    <div className="business-empty"><UsersRound size={26} /><strong>请先选择监控对象</strong><span>从“监控对象”列表打开一个用户工作台。</span></div>
  )

  return (
    <div className="subject-workbench">
      <section className="subject-workbench-head">
        <button className="icon-button" type="button" aria-label="返回监控对象" onClick={onBack}><ArrowLeft size={16} /></button>
        <SubjectAvatar subject={workbench.subject} />
        <div className="subject-workbench-title">
          <p>BILIBILI USER WORKBENCH</p>
          <h2>{workbench.subject.displayName}</h2>
          <div>
            {workbench.bilibiliUser && <span>UID {workbench.bilibiliUser.mid}</span>}
            <span className={workbench.bilibiliLiveRoom?.liveStatus === 1 ? "is-live" : ""}>{liveText(workbench.bilibiliLiveRoom?.liveStatus)}</span>
            <span>{workbench.summary.enabledModuleCount}/{workbench.summary.totalModuleCount} 模块</span>
            <span>{danmuText(workbench.danmu.status)}</span>
          </div>
        </div>
        <div className="subject-workbench-actions">
          <button className="button button-secondary" type="button" onClick={onOpenBinding}><Settings2 size={14} />绑定资源</button>
          <button className="button button-secondary" type="button" onClick={onToggleStatus}>
            {workbench.subject.monitorStatus === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
            {workbench.subject.monitorStatus === "ACTIVE" ? "暂停工作台" : "恢复工作台"}
          </button>
          <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCcw size={14} />刷新</button>
        </div>
        <div className="subject-health-score">
          <span>采集健康</span><strong>{Math.round(workbench.summary.healthScore)}</strong><em>{workbench.summary.healthScore >= 85 ? "正常" : workbench.summary.healthScore >= 65 ? "关注" : "异常"}</em>
        </div>
      </section>

      <section className="subject-kpis">
        <div><span>总粉丝数</span><strong>{formatCount(workbench.summary.followerCount)}</strong><small>24h {formatDelta(workbench.summary.followerDelta24h)}</small></div>
        <div><span>直播间热度</span><strong>{formatCount(workbench.summary.onlineCount)}</strong><small>峰值 {formatCount(workbench.summary.onlinePeak24h)}</small></div>
        <div><span>弹幕速率</span><strong>{workbench.summary.danmuPerMinute === undefined ? "—" : `${workbench.summary.danmuPerMinute} /min`}</strong><small>近 5 分钟 {workbench.summary.danmuLast5Minutes ?? "—"} 条</small></div>
        <div><span>最近成功采集</span><strong>{formatTime(workbench.summary.lastSuccessAt)}</strong><small>下一轮 {formatTime(workbench.summary.nextCollectAt)}</small></div>
      </section>

      <section className="subject-widget-grid">
        <article className="panel subject-widget subject-widget-wide">
          <div className="panel-header compact"><div><p>FOLLOWER / LIVE HEAT</p><h2>粉丝数与直播热度监控</h2></div><span className="business-safety"><TrendingUp size={14} />24 小时</span></div>
          <SubjectTrendChart trend={trend} />
          <div className="subject-widget-stats">
            <div><span>当前粉丝</span><strong>{formatCount(workbench.summary.followerCount)}</strong></div>
            <div><span>24h 净增</span><strong>{formatDelta(workbench.summary.followerDelta24h)}</strong></div>
            <div><span>当前热度</span><strong>{formatCount(workbench.summary.onlineCount)}</strong></div>
            <div><span>热度峰值</span><strong>{formatCount(workbench.summary.onlinePeak24h)}</strong></div>
          </div>
        </article>

        <SubjectDanmakuWidget workbench={workbench} rankSummary={rankSummary} rankPending={rankPending} onDanmakuStart={onDanmakuStart} onDanmakuStop={onDanmakuStop} onRankRefresh={onRankRefresh} />

        <article className="panel subject-widget subject-widget-wide">
          <div className="panel-header compact"><div><p>COLLECTION HEALTH</p><h2>采集健康与事件</h2></div><span className="business-safety"><Activity size={14} />{Math.round(workbench.summary.healthScore)}</span></div>
          <div className="subject-health-stats">
            <div><span>启用模块</span><strong>{workbench.summary.enabledModuleCount}/{workbench.summary.totalModuleCount}</strong></div>
            <div><span>下一轮采集</span><strong>{formatTime(workbench.summary.nextCollectAt)}</strong></div>
            <div><span>最近成功</span><strong>{formatTime(workbench.summary.lastSuccessAt)}</strong></div>
          </div>
          <div className="subject-event-list">
            {workbench.recentEvents.map((event) => (
              <div key={`${event.eventType}-${event.occurredAt}`}><i className={event.level} /><strong>{event.title}</strong><span>{event.description || event.source}</span><time>{formatTime(event.occurredAt)}</time></div>
            ))}
          </div>
        </article>

        <article className="panel subject-widget subject-layout-widget">
          <div className="panel-header compact"><div><p>WIDGET LAYOUT</p><h2>组件布局</h2></div><LayoutGrid size={17} /></div>
          <div className="subject-layout-list">
            {workbench.layout.map((item) => <div key={item.widgetKey}><Database size={14} /><span>{item.widgetKey}</span><strong>{item.enabled ? "显示" : "隐藏"}</strong></div>)}
          </div>
          <button className="button button-secondary" type="button" onClick={onResetLayout}><RotateCcw size={14} />恢复默认布局</button>
        </article>
      </section>
    </div>
  )
}

function CreateSubjectDrawer({
  open,
  error,
  onClose,
  onCreate
}: {
  open: boolean
  error?: string
  onClose: () => void
  onCreate: (input: { mid: string; displayName?: string; danmuEnabled: boolean }) => Promise<void>
}): JSX.Element | null {
  const [mid, setMid] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [danmuEnabled, setDanmuEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitting(true)
    void onCreate({
      mid,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      danmuEnabled
    }).finally(() => setSubmitting(false))
  }
  return (
    <div className="creation-backdrop" role="presentation">
      <section className="creation-drawer" role="dialog" aria-modal="true" aria-label="创建用户工作台">
        <div className="creation-head"><div><p>BILIBILI USER WORKBENCH</p><h2>创建用户工作台</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={17} /></button></div>
        <form className="creation-form" onSubmit={submit}>
          <label><span>B站 UID</span><input required inputMode="numeric" pattern="[1-9][0-9]*" value={mid} onChange={(event) => setMid(event.target.value)} placeholder="例如：401742377" /></label>
          <label><span>工作台名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="可留空，默认使用 B站昵称" /></label>
          <label className="subject-check"><input type="checkbox" checked={danmuEnabled} onChange={(event) => setDanmuEnabled(event.target.checked)} /><span>启用弹幕模块</span></label>
          <p className="form-note"><Activity size={14} />提交后会先创建或复用该 UID 的粉丝监控，再尝试创建或复用同 UID 的直播间监控；没有公开直播间时，仍会保留粉丝监控并创建工作台。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={submitting} type="submit">{submitting ? "正在创建…" : "创建工作台"}</button></div>
        </form>
      </section>
    </div>
  )
}

function BindingDrawer({
  workbench,
  users,
  rooms,
  open,
  error,
  onClose,
  onSave
}: {
  workbench?: BilibiliSubjectWorkbench
  users: BilibiliFollowerMonitor[]
  rooms: BilibiliLiveRoom[]
  open: boolean
  error?: string
  onClose: () => void
  onSave: (input: { bilibiliUserMonitorId?: string; bilibiliLiveRoomMonitorId?: string; danmuEnabled: boolean }) => Promise<void>
}): JSX.Element | null {
  const [userId, setUserId] = useState(workbench?.bilibiliBinding?.bilibiliUserMonitorId ?? "")
  const [roomId, setRoomId] = useState(workbench?.bilibiliBinding?.bilibiliLiveRoomMonitorId ?? "")
  const [danmuEnabled, setDanmuEnabled] = useState(workbench?.bilibiliBinding?.danmuEnabled ?? true)
  const [submitting, setSubmitting] = useState(false)
  if (!open || !workbench) return null
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitting(true)
    void onSave({
      ...(userId ? { bilibiliUserMonitorId: userId } : {}),
      ...(roomId ? { bilibiliLiveRoomMonitorId: roomId } : {}),
      danmuEnabled
    }).finally(() => setSubmitting(false))
  }
  return (
    <div className="creation-backdrop" role="presentation">
      <section className="creation-drawer" role="dialog" aria-modal="true" aria-label="绑定 B站监控资源">
        <div className="creation-head"><div><p>BILIBILI RESOURCE BINDING</p><h2>绑定 B站监控资源</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={17} /></button></div>
        <form className="creation-form" onSubmit={submit}>
          <label><span>粉丝监控用户</span><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">不更换</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nickname} · UID {user.mid}</option>)}</select></label>
          <label><span>直播间监控</span><select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">不更换</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.uname} · 房间 {room.roomId}</option>)}</select></label>
          <label className="subject-check"><input type="checkbox" checked={danmuEnabled} onChange={(event) => setDanmuEnabled(event.target.checked)} /><span>启用弹幕监控</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={submitting} type="submit">{submitting ? "正在保存…" : "保存绑定"}</button></div>
        </form>
      </section>
    </div>
  )
}

export function ConnectedBilibiliSubjectWorkspace({
  bridge,
  view,
  creationOpen,
  onCloseCreation,
  onOpenWorkbench,
  onBackToList
}: {
  bridge: DesktopBridge
  view: "监控对象" | "用户工作台"
  creationOpen: boolean
  onCloseCreation: () => void
  onOpenWorkbench: () => void
  onBackToList: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>()
  const [bindingOpen, setBindingOpen] = useState(false)
  const subjectsQuery = useQuery({
    queryKey: ["bilibili-subjects"],
    queryFn: () => bridge.bilibiliSubjects.list({ limit: 500 }),
    refetchInterval: 30_000
  })
  const effectiveSubjectId = selectedSubjectId ?? subjectsQuery.data?.[0]?.id
  const workbenchQuery = useQuery({
    queryKey: ["bilibili-subject-workbench", effectiveSubjectId],
    queryFn: () => bridge.bilibiliSubjects.workbench({ subjectId: effectiveSubjectId! }),
    enabled: view === "用户工作台" && Boolean(effectiveSubjectId),
    refetchInterval: 15_000
  })
  const trendQuery = useQuery({
    queryKey: ["bilibili-subject-trends", effectiveSubjectId],
    queryFn: () => bridge.bilibiliSubjects.trends({ subjectId: effectiveSubjectId! }),
    enabled: view === "用户工作台" && Boolean(effectiveSubjectId),
    refetchInterval: 30_000
  })
  const roomMonitorId = workbenchQuery.data?.bilibiliLiveRoom?.monitorId
  const rankQuery = useQuery({
    queryKey: ["bilibili-subject-ranks", roomMonitorId],
    queryFn: () => bridge.bilibiliLive.rankSummary({ roomMonitorId: roomMonitorId! }),
    enabled: view === "用户工作台" && Boolean(roomMonitorId),
    refetchInterval: 60_000
  })
  const usersQuery = useQuery({
    queryKey: ["bilibili-followers"],
    queryFn: () => bridge.bilibiliFollowers.list({ limit: 500 }),
    enabled: bindingOpen
  })
  const roomsQuery = useQuery({
    queryKey: ["bilibili-live-rooms"],
    queryFn: () => bridge.bilibiliLive.list({ limit: 500 }),
    enabled: bindingOpen
  })
  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bilibili-subjects"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-subject-workbench"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-subject-trends"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-subject-ranks"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-followers"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live-rooms"] })
    ])
  }
  const createMutation = useMutation({
    mutationFn: (input: { mid: string; displayName?: string; danmuEnabled: boolean }) => bridge.bilibiliSubjects.create(input),
    onSuccess: async (created) => {
      setSelectedSubjectId(created.id)
      onCloseCreation()
      onOpenWorkbench()
      await invalidate()
    }
  })
  const deleteMutation = useMutation({
    mutationFn: (subjectId: string) => bridge.bilibiliSubjects.remove({ subjectId }),
    onSuccess: invalidate
  })
  const updateMutation = useMutation({
    mutationFn: (input: { subjectId: string; enabled: boolean }) => bridge.bilibiliSubjects.update(input),
    onSuccess: invalidate
  })
  const bindMutation = useMutation({
    mutationFn: (input: { subjectId: string; bilibiliUserMonitorId?: string; bilibiliLiveRoomMonitorId?: string; danmuEnabled: boolean }) => bridge.bilibiliSubjects.bind(input),
    onSuccess: async () => { setBindingOpen(false); await invalidate() }
  })
  const layoutMutation = useMutation({
    mutationFn: (subjectId: string) => bridge.bilibiliSubjects.updateLayout({ subjectId, items: [] }),
    onSuccess: invalidate
  })
  const danmakuStartMutation = useMutation({
    mutationFn: (input: { roomMonitorId: string; protocolVersion: number }) => bridge.bilibiliLive.danmakuStart(input),
    onSuccess: invalidate
  })
  const danmakuStopMutation = useMutation({
    mutationFn: (roomMonitorId: string) => bridge.bilibiliLive.danmakuStop({ roomMonitorId }),
    onSuccess: invalidate
  })
  const rankRefreshMutation = useMutation({
    mutationFn: (input: { roomMonitorId: string; family: BilibiliLiveRankFamily }) => bridge.bilibiliLive.rankRefresh({
      roomMonitorId: input.roomMonitorId,
      families: [input.family],
      types: [],
      maxPages: 1,
      force: true
    }),
    onSuccess: invalidate
  })
  const workbench = workbenchQuery.data
  const openSubject = (subjectId: string): void => {
    setSelectedSubjectId(subjectId)
    onOpenWorkbench()
  }
  const deleteSubject = (subjectId: string): void => {
    if (typeof window !== "undefined" && !window.confirm("确认删除该用户工作台？原粉丝、直播监控及历史数据不会被删除。")) return
    deleteMutation.mutate(subjectId)
  }
  const loadingError = useMemo(
    () => subjectsQuery.error instanceof Error ? subjectsQuery.error.message : null,
    [subjectsQuery.error]
  )

  return (
    <>
      {view === "监控对象" ? (
        <BilibiliSubjectListView
          subjects={subjectsQuery.data ?? []}
          loading={subjectsQuery.isPending}
          error={loadingError}
          onOpen={openSubject}
          onDelete={deleteSubject}
          onRefresh={() => { void subjectsQuery.refetch() }}
        />
      ) : (
        <BilibiliSubjectWorkbenchView
          workbench={workbench}
          trend={trendQuery.data}
          rankSummary={rankQuery.data}
          rankPending={rankQuery.isPending || rankRefreshMutation.isPending}
          loading={Boolean(effectiveSubjectId) && workbenchQuery.isPending}
          error={workbenchQuery.error instanceof Error ? workbenchQuery.error.message : null}
          onBack={onBackToList}
          onRefresh={() => { void Promise.all([workbenchQuery.refetch(), trendQuery.refetch(), rankQuery.refetch()]) }}
          onToggleStatus={() => {
            if (workbench) updateMutation.mutate({
              subjectId: workbench.subject.id,
              enabled: workbench.subject.monitorStatus !== "ACTIVE"
            })
          }}
          onOpenBinding={() => setBindingOpen(true)}
          onResetLayout={() => { if (workbench) layoutMutation.mutate(workbench.subject.id) }}
          onDanmakuStart={(protocolVersion) => {
            if (roomMonitorId) danmakuStartMutation.mutate({ roomMonitorId, protocolVersion })
          }}
          onDanmakuStop={() => { if (roomMonitorId) danmakuStopMutation.mutate(roomMonitorId) }}
          onRankRefresh={(family) => {
            if (roomMonitorId) rankRefreshMutation.mutate({ roomMonitorId, family })
          }}
        />
      )}

      <CreateSubjectDrawer
        open={creationOpen}
        error={createMutation.error?.message}
        onClose={onCloseCreation}
        onCreate={async (input) => { await createMutation.mutateAsync(input) }}
      />
      <BindingDrawer
        key={`${workbench?.subject.id ?? "none"}-${bindingOpen ? "open" : "closed"}`}
        workbench={workbench}
        users={usersQuery.data?.items ?? []}
        rooms={roomsQuery.data?.items ?? []}
        open={bindingOpen}
        error={bindMutation.error?.message}
        onClose={() => setBindingOpen(false)}
        onSave={async (input) => {
          if (!workbench) return
          await bindMutation.mutateAsync({ subjectId: workbench.subject.id, ...input })
        }}
      />
    </>
  )
}
