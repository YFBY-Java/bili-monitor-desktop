# 初版桌面 UI 设计

## 目录

- [设计目标](#设计目标)
- [事实来源](#事实来源)
- [产品信息架构](#产品信息架构)
- [界面骨架](#界面骨架)
- [视觉系统](#视觉系统)
- [全局交互](#全局交互)
- [业务页面规格](#业务页面规格)
- [关键业务流程](#关键业务流程)
- [状态设计](#状态设计)
- [组件体系](#组件体系)
- [可访问性与响应式](#可访问性与响应式)
- [原型截图](#原型截图)

## 设计目标

初版 UI 的目标不是制作静态大屏，而是建立完整桌面产品的信息架构和交互基线。目标用户是在自己的 Windows 电脑上长期运行爬虫、监控直播、分析社交数据、设计 Agent 并处理高风险审批的单用户操作者。

界面的单一核心任务是：让操作者随时回答以下问题。

1. 当前正在采集什么，是否健康，下一步什么时候发生。
2. 一条数据或结论来自哪个请求、原始对象和解析版本。
3. 一个 Agent 正在使用哪个模型、调用什么工具、等待什么审批。
4. 哪些平台账号、Worker、模型和数据服务正在影响当前任务。
5. 出错后应该重试、恢复、重新登录、回放解析还是人工检查。

初版原型使用演示数据，只验证信息结构、视觉层级和交互入口，不表示对应后端已经实现。

## 事实来源

设计先盘点本地 `D:\codex_work\BiliMonitor`，再把已实现业务迁移到新的桌面产品结构。主要来源包括：

- `social-data-monitor/frontend/src/router/index.ts`：现有 Dashboard、Bilibili、抖音登录态、直播监控、用户监控、任务、数据、分析、AI、Identity 和设置页面。
- `social-data-monitor/frontend/src/api/bilibili.ts`：关注者监控、即时刷新、暂停、采集间隔和趋势。
- `social-data-monitor/frontend/src/api/bilibiliAuth.ts`：B站二维码登录、状态轮询、校验、刷新、凭据查看和撤销。
- `social-data-monitor/frontend/src/api/douyinAuth.ts`：抖音 OAuth、Web 二维码、凭据校验、查看、导出和撤销。
- `social-data-monitor/frontend/src/api/bilibiliLive.ts`：直播间状态、事件、弹幕长连接、实时指标和排行。
- `social-data-monitor/frontend/src/api/bilibiliLiveSessions.ts`：直播场次、用户、事件、洞察和 CSV/XLSX 导出。
- `social-data-monitor/frontend/src/api/subjects.ts`：监控对象、B站绑定、工作台、趋势、健康事件和布局。
- `social-data-monitor/backend/src/main/resources/db/migration/`：关注者、直播、弹幕、榜单、场次和登录态的实际数据边界。
- `design-mockups/png/version-10.png`：深色值守监控台。
- `docs/mockups/bilibili-user-monitor-style-a-overview.png`：指定用户工作台和可配置 Widget。

新设计继承业务语义和已经验证的边界，不复制 Vue 页面布局、Spring Controller 或数据库结构。

## 产品信息架构

导航按操作者的工作顺序组织，不按后端服务组织。

| 导航域 | 页面 | 页面职责 |
| --- | --- | --- |
| 全局 | 信号总览 | 汇总采集、直播、Agent、审批和本地进程状态 |
| 采集 | 监控对象 | 跨平台主体、账号绑定、趋势、健康和 Widget 工作台 |
| 采集 | 采集活动 | Campaign、Frontier、调度、Checkpoint、重试和风险暂停 |
| 采集 | 直播雷达 | 房间、弹幕、榜单、场次、洞察和导出 |
| 采集 | 数据资产 | 实体、事件、原始证据、数据集、解析回放和导出 |
| 智能 | Agent 工作台 | AgentSpec、Prompt、Toolset、输出 Schema 和发布版本 |
| 智能 | 运行记录 | 消息、步骤、工具、审批、成本、产物和回放 |
| 智能 | 知识库 | 来源、切片、混合检索、重排、引用和索引任务 |
| 智能 | 模型路由 | 模型目录、Provider、路由规则、本地推理和出站治理 |
| 智能 | 评估中心 | 黄金数据集、实验、评估器、回归趋势和发布门禁 |
| 平台 | 平台与账号 | B站/抖音登录态、Session Vault、浏览器 Profile 和凭据 |
| 平台 | 连接器 | 能力矩阵、Parser、限频、风险和契约测试 |
| 平台 | 身份图谱 | 身份节点、候选关联、证据、冲突和人工决策 |
| 平台 | 工具与 MCP | 工具目录、MCP Server、能力令牌、沙箱和调用审计 |
| 平台 | 工作流与 Worker | 本地持久任务、Schedule、Worker、数据积压和版本恢复 |
| 平台 | 扩展中心 | Connector、Toolset、Provider、Exporter 和 UI 扩展 |
| 治理 | 审批与审计 | 待审批、策略、审计因果链和风险报告 |
| 治理 | 系统观测 | 服务拓扑、Trace、Agent 观测、日志、指标和告警 |
| 治理 | 系统设置 | 工作空间、存储、本地运行时、安全、备份、更新和开发模式 |

业务清单的可执行数据源位于 `apps/desktop/src/renderer/src/product-model.ts`。导航与该清单共用同一份数据，防止文档页面与原型页面失配。

## 界面骨架

```text
┌──────────────┬───────────────────────────────────────────────┐
│ BiliMonitor  │ 工作空间 / 搜索 / Local Only / 通知           │
│              ├───────────────────────────────────────────────┤
│ 全局         │ Signal Tape：Crawler / Live / Agent / Policy  │
│  信号总览    ├──────────────────────────────────────┬────────┤
│              │ 页面标题、说明与主要操作             │ Activity│
│ 采集         │ Tabs / 筛选 / 刷新                  │ Trace   │
│  监控对象    │                                      │        │
│  采集活动    │ 四项关键指标                         │ 数据路径│
│  直播雷达    │                                      │        │
│  数据资产    │ 功能矩阵 / 控制面 / 业务记录         │ 快速入口│
│              │ Trace 预览 / 页面专属内容            │        │
│ 智能 / 平台  │                                      │        │
│ 治理         │ 页面状态栏                           │        │
└──────────────┴──────────────────────────────────────┴────────┘
```

三个稳定区域分别承担不同职责：

- 左侧导航回答“我要进入哪个业务域”。
- 中央工作区回答“我要查看和操作什么”。
- 右侧 Activity Trace 回答“刚刚发生了什么，和当前对象有什么关系”。

顶部 Signal Tape 是本产品的识别元素。它不是装饰性跑马灯，而是经过抽样和聚合的事实事件流。点击事件后打开对应 Crawl Run、Live Session、Agent Run、Tool Invocation 或 Approval。

## 视觉系统

### 色彩

| Token | 色值 | 语义 |
| --- | --- | --- |
| `signal.bg` | `#07111F` | 主背景 |
| `signal.panel` | `#0D1A2C` | 工作面板 |
| `signal.text` | `#EAF2FF` | 主文字 |
| `signal.cyan` | `#25B7D3` | 采集、导航、B站信号 |
| `signal.coral` | `#FF6B7A` | 直播、断线、停止、危险 |
| `signal.amber` | `#F2B84B` | 审批、退避、人工检查 |
| `signal.mint` | `#43D9A3` | 健康、完成、可恢复 |
| `signal.violet` | `#9D8CFF` | Agent、模型、实验 |

颜色只用于稳定语义。所有状态同时展示文字、图标或形状，不能仅靠颜色区分。

### 字体

- 标题和大数字：`Bahnschrift`，利用 Windows 本地字体形成仪表感。
- 中文正文：`Microsoft YaHei UI`，不依赖网络字体。
- ID、时间、状态码：`Cascadia Code`。

### 密度和圆角

- 基础间距单位：4px。
- 面板间距：12px。
- 面板圆角：8px；按钮圆角：7px。
- 主体区域适配鼠标和键盘，不以触屏大控件为默认。
- 高密度信息通过分栏、标签和固定表头组织，不通过无限缩小字号解决。

## 全局交互

### 命令面板

- `Ctrl/Cmd + K` 打开。
- 同时搜索页面、BiliMonitor 继承能力、对象、工具、工作流和运行记录。
- 结果显示类型和目标工作区。
- 生产实现支持方向键、Enter、Esc、最近访问和权限过滤。

### 深链接

原型使用 `#page-id`；生产使用 TanStack Router，并支持：

```text
/subjects/:subjectId
/campaigns/:campaignId
/live/rooms/:roomMonitorId
/live/sessions/:sessionId
/agents/:agentId/versions/:version
/runs/:runId
/approvals/:approvalId
/traces/:traceId
```

每个抽屉、详情页和 Trace 都必须可复制链接，不依赖临时前端状态。

### 页面通用结构

1. `WorkspaceHeader`：页面目标、上下文和主要动作。
2. `TabRail`：同一聚合内的稳定子视图。
3. `MetricStrip`：最多四个当前任务真正需要的指标。
4. `FeatureMatrix`：业务功能和当前状态。
5. `RecordPanel`：可操作记录，不只展示统计。
6. `TracePreview`：当前动作最近一次因果链。

主要动作只能有一个。破坏性操作不放在标题主按钮中，进入详情菜单并要求确认或审批。

## 业务页面规格

### 信号总览

- 展示入站事件、活跃工作流、直播连接和待审批动作。
- 主图对齐采集事件与直播事件，支持缩放到 5 分钟、1 小时、24 小时。
- 执行平面显示 `Local Core`、Task Engine、Data Worker 和 Agent Worker 健康。
- “正在关注”混排监控对象、直播场次和 Agent Run，通过类型图标区分。
- 风险 Tab 仅显示需要操作者行动的问题，不重复一般告警。

### 监控对象

- 列表支持名称、标签、平台、健康、最近成功、直播状态和异常筛选。
- 新建对象后可以绑定 B站 UID、直播间、抖音账号和未来平台账号。
- 对象详情使用 Widget Layout，保留 BiliMonitor 的粉丝趋势、直播热度、弹幕、健康事件和自定义布局。
- 指标矩阵明确“平台原始指标”和“跨平台规范化指标”，禁止静默相加不可比指标。
- 解绑账号不删除平台历史数据，只停止对象聚合关系。

### 采集活动

- 创建向导包含目标、种子、Connector 能力、账号、抓取模式、调度、证据策略、限频和保留期。
- 运行页展示 Campaign、Frontier、Fetch、Normalize 四层进度。
- URL 级事件默认聚合，按需打开 Frontier 详情，避免 UI 被数万 URL 淹没。
- 风控、验证码和协议变化进入 `MANUAL_REVIEW`。
- 暂停表示不领取新工作；取消表示工作流终止并保存 Checkpoint；重放表示从原始对象重新解析。

### 直播雷达

- 房间视图展示直播状态、在线数、标题、分区、下一次采集和连接健康。
- 弹幕流支持消息、用户、勋章、点赞、看过、心跳人气和速率曲线。
- 榜单保留观众榜与大航海榜快照、页码和采集时间。
- 场次页展示开始/结束、覆盖状态、用户、弹幕、礼物、SC、上舰和收入估算口径。
- 导出明确类别、列、时间范围、目标目录、预计大小和覆盖缺口。

### 数据资产

- 规范化实体和事实事件通过保存查询浏览。
- 原始证据预览 WARC/HAR/JSON/截图/Trace，并显示 Hash、来源、保留期和引用数。
- 数据血缘从规范化字段回到 Parser、Connector、FetchRequest 和 ObjectRef。
- Parser 升级显示影响对象数量，允许影子重放和差异比较后切换版本。
- 导出是持久化任务，支持 CSV、JSONL、Parquet、XLSX 和报告包。

### Agent 工作台

- 左侧编辑 Agent 定义；中央调试对话；右侧展示工具、模型、输出 Schema 和版本差异。
- Agent 名称、Toolset ID 和输出 Schema 版本发布后不可原地修改。
- 沙箱试跑显示模型路由原因、Token、Tool Call、审批和结构化输出验证。
- 发布前运行指定评估集，未过门槛时不能标记 Production。

### Agent 运行记录

- 运行列表区分运行中、等待审批、重试、失败、取消和完成。
- 详情按因果顺序展示消息、模型 Activity、工具 Activity、Signal、Artifact 和评估。
- Token 增量只用于现场 UI；回放使用持久化 Message 和聚合 RunEvent。
- 支持两个 Run 的模型、Prompt、工具路径、结果和用量对比。

### 知识库

- 来源支持数据资产查询、对象证据、文档、字幕和 Agent 产物。
- 切片预览显示边界、Metadata、Embedding 和删除传播状态。
- 检索调试同时展示 Filter、Dense、Sparse、RRF、Rerank 和最终 Evidence Pack。
- 每条 Evidence 必须有来源时间、ObjectRef 和内容 Hash。

### 模型路由

- 模型目录按模态、上下文、工具、结构化输出和原生能力筛选。
- Provider 配置只保存 SecretRef，UI 不回显完整 API Key。
- 路由模拟器输入任务、数据级别和能力要求，显示匹配与拒绝原因。
- 本地推理展示模型、GPU、并发、KV Cache、队列和健康。
- 远程出站前展示将要发送的数据类别和应用的脱敏规则。

### 评估中心

- 数据集样本关联真实 ObjectRef，允许冻结版本。
- 实验记录 Agent、模型、Prompt、Toolset、Retriever 和 Parser 版本。
- 评估器区分确定性、Schema、引用、工具路径和 LLM Judge。
- 生产版本页面展示门槛、回归趋势、人工签署和回滚目标。

### 平台与账号

- B站：扫码、轮询、状态、刷新、查看和撤销。
- 抖音 OAuth：授权、回调、刷新、校验、查看、导出和撤销。
- 抖音 Web：异步 Playwright 会话、二维码、扫码状态、消费凭据和验证。
- Browser Profile 按平台和账号隔离，展示被哪些任务租用，不允许前端直接读 Cookie。
- 撤销凭据前展示影响的 Campaign、Realtime Connection 和 Agent Tool。

### 连接器

- 展示 Capability、输入输出 Schema、引擎、认证要求、限频建议和风险等级。
- Parser 版本关联录制夹具和重放结果。
- 协议变化可以将单个 Capability 降级，不需要停用整个连接器。
- 契约测试覆盖成功、限频、凭据失效、响应变化和幂等。

### 身份图谱

- 逻辑身份、平台账号和监控对象是不同节点。
- 候选关联展示算法分数和实际证据，不自动覆盖人工关系。
- 支持确认、拒绝、撤销、拆分和冲突处理。
- 每次关系变化写入审计事件并保留旧版本。

### 工具与 MCP

- 工具详情展示输入输出、版本、超时、幂等、数据范围和影响级别。
- MCP Server 展示 Transport、工具发现、健康和连接日志。
- 权限策略预览某 Agent 实际获得的 Capability Token。
- 调用记录可跳转 Agent Run、Approval、Trace 和 ObjectRef。

### 工作流与 Worker

- 工作流列表来自 SQLite Task Projection，不直接展示内部表字段。
- Worker 展示 Runtime、Build ID、Task Queue、并发、心跳和当前任务。
- 数据积压面板展示 Task Queue、Arrow Spool、Parquet 水位、吞吐和失败批次。
- 升级界面明确兼容版本、旧 Worker 排空和任务接管状态。

### 扩展中心

- 支持 `platform.connector`、`agent.toolset`、`model.provider`、`exporter` 和 `ui.panel`。
- 安装前展示签名、来源、API 版本和权限差异。
- 开发模式扩展有永久醒目标记，不与受信扩展混淆。
- 更新前运行兼容检查和健康探针；失败后恢复旧版本。

### 审批与审计

- 待审批卡显示请求者、Agent、工具、目标、数据级别、影响和过期时间。
- 允许“批准一次”“缩小范围后批准”“拒绝”。首版不提供永久允许高风险操作。
- 决策后展示 Tool Invocation 的最终结果，形成完整因果链。
- 审计搜索支持 correlation ID、run ID、credential、object、tool 和 user action。

### 系统观测

- 本地拓扑来自 Core Worker Registry、进程健康和 OTel Span 关系。
- Trace 贯通 UI IPC、Core Command、Task、Worker、Arrow Batch、嵌入式数据和 MCP。
- 本地 Trace Store 负责 Agent Trace、Dataset、Experiment 和 Evaluator；Phoenix 仅为可选开发导出目标。
- 诊断包自动脱敏，不包含 Cookie、API Key、完整 Prompt 敏感字段或浏览器 Profile。

### 系统设置

- 配置写入版本化 Workspace Settings，不让各组件各自维护互相覆盖的文件。
- 存储页展示 SQLite、CAS、Parquet、LanceDB、对象保留期、容量预测和备份目标。
- 安全页管理 Secret Vault、key ID、轮换和出站白名单。
- 更新页先运行容量、备份、Schema 和 Worker 兼容预检。

## 关键业务流程

### 创建采集活动

```text
新建采集活动
→ 选择对象/种子和 Connector Capability
→ 选择账号与 Fetch Mode
→ 配置调度、限频、证据和保留期
→ 展示权限与风险摘要
→ 创建 Campaign
→ 跳转运行页并订阅状态流
```

### 直播场次复盘

```text
直播雷达选择场次
→ 查看覆盖状态和实时事件
→ 启动“直播复盘 Agent”
→ Agent 查询场次、弹幕、榜单和证据
→ 需要导出时进入审批
→ 生成可引用报告和数据包
```

### 登录态续期

```text
平台与账号发现凭据即将失效
→ 暂停依赖该账号的新 Fetch
→ 打开二维码或 OAuth 续期
→ 本地 Core 校验并原子激活新 credential version
→ 恢复依赖任务
→ 审计记录旧版本撤销和新版本启用
```

## 状态设计

每个页面至少实现以下状态，不能只实现正常演示态。

| 状态 | UI 行为 |
| --- | --- |
| 首次加载 | 保留稳定布局的 Skeleton，不让标题和主按钮跳动 |
| 空状态 | 说明为什么为空，并提供唯一下一步动作 |
| 局部失败 | 保留其他模块，只在失败面板中显示错误类别和重试 |
| Core/Worker 离线 | 显示受影响能力、诊断入口和本地日志位置 |
| 凭据失效 | 暂停相关任务，提供重新登录，不影响匿名或其他平台任务 |
| 限频退避 | 展示服务端提示、本地预算和准确的下次重试时间 |
| 等待审批 | 保持工作流状态，显示影响、申请者和到期时间 |
| 无权限 | 解释被哪条策略拒绝，不把拒绝伪装成数据为空 |
| 历史数据缺口 | 展示覆盖率和缺口区间，不用 0 替代未知值 |
| 长任务 | 展示阶段、已完成量、当前 Activity、取消语义和恢复能力 |

## 组件体系

首批组件按职责而不是页面复制：

```text
shell/
  DesktopShell
  Sidebar
  TopBar
  SignalTape
  ActivityRail

workspace/
  WorkspaceHeader
  TabRail
  MetricStrip
  FeatureMatrix
  RecordPanel
  TracePreview

feedback/
  HealthBadge
  RiskBadge
  EmptyState
  ErrorBoundary
  ApprovalDialog
  DestructiveConfirm

data/
  DataGrid
  TimeRangePicker
  EvidenceLink
  ObjectPreview
  CoverageIndicator

agent/
  RunTimeline
  ToolCallCard
  ModelCallCard
  ApprovalCard
  ArtifactCard
```

可复用组件只接收领域无关的展示输入；页面容器负责调用 Query/Command Hook 并把数据转换成 ViewModel。

## 可访问性与响应式

- 所有图标按钮必须有 `aria-label`。
- Tabs 使用 `role=tablist/tab` 和 `aria-selected`。
- Signal Tape 可以暂停，并尊重 `prefers-reduced-motion`。
- 命令面板打开后需要焦点锁定，关闭后把焦点还给触发按钮。
- 1024px–1100px 自动收起侧栏并隐藏右侧轨道，中央业务区保持可用。
- 低于 760px 的规则用于开发预览，不承诺手机产品形态。
- 数据表必须支持键盘行导航、可见 Focus 和屏幕阅读器列标题。
- 生产字号正文不低于 11px；当前原型中的极小 Utility Text 在组件化时统一提高。

## 原型截图

- [信号总览](screenshots/command-center-v0.1.png)
- [直播雷达](screenshots/live-radar-v0.1.png)
- [平台与账号](screenshots/platform-accounts-v0.1.png)
- [命令面板](screenshots/command-palette-v0.1.png)
- [1024px 直播雷达响应式修正版](screenshots/live-radar-1024-fixed-v0.1.png)
- [本轮浏览器 QA 报告](qa/report.md)

原型入口：`apps/desktop/src/renderer/src/DesktopWorkspace.tsx`。
