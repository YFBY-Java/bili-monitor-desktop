# TypeScript Rules

- 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- 外部输入先由 Zod/JSON Schema 校验。
- 禁止随意使用 `any`、`unknown as T`、`@ts-ignore` 或静默 catch。
- 领域模块不依赖 Electron、SQLite、Playwright 或模型 SDK。
- 异步调用必须 `await`、返回 Promise 或显式处理；长期队列必须有界并支持背压。
