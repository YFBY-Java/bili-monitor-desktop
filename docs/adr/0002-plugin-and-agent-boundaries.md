# ADR-0002：能力插件与框架无关 Agent 端口

- 状态：Accepted
- 日期：2026-08-22

## 背景

平台能力差异很大，单个不断扩张的基类会产生大量“不支持”方法。AI 编排框架变化更快，直接把其对象和持久化格式渗透到业务层会形成长期锁定。

## 决策

平台扩展按独立 capability 注册，例如 `account.profile`、`live.status` 和 `auth.web_qr`。连接器返回统一的 `FetchEnvelope`，其中显式表达游标、限频、错误、风险、原始对象和 checkpoint。

Agent 层由 `ModelProvider`、`ToolRegistry`、`AgentDefinition`、`AgentRuntime`、`AgentRunStore` 和 `PolicyEngine` 组成。PydanticAI 是首个实现适配器，但不得成为 HTTP 契约或业务持久化格式。

插件必须提供版本化 manifest、配置 schema 和工厂入口。首版只加载随应用发布且在 allowlist 中的插件。

## 结果

- 新平台只实现自己声明的能力；
- Agent 可以复用 Connector 和查询能力，但只能通过受权限控制的工具；
- 框架替换和复杂 workflow 的后续引入不会改变已有业务 API；
- 暂不支持任意第三方 Python 包的动态执行。
