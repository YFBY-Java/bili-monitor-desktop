# 本地原生实施路线图

> 当前路线以 [当前运行时蓝图](architecture/typescript-python-local-runtime.md)、[本地原生业务与技术实现规格](architecture/local-native-business-implementation.md) 和 [ADR-0006](adr/0006-typescript-python-local-runtime.md) 为准。

当前进度（2026-08-23）：阶段 0 的本地运行骨架已可运行；阶段 1 已完成首个“账号、Subject、绑定与监控策略”纵切。Windows Secret、扫码认证、在线 Connector、CAS 和粉丝快照仍待实现，不能视为阶段 1 已验收。

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

交付：

- Windows Secret Vault 和短期 Secret Lease；
- B站 Playwright 扫码、登录态验证、续期和撤销；
- PlatformAccount、Subject、绑定和监控策略；
- Scrapy Worker、Bilibili Connector、CAS 原始响应和 Parser；
- Arrow/Data Worker、粉丝当前投影和 Parquet 历史。

验收：扫码到粉丝趋势完整跑通；Cookie/API Key 不进入数据库、日志、IPC 事件或 Git；重复时间桶不产生重复快照。

## 阶段 2：Campaign 与数据资产

交付：

- Campaign 向导、SQLite Frontier、种子导入和多引擎路由；
- 分层限频、退避、Manual Review、暂停、取消和恢复；
- 原始证据预览、血缘、受控查询、Parser 影子重放；
- DuckDB 分析、Parquet Compaction 和可恢复导出。

验收：Worker 崩溃和应用重启后恢复；种子精确去重；Parser 重放不访问平台；导出取消不留下伪完整文件。

## 阶段 3：直播完整链路

交付：

- 直播状态 Snapshot、Node Realtime Worker、心跳和重连；
- Arrow Batch、分区 Parquet、DuckDB 聚合和现场 MessagePort；
- 榜单快照、场次 Revision、Coverage 和人工边界修正；
- 直播场次查询与 CSV/XLSX/Parquet 导出。

验收：断网、乱序、迟到事件、系统时钟变化和高频 UI 基准通过；任何连接缺口都反映在 Coverage。

## 阶段 4：模型、Agent 与工具

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
