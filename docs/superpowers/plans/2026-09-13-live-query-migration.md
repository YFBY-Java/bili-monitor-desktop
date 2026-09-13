# M08 直播房间查询迁移 Implementation Plan

> **For agentic workers:** 按 test-driven-development 在当前工作区逐项实现；完成后按 requesting-code-review 独立只读审查。不派发实现代理，不自动提交或推送。

**Goal:** 将原直播监控的全房列表、汇总、单房/多房趋势和事件查询迁移为无隐含截断的本地查询闭环。

**Architecture:** 沿用 Renderer → Preload → Local Core → SQLite。共享契约负责原输入归一化，Core 负责房间存在性和投影，SQLite 保持原筛选/排序；只保留显式请求 limit 的客户端兼容入口。历史查询用 UTC 秒级索引范围加九位小数比较键，不改历史数据或已发布 migration。

**Tech Stack:** TypeScript、Zod、SQLite、Vitest、React、Playwright；Python/jsonschema 验证语言无关查询输入样例。

**Readability:** 新代码仅 TypeScript/Python/JSON；不新增 C/C++/Rust/Java 或工具链。

## Global Constraints

- 原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读，不启动；客户端起点 `27c1297`，工作区干净。
- 运行前加载 `scripts/activate-environment.ps1`；工具、临时库、浏览器和产物均在 D 盘。测试使用合成平台响应，不读取用户库/凭据。
- 原依据：`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/controller/BilibiliLiveMonitorController.java`、`service/BilibiliLiveMonitorService.java`、`repository/BilibiliLiveMonitorRepository.java`；原 `frontend/src/views/bilibili-live/BilibiliLiveView.vue` 的 loadAll/refreshSelectedTrendData。
- 原列表不分页；按 ACTIVE/PAUSED、直播状态降序、热度降序（空值最后）、自增 ID 升序。客户端 UUID 不代替插入顺序。
- 原历史缺省/非正数为 500，正数封顶 2000；起止包含真实时刻，可有时区偏移，倒置范围返回空。先取最新 N 点，再按时间升序；单房 recentTrend 与 points 使用同一批快照。
- 原多房缺省/空数组查询全部，有 IDs 时保留调用顺序（含重复），任意不存在的房间返回不存在错误。UI 同时四房上限是交互规则，不是后端房间总量上限。
- 原事件默认 20、请求数夹到 1..200；结果最近在前。原汇总统计全部监控房间，暂停不改变直播状态含义。
- 本计划只关闭 M08 查询子项；采集、Worker、退出和直播监控/趋势 UI 完整迁移继续保留，M09–M18 不缩减。

## Task 1: 共享查询输入

**Files:** 修改 `packages/contracts/src/bilibili-live.ts`；新增 `packages/contracts/src/bilibili-live-query-contracts.test.ts`、`packages/contracts/fixtures/live-query-inputs.json`、`packages/contracts/schemas/bilibili-live-query.v1.schema.json`、`workers/python/tests/test_live_query_contracts.py`。

**Interfaces:** 保持 ListBilibiliLiveRoomsInput/QueryBilibiliLiveTrendInput/QueryBilibiliLiveTrendsInput/QueryBilibiliLiveEventsInput 的名字；输入仍为整数，输出归一化后才能传给数据库；省略 list.limit 不再补 100。

- [x] RED：同一批 JSON fixtures 验证 defaults/负数/0/超上限、偏移时间、非法日期/无时区、浮点数、未知字段；超过 100 房间 IDs 仍可查询。

```ts
expect(ListBilibiliLiveRoomsInputSchema.parse({})).toEqual({})
expect(QueryBilibiliLiveTrendInputSchema.parse({ roomMonitorId: id, limit: 0 }).limit).toBe(500)
expect(QueryBilibiliLiveEventsInputSchema.parse({ limit: 999 }).limit).toBe(200)
```

- [x] GREEN：历史字段改为以下归一化；list.limit 保留 min(1)/max(500) 但改 optional；多房数组取消 max(100)；from/to 使用 `z.iso.datetime({ offset: true })`。JSON Schema 描述输入接受域与归一化，Python 只验证输入，不新建查询服务。

```ts
const LiveHistoryLimitSchema = z.number().int().default(500)
  .transform(value => value <= 0 ? 500 : Math.min(value, 2_000))
const LiveEventLimitSchema = z.number().int().default(20)
  .transform(value => Math.min(Math.max(value, 1), 200))
```

- [x] 定向验证：`pnpm --filter @bmd/contracts exec vitest run src/bilibili-live-query-contracts.test.ts`；`.venv/Scripts/python.exe -m pytest workers/python/tests/test_live_query_contracts.py`。

## Task 2: Core/SQLite 全量查询与边界

**Files:** 修改 `packages/core-runtime/src/bilibili-live-service.ts`、`packages/storage/src/control-database.ts`；新增 `packages/core-runtime/src/__fixtures__/live-query.ts`、`packages/core-runtime/src/bilibili-live-query-parity.test.ts`。

**Interfaces:** `ControlDatabase.listBilibiliLiveRooms(limit?: number)` 支持不加 LIMIT；`findBilibiliLiveRoomSnapshots` 保持参数，按带偏移的输入比较 UTC。Core summary/trends 调用不带 limit 的列表。现有 48 点 recentTrend 保留。

- [x] RED：真实 service/SQLite 添加 505 房，列表/汇总/全部趋势和反向指定 IDs 不漏；反向 UUID 测试原插入顺序；显式 list limit=20 仍有效。

```ts
expect(f.service.listRooms().items).toHaveLength(505)
expect(f.service.summary().totalRooms).toBe(505)
expect(f.service.trends()).toHaveLength(505)
expect(f.service.listRooms({ limit: 20 }).items).toHaveLength(20)
```

- [x] RED：写入 2005 个真实秒桶，验证默认/0/负数取最近 500，超大取 2000，再升序；验证房间隔离、重复 IDs、未知 IDs 和数据重开。
- [x] RED：Z/.000Z/.000000Z 相同边界包含，偏移 +08:00/-04:00 等价；微秒边界不丢精度；反向范围空、单边范围、事件归一化及原汇总分类。
- [x] GREEN：可选 LIMIT、最终 rowid ASC；summary/trends 不传截断值。历史沿用粉丝查询已验证的 UTC 秒粗筛+九位小数比较方法，避免 julianday 毫秒舍入。

```sql
ORDER BY monitor_status ASC, live_status DESC, online_count DESC, rowid ASC
```

```ts
const fraction = value.match(/\.(\d+)/)?.[1] ?? ""
const key = `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(9, "0").slice(0, 9)}`
// lower coarse key: key.slice(0, 19); upper: key.slice(0, 19) + "Z"
// Compare the stored UTC timestamp padded to nine fraction digits as a second predicate.
```

- [x] 定向验证：`pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-query-parity.test.ts src/bilibili-live-service.test.ts src/bilibili-live-snapshot-parity.test.ts`。

## Task 3: 页面与真实桥接验收

**Files:** 修改 `apps/desktop/src/renderer/src/BilibiliLiveWorkspace.tsx`、`BilibiliSubjectWorkspace.tsx`、`__fixtures__/live-workspace.tsx`、`__fixtures__/live-data-widget.tsx`、`BilibiliLiveWorkspace.interaction.test.ts`、`BilibiliLiveDataWidget.interaction.test.ts`；新增 `apps/desktop/src/main/live-query.integration.test.ts`，贯通实际 Preload 校验、Core Router 和 SQLite 查询。

**Interfaces:** `bridge.bilibiliLive.list({})` 默认读取全部；Subject 的独立资源绑定列表同样取消 500 限制，避免已有房间无法被绑定。

- [x] RED：合成 fixture 的 list 尊重请求 limit；扩容为 505 间后，通过真实 Connected 页面查看第 505 间并选中趋势；不只断言调用次数。
- [x] GREEN：两个现有列表调用都改为 `bridge.bilibiliLive.list({})`，不改变四房交互规则或页面样式。
- [x] 桥接验证默认列表不补 limit、0/大数归一化、带偏移时间从 Preload→Core Router→真实 SQLite 获得正确结果；不得用全 fake runtime 代替真实查询。
- [x] 定向浏览器/桥接测试后运行 `.\check.cmd`、`git diff --check`；排查本轮 fixture 进入生产包、测试 Worker 残留，复验原仓库 clean。
- [x] 更新 `docs/implementation/2026-09-13-full-migration-tracker.md` 和查询审计记录，明确 M08 其余采集/UI/原生验收仍待迁移；本轮按用户“提交代码”要求仅本地提交，不推送。

## M08 后续已发现差异（不以本计划替代）

- 原 withExistingProfile 只回填资料/关注，客户端 mergeSnapshot 还回填缺失的 liveTime/onlineCount；重新添加在原初始化路径不生成状态事件、不回填旧资料，客户端目前复用采集路径。
- 原 stale re-add 的 enabled=true 更新优先 `next_collect_at=now()`，客户端额外写成旧 fetchedAt+interval；已有回归的这一期望需要按原 Repository 修正。
- 原 RetryPolicy 依据 NETWORK_ERROR/RATE_LIMITED/SERVER_ERROR，客户端直播采集依 raw retryable；缺失 UID 为 UNKNOWN、失败结果带 sourceEndpoint，客户端分类/输出仍不同。
- 原状态事件 occurred_at 使用落库时间，客户端成功事件使用 fetchedAt，可能影响今日开播计数；需与状态事件完整链路一起迁移。
- Worker parser 的昵称回退、0 ID/分区、错误分类及旧接口空 snapshot 返回需逐字段确认；真实 Worker/Core 字节路径与退出取消另做回归。
- 原直播页面的展开详情、汇总、倒计时、1/2/3/4 趋势布局/拖动/图表/刷新仍未完整对齐，查询测试不证明这些业务完成。
