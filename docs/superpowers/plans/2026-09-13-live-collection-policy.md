# M08 直播采集策略配置 Implementation Plan

> **For agentic workers:** 当前会话按 test-driven-development 内联执行，再用 requesting-code-review 做只读复核；不派发实现代理，不自动提交或推送。

**Goal:** 将原直播间隔、限流、重试与失败退避配置接入本地 Core，并验证真实服务/SQLite 的行为，不把默认值或配置项存在当作业务迁移完成。

**Architecture:** 原只读仓库 fa2faa6 的 LiveMonitorProperties、LiveMonitorService、RetryPolicy、RateLimitService、请求 DTO 与 V4 SQL 为依据。复用已提交 0b4dd57 的 Core 启动配置，增加八个原 int 参数，环境变量覆盖文件；Worker 不读取配置或控制库。先迁移策略规则，因为 HTTP 外层超时需要考虑实际重试次数和等待时间。

**Tech Stack:** TypeScript、Zod、JSON Schema、SQLite、Vitest、Python pytest（共享配置样例）。

**Readability:** 只用既有 TypeScript/Python/JSON，不新增 C/C++/Rust/Java 或工具链。

## Global Constraints

- 所有工具、测试文件和数据库位于 D 盘；先加载 scripts/activate-environment.ps1。原 B/S 只读且不启动，不访问用户数据、凭据或真人平台。
- default/min/maxIntervalSeconds 默认 300/1/2592000；服务 minimum=max(1,min)，maximum=max(minimum,max)，不把非法默认值自动夹取为合法值。手工输入 DTO 和 SQLite 仍限定 1..2592000，配置 int 范围与业务消费范围分开。
- shortIntervalWarningSeconds 默认120，只在成功通过间隔校验且 interval<max(1,warning) 时记录结构化警告，不自动更改间隔、不伪造页面成功。
- failureBackoffSeconds 默认900，失败到期为 now + max(60,min(room.intervalSeconds,configured))；成功仍按房间间隔，重启不重算已经保存的到期时间。
- requestMinIntervalMs 默认1500，负数夹0；maxAttempts 默认3，至少1，并受 RetryPolicy 最多4次请求限制。只按 RATE_LIMITED/NETWORK_ERROR/SERVER_ERROR 分类重试，不根据错误携带的 retryable 布尔值扩大或缩小集合。
- retryBackoffMs 默认1500，等待 max(100,value)*2^min(zeroBasedAttempt,4)+整数随机[0,300)。允许完整 int 配置，超过 Node 单个 timer 上限的等待必须分段，不允许被截成1ms；停止立即取消。
- 保留房间暂停/手工采集、每批错误隔离、原API调用事实、快照幂等、事务和退出保护。不改数据库schema、现有UI输入限制或Worker协议。
- 本项不代替M08 HTTP/外层90s和35s超时、storageEnabled、完整解析域，或M07/M09–M18全量迁移；大等待的桌面宿主超时协调仍需下一独立功能验收。

## Task 1: 配置进入真实 Core 采集策略

**Files:** 修改 packages/contracts/src/bilibili-live-configuration.ts、schemas/bilibili-live-collection-configuration.v1.schema.json、fixtures/live-collection-configuration.json、src/bilibili-live-configuration.test.ts；修改 packages/core-runtime/src/bilibili-live-collection-config.ts、bilibili-live-collection-config.test.ts、local-core-runtime.ts、bilibili-live-service.ts；新增 packages/core-runtime/src/bilibili-live-policy-configuration.test.ts。

**Interfaces:** loadLiveCollectionConfiguration 返回共享配置增加 defaultIntervalSeconds、minIntervalSeconds、maxIntervalSeconds、shortIntervalWarningSeconds、failureBackoffSeconds、requestMinIntervalMs、maxAttempts、retryBackoffMs。BilibiliLiveMonitorServiceOptions 增加尚不存在的间隔/警告/失败退避字段；Core 将八个字段显式传入。

- [x] RED：共享 TS/Python 新样例（非默认、int上下界、类型错误）；加载器验证八个原环境变量。Core 从磁盘读取后默认添加、手工上下界拒绝、修改失败不写库、关闭重开保留房间间隔；不合法默认值在发请求前拒绝，不把配置生效等同于启动成功。

```ts
const { core } = await setup({ defaultIntervalSeconds: 420, minIntervalSeconds: 120, maxIntervalSeconds: 600 })
expect((await core.addBilibiliLiveRoom({ uid: "2" })).intervalSeconds).toBe(420)
await expect(core.addBilibiliLiveRoom({ uid: "3", intervalSeconds: 119 })).rejects.toMatchObject({ code: "BILIBILI_LIVE_INTERVAL_INVALID" })
```

- [x] GREEN：共享 int schema 增加默认值，loader 增加准确原 alias，Core 显式传递；service 的 add/update 使用 resolveInterval，markFailure 使用配置；保留请求DTO及数据库硬约束。结构化短间隔日志仅含事件名、时间、间隔和限流参数，不含原始输入/路径/凭据。

```ts
const interval = requested ?? this.options.defaultIntervalSeconds ?? 300
const minimum = Math.max(1, this.options.minIntervalSeconds ?? 1)
const maximum = Math.max(minimum, this.options.maxIntervalSeconds ?? 2_592_000)
// below/above errors retain original Chinese bounds; neither branch normalizes the request.
```

- [x] 验证配置 failureBackoff=75/0/negative/large 时实际持久化到期时间；rate interval=400、negative、独立endpoint；maxAttempts=0/1/2/10 且 retryBackoff=250/negative 时实际请求时间/调用日志、分类与retryable标志不一致时仍按原分类；停止不写失败。

Run: `. .\scripts\activate-environment.ps1; & $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-live-policy-configuration.test.ts src/bilibili-live-collection-config.test.ts`，先确认差异失败，再通过；Contracts及Python用现有共享fixture测试执行。

## Task 2: 长退避等待不溢出

**Files:** 修改 packages/core-runtime/src/bilibili-live-service.ts 的 wait；新增 packages/core-runtime/src/bilibili-live-policy-wait.test.ts。

**Interfaces:** wait(milliseconds) 保持现有取消行为和可选sleep适配器；生产timer按剩余毫秒分段，每段<=2147483647。

- [x] RED：真实service/SQLite+假时钟，retryBackoffMs=2147483647、jitter=0.5，1ms后不应再次请求；推进到精确等待末尾后才重试；第二次退避跨两段。停止后timer=0、无后续请求、无失败事实。
- [x] GREEN：把总等待分成timer可表示的分段，每段结束检查lifetime；不依赖 setTimeout 的溢出转换。

```ts
let remaining = milliseconds
while (remaining > 0) {
  const delay = Math.min(remaining, 2_147_483_647)
  // existing abortable timer waits delay, then ensureRunning and decrement remaining.
  remaining -= delay
}
```

- [x] 回归现有live-lifecycle测试，保持退出/迟到结果不落库；不对宿主外层时限作未经验证的完成声明。

## Task 3: 复核、完整验证与迁移台账

**Files:** 更新 config/bilibili-live-collection.example.json、README.md、docs/implementation/2026-09-13-full-migration-tracker.md；新增 docs/implementation/2026-09-13-live-collection-policy-audit.md。

- [x] requesting-code-review 只读审查原源码与本地差异，修复Critical/Important。
- [x] 完整 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`，记录全部测试/类型/构建/D盘结果。
- [x] 检查差异空白、生产测试标记和孤儿测试进程；原库仍干净。文档说明默认/环境变量、业务拒绝点、超时未完成范围，不自动提交或推送，不改安装客户端。
