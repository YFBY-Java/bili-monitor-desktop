# Local Core Rules

- Local Core 运行在 Electron utilityProcess，不是 HTTP 服务。
- 协议入口只负责校验和转换；应用服务负责流程；Repository 负责数据访问；Domain 保持纯净。
- Core 是 `control.db` 唯一写入者，写入与 Outbox/Event 必须在同一事务。
- Worker 调用必须带任务 ID、尝试号、Lease、超时和取消语义。
- Tool 副作用必须带幂等键；崩溃后不确定状态进入 `UNKNOWN_AFTER_CRASH`。
