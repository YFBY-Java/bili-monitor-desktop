# Error Rules

- 错误使用稳定大写代码、分类、`retryable`、用户动作和 correlationId。
- 认证失效、限频、验证码、协议漂移、Worker 崩溃、模型不可用和存储压力必须区分。
- 禁止通过错误文案做逻辑分支，禁止向 UI 返回堆栈、SQL、Token 或第三方原始敏感响应。
- 禁止 catch 后静默失败；可预期错误转为 AppError，未知错误记录并安全呈现。
