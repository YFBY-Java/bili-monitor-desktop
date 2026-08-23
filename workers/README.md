# Worker 运行时

- `python/`：Python 3.11+ 的 Agent、Scrapy HTTP 采集与 DuckDB/PyArrow 数据 Worker；统一使用版本化 NDJSON stdio 契约。
- `node-browser/`：Crawlee + Playwright 浏览器 Worker，浏览器二进制和 Profile 固定到 D 盘数据目录。
- `node-realtime/`：Node WebSocket 实时采集 Worker，提供心跳、退避重连与可取消生命周期。

Worker 由 Local Core 启动和监督，不监听业务 HTTP 端口，不直接打开 `control.db`，也不能绕过 Tool/Approval 策略。跨语言消息必须遵循 `packages/contracts/schemas/` 的 JSON Schema。
