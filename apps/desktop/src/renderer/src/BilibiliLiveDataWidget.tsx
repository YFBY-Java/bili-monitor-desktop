import type { BilibiliLiveDanmakuRecent, BilibiliLiveRankEntry, BilibiliLiveRankRefreshInput,
  BilibiliLiveRankRefreshResult, BilibiliLiveRankSummary, BilibiliLiveRankRefreshResultV2,
  BilibiliLiveRankSummaryV2, BilibiliLiveRankEntryV2, BilibiliSubjectWorkbench } from "@bmd/contracts"
import { useEffect, useRef, useState, type JSX } from "react"
import { widgetAvatarUrl, widgetCount, widgetGuardLevel, widgetRankEntries, widgetRankHint, widgetRankKey,
  widgetRankLabel, widgetRankSnapshots, widgetRankSortLabel, widgetRankValue, widgetRelativeTime } from "./bilibili-live-widget-format"

export type LiveWidgetRoom = Pick<NonNullable<BilibiliSubjectWorkbench["bilibiliLiveRoom"]>, "monitorId" | "liveStatus">
export interface BilibiliLiveDataWidgetProps {
  room?: LiveWidgetRoom
  danmu: BilibiliSubjectWorkbench["danmu"]
  recentMessages?: BilibiliLiveDanmakuRecent[]
  rankSummary?: BilibiliLiveRankSummary | BilibiliLiveRankSummaryV2
  rankLoading?: boolean
  danmuLoading?: boolean
  danmuError?: string
  rankError?: string
  onRanksVisible?: () => void
  onStart?: (protocolVersion?: number) => Promise<void>
  onStop?: () => Promise<void>
  onRankRefresh?: (input: BilibiliLiveRankRefreshInput) => Promise<BilibiliLiveRankRefreshResult | BilibiliLiveRankRefreshResultV2>
}

export function BilibiliLiveDataWidget({ room, danmu, recentMessages, rankSummary, rankLoading = false,
  danmuLoading = false, danmuError, rankError, onRanksVisible, onStart, onStop, onRankRefresh }: BilibiliLiveDataWidgetProps): JSX.Element {
  const [mode, setMode] = useState<"danmu" | "audience" | "guard">("danmu")
  const [protocol, setProtocol] = useState(-1)
  const [keys, setKeys] = useState({ AUDIENCE: "online_rank:contribution_rank", GUARD: "guard_weekly" })
  const [directions, setDirections] = useState<Record<string, "asc" | "desc">>({})
  const [operating, setOperating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const actionLock = useRef(false), refreshLock = useRef(false)
  const list = useRef<HTMLDivElement>(null), pointer = useRef(false)
  const [scrollResume, setScrollResume] = useState(0)
  const messages: BilibiliLiveDanmakuRecent[] = (recentMessages ?? danmu.recentMessages).slice(-60)
  const last = messages.at(-1)
  useEffect(() => {
    if (mode !== "danmu" || pointer.current) return
    const timer = window.setTimeout(() => {
      if (pointer.current) return
      list.current?.scrollTo({ top: list.current.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [mode, messages.length, last?.sentAt, last?.messageText, scrollResume])
  const connected = danmu.status === "connected", live = room?.liveStatus === 1
  const stateLabel = !danmu.enabled ? "未启用" : connected ? live ? "采集中" : "监听中"
    : ({ waiting: "待监听", stopped: "已停止", missing_live_room: "未绑定直播间", error: "连接异常" }[danmu.status] ?? "连接中")
  const empty = !danmu.enabled ? ["弹幕模块未启用", "在绑定设置中开启弹幕模块后，会自动保持直播中的房间连接。"]
    : !room ? ["需要先绑定直播间监控", "弹幕采集依赖直播间监控，请先为该用户绑定一个直播间。"]
    : danmu.status === "error" ? ["弹幕连接暂时不可用", "可能是网络、B站风控或直播间状态变化导致，稍后可再次刷新查看。"]
    : connected && !live ? ["未开播，弹幕通道监听中", "已连接 B站弹幕信息流。未开播时通常只有心跳、看过人数等轻量事件；直播开始后会自动显示实时弹幕。"]
    : danmu.status === "stopped" ? ["弹幕监听已停止", "可以手动开启未开播监听，或等待自动连接任务重新拉起。"]
    : danmu.status === "waiting" ? ["弹幕监听待启动", "未开播房间也支持监听；自动任务会尝试保持连接，也可以点击手动开启。"]
    : ["等待直播间弹幕数据", "连接已建立，正在等待新的弹幕事件。"]
  const family = mode === "guard" ? "GUARD" : "AUDIENCE"
  const snapshots = widgetRankSnapshots(rankSummary?.snapshots ?? [], family)
  const active = snapshots.find(item => widgetRankKey(item) === keys[family]) ?? snapshots[0]
  const key = active ? widgetRankKey(active) : keys[family]
  const direction = directions[key] ?? "desc"
  const count = family === "GUARD" ? rankSummary?.guardCountText || widgetCount(rankSummary?.guardCount)
    : rankSummary?.audienceCountText || widgetCount(rankSummary?.audienceCount)
  const changeKey = (value: string) => setKeys(current => ({ ...current, [family]: value }))
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
  const operate = async () => {
    if (actionLock.current) return
    actionLock.current = true; setOperating(true); setActionError(undefined); setNotice(undefined)
    try {
      if (connected) { await onStop?.(); setNotice("弹幕监控已停止") }
      else { await onStart?.(protocol < 0 ? undefined : protocol); setNotice(protocol < 0 ? "弹幕监控已按自动兼容模式启动" : `弹幕监控已按 protover=${protocol} 启动`) }
    } catch (error) { setActionError(errorText(error)) }
    finally { actionLock.current = false; setOperating(false) }
  }
  const refreshRanks = async () => {
    if (!room || !onRankRefresh || refreshLock.current) return
    refreshLock.current = true; setRefreshing(true); setActionError(undefined); setNotice(undefined)
    try {
      const [type, rankSwitch] = key.split(":")
      const result = await onRankRefresh({ roomMonitorId: room.monitorId, families: [family],
        types: [rankSwitch || type].filter((value): value is string => Boolean(value)), maxPages: 4, force: true })
      setNotice(result.errors.length ? `榜单已刷新 ${result.successCount} 项，${result.errors.length} 项失败` : "榜单已刷新")
      if (result.errors.length) setActionError(result.errors.join("；"))
    } catch (error) { setActionError(errorText(error)) }
    finally { refreshLock.current = false; setRefreshing(false) }
  }
  const reading = () => { if (mode === "danmu") pointer.current = true }
  return <article className="panel subject-widget subject-live-data-widget" aria-label="直播间弹幕监控">
    <div className="panel-header compact"><div><p>LIVE ROOM DATA</p><h2>直播间弹幕监控</h2></div>
      <span className={`subject-status ${connected ? "is-active" : ""}`}>{stateLabel}</span></div>
    <div onMouseEnter={reading} onMouseMove={reading} onWheel={reading}
      onMouseLeave={() => { pointer.current = false; setScrollResume(value => value + 1) }}>
      <div className="subject-data-modes" role="tablist" aria-label="直播间数据视图">
        {([["danmu", "弹幕", "实时流"], ["audience", "房间观众", "榜单"], ["guard", "大航海", "舰长"]] as const).map(([value, label, hint]) => (
          <button key={value} role="tab" type="button" aria-label={`${label} ${hint}`} aria-selected={mode === value}
            className={mode === value ? "is-active" : ""} onClick={() => { setMode(value); if (value !== "danmu") onRanksVisible?.() }}>
            <strong>{label}</strong><span>{hint}</span></button>))}
      </div>
      {actionError && <p className="live-widget-feedback inline-error" role="alert">{actionError}</p>}
      {notice && <p className="live-widget-feedback" role="status">{notice}</p>}
      {mode === "danmu" ? <>
        {danmuError && <p className="live-widget-feedback inline-error" role="alert">弹幕更新失败，保留上次数据：{danmuError}</p>}
        {danmuLoading && <p className="live-widget-feedback" role="status">弹幕读取中…</p>}
        <div className="subject-danmu-metrics">
          <div><span>弹幕数</span><strong>{danmu.last5MinutesCount ?? "--"}</strong></div>
          <div><span>点赞增量</span><strong>{danmu.likeIncrement && danmu.likeIncrement > 0 ? "+" : ""}{widgetCount(danmu.likeIncrement)}</strong></div>
          <div><span>看过人数</span><strong>{widgetCount(danmu.watchedCount)}</strong></div>
        </div>
        {danmu.enabled && room && <div className="subject-danmu-actions">
          <select aria-label="弹幕协议版本" value={protocol} disabled={operating} onChange={event => setProtocol(Number(event.target.value))}>
            <option value={-1}>自动兼容</option>{[3, 2, 1, 0].map(value => <option key={value} value={value}>protover={value}</option>)}
          </select>
          <button className="button button-secondary" type="button" disabled={operating || (connected ? !onStop : !onStart)} onClick={() => void operate()}>
            {operating ? "正在处理…" : connected ? "停止弹幕监控" : live ? "手动开启" : "手动开启未开播监控"}</button>
        </div>}
        {messages.length ? <div className="subject-danmu-list" ref={list} aria-label="最近弹幕">
          {messages.map((message, index) => {
            const sender = `${message.displayName?.trim() || "游客"}${message.senderUid && /^[1-9]\d*$/.test(message.senderUid) ? ` · UID ${message.senderUid}` : ""}`
            return <div key={`${message.sentAt}-${index}`}><strong title={sender}>{sender}</strong><span>{message.messageText}</span><time dateTime={message.sentAt}>{widgetRelativeTime(message.sentAt)}</time></div>
          })}</div> : <div className="subject-rank-empty live-widget-empty"><strong>{empty[0]}</strong><span>{empty[1]}</span></div>}
      </> : <div className="subject-rank-panel" aria-busy={rankLoading || refreshing}>
        {rankError && <p className="inline-error" role="alert">榜单读取失败，保留上次快照：{rankError}</p>}
        <div className="subject-rank-summary"><span>{family === "GUARD" ? "大航海" : "房间观众"}</span><strong>{count}</strong>
          <button className="button button-secondary" type="button" disabled={refreshing || !room || !onRankRefresh} onClick={() => void refreshRanks()}>{refreshing ? "刷新中…" : "刷新榜单"}</button>
        </div>
        <span className="live-widget-snapshot">快照 {widgetRelativeTime(rankSummary?.updatedAt)}</span>
        {rankLoading && <span role="status">榜单读取中…</span>}
        {!room ? <div className="subject-rank-empty"><strong>需要先绑定直播间监控</strong><span>绑定直播间后，可以在这里查看房间观众和大航海榜单。</span></div>
          : !active ? <div className="subject-rank-empty"><strong>暂无{family === "GUARD" ? "大航海" : "房间观众"}快照</strong><span>点击刷新榜单后，会展示在线榜、进房、周期榜或大航海排行。</span></div>
          : <>
            <div className="subject-rank-tabs" role="tablist" aria-label="榜单类型">{snapshots.map(snapshot => <button type="button" role="tab"
              key={widgetRankKey(snapshot)} aria-selected={key === widgetRankKey(snapshot)} className={key === widgetRankKey(snapshot) ? "is-active" : ""}
              onClick={() => changeKey(widgetRankKey(snapshot))}>{widgetRankLabel(snapshot)}</button>)}</div>
            <div className="live-widget-sort"><div><strong>{widgetRankLabel(active, true)}</strong><span>{widgetRankHint(active)}</span></div>
              <label><span className="sr-only">榜单排序方式</span><select aria-label="榜单排序方式" value={key} onChange={event => changeKey(event.target.value)}>
                {snapshots.map(snapshot => <option key={widgetRankKey(snapshot)} value={widgetRankKey(snapshot)}>{widgetRankLabel(snapshot)} · {widgetRankSortLabel(snapshot)}</option>)}</select></label>
              <button className="button button-secondary" type="button" onClick={() => setDirections(current => ({ ...current, [key]: direction === "desc" ? "asc" : "desc" }))}>{direction === "desc" ? "降序" : "升序"}</button>
            </div>
            <div className="subject-rank-list">{active.entries.length ? widgetRankEntries(active, direction).map((entry, index) => (
              <div key={`${active.id}-${entry.entryKind}-${entry.rankNo ?? index}-${entry.userUid ?? index}`}>
                <em>{entry.rankNo ? entry.rankNo <= 3 ? `榜${entry.rankNo}` : entry.rankNo : "-"}</em><RankAvatar entry={entry} />
                <strong title={entry.displayName}>{entry.displayName || "匿名用户"}</strong>
                <small>{family === "GUARD" ? `${widgetGuardLevel(entry.guardLevel)}${entry.accompanyDays ? ` · 陪伴 ${entry.accompanyDays} 天` : ""}` : entry.medalName ? `${entry.medalName}${entry.medalLevel ? ` Lv.${entry.medalLevel}` : ""}` : "无粉丝牌"}</small>
                <b title={entry.score === undefined ? undefined : BigInt(entry.score).toLocaleString("zh-CN")}>{widgetRankValue(active, entry)}</b>
              </div>)) : <span>这个榜单暂无明细</span>}</div>
          </>}
      </div>}
    </div>
  </article>
}
function RankAvatar({ entry }: { entry: BilibiliLiveRankEntry | BilibiliLiveRankEntryV2 }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const url = widgetAvatarUrl(entry.faceUrl)
  useEffect(() => setFailed(false), [url])
  return <span>{url && !failed ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : (entry.displayName || "?").slice(0, 1)}</span>
}
