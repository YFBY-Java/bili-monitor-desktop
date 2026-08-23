# ADR-0001：Electron + Vue 桌面壳与 Python Local Core

- 状态：Superseded by ADR-0004
- 日期：2026-08-22

## 背景

应用需要复杂桌面工作台、浏览器采集、长期后台任务，以及未来的 AI/Agent 分析。现有 BiliMonitor 前端使用 Vue，浏览器自动化已经证明独立 Playwright worker 是有效边界。

## 决策

采用 Electron Main + sandboxed Vue Renderer 作为桌面壳，采用 Python FastAPI Local Core 承载业务、爬虫和 Agent 能力。两者通过版本化本地 HTTP API 与窄化 IPC 协作。

爬虫网页不加载到应用 Renderer。需要网页交互时，由 Python worker 启动独立 Playwright BrowserContext。

## 结果

收益：

- 保留 Vue/TypeScript 生产力和一致渲染；
- 直接使用 Python 爬虫、数据和 Agent 生态；
- Core 或 worker 崩溃不会直接破坏 UI 进程；
- 后续可替换桌面壳或 Agent 框架而不重写领域层。

代价：

- 安装包与内存占用高于单一原生壳；
- 需要 Node/Python 两套锁定、打包和漏洞更新流程；
- 必须实现可靠的 sidecar 生命周期、认证和诊断。

## 安全约束

- Renderer：`nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。
- 只加载应用本地资源，禁止把平台页面作为带权限的 webview。
- IPC 暴露具体方法并验证 sender 与参数。
- Core 只监听 loopback，并要求每次启动生成的会话令牌。
