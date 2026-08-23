# ADR-0006：TypeScript/Python/Node 本地桌面运行时

- 状态：Accepted
- 日期：2026-08-23
- 取代：ADR-0005 的 Rust Core、Named Pipe 与 Protobuf 实现

## 背景

产品仍然要求本地优先、无业务服务端、高能力上限和隔离 Worker，但项目维护者明确不采用 C、C++、Rust 源码或对应编译工具链。技术成本与重复开发成本不是约束，代码可理解性、AI/Agent/爬虫生态上限和长期可替换边界优先。

## 决策

- Electron 43 + React 19 + TypeScript 作为桌面壳和工作台。
- Local Core 使用 TypeScript，运行在 Electron `utilityProcess`；Main 只持有窗口、系统权限和窄化 IPC。
- Local Core 独占 SQLite `control.db`，使用 WAL、版本迁移、Durable Task、Approval 和 Outbox。
- Main/Core 使用 Electron structured clone messaging；Core/Worker 使用版本化 NDJSON stdio。应用不监听业务 HTTP/TCP 端口。
- TypeScript 通过 Zod、Python 通过 Pydantic 校验同一 JSON Schema；稳定 UI DTO 不暴露框架内部对象。
- Scrapy/httpx 负责 HTTP 采集，Crawlee/Playwright 负责登录和浏览器采集，Node WebSocket Worker 负责直播实时协议。
- PydanticAI 为默认 Agent Runtime，LangGraph 为复杂图状态/恢复适配器，Pydantic Evals 为评估层，MCP 只经 Tool Broker 接入。
- DuckDB + PyArrow + Parquet 负责单机分析和高频事实；SQLite 仍是控制面唯一事务源。
- 仓库实现语言限定为 TypeScript、Python、PowerShell、SQL 与声明式配置。第三方预编译运行时允许使用，但项目不构建原生源码。

## 路径与交付

- Node、pnpm、包缓存、Electron 缓存、Playwright 浏览器、Python venv、pip 缓存、模型缓存、临时文件和运行数据全部位于仓库 D 盘目录。
- 可复用的基础 Python 解释器允许来自 E 盘；门禁拒绝 C 盘 Python base runtime 和 C 盘 `BMD_DATA_DIR`。
- 开发和打包均通过 `bootstrap.cmd`、`dev.cmd`、`check.cmd`、`build.cmd`，不依赖全局 PATH。

## 结果

项目保留多进程隔离、持久任务、强契约和完整 Agent/爬虫生态，同时去掉本地服务集群与原生编译工具链。代价是 Local Core 依赖 Electron 生命周期，CPU 密集和不可信工作必须继续下沉到受监督 Worker。
