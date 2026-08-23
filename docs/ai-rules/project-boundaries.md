# Project Boundaries

- Electron Main 只负责 OS 集成、安全和 Local Core 生命周期。
- React Renderer 只展示投影并发出类型化 Command/Query。
- TypeScript Local Core 独占领域状态、SQLite、任务、权限、审计和 Worker 监督。
- Python/Node Worker 独立进程运行；控制消息使用 NDJSON/MessagePort，大对象使用 ObjectRef。
- 禁止 FastAPI、Express、Temporal、Kafka、PostgreSQL、Qdrant 等本地服务作为运行前提。
- 平台网页只允许在隔离 Playwright Worker 中打开，不能进入特权 Renderer。
- 第三方预编译运行时可以使用，但项目不能下载源代码现场编译原生扩展。
