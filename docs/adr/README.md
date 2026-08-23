# Architecture Decision Records

## 目录

- [状态定义](#状态定义)
- [决策列表](#决策列表)

## 状态定义

- `Accepted`：当前实现必须遵守。
- `Proposed`：需要原型或新证据后确认。
- `Superseded`：已被后续 ADR 替代，原记录保留。

## 决策列表

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| [0001](0001-electron-and-python.md) | Electron + Vue 桌面壳与 Python Local Core | Superseded by 0004 |
| [0002](0002-plugin-and-agent-boundaries.md) | 能力插件与框架无关 Agent 端口 | Accepted |
| [0003](0003-local-data-strategy.md) | SQLite 事务库、内容寻址原始存储、按需 DuckDB | Superseded by 0004；方向由 0005 恢复并细化 |
| [0004](0004-local-capability-platform.md) | 本地能力平台、React 工作台与多运行时执行面 | Superseded by 0005 |
| [0005](0005-local-native-desktop-runtime.md) | 无业务服务端的本地原生桌面运行时（Rust 方案） | Superseded by 0006 |
| [0006](0006-typescript-python-local-runtime.md) | TypeScript/Python/Node 本地桌面运行时 | Accepted |
