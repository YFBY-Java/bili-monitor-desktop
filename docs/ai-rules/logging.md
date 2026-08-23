# Logging Rules

- 使用结构化日志，字段包含 event、traceId、correlationId、资源 ID、耗时和结果。
- Cookie、Token、Key、二维码、认证头、完整 Prompt 和绝对敏感路径必须脱敏。
- stdout 为 Worker 协议通道时，日志只能写 stderr。
- 权限、凭据、数据删除、导出、插件安装和 Tool Effect 必须写持久审计事件。
