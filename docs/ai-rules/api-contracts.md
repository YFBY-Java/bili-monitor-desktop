# Contract Rules

- `packages/contracts` 是 TypeScript 契约入口，`schemas/` 保存语言无关 JSON Schema。
- Renderer 禁止手写 Core 响应类型；Python 使用同一 Schema 生成或验证 Pydantic 模型。
- Envelope 必须包含 `id`、`type`、`version`、`timestamp`、`correlationId`、`traceId` 和 `payload`。
- 日期使用 ISO 8601，精度敏感数字使用字符串或整数，大对象只传 ObjectRef。
- 契约版本只追加兼容字段；破坏性变化发布新版本并保留兼容测试。
