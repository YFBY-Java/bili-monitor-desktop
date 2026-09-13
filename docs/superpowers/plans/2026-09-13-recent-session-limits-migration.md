# M03 Recent Session Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the applicable inline test-driven-development workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 按用户要求逐功能执行，不委派并行开发。

**Goal:** 迁移原最近场次查询的默认 20、最大 200 规则，使数据中心和场次分析能够选择第 200 场。

**Architecture:** 同一个共享输入契约负责归一化，Core 查询本地 SQLite；不同页面的 20/200 查询使用独立缓存键，保留有效选中项。只修改现有查询链路，不新增服务或数据库表。

**Tech Stack:** TypeScript、Zod、SQLite、React、TanStack Query、Vitest、Playwright。

**Readability:** 使用现有 TypeScript，不新增 C/C++/Rust/Java。

## Global Constraints

- 原仓库只读，基线 `fa2faa6`；客户端起点 `6b7221d`。
- 原 `backend/.../live/session/query/BilibiliLiveSessionQueryService.java` 的 `sessions` 调用 `normalizeLimit(limit, 20, 200)`；Controller 默认 20。
- 原 `BilibiliLiveSessionPanel.vue` 查询 20；`DataCenterView.vue` 和 `AnalyticsView.vue` 查询 200。
- 非正整数回退 20，正整数最多 200；保持 IPC 数字类型，拒绝非整数、无效 UUID 和额外字段。
- 按开始时间倒序、同时间按持久化插入顺序倒序，隔离房间；查询不修改历史数据。
- 所有命令先 `. .\scripts\activate-environment.ps1`，测试/缓存/构建只放 D 盘。不启动原 B/S，不访问真人数据库。
- 本轮不提交或推送；全量迁移状态以 `docs/implementation/2026-09-13-full-migration-tracker.md` 为准。

## Task 1: 最近场次查询与页面接入

**Files:**
- Modify: `packages/contracts/src/bilibili-live-session.ts`、`packages/storage/src/control-database.ts`。
- Modify/Test: `packages/contracts/src/bilibili-live-session-contracts.test.ts`。
- Create/Test: `packages/core-runtime/src/bilibili-live-session-list-parity.test.ts`，复用 `src/__fixtures__/live-session.ts` 临时数据库。
- Modify/Test: `apps/desktop/src/main/core-request-router.test.ts`，现有场次查询例改为 200。
- Modify/Test: `apps/desktop/src/preload/bridge.test.ts`，验证默认/非正数/200/超限均按规范化结果发送到窄 IPC。
- Modify: `apps/desktop/src/renderer/src/BilibiliLiveWorkspace.tsx`。
- Modify/Test: `apps/desktop/src/renderer/src/__fixtures__/live-workspace.tsx`、`BilibiliLiveWorkspace.interaction.test.ts`；样例数据仅在测试入口。

**Interfaces:**
- `ListBilibiliLiveSessionsInputSchema` 输入仍为 `{ roomMonitorId: string, limit?: number }`，解析输出 limit 为 1..200。
- `ControlDatabase.listBilibiliLiveSessions(monitorId: string, limit: number): StoredBilibiliLiveSession[]` 与 `BilibiliLiveSessionService.list(input): BilibiliLiveSessionSummary[]` 签名保持不变。
- Renderer 使用现有 `bridge.bilibiliLive.sessions(input)`；不手写响应类型或新增 Python Worker 方法。

- [ ] Step 1：写契约和真实 SQLite 失败回归。使用 205 个合成场次，断言默认 20、150/200、超过 200 截断、0/负数回退 20；房间隔离、倒序、第 200 项边界、空结果。契约拒绝小数、字符串、null。

```ts
expect(ListBilibiliLiveSessionsInputSchema.parse({ roomMonitorId, limit: 201 }).limit).toBe(200)
expect(ListBilibiliLiveSessionsInputSchema.parse({ roomMonitorId, limit: 0 }).limit).toBe(20)
expect(database.listBilibiliLiveSessions(room.monitorId, 200)).toHaveLength(200)
expect(service.list({ roomMonitorId: room.monitorId, limit: 200 }).map(item => item.id))
  .toEqual([...insertedIds].reverse().slice(0, 200))
```

- [ ] Step 2：运行以下测试，确认旧契约拒绝 200、旧 SQL 只返回 100，而不是测试配置错误。

```powershell
pnpm --filter @bmd/contracts exec vitest run src/bilibili-live-session-contracts.test.ts
pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-session-list-parity.test.ts
```

- [ ] Step 3：给真实 Connected 页面补测试，bridge 替身只返回符合共享响应类型的合成场次并记录请求。验证场次页 20、数据/分析 200、第 200 场选中、刷新后仍选中、切换回 20 时选择有效场次、换房不串场。先观察旧页面请求 100 而失败。

```ts
await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
const selector = page.getByRole("combobox", { name: "直播场次", exact: true })
await expect.poll(() => selector.locator("option").count()).toBe(200)
const oldest = await selector.locator("option").last().getAttribute("value")
await selector.selectOption(oldest!)
await page.evaluate(() => window.liveFixture.reload())
expect(await selector.inputValue()).toBe(oldest)
```

- [ ] Step 4：最小实现共享归一化、SQL 上限和页面缓存隔离。新查询尚未返回时不因临时空数组清掉有效选择；换房现有回调仍明确清空选择。

```ts
limit: z.number().int().default(20).transform(value => value <= 0 ? 20 : Math.min(value, 200))
// SQLite 查询保留 WHERE / ORDER BY，limit 防线改为 200：
Math.min(200, Math.max(1, limit))
// Renderer：
const sessionLimit = view === "直播场次" ? 20 : 200
queryKey: ["bilibili-live", "sessions", selectedSessionRoomId, sessionLimit]
return bridge.bilibiliLive.sessions({ roomMonitorId: selectedSessionRoomId, limit: sessionLimit })
// selection effect:
if (!sessionsQuery.data) return
```

- [ ] Step 5：针对性测试与 `check.cmd` 全部通过；检查生产包不含新增测试数据，检查原仓库仍干净。记录准确测试数，不将 M03 等同于 M11/M13 或全量迁移完成。

```powershell
pnpm --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts src/main/core-request-router.test.ts
.\check.cmd
git diff --check
git -C D:\codex_work\BiliMonitor status --porcelain
```

## 执行结果

- [x] Step 1–2：契约 5 项、SQLite 2 项先失败，明确复现原默认值及 100 上限差异；Core Router 200 请求在旧契约失败。
- [x] Step 3–4：两个 UI 用例先以实际 100 对期望 20 失败；修正上限后，第 6 场切换到数据页丢失再次失败，补上未加载与空列表区分后通过。实际 Connected React 页面验证 20/200、选中第 200 场的事件/分析请求、刷新保留、缩小列表及换房重置。
- [x] Step 5：新增 13 项，最终 Node 250、Python 23；`check.cmd` 退出 0，类型/格式/构建通过。首次全量检查抓到测试使用 ES2023 API，改为 ES2022 兼容数组拷贝后完整重跑；没有提高编译目标。生产 bundle 无新增测试 fixture；原 B/S 仓库干净。
