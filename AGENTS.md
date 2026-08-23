# BiliMonitor Desktop Rules

本文件是项目规则入口。详细规则位于 `docs/ai-rules/`，按任务读取。

## 必须遵守

- 默认使用中文沟通。
- 项目实现语言只使用 TypeScript、Python、PowerShell、SQL 和声明式配置；禁止新增 C、C++、Rust 源码和对应编译工具链。
- 应用是本地桌面客户端：禁止新增业务 HTTP Server、固定监听端口、容器或常驻外部数据库。
- 所有项目工具、缓存、临时文件、浏览器、模型、构建产物和运行数据必须位于 D 盘；运行命令前先加载 `scripts/activate-environment.ps1`。
- Frontend and backend must share API contracts. Request/response schemas and inferred types must live in a shared contract layer. Frontend code must not hand-write backend response types.
- Renderer 不能访问 Node、数据库、Secret、Browser Profile 或任意 IPC；只能使用窄化 Preload API。
- `control.db` 只允许 TypeScript Local Core 写入。Worker 通过契约通信，不直接打开控制数据库。
- 行为变更先写失败测试，再实现；完成前运行 `check.cmd`。
- 不回滚或覆盖用户已有改动，不提交密钥、Cookie、Token、二维码或真实 Profile。

## 规则路由

- 工程、依赖、脚本和 D 盘路径：`docs/ai-rules/engineering.md`
- 架构与进程边界：`docs/ai-rules/project-boundaries.md`
- TypeScript：`docs/ai-rules/typescript.md`
- Python Worker：`docs/ai-rules/python.md`
- IPC/Worker 契约：`docs/ai-rules/api-contracts.md`
- UI：`docs/ai-rules/frontend.md`、`docs/ai-rules/admin-ui.md`
- Local Core：`docs/ai-rules/backend.md`
- SQLite/Parquet/CAS：`docs/ai-rules/database.md`
- 错误、日志与测试：`docs/ai-rules/errors.md`、`logging.md`、`testing.md`

## 完成标准

- 相关测试、类型检查、Lint、构建通过。
- 新契约同时有 TypeScript 和 Python 校验样例。
- 无业务监听端口、无孤儿 Worker、无 C 盘项目路径。
- `CLAUDE.md` 仍只包含 `@AGENTS.md`。
