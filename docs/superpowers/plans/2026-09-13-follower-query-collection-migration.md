# M06 Follower Query and Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the applicable inline test-driven-development workflow task-by-task. 不委派并行开发，不自动提交/推送。

**Goal:** 对齐原粉丝监控的完整用户查询、历史查询和采集结果语义，保留纯客户端调度。

**Architecture:** 窄 Bridge → 共享契约 → TypeScript Core → SQLite；Python 继续负责公共 HTTP 请求。原 Java/Vue 只读参考，既不启动也不修改。

**Tech Stack:** TypeScript、React、SQLite、Python、Vitest/pytest、现有 Playwright。

**Readability:** 无 C/C++/Rust/Java 新代码；不新增业务依赖、HTTP 服务或外部数据库。为共享 JSON Schema 回归将现有环境的 jsonschema 4.26.0 显式加入开发依赖锁，保证干净安装也能验证，不进入独立 Worker 的运行时职责。

## Global Constraints and Source Evidence

- 原基线 `fa2faa6`，客户端 `2b35225`；所有测试和工具先加载 `scripts/activate-environment.ps1`，只使用 D 盘临时数据库/合成数据。
- 原 `backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java`：history/trends 的 limit 未传或 <=0 取 500，正数最大 2000；多用户为空查全部，显式 ID 按传入顺序，缺失 ID 报错。
- 原 `.../repository/BilibiliFollowerMonitorRepository.java`：列表全部返回，启用优先、粉丝数降序、插入 ID 升序；history 的 from/to 包含边界，先取最新 N 点再时间升序。
- 原 `.../client/BilibiliApiClient.java`、`.../collector/service/RetryPolicy.java`：仅 NETWORK_ERROR/RATE_LIMITED/SERVER_ERROR 重试，默认 3 次，策略最多允许再试 3 次；每次退避 `max(100, retryBackoffMs) * 2^attempt + [0,299]`。业务 code >=500 虽标 retryable，但 UNKNOWN 类型不实际重试。
- 原 `BilibiliFetchedUserSnapshot.withExistingProfile`：relation/stat 保留昵称/头像/主页；card 成功的空头像覆盖旧头像。新建只用 card，不做 relation 回退。失败保留旧粉丝和历史、退避 max(300,min(interval,900))，批处理结果包含失败 endpoint。
- 已有暂停/恢复、改间隔、同秒幂等、1 秒 Core 调度、端点 1500ms 节流和并发不复活删除记录继续回归；不复制原页面的第二套采集定时器。
- 原 `frontend/src/views/bilibili/BilibiliView.vue:718` 查询最近 500 点，不传 from/to；`TrendChart.vue` 没有 1/6/24 小时选择。更正台账旧假设。剩余 M06 UI：汇总数据、倒计时/进度、展开详情、1/2/3/4 趋势布局、拖动交换、图表刻度与提示、刷新状态；保留在 M06，不能因本计划完成就勾全项完成。

## Task 1: 查询与历史窗口

**Files:** Modify `packages/contracts/src/bilibili-follower.ts`, `packages/contracts/schemas/bilibili-follower.v1.schema.json`, `packages/core-runtime/src/bilibili-follower-service.ts`, `packages/storage/src/control-database.ts`; Create `packages/core-runtime/src/bilibili-follower-query-parity.test.ts`; Modify `packages/contracts/src/bilibili-follower-contracts.test.ts`.

**Interfaces:** `listUsers({limit?})` 未指定 limit 返回全部，显式 1..500 保持兼容；`listBilibiliFollowerMonitors(limit?)` 无值使用 SQLite LIMIT -1。`trends({userIds?,from?,to?,limitPerUser?})` 删除 100 用户截断；`trend(userId,{from?,to?,limit?})` 保留原条件语义。from/to 允许 ISO 时区偏移。数据库按真实 UTC 时刻比较，保留微秒，不能将 Python 六位小数时间直接和零/三位小数时间字典序比较。

- [x] 先写契约、真实 SQLite 测试，确认旧实现失败：

```ts
expect(QueryBilibiliFollowerTrendInputSchema.parse({ userId, limit: 0 }).limit).toBe(500)
expect(QueryBilibiliFollowerTrendsInputSchema.parse({ limitPerUser: 5000 }).limitPerUser).toBe(2000)
expect(service.listUsers().items).toHaveLength(505)
expect(service.trends()).toHaveLength(505)
expect(service.trends({ userIds: ids })).toHaveLength(505)
expect(service.trend(userId, { from: '2026-09-13T12:00:00+08:00', to: '2026-09-13T04:00:01Z' }).points)
  .toHaveLength(2)
```

- [x] 运行 `pnpm --filter @bmd/contracts exec vitest run src/bilibili-follower-contracts.test.ts` 和 `pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-follower-query-parity.test.ts`，记录真实失败原因。
- [x] 共享数量归一化，放开空列表含义，SQL 列表同数值用 rowid 插入顺序。历史先做 UTC 秒部分 + 补齐 9 位小数的比较键，查询参数支持时区转换而不截断采集数据的微秒；不改存量 timestamp 或 migration。

```ts
const HistoryLimitSchema = z.number().int().default(500)
  .transform(value => value <= 0 ? 500 : Math.min(value, 2000))
// list SQL: LIMIT ? -> .all(limit ?? -1)
// trends all: database.listBilibiliFollowerMonitors()
// SQLite comparison key (stored timestamps are UTC by the shared snapshot contract):
const instant = `(substr(captured_at, 1, 19) || '.' || substr(
  (CASE WHEN substr(captured_at, 20, 1) = '.' THEN substr(captured_at, 21, length(captured_at) - 21) ELSE '' END)
  || '000000000', 1, 9))`
```

- [x] 新 JSON Schema 加 list/history/trends 定义和归一化说明，TS/Python 用同一合成查询 fixture 验证边界输入，Worker 不新增不存在的查询职责。
- [x] 复跑以上测试，另验证 2005 个历史点、30 点预览、from/to 倒置空结果、缺失用户失败、多个用户不串历史、同秒写入幂等、前次为 0 时增长率未知。

## Task 2: 重试、资料覆盖与失败结果

**Files:** Modify `packages/core-runtime/src/bilibili-follower-service.ts`; Create `packages/core-runtime/src/bilibili-follower-collection-parity.test.ts`; Modify `workers/python/tests/test_bilibili_follower.py` for parser reference cases.

**Interfaces:** 沿用 `BilibiliFollowerSource`、共享 fetched snapshot、现有错误 code/endpoint；不改 Worker 协议。仅 card 可以更新完整资料；relation 使用已有 profile。

- [x] 用真实 service/SQLite + 端点替身先复现错误类型不允许但 retryable=true 仍重试、配置超出策略次数、card 空头像残留、批失败 sourceEndpoint 缺失。

```ts
await expect(service.refreshNow(user.id)).rejects.toMatchObject({ code: 'BILIBILI_API_ERROR' })
expect(calls).toHaveLength(1) // API code 500 is UNKNOWN in original RetryPolicy
expect(service.listUsers().items[0]?.avatarUrl).toBeUndefined() // successful card without face
expect((await service.collectDueUsers())[0]?.sourceEndpoint).toBe('x/web-interface/card')
```

- [x] 实现原重试类型集合及最小退避，来源 endpoint 从源错误读取；只在 relation/stat 时保留头像和 profile。

```ts
const retryTypes = ['BILIBILI_NETWORK_ERROR', 'BILIBILI_RATE_LIMITED', 'BILIBILI_SERVER_ERROR']
if (!retryTypes.includes(details.code) || attempt >= maxAttempts || attempt > 3) break
const backoff = Math.max(100, this.options.retryBackoffMs ?? 1500) * 2 ** Math.min(attempt - 1, 4)
const avatarUrl = snapshot.sourceEndpoint === 'x/relation/stat' ? current.avatarUrl : snapshot.avatarUrl ?? null
```

- [x] 补网络/服务端重试后回退、AUTH/RISK/RATE 不回退、新建失败不落用户/快照、错误截断900、成功清错误、批量10/过期排序、暂停保留调度时间等可执行验收。

## Task 3: 页面完整列表与交付证据

**Files:** Modify `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.tsx`, `BilibiliSubjectWorkspace.tsx`, `BilibiliFollowerWorkspace.interaction.test.ts`, `__fixtures__/follower-workspace.tsx`, `README.md`, `docs/implementation/2026-09-13-full-migration-tracker.md`.

**Interfaces:** 两个共享 `['bilibili-followers']` 缓存键的调用使用 `bridge.bilibiliFollowers.list({})`，避免其中一处用截断500人的结果覆盖完整列表。不修改 Subject 其他业务。

- [x] fixture 生成505个合法监控并真实按 limit 截断，页面测试选择第505人，验证请求和展示趋势；旧 `{limit:500}` 应失败。
- [x] 改两处查询参数并通过目标测试；这只是列表接入，M06剩余视觉/交互继续逐项迁移。
- [x] `check.cmd`、`git diff --check`、生产包合成 fixture 排查、原仓库只读状态检查；只读审查后更新实际证据，不能据此声称全量迁移/真人平台已验收。

```powershell
. .\scripts\activate-environment.ps1
.\check.cmd
git diff --check
git -C D:\codex_work\BiliMonitor status --porcelain
```

## 执行记录

- 先复现查询契约6项、真实 SQLite 查询5项、采集4项、页面500人截断1项失败，再逐组实现。其余新增用例用来确认已相同的行为，不把“本来通过”冒充新修复。
- 新增 Core 21项、共享查询 fixture 18项、Preload1项、实际浏览器第505用户1项；Python新增12项解析/HTTP模拟回放、19项共享 Schema 回归。真实HTTP平台不可用于自动回归，因此HTTP测试只替换 httpx transport，保留实际请求构造、解析、CAS写入和哈希验证。
- 首次完整检查在505个用户逐次事务写入的压力用例超过默认5秒（5.446秒）；按样本量显式配置20秒/2005点30秒测试预算，没有减少数据或放宽断言。
- jsonschema默认不安装可选date-time checker，先复现无时区输入被错误接受，再显式注册标准库校验；只读审查发现3种ISO形状差异，用共享 fixture先复现再收紧。未发现 Critical/Important；SQL微秒/偏移与保留索引经独立内存查询复核。
- jsonschema 4.26.0已在现有环境中，现将其和依赖正式锁定，锁文件没有升级既有版本；安装只接受预编译产物，目录仍在D盘。不给Worker添加查询服务或新平台请求。
- 最终完整检查及用户要求提交前的复跑均通过：`check.cmd` 退出 0，Node 324项、Python 54项；TypeScript、mypy、Black/isort、Electron生产构建和D盘路径验证通过。`git diff --check` 通过，生产包没有本轮合成 fixture；原仓库仍为 `fa2faa6` 且工作区干净。
- 本轮没有重启已安装客户端、重新打包、真人平台验收或修改原B/S；本子项完成不代表M06剩余UI完成。用户后续明确要求“提交代码”，将本子项代码、测试和证据一并提交到本地，不推送远程。
