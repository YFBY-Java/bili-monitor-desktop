import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Blocks,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDotDashed,
  Clock3,
  Command,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  HardDrive,
  History,
  KeyRound,
  Layers3,
  MoreHorizontal,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  PlugZap,
  Plus,
  Radar,
  Radio,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UsersRound,
  Workflow,
  Wrench,
  X,
  type LucideIcon
} from "lucide-react"
import type { DesktopBridge } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useMemo, useState, type JSX } from "react"

import { ConnectedAccountSubjectWorkspace } from "./AccountSubjectWorkspace"
import { ConnectedBilibiliAuthPanel } from "./BilibiliAuthPanel"
import { ConnectedBilibiliFollowerWorkspace } from "./BilibiliFollowerWorkspace"
import { ConnectedBilibiliLiveWorkspace } from "./BilibiliLiveWorkspace"
import { ConnectedBilibiliSubjectWorkspace } from "./BilibiliSubjectWorkspace"
import { ConnectedDouyinAuthWorkspace } from "./DouyinAuthWorkspace"
import { resolvePageId } from "./navigation-state"
import {
  findProductPage,
  navigationGroups,
  type IconName,
  type PageId,
  type ProductPage,
  type Tone
} from "./product-model"

const iconMap: Record<IconName, LucideIcon> = {
  activity: Activity,
  users: UsersRound,
  radar: Radar,
  radio: Radio,
  database: Database,
  bot: Bot,
  history: History,
  book: BookOpen,
  cpu: Cpu,
  flask: FlaskConical,
  key: KeyRound,
  plug: PlugZap,
  network: Network,
  wrench: Wrench,
  workflow: Workflow,
  blocks: Blocks,
  shield: ShieldCheck,
  chart: ChartNoAxesCombined,
  settings: Settings2
}

const signalEvents: Array<{
  time: string
  source: string
  message: string
  tone: Tone
}> = [
  { time: "20:36:18", source: "LIVE", message: "room 21987615 弹幕速率 188/min", tone: "coral" },
  { time: "20:36:16", source: "CRAWL", message: "campaign 482 checkpoint 已提交", tone: "cyan" },
  { time: "20:36:13", source: "AGENT", message: "直播复盘正在查询场次证据", tone: "violet" },
  { time: "20:36:09", source: "MODEL", message: "analysis-primary 本地路由命中", tone: "mint" },
  { time: "20:36:02", source: "POLICY", message: "导出报告等待人工批准", tone: "amber" }
]

const activityFeed = [
  { time: "刚刚", title: "弹幕事件写入", detail: "bilibili.live.danmaku · 284 条", tone: "coral" as Tone },
  { time: "8 秒", title: "Agent 工具完成", detail: "data.query · 1.84s", tone: "violet" as Tone },
  { time: "21 秒", title: "原始对象已校验", detail: "warc/22/482 · BLAKE3", tone: "cyan" as Tone },
  { time: "2 分", title: "凭据健康检查", detail: "Bilibili · ACTIVE", tone: "mint" as Tone },
  { time: "4 分", title: "审批正在等待", detail: "artifact.export · L2", tone: "amber" as Tone }
]

export interface DesktopWorkspaceProps {
  initialPageId: PageId
  runtime?: RuntimeViewState
  bridge?: DesktopBridge
}

export interface RuntimeViewState {
  phase: "starting" | "ready" | "degraded" | "offline"
  version?: string
  schemaVersion?: number
  workerCount?: number
  error?: string
}

type ThemeMode = "light" | "dark"

function ToneDot({ tone }: { tone: Tone }): JSX.Element {
  return <span className={`tone-dot tone-${tone}`} aria-hidden="true" />
}

function Sidebar({
  activePageId,
  collapsed,
  onNavigate,
  onToggle,
  runtime
}: {
  activePageId: PageId
  collapsed: boolean
  onNavigate: (pageId: PageId) => void
  onToggle: () => void
  runtime: RuntimeViewState
}): JSX.Element {
  const runtimeTone: Tone = runtime.phase === "ready" ? "mint" : runtime.phase === "starting" ? "amber" : "coral"
  const runtimeSummary = runtime.phase === "ready" || runtime.phase === "degraded"
    ? `Core ${runtime.version ?? "?"} · SQLite v${runtime.schemaVersion ?? "?"}`
    : runtime.phase === "starting"
      ? "Core 正在启动"
      : "Core 离线 · 可诊断"

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="brand-lockup">
        <div className="brand-glyph" aria-hidden="true">
          <span>BM</span>
          <i />
        </div>
        {!collapsed && (
          <div className="brand-copy">
            <strong>BiliMonitor</strong>
            <span>SIGNAL DESK</span>
          </div>
        )}
      </div>

      <nav className="nav-scroll" aria-label="业务导航">
        {navigationGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            {!collapsed && <p className="nav-group-label">{group.label}</p>}
            {group.items.map((item) => {
              const Icon = iconMap[item.icon]
              const active = activePageId === item.pageId
              return (
                <button
                  className={`nav-item ${active ? "is-active" : ""}`}
                  key={item.pageId}
                  type="button"
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.pageId)}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && <em>{item.badge}</em>}
                </button>
              )
            })}
          </section>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="appliance-mini" title={runtime.error}>
            <ToneDot tone={runtimeTone} />
            <div>
              <strong>本地运行时</strong>
              <span>{runtimeSummary}</span>
            </div>
          </div>
        )}
        <button className="icon-button" type="button" onClick={onToggle} aria-label="切换侧边栏">
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
    </aside>
  )
}

function TopBar({
  onToggleTheme,
  theme
}: {
  onToggleTheme: () => void
  theme: ThemeMode
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="workspace-switcher">
        <span className="workspace-code">BILIMONITOR / LOCAL</span>
        <strong>本地客户端</strong>
      </div>
      <div className="topbar-actions">
        <div className="local-badge"><ToneDot tone="mint" />LOCAL ONLY</div>
        <button
          className="icon-button theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "切换至深色主题" : "切换至浅色主题"}
          title={theme === "light" ? "切换至深色主题" : "切换至浅色主题"}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>
    </header>
  )
}

function SignalTape(): JSX.Element {
  return (
    <div className="signal-tape" aria-label="实时信号带">
      <div className="signal-label">
        <Activity size={14} />
        <strong>SIGNAL TAPE</strong>
        <span>LIVE</span>
      </div>
      <div className="signal-track">
        {signalEvents.map((event) => (
          <div className="signal-event" key={`${event.time}-${event.source}`}>
            <ToneDot tone={event.tone} />
            <time>{event.time}</time>
            <strong>{event.source}</strong>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
      <button className="signal-pause" type="button" aria-label="暂停信号带">
        <Pause size={13} />
      </button>
    </div>
  )
}

function BusinessSignalTape({ page }: { page: ProductPage }): JSX.Element {
  const followerPage = page.id === "bilibili-followers"
  const businessEvents = [
    { state: followerPage ? "CRAWL" : "QUERY", source: "CORE", message: followerPage ? "到期任务由本地调度器触发 Python Worker" : "等待本地查询结果时保留当前投影", tone: "cyan" as Tone },
    { state: "SCHEMA", source: "SQLITE", message: followerPage ? "v3 · monitor / snapshot / artifact" : `v2 · ${page.id === "platform-accounts" ? "platform_account" : "subject / binding / policy"}`, tone: "mint" as Tone },
    { state: followerPage ? "EVIDENCE" : "ATOMIC", source: followerPage ? "CAS" : "OUTBOX", message: followerPage ? "原始 B站响应按 SHA-256 留存" : "业务状态与事件同事务提交", tone: "violet" as Tone }
  ]

  return (
    <div className="signal-tape" aria-label="本地投影状态带">
      <div className="signal-label">
        <Database size={14} />
        <strong>{followerPage ? "FOLLOWER PIPELINE" : "LOCAL PROJECTION"}</strong>
        <span>{followerPage ? "V3" : "V2"}</span>
      </div>
      <div className="signal-track">
        {businessEvents.map((event) => (
          <div className="signal-event" key={event.state}>
            <ToneDot tone={event.tone} />
            <time>{event.state}</time>
            <strong>{event.source}</strong>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
      <div className="signal-pause" aria-label="本地数据隔离">
        <ShieldCheck size={13} />
      </div>
    </div>
  )
}

function WorkspaceHeader({
  page,
  onPrimaryAction
}: {
  page: ProductPage
  onPrimaryAction?: () => void
}): JSX.Element {
  return (
    <section className="workspace-heading">
      <div className="heading-copy">
        <p>{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <span>{page.description}</span>
      </div>
      <div className="heading-actions">
        {page.secondaryAction && (
          <button className="button button-secondary" type="button">
            {page.secondaryAction}
          </button>
        )}
        <button className="button button-primary" type="button" onClick={onPrimaryAction}>
          <Plus size={16} /> {page.primaryAction}
        </button>
      </div>
    </section>
  )
}

function TabRail({
  page,
  activeTab,
  onChange
}: {
  page: ProductPage
  activeTab: string
  onChange: (tab: string) => void
}): JSX.Element {
  return (
    <div className="tab-rail" role="tablist" aria-label={`${page.label}视图`}>
      {page.tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === activeTab}
          className={tab === activeTab ? "is-active" : ""}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function MiniSparkline({ tone, index }: { tone: Tone; index: number }): JSX.Element {
  const paths = [
    "M2 27 C18 24, 22 17, 38 19 S61 8, 79 13 S103 5, 126 8",
    "M2 25 C17 17, 31 22, 43 14 S70 18, 84 9 S111 13, 126 4",
    "M2 22 C20 26, 31 12, 48 16 S74 7, 91 11 S112 5, 126 7",
    "M2 26 C16 23, 24 21, 39 21 S62 14, 78 15 S105 7, 126 10"
  ]
  return (
    <svg className={`mini-spark tone-stroke-${tone}`} viewBox="0 0 128 32" role="img" aria-label="最近趋势">
      <path className="spark-baseline" d="M1 29 H127" />
      <path d={paths[index % paths.length]} />
      <circle cx="126" cy={index % 2 === 0 ? 8 : 4} r="2.3" />
    </svg>
  )
}

function MetricStrip({ page }: { page: ProductPage }): JSX.Element {
  return (
    <section className="metric-strip" aria-label="关键指标">
      {page.metrics.map((metric, index) => (
        <article className="metric-cell" key={metric.label}>
          <div className="metric-label"><ToneDot tone={metric.tone} />{metric.label}</div>
          <strong>{metric.value}</strong>
          <span>{metric.detail}</span>
          <MiniSparkline tone={metric.tone} index={index} />
        </article>
      ))}
    </section>
  )
}

function SignalChart(): JSX.Element {
  return (
    <svg className="signal-chart" viewBox="0 0 760 248" role="img" aria-label="采集与直播信号趋势">
      <defs>
        <pattern id="chartGrid" width="48" height="36" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 36" fill="none" stroke="currentColor" strokeOpacity="0.11" />
        </pattern>
      </defs>
      <rect width="760" height="248" fill="url(#chartGrid)" />
      <path className="chart-area-cyan" d="M0 200 C70 194 78 154 148 164 S244 123 314 132 S410 74 485 96 S603 60 760 42 L760 248 L0 248Z" />
      <path className="chart-area-coral" d="M0 214 C84 210 101 180 168 188 S271 142 349 158 S447 112 526 132 S650 91 760 104 L760 248 L0 248Z" />
      <path className="chart-line-cyan" d="M0 200 C70 194 78 154 148 164 S244 123 314 132 S410 74 485 96 S603 60 760 42" />
      <path className="chart-line-coral" d="M0 214 C84 210 101 180 168 188 S271 142 349 158 S447 112 526 132 S650 91 760 104" />
      <circle className="chart-pulse-cyan" cx="760" cy="42" r="4" />
      <circle className="chart-pulse-coral" cx="760" cy="104" r="4" />
    </svg>
  )
}

function CommandCenterContent({ page }: { page: ProductPage }): JSX.Element {
  return (
    <div className="command-grid">
      <section className="panel signal-overview">
        <div className="panel-header">
          <div>
            <p>INGEST / 60 MINUTES</p>
            <h2>信号吞吐与实时活跃度</h2>
          </div>
          <div className="legend">
            <span><ToneDot tone="cyan" />采集事件</span>
            <span><ToneDot tone="coral" />直播事件</span>
          </div>
        </div>
        <SignalChart />
        <div className="chart-footer">
          <span>19:36</span>
          <span className="chart-callout"><Activity size={14} />峰值 14,209/min · 20:28</span>
          <span>20:36</span>
        </div>
      </section>

      <section className="panel topology-panel">
        <div className="panel-header compact">
          <div>
            <p>LOCAL TOPOLOGY</p>
            <h2>执行平面</h2>
          </div>
          <span className="health-pill"><ToneDot tone="mint" />健康</span>
        </div>
        <div className="topology-map">
          <div className="topology-core"><Activity size={20} /><strong>Local Core</strong><span>utility process</span></div>
          <i className="topology-line line-a" />
          <i className="topology-line line-b" />
          <i className="topology-line line-c" />
          <div className="topology-node node-a"><Workflow size={16} /><strong>Task Engine</strong><span>24 runs</span></div>
          <div className="topology-node node-b"><Database size={16} /><strong>Data Plane</strong><span>4 stores</span></div>
          <div className="topology-node node-c"><Bot size={16} /><strong>Agent</strong><span>2 active</span></div>
        </div>
        <div className="resource-bars">
          <div><span>CPU</span><i><b style={{ width: "42%" }} /></i><strong>42%</strong></div>
          <div><span>GPU</span><i><b style={{ width: "74%" }} /></i><strong>74%</strong></div>
          <div><span>DISK</span><i><b style={{ width: "45%" }} /></i><strong>45%</strong></div>
        </div>
      </section>

      <FeatureMatrix page={page} />
      <RecordPanel page={page} />
    </div>
  )
}

function FeatureMatrix({ page }: { page: ProductPage }): JSX.Element {
  return (
    <section className="panel feature-panel">
      <div className="panel-header compact">
        <div>
          <p>CAPABILITY MATRIX</p>
          <h2>功能面</h2>
        </div>
        <button className="text-button" type="button">查看全部 <ArrowUpRight size={14} /></button>
      </div>
      <div className="feature-matrix">
        {page.features.map((feature, index) => (
          <article className="feature-cell" key={feature.title}>
            <div className={`feature-symbol tone-surface-${feature.tone}`}>
              {index === 0 ? <Radar size={17} /> : index === 1 ? <Radio size={17} /> : index === 2 ? <Bot size={17} /> : <HardDrive size={17} />}
            </div>
            <div className="feature-copy">
              <strong>{feature.title}</strong>
              <p>{feature.description}</p>
            </div>
            <span className={`state-label tone-text-${feature.tone}`}><ToneDot tone={feature.tone} />{feature.state}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

function RecordPanel({ page }: { page: ProductPage }): JSX.Element {
  return (
    <section className="panel record-panel">
      <div className="panel-header compact">
        <div>
          <p>ACTIVE RECORDS</p>
          <h2>{page.id === "command-center" ? "正在关注" : `${page.label}记录`}</h2>
        </div>
        <div className="panel-tools">
          <button className="icon-button small" type="button" aria-label="导出"><Download size={14} /></button>
          <button className="icon-button small" type="button" aria-label="更多"><MoreHorizontal size={15} /></button>
        </div>
      </div>
      <div className="record-list">
        {page.records.map((record, index) => (
          <article className="record-row" key={`${record.primary}-${record.status}`}>
            <span className="record-index">{String(index + 1).padStart(2, "0")}</span>
            <div className={`record-icon tone-surface-${record.tone}`}>
              {page.id.includes("agent") ? <Bot size={16} /> : page.id === "data-assets" ? <FileText size={16} /> : <CircleDotDashed size={16} />}
            </div>
            <div className="record-primary">
              <strong>{record.primary}</strong>
              <span>{record.secondary}</span>
            </div>
            <span className="record-meta">{record.meta}</span>
            <span className={`record-status tone-text-${record.tone}`}><ToneDot tone={record.tone} />{record.status}</span>
            <button className="icon-button small" type="button" aria-label={`打开 ${record.primary}`}><ExternalLink size={14} /></button>
          </article>
        ))}
      </div>
    </section>
  )
}

function DomainContent({ page }: { page: ProductPage }): JSX.Element {
  return (
    <div className="domain-grid">
      <FeatureMatrix page={page} />
      <section className="panel focus-panel">
        <div className="panel-header compact">
          <div>
            <p>CONTROL SURFACE</p>
            <h2>当前控制面</h2>
          </div>
          <button className="icon-button small" type="button" aria-label="更多"><MoreHorizontal size={15} /></button>
        </div>
        <div className="control-stack">
          <div className="control-visual">
            <div className="control-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="48" />
                <circle className="control-ring-value" cx="60" cy="60" r="48" pathLength="100" />
              </svg>
              <div><strong>{page.metrics[1]?.value}</strong><span>{page.metrics[1]?.label}</span></div>
            </div>
            <div className="control-summary">
              <p><Check size={14} />关键状态已同步</p>
              <p><Clock3 size={14} />最近更新 8 秒前</p>
              <p><Layers3 size={14} />{page.features.length} 个功能模块</p>
            </div>
          </div>
          <button className="button button-secondary full" type="button"><Play size={15} />执行当前操作</button>
        </div>
      </section>
      <RecordPanel page={page} />
      <section className="panel trace-panel">
        <div className="panel-header compact">
          <div><p>TRACE PREVIEW</p><h2>最近因果链</h2></div>
          <span className="health-pill"><ToneDot tone="mint" />完整</span>
        </div>
        <div className="trace-path">
          {[
            ["UI", "Command", "0 ms"],
            ["Local Core", "Policy", "12 ms"],
            ["Task Engine", "Durable Task", "38 ms"],
            ["Worker", "Activity", "1.84 s"]
          ].map(([name, kind, time], index) => (
            <div className="trace-node" key={name}>
              <span>{index + 1}</span>
              <div><strong>{name}</strong><small>{kind}</small></div>
              <time>{time}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ActivityRail({ page }: { page: ProductPage }): JSX.Element {
  return (
    <aside className="activity-rail">
      <div className="rail-header">
        <div><p>ACTIVITY TRACE</p><h2>现场轨道</h2></div>
        <button className="icon-button small" type="button" aria-label="轨道设置"><SlidersHorizontal size={14} /></button>
      </div>

      <div className="rail-context">
        <span>正在查看</span>
        <strong>{page.label}</strong>
        <p>{page.records[0]?.primary}</p>
      </div>

      <div className="activity-feed">
        {activityFeed.map((event) => (
          <article key={`${event.time}-${event.title}`}>
            <div className="activity-marker"><ToneDot tone={event.tone} /></div>
            <div className="activity-content">
              <time>{event.time}</time>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="rail-section">
        <div className="rail-section-title"><span>数据路径</span><strong>4 / 4</strong></div>
        {["SQLite", "Parquet / DuckDB", "LanceDB", "Object CAS"].map((service, index) => (
          <div className="service-row" key={service}>
            <ToneDot tone={index === 3 ? "cyan" : "mint"} />
            <span>{service}</span>
            <small>{index === 1 ? "12.8k/s" : index === 2 ? "82 ms" : "healthy"}</small>
          </div>
        ))}
      </div>

      <button className="rail-inspect" type="button">
        <Command size={15} />
        <span><strong>打开系统观测</strong><small>Trace、日志与指标</small></span>
        <ArrowUpRight size={14} />
      </button>
    </aside>
  )
}

function AccountSubjectActivityRail({ page }: { page: ProductPage }): JSX.Element {
  const projection = page.id === "platform-accounts" ? "platform_account" : "subject / monitor_policy"

  return (
    <aside className="activity-rail">
      <div className="rail-header">
        <div><p>LOCAL BUSINESS TRACE</p><h2>本地业务轨道</h2></div>
        <span className="health-pill"><ToneDot tone="mint" />已连接</span>
      </div>

      <div className="rail-context">
        <span>正在查看</span>
        <strong>{page.label}</strong>
        <p>账号与对象投影</p>
      </div>

      <div className="activity-feed">
        {[
          { time: "实时", title: "SQLite v2 投影已读取", detail: projection, tone: "mint" as Tone },
          { time: "本地", title: "窄化 IPC 契约已连接", detail: "5 个类型化业务方法", tone: "cyan" as Tone },
          { time: "原子", title: "Outbox 事件已启用", detail: "创建与绑定同事务提交", tone: "violet" as Tone }
        ].map((event) => (
          <article key={event.title}>
            <div className="activity-marker"><ToneDot tone={event.tone} /></div>
            <div className="activity-content">
              <time>{event.time}</time>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="rail-section">
        <div className="rail-section-title"><span>本地数据路径</span><strong>3 / 3</strong></div>
        {[
          ["SQLite v2", "healthy", "mint"],
          ["Typed IPC", "active", "cyan"],
          ["敏感凭据隔离", "ready", "violet"]
        ].map(([service, state, tone]) => (
          <div className="service-row" key={service}>
            <ToneDot tone={tone as Tone} />
            <span>{service}</span>
            <small>{state}</small>
          </div>
        ))}
      </div>

      <button className="rail-inspect" type="button">
        <Command size={15} />
        <span><strong>本地投影可追溯</strong><small>业务状态、事件与错误码</small></span>
        <Check size={14} />
      </button>
    </aside>
  )
}

export function DesktopWorkspace({
  initialPageId,
  runtime = { phase: "starting" },
  bridge
}: DesktopWorkspaceProps): JSX.Element {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1 } }
  }))
  const [activePageId, setActivePageId] = useState<PageId>(initialPageId)
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>("light")
  const page = findProductPage(activePageId) ?? findProductPage("bilibili-followers")
  const [activeTabs, setActiveTabs] = useState<Partial<Record<PageId, string>>>({})
  const [creationPageId, setCreationPageId] = useState<"platform-accounts" | "subjects" | "bilibili-subjects" | "bilibili-followers" | "bilibili-live" | undefined>()
  const businessBridge = bridge ?? (typeof window !== "undefined" ? window.bmd : undefined)

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("bmd-theme")
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme)

    const handleHashChange = (): void => setActivePageId(resolvePageId(window.location.hash))
    window.addEventListener("hashchange", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [])

  if (!page) return <div className="fatal-state">产品页面配置缺失。</div>

  const activeTab = activeTabs[page.id] ?? page.tabs[0] ?? "概览"
  const navigate = (pageId: PageId): void => {
    setActivePageId(pageId)
    setCreationPageId(undefined)
    if (typeof window !== "undefined") window.location.hash = pageId
  }
  const toggleTheme = (): void => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light"
      window.localStorage.setItem("bmd-theme", next)
      return next
    })
  }

  const businessPageId = page.id === "platform-accounts" || page.id === "subjects" ? page.id : undefined
  const followerPage = page.id === "bilibili-followers"
  const livePage = page.id === "bilibili-live"
  const subjectPage = page.id === "bilibili-subjects"
  const douyinPage = page.id === "douyin-auth"
  const originalBusinessPage = subjectPage || followerPage || livePage || douyinPage

  return (
    <QueryClientProvider client={queryClient}>
    <div className={`desktop-shell theme-${theme}`} data-theme={theme}>
      <Sidebar
        activePageId={page.id}
        collapsed={collapsed}
        onNavigate={navigate}
        onToggle={() => setCollapsed((value) => !value)}
        runtime={runtime}
      />
      <div className={`desktop-stage ${originalBusinessPage ? "is-business-only" : ""}`}>
        <TopBar onToggleTheme={toggleTheme} theme={theme} />
        {!originalBusinessPage && ((businessPageId && businessBridge) ? <BusinessSignalTape page={page} /> : <SignalTape />)}
        <div className={`workspace-layout ${originalBusinessPage ? "is-single-pane" : ""}`}>
          <main className="workspace-main">
            {!douyinPage && <WorkspaceHeader
              page={page}
              onPrimaryAction={businessPageId
                ? () => setCreationPageId(businessPageId)
                : subjectPage
                  ? () => setCreationPageId("bilibili-subjects")
                : followerPage
                  ? () => setCreationPageId("bilibili-followers")
                  : livePage
                    ? () => setCreationPageId("bilibili-live")
                  : undefined}
            />}
            {followerPage && businessBridge && <ConnectedBilibiliAuthPanel bridge={businessBridge} />}
            {!douyinPage && <TabRail
              page={page}
              activeTab={activeTab}
              onChange={(tab) => setActiveTabs((tabs) => ({ ...tabs, [page.id]: tab }))}
            />}
            {subjectPage && businessBridge ? (
              <ConnectedBilibiliSubjectWorkspace
                bridge={businessBridge}
                view={activeTab === "用户工作台" ? "用户工作台" : "监控对象"}
                creationOpen={creationPageId === "bilibili-subjects"}
                onCloseCreation={() => setCreationPageId(undefined)}
                onOpenWorkbench={() => setActiveTabs((tabs) => ({ ...tabs, [page.id]: "用户工作台" }))}
                onBackToList={() => setActiveTabs((tabs) => ({ ...tabs, [page.id]: "监控对象" }))}
              />
            ) : followerPage && businessBridge ? (
              <ConnectedBilibiliFollowerWorkspace
                bridge={businessBridge}
                view={activeTab === "趋势对比" ? "趋势对比" : "监控用户"}
                creationOpen={creationPageId === "bilibili-followers"}
                onCloseCreation={() => setCreationPageId(undefined)}
              />
            ) : livePage && businessBridge ? (
              <ConnectedBilibiliLiveWorkspace
                bridge={businessBridge}
                view={
                  activeTab === "趋势对比"
                    ? "趋势对比"
                    : activeTab === "状态事件"
                      ? "状态事件"
                      : activeTab === "观众榜单"
                        ? "观众榜单"
                        : activeTab === "实时弹幕"
                          ? "实时弹幕"
                          : activeTab === "直播场次"
                            ? "直播场次"
                            : activeTab === "数据中心"
                              ? "数据中心"
                              : activeTab === "场次分析"
                                ? "场次分析"
                          : "直播间"
                }
                creationOpen={creationPageId === "bilibili-live"}
                onCloseCreation={() => setCreationPageId(undefined)}
              />
            ) : douyinPage && businessBridge ? (
              <ConnectedDouyinAuthWorkspace bridge={businessBridge} />
            ) : businessPageId && businessBridge ? (
              <ConnectedAccountSubjectWorkspace
                bridge={businessBridge}
                pageId={businessPageId}
                creationOpen={creationPageId === businessPageId}
                onCloseCreation={() => setCreationPageId(undefined)}
              />
            ) : (
              <>
                <MetricStrip page={page} />
                {page.id === "command-center" ? <CommandCenterContent page={page} /> : <DomainContent page={page} />}
              </>
            )}
            {douyinPage && businessBridge ? (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地抖音登录态 · SQLite v11</span>
                <span>Web 会话与 OAuth 凭据独立加密保存</span>
                <span>DOUYIN AUTH / 1.0</span>
              </footer>
            ) : subjectPage && businessBridge ? (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地用户工作台 · SQLite v10</span>
                <span>UID 自动绑定、聚合查询与布局持久化</span>
                <span>SUBJECT / 1.0</span>
              </footer>
            ) : followerPage && businessBridge ? (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地粉丝监控 · SQLite v3</span>
                <span>真实 B站数据经 Python Worker 写入</span>
                <span>FOLLOWER / 0.3</span>
              </footer>
            ) : livePage && businessBridge ? (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地直播间、弹幕、场次与用户工作台 · SQLite v10</span>
                <span>REST、WebSocket、查询和导出均为真实本地闭环</span>
                <span>LIVE SESSION / 0.8</span>
              </footer>
            ) : businessPageId && businessBridge ? (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地控制面 · SQLite v2</span>
                <span>查询状态由 React Query 驱动</span>
                <span>SLICE 1 / 0.2</span>
              </footer>
            ) : (
              <footer className="workspace-footer">
                <span><ToneDot tone="mint" />本地数据平面已同步</span>
                <span>最后界面刷新 20:36:18</span>
                <span>UI DRAFT / 0.1</span>
              </footer>
            )}
          </main>
          {businessPageId && businessBridge
              ? <AccountSubjectActivityRail page={page} />
              : !originalBusinessPage && <ActivityRail page={page} />}
        </div>
      </div>
    </div>
    </QueryClientProvider>
  )
}
