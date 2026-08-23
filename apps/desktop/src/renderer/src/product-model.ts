export type PageId =
  | "command-center"
  | "subjects"
  | "campaigns"
  | "live-radar"
  | "data-assets"
  | "agent-studio"
  | "agent-runs"
  | "knowledge"
  | "models"
  | "evaluations"
  | "platform-accounts"
  | "connectors"
  | "identity"
  | "tools"
  | "workflows"
  | "extensions"
  | "approvals"
  | "observability"
  | "settings"

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

export const navigationGroups: NavigationGroup[] = [
  {
    label: "全局",
    items: [{ pageId: "command-center", label: "信号总览", icon: "activity" }]
  },
  {
    label: "采集",
    items: [
      { pageId: "subjects", label: "监控对象", icon: "users" },
      { pageId: "campaigns", label: "采集活动", icon: "radar", badge: "4" },
      { pageId: "live-radar", label: "直播雷达", icon: "radio", badge: "LIVE" },
      { pageId: "data-assets", label: "数据资产", icon: "database" }
    ]
  },
  {
    label: "智能",
    items: [
      { pageId: "agent-studio", label: "Agent 工作台", icon: "bot" },
      { pageId: "agent-runs", label: "运行记录", icon: "history", badge: "2" },
      { pageId: "knowledge", label: "知识库", icon: "book" },
      { pageId: "models", label: "模型路由", icon: "cpu" },
      { pageId: "evaluations", label: "评估中心", icon: "flask" }
    ]
  },
  {
    label: "平台",
    items: [
      { pageId: "platform-accounts", label: "平台与账号", icon: "key" },
      { pageId: "connectors", label: "连接器", icon: "plug" },
      { pageId: "identity", label: "身份图谱", icon: "network" },
      { pageId: "tools", label: "工具与 MCP", icon: "wrench" },
      { pageId: "workflows", label: "工作流与 Worker", icon: "workflow" },
      { pageId: "extensions", label: "扩展中心", icon: "blocks" }
    ]
  },
  {
    label: "治理",
    items: [
      { pageId: "approvals", label: "审批与审计", icon: "shield", badge: "2" },
      { pageId: "observability", label: "系统观测", icon: "chart" },
      { pageId: "settings", label: "系统设置", icon: "settings" }
    ]
  }
]

export const productPages: ProductPage[] = [
  {
    id: "command-center",
    label: "信号总览",
    eyebrow: "LOCAL SIGNAL DESK / 工作空间 01",
    title: "所有采集、直播与 Agent，都在本机有迹可循。",
    description: "统一查看任务健康、数据新鲜度、实时信号、模型运行与待审批动作。",
    primaryAction: "新建采集活动",
    secondaryAction: "打开命令面板",
    tabs: ["运行态势", "数据新鲜度", "风险与审批"],
    metrics: [
      { label: "入站事件", value: "12,804/min", detail: "较 1 小时均值 +8.2%", tone: "cyan" },
      { label: "活跃工作流", value: "24", detail: "4 个正在抓取", tone: "mint" },
      { label: "直播连接", value: "6 / 6", detail: "最近心跳 3 秒前", tone: "coral" },
      { label: "待批准动作", value: "2", detail: "最高风险：数据导出", tone: "amber" }
    ],
    features: [
      { title: "采集脉冲", description: "HTTP、浏览器与实时 Worker 的统一吞吐与失败率。", state: "运行中", tone: "cyan" },
      { title: "直播信号带", description: "开播、弹幕、礼物、上舰与榜单变化的连续事件流。", state: "6 路在线", tone: "coral" },
      { title: "Agent 运行栈", description: "模型、工具、审批与产物按因果链回放。", state: "2 个运行中", tone: "violet" },
      { title: "本地数据健康", description: "SQLite、Parquet、LanceDB 与对象证据完整性。", state: "99.97%", tone: "mint" }
    ],
    records: [
      { primary: "原神", secondary: "Bilibili UID 401742377", meta: "粉丝 +1,284 · 直播热度 62,830", status: "直播中", tone: "coral" },
      { primary: "央视频", secondary: "Bilibili UID 456664753", meta: "粉丝 +4,003 · 24h 采集 288 次", status: "正常", tone: "mint" },
      { primary: "直播复盘 Agent", secondary: "run_01J9N4A8", meta: "正在汇总 18,492 条弹幕", status: "工具调用", tone: "violet" }
    ]
  },
  {
    id: "subjects",
    label: "监控对象",
    eyebrow: "SUBJECT WORKBENCH",
    title: "用一个对象，串起账号、直播、内容与事件。",
    description: "继承 BiliMonitor 指定用户工作台，支持跨平台账号绑定、粉丝趋势、直播指标和自定义组件布局。",
    primaryAction: "添加监控对象",
    secondaryAction: "管理布局",
    tabs: ["对象列表", "指标矩阵", "健康事件", "布局模板"],
    metrics: [
      { label: "监控对象", value: "18", detail: "16 个健康", tone: "cyan" },
      { label: "已绑定账号", value: "31", detail: "B站 22 · 抖音 9", tone: "violet" },
      { label: "24h 粉丝净增", value: "+18,492", detail: "跨平台归一化", tone: "mint" },
      { label: "异常对象", value: "2", detail: "1 个登录态失效", tone: "amber" }
    ],
    features: [
      { title: "对象档案", description: "名称、备注、标签、头像和跨平台归属。", state: "完整", tone: "cyan", capabilityIds: ["subject-workbench"] },
      { title: "账号与直播绑定", description: "绑定 B站 UID、直播间和后续平台账号。", state: "31 个绑定", tone: "violet", capabilityIds: ["follower-monitor", "live-room-monitor"] },
      { title: "指标与趋势", description: "粉丝、关注、直播热度和弹幕速率按时间对齐。", state: "实时", tone: "mint" },
      { title: "组件化工作台", description: "弹幕、健康事件、排行和 AI 摘要自由排布。", state: "可编辑", tone: "neutral" }
    ],
    records: [
      { primary: "原神", secondary: "4 个数据模块 · 2 个平台账号", meta: "821,940 粉丝 · 62,830 热度", status: "直播中", tone: "coral" },
      { primary: "央视新闻", secondary: "2 个数据模块 · Bilibili", meta: "23,948,121 粉丝 · 24h +4,003", status: "健康 98", tone: "mint" },
      { primary: "测试对象 A", secondary: "抖音 Web 登录态", meta: "最近成功采集 18 分钟前", status: "需检查", tone: "amber" }
    ]
  },
  {
    id: "campaigns",
    label: "采集活动",
    eyebrow: "CRAWL CAMPAIGNS / DURABLE TASKS",
    title: "把一次采集，设计成可以暂停、恢复和重放的活动。",
    description: "统一编排 HTTP、浏览器、实时与媒体采集，展示 Frontier、Checkpoint、限频和失败恢复。",
    primaryAction: "创建采集活动",
    secondaryAction: "导入种子",
    tabs: ["活动", "Frontier", "调度策略", "失败队列"],
    metrics: [
      { label: "运行中", value: "4", detail: "本地任务可恢复", tone: "cyan" },
      { label: "待抓取", value: "38,291", detail: "高优先级 284", tone: "violet" },
      { label: "成功率", value: "98.6%", detail: "过去 24 小时", tone: "mint" },
      { label: "风控暂停", value: "3", detail: "等待人工复核", tone: "amber" }
    ],
    features: [
      { title: "种子与 Frontier", description: "URL 规范化、去重、优先级、深度和站点预算。", state: "38k 排队", tone: "cyan" },
      { title: "多引擎路由", description: "Scrapy、Crawlee、Playwright 与实时 Worker 自动分流。", state: "4 个引擎", tone: "violet" },
      { title: "断点与重试", description: "Checkpoint、退避、取消、租约回收和幂等重放。", state: "已保护", tone: "mint", capabilityIds: ["collect-task"] },
      { title: "风险处理", description: "验证码、限频与协议变化进入人工检查，不做绕过。", state: "3 项待查", tone: "amber" }
    ],
    records: [
      { primary: "B站关注者日更", secondary: "HTTP · 18 个对象 · 每 5 分钟", meta: "8,640 / 8,822 · checkpoint 284", status: "运行中", tone: "cyan" },
      { primary: "直播间完整留档", secondary: "Playwright + Realtime · 6 个房间", meta: "WARC 42.8 GB · 0 个缺口", status: "采集中", tone: "coral" },
      { primary: "历史主页回溯", secondary: "Browser · 深度 4", meta: "被平台限频，45 分钟后重试", status: "已退避", tone: "amber" }
    ]
  },
  {
    id: "live-radar",
    label: "直播雷达",
    eyebrow: "BILIBILI LIVE / REALTIME",
    title: "从开播信号到场次复盘，保持同一条时间线。",
    description: "覆盖直播间状态、弹幕长连接、互动指标、观众/大航海榜、场次洞察与 CSV/XLSX 导出。",
    primaryAction: "添加直播间",
    secondaryAction: "导出当前场次",
    tabs: ["实时房间", "弹幕流", "榜单", "直播场次", "洞察与导出"],
    metrics: [
      { label: "直播中", value: "6", detail: "总在线 128,490", tone: "coral" },
      { label: "弹幕速率", value: "412/min", detail: "5 分钟 +18%", tone: "cyan" },
      { label: "本场付费互动", value: "¥ 8,421", detail: "礼物与醒目留言", tone: "mint" },
      { label: "连接异常", value: "0", detail: "心跳全部正常", tone: "mint" }
    ],
    features: [
      { title: "直播间监控", description: "开播、轮播、离线、标题、分区和热度趋势。", state: "6 路在线", tone: "coral", capabilityIds: ["live-room-monitor"] },
      { title: "实时弹幕", description: "消息、点赞、看过、心跳人气与身份补全。", state: "412/min", tone: "cyan", capabilityIds: ["live-danmaku"] },
      { title: "观众与大航海榜", description: "榜单分页、快照、守护等级和勋章。", state: "刚刚刷新", tone: "violet", capabilityIds: ["live-rank"] },
      { title: "场次洞察与导出", description: "用户、弹幕、礼物、SC、上舰明细与覆盖率。", state: "18 场可查", tone: "mint", capabilityIds: ["live-session-insight", "live-session-export"] }
    ],
    records: [
      { primary: "原神官方直播间", secondary: "room 21987615 · 游戏", meta: "62,830 在线 · 188 条/分钟", status: "直播中 01:48:22", tone: "coral" },
      { primary: "赛事解说 A", secondary: "room 92613 · 电竞", meta: "41,284 在线 · 大航海 326", status: "直播中 03:12:04", tone: "coral" },
      { primary: "场次 #LS-00482", secondary: "已结束 · 覆盖率 99.4%", meta: "18,492 弹幕 · 1,284 用户 · ¥8,421", status: "可导出", tone: "mint" }
    ]
  },
  {
    id: "data-assets",
    label: "数据资产",
    eyebrow: "EVIDENCE & DATA EXPLORER",
    title: "每个结论都能回到原始证据。",
    description: "浏览规范化实体、事件、WARC/HAR、截图、解析版本、数据血缘、保留策略与导出。",
    primaryAction: "新建数据查询",
    secondaryAction: "导出数据集",
    tabs: ["实体", "事件", "原始证据", "数据集", "导出任务"],
    metrics: [
      { label: "原始对象", value: "1.82 M", detail: "3.42 TB 本地存储", tone: "cyan" },
      { label: "规范化事件", value: "48.6 M", detail: "Parquet", tone: "violet" },
      { label: "证据完整率", value: "100%", detail: "Hash 已校验", tone: "mint" },
      { label: "待重放解析", value: "284", detail: "parser v4 可升级", tone: "amber" }
    ],
    features: [
      { title: "实体与事件浏览", description: "跨平台账号、内容、指标、直播与 Agent 事件统一查询。", state: "48.6M 记录", tone: "violet" },
      { title: "原始证据", description: "WARC、HAR、截图、Trace 与响应体按内容 Hash 寻址。", state: "完整", tone: "cyan", capabilityIds: ["raw-payload"] },
      { title: "数据血缘", description: "来源请求、Connector、Parser 和规范化字段可追溯。", state: "可回放", tone: "mint" },
      { title: "查询与导出", description: "CSV、JSONL、Parquet、XLSX 和报告任务。", state: "7 个模板", tone: "neutral", capabilityIds: ["analytics"] }
    ],
    records: [
      { primary: "bilibili.live.danmaku", secondary: "事件表 · 28.4M 行", meta: "最新 2 秒前 · 6 个分区", status: "新鲜", tone: "mint" },
      { primary: "warc/2026/08/22", secondary: "原始对象 · 482 GB", meta: "BLAKE3 校验完成 · 保留 365 天", status: "已验证", tone: "cyan" },
      { primary: "parser:bilibili-profile@4", secondary: "284 个对象可重放", meta: "新增认证等级字段", status: "等待执行", tone: "amber" }
    ]
  },
  {
    id: "agent-studio",
    label: "Agent 工作台",
    eyebrow: "AGENT STUDIO / VERSIONED SPEC",
    title: "把分析方法做成可版本化、可审批的 Agent。",
    description: "设计指令、模型策略、工具集、结构化输出和评估集，并在发布前进行沙箱试跑。",
    primaryAction: "创建 Agent",
    secondaryAction: "在沙箱中试跑",
    tabs: ["Agent", "提示词", "工具", "输出结构", "发布版本"],
    metrics: [
      { label: "已发布 Agent", value: "8", detail: "3 个生产版本", tone: "violet" },
      { label: "工具覆盖", value: "26", detail: "21 个只读", tone: "cyan" },
      { label: "评估通过率", value: "94.8%", detail: "最近版本", tone: "mint" },
      { label: "待发布草稿", value: "3", detail: "1 个需要审批", tone: "amber" }
    ],
    features: [
      { title: "版本化定义", description: "指令、依赖、模型路由、Toolset ID 与输出 Schema。", state: "v12 草稿", tone: "violet" },
      { title: "工具与权限", description: "MCP 工具、资源范围、网络范围与最大影响级别。", state: "9 个工具", tone: "cyan" },
      { title: "沙箱调试", description: "输入测试、流式步骤、Token 和工具参数实时检查。", state: "可运行", tone: "mint" },
      { title: "发布门槛", description: "数据集回归、人工评审、兼容性与回滚策略。", state: "2 项未通过", tone: "amber", capabilityIds: ["ai-analysis"] }
    ],
    records: [
      { primary: "直播复盘 Agent", secondary: "v12 · PydanticAI + Step Store", meta: "7 个工具 · LiveSessionReport schema", status: "草稿", tone: "violet" },
      { primary: "粉丝异常解释 Agent", secondary: "v6 · 已发布", meta: "评估 96.2% · 平均 18.4 秒", status: "生产", tone: "mint" },
      { primary: "跨平台身份研究 Agent", secondary: "v2 · LangGraph", meta: "需要 identity.write 审批", status: "受限", tone: "amber" }
    ]
  },
  {
    id: "agent-runs",
    label: "运行记录",
    eyebrow: "DURABLE AGENT RUNS",
    title: "按步骤回放一次 Agent 决策。",
    description: "查看消息、模型调用、工具参数、审批、成本、错误、检查点、产物和因果 Trace。",
    primaryAction: "启动 Agent Run",
    secondaryAction: "比较两次运行",
    tabs: ["运行中", "历史运行", "步骤回放", "产物"],
    metrics: [
      { label: "运行中", value: "2", detail: "1 个等待工具", tone: "violet" },
      { label: "24h 完成", value: "186", detail: "成功率 97.3%", tone: "mint" },
      { label: "模型 Token", value: "4.8 M", detail: "本地模型 63%", tone: "cyan" },
      { label: "等待审批", value: "1", detail: "导出场次报告", tone: "amber" }
    ],
    features: [
      { title: "持久化执行", description: "本地 Task、Step Store、重试和断点恢复。", state: "可恢复", tone: "mint" },
      { title: "步骤与消息", description: "Prompt、模型响应、Tool Call 与结构化输出。", state: "完整记录", tone: "violet" },
      { title: "流式事件", description: "MessagePort 推送 Token、状态、工具和审批事件。", state: "实时", tone: "cyan" },
      { title: "产物与成本", description: "报告、图表、代码、ObjectRef、用量和路由原因。", state: "可追溯", tone: "neutral" }
    ],
    records: [
      { primary: "直播复盘 · 场次 LS-00482", secondary: "run_01J9N4A8 · step 8/11", meta: "正在调用 data.query · 18,492 条弹幕", status: "运行中", tone: "violet" },
      { primary: "粉丝异常解释 · 原神", secondary: "run_01J9N21K · 已完成", meta: "32.8k tokens · 3 个证据引用", status: "通过", tone: "mint" },
      { primary: "导出跨平台报告", secondary: "run_01J9MZZ4 · signal pending", meta: "将写入 D:\\Exports\\weekly", status: "等待批准", tone: "amber" }
    ]
  },
  {
    id: "knowledge",
    label: "知识库",
    eyebrow: "HYBRID RETRIEVAL",
    title: "让 Agent 只使用可引用、可重建的知识。",
    description: "管理数据源、切片、Embedding、Sparse Index、混合召回、重排和证据包。",
    primaryAction: "添加知识源",
    secondaryAction: "测试检索",
    tabs: ["知识源", "集合", "检索调试", "索引任务"],
    metrics: [
      { label: "知识片段", value: "2.84 M", detail: "12 个集合", tone: "violet" },
      { label: "索引覆盖", value: "99.2%", detail: "22,431 待更新", tone: "mint" },
      { label: "检索 P95", value: "82 ms", detail: "Dense + Sparse", tone: "cyan" },
      { label: "过期来源", value: "2", detail: "需要重新采集", tone: "amber" }
    ],
    features: [
      { title: "知识源", description: "数据集、对象证据、文档、字幕和 Agent 产物。", state: "18 个来源", tone: "cyan" },
      { title: "混合检索", description: "元数据过滤、Dense、Sparse、RRF 与多向量。", state: "启用", tone: "violet" },
      { title: "重排与引用", description: "基于评估集启用 Reranker，生成带 ObjectRef 的证据包。", state: "94.6% 命中", tone: "mint" },
      { title: "索引生命周期", description: "增量更新、删除传播、版本切换和全量重建。", state: "可重建", tone: "neutral" }
    ],
    records: [
      { primary: "B站直播场次知识", secondary: "1.24M chunks · hybrid-v3", meta: "最新索引 34 秒前", status: "在线", tone: "mint" },
      { primary: "平台接口研究文档", secondary: "8,214 chunks · text-embedding-3", meta: "来源 42 个 Markdown/PDF", status: "在线", tone: "cyan" },
      { primary: "旧版解析结果", secondary: "collection legacy-parser-v2", meta: "22,431 条等待重嵌入", status: "更新中", tone: "amber" }
    ]
  },
  {
    id: "models",
    label: "模型路由",
    eyebrow: "MODEL GATEWAY",
    title: "统一模型入口，同时保留厂商原生能力。",
    description: "配置远程 Provider、本地推理、能力目录、数据分级、路由规则、限额和降级链。",
    primaryAction: "添加模型",
    secondaryAction: "测试路由",
    tabs: ["模型目录", "路由策略", "Provider", "用量与限额"],
    metrics: [
      { label: "可用模型", value: "14", detail: "本地 6 · 远程 8", tone: "violet" },
      { label: "本地命中", value: "63%", detail: "过去 24 小时", tone: "mint" },
      { label: "网关 P95", value: "38 ms", detail: "不含模型推理", tone: "cyan" },
      { label: "降级调用", value: "12", detail: "Provider 超时", tone: "amber" }
    ],
    features: [
      { title: "能力目录", description: "上下文、模态、工具、结构化输出和厂商原生特性。", state: "14 个模型", tone: "violet" },
      { title: "策略路由", description: "按数据分级、任务、质量、延迟与预算选路。", state: "8 条规则", tone: "cyan" },
      { title: "本地推理", description: "vLLM、SGLang 和 llama.cpp 的模型实例与 GPU 资源。", state: "3 个实例", tone: "mint" },
      { title: "出站治理", description: "字段分类、脱敏、域名白名单和出站记录。", state: "全部审计", tone: "neutral" }
    ],
    records: [
      { primary: "analysis-primary", secondary: "本地 vLLM · Qwen3-32B", meta: "tool + json schema · GPU 74%", status: "健康", tone: "mint" },
      { primary: "vision-fallback", secondary: "Remote native adapter", meta: "视觉 · 128k context · egress L2", status: "可用", tone: "cyan" },
      { primary: "long-context", secondary: "Native route · 3 providers", meta: "最近 12 次触发降级", status: "需观察", tone: "amber" }
    ]
  },
  {
    id: "evaluations",
    label: "评估中心",
    eyebrow: "DATASETS & EXPERIMENTS",
    title: "用固定证据集衡量 Agent，而不是凭感觉发布。",
    description: "维护黄金数据集、运行实验、比较模型/提示词/工具路径并追踪回归。",
    primaryAction: "运行评估",
    secondaryAction: "创建数据集",
    tabs: ["数据集", "实验", "评估器", "回归趋势"],
    metrics: [
      { label: "黄金样本", value: "1,482", detail: "18 个数据集", tone: "cyan" },
      { label: "总体通过率", value: "94.8%", detail: "当前生产版本", tone: "mint" },
      { label: "实验运行", value: "42", detail: "本周 +8", tone: "violet" },
      { label: "阻断回归", value: "2", detail: "引用完整性下降", tone: "amber" }
    ],
    features: [
      { title: "黄金数据集", description: "WARC 回放、预期工具路径、结构化结果和人工标签。", state: "18 个", tone: "cyan" },
      { title: "实验比较", description: "模型、Prompt、Agent 版本和 Reranker A/B。", state: "可复现", tone: "violet" },
      { title: "多类评估器", description: "确定性、Schema、引用、工具路径与 LLM Judge。", state: "26 个", tone: "mint" },
      { title: "发布门禁", description: "阈值、回归阻断、人工签署和生产版本关联。", state: "2 项阻断", tone: "amber" }
    ],
    records: [
      { primary: "直播复盘 v12 vs v11", secondary: "experiment exp_2841", meta: "准确率 +2.8% · 成本 -14%", status: "通过", tone: "mint" },
      { primary: "工具引用完整性", secondary: "dataset citation-golden-3", meta: "92.1% · 门槛 95%", status: "阻断", tone: "amber" },
      { primary: "B站 WARC 解析回放", secondary: "dataset crawler-replay-8", meta: "1,204 / 1,204", status: "通过", tone: "cyan" }
    ]
  },
  {
    id: "platform-accounts",
    label: "平台与账号",
    eyebrow: "SESSION VAULT",
    title: "登录态属于账号保险库，不属于某个爬虫。",
    description: "管理 B站扫码、抖音 OAuth/Web 扫码、凭据校验、刷新、导出、撤销和浏览器会话。",
    primaryAction: "添加平台账号",
    secondaryAction: "校验全部登录态",
    tabs: ["账号", "登录会话", "凭据", "浏览器 Profile"],
    metrics: [
      { label: "平台账号", value: "5", detail: "B站 3 · 抖音 2", tone: "cyan" },
      { label: "有效凭据", value: "4", detail: "刚刚校验", tone: "mint" },
      { label: "浏览器 Profile", value: "3", detail: "隔离 Context", tone: "violet" },
      { label: "需要续期", value: "1", detail: "抖音 Web", tone: "amber" }
    ],
    features: [
      { title: "B站扫码登录", description: "二维码、轮询、账号信息、Cookie 校验、刷新和撤销。", state: "3 个账号", tone: "cyan", capabilityIds: ["bilibili-qr-auth"] },
      { title: "抖音官方 OAuth", description: "授权启动、回调、刷新、校验、查看与撤销。", state: "已连接", tone: "violet", capabilityIds: ["douyin-oauth-auth"] },
      { title: "抖音 Web 扫码", description: "Playwright 独立 Worker、异步二维码和登录态消费。", state: "需续期", tone: "amber", capabilityIds: ["douyin-web-auth"] },
      { title: "Session Vault", description: "短期租约、密钥版本、Profile 加密和使用审计。", state: "受保护", tone: "mint" }
    ],
    records: [
      { primary: "Bilibili · 采集账号 A", secondary: "扫码登录 · credential key_03", meta: "最近校验 2 分钟前 · 18 个任务引用", status: "有效", tone: "mint" },
      { primary: "Douyin · 研究账号", secondary: "OAuth2 · refresh enabled", meta: "最近刷新 1 天前 · 2 个任务引用", status: "有效", tone: "mint" },
      { primary: "Douyin · Web 会话", secondary: "Playwright profile dy-web-01", meta: "扫码登录态将在 6 小时后检查", status: "需续期", tone: "amber" }
    ]
  },
  {
    id: "connectors",
    label: "连接器",
    eyebrow: "PLATFORM CONNECTORS",
    title: "平台差异收敛为版本化能力。",
    description: "查看 Connector 能力、请求 Schema、解析器、限速建议、录制夹具、风险状态和兼容版本。",
    primaryAction: "创建连接器",
    secondaryAction: "运行契约测试",
    tabs: ["已安装", "能力矩阵", "解析器", "测试夹具"],
    metrics: [
      { label: "连接器", value: "6", detail: "内置 4 · 本地 2", tone: "cyan" },
      { label: "能力", value: "28", detail: "24 个可用", tone: "violet" },
      { label: "契约测试", value: "284", detail: "全部通过", tone: "mint" },
      { label: "降级能力", value: "2", detail: "平台协议变化", tone: "amber" }
    ],
    features: [
      { title: "能力清单", description: "账号、内容、直播、弹幕、榜单与认证能力独立声明。", state: "28 项", tone: "cyan" },
      { title: "解析版本", description: "Schema、Parser、原始夹具和重放兼容性。", state: "可升级", tone: "violet" },
      { title: "限频与风险", description: "平台级并发、令牌桶、退避和风险等级建议。", state: "统一治理", tone: "mint" },
      { title: "契约测试", description: "录制响应、边界状态、错误分类和幂等验证。", state: "284 通过", tone: "neutral" }
    ],
    records: [
      { primary: "bilibili.account", secondary: "v4.2.0 · HTTP/Scrapy", meta: "profile · follower · auth.web_qr", status: "健康", tone: "mint" },
      { primary: "bilibili.live", secondary: "v6.1.0 · HTTP + Realtime", meta: "status · danmaku · rank · session", status: "健康", tone: "mint" },
      { primary: "douyin.web-session", secondary: "v1.3.0 · Playwright", meta: "auth.web_qr · session.validate", status: "降级", tone: "amber" }
    ]
  },
  {
    id: "identity",
    label: "身份图谱",
    eyebrow: "IDENTITY RESOLUTION",
    title: "把跨平台线索和人工判断分开保存。",
    description: "管理身份节点、候选关联、证据、置信度、冲突和人工确认，不覆盖平台原始身份。",
    primaryAction: "创建身份",
    secondaryAction: "运行候选匹配",
    tabs: ["身份", "候选关联", "证据", "冲突"],
    metrics: [
      { label: "身份节点", value: "1,842", detail: "2,984 个平台账号", tone: "cyan" },
      { label: "已确认关联", value: "1,116", detail: "人工确认 284", tone: "mint" },
      { label: "候选关联", value: "93", detail: "平均置信度 0.78", tone: "violet" },
      { label: "冲突", value: "4", detail: "等待人工处理", tone: "amber" }
    ],
    features: [
      { title: "身份节点", description: "逻辑主体与平台账号保持独立，可合并也可拆分。", state: "1,842", tone: "cyan", capabilityIds: ["identity-link"] },
      { title: "候选匹配", description: "昵称、头像、简介、外链和行为特征生成候选。", state: "93 个", tone: "violet" },
      { title: "证据链", description: "每条关联保存来源、算法版本、时间和 ObjectRef。", state: "可追溯", tone: "mint" },
      { title: "人工决策", description: "确认、拒绝、撤销、冲突处理和审计历史。", state: "4 个待查", tone: "amber" }
    ],
    records: [
      { primary: "主体 #ID-1842", secondary: "Bilibili + Douyin", meta: "3 条证据 · 人工确认", status: "已确认", tone: "mint" },
      { primary: "候选 #C-0093", secondary: "昵称相似度 0.94 · 头像 0.82", meta: "Agent 建议关联，等待人工判断", status: "待确认", tone: "violet" },
      { primary: "冲突 #X-0004", secondary: "同一抖音账号连接到两个主体", meta: "保留原始关系，未自动覆盖", status: "需处理", tone: "amber" }
    ]
  },
  {
    id: "tools",
    label: "工具与 MCP",
    eyebrow: "TOOL BROKER",
    title: "Agent 只能调用被描述、被授权、被审计的工具。",
    description: "管理本地工具、MCP Server、输入输出 Schema、能力令牌、网络/文件范围和沙箱策略。",
    primaryAction: "连接 MCP Server",
    secondaryAction: "创建本地工具",
    tabs: ["工具目录", "MCP Server", "权限策略", "调用记录"],
    metrics: [
      { label: "可用工具", value: "26", detail: "MCP 14 · 内置 12", tone: "cyan" },
      { label: "只读工具", value: "21", detail: "默认自动允许", tone: "mint" },
      { label: "沙箱工具", value: "5", detail: "WASI / Job Object", tone: "violet" },
      { label: "策略拒绝", value: "8", detail: "过去 24 小时", tone: "amber" }
    ],
    features: [
      { title: "工具目录", description: "稳定名称、Schema、版本、超时和幂等语义。", state: "26 个", tone: "cyan" },
      { title: "MCP 管理", description: "Server 生命周期、Transport、工具发现和健康检查。", state: "6 个在线", tone: "violet" },
      { title: "能力令牌", description: "Workspace、资源、网络、文件、凭据和影响级别。", state: "最小授权", tone: "mint" },
      { title: "沙箱与审计", description: "第三方代码隔离，记录参数摘要、结果和 ObjectRef。", state: "全部记录", tone: "neutral" }
    ],
    records: [
      { primary: "data.query", secondary: "内置 · read-only · v2", meta: "SQLite/DuckDB 查询模板", status: "自动允许", tone: "mint" },
      { primary: "browser.inspect", secondary: "MCP · isolated profile", meta: "域名白名单 bilibili.com", status: "受限", tone: "violet" },
      { primary: "artifact.export", secondary: "本地工具 · filesystem.write", meta: "每次调用需要路径审批", status: "需审批", tone: "amber" }
    ]
  },
  {
    id: "workflows",
    label: "工作流与 Worker",
    eyebrow: "LOCAL TASKS & WORKER FLEET",
    title: "把长任务、实时连接和高吞吐 Worker 分开观察。",
    description: "查看本地持久任务、调度队列、Worker 版本、数据积压与恢复状态。",
    primaryAction: "启动系统工作流",
    secondaryAction: "管理 Worker",
    tabs: ["工作流", "Task Queue", "Worker", "事件积压"],
    metrics: [
      { label: "工作流", value: "24", detail: "2 个等待 Signal", tone: "violet" },
      { label: "Worker", value: "18 / 18", detail: "5 类运行时", tone: "mint" },
      { label: "数据积压", value: "284", detail: "峰值 2,842", tone: "cyan" },
      { label: "失败任务", value: "3", detail: "已进入重试", tone: "amber" }
    ],
    features: [
      { title: "持久任务", description: "Campaign、Agent、索引、导出和备份流程。", state: "24 个", tone: "violet" },
      { title: "Worker Fleet", description: "Scrapy、Playwright、Node Realtime、Data 和 Agent。", state: "全部在线", tone: "mint" },
      { title: "数据积压", description: "Task Queue、Arrow Spool、写入水位和失败批次。", state: "健康", tone: "cyan" },
      { title: "版本与恢复", description: "Worker Build ID、兼容版本、滚动升级和任务接管。", state: "可恢复", tone: "neutral" }
    ],
    records: [
      { primary: "crawl-campaign-482", secondary: "workflow · 01:48:22", meta: "activity fetch-browser · attempt 1", status: "运行中", tone: "violet" },
      { primary: "crawler-browser@2026.08.22", secondary: "3 replicas · task queue browser", meta: "CPU 42% · sessions 12/24", status: "健康", tone: "mint" },
      { primary: "normalize-bilibili-v4", secondary: "consumer group normalizer", meta: "lag 284 · ETA 4 秒", status: "追赶中", tone: "cyan" }
    ]
  },
  {
    id: "extensions",
    label: "扩展中心",
    eyebrow: "LOCAL EXTENSIONS",
    title: "扩展能力，但不模糊信任边界。",
    description: "安装和管理 Connector、Agent Toolset、Model Provider、Exporter 与 UI Panel 扩展。",
    primaryAction: "安装本地扩展",
    secondaryAction: "创建扩展项目",
    tabs: ["已安装", "兼容性", "权限", "更新"],
    metrics: [
      { label: "已安装", value: "12", detail: "内置 8 · 本地 4", tone: "cyan" },
      { label: "已签名", value: "10", detail: "2 个开发模式", tone: "mint" },
      { label: "可更新", value: "3", detail: "兼容 API v1", tone: "violet" },
      { label: "权限变化", value: "1", detail: "更新前需复核", tone: "amber" }
    ],
    features: [
      { title: "扩展清单", description: "Manifest、API 版本、能力、配置 Schema 和入口。", state: "12 个", tone: "cyan" },
      { title: "签名与来源", description: "内置、受信发布者和本地开发扩展分级。", state: "已校验", tone: "mint" },
      { title: "权限预览", description: "网络、文件、凭据、工具和 UI 插槽范围。", state: "显式授权", tone: "violet" },
      { title: "兼容更新", description: "升级前兼容检查、数据迁移、健康探针和回滚。", state: "3 个更新", tone: "amber" }
    ],
    records: [
      { primary: "Bilibili Connector Suite", secondary: "内置 · v6.1.0", meta: "账号、关注、直播、弹幕、榜单", status: "已启用", tone: "mint" },
      { primary: "Parquet Exporter", secondary: "本地签名 · v2.4.1", meta: "filesystem.write · object.read", status: "已启用", tone: "cyan" },
      { primary: "Browser Research Tools", secondary: "更新 v1.8.0", meta: "新增 network:external 权限", status: "需复核", tone: "amber" }
    ]
  },
  {
    id: "approvals",
    label: "审批与审计",
    eyebrow: "HUMAN CONTROL PLANE",
    title: "高影响动作必须留下等待、决定和后果。",
    description: "处理工具审批、凭据操作、数据导出、网络出站与插件权限，并查询完整审计链。",
    primaryAction: "查看待审批",
    secondaryAction: "导出审计记录",
    tabs: ["待审批", "策略", "审计事件", "风险报告"],
    metrics: [
      { label: "待审批", value: "2", detail: "最长等待 4 分钟", tone: "amber" },
      { label: "24h 已批准", value: "42", detail: "拒绝 8 次", tone: "mint" },
      { label: "策略规则", value: "36", detail: "12 条强制审批", tone: "violet" },
      { label: "高风险事件", value: "0", detail: "过去 7 天", tone: "cyan" }
    ],
    features: [
      { title: "持久化审批", description: "SQLite Task 等待，应用重启后仍可继续。", state: "2 项", tone: "amber" },
      { title: "策略引擎", description: "ALLOW、DENY、REQUIRE_APPROVAL 和范围缩减。", state: "36 条规则", tone: "violet" },
      { title: "审计因果链", description: "用户、Agent、工具、凭据、对象和结果关联。", state: "完整", tone: "cyan" },
      { title: "风险分析", description: "异常出站、反复拒绝、权限漂移和敏感字段。", state: "无高风险", tone: "mint" }
    ],
    records: [
      { primary: "导出直播场次报告", secondary: "Agent: weekly-report · filesystem.write", meta: "目标 D:\\Exports\\weekly · 42.8 MB", status: "等待批准", tone: "amber" },
      { primary: "调用远程视觉模型", secondary: "Agent: image-inspector · network.external", meta: "将发送 3 张截图 · 数据级别 L2", status: "等待批准", tone: "amber" },
      { primary: "撤销 Bilibili 凭据", secondary: "人工操作 · credential.delete", meta: "影响 18 个采集任务 · 已取消", status: "已拒绝", tone: "coral" }
    ]
  },
  {
    id: "observability",
    label: "系统观测",
    eyebrow: "LOCAL OBSERVABILITY",
    title: "从一条 UI 事件追到模型、工具和原始请求。",
    description: "整合 OpenTelemetry Trace、Phoenix Agent 观测、日志、指标、告警和诊断包。",
    primaryAction: "打开 Trace",
    secondaryAction: "生成诊断包",
    tabs: ["服务拓扑", "Trace", "日志", "指标", "告警"],
    metrics: [
      { label: "服务健康", value: "18 / 18", detail: "最近探针 2 秒前", tone: "mint" },
      { label: "Trace P95", value: "2.84 s", detail: "含远程模型调用", tone: "cyan" },
      { label: "错误率", value: "0.14%", detail: "过去 1 小时", tone: "violet" },
      { label: "活跃告警", value: "3", detail: "均为 warning", tone: "amber" }
    ],
    features: [
      { title: "本地拓扑", description: "Local Core、Task Engine、Worker 与嵌入式数据组件健康。", state: "全部在线", tone: "mint" },
      { title: "进程 Trace", description: "UI IPC、Task、Worker、Arrow Batch 与 Tool Call 贯通。", state: "OTel", tone: "cyan" },
      { title: "Agent 观测", description: "模型输入输出、评估、数据集和实验进入 Phoenix。", state: "已连接", tone: "violet" },
      { title: "诊断与告警", description: "脱敏日志、指标、存储趋势、异常检测和诊断包。", state: "3 个告警", tone: "amber" }
    ],
    records: [
      { primary: "trace 7f9a...2c1d", secondary: "AgentRun → data.query → DuckDB", meta: "2.84s · 18 spans · 0 errors", status: "完整", tone: "mint" },
      { primary: "crawler-browser session pressure", secondary: "warning · browser worker", meta: "12/24 contexts · growth 18%/h", status: "观察", tone: "amber" },
      { primary: "qdrant index freshness", secondary: "warning · knowledge collection", meta: "22,431 points pending · ETA 8m", status: "处理中", tone: "cyan" }
    ]
  },
  {
    id: "settings",
    label: "系统设置",
    eyebrow: "LOCAL APPLIANCE SETTINGS",
    title: "管理本地平台，而不是一堆互相覆盖的配置文件。",
    description: "配置工作空间、数据目录、本地运行时、密钥、网络、备份、保留策略、更新和开发模式。",
    primaryAction: "保存设置",
    secondaryAction: "立即备份",
    tabs: ["常规", "存储", "安全", "网络", "备份", "更新", "开发者"],
    metrics: [
      { label: "数据目录", value: "3.42 TB", detail: "剩余 4.18 TB", tone: "cyan" },
      { label: "最近备份", value: "02:00", detail: "已校验可恢复", tone: "mint" },
      { label: "密钥版本", value: "key_03", detail: "轮换于 32 天前", tone: "violet" },
      { label: "可用更新", value: "1", detail: "需要迁移预检查", tone: "amber" }
    ],
    features: [
      { title: "工作空间与目录", description: "本地数据、导出、临时对象和便携目录解析。", state: "已配置", tone: "cyan" },
      { title: "本地运行时", description: "Core、Worker、CPU/GPU、并发、健康和进程限制。", state: "运行中", tone: "mint" },
      { title: "安全与网络", description: "Secret Vault、密钥轮换、出站白名单和代理。", state: "受保护", tone: "violet" },
      { title: "备份与升级", description: "预检、逻辑备份、对象清单、迁移和回滚。", state: "1 个更新", tone: "amber" }
    ],
    records: [
      { primary: "Bili Local Runtime", secondary: "TypeScript Core · Isolated Workers", meta: "16 CPU · 32 GB · GPU 可用", status: "运行中", tone: "mint" },
      { primary: "本地完整备份", secondary: "每天 02:00 · 保留 14 份", meta: "SQLite + Parquet + Lance + Object manifest", status: "已验证", tone: "cyan" },
      { primary: "Desktop 0.2.0", secondary: "更新可用 · schema preflight", meta: "将升级 JSON Schema API v2", status: "待安装", tone: "amber" }
    ]
  }
]

export const businessCapabilities: BusinessCapability[] = [
  { id: "bilibili-qr-auth", label: "B站扫码登录态", source: "BiliMonitor", pageId: "platform-accounts", implementation: "Session Vault + Bilibili auth connector" },
  { id: "douyin-oauth-auth", label: "抖音 OAuth 登录态", source: "BiliMonitor", pageId: "platform-accounts", implementation: "OAuth connector + encrypted credential" },
  { id: "douyin-web-auth", label: "抖音 Web 扫码登录态", source: "BiliMonitor", pageId: "platform-accounts", implementation: "Isolated Playwright auth worker" },
  { id: "follower-monitor", label: "B站粉丝监控", source: "BiliMonitor", pageId: "subjects", implementation: "Scrapy connector + local schedule" },
  { id: "subject-workbench", label: "指定用户监控工作台", source: "BiliMonitor", pageId: "subjects", implementation: "Subject aggregate + widget layout" },
  { id: "live-room-monitor", label: "直播间状态监控", source: "BiliMonitor", pageId: "live-radar", implementation: "Live connector + status workflow" },
  { id: "live-danmaku", label: "弹幕实时采集", source: "BiliMonitor", pageId: "live-radar", implementation: "Node WebSocket worker" },
  { id: "live-rank", label: "观众与大航海榜单", source: "BiliMonitor", pageId: "live-radar", implementation: "Rank connector + snapshot store" },
  { id: "live-session-insight", label: "直播场次洞察", source: "BiliMonitor", pageId: "live-radar", implementation: "Parquet + DuckDB session projections" },
  { id: "live-session-export", label: "场次 CSV/XLSX 导出", source: "BiliMonitor", pageId: "live-radar", implementation: "Durable export workflow" },
  { id: "collect-task", label: "采集任务与断点恢复", source: "BiliMonitor", pageId: "campaigns", implementation: "TypeScript durable campaign task" },
  { id: "raw-payload", label: "原始响应留档", source: "BiliMonitor", pageId: "data-assets", implementation: "Content-addressed object store" },
  { id: "analytics", label: "分析看板", source: "BiliMonitor", pageId: "data-assets", implementation: "DuckDB semantic queries" },
  { id: "ai-analysis", label: "AI 分析", source: "BiliMonitor", pageId: "agent-studio", implementation: "Versioned AgentSpec" },
  { id: "identity-link", label: "跨平台身份关联", source: "BiliMonitor", pageId: "identity", implementation: "Evidence-backed identity graph" },
  { id: "crawler-frontier", label: "统一抓取 Frontier", source: "Desktop Platform", pageId: "campaigns", implementation: "Frontier service" },
  { id: "agent-runtime", label: "可恢复 Agent Runtime", source: "Desktop Platform", pageId: "agent-runs", implementation: "PydanticAI + SQLite Step Persistence" },
  { id: "hybrid-retrieval", label: "混合检索与长期记忆", source: "Desktop Platform", pageId: "knowledge", implementation: "LanceDB hybrid retrieval" },
  { id: "model-routing", label: "模型目录与路由", source: "Desktop Platform", pageId: "models", implementation: "Native provider adapters" },
  { id: "agent-evaluation", label: "Agent 评估", source: "Desktop Platform", pageId: "evaluations", implementation: "Phoenix datasets and experiments" },
  { id: "mcp-tools", label: "MCP 工具治理", source: "Desktop Platform", pageId: "tools", implementation: "Tool Broker" },
  { id: "durable-approval", label: "持久化审批", source: "Desktop Platform", pageId: "approvals", implementation: "Core policy + SQLite task signal" },
  { id: "extension-runtime", label: "扩展运行时", source: "Desktop Platform", pageId: "extensions", implementation: "Signed manifest + sandbox" },
  { id: "observability", label: "端到端可观测", source: "Desktop Platform", pageId: "observability", implementation: "OpenTelemetry + Phoenix" }
]

export function findProductPage(pageId: PageId): ProductPage | undefined {
  return productPages.find((page) => page.id === pageId)
}
