# M02 Session Boundary Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the inline test-driven-development workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 此项在 M01 验证后执行。

**Goal:** 与原 `441d423` 一致，不把离线/轮播/陈旧连接中的互动当作开播，也不让互动撤销下播待确认状态。

**Architecture:** 仅修改 Core 的场次归属与 REST 观察规则；保留弹幕最近消息与分钟指标投影，未匹配场次的互动不写场次事实。没有历史数据删除或数据清洗。

**Tech Stack:** TypeScript、SQLite、Vitest。

**Readability:** 不引入 C/C++/Rust、Java 或新服务。

## Global Constraints

- 原项目只读 `fa2faa6`；原完整参考为 `BilibiliLiveSessionBoundaryService.java` 和 `BilibiliLiveEventIngestionServiceTests.java`。
- 只由 REST liveStatus=1 或 WebSocket LIVE 建场；数据库现有场次与真实时间边界决定互动归属。
- `END_PENDING` 中的所有互动都不取消结束信号；只有更晚的权威开播观察才能恢复。
- 场次服务收到 null REST 观察时不推断下播；原 HTTP 解析缺失状态仍回退 0，本项不改变该采集语义。暂停/删除/快照事务等已有回归保持通过。
- 旧的误建场次本次不删除，避免丢用户数据；全量迁移台账继续保留其它项。

## Task 1: 场次归属修正

**Files:**
- Modify: `packages/core-runtime/src/bilibili-live-session-service.ts`
- Create/Test: `packages/core-runtime/src/bilibili-live-session-boundary-parity.test.ts`
- Test helper: `packages/core-runtime/src/__fixtures__/live-session.ts`
- Regression: `bilibili-live-session-service.test.ts`、`bilibili-live-snapshot-parity.test.ts`、`bilibili-live-danmaku-service.test.ts`。

**Interfaces:**
- `reconcileRest(room, observation)` 中 `BilibiliLiveRestObservation.liveStatus` 接受 `number | null`；未知观察原样返回 active。
- `ingest` 签名不变；归属查询没有当前/历史场次则返回 false，调用方仍保存 recent/metrics。

- [ ] Step 1：真实临时 SQLite 测试循环房间 liveStatus=0/2/1，分别接收 DANMAKU/GIFT/SUPER_CHAT/GUARD_BUY，断言不创建场次、ingest=false。另测 REST 已确认场次的正常写入、LIVE 可开场、历史迟到写回旧场次、历史外事件不串入新场次、PREPARING 之后的礼物不恢复 OPEN、null REST 不关闭。

```ts
for (const liveStatus of [0, 2, 1]) {
  const roomSnapshot = { ...room, liveStatus }
  expect(service.ingest(roomSnapshot, transportId, 1, 3, interaction)).toBe(false)
  expect(service.list({ roomMonitorId: room.monitorId })).toEqual([])
}
```

- [ ] Step 2：运行 `pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-session-boundary-parity.test.ts`，确认新建场次和撤销 END_PENDING 的断言在旧代码失败。
- [ ] Step 3：原样迁移以下归属逻辑，不把 room.liveStatus 缓存作为建场证据。

```ts
if (observation.liveStatus === null) return active
// routeSession FACT_KINDS 分支：
if (!active || event.occurredAt < active.startedAt) {
  return database.findBilibiliLiveSessionByEventTime(room.monitorId, event.occurredAt)
}
if (active.state === "END_PENDING") return active
// 原 OPEN 的 resume(..., false) 保留。
```

- [ ] Step 4：额外用真实 `BilibiliLiveDanmakuService` + SQLite 验证无场次互动仍进入最近弹幕/分钟桶。source 替身只注入事件，不模拟 Service/Database 行为。
- [ ] Step 5：针对性回归通过后执行 `check.cmd`，记录计数及原仓库只读检查；台账标记该项，不宣称其它功能已迁移完。

## Task 1 执行证据与源代码复核

- [x] 9 项 SQLite 回归先运行，8 项失败，1 项 LIVE 正常流程通过。
- [x] Core 归属/END_PENDING/null observation 修正，9 项通过；与原 session、snapshot、danmaku、V2 集成共 20 项针对性测试通过。
- [x] `check.cmd` 退出 0：Node 237，Python 23；类型/格式/生产构建通过；原仓库仍干净。
- **Task 2 已取消（原待办判断纠正）：不扩展可空采集与存储链路。** 只读核对原 `BilibiliLiveApiClient.java:114,162,202,242` 后，确认 HTTP 解析缺失状态均使用 `orElse(0)`；原 `V4__bilibili_live_monitor.sql:15,50` 的直播状态同样非空。客户端当前缺失状态转 0、非空落库并不是这次原业务更新的差异。M02 保留已对齐的服务层 null 防护，不新增 Python/契约/SQLite/UI 可空语义；服务层测试不能作为 API 缺失状态不会关场的端到端证明。全量业务仍按迁移台账逐项推进。
