# 初始架构设计

> 状态：Superseded。本文保留早期轻量架构探索；当前目标架构见 [初版全功能技术实现设计](initial-functional-implementation.md) 和 [ADR-0004](../adr/0004-local-capability-platform.md)。

## 目录

- [目标与假设](#目标与假设)
- [方案比较](#方案比较)
- [推荐架构](#推荐架构)
- [模块边界](#模块边界)
- [爬虫体系](#爬虫体系)
- [Agent 体系](#agent-体系)
- [数据设计](#数据设计)
- [安全与隐私](#安全与隐私)
- [故障处理](#故障处理)
- [测试策略](#测试策略)
- [从 BiliMonitor 继承什么](#从-bilimonitor-继承什么)
- [明确不做](#明确不做)

## 目标与假设

目标是构建单用户、本地优先、可以长期演进的桌面工作台。桌面 UI、本地任务、数据库、爬虫和 Agent 运行记录均位于本机。调用外部 AI API 属于用户显式启用的出站能力，不等于把业务后端部署到云端。

初始假设如下：

- Windows 是首个交付平台，模块不依赖 Windows 路径或注册表业务逻辑。
- 应用默认单用户，不实现 Web 系统式 RBAC；对 Agent 工具使用更细的能力权限。
- 首版只内置官方维护的插件，第三方插件加载能力在签名和隔离方案明确后开放。
- BiliMonitor 继续独立演进；新项目通过行为测试和公开领域契约复用经验，不与其数据库或 Java 类建立运行时耦合。

## 方案比较

### 方案 A：Electron + Vue + Python Core（采用）

优点是桌面能力、Chromium 渲染、Vue 工程经验和进程管理都比较成熟；Python Core 可以直接使用 Playwright、Pydantic、数据分析和 AI 生态。缺点是安装包和内存占用较大，并且需要维护 Node 与 Python 两套构建链。

该方案最符合“爬虫友好”和“Agent 友好”的优先级。通过严格的进程边界，可以把多运行时成本转化为故障隔离能力。

### 方案 B：Tauri 2 + Vue + Python Sidecar

优点是桌面壳小、权限模型清晰。缺点是 Windows 开发还需 Rust、C++ Build Tools 和 WebView2，Python sidecar 的跨平台打包与签名也不能省略。应用一旦捆绑 Playwright 浏览器，Tauri 的总体体积优势会明显下降。

如果未来产品确认不捆绑浏览器、安装包体积成为硬指标，可以重新评估此方案。

### 方案 C：PySide6 + Python

优点是单语言、调用爬虫和 Agent 最直接。缺点是 UI 工程、组件生态、Web 技术复用和复杂工作台布局的开发效率较弱，团队前端经验也难以沿用。

该方案更适合内部工具或界面简单的采集器，不是当前长期产品形态的首选。

## 推荐架构

系统采用本地多进程、端口适配器和事件驱动的模块化单体：

1. Electron Main 负责窗口、文件选择、系统托盘、自动更新、秘密存储入口和子进程生命周期。
2. Vue Renderer 只负责交互和展示，通过窄化的 preload API 与本地 HTTP API 工作。
3. Python Local Core 提供业务用例、数据库、任务调度、插件注册、Agent 运行时和事件流。
4. Crawler/Agent Worker 从持久化任务表领取租约执行，崩溃后任务可恢复；首版可与 Core 同一发行包，但逻辑上不共享全局状态。
5. Platform Connector 封装站点能力；Model Provider 封装模型供应商；两者都由能力清单注册。

本地 Core 只监听 `127.0.0.1` 的随机端口。Electron 启动时生成高熵会话令牌，将连接信息通过进程参数或受控环境传给 Core，再通过 preload 暴露经过校验的少量调用。开发模式允许固定端口。

## 模块边界

### Desktop Shell

职责：应用生命周期、系统能力、Core 监督、升级和崩溃报告。它不包含爬虫规则、分析逻辑和数据库查询。

Renderer 必须开启 `contextIsolation` 与 sandbox，关闭 `nodeIntegration`，限制导航、新窗口、外链和权限请求。IPC 每个方法都需要独立参数校验，不能暴露通用 `send(channel, payload)`。

### Application Core

职责：实现用例并协调端口。核心代码依赖领域协议，不直接依赖 Playwright、具体 AI SDK 或 Electron。

推荐包结构：

```text
bili_monitor_core/
  api/               HTTP 和事件流适配器
  application/       use case、命令、查询
  domain/            实体、值对象、领域事件
  ports/             Connector、Store、Model、Tool、SecretVault 协议
  infrastructure/    SQLite、文件存储、调度器、provider 实现
  plugins/           manifest 校验与能力注册
```

### Plugin Registry

每个插件提供版本化 manifest、兼容的 API 版本、能力列表、配置 JSON Schema 和工厂函数。注册表只按显式入口加载插件，不扫描并执行任意文件。

首版插件类型：

- `platform.connector`：平台认证、采集、归一化和限频建议。
- `agent.toolset`：向 Agent 暴露只读或受控写入工具。
- `model.provider`：远程 API、本地 Ollama 或兼容 OpenAI 协议的模型。
- `exporter`：CSV、JSONL、Parquet 和报告输出。

## 爬虫体系

连接器采用“能力 + 请求 + 结果信封”，而不是不断扩大的平台基类。典型能力包括 `account.profile`、`content.list`、`live.status`、`live.danmaku` 和 `auth.web_qr`。

`FetchEnvelope` 至少包含：

- 结构化数据和原始对象引用；
- 下一页游标与 checkpoint；
- 请求耗时、端点、状态码和采集时间；
- 限频状态、建议下次调用时间；
- 可重试性、错误类别和风险等级。

采集策略：

- 能用 HTTPX 稳定完成时不启动浏览器。
- 需要登录、动态渲染或人工扫码时使用 Playwright 独立 BrowserContext。
- 登录状态按平台与账号隔离，保存文件永不进入 Git；密钥和可序列化状态经 SecretVault 加密。
- 每个平台有独立并发上限、令牌桶、指数退避与熔断器。
- 原始响应先落盘并计算哈希，再归一化入库，保证解析器升级后可以重放。
- 风控、验证码、账号异常和协议变化进入 `MANUAL_REVIEW`，不进行绕过。

持久化任务使用 `job`、`job_attempt`、`job_event` 和 `checkpoint`。Worker 领取带过期时间的 lease；进程退出后由回收器恢复。任务必须具备幂等键，写入使用 upsert 或唯一约束。

## Agent 体系

Agent 层先定义自己的稳定端口，再将 PydanticAI 作为首个适配器。业务 API 不直接返回框架对象，也不在数据库中保存框架私有序列化格式。

核心组成：

- `ModelProvider`：统一模型发现、结构化输出、流式响应、用量与成本。
- `ToolRegistry`：工具 schema、权限、超时、数据范围和审计元数据。
- `AgentDefinition`：版本化指令、工具集、输出 schema 和预算。
- `AgentRunStore`：run、step、message、tool call、artifact 和 usage。
- `PolicyEngine`：模型白名单、token/费用上限、网络域名和工具读写权限。
- `ApprovalGateway`：删除、外发、修改登录态等高影响工具必须人工确认。

首批 Agent 用例应是只读分析：单场直播摘要、指标异常解释、舆情标签和周期报告。Agent 只能通过查询工具访问数据，不能获得任意 SQL、Shell、文件系统或浏览器控制权。

复杂、长时间、需要断点恢复的工作流出现后，再通过 `AgentRuntime` 端口接入 LangGraph 或 PydanticAI 的持久化执行能力。不要在首个版本同时维护多个编排框架。

MCP 可作为未来的外部互操作层：将经过权限过滤的查询和采集能力暴露为工具，或让 Agent 消费外部 MCP Server。MCP 不是内部模块通信总线。

## 数据设计

### 事务层

SQLite 开启 WAL、外键和 busy timeout，由 Alembic 管理迁移。表按以下域分组：

- 平台、账号、凭据引用和能力；
- 采集任务、尝试、事件、checkpoint 和 API 调用日志；
- 原始对象索引与归一化社交数据；
- Agent 定义、运行、步骤、工具调用、产物和用量；
- 系统配置和审计事件。

所有业务时间使用 UTC 存储，UI 再转换本地时区。扩展字段必须有 schema/version，不能把 JSON 当作逃避建模的默认方式。

### 原始对象层

原始 payload、截图、trace、导出和 Agent 产物放在应用数据目录，路径由数据库中的对象记录间接引用。对象名以 SHA-256 为核心，附带媒体类型、大小、来源、抓取时间和保留策略。

数据量上升后，后台 compactor 将稳定事件转换为按平台和日期分区的 Parquet。DuckDB 只在分析或导出时启动，避免形成第二套业务写模型。

### 数据目录

开发模式默认使用仓库内 `.dev-data/`。安装版默认使用操作系统应用数据目录；显式开启 portable mode 时使用可执行文件旁的 `.local-data/`。三种模式都必须通过同一个 `DataDirectory` 端口解析，业务代码不得拼接机器绝对路径。

## 安全与隐私

- Renderer 不加载第三方页面，平台网页只存在于隔离的 Playwright 进程。
- API key、Cookie 和 token 通过 `SecretVault` 保存；Windows 首实现使用 Credential Manager/DPAPI 能力。
- Playwright storage state 可能具备账号接管能力，必须按秘密处理；只在运行期间解密到 ACL 受限的临时位置。
- Core 仅监听 loopback，使用一次性会话令牌，拒绝非预期 Origin/Host。
- 日志默认脱敏 Cookie、Authorization、query token、手机号和 API key。
- Agent 工具默认只读、最小数据范围、显式预算，所有工具调用有审计记录。
- 出站网络使用域名 allowlist；插件不能自行绕过统一网络客户端。

## 故障处理

- Core 启动失败：Electron 展示可诊断错误和日志位置，不循环无限重启。
- Worker 崩溃：lease 到期后恢复任务，达到重试上限则转人工检查。
- 平台限频：保存服务端提示和本地令牌桶状态，推迟任务，不并发冲击。
- 凭据失效：暂停相关任务，保留其他平台和匿名任务运行。
- 数据库升级失败：在迁移前备份 SQLite，失败时保持旧库并阻止写入。
- 模型失败：记录 provider/model/usage 和可重试类别；采集数据不受 Agent 失败影响。
- 应用退出：先停止领取新任务，再给活跃任务宽限期，最后保存 checkpoint。

## 测试策略

- 领域与端口：纯单元测试，禁止依赖网络。
- 连接器：录制响应夹具、解析器契约测试、登录状态状态机测试。
- 数据库：每个迁移从空库和上一个版本升级；验证唯一约束与幂等重放。
- Worker：崩溃恢复、lease 过期、退避和取消测试。
- Agent：使用模型替身验证工具权限、结构化输出、预算和提示注入边界。
- Desktop：preload API 契约测试、Electron 安全配置检查和 Playwright UI 冒烟测试。
- 发布：Windows 安装包在干净用户目录启动，创建数据目录，Core 健康检查通过，退出后无孤儿进程。

## 从 BiliMonitor 继承什么

复用的是已经验证的边界与业务语义：

- `SocialPlatformAdapter` 的能力注册思路，改造成更细粒度 Connector capability。
- `FetchResult` 中游标、限频、错误类型、可重试和风险等级的结果信封。
- `collect_task`、实例、checkpoint、API 日志与 raw payload 的可追溯任务模型。
- Bilibili/抖音登录态隔离、凭据密钥稳定性和浏览器 worker 隔离经验。
- Subject、直播场次、弹幕和榜单等领域概念，可在垂直切片中按需求移植。

不继承 Spring Controller、JDBC Repository、PostgreSQL 表定义或前后端部署拓扑。任何代码移植都需要保留原 ISC 许可声明并建立等价行为测试。

## 明确不做

- 首版不做多用户服务器、团队协作和云同步。
- 首版不做通用第三方插件商店和不受信任代码沙箱。
- 首版不让 Agent 自动发布内容、修改账号或绕过人工验证。
- 首版不为了“未来规模”引入 Redis、消息队列、微服务或远程数据库。
- 不以反风控或验证码绕过作为爬虫能力。
