# TypeScript / Python 本地运行时蓝图

## 运行拓扑

```mermaid
flowchart LR
  UI[React Renderer] -->|narrow preload IPC| MAIN[Electron Main]
  MAIN -->|utility messaging| CORE[TypeScript Local Core]
  CORE --> SQLITE[(SQLite WAL)]
  CORE -->|NDJSON stdio| PY[Python HTTP / OAuth Worker]
  CORE -->|NDJSON stdio| BROWSER[Node Playwright Auth Worker]
  CORE -->|NDJSON stdio| REALTIME[Node WebSocket Worker]
  PY --> PARQUET[Arrow / Parquet / DuckDB]
  CORE --> CAS[Object CAS]
```

应用完全本地运行，不包含用户需要维护的后端、数据库服务、消息队列、容器或业务监听端口。Main、Core、Worker 都由桌面应用启动和退出。

## 责任边界

| 模块 | 当前落点 | 责任 |
| --- | --- | --- |
| Renderer | `apps/desktop/src/renderer` | 页面、交互、ViewModel；无 Node/数据库/Secret 权限 |
| Main | `apps/desktop/src/main/index.ts` | 窗口、安全策略、系统 IPC、Local Core 生命周期 |
| Local Core | `packages/core-runtime` + `core-process.ts` | 状态所有权、任务、审批、Worker 监督和稳定投影 |
| Control DB | `packages/storage` | SQLite WAL、迁移、任务/事件/审批/Outbox |
| Task Engine | `packages/task-engine` | 显式状态机、Attempt、Retry、Approval、恢复 |
| Contracts | `packages/contracts` | JSON Schema、Zod DTO、消息元数据和版本 |
| Python Worker | `workers/python` | B站 HTTP 接口与抖音 OAuth；当前不承担 Agent 业务 |
| Browser Worker | `workers/node-browser` | Playwright Web 登录、完整会话捕获与全新 Context 复验 |
| Realtime Worker | `workers/node-realtime` | WebSocket、心跳、重连、乱序缓冲 |

## 消息协议

每条消息必须包含 `id`、`type`、`version`、`timestamp`、`correlationId`、`traceId` 和 `payload`；派生消息增加 `causationId`。Local Core 对 Electron 使用 structured clone，对 Worker 使用一行一个 JSON Envelope 的 stdio。大对象只传 `ObjectRef`，不穿过 IPC 复制二进制。

协议演进遵循：新增可选字段向后兼容；删除/改义必须提升 schema 版本；UI 只消费稳定 Projection；PydanticAI、LangGraph、Crawlee 内部状态不能成为公共契约。

## 数据分层

- `control.db`：账号引用、Subject、Campaign、Task、Approval、Outbox、UI Projection。
- Object CAS：原始 HTTP、WARC/HAR、截图、导出与 Agent Artifact。
- Arrow/Parquet：直播弹幕、指标快照和其他高频不可变事实。
- DuckDB：查询、压实、导出和派生聚合，不拥有业务事务。
- 向量/全文索引：属于可重建派生数据，后续由 Knowledge Worker 实现。
- Secret：B站登录凭据使用 Electron `safeStorage` 封装本机随机密钥，数据库只保存 AES-256-GCM 密文；后续其他 Secret 也必须通过同一窄化边界接入。

## 当前范围约束

当前阶段只复刻原 BiliMonitor 已形成闭环的业务。AI、Agent、通用采集任务和平台扩展均不进入导航，也不作为本轮完成项；预留的进程与表结构不等于产品功能。

## 当前采集体系

- B站公开/认证接口使用 Python httpx；抖音浏览器登录与截图使用 Node Playwright。
- 直播长连接独立放入 Realtime Worker，不与 UI 或 HTTP Crawler 共用崩溃域。
- Frontier、限频、账号 Lease、重试和证据引用由 Core 持久化；Worker 只执行有界任务。
- 浏览器 Worker 默认只允许公共 HTTPS 目标，Profile、浏览器和缓存都在 D 盘数据目录。
- Parser 对保存的原始证据可离线重放，避免调试时重复访问平台。

## 当前实现进度

基础运行时已实现桌面 UI、D 盘环境、TypeScript Local Core、SQLite WAL、Durable Task 状态机、跨语言 Envelope、Python Worker、Crawlee/Playwright Worker、Realtime Worker 和完整质量脚本。

当前已落地原项目的 B站用户工作台、粉丝监控、扫码认证、直播间 REST、WebSocket 弹幕、榜单、场次、事实查询、洞察与导出，以及抖音本人 Web/OAuth 登录态。SQLite schema 为 v11；Python 负责 HTTP/OAuth，Node Worker 负责 B站实时连接和抖音 Playwright，TypeScript Core 独占业务状态与数据库。Electron `safeStorage` 只在 Main 中封装 32 字节本机密钥，Core 使用 AES-256-GCM 加密 B站与抖音凭据；Renderer 仅在用户明确查看时经窄化 IPC 获取原文。

所有 Worker 都通过 `NDJSON stdio` 通信，不开放业务端口。只有非认证采集原始响应进入 SHA-256 Object CAS；Cookie、CSRF、Token 和浏览器存储不进入 CAS、日志或 Outbox。自动测试与公开接口 smoke 之外，B站真人扫码和抖音真人扫码/官方授权仍需人工完成，文档不得把它们标记为已验收。
