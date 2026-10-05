import type {
  AddBilibiliFollowerMonitorInputV2,
  BilibiliFollowerMonitorV2,
  BilibiliFollowerTrendV2,
  DesktopBridge,
  UpdateBilibiliFollowerMonitorSettingsInput
} from "@bmd/contracts"
import { AddBilibiliFollowerMonitorInputV2Schema } from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  Settings2,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type JSX } from "react"
import { FollowerCollectionSummary, FollowerRhythm, FollowerUserStrip, useFollowerClock } from "./BilibiliFollowerMonitorPanel"
import { followerSchedule, formatFollowerCount, formatFollowerInterval, safeFollowerAvatar } from "./follower-monitor-presentation"
import { BilibiliFollowerTrendBoard } from "./BilibiliFollowerTrendBoard"
import { swapFollowerTrends } from "./follower-trend-presentation"
import { useFollowerTrends, type FollowerTrendIndicator } from "./use-follower-trends"
import { normalizeFollowerUidInput } from "./follower-uid-input"
import { FollowerIntervalInput } from "./FollowerIntervalInput"
import { clampFollowerInterval, syncFollowerIntervalDrafts, type FollowerIntervalDraft, type FollowerIntervalDrafts } from "./follower-interval-draft"

export type FollowerResourceState<T> =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "success"; data: T; total?: number; refreshing?: boolean; staleMessage?: string }

export interface BilibiliFollowerWorkspaceProps {
  view: "监控用户" | "趋势对比"
  monitors: FollowerResourceState<BilibiliFollowerMonitorV2[]>
  trends: FollowerResourceState<BilibiliFollowerTrendV2[]>
  creationOpen: boolean
  mutationError: string | undefined
  addSuccess?: boolean
  settingsSuccess?: string
  refreshSuccess?: boolean
  actionError?: string | undefined
  busyUserIds: string[]
  savingIntervalUserIds: string[]
  intervalDrafts: FollowerIntervalDrafts
  onIntervalDraftChange: (user: BilibiliFollowerMonitorV2, value: number) => void
  collectingUserIds?: string[]
  selectedUserIds?: string[]
  trendIndicator?: FollowerTrendIndicator
  onSwapTrends?: (source: string, target: string) => void
  onReloadTrends?: () => void
  onCloseCreation: () => void
  onAdd: (input: AddBilibiliFollowerMonitorInputV2, onCommitted?: () => void) => Promise<void>
  onRefreshUser: (userId: string) => Promise<void>
  onUpdateStatus: (userId: string, enabled: boolean) => Promise<void>
  onUpdateSettings: (input: UpdateBilibiliFollowerMonitorSettingsInput) => Promise<void>
  onDelete: (userId: string) => Promise<void>
  onReload: () => void
  onToggleTrendUser?: (userId: string) => void
}

function formatCount(value: string | undefined): string {
  return formatFollowerCount(value)
}

function formatDelta(value: string | undefined): string {
  if (value === undefined) return "暂无对比"
  return `${BigInt(value) >= 0n ? "+" : ""}${formatFollowerCount(value)}`
}

function formatTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未采集"
}

function formatInterval(seconds: number): string {
  if (seconds % 86_400 === 0) return `每 ${seconds / 86_400} 天`
  if (seconds % 3_600 === 0) return `每 ${seconds / 3_600} 小时`
  if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`
  return `每 ${seconds} 秒`
}

export function hideBrokenAvatar(event: { currentTarget: { hidden: boolean | "until-found" } }): void {
  event.currentTarget.hidden = true
}

function MonitorState({ monitors, onReload }: Pick<BilibiliFollowerWorkspaceProps, "monitors" | "onReload">): JSX.Element | null {
  if (monitors.phase === "loading") {
    return (
      <div className="follower-state" role="status">
        <LoaderCircle className="spin" size={20} />
        <div><strong>正在读取粉丝监控列表</strong><span>数据来自本机 SQLite，不经过业务服务端。</span></div>
      </div>
    )
  }
  if (monitors.phase === "error") {
    return (
      <div className="follower-state is-error" role="alert">
        <CircleAlert size={20} />
        <div><strong>粉丝监控暂时不可用</strong><span>{monitors.message}</span></div>
        <button className="button button-secondary" type="button" onClick={onReload}><RefreshCcw size={14} />重新加载</button>
      </div>
    )
  }
  return null
}

function AddMonitorForm({
  mutationError,
  mid,
  intervalSeconds,
  onMidChange,
  onIntervalChange,
  onClose,
  onAdd
}: {
  mutationError: string | undefined
  mid: string
  intervalSeconds: number
  onMidChange: (value: string) => void
  onIntervalChange: (value: number) => void
  onClose: () => void
  onAdd: BilibiliFollowerWorkspaceProps["onAdd"]
}): JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [submissionError, setSubmissionError] = useState<string>()
  const mounted = useRef(true)
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmissionError(undefined)
    const normalizedMid = normalizeFollowerUidInput(mid)
    if (normalizedMid === undefined) {
      setSubmissionError("请输入有效 UID（1 至 9223372036854775807 的整数）。")
      return
    }
    const parsed = AddBilibiliFollowerMonitorInputV2Schema.safeParse({ mid: normalizedMid, intervalSeconds })
    if (!parsed.success) {
      setSubmissionError(parsed.error.issues[0]?.message ?? "请输入有效的正 Long64 UID 和采集间隔。")
      return
    }
    setSubmitting(true)
    setCommitted(false)
    let didCommit = false
    void onAdd(parsed.data, () => {
      didCommit = true
      if (!mounted.current) return
      onMidChange("")
      setCommitted(true)
    })
      .then(() => {
        if (!mounted.current) return
        if (!didCommit) onMidChange("")
        onClose()
      })
      .catch((error: unknown) => { if (mounted.current) setSubmissionError(errorMessage(error)) })
      .finally(() => { if (mounted.current) setSubmitting(false) })
  }

  return (
    <form className="creation-form" onSubmit={submit}>
      <label>
        <span>B站 UID</span>
        <input aria-required="true" inputMode="numeric" value={mid} onChange={(event) => onMidChange(event.target.value)} placeholder="例如：672328094" />
      </label>
      <label>
        <span>采集间隔</span>
        <input
          required
          type="number"
          min={1}
          max={2_592_000}
          step={1}
          value={intervalSeconds}
          onChange={(event) => onIntervalChange(Number(event.target.value))}
        />
      </label>
      {intervalSeconds < 60 && <p className="form-warning">短间隔会受全局请求节流和失败退避保护，建议只用于少量用户的临时观察。</p>}
      <p className="form-note"><Activity size={14} />保存前会先请求 B站用户卡片接口，自动校验 UID，并写入第一条真实粉丝快照。默认每 1 小时采集一次。</p>
      {(submissionError || mutationError) && <p className="form-error" role="alert">{submissionError || mutationError}</p>}
      <div className="form-actions">
        <button className="button button-secondary" type="button" onClick={onClose}>取消</button>
        <button className="button button-primary" disabled={submitting} type="submit">{submitting ? committed ? "正在同步列表…" : "正在校验并添加…" : "添加监控"}</button>
      </div>
    </form>
  )
}

function MonitorDetail({
  user,
  busy,
  savingInterval,
  collecting,
  now,
  intervalDraft,
  onDraftChange,
  onRefreshUser,
  onUpdateStatus,
  onUpdateSettings,
  onDelete
}: {
  user: BilibiliFollowerMonitorV2
  busy: boolean
  savingInterval: boolean
  collecting: boolean
  now: number
  intervalDraft: FollowerIntervalDraft | undefined
  onDraftChange: (value: number) => void
  onRefreshUser: BilibiliFollowerWorkspaceProps["onRefreshUser"]
  onUpdateStatus: BilibiliFollowerWorkspaceProps["onUpdateStatus"]
  onUpdateSettings: BilibiliFollowerWorkspaceProps["onUpdateSettings"]
  onDelete: BilibiliFollowerWorkspaceProps["onDelete"]
}): JSX.Element {
  const intervalSeconds = intervalDraft?.value ?? user.intervalSeconds
  const intervalDirty = intervalDraft?.dirty && intervalSeconds !== user.intervalSeconds
  const active = user.monitorStatus === "ACTIVE"
  const avatar = safeFollowerAvatar(user.avatarUrl)
  const deleteUser = (): void => {
    const message = `确定删除“${user.nickname}”吗？这会同时删除该用户的全部粉丝历史快照，且无法恢复。`
    if (typeof window === "undefined" || window.confirm(message)) void onDelete(user.id)
  }

  return (
    <section id={`follower-detail-${user.id}`} className={`follower-monitor-detail ${user.lastErrorType ? "has-error" : ""}`} aria-label={`${user.nickname}监控详情`}>
      <div className="follower-profile">
        <div className="follower-avatar">
          <div className="follower-avatar-fallback"><UsersRound size={19} /></div>
          {avatar && (
            <img
              key={user.avatarUrl}
              src={avatar}
              alt=""
              referrerPolicy="no-referrer"
              onError={hideBrokenAvatar}
            />
          )}
        </div>
        <div>
          <a href={user.profileUrl} target="_blank" rel="noreferrer">{user.nickname}</a>
          <span>UID {user.mid}</span>
        </div>
        <span className={`follower-status is-${user.lastErrorType ? "error" : active ? "active" : "paused"}`}><i />{user.lastErrorType ? "采集异常" : active ? "监控中" : "已暂停"}</span>
      </div>

      <div className="follower-counts">
        <div><span>粉丝</span><strong>{formatCount(user.currentFollowerCount)}</strong></div>
        <div className={BigInt(user.deltaSincePrevious ?? "0") < 0n ? "is-negative" : BigInt(user.deltaSincePrevious ?? "0") > 0n ? "is-positive" : ""}><span>较上次</span><strong>{formatDelta(user.deltaSincePrevious)}</strong></div>
        <div><span>关注</span><strong>关注 {formatCount(user.followingCount)}</strong></div>
      </div>

      <div className="follower-times">
        <span><Clock3 size={13} />最后采集 {formatTime(user.lastSnapshotAt || user.lastSuccessAt)}</span>
        <span><Clock3 size={13} />上次成功 {formatTime(user.lastSuccessAt)}</span>
        <span><Clock3 size={13} />下次采集 {active ? formatTime(user.nextCollectAt) : "已暂停"}</span>
        <span><Activity size={13} />来源 {user.sourceEndpoint ?? "等待首次采集"}</span>
      </div>

      {user.lastErrorMessage && (
        <div className="follower-error" role="alert"><CircleAlert size={14} /><span><strong>{user.lastErrorType}</strong>{user.lastErrorMessage}</span></div>
      )}

      <div className="follower-actions">
        <button className="button button-secondary" type="button" onClick={() => void onRefreshUser(user.id)}><RefreshCcw size={14} />立即刷新</button>
        <button className="button button-secondary" disabled={busy} type="button" onClick={() => void onUpdateStatus(user.id, !active)}>{active ? <Pause size={14} /> : <Play size={14} />}{active ? "暂停监控" : "恢复监控"}</button>
        <details className="follower-settings">
          <summary><Settings2 size={14} />采集设置</summary>
          <div>
            <label><span>采集间隔（秒）</span><FollowerIntervalInput value={intervalSeconds} onChange={onDraftChange} /></label>
            <small>当前：{formatInterval(user.intervalSeconds)}</small>
            {intervalSeconds < 60 && <small className="form-warning">短间隔会受全局请求节流和失败退避保护。</small>}
            <button className="button button-secondary" disabled={savingInterval || !intervalDirty} type="button" onClick={() => void onUpdateSettings({ userId: user.id, intervalSeconds })}>{savingInterval ? "正在保存…" : "保存间隔"}</button>
            <button className="follower-delete" disabled={busy} type="button" onClick={deleteUser}><Trash2 size={14} />删除监控与全部历史快照</button>
          </div>
        </details>
      </div>
      <div className="follower-detail-rhythm"><span>距下次采集</span><FollowerRhythm user={user} now={now} collecting={collecting} /><strong>{followerSchedule(user, now, collecting).rhythm}</strong></div>
    </section>
  )
}

export function BilibiliFollowerWorkspace(props: BilibiliFollowerWorkspaceProps): JSX.Element {
  const now = useFollowerClock()
  // Like the original inline form, drafts survive closing the adapted drawer.
  const [addMid, setAddMid] = useState("")
  const [addInterval, setAddInterval] = useState(3_600)
  const [expandedId, setExpandedId] = useState<string>()
  const trendAnchor = useRef<HTMLDivElement>(null)
  const monitorAnchor = useRef<HTMLDivElement>(null)
  const previousView = useRef(props.view)
  useEffect(() => {
    if (previousView.current === props.view) return
    previousView.current = props.view
    if (props.view === "趋势对比") trendAnchor.current?.scrollIntoView({ block: "start" })
    else monitorAnchor.current?.scrollIntoView({ block: "start" })
  }, [props.view])
  const users = props.monitors.phase === "success" ? props.monitors.data : []
  const expanded = users.find(user => user.id === expandedId)
  useEffect(() => {
    if (props.monitors.phase !== "success") return
    const current = props.monitors.data
    setExpandedId(id => current.some(user => user.id === id) ? id : undefined)
  }, [props.monitors])
  const activeCount = users.filter((user) => user.monitorStatus === "ACTIVE").length
  const failureCount = users.filter((user) => user.lastErrorType).length
  const selected = props.selectedUserIds
    ?? (props.trends.phase === "success" ? props.trends.data.map((trend) => trend.user.id) : [])
  const visibleSelectedCount = selected.filter(id => users.some(user => user.id === id)).length

  return (
    <>
      {props.addSuccess && <div className="follower-state" role="status"><UserRoundPlus size={20} /><span>已添加监控用户</span></div>}
      {props.settingsSuccess && <div className="follower-state" role="status"><Settings2 size={20} /><span>{props.settingsSuccess}</span></div>}
      {props.refreshSuccess && <div className="follower-state" role="status"><RefreshCcw size={20} /><span>已刷新</span></div>}
      {props.actionError && <div className="follower-state is-error" role="alert"><CircleAlert size={20} /><span>{props.actionError}</span></div>}
      {props.monitors.phase === "success" && props.monitors.staleMessage && <div className="follower-state is-error" role="alert"><CircleAlert size={20} /><span>更新失败，保留上次数据：{props.monitors.staleMessage}</span><button className="button button-secondary" onClick={props.onReload}>重新加载</button></div>}
      <div ref={monitorAnchor}><FollowerCollectionSummary users={users} available={props.monitors.phase === "success"} /></div>
      {users.some(user => (props.intervalDrafts[user.id]?.value ?? user.intervalSeconds) < 60) && <p className="follower-short-notice" role="note">已允许 1 秒采集间隔；短间隔会受全局请求节流和失败退避保护，建议只用于少量用户的临时观察。</p>}

        <div>
          <MonitorState monitors={props.monitors} onReload={props.onReload} />
          {props.monitors.phase === "success" && (
            <section className="panel follower-directory">
              <div className="panel-header compact"><div><p>BILIBILI USER MONITORS</p><h2>监控用户</h2></div><span className="follower-limit">已选趋势 {visibleSelectedCount}/4</span><button className="button button-secondary" disabled={props.monitors.refreshing} onClick={props.onReload}><RefreshCcw size={14} />刷新列表</button></div>
              <div className="follower-directory-meta" aria-label="粉丝监控统计"><span>{props.monitors.total ?? users.length} 个用户</span><span>{activeCount} 个启用</span><span>{users.length - activeCount} 个暂停</span><span>{failureCount} 个异常</span><span>点击用户展开详情</span></div>
              {users.length === 0
                ? <div className="business-empty"><UserRoundPlus size={26} /><strong>还没有监控用户</strong><span>添加 B站 UID 后，会先校验用户并保存第一条粉丝快照。</span></div>
                : <FollowerUserStrip users={users} selected={selected} expandedId={expandedId} collectingIds={props.collectingUserIds ?? []} now={now}
                  onExpand={id => setExpandedId(current => current === id ? undefined : id)} onToggleTrend={props.onToggleTrendUser} />}
              {expanded && <MonitorDetail key={expanded.id} user={expanded} now={now} busy={props.busyUserIds.includes(expanded.id)} collecting={props.collectingUserIds?.includes(expanded.id) ?? false}
                savingInterval={props.savingIntervalUserIds.includes(expanded.id)} intervalDraft={props.intervalDrafts[expanded.id]}
                onDraftChange={value => props.onIntervalDraftChange(expanded, value)}
                onRefreshUser={props.onRefreshUser} onUpdateStatus={props.onUpdateStatus} onUpdateSettings={props.onUpdateSettings} onDelete={props.onDelete} />}
            </section>
          )}
        </div>
      <div ref={trendAnchor}><BilibiliFollowerTrendBoard users={selected.flatMap(id => {
        const user = users.find(item => item.id === id)
        return user ? [user] : []
      })} trends={props.trends} indicator={props.trendIndicator} now={now} onSwap={props.onSwapTrends} onReload={props.onReloadTrends} /></div>

      {props.creationOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="creation-drawer" role="dialog" aria-modal="true" aria-label="添加 B站监控用户">
            <div className="creation-head"><div><p>BILIBILI FOLLOWER MONITOR</p><h2>添加 B站监控用户</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={props.onCloseCreation}><X size={17} /></button></div>
            <AddMonitorForm mutationError={props.mutationError} mid={addMid} intervalSeconds={addInterval}
              onMidChange={setAddMid} onIntervalChange={setAddInterval} onClose={props.onCloseCreation} onAdd={props.onAdd} />
          </section>
        </div>
      )}
    </>
  )
}

export function ConnectedBilibiliFollowerWorkspace({
  bridge,
  view,
  creationOpen,
  onCloseCreation
}: {
  bridge: DesktopBridge
  view: "监控用户" | "趋势对比"
  creationOpen: boolean
  onCloseCreation: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [busyUserIds, setBusyUserIds] = useState<string[]>([])
  const [actionError, setActionError] = useState<string>()
  const [refreshSuccess, setRefreshSuccess] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [intervalDrafts, setIntervalDrafts] = useState<FollowerIntervalDrafts>({})
  const [savingIntervalUserIds, setSavingIntervalUserIds] = useState<string[]>([])
  const [settingsSuccess, setSettingsSuccess] = useState<string>()
  // Error visibility is UI state, not a second copy of the Query's data/error.
  const [readErrorVisible, setReadErrorVisible] = useState(false)
  // Read local projections only; the Core owns platform requests and scheduling.
  const monitorsQuery = useQuery({
    queryKey: ["bilibili-followers-v2"], retry: false, refetchInterval: 2_000,
    queryFn: async () => {
      // A new loadUsers clears the shared error; sharing a pending read does not.
      setActionError(undefined)
      setReadErrorVisible(false)
      try {
        const projection = await bridge.bilibiliFollowersV2.list({})
        // Prune on a successful read before its waiters append a newly returned ID.
        // An effect could run after add-success and remove that raw selection again.
        setSelectedUserIds(ids => ids.filter(id => projection.items.some(user => user.id === id)))
        // The original synchronizes drafts inside loadUsers, before save waiters.
        setIntervalDrafts(drafts => syncFollowerIntervalDrafts(drafts, projection.items))
        return projection
      } catch (error) {
        // Match the original single apiError: the last failure owns the notice.
        setActionError(undefined)
        setReadErrorVisible(true)
        throw error
      }
    }
  })
  const trendsQuery = useFollowerTrends(bridge, selectedUserIds, monitorsQuery.dataUpdatedAt)
  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bilibili-followers-v2"] }, { cancelRefetch: false }),
      queryClient.invalidateQueries({ queryKey: ["bilibili-follower-trends-v2"] })
    ])
  }
  const addMutation = useMutation({
    mutationFn: ({ input }: { input: AddBilibiliFollowerMonitorInputV2; onCommitted?: () => void }) => bridge.bilibiliFollowersV2.add(input),
    retry: false,
    onMutate: () => { setAddSuccess(false) },
    onSuccess: async (user, request) => {
      request.onCommitted?.()
      // Match loadUsers: reuse an in-flight read, swallow read failure in Query,
      // and confirm the committed add without waiting for queued history reads.
      await monitorsQuery.refetch({ cancelRefetch: false })
      setSelectedUserIds((ids) => ids.includes(user.id) || ids.length >= 4 ? ids : [...ids, user.id])
      setAddSuccess(true)
    }
  })
  const runUserAction = async (userId: string, action: () => Promise<unknown>): Promise<void> => {
    setBusyUserIds((ids) => [...new Set([...ids, userId])])
    setActionError(undefined)
    try {
      await action()
      await invalidate()
    } catch (error) { setReadErrorVisible(false); setActionError(errorMessage(error)) }
    finally { setBusyUserIds((ids) => ids.filter((id) => id !== userId)) }
  }
  const saveInterval = async (input: UpdateBilibiliFollowerMonitorSettingsInput): Promise<void> => {
    const intervalSeconds = clampFollowerInterval(input.intervalSeconds)
    const user = monitorsQuery.data?.items.find(item => item.id === input.userId)
    if (!user || intervalSeconds === user.intervalSeconds) return
    setSavingIntervalUserIds(ids => [...new Set([...ids, input.userId])])
    setActionError(undefined)
    setReadErrorVisible(false)
    setSettingsSuccess(undefined)
    try {
      const updatedUser = await bridge.bilibiliFollowersV2.updateSettings({ ...input, intervalSeconds })
      setIntervalDrafts(drafts => ({ ...drafts, [input.userId]: { value: updatedUser.intervalSeconds, dirty: false } }))
      // Reuse an existing read, accept its old snapshot, and swallow read errors.
      // A successful settings commit is not undone by a failed list or history.
      await monitorsQuery.refetch({ cancelRefetch: false })
      setSettingsSuccess(`已更新采集间隔为 ${formatFollowerInterval(intervalSeconds)}`)
    } catch (error) { setReadErrorVisible(false); setActionError(errorMessage(error)) }
    finally { setSavingIntervalUserIds(ids => ids.filter(id => id !== input.userId)) }
  }
  const refreshUser = async (userId: string): Promise<void> => {
    setActionError(undefined)
    setReadErrorVisible(false)
    setRefreshSuccess(false)
    try {
      await bridge.bilibiliFollowersV2.refresh({ userId })
      // Original manual refresh only awaits the shared list, not queued history.
      // Query retains old data and swallows read errors, as loadUsers does.
      await monitorsQuery.refetch({ cancelRefetch: false })
      setRefreshSuccess(true)
    } catch (error) { setReadErrorVisible(false); setActionError(errorMessage(error)) }
  }
  const monitors: FollowerResourceState<BilibiliFollowerMonitorV2[]> = monitorsQuery.data
    ? { phase: "success", data: monitorsQuery.data.items, total: monitorsQuery.data.total, refreshing: monitorsQuery.isFetching,
        ...(monitorsQuery.isError && readErrorVisible ? { staleMessage: monitorsQuery.error.message } : {}) }
    : monitorsQuery.isError
      ? { phase: "error", message: monitorsQuery.error.message }
      : { phase: "loading" }
  const trends: FollowerResourceState<BilibiliFollowerTrendV2[]> = selectedUserIds.length === 0
    ? { phase: "success", data: [] }
    : trendsQuery.data
      ? { phase: "success", data: trendsQuery.data, refreshing: trendsQuery.isFetching,
          ...(trendsQuery.currentError ? { staleMessage: trendsQuery.currentError } : {}) }
      : trendsQuery.currentError
        ? { phase: "error", message: trendsQuery.currentError }
        : { phase: "loading" }
  const toggleTrendUser = (userId: string): void => {
    setSelectedUserIds((ids) => ids.includes(userId) ? ids.filter((id) => id !== userId) : ids.length < 4 ? [...ids, userId] : ids)
  }

  return (
    <BilibiliFollowerWorkspace
      view={view}
      monitors={monitors}
      trends={trends}
      creationOpen={creationOpen}
      mutationError={undefined}
      addSuccess={addSuccess}
      settingsSuccess={settingsSuccess}
      refreshSuccess={refreshSuccess}
      actionError={actionError}
      busyUserIds={busyUserIds}
      savingIntervalUserIds={savingIntervalUserIds}
      intervalDrafts={intervalDrafts}
      onIntervalDraftChange={(user, value) => {
        const intervalSeconds = clampFollowerInterval(value)
        setIntervalDrafts(drafts => ({ ...drafts, [user.id]: { value: intervalSeconds, dirty: intervalSeconds !== user.intervalSeconds } }))
      }}
      selectedUserIds={selectedUserIds}
      trendIndicator={trendsQuery.indicator}
      onSwapTrends={(source, target) => setSelectedUserIds(ids => swapFollowerTrends(ids, source, target))}
      onReloadTrends={trendsQuery.reload}
      onCloseCreation={onCloseCreation}
      onAdd={async (input, onCommitted) => { await addMutation.mutateAsync({ input, ...(onCommitted ? { onCommitted } : {}) }) }}
      onRefreshUser={refreshUser}
      onUpdateStatus={async (userId, enabled) => { await runUserAction(userId, () => bridge.bilibiliFollowersV2.updateStatus({ userId, enabled })) }}
      onUpdateSettings={saveInterval}
      onDelete={async (userId) => { await runUserAction(userId, async () => {
        await bridge.bilibiliFollowersV2.remove({ userId })
        setSelectedUserIds((ids) => ids.filter((id) => id !== userId))
      }) }}
      onReload={() => { void monitorsQuery.refetch({ cancelRefetch: false }) }}
      onToggleTrendUser={toggleTrendUser}
    />
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
