export type PageId =
  | "command-center"
  | "platform-accounts"
  | "campaigns"
  | "live-radar"
  | "data-assets"
  | "agent-studio"
  | "agent-runs"
  | "knowledge"
  | "models"
  | "evaluations"
  | "connectors"
  | "identity"
  | "tools"
  | "workflows"
  | "extensions"
  | "approvals"
  | "observability"
  | "settings"
  | "bilibili-followers"
  | "bilibili-subjects"
  | "bilibili-auth"
  | "bilibili-live"
  | "live-data"
  | "live-analytics"
  | "subjects"
  | "douyin-auth"
  | "platform-collection"

export type IconName =
  | "activity"
  | "users"
  | "radar"
  | "radio"
  | "database"
  | "bot"
  | "history"
  | "book"
  | "cpu"
  | "flask"
  | "key"
  | "plug"
  | "network"
  | "wrench"
  | "workflow"
  | "blocks"
  | "shield"
  | "chart"
  | "settings"

export type Tone = "cyan" | "coral" | "amber" | "mint" | "violet" | "neutral"

export interface NavigationItem {
  pageId: PageId
  label: string
  icon: IconName
  badge?: string
}

export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

export interface PageMetric {
  label: string
  value: string
  detail: string
  tone: Tone
}

export interface FeatureSpec {
  title: string
  description: string
  state: string
  tone: Tone
  capabilityIds?: string[]
}

export interface RecordSpec {
  primary: string
  secondary: string
  meta: string
  status: string
  tone: Tone
}

export interface ProductPage {
  id: PageId
  label: string
  eyebrow: string
  title: string
  description: string
  primaryAction: string
  secondaryAction?: string
  tabs: string[]
  metrics: PageMetric[]
  features: FeatureSpec[]
  records: RecordSpec[]
}

export interface BusinessCapability {
  id: string
  label: string
  source: "BiliMonitor" | "Desktop Platform"
  pageId: PageId
  implementation: string
}

/**
 * Only workspaces with an end-to-end local implementation belong in navigation.
 * Original BiliMonitor modules are added after contract, Core, storage, Worker and UI parity tests pass.
 */
export const navigationGroups: NavigationGroup[] = [
  {
    label: "BiliMonitor 原业务",
    items: [
      { pageId: "bilibili-subjects", label: "用户监控", icon: "users" },
      { pageId: "bilibili-followers", label: "粉丝监控", icon: "users" },
      { pageId: "bilibili-live", label: "直播间监控", icon: "radio", badge: "REST" },
      { pageId: "live-data", label: "数据中心", icon: "database" },
      { pageId: "live-analytics", label: "分析看板", icon: "chart" },
      { pageId: "douyin-auth", label: "抖音登录态", icon: "key" },
      { pageId: "platform-collection", label: "平台采集", icon: "plug" }
    ]
  }
]

export const productPages: ProductPage[] = [
  {
    id: "platform-collection", label: "平台采集", eyebrow: "PLATFORM / LOCAL COLLECTION",
    title: "平台管理与单次采集", description: "已注册 Adapter、已实现与预留能力，执行原 run-once 账号资料采集。",
    primaryAction: "刷新 Adapter", tabs: [], metrics: [], features: [], records: []
  },
  {
    id: "bilibili-subjects",
    label: "B站用户监控",
    eyebrow: "BILIBILI USER WORKBENCH",
    title: "B站用户监控",
    description: "输入 B站 UID 自动创建或复用粉丝监控并尝试绑定直播间，聚合粉丝、直播热度、弹幕与健康事件。",
    primaryAction: "创建用户工作台",
    tabs: ["监控对象", "用户工作台"],
    metrics: [],
    features: [],
    records: []
  },
  {
    id: "bilibili-followers",
    label: "B站粉丝监控",
    eyebrow: "BILIBILI FOLLOWER MONITOR",
    title: "B站用户粉丝监控",
    description: "采集用户资料、粉丝与关注数，支持暂停、恢复、立即刷新、采集间隔和历史趋势。",
    primaryAction: "添加监控用户",
    tabs: ["监控用户", "趋势对比"],
    metrics: [],
    features: [],
    records: []
  },
  {
    id: "bilibili-live",
    label: "B站直播间监控",
    eyebrow: "BILIBILI LIVE ROOM MONITOR",
    title: "B站直播间监控",
    description: "按房间号或主播 UID 解析直播间，采集直播状态、热度、关注、标题与分区，保存快照和状态事件。",
    primaryAction: "添加直播间",
    tabs: [
      "直播间", "趋势对比", "状态事件", "实时弹幕", "观众榜单",
      "直播场次", "数据中心", "场次分析"
    ],
    metrics: [],
    features: [],
    records: []
  },
  {
    id: "live-data",
    label: "数据中心",
    eyebrow: "BILIBILI / LOCAL DATA CENTER",
    title: "数据中心",
    description: "查询本地直播场次的事件、用户与采集质量，按条件筛选并导出真实记录。",
    primaryAction: "添加直播间",
    tabs: [],
    metrics: [],
    features: [],
    records: []
  },
  {
    id: "live-analytics",
    label: "分析看板",
    eyebrow: "BILIBILI / LOCAL ANALYTICS",
    title: "分析看板",
    description: "基于已保存的直播场次，查看互动趋势、付费转化、用户结构与采集覆盖情况。",
    primaryAction: "添加直播间",
    tabs: [],
    metrics: [],
    features: [],
    records: []
  },
  {
    id: "douyin-auth",
    label: "我的抖音登录态",
    eyebrow: "DOUYIN / AUTH STATE",
    title: "我的抖音登录态",
    description: "按原 BiliMonitor 业务完成 Web 扫码登录并保存浏览器会话，同时支持官方 OAuth；两种登录态互不覆盖。",
    primaryAction: "开始 Web 扫码",
    tabs: [],
    metrics: [],
    features: [],
    records: []
  }
]

export const businessCapabilities: BusinessCapability[] = [
  {
    id: "subject-workbench",
    label: "B站指定用户工作台",
    source: "BiliMonitor",
    pageId: "bilibili-subjects",
    implementation: "UID 自动绑定 + Local Core 聚合 + SQLite v10"
  },
  {
    id: "follower-monitor",
    label: "B站粉丝监控",
    source: "BiliMonitor",
    pageId: "bilibili-followers",
    implementation: "Python httpx Worker + Local Core scheduler + SQLite v3"
  },
  {
    id: "live-room-monitor",
    label: "B站直播间 REST 监控",
    source: "BiliMonitor",
    pageId: "bilibili-live",
    implementation: "Python httpx Worker + Node WebSocket Worker + Local Core 场次/主体状态 + SQLite v10"
  },
  {
    id: "douyin-self-auth",
    label: "抖音 Web 与 OAuth 登录态",
    source: "BiliMonitor",
    pageId: "douyin-auth",
    implementation: "Playwright Browser Worker + Python OAuth Worker + Local Core + SQLite v11"
  }
]

export function findProductPage(pageId: PageId): ProductPage | undefined {
  return productPages.find((page) => page.id === pageId)
}
