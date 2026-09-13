# M08 直播调度与批次配置 Implementation Plan

> **For agentic workers:** 当前会话按 test-driven-development 执行，完成后 requesting-code-review 只读复核；不派发实现代理，不自动提交或推送。

**Goal:** 恢复原直播自动采集开关、fixedDelay、到期批量和状态接口分批配置，从本地配置经 Core 到真实 Python Worker 生效。

**Architecture:** 原仓库 fa2faa6 的 BilibiliLiveMonitorProperties、application.yml、BilibiliLiveMonitorScheduler 和 BilibiliLiveMonitorService 为依据。Core 启动时只读数据目录 config/bilibili-live-collection.json，原环境变量覆盖文件；缺省保持 true/1000/20/30。配置只影响 REST 自动采集，不关闭手工操作或粉丝/弹幕调度。

**Tech Stack:** TypeScript、Zod、Python/Pydantic、SQLite、Vitest、pytest。

**Readability:** 不新增 C/C++/Rust/Java，实现使用现有 TypeScript/Python/JSON。

## Global Constraints

- 客户端基线 f100ebc，原项目只读且不启动。所有工具/测试数据在 D 盘；先加载 scripts/activate-environment.ps1。
- 原 enabled=false 仅使 collectDueRooms 返回空；manual add/refresh/update/delete 仍可用。原 storageEnabled 是跨直播/榜单/弹幕/场次能力开关，不能把它误当成此开关。
- 原 dueBatchSize/statusBatchSize 使用 Math.max(1,value)，默认20/30。30是默认值，不是 API/Worker 的硬上限。删除客户端错误的30限制，不以拆成30条假装配置已经生效。
- schedulerDelayMs 为正的有符号32位毫秒；非正配置明确报错。批量参数保留原有符号32位范围并在消费点夹到1，避免负配置变成无限查询。
- 单批串行，完成后等待完整fixedDelay；保持退出取消和原1500ms限流。配置不改变原单条快照/失败/场次事务。
- 本地JSON格式无密钥。缺文件取默认；格式错误/未知键/类型错误中止启动并仅显示稳定配置错误，不输出文件内容；校验在打开control.db之前。
- 本计划是配置链路的第一个可验收功能，不替代全部配置迁移。HTTP超时/UA/Referer、重试/退避/间隔范围/storageEnabled后续逐项迁移；原数值域/特殊解析、M07及M09–M18继续保留。

## Task 1: 状态批次不被Worker错误截断

**Files:** 修改 packages/contracts/src/bilibili-live.ts、schemas/bilibili-live-worker.v1.schema.json（同包）、workers/python/src/bmd_workers/bilibili_live.py、packages/core-runtime/src/bilibili-live-service.ts；测试三个语言/传输层现有测试文件和 __fixtures__/live-collection.ts、workers/python/tests/fixtures/live_http/sitecustomize.py。

**Interfaces:** BilibiliLiveStatusByUidsRequestSchema / BilibiliLiveStatusRequest 的 uids 仍为非空正整数ID字符串数组；不限制30。Service 的 dueBatchSize/statusBatchSize 保持现有选项。

- [x] RED：原先31条必须失败的断言改为31/75条成功并保留空/坏UID拒绝；真实服务75房以64/11调用，在失败批次后继续后一批，不漏写。新增真实Python NDJSON75UID回放。

```ts
expect(BilibiliLiveStatusByUidsRequestSchema.parse({ taskId: "t", attempt: 1, leaseId: "l",
  uids: Array.from({ length: 75 }, (_, i) => String(i + 1)) }).uids).toHaveLength(75)
```

- [x] GREEN：移除Zod .max(30)、Pydantic max_length=30及portable maxItems；service改为 Math.max(1, options.statusBatchSize ?? 30)。这是输入域兼容扩展，保留所有旧请求样例。
- [x] 验证到期limit、暂停/未到期/退避排除、负值夹1、批次顺序、一次失败不污染另一批；真实SQLite与Worker链路通过。

## Task 2: 本地配置进入Core调度

**Files:** 新增 packages/core-runtime/src/bilibili-live-collection-config.ts、bilibili-live-collection-config.test.ts、bilibili-live-configuration.integration.test.ts；修改 local-core-runtime.ts、bilibili-live-service.ts；新增 config/bilibili-live-collection.example.json。共享Zod定义在 packages/contracts/src/bilibili-live-configuration.ts（通过index导出），portable定义为 schemas/bilibili-live-collection-configuration.v1.schema.json，共享样例 fixtures/live-collection-configuration.json；TS/Python分别验证这些样例。

**Interfaces:** loadLiveCollectionConfiguration(dataDirectory: string, environment: NodeJS.ProcessEnv) 返回 { enabled, schedulerDelayMs, dueBatchSize, statusBatchSize }；LocalCoreRuntime.start 首先读取配置。原环境变量 SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED/SCHEDULER_DELAY_MS/DUE_BATCH_SIZE/STATUS_BATCH_SIZE 映射上述字段。现有仅供宿主的 schedulerEnabled=false 仍优先禁止所有调度。

- [x] RED：缺省、文件/环境优先级、false与零负批次、错误不泄露内容、不改文件/不在配置失败时建库；以真实Core/SQLite+假时钟验证250ms fixedDelay、禁用时不自动采集但可手工刷新、重开应用重新读取配置、批量64而非30。

```json
{ "enabled": true, "schedulerDelayMs": 1000, "dueBatchSize": 20, "statusBatchSize": 30 }
```

- [x] GREEN：文件不存在捕获且仅ENOENT默认；Zod严格校验，环境值按字段解析后覆盖。创建service时传enabled/due/status；runtime保留单一live fixedDelay，不把配置复制到粉丝或弹幕定时器。
- [x] 开关在collectDueRooms入口也生效；取消/手动操作不受误伤。配置错误以BILIBILI_LIVE_CONFIG_INVALID安全呈现。

### 审查追加：已知配置错误的宿主传递

**Files:** 修改 apps/desktop/src/main/core-process.ts；新增 core-startup-configuration.test.ts 与 __fixtures__/core-process-worker.ts；共享固定提示在 packages/contracts/src/bilibili-live-configuration.ts。

- [x] 实际Core entry在顶层await抛错会让UtilityProcess退出并把堆栈拼给用户。先用Node Worker仅替换Electron进程适配器，运行真实entry/runtime/controller，验证宿主错误包含退出/路径，获得RED。
- [x] 仅捕获已知BILIBILI_LIVE_CONFIG_INVALID，保留bootstrap消息通道并返回固定core.error；shutdown允许未成功创建runtime。修正文件后同一Controller重启必须ready，且无效配置不能创建control.db。

```ts
if (startupError) {
  parentPort.postMessage(response(request, "core.error", startupError))
  return
}
```

该测试不运行GUI/原B/S，不等于原生Electron安装包验收。未知启动错误的处理不在此次扩展范围。

## Task 3: 验证与说明

**Files:** README.md、docs/implementation/2026-09-13-full-migration-tracker.md、新增 docs/implementation/2026-09-13-live-collection-configuration-audit.md。

- [x] 只读复核并修复真实问题；记录原配置仍未迁移部分，不声称HTTP/storageEnabled已实现。
- [x] 完整检查 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd` 退出0；检查diff、新文件空白、生产bundle夹具、孤儿进程和原库工作区。
- [x] 文档说明文件位置/重启生效/环境优先级/默认值；示例只展示已实现字段。不得改用户现有配置或启动客户端。
