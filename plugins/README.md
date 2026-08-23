# 插件契约

## 目录

- [原则](#原则)
- [插件类型](#插件类型)
- [Manifest](#manifest)
- [加载规则](#加载规则)

## 原则

插件用于隔离平台、模型和导出实现，不等于允许执行任意第三方代码。首版插件与主应用一同构建、签名并进入 allowlist。

Core 只依赖插件公开端口。插件不得直接访问 UI、修改其他插件数据、读取未授权秘密或创建绕过统一网络策略的客户端。

插件不以本地 HTTP 服务运行。纯 TypeScript/Python Parser、Exporter 和 Tool 通过显式能力清单加载；需要浏览器或复杂依赖的能力运行在 Core 管理的受限子进程中，并通过 Electron utility messaging 或 stdio Host API 通信。

## 插件类型

- `platform.connector`：平台采集与认证能力。
- `parser`：从 ObjectRef 解析版本化结构化记录。
- `agent.toolset`：提供受权限控制的 Agent 工具。
- `model.provider`：模型发现、请求、流式事件和用量。
- `exporter`：导出为 CSV、JSONL、Parquet 或报告。
- `ui.panel`：签名的本地沙箱 UI Panel，只能访问授权 ViewModel。

## Manifest

每个插件目录包含 `plugin.toml`，至少声明：

```toml
id = "builtin.bilibili"
name = "Bilibili Connector"
version = "0.1.0"
api_version = "1"
type = "platform.connector"
runtime = "python-process"
entrypoint = "bmd_bilibili:create_plugin"
capabilities = ["account.profile", "live.status"]
config_schema = "config.schema.json"
```

配置 schema 使用 JSON Schema。Core 校验 manifest、API 版本、entrypoint allowlist 和配置后才创建插件。

## 加载规则

1. 读取应用内置插件索引，不递归扫描用户目录。
2. 校验 manifest schema、唯一 ID、SemVer 和 Core API 兼容性。
3. 校验插件来源和发行包哈希。
4. 根据 runtime 使用 Wasmtime 或 AppContainer 进程启动，并分配 Job Object；内置签名 Worker 可使用普通子进程加 Job Object。
5. 为插件注入受权限控制的 Network Broker、Secret Lease、ObjectRef 和日志端口。
6. 注册 capability；冲突时拒绝启动并给出诊断。

第三方插件开放前必须具备签名、SBOM、权限声明、依赖隔离、Contract Probe、升级回滚和恶意代码威胁模型。插件永远不能直接打开 `control.db`、Vault、其他插件目录或 Electron Renderer。
