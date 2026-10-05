# 直播存储开关与依赖门控 Implementation Plan

> **For agentic workers:** 在当前会话逐项执行 test-driven-development，再用 verification-before-completion 验证；保留既有未提交增量，不自动提交或推送。

**Goal:** 按原 B/S 的组件开关语义迁移 storageEnabled，关闭时不创建或调用直播持久化业务，不删除已有数据；关联工作台配置必须显式一致。

**Architecture:** 扩展已有只读直播配置；增加原 subject-monitor.enabled 的独立启动配置。Core 在打开 SQLite 前验证依赖，再按开关创建服务、注册认证联动和调度。被关闭的方法返回稳定的禁用错误，不用空成功数据冒充可用。Renderer 继续走既有窄化 IPC，Main 安全传递已知启动错误。

**Tech Stack:** TypeScript、Zod、SQLite、Vitest、JSON Schema 与 Python pytest；不新增服务端或依赖。

**Readability:** 新增实现只用 TypeScript、声明式 JSON 和 Python 测试，不引入 C/C++/Rust。

## Global Constraints

- 原 B/S `D:\codex_work\BiliMonitor` HEAD fa2faa6 只读，不启动；客户端 HEAD b2e5a89，保留 Rank/弹幕 HTTP 未提交改动。
- 所有运行命令先加载 scripts/activate-environment.ps1；测试数据库、工具、临时与产物均 D 盘；不访问用户数据库或真实平台。
- 一次启动内配置不可动态切换，修改后重启读取；禁用不清空数据库、不改监控启用位/历史/绑定/场次/导出序号。
- enabled=false 仍只关闭自动 REST；storageEnabled=false 关闭直播整个持久化业务，不能混用。
- 全量 M01–M18 目标保留；本项不等于完整弹幕/榜单/工作台或真人/原生验收。

## 原源码证据与适配

以 social-data-monitor/backend/src/main/java/com/socialmonitor 为根：

- bilibili/live/config/BilibiliLiveMonitorProperties.java：storageEnabled 默认 true；application.yml 原别名 SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED。
- live 下 Monitor/Danmaku/Rank/Session/Export/Insight 的 Controller、Service、Repository 都按 storage-enabled 条件创建；Rank 另要求 rank.enabled。REST Scheduler 还要求 enabled；Danmaku Scheduler 和 CredentialActivatedListener 依赖 storage-enabled。
- subject/service/SubjectService.java、SubjectWorkbenchService.java：受 app.subject-monitor.enabled 控制（缺省 true），构造器必须注入 LiveService/Repository。原测试 SocialDataMonitorApplicationTests 在关 live storage 时同时关闭 subject-monitor；并不存在默认保留半功能工作台的降级逻辑。
- 本地适配：config/bilibili-live-collection.json 新增 storageEnabled；config/subject-monitor.json 使用 {"enabled":false}。工作台未关却关闭存储属于无效依赖，启动前失败，不能默默关闭工作台。
- subject 环境名 APP_SUBJECTMONITOR_ENABLED 按 [Spring 官方环境变量映射](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding.environment-variables) 由 app.subject-monitor.enabled 推导；不凭空新增 SOCIAL_MONITOR 别名。只支持严格布尔配置；完整 Spring 宽松绑定域仍单列未完成。
- 本地 API 资料已检索 docs/live/message_stream.md：本项是原应用组件配置，不修改平台协议，不以该资料替代当前网络实测。

## Task 1：配置及共享契约

Files: 修改 packages/contracts/src/bilibili-live-configuration.ts、schemas/bilibili-live-collection-configuration.v1.schema.json、fixtures/live-collection-configuration.json；新增 src/subject-monitor-configuration.ts 及 portable schema/fixture；修改 packages/core-runtime/src/bilibili-live-collection-config.ts，新增 subject-monitor-config.ts；对应 TS/Python 测试。

Interfaces: SubjectMonitorConfigurationSchema → {enabled:boolean}（缺省 true）；loadSubjectMonitorConfiguration(dataDirectory, environment) → Promise<SubjectMonitorConfiguration>。startupConfigurationErrorMessage(code:string|undefined) → string|undefined，为 Main 的已知启动错误提供固定消息。

- [x] 先改现有 shared fixture，确认 storageEnabled=false 在 TS/Python 都被旧契约拒绝；补默认 true、false/env 优先、null/string/unknown 拒绝。
- [x] 补 Core 真实入口测试：subject-monitor.json/环境开关此前被忽略；先观察错误行为，再实现只读 loader（BOM、ENOENT 默认、其他 IO/JSON 错误拒绝，env 不遮盖坏文件）。独立 loader 与 subject 共享 fixture 属于后续补覆盖，不将每项都描述成先 RED。
- [x] 验证 `. .\scripts\activate-environment.ps1; & $env:BMD_PNPM_CMD --filter @bmd/contracts test`、`& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_live_collection_configuration.py workers/python/tests/test_subject_monitor_configuration.py`。

```ts
expect(BilibiliLiveCollectionConfigurationSchema.parse({ storageEnabled: false })).toMatchObject({ storageEnabled: false, enabled: true })
await expect(LocalCoreRuntime.start(options)).rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID" })
await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
```

## Task 2：服务、调度、历史与工作台门控

Files: packages/core-runtime/src/local-core-runtime.ts；新 bilibili-live-storage-configuration.test.ts。

Interfaces: 原公开业务方法签名不变；关闭直播时所有对应方法抛 CoreApplicationError("BILIBILI_LIVE_STORAGE_DISABLED", fixedMessage)，工作台方法使用 SUBJECT_MONITOR_DISABLED。可选内部服务只用于模块装配，不能返回假空数据。

- [x] RED 后覆盖：真实入口先复现开关被忽略，随后逐方法验证24个直播及9个工作台方法按开关拒绝，包括直播增删改查/历史/汇总、弹幕、Rank、场次/用户/事件/分析/导出。
- [x] RED 后覆盖：先复现关闭后仍执行直播扫描，再验证无调度/认证升级，粉丝、登录、抖音和 Core 仍可用；enabled=false 与 storageEnabled=false 分别测试。
- [x] GREEN：打开数据库前校验跨模块依赖，storage=false 不创建直播各服务/Worker 源；关闭工作台不创建其服务；stop 使用可选实例清理，不能调用禁用方法。
- [x] 补覆盖：启用→禁用→重新启用保留真实 SQLite 记录、关联、孤儿连接及导出序号；禁用跨4小时不运行启动恢复或写直播表。配置文件和原 env 另有两条门控回归。该保留测试首次通过，不冒充新增 RED/GREEN。
- [x] 验证 `& $env:BMD_PNPM_CMD --filter @bmd/core-runtime test`，保留原 live config/auth/停止/场次回归。

```ts
await expect(Promise.resolve().then(() => core.listBilibiliLiveRooms())).rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DISABLED" })
await vi.advanceTimersByTimeAsync(10_000)
expect(liveCalls).toEqual([])
expect(core.listBilibiliFollowerMonitors().items).toHaveLength(1)
```

## Task 3：实际消息入口、收尾及记录

Files: apps/desktop/src/main/core-process.ts、core-client.ts、core-startup-configuration.test.ts；README、full-migration-tracker、新 storage audit。

- [x] RED：真实 Core entry + host 的依赖/工作台配置错误此前被丢失或输出堆栈；修正后可读、安全、失败时不建库，修改配置可重启。
- [x] GREEN：共享固定启动错误映射；正常启动后 RPC 保留禁用业务错误，禁用模块不被 Controller 重启或改成成功空结果。
- [x] 独立只读复核关闭边界、入口遗漏与历史数据保留，无 Critical/Important；Minor 宿主环境污染已复现并修正，补独立环境覆盖/文件不变测试。不将合成进程当原生 Electron 验收。
- [x] 最终完整 check.cmd 退出0：Node893/Python308，类型/构建/格式/D盘检查通过；原库只读且干净，项目Node/Python残留0。证据见 `docs/implementation/2026-09-25-live-storage-audit.md`；未完成项继续留在台账，不提交/推送。

```ts
expect((error as Error).message).toMatch(/^BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID:/)
expect((error as Error).message).not.toMatch(/synthetic-private|\.mjs|\n|D:\\/u)
expect(controller.isRunning()).toBe(false)
```
