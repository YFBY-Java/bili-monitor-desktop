# M08 直播采集与快照应用 Implementation Plan

> **For agentic workers:** 使用 test-driven-development 在当前工作区逐项实现，完成后使用 requesting-code-review 独立只读审查。不派发实现代理，不自动提交或推送。

**Goal:** 对齐原直播监控的采集快照、重新添加、事件与失败重试语义，避免旧资料变成当前事实和错误状态写入。

**Architecture:** 保持实际 Core → Worker Source → SQLite 的本地链路。平台调用用测试响应隔离，快照、事件、排程、场次与 Outbox 使用真实服务及数据库事务。初始化与后续采集保持原不同的资料/事件/事务顺序。

**Tech Stack:** TypeScript、SQLite、Vitest；本轮不新增运行时依赖。

**Readability:** 新实现仅 TypeScript，不新增 C/C++/Rust/Java 或工具链。

## Global Constraints

- 原 B/S `D:\codex_work\BiliMonitor` 当前 `fa2faa6`，只读且不启动；客户端起点 `9e091f6`，工作区干净。
- 运行前加载 `scripts/activate-environment.ps1`，测试库、缓存和产物均在 D 盘；不读取真实凭据/用户库，不请求真人平台。
- 原依据：`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/` 下 MonitorService、SnapshotApplicationService、Repository、FetchedLiveRoomSnapshot、ApiClient 及对应原测试；重试另参照 `collector/service/RetryPolicy.java`。
- 对照原公开字段与实际 Repository SQL，不只依赖 Mock 测试。原 stale re-add 虽传入 fetchedAt+interval，SQL 在 enabled=true 时实际使用 now()。
- 本轮不修改原历史 migration，不增加 HTTP 服务、固定端口或数据库服务。M08 Worker 逐字段解析/进程退出/完整 UI、M09–M18 继续保留，不能将本子项当作全量完成。

## Task 1: 快照、初始化与事务

**Files:** 修改 `packages/core-runtime/src/bilibili-live-service.ts`、`packages/core-runtime/src/bilibili-live-session-service.ts`（REST待结束比较）、`packages/storage/src/control-database.ts`、`packages/storage/src/index.ts`、`packages/core-runtime/src/bilibili-live-snapshot-parity.test.ts`；新增 `packages/storage/src/bilibili-live-snapshot-values.ts`、`packages/core-runtime/src/__fixtures__/live-collection.ts`、`packages/core-runtime/src/bilibili-live-collection-parity.test.ts`。

**Interfaces:** 保留 `addRoom/refreshNow/collectDueRooms`。Storage `ApplyBilibiliLiveRoomSnapshotInput` 增加可选 `appliedAt`；`applyBilibiliLiveRoomSnapshot(input, reconcileBeforeSnapshot?)` 的可选回调接收原事务应传给场次的房间：初始化使用 previous 或新建行，后续采集使用 current。纯函数 `compareLiveSnapshotTime(left, right)` 和 `hasLiveSnapshotText(value)` 供 Core/Storage 共用原时刻和非空文本语义。

- [x] RED：真实 SQLite 验证批/手动采集丢失 online/liveTime 时写空，资料与关注可回填；新状态为0不能回填旧1。重新添加不回填旧资料、不生成 ERROR_RECOVERED/LIVE_STARTED/TITLE_CHANGED，但清旧错误并重新激活。

```ts
expect(f.database.findBilibiliLiveRoomById(room.id)).toMatchObject({
  liveStatus: 0, liveTime: null, onlineCount: null, attentionCount: 200
})
expect(f.service.events()).toEqual(eventsBeforeReAdd)
```

- [x] RED：旧快照重新添加只改设置，nextCollectAt=注入的当前时刻；原状态、快照、错误/backoff与场次保持。修正旧回归中错误的02:07期望。
- [x] RED：相同秒不同格式/微秒的新旧顺序；newer END_PENDING 信号拒绝旧快照；相同时刻仍可覆盖秒桶，不改历史数据。
- [x] RED：通过真实场次服务和观察回调验证采集顺序 events→boundary→monitor/snapshot，初始化 monitor→boundary(previous或新行)→snapshot；回调失败全事务回滚，不额外写平台失败。事件时间使用落库时刻，快照/排程使用 fetchedAt；事件类型、原身份字段和顺序保持。

```ts
// 在实际 reconcileRest 包装回调中读取真实库，而非 mock 掉边界行为。
expect(roomPassed.lastSnapshotAt).toBe(previousCapture)
expect(database.findBilibiliLiveRoomSnapshots(room.id, { limit: 10 })).toHaveLength(1)
expect(service.events().every(event => event.occurredAt === clockNow)).toBe(true)
```

- [x] GREEN：withExistingProfile只补资料/attention；采集开始时捕获的room用于回填，落库当前行用于并发间隔和状态。初始化直接应用平台合并结果。stale重新添加先改间隔再激活，使排程为now。拒绝陈旧结果时不写新业务快照/状态事件或更改场次；本次API日志/原始响应证据照常保留。

```ts
const resolved = snapshot // 初始化不使用 previous 回填
const isStale = [current?.lastSnapshotAt, current?.lastSuccessAt]
  .some(value => value && compareLiveSnapshotTime(value, snapshot.fetchedAt) > 0)
// 按原 Character.isWhitespace 定义 blank，不能把 NBSP/BOM 当成空白。
```

- [x] 定向运行 `pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-collection-parity.test.ts src/bilibili-live-snapshot-parity.test.ts src/bilibili-live-service.test.ts`，先确认业务差异失败再实现、重跑通过。

## Task 2: 重试、批失败与来源

**Files:** 继续修改 `packages/core-runtime/src/bilibili-live-service.ts`；在上述真实 SQLite fixture/test 中补对应回归。

**Interfaces:** 内部 `LiveFetchFailure` 保留稳定 code、message、原 retryable 标志和可信 endpoint；仅 source/响应校验失败进入平台失败记录，数据库或场次错误向上传播而不冒充平台错误。既有共享 `BilibiliLiveCollectResultSchema.sourceEndpoint` 已可承载失败来源，不新造 UI 响应类型。Storage失败写入增加可选 `eventContext`（uid、roomId、liveStatus、title、onlineCount），由Core传入原请求房间上下文。

- [x] RED：RATE_LIMITED/NETWORK_ERROR/SERVER_ERROR即使raw retryable=false仍重试；RISK_CONTROL/UNKNOWN即使true也不重试。总尝试数同时受maxAttempts与原attempt<3策略约束，默认3次、配置10时最多4次；最小退避100ms并逐次翻倍。

```ts
const canRetry = ["BILIBILI_RATE_LIMITED", "BILIBILI_NETWORK_ERROR", "BILIBILI_SERVER_ERROR"].includes(details.code)
if (!canRetry || attempt >= maxAttempts || attempt > 3) break
const backoff = Math.max(100, options.retryBackoffMs ?? 1500) * 2 ** Math.min(attempt - 1, 4)
```

- [x] RED：批接口缺一个UID时只失败该房间，原 UNKNOWN/true、status endpoint；其他房间正常写入。整批源失败所有结果保留来源、间隔退避60..900、失败重复事件与原一致。
- [x] RED：真实 WorkerSource + JSON序列化输入结果 +真实服务/SQLite，验证返回消息和sourceEndpoint；日志保留raw retryable但不以它决定重试，缺旧房间在old endpoint记业务失败，不破坏其他房间。错误抛出仍为合成传输，未验证真实NDJSON错误字节链路，见审计限制。
- [x] GREEN：只在平台调用/校验范围创建LiveFetchFailure；成功日志写入和snapshot/场次事务异常不被重试。批次获取和逐房应用分开捕获，内部错误不把已经成功的房间重新标记为平台失败。
- [x] 审查补充：ERROR_OCCURRED使用请求捕获的eventContext，同秒snapshot不覆写uid/room_id。两项新增真实SQLite回归先失败后修复，独立复查关闭重要问题。
- [x] 定向验证后完整运行 `.\check.cmd`，复验生产fixture、测试Worker残留、D盘路径、原仓库clean；使用独立只读审查关闭重要问题。最终Node526、Python105通过。
- [x] 更新 `docs/implementation/2026-09-13-live-collection-audit.md`、全量迁移台账和README，记录准确证据及全部未完成项，不自动提交/推送。

## 后续保持在迁移范围内

Python Live parser仍需单独处理0分区/short ID、昵称回退、旧接口空snapshot、错误分类/字段优先级及真实NDJSON链路。Core退出取消与源进程终止继续作为M08生命周期子项；直播页详情、汇总/倒计时、1–4趋势布局/拖动/图表和505房性能继续作为UI子项。当前计划没有豁免这些内容或M09–M18。
