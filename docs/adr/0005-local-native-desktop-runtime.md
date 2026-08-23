# ADR-0005：无业务服务端的本地原生桌面运行时

- 状态：Superseded by ADR-0006
- 日期：2026-08-22
- 取代：ADR-0004
- 恢复并细化：ADR-0003 的嵌入式数据方向

## 背景

产品目标被进一步明确为“安装后就是一个本地客户端项目，不附带需要用户维护的业务服务端”。ADR-0004 把最大能力上限解释为在本机部署 Temporal、Kafka、PostgreSQL、ClickHouse、Qdrant、WSL2 Appliance 和多个 Gateway 服务，形成了本地私有云式架构。它能够扩展，但不符合桌面客户端的交付、生命周期、诊断和资源模型。

“无服务端”不等于“所有工作必须挤在 Electron 单进程”。爬虫、浏览器、实时连接和 Agent 仍需要故障隔离、独立依赖和崩溃恢复。目标形态应是由桌面应用直接拥有和监督的本地多进程系统，进程之间使用操作系统 IPC，不开放业务 HTTP 端口，不要求常驻数据库或容器集群。

## 方案比较

| 方案 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| Electron 单进程 | 分发最简单 | 浏览器、Python、实时协议、模型和数据写入互相影响，崩溃域过大 | 不采用 |
| 本地服务集群 | 分布式扩展和服务生态完整 | 安装、资源、升级和诊断不再像客户端 | 取代 ADR-0004 |
| 桌面壳 + 本地 Core + 隔离 Worker | 无服务端，同时保留运行时隔离和高能力上限 | 需要维护 IPC、Worker 协议和嵌入式数据一致性 | **采用** |

## 决策

采用以下目标架构：

- Electron Main + sandboxed React 19 Renderer。
- Rust `bmd-core.exe` 作为本地核心 Sidecar，由 Electron 启动、监督和关闭。
- Renderer 只通过窄化 Preload API 与 Electron Main 通信。
- Electron Main 与 Rust Core 使用 Windows Named Pipe；请求和事件使用长度前缀 Protobuf Frame。
- 普通请求使用 request/response；持续事件通过 Electron `MessagePort` 转发到 Renderer。
- Rust Core 拥有领域状态、任务调度、审批、权限、Secret、Object CAS、Worker 生命周期和数据入口。
- Python Scrapy Worker、Node Playwright Worker、Rust Realtime Worker、Python Agent Worker 和 Rust Data Worker 为按需子进程。
- Worker 由 Rust Core 放入 Windows Job Object；Core 退出时不会遗留孤儿进程。
- 不运行本地 HTTP Gateway、业务 API Server、Temporal、Kafka、PostgreSQL、ClickHouse、Qdrant、容器编排或强制 WSL2。

### 数据选择

- SQLite WAL 保存事务状态、任务、投影、审批、配置和对象元数据；Rust Core 是唯一写入者。
- Arrow Batch + 分区 Parquet 保存高频采集和直播事实。
- DuckDB 由单一 Rust Data Worker 持有，用于分析、导出和压实，不允许多个进程同时写同一数据库。
- LanceDB 保存本地向量和全文派生索引，索引可由权威来源重建。
- 本地 Object CAS 保存原始响应、截图、WARC/HAR、导出和 Agent Artifact。
- Windows Credential Manager/DPAPI 保存 Cookie、Token 和 API Key；SQLite 只保存 SecretRef。

### 任务和 Agent

- Rust Core 内置 SQLite 驱动的 Durable Task Engine，负责 Campaign、采集、索引、导出、备份、升级和人工审批。
- PydanticAI 是默认 Agent Runtime；使用 SQLite Step Persistence 保存 Agent 内部步骤、恢复点和未决 Tool Effect。
- Core 拥有 Agent Run 生命周期和 Tool 权限；框架快照只是实现细节，不能成为 UI 契约。
- LangGraph 只作为明确需要图状态和时间旅行的可选 Adapter。
- 远程模型使用 Provider 原生 Adapter；本地默认使用 llama.cpp Worker。vLLM/SGLang/WSL2 仅作为用户主动启用的可选计算后端。

### 插件和工具

- 首版原生 Connector、Browser、Realtime 和 Agent Worker 随应用签名发布。
- 纯 Parser、Exporter 和无系统依赖 Tool 优先使用 Wasmtime/WASI Component，按能力授予文件、时钟和随机数。
- 需要浏览器或复杂依赖的扩展使用独立进程；第三方进程使用 Windows AppContainer 和 Job Object，内置签名 Worker 使用 Job Object。无法在 AppContainer 中运行的第三方扩展只允许进入醒目的开发信任模式。
- MCP 通过 stdio 或用户显式配置的远程 Transport 接入；所有 Tool Call 仍经过 Core Policy/Approval。

## “无服务端”的精确定义

- 安装后不要求用户安装或管理数据库、消息队列、容器、WSL2 或系统服务。
- 应用不监听可被浏览器或局域网访问的业务端口。
- 关闭窗口可按设置继续驻留托盘；用户选择完全退出时停止所有 Worker 并保存 Checkpoint。
- 应用完全退出后不执行定时任务；下次启动按 schedule 的 catch-up policy 处理错过窗口。
- 可选本地模型、远程 MCP 或 WSL2 GPU 后端是插件能力，不是应用启动前提。

## 状态所有权

- SQLite `control.db`：业务事务、任务和 UI 投影。
- Rust Core：运行中的调度、权限判定和 Worker Lease。
- Agent Worker `agent-runs.db`：PydanticAI 内部快照；Core 保存稳定 Run Projection。
- Parquet：不可变高频事实。
- DuckDB：查询目录、缓存和派生聚合，不是业务事务库。
- LanceDB：可重建知识索引。
- Object CAS：不可变原始证据和 Artifact。
- Secret Vault：秘密明文。

## 结果

收益：

- 保持真正桌面客户端的安装、启动、退出、备份和升级体验。
- 不牺牲 Scrapy、Playwright、Rust 实时采集和 PydanticAI 的生态能力。
- 浏览器、模型和 Agent 崩溃不会拖垮 UI 或核心数据。
- 数据层与单机并发模型匹配，不需要在用户机器上维护服务集群。
- 未来仍可通过 Worker Adapter 连接远程计算，但不会污染本地核心契约。

代价：

- 必须实现可靠的 Named Pipe/Protobuf IPC、单写者数据路径和 Worker Supervisor。
- 本地完全退出时不再持续采集，这是客户端形态的明确行为而不是故障。
- 超出单机资源上限时需要显式启用远程 Worker，而不是透明扩成集群。

## 设计依据

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [DuckDB Concurrency](https://duckdb.org/docs/current/connect/concurrency)
- [DuckDB Parquet](https://duckdb.org/docs/lts/data/parquet/overview)
- [PydanticAI Step Persistence](https://pydantic.dev/docs/ai/harness/step-persistence/)
- [Wasmtime](https://docs.wasmtime.dev/)
