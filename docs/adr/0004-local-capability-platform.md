# ADR-0004：本地能力平台、React 工作台与多运行时执行面

- 状态：Superseded by ADR-0005
- 日期：2026-08-22
- 取代：ADR-0001、ADR-0003

## 背景

项目目标已经从轻量单机采集器提高为不考虑开发和重复实现成本、优先追求爬虫、AI、Agent 与本地数据处理能力上限的桌面平台。Vue + FastAPI 单 Core + SQLite/DuckDB 方案能够完成早期垂直切片，但无法同时提供持久化工作流、高吞吐实时事件、多模型推理、完整证据留档和未来多机 Worker 扩展。

本地 BiliMonitor 已经证明浏览器登录 Worker 与业务数据库隔离、凭据 Key 稳定、采集任务可追踪和直播场次语义是必要边界。

## 决策

采用以下目标架构：

- Electron Main + sandboxed React 19 Renderer。
- Windows Host 上运行 Go `nexusd` 控制面。
- WSL2 中运行本地 Bili AI Appliance。
- Protobuf + Buf 为唯一跨语言契约。
- ConnectRPC/gRPC 负责同步调用，AG-UI/SSE 和 WebSocket 负责 UI 实时流。
- Temporal 负责 Campaign、Agent、索引、导出、备份和升级工作流。
- Kafka API 负责高吞吐事实事件。
- PostgreSQL 保存事务权威状态，ClickHouse 保存高频分析事实，Qdrant 保存可重建检索索引，本地 Object CAS 保存原始证据和 Artifact。
- Scrapy、Crawlee + Playwright、Rust Tokio 分别负责 HTTP、浏览器和实时采集。
- PydanticAI + Temporal 为默认 Agent Runtime；LangGraph 作为显式图式 Runtime。
- LiteLLM + Provider Native Adapter 统一远程模型，本地模型由 vLLM/SGLang/llama.cpp 提供。
- Tool Broker + MCP + Policy Engine + Temporal Approval Signal 管理 Agent 工具。
- 第三方代码使用 OCI + gVisor 隔离。

桌面 Renderer 只访问 `nexusd`。WSL2 数据服务和 Worker 不向 Renderer 或局域网直接暴露。

## 状态所有权

- Temporal 只拥有工作流内部历史。
- PostgreSQL 拥有应用事务状态和 UI 投影。
- Kafka 拥有可重放事实流，不拥有 Command 状态机。
- ClickHouse 是分析事实库，不是业务写模型。
- Qdrant 是可重建派生索引。
- Object CAS 拥有不可变大对象。
- Secret Vault 拥有凭据明文；数据库只保存引用。

## 结果

收益：

- Campaign 和 Agent Run 能跨进程、桌面退出和 Worker 崩溃恢复。
- 浏览器采集、实时弹幕、Parser 和 Agent 可以独立扩展运行时。
- 原始证据、高频事件、事务实体和语义索引不再争用同一数据库。
- 本地默认部署与未来远程 Worker 使用相同契约、Task Queue 和 Topic。
- UI 可以完整展示 Trace、审批、证据和恢复状态。

代价：

- 本地服务数量、资源占用、安装、迁移和诊断复杂度显著提高。
- 需要维护 Go、TypeScript、Python、Rust 和容器供应链。
- 必须建立严格的 Schema 兼容、事件幂等、备份恢复和 Worker 版本策略。

这些代价与当前“最大能力上限”的明确目标一致。

## UI 约束

业务页面和功能范围由以下文件共同定义：

- `docs/ui/initial-ui-design.md`
- `docs/architecture/initial-functional-implementation.md`
- `apps/desktop/src/renderer/src/product-model.ts`

生产 UI 不得通过直接查询 Temporal/Kafka/数据库绕过应用服务边界。
