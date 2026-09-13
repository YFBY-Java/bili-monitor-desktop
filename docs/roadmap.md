# 本地原生实施路线图

> 当前路线以 [当前运行时蓝图](architecture/typescript-python-local-runtime.md)、[本地原生业务与技术实现规格](architecture/local-native-business-implementation.md) 和 [ADR-0006](adr/0006-typescript-python-local-runtime.md) 为准。

> 2026-09-13 更新：下文为旧基线的接入和远期路线记录，不是全量业务验收结论。当前原项目为 `fa2faa6`，按 [逐功能迁移台账](implementation/2026-09-13-full-migration-tracker.md) 继续核对真实业务；平台 adapter/run-once 的可执行部分仍在范围内，不能因邻近页面含 Mock 而整体排除。当前本地 schema 为 v12。

当前进度（2026-08-30）：原 commit `01200f3` 中形成真实闭环的 B站与抖音本人登录态业务已迁移到本地 Contract、Core、SQLite v11、Worker、IPC 和 UI。包括用户工作台、粉丝、B站扫码、直播 REST、实时弹幕、榜单、场次、数据中心、洞察/导出，以及抖音 Web/OAuth 双凭据。B站公开 API 与真实 WebSocket smoke 已通过；B站真人扫码、抖音真人扫码/滑块和官方 OAuth 授权仍待手工验收。AI mock、采集任务 mock、Analytics placeholder 和平台骨架不计为待迁移业务，也不进入导航。

## 目录

- [阶段 0：桌面 Core](#阶段-0桌面-core)
- [阶段 1：账号与监控对象](#阶段-1账号与监控对象)
- [阶段 2：Campaign 与数据资产](#阶段-2campaign-与数据资产)
- [阶段 3：直播完整链路](#阶段-3直播完整链路)
- [阶段 4：模型、Agent 与工具](#阶段-4模型agent-与工具)
- [阶段 5：知识与评估](#阶段-5知识与评估)
- [阶段 6：身份、扩展与治理](#阶段-6身份扩展与治理)
- [跨阶段质量门槛](#跨阶段质量门槛)

## 阶段 0：桌面 Core

交付：

- TypeScript Local Core、Electron utility messaging、JSON Envelope 和应用生命周期管理；
- SQLite WAL、Migration、Outbox、Object CAS 和本地 Trace；
- Durable Task Engine、Schedule、Lease、Retry、Checkpoint 和 Worker Supervisor；
- TanStack Router/Query、生成 IPC Client、真实 Bootstrap 和 Activity Stream；
- 删除目标架构对本地 HTTP Server 的依赖。

验收：Core 强杀后 UI 进入可诊断状态并可恢复；任务状态不丢；应用无业务监听端口；完全退出无孤儿进程。

## 阶段 1：账号与监控对象

已交付的首个增量：

- `PlatformAccount`、`Subject`、账号绑定与 `follower.snapshot` 策略的 SQLite v2 Migration；
- 业务状态与 Outbox 原子提交、稳定错误码和语言中立 JSON Schema；
- 5 个窄化 IPC 方法与真实 React Query Projection；
- 账号/对象创建、查询、空态、错误态和本地数据路径状态。

已交付的粉丝监控增量：

- 对照原 `BilibiliFollowerMonitorController/Service/Repository` 实现添加、列表、状态、间隔、刷新、删除、历史和多用户趋势；
- Python `httpx` Worker 采集 `x/web-interface/card`，仅对原项目允许的解析/网络/服务端错误回退 `x/relation/stat`；
- 三次重试、1500ms 最小请求间隔、指数退避、风控不强制回退、失败后 300～900 秒调度退避；
- SQLite v3 保存 Monitor、秒级幂等 Snapshot、CAS Artifact 和每次 API Attempt；
- 7 个粉丝业务 IPC 方法和真实 React Query 页面，覆盖加载、错误、空态、操作中、列表和最多 4 用户趋势。

已交付的 B站扫码登录增量：

- 对照原 `BilibiliAuthController/Service/PassportClient/Repository` 复刻二维码生成、轮询、最低 Cookie 门槛、`nav` 复验和撤销；
- WAITING、SCANNED、EXPIRED、SUCCESS、FAILED 五态及终态幂等缓存；
- 独立 Python Auth Worker 负责 Passport 会话，认证响应不写 Object CAS；
- Electron `safeStorage` 封装本机随机密钥，SQLite v4 只保存 AES-256-GCM 密文并保证唯一 ACTIVE；
- 6 个窄化认证 IPC 方法与真实登录态面板；完整凭据只在用户明确查看时读取，不进入 React Query cache。

已交付的 B站直播间 REST 监控增量：

- 对照原 `BilibiliLiveMonitorController/Service/SnapshotApplicationService/Scheduler`、`BilibiliLiveApiClient` 和 V4 表结构实现；
- 支持按房间号或主播 UID 添加，解析短号/真实房间号，并在 UID 状态接口缺失时按原规则回退旧房间接口；
- 支持列表、暂停、恢复、删除、立即刷新、`1..2592000` 秒采集间隔、最多 30 个到期房间批处理和失败退避；
- SQLite v5 保存房间、秒级幂等快照和 `LIVE_STARTED`、`LIVE_ENDED`、`ROUND_STARTED`、`TITLE_CHANGED`、`ERROR_OCCURRED`、`ERROR_RECOVERED` 事件；
- 11 个窄化 IPC 方法和真实 React Query 页面，覆盖汇总、卡片、状态操作、事件和最多 4 房间趋势。

交付：

- 真人手机扫码成功与应用重启后的手工复验；
- 受控短期 Secret Lease（后续供直播 Worker 使用）；
- PlatformAccount、Subject、绑定和监控策略；
- 扩展 Scrapy 批量采集能力和可离线重放 Parser；
- Arrow/Data Worker 与 Parquet 长期历史（当前历史已由 SQLite v3 可靠保存）。

验收：扫码到粉丝趋势完整跑通；Cookie/API Key 不以明文进入数据库、日志、Outbox、查询缓存或 Git，只有“查看完整登录态”这一明确业务操作允许通过专用 IPC 返回原文；重复时间桶不产生重复快照。

## 阶段 2：Campaign 与数据资产

交付：

- Campaign 向导、SQLite Frontier、种子导入和多引擎路由；
- 分层限频、退避、Manual Review、暂停、取消和恢复；
- 原始证据预览、血缘、受控查询、Parser 影子重放；
- DuckDB 分析、Parquet Compaction 和可恢复导出。

验收：Worker 崩溃和应用重启后恢复；种子精确去重；Parser 重放不访问平台；导出取消不留下伪完整文件。

## 阶段 3：直播完整链路

已交付：

- Node Realtime Worker 的真实弹幕协议、心跳、重连、认证升级和原事件持久化；
- 观众与大航海榜单快照、REST/WebSocket 场次边界和 Coverage；
- 直播场次查询、用户/事件筛选、规则洞察以及 CSV/XLSX/ZIP 导出；
- Subject 对粉丝、直播、弹幕、健康和榜单的聚合工作台。

验收：断网、乱序、迟到事件、系统时钟变化和高频 UI 基准通过；任何连接缺口都反映在 Coverage。

## 阶段 4：模型、Agent 与工具（当前暂停）

只有原 B/S 业务的真人验收与发布打包门槛完成后，才重新评审这一阶段；当前不实现、不展示。

交付：

- Provider 原生 Adapter、模型目录、路由、预算和出站预览；
- llama.cpp Model Worker；
- AgentDefinition/Version、PydanticAI Step Persistence 和 Run Stream；
- Tool Broker、MCP、PathGrant、NetworkGrant、Approval 和 Run 回放；
- 第一个只读直播复盘 Agent。

验收：Agent 生成带 ObjectRef 的报告；文件写入需审批；未决副作用不自动重放；应用重启后可以继续、分叉或人工处理。

## 阶段 5：知识与评估

交付：

- KnowledgeSource、Chunk、LanceDB、FTS/Vector/RRF 和 Evidence Pack；
- shadow rebuild、Tombstone 和增量索引；
- Dataset、Experiment、Evaluator、回归趋势和发布门禁。

验收：索引重建不影响在线查询；删除立即过滤；没有证据的回答明确不足；未通过硬门槛的 Agent 不得发布。

## 阶段 6：身份、扩展与治理

交付：

- Identity Candidate、Evidence、Decision、撤销、拆分和冲突；
- Wasmtime/WASI、AppContainer/受限进程扩展；
- Connector/Tool/Provider/Exporter/UI Panel 安装、签名、权限和回滚；
- 完整审计、风险报告、诊断包、VERIFIED Backup 和应用升级。

验收：扩展越权被阻止；身份关系不被算法自动覆盖；备份在隔离目录恢复；升级失败可返回原版本和原数据。

## 跨阶段质量门槛

- 每个业务切片同时交付 UI、IPC、Domain、Migration、Task、Worker、Trace 和错误态。
- Renderer 无法访问 Node、Secret、数据库、任意 IPC Method 或平台 Profile。
- 所有配置和数据路径经过 `DataDirectory`，不写死机器绝对路径。
- `.env.local` 与运行数据被忽略，`.env.example` 只提供同结构空值。
- 日志、异常、Trace 和诊断包自动脱敏。
- JSON Schema、SQLite Migration、Parquet Schema、Task Version 和插件 API 具备兼容测试。
- 发布包在干净 Windows 用户目录完成安装、启动、托盘、完全退出、升级、恢复和卸载验证。
