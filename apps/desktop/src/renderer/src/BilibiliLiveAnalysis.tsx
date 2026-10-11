import type { BilibiliLiveRoomV2, BilibiliLiveSessionInsight, BilibiliLiveSessionSummary } from "@bmd/contracts"
import { RefreshCcw } from "lucide-react"

import { SessionInsightTrendChart } from "./SessionInsightTrendChart"
import { SearchableSelect } from "./SearchableSelect"
import "./BilibiliLiveAnalysis.css"

export interface BilibiliLiveAnalysisProps {
  rooms: readonly BilibiliLiveRoomV2[]
  sessions: readonly BilibiliLiveSessionSummary[]
  insight?: BilibiliLiveSessionInsight | undefined
  selectedRoomId?: BilibiliLiveRoomV2["id"] | undefined
  selectedSessionId?: BilibiliLiveSessionSummary["id"] | undefined
  bucketSeconds: BilibiliLiveSessionInsight["bucketSeconds"]
  loading: boolean
  errorMessage?: string | undefined
  autoRefresh: boolean
  refreshSeconds: number
  onRoomChange?: ((roomId: BilibiliLiveRoomV2["id"]) => void) | undefined
  onSessionChange?: ((sessionId: BilibiliLiveSessionSummary["id"]) => void) | undefined
  onBucketChange?: ((bucketSeconds: BilibiliLiveSessionInsight["bucketSeconds"]) => void) | undefined
  onRefresh: () => void
  onAutoRefreshChange: (enabled: boolean) => void
  onRefreshSecondsChange: (seconds: number) => void
}

export function BilibiliLiveAnalysis({ rooms, sessions, insight, selectedRoomId, selectedSessionId,
  bucketSeconds = 300, loading = false, errorMessage, autoRefresh = false, refreshSeconds = 10,
  onRoomChange, onSessionChange, onBucketChange, onRefresh, onAutoRefreshChange, onRefreshSecondsChange
}: BilibiliLiveAnalysisProps) {
  const roomId = selectedRoomId ?? rooms[0]?.id
  const sessionId = selectedSessionId ?? sessions[0]?.id
  const session = sessions.find(item => item.id === sessionId)
  const analysis = insight?.sessionId === sessionId ? insight : undefined
  const timeline = analysis?.timeline ?? []
  const first = timeline[0], last = timeline.at(-1)
  const segmentMaximum = Math.max(1, ...(analysis?.userSegments.map(item => item.userCount) ?? []))

  return <section className="bilibili-live-analysis" aria-label="分析看板" aria-busy={loading}>
    <header className="analysis-header">
      <div><h2>分析看板</h2><p>围绕单场直播判断互动效率、付费转化、用户结构和可行动信号。</p></div>
      <button type="button" className="button button-primary" disabled={loading || !sessionId} onClick={onRefresh}>
        <RefreshCcw size={15} aria-hidden="true" />{loading ? "正在刷新" : "立即刷新"}
      </button>
    </header>

    <div className="analysis-controls analysis-card">
      <label><span>直播间</span><SearchableSelect label="直播间" value={roomId ?? ""} disabled={rooms.length === 0}
        placeholder="选择直播间" onChange={value => onRoomChange?.(value)}
        options={rooms.length === 0 ? [{ value: "", label: "暂无直播间" }]
          : rooms.map(room => ({ value: room.id, label: `${room.uname || "未知主播"} · ${room.roomId}` }))} /></label>
      <label><span>分析场次</span><SearchableSelect label="直播场次" value={sessionId ?? ""} disabled={sessions.length === 0}
        placeholder="选择场次" onChange={value => onSessionChange?.(value)}
        options={sessions.length === 0 ? [{ value: "", label: "暂无直播场次" }]
          : sessions.map(item => ({ value: item.id, label: `#${item.id} · ${dateTime(item.startedAt)} · ${stateLabel(item.state)}` }))} /></label>
      <label><span>时间粒度</span><select aria-label="时间粒度" value={bucketSeconds} onChange={event => {
        const seconds = Number(event.currentTarget.value)
        if (seconds === 60 || seconds === 300 || seconds === 900) onBucketChange?.(seconds)
      }}><option value={60}>1 分钟</option><option value={300}>5 分钟</option><option value={900}>15 分钟</option></select></label>
      <div className="analysis-auto-refresh"><span>自动刷新</span><div>
        <button type="button" className="analysis-switch" role="switch" aria-label="自动刷新" aria-checked={autoRefresh}
          onClick={() => onAutoRefreshChange(!autoRefresh)}><i aria-hidden="true" /></button>
        <input type="number" aria-label="分析自动刷新秒数" min={3} max={3600} step={1} value={refreshSeconds}
          onChange={event => onRefreshSecondsChange(event.currentTarget.valueAsNumber)} /><span>秒</span>
      </div></div>
    </div>

    {errorMessage && <div className="analysis-notice is-error" role="alert"><strong>分析刷新失败</strong><p>{errorMessage}</p>
      {analysis && <p>当前展示上次成功读取的分析结果，可点击立即刷新重试。</p>}</div>}
    {loading && analysis && <p className="analysis-updating" role="status">正在更新，当前展示上次成功读取的分析结果。</p>}

    {!analysis || !session ? <div className="analysis-card analysis-empty-state" role={loading ? "status" : undefined}>
      <strong>{loading ? "正在读取场次分析" : rooms.length === 0 ? "请先添加直播间" : sessions.length === 0 ? "当前直播间暂无场次数据" : "请选择包含场次数据的直播间"}</strong>
      <p>{loading ? "读取完成后显示本场互动与付费分析。" : "选择直播间与分析场次后查看已记录的互动和付费事件。"}</p>
    </div> : <>
      <p className="analysis-notice is-warning">{analysis.quality.caveat}</p>
      <div className="analysis-kpis">
        <Metric label="弹幕速率" value={rate(analysis.kpis.danmakuPerMinute)} note={`按 ${duration(analysis.quality.coveredSeconds)} 在线覆盖折算`} accent />
        <Metric label="付费转化率" value={percent(analysis.kpis.payerConversionRate)} note="付费 UID / 互动 UID" />
        <Metric label="付费金额" value={money(analysis.kpis.paidAmountMilliYuan)} note={`${integer(session.paidEventCount)} 个付费事件`} money />
        <Metric label="ARPPU" value={money(analysis.kpis.arppuMilliYuan)} note="每位已识别付费用户" />
        <Metric label="Top 5 收入占比" value={percent(analysis.kpis.topFiveRevenueShare)} note="衡量付费集中度" />
      </div>

      <section className="analysis-card analysis-signal-card" aria-label="互动与付费信号轨">
        <CardHeading title="互动与付费信号轨" description="所有峰值使用同一场次时间轴；只表示同时段信号，不推断因果。" extra={`${analysis.bucketSeconds / 60} 分钟粒度`} />
        <div className="analysis-signal-rail">
          <div className="analysis-rail-line" aria-hidden="true" />
          <time className="analysis-rail-start" dateTime={first?.bucketStart}>{clock(first?.bucketStart)}</time>
          <time className="analysis-rail-end" dateTime={last?.bucketStart}>{clock(last?.bucketStart)}</time>
          {analysis.peaks.map(peak => <button type="button" key={`${peak.type}-${peak.bucketStart}`}
            className={`analysis-signal-marker is-${peak.type.toLowerCase()}`} style={{ left: `${peakPosition(peak.bucketStart, timeline)}%` }}
            title={`${peak.label} · ${dateTime(peak.bucketStart)}`} aria-label={`${peak.label} · ${dateTime(peak.bucketStart)}`}>
            <i aria-hidden="true" /><b>{peak.label}</b>
          </button>)}
          {analysis.peaks.length === 0 && <p>当前场次还没有可标记的互动或付费峰值</p>}
        </div>
      </section>

      <div className="analysis-pair-grid">
        <section className="analysis-card"><CardHeading title="互动趋势" description="弹幕量与已识别活跃用户按同一时间桶聚合。" />
          <SessionInsightTrendChart timeline={timeline} kind="interaction" /></section>
        <section className="analysis-card"><CardHeading title="付费趋势" description="金额按元展示，保留后端毫元精度计算结果。" />
          <SessionInsightTrendChart timeline={timeline} kind="payment" /></section>
      </div>

      <div className="analysis-pair-grid">
        <section className="analysis-card"><CardHeading title="弹幕参与深度" description="只按可识别正 UID 计算参与率；直播弹幕时段等分为开场、中段、收尾。" extra={`${integer(analysis.danmakuDepth.identifiedDanmakuUserCount)} 人`} />
          <div className="analysis-depth-metrics is-four">
            <Metric label="已识别人均弹幕" value={decimal(analysis.danmakuDepth.messagesPerActiveUser)} note="已识别弹幕 / 弹幕 UID" />
            <Metric label="重复互动率" value={percent(analysis.danmakuDepth.repeatInteractionRate)} note="至少发送 3 条弹幕" />
            <Metric label="持续参与率" value={percent(analysis.danmakuDepth.sustainedParticipationRate)} note="至少活跃在 2 个阶段" />
            <Metric label="重复内容占比" value={percent(analysis.danmakuDepth.duplicateMessageRate)} note="文本重复，不直接判定刷屏" />
          </div>
          <div className="analysis-depth-section"><SectionLabel title="阶段参与" note="消息占比 · 活跃 UID" />
            <div className="analysis-stage-list">{analysis.danmakuDepth.stages.map(stage => <div key={stage.code}>
              <span>{stage.label}</span><Bar width={percentageWidth(stage.messageShare)} /><b>{percent(stage.messageShare)}</b><em>{integer(stage.activeUserCount)} 人</em>
            </div>)}</div>
            {analysis.danmakuDepth.stages.length === 0 && <p className="analysis-inline-empty">本场暂无阶段参与数据</p>}
          </div>
          <div className="analysis-depth-section"><SectionLabel title="高频弹幕" note="标准化文本 Top 5" />
            {analysis.danmakuDepth.repeatedMessages.length ? <div className="analysis-repeated-list">
              {analysis.danmakuDepth.repeatedMessages.map(message => <div key={message.messageText}>
                <strong title={message.messageText}>{message.messageText}</strong><span>{integer(message.messageCount)} 条 · {integer(message.userCount)} 个 UID</span>
              </div>)}
            </div> : <p className="analysis-inline-empty">本场没有出现至少 2 次的相同弹幕文本</p>}
          </div>
        </section>

        <section className="analysis-card"><CardHeading title="付费用户深度" description="聚焦可识别付费 UID 的复购、互动后转化与收入结构。" extra={`${integer(analysis.paymentDepth.payerCount)} 人`} />
          <div className="analysis-depth-metrics">
            <Metric label="场内复购率" value={percent(analysis.paymentDepth.repeatPayerRate)} note="本场至少 2 次付费事件" />
            <Metric label="互动付费者" value={percent(analysis.paymentDepth.engagedPayerRate)} note="本场也发送过弹幕" />
            <Metric label="历史复购者" value={percent(analysis.paymentDepth.returningPayerRate)} note="在已记录更早场次付费过" />
            <Metric label="付费中位数" value={money(analysis.paymentDepth.medianPayerAmountMilliYuan)} note="降低极端大额的干扰" />
            <Metric label="互动后付费中位时长" value={duration(analysis.paymentDepth.medianConversionLagSeconds)} note="仅统计先弹幕后付费者" />
            <Metric label="Top 1 收入占比" value={percent(analysis.paymentDepth.topOneRevenueShare)} note="识别单一大额依赖" />
          </div>
          <div className="analysis-depth-section"><SectionLabel title="消费层级" note="<1 元 / 1–10 元 / ≥10 元" />
            <div className="analysis-tier-list">{analysis.paymentDepth.spendTiers.map(tier => <div key={tier.code}>
              <div><strong>{tier.label}</strong><span>{integer(tier.userCount)} 人</span></div>
              <Bar width={percentageWidth(tier.revenueShare)} tone="mint" /><b>{money(tier.paidAmountMilliYuan)}</b><em>{percent(tier.revenueShare)}</em>
            </div>)}</div>
            {analysis.paymentDepth.spendTiers.length === 0 && <p className="analysis-inline-empty">本场暂无消费层级数据</p>}
          </div>
          <p className="analysis-method-note">历史复购仅基于本项目同一直播间已记录的更早场次，不代表用户在平台上的全部付费历史。</p>
        </section>
      </div>

      <div className="analysis-pair-grid">
        <section className="analysis-card"><CardHeading title="用户分层" description="只统计正 UID，四类互斥；条形以最大分层人数为参照。" extra={`${integer(analysis.userSegments.reduce((total, segment) => total + segment.userCount, 0))} 人`} />
          <div className="analysis-segment-list">{analysis.userSegments.map(segment => <div key={segment.code}>
            <div><strong>{segment.label}</strong><span>{segment.description}</span></div>
            <Bar width={Math.max(segment.userCount > 0 ? 6 : 0, segment.userCount / segmentMaximum * 100)} /><b>{integer(segment.userCount)}</b>
          </div>)}</div>
          {analysis.userSegments.length === 0 && <p className="analysis-inline-empty">本场暂无已识别用户分层</p>}
        </section>
        <section className="analysis-card"><CardHeading title="礼物结构" description="按付费金额、数量排序的 Top 12。" />
          {analysis.giftMix.length ? <div className="analysis-gift-list">{analysis.giftMix.slice(0, 12).map(gift => <div key={`${gift.eventKind}-${gift.giftName}`}>
            <div><strong>{giftName(gift.eventKind, gift.giftName)}</strong><span>{integer(gift.giftCount)} 件</span></div>
            <div><b>{money(gift.paidAmountMilliYuan)}</b><em>{percent(gift.revenueShare)}</em></div>
          </div>)}</div> : <p className="analysis-inline-empty">本场没有礼物或付费事件</p>}
        </section>
      </div>

      <section className="analysis-card"><CardHeading title="规则洞察" description="结论来自公开口径的确定性规则，可直接回溯原始时间桶。" extra={`${analysis.findings.length} 条`} />
        <div className="analysis-finding-list">{analysis.findings.map(finding => <article className={`is-${finding.level.toLowerCase()}`} key={finding.code}>
          <span>{findingLabel(finding.level)}</span><div><strong>{finding.title}</strong><p>{finding.description}</p></div>
        </article>)}</div>
        {analysis.findings.length === 0 && <p className="analysis-inline-empty">当前场次暂无规则洞察</p>}
      </section>
      <div className="analysis-quality" aria-label="分析数据质量">
        <div><span>采集覆盖</span><strong>{coverageLabel(analysis.quality.coverageStatus)}</strong></div>
        <div><span>支持事件</span><strong>{integer(analysis.quality.supportedEventCount)}</strong></div>
        <div><span>身份解析事件占比</span><strong>{percent(analysis.quality.identityResolvedEventShare)}</strong></div>
        <div><span>事件延迟 P95</span><strong>{analysis.quality.eventLatencyP95Millis == null ? "--" : `${integer(analysis.quality.eventLatencyP95Millis)} ms`}</strong></div>
      </div>
    </>}
  </section>
}

function Metric({ label, value, note, accent = false, money: isMoney = false }: { label: string; value: string; note: string; accent?: boolean; money?: boolean }) {
  return <article className={`analysis-metric${accent ? " is-accent" : ""}${isMoney ? " is-money" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}
function CardHeading({ title, description, extra }: { title: string; description: string; extra?: string }) {
  return <header className="analysis-card-heading"><div><h3>{title}</h3><p>{description}</p></div>{extra && <span>{extra}</span>}</header>
}
function SectionLabel({ title, note }: { title: string; note: string }) {
  return <div className="analysis-section-label"><strong>{title}</strong><span>{note}</span></div>
}
function Bar({ width, tone = "coral" }: { width: number; tone?: "coral" | "mint" }) {
  return <div className={`analysis-bar tone-${tone}`} aria-hidden="true"><i style={{ width: `${width}%` }} /></div>
}
function integer(value?: number | null): string { return value == null || !Number.isFinite(value) ? "--" : value.toLocaleString("zh-CN") }
function decimal(value?: number | null): string { return value == null || !Number.isFinite(value) ? "--" : value.toFixed(2) }
function percent(value?: number | null): string { return value == null || !Number.isFinite(value) ? "--" : `${(value * 100).toFixed(1)}%` }
function rate(value?: number | null): string { return value == null || !Number.isFinite(value) ? "--" : `${value.toFixed(2)} /分钟` }
function money(value?: number | null): string {
  return value == null || !Number.isFinite(value) ? "--"
    : `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value / 1000)}`
}
function duration(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "--"
  const seconds = Math.floor(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60)
  return [hours ? `${hours}小时` : "", minutes ? `${minutes}分` : "", `${seconds % 60}秒`].filter(Boolean).join(" ")
}
function dateTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "--"
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value))
}
function clock(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "--"
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))
}
function stateLabel(state: BilibiliLiveSessionSummary["state"]): string {
  return { CLOSED: "已结束", OPEN: "直播中", END_PENDING: "待确认", INCOMPLETE: "边界不完整" }[state]
}
function coverageLabel(status: BilibiliLiveSessionInsight["quality"]["coverageStatus"]): string {
  return { RECEIVED_WHILE_ONLINE: "在线接收覆盖", BOUNDARY_ONLY: "仅历史边界", NO_ONLINE_COVERAGE: "无在线覆盖" }[status]
}
function findingLabel(level: BilibiliLiveSessionInsight["findings"][number]["level"]): string {
  return { RISK: "风险", OPPORTUNITY: "机会", INFO: "提示" }[level]
}
function giftName(eventKind: string, name: string): string { return eventKind === "SUPER_CHAT" ? "醒目留言" : eventKind === "GUARD_BUY" ? "大航海" : name }
function percentageWidth(value: number | null): number { return value == null || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(value > 0 ? 4 : 0, value * 100)) }
function peakPosition(value: string, timeline: BilibiliLiveSessionInsight["timeline"]): number {
  const times = timeline.map(item => Date.parse(item.bucketStart)).filter(Number.isFinite)
  const start = times[0], end = times.at(-1), time = Date.parse(value)
  if (times.length < 2 || start === undefined || end === undefined || end <= start || !Number.isFinite(time)) return 50
  return Math.min(96, Math.max(4, (time - start) / (end - start) * 100))
}
