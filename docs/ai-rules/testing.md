# Testing Rules

- 新行为先写失败测试并确认失败原因，再实现最小代码。
- Contract、状态机、Repository、错误转换、任务恢复和路径约束必须有单元测试。
- TS/Python 契约使用同一 golden fixtures。
- 爬虫测试使用录制响应和 Parser 回放，不依赖真实平台。
- 集成测试覆盖 Core 启停、SQLite migration、Worker 握手、应用退出和无业务监听端口。
- 完成前运行 `check.cmd`，报告测试数、构建和路径验证结果。
