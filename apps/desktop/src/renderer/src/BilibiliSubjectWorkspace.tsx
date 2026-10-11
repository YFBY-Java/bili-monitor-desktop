import type {
  BilibiliFollowerMonitorV2,
  BilibiliLiveRoomV2,
  BilibiliSubject,
  BilibiliSubjectTrendV3,
  BilibiliSubjectWorkbenchV3,
  DesktopBridge
} from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  ArrowLeft,
  CircleAlert,
  Clock3,
  LayoutGrid,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  Settings2,
  Trash2,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { useMemo, useState, type FormEvent, type JSX, type ReactNode } from "react"
import { BilibiliLiveDataWidget } from "./BilibiliLiveDataWidget"
import { BilibiliSubjectWidgetBoard } from "./BilibiliSubjectWidgetBoard"
import { BilibiliSubjectTrendChart } from "./BilibiliSubjectTrendChart"
import { ConnectedBilibiliLiveDataWidget } from "./ConnectedBilibiliLiveDataWidget"
import { SearchableSelect } from "./SearchableSelect"
import { formatFollowerCount, safeFollowerAvatar } from "./follower-monitor-presentation"
import { normalizeFollowerUidInput } from "./follower-uid-input"
import { widgetCount, widgetRelativeTime } from "./bilibili-live-widget-format"
import { formatLiveDateTime } from "./live-monitor-presentation"

export interface BilibiliSubjectListViewProps {
  subjects: BilibiliSubject[]
  loading: boolean
  error: string | null
  refreshing?: boolean
  deletingSubjectId?: string | undefined
  onOpen: (subjectId: string) => void
  onDelete: (subjectId: string) => void
  onRefresh: () => void
}

export interface BilibiliSubjectWorkbenchViewProps {
  workbench?: BilibiliSubjectWorkbenchV3
  trend?: BilibiliSubjectTrendV3
  liveDataWidget?: ReactNode
  loading: boolean
  error: string | null
  statusSaving?: boolean
  onBack: () => void
  onRefresh: () => void
  onToggleStatus: () => void
  onOpenBinding: () => void
}

function formatCount(value: string | undefined): string {
  return value === undefined ? "—" : formatFollowerCount(value)
}

function formatDelta(value: string | undefined): string {
  if (value === undefined) return "暂无对比"
  return `${BigInt(value) >= 0n ? "+" : ""}${formatFollowerCount(value)}`
}

function formatSubjectCount(value: string | undefined): string {
  if (value === undefined) return "--"
  const exact = BigInt(value)
  // Keep the existing Long64 display exact outside JavaScript's safe integer range.
  if (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER)) return formatFollowerCount(exact)
  return widgetCount(Number(exact))
}

function formatSubjectDelta(value: string | undefined): string {
  if (value === undefined) return "0"
  return `${BigInt(value) > 0n ? "+" : ""}${formatSubjectCount(value)}`
}

function formatTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未采集"
}

function liveText(status: 0 | 1 | 2 | undefined): string {
  if (status === 1) return "直播中"
  if (status === 2) return "轮播中"
  if (status === 0) return "未开播"
  return "直播未绑定"
}

function danmuText(status: string, liveStatus: 0 | 1 | 2 | undefined): string {
  if (status === "connected") return liveStatus === 1 ? "弹幕采集中" : "弹幕监听中"
  if (status === "waiting") return "弹幕待监听"
  if (status === "error") return "弹幕连接异常"
  if (status === "missing_live_room") return "弹幕未绑定直播间"
  return "弹幕已启用"
}

function SubjectAvatar({ subject, avatarUrl = subject.avatarUrl, live = false }: {
  subject: BilibiliSubject; avatarUrl?: string | undefined; live?: boolean
}): JSX.Element {
  const avatar = safeFollowerAvatar(avatarUrl)
  const [broken, setBroken] = useState<string>()
  return (
    <div className={`subject-avatar${live ? " is-live" : ""}`}>
      {avatar && avatar !== broken
        ? <img src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(avatar)} />
        : <span>{subject.displayName.slice(0, 1).toUpperCase() || "U"}</span>}
    </div>
  )
}

export function BilibiliSubjectListView({
  subjects,
  loading,
  error,
  refreshing = false,
  deletingSubjectId,
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
            <div className="subject-workbench-actions">
              <span className="business-safety"><Activity size={14} />真实本地聚合</span>
              <button className="button button-secondary" type="button" aria-label="刷新监控对象" disabled={refreshing} onClick={onRefresh}>
                <RefreshCcw className={refreshing ? "spin" : undefined} size={14} />{refreshing ? "正在刷新…" : "刷新"}
              </button>
            </div>
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
                    <button className="icon-button is-danger" type="button" aria-label={`删除 ${subject.displayName}`} disabled={Boolean(deletingSubjectId)} aria-busy={deletingSubjectId === subject.id} onClick={() => onDelete(subject.id)}>
                      {deletingSubjectId === subject.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                    </button>
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

export function BilibiliSubjectWorkbenchView({
  workbench,
  trend,
  liveDataWidget,
  loading,
  error,
  statusSaving = false,
  onBack,
  onRefresh,
  onToggleStatus,
  onOpenBinding
}: BilibiliSubjectWorkbenchViewProps): JSX.Element {
  if (loading) return (
    <div className="follower-state" role="status">
      <LoaderCircle className="spin" size={20} />
      <div><strong>正在聚合用户工作台</strong><span>读取粉丝、直播、弹幕、布局和健康事件。</span></div>
      <button className="button button-secondary" type="button" onClick={onBack}>返回监控对象</button>
    </div>
  )
  if (error) return (
    <div className="follower-state is-error" role="alert">
      <CircleAlert size={20} />
      <div><strong>工作台加载失败</strong><span>{error}</span></div>
      <button className="button button-secondary" type="button" onClick={onBack}>返回监控对象</button>
      <button className="button button-secondary" type="button" onClick={onRefresh}>重试</button>
    </div>
  )
  if (!workbench) return (
    <div className="business-empty"><UsersRound size={26} /><strong>请先选择监控对象</strong><span>从“监控对象”列表打开一个用户工作台。</span><button className="button button-secondary" type="button" onClick={onBack}>返回监控对象</button></div>
  )

  const healthTone = workbench.summary.healthScore >= 85 ? "normal"
    : workbench.summary.healthScore >= 65 ? "warning" : "error"
  const healthText = healthTone === "normal" ? "正常" : healthTone === "warning" ? "关注" : "异常"
  const avatarUrl = workbench.subject.avatarUrl || workbench.bilibiliUser?.avatarUrl || workbench.bilibiliLiveRoom?.faceUrl
  const live = workbench.bilibiliLiveRoom?.liveStatus === 1
  const danmuKpiText = !workbench.danmu.enabled ? "未启用"
    : workbench.danmu.status === "connected" ? live ? "实时" : "监听"
      : workbench.danmu.status === "error" ? "异常" : "等待"
  const danmuKpiTone = !workbench.danmu.enabled ? "inactive"
    : workbench.danmu.status === "connected" ? "success"
      : workbench.danmu.status === "error" ? "error" : "pending"

  return (
    <div className="subject-workbench">
      <section className="subject-workbench-head">
        <button className="icon-button" type="button" aria-label="返回监控对象" onClick={onBack}><ArrowLeft size={16} /></button>
        <SubjectAvatar key={avatarUrl ?? ""} subject={workbench.subject} avatarUrl={avatarUrl} live={live} />
        <div className="subject-workbench-title">
          <p>BILIBILI USER WORKBENCH</p>
          <h2>{workbench.subject.displayName}</h2>
          <div>
            {workbench.bilibiliUser && <span>Bilibili UID {workbench.bilibiliUser.mid}</span>}
            {workbench.bilibiliLiveRoom && <span className={live ? "is-live" : ""}>{liveText(workbench.bilibiliLiveRoom.liveStatus)}</span>}
            <span>{workbench.summary.enabledModuleCount}/{workbench.summary.totalModuleCount} 模块</span>
            {workbench.danmu.enabled && <span className={workbench.danmu.status === "connected" ? "is-live" : ""}>{danmuText(workbench.danmu.status, workbench.bilibiliLiveRoom?.liveStatus)}</span>}
          </div>
        </div>
        <div className="subject-workbench-actions">
          <button className="button button-secondary" type="button" onClick={onOpenBinding}><Settings2 size={14} />绑定资源</button>
          <button className="button button-secondary" type="button" disabled={statusSaving} onClick={onToggleStatus}>
            {workbench.subject.monitorStatus === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
            {statusSaving ? "正在保存…" : workbench.subject.monitorStatus === "ACTIVE" ? "暂停工作台" : "恢复工作台"}
          </button>
          <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCcw size={14} />刷新</button>
        </div>
        <div className="subject-health-score">
          <span>采集健康</span><strong>{Math.round(workbench.summary.healthScore)}</strong><em className={`subject-health-status is-${healthTone}`}>{healthText}</em>
          <div className="subject-health-bar" role="progressbar" aria-label="采集健康" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workbench.summary.healthScore}>
            <i style={{ width: `${Math.max(0, Math.min(100, workbench.summary.healthScore))}%` }} />
          </div>
        </div>
      </section>

      <section className="subject-kpis">
        <div>
          <div className="subject-kpi-head"><span>总粉丝数</span>{workbench.summary.followerDelta24h !== undefined && <span className="subject-kpi-tag is-success">{formatSubjectDelta(workbench.summary.followerDelta24h)}</span>}</div>
          <strong title={formatFollowerCount(workbench.summary.followerCount)}>{formatSubjectCount(workbench.summary.followerCount)}</strong><small>今日 {formatSubjectDelta(workbench.summary.followerDelta24h)}</small>
        </div>
        <div>
          <div className="subject-kpi-head"><span>直播间热度</span><span className="subject-kpi-tag is-error">峰值</span></div>
          <strong title={formatCount(workbench.summary.onlineCount)}>{formatSubjectCount(workbench.summary.onlineCount)}</strong><small>峰值 {formatSubjectCount(workbench.summary.onlinePeak24h)}</small>
        </div>
        <div>
          <div className="subject-kpi-head"><span>弹幕速率</span><span className={`subject-kpi-tag is-${danmuKpiTone}`}>{danmuKpiText}</span></div>
          <strong>{workbench.summary.danmuPerMinute === undefined ? "--" : `${workbench.summary.danmuPerMinute} /min`}</strong><small>近 5 分钟 {workbench.summary.danmuLast5Minutes ?? "--"} 条</small>
        </div>
        <div>
          <div className="subject-kpi-head"><span>最近成功采集</span><span className="subject-kpi-tag">{workbench.summary.enabledModuleCount}/{workbench.summary.totalModuleCount}</span></div>
          <strong title={formatLiveDateTime(workbench.summary.lastSuccessAt, "--")}>{widgetRelativeTime(workbench.summary.lastSuccessAt)}</strong><small>下一轮 {formatLiveDateTime(workbench.summary.nextCollectAt, "--")}</small>
        </div>
      </section>

      {!workbench.bilibiliUser && !workbench.bilibiliLiveRoom && (
        <div className="inline-warning subject-unbound-warning" role="alert"><CircleAlert size={16} /><span>该对象还没有绑定 B站粉丝监控或直播间监控。可以先在专项页添加监控，再回到这里绑定。</span></div>
      )}

      <BilibiliSubjectWidgetBoard primary={
        <article className="panel subject-widget subject-widget-wide">
          <div className="panel-header compact"><div><p>FOLLOWER / LIVE HEAT</p><h2>粉丝数与直播热度监控</h2></div><span className="business-safety"><TrendingUp size={14} />24 小时</span></div>
          <BilibiliSubjectTrendChart trend={trend} />
          <div className="subject-widget-stats">
            <div><span>当前粉丝</span><strong>{formatFollowerCount(workbench.summary.followerCount)}</strong></div>
            <div><span>24h 净增</span><strong>{formatDelta(workbench.summary.followerDelta24h)}</strong></div>
            <div><span>当前热度</span><strong>{formatCount(workbench.summary.onlineCount)}</strong></div>
            <div><span>热度峰值</span><strong>{formatCount(workbench.summary.onlinePeak24h)}</strong></div>
          </div>
        </article>
      } secondary={liveDataWidget ?? <BilibiliLiveDataWidget room={workbench.bilibiliLiveRoom} danmu={workbench.danmu} />}>

        <article className="panel subject-widget subject-widget-wide">
          <div className="panel-header compact"><div><p>COLLECTION HEALTH</p><h2>{workbench.subject.displayName} 采集健康与事件</h2></div><span className={`business-safety subject-health-status is-${healthTone}`}><Activity size={14} />{healthText} · {Math.round(workbench.summary.healthScore)}</span></div>
          <div className="subject-health-stats">
            <div><span>启用模块</span><strong>{workbench.summary.enabledModuleCount}/{workbench.summary.totalModuleCount}</strong></div>
            <div><span>下一轮采集</span><strong>{formatLiveDateTime(workbench.summary.nextCollectAt, "--")}</strong></div>
            <div><span>最近成功</span><strong>{widgetRelativeTime(workbench.summary.lastSuccessAt)}</strong></div>
          </div>
          <div className="subject-event-list">
            {workbench.recentEvents.map((event) => (
              <div key={`${event.eventType}-${event.occurredAt}`}><i className={event.level} /><strong>{event.title}</strong><span>{event.description || event.source}</span><time dateTime={event.occurredAt} title={formatLiveDateTime(event.occurredAt, "--")}>{widgetRelativeTime(event.occurredAt)}</time></div>
            ))}
          </div>
        </article>

        <article className="panel subject-widget subject-placeholder-widget">
          <div className="panel-header compact"><div><p>WIDGET SLOT</p><h2>待添加模块</h2></div><span className="business-safety"><LayoutGrid size={14} />可扩展</span></div>
          <div className="subject-empty-slot">
            <span>Widget Slot</span>
            <strong>内容表现 / 事件流 / AI 摘要</strong>
            <p>后续可接可编排布局，把更多用户维度放到这里。</p>
          </div>
        </article>
      </BilibiliSubjectWidgetBoard>
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
  const [submissionError, setSubmissionError] = useState<string>()
  if (!open) return null
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmissionError(undefined)
    const normalizedMid = normalizeFollowerUidInput(mid)
    if (!normalizedMid) {
      setSubmissionError("请输入有效的正 Long64 UID。")
      return
    }
    setSubmitting(true)
    void onCreate({
      mid: normalizedMid,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      danmuEnabled
    }).catch((failure: unknown) => setSubmissionError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setSubmitting(false))
  }
  return (
    <div className="creation-backdrop" role="presentation">
      <section className="creation-drawer" role="dialog" aria-modal="true" aria-label="创建用户工作台">
        <div className="creation-head"><div><p>BILIBILI USER WORKBENCH</p><h2>创建用户工作台</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={17} /></button></div>
        <form className="creation-form" onSubmit={submit}>
          <label><span>B站 UID</span><input required inputMode="numeric" value={mid} onChange={(event) => setMid(event.target.value)} placeholder="例如：401742377" /></label>
          <label><span>工作台名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="可留空，默认使用 B站昵称" /></label>
          <label className="subject-check"><input type="checkbox" checked={danmuEnabled} onChange={(event) => setDanmuEnabled(event.target.checked)} /><span>启用弹幕模块</span></label>
          <p className="form-note"><Activity size={14} />提交后会先创建或复用该 UID 的粉丝监控，再尝试创建或复用同 UID 的直播间监控；没有公开直播间时，仍会保留粉丝监控并创建工作台。</p>
          {(error || submissionError) && <p className="form-error" role="alert">{error || submissionError}</p>}
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
  workbench?: BilibiliSubjectWorkbenchV3
  users: BilibiliFollowerMonitorV2[]
  rooms: BilibiliLiveRoomV2[]
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
    }).catch(() => {
      // The connected drawer displays bindMutation.error; keep the form available for retry.
    }).finally(() => setSubmitting(false))
  }
  return (
    <div className="creation-backdrop" role="presentation">
      <section className="creation-drawer" role="dialog" aria-modal="true" aria-label="绑定 B站监控资源">
        <div className="creation-head"><div><p>BILIBILI RESOURCE BINDING</p><h2>绑定 B站监控资源</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={17} /></button></div>
        <form className="creation-form" onSubmit={submit}>
          <label><span>粉丝监控用户</span><SearchableSelect label="粉丝监控用户" value={userId} onChange={setUserId}
            placeholder="选择已有 UID" options={[{ value: "", label: "不更换" },
              ...users.map(user => ({ value: user.id, label: `${user.nickname} · UID ${user.mid}` }))]} /></label>
          <label><span>直播间监控</span><SearchableSelect label="直播间监控" value={roomId} onChange={setRoomId}
            placeholder="选择已有直播间" options={[{ value: "", label: "不更换" },
              ...rooms.map(room => ({ value: room.id, label: `${room.uname} · 房间 ${room.roomId}` }))]} /></label>
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
  const [operationNotice, setOperationNotice] = useState<string>()
  const subjectsQuery = useQuery({
    queryKey: ["bilibili-subjects"],
    queryFn: () => bridge.bilibiliSubjects.list({}),
    refetchInterval: 30_000
  })
  const effectiveSubjectId = selectedSubjectId
    && (subjectsQuery.data === undefined || subjectsQuery.data.some(subject => subject.id === selectedSubjectId))
    ? selectedSubjectId
    : subjectsQuery.data?.[0]?.id
  const workbenchQuery = useQuery({
    queryKey: ["bilibili-subject-workbench-v2", effectiveSubjectId],
    queryFn: () => bridge.bilibiliSubjects.workbenchV3({ subjectId: effectiveSubjectId! }),
    enabled: view === "用户工作台" && Boolean(effectiveSubjectId),
    refetchInterval: 15_000
  })
  const trendQuery = useQuery({
    queryKey: ["bilibili-subject-trends-v2", effectiveSubjectId],
    queryFn: () => bridge.bilibiliSubjects.trendsV3({ subjectId: effectiveSubjectId! }),
    enabled: view === "用户工作台" && Boolean(effectiveSubjectId),
    refetchInterval: 30_000
  })
  const roomMonitorId = workbenchQuery.data?.bilibiliLiveRoom?.monitorId
  const usersQuery = useQuery({
    queryKey: ["bilibili-followers-v2"],
    queryFn: () => bridge.bilibiliFollowersV2.list({}),
    enabled: bindingOpen
  })
  const roomsQuery = useQuery({
    queryKey: ["bilibili-live-rooms"],
    queryFn: () => bridge.bilibiliLiveV2.list({}),
    enabled: bindingOpen
  })
  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bilibili-subjects"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-subject-workbench-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-subject-trends-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live-widget"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-followers-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-live-rooms"] })
    ])
  }
  const createMutation = useMutation({
    mutationFn: (input: { mid: string; displayName?: string; danmuEnabled: boolean }) => bridge.bilibiliSubjects.create(input),
    onSuccess: async (created) => {
      queryClient.setQueryData<BilibiliSubject[]>(["bilibili-subjects"], previous =>
        [created, ...(previous ?? []).filter(subject => subject.id !== created.id)])
      setSelectedSubjectId(created.id)
      setOperationNotice("用户监控工作台已创建。")
      onCloseCreation()
      onOpenWorkbench()
      await invalidate()
    }
  })
  const deleteMutation = useMutation({
    mutationFn: (subjectId: string) => bridge.bilibiliSubjects.remove({ subjectId }),
    onSuccess: async (_result, subjectId) => {
      await queryClient.cancelQueries({ queryKey: ["bilibili-subjects"] })
      queryClient.setQueryData<BilibiliSubject[]>(["bilibili-subjects"], previous =>
        (previous ?? []).filter(subject => subject.id !== subjectId))
      queryClient.removeQueries({ queryKey: ["bilibili-subject-workbench-v2", subjectId], exact: true })
      queryClient.removeQueries({ queryKey: ["bilibili-subject-trends-v2", subjectId], exact: true })
      if (effectiveSubjectId === subjectId) {
        setSelectedSubjectId(undefined)
        setBindingOpen(false)
        onBackToList()
      }
      setOperationNotice("已删除工作台，原粉丝、直播监控及历史数据保留。")
      await invalidate()
    }
  })
  const updateMutation = useMutation({
    mutationFn: (input: { subjectId: string; enabled: boolean }) => bridge.bilibiliSubjects.update(input),
    onSuccess: async (updated) => {
      setOperationNotice(updated.monitorStatus === "ACTIVE" ? "工作台已恢复。" : "工作台已暂停，未更改共享监控状态。")
      await invalidate()
    }
  })
  const bindMutation = useMutation({
    mutationFn: (input: { subjectId: string; bilibiliUserMonitorId?: string; bilibiliLiveRoomMonitorId?: string; danmuEnabled: boolean }) => bridge.bilibiliSubjects.bind(input),
    onSuccess: async () => { setBindingOpen(false); await invalidate() }
  })
  const workbench = workbenchQuery.data
  const openSubject = (subjectId: string): void => {
    setOperationNotice(undefined)
    updateMutation.reset()
    setSelectedSubjectId(subjectId)
    onOpenWorkbench()
  }
  const deleteSubject = (subjectId: string): void => {
    if (deleteMutation.isPending) return
    const subject = subjectsQuery.data?.find(item => item.id === subjectId)
    if (typeof window !== "undefined" && !window.confirm(`确认删除“${subject?.displayName ?? "该用户工作台"}”？原粉丝、直播监控及历史数据不会被删除。`)) return
    setOperationNotice(undefined)
    deleteMutation.mutate(subjectId)
  }
  const loadingError = useMemo(
    () => subjectsQuery.error instanceof Error ? subjectsQuery.error.message : null,
    [subjectsQuery.error]
  )
  const operationError = view === "监控对象"
    ? deleteMutation.error
    : (updateMutation.variables?.subjectId === effectiveSubjectId ? updateMutation.error : null)

  return (
    <>
      {operationError && <div className="follower-state is-error" role="alert"><CircleAlert size={20} /><span>{operationError.message}</span></div>}
      {operationNotice && <p className="business-safety" role="status"><Activity size={14} />{operationNotice}</p>}
      {view === "监控对象" ? (
        <BilibiliSubjectListView
          subjects={subjectsQuery.data ?? []}
          loading={subjectsQuery.isPending}
          error={loadingError}
          refreshing={subjectsQuery.isFetching}
          deletingSubjectId={deleteMutation.isPending ? deleteMutation.variables : undefined}
          onOpen={openSubject}
          onDelete={deleteSubject}
          onRefresh={() => { void subjectsQuery.refetch() }}
        />
      ) : (
        <BilibiliSubjectWorkbenchView
          workbench={workbench}
          trend={trendQuery.data}
          liveDataWidget={workbench && <ConnectedBilibiliLiveDataWidget
            key={`${workbench.subject.id}-${roomMonitorId ?? "none"}-${workbench.danmu.enabled}`}
            bridge={bridge} room={workbench.bilibiliLiveRoom} initialDanmu={workbench.danmu} />}
          loading={subjectsQuery.isPending || (Boolean(effectiveSubjectId) && workbenchQuery.isPending)}
          error={loadingError ?? (workbenchQuery.error instanceof Error ? workbenchQuery.error.message : null)}
          statusSaving={updateMutation.isPending}
          onBack={onBackToList}
          onRefresh={() => { void Promise.all([workbenchQuery.refetch(), trendQuery.refetch(),
            queryClient.invalidateQueries({ queryKey: ["bilibili-live-widget"] })]) }}
          onToggleStatus={() => {
            setOperationNotice(undefined)
            if (workbench) updateMutation.mutate({
              subjectId: workbench.subject.id,
              enabled: workbench.subject.monitorStatus !== "ACTIVE"
            })
          }}
          onOpenBinding={() => setBindingOpen(true)}
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
