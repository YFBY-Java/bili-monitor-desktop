# M08 直播整体刷新、汇总与状态事件 Implementation Plan

> **For agentic workers:** 使用 test-driven-development 在当前会话逐项执行；完成后 requesting-code-review 独立只读复核。不派发实现代理，不自动提交或推送。

**Goal:** 将原直播页 loadAll 的整体赋值、失败保留、汇总指标及状态事件完整适配到现有客户端。

**Architecture:** 原 `D:/codex_work/BiliMonitor/social-data-monitor/frontend/src/views/bilibili-live/BilibiliLiveView.vue` 为依据，基线 fa2faa6，只读不启动。以一个 TanStack Query 并行读取既有 typed bridge 的 list/summary/events，全部成功才发布页面投影；不创建新的业务接口或数据库事务。汇总和事件抽成局部组件，复用当前页面秒级时钟及浅粉白 token。

**Tech Stack:** TypeScript、React、TanStack Query、CSS、Vitest/Playwright。

**Readability:** 仅现有 TypeScript/CSS，无新增 C/C++/Rust/Java、依赖或工具链。

## Global Constraints

- 客户端基线 25a7b55，原仓库 fa2faa6；全部运行工具、缓存、隔离数据、截图位于 D 盘，先加载 activate-environment.ps1。
- 原源码 636–660 的 Promise.all 成功后一起更新 rooms/summary/events，失败不更新任何一项；成功后才规范化选择/间隔草稿并刷新趋势。这里是页面整体赋值，不是三个数据库查询的事务快照。
- 保留客户端已有每15秒本地投影重读；手工刷新同样只读 SQLite 投影，不调用平台采集。逻辑取消过期请求，迟到响应不能覆盖新一轮。
- 原 82–99 汇总四项：直播中房间、总在线/热度、今日开播次数、最近状态变化。toolbar 保留总房间/直播中/异常/今日开播数量。短数值复用原万/亿格式；latestEvent 优先于 events[0]，无事件为“24 小时内无变化”。首次未读成功显示未知，不把读取失败说成无监控或无事件。
- 原 477–492 状态事件在房间页同页展示，客户端独立页签复用；原 1390 eventText 按 monitorId 查当前昵称，缺房间回退房间号，六类原名称。保留客户端真实 UID/标题变化明细；时间按原1449规则每秒更新，绝对时间可查看。
- 命令成功与重读失败分开处理：不提前用命令返回值改写 rooms 投影；添加成功仍关闭表单且展开实际返回ID；间隔成功保留已提交草稿/已保存状态；删除清除选择/展开，禁止向已删除房间查询趋势。读取失败不误报命令失败或自动重复命令。
- 视觉：既有 #FFF7FA/#FFFFFF/#45343C/#79646E/#F0E4E9/#E16E93 token，正文及时间14px、条目16px、汇总20px；沿用系统中文无衬线字体，不引入新字体。汇总两行布局避免长相对时间挤出；事件“主播 · 事件 + 时间”是主体，细节为次级。明暗/390px可用。
- 全量 M01–M18 不收缩；M08其他数值域/配置、M11场次区及M07真人/原生等继续单列。浏览器夹具不能替代原生平台验收。

## Task 1: 整体查询与命令后的重读

**Files:** 新增 `apps/desktop/src/renderer/src/useLiveOverviewQuery.ts`；修改 `BilibiliLiveWorkspace.tsx`、`useLiveTrendQuery.ts`、`BilibiliLiveMonitorPanel.tsx`；测试 `BilibiliLiveOverview.interaction.test.ts`，扩展 `__fixtures__/live-workspace.tsx`。

**Interfaces:** `readLiveOverview(bridge:DesktopBridge, signal:AbortSignal)` 返回由三个共享DTO推断的 `{ roomList, summary, events }`；`liveOverviewKey` 为 `["bilibili-live","overview"]`；`useLiveOverviewQuery(bridge)` 返回 Query 状态及 `reload()`；趋势查询从同一已发布投影校验房间ID。

- [x] RED：对 rooms/summary/events 各自延迟和失败，验证全部旧数据保留，全部成功才切换；clear/draft/趋势请求次数不受部分成功影响。首读失败不显示正常空状态；重试成功恢复；旧请求晚到不覆盖；命令成功重读失败不重复执行、不提前发布房间。

```ts
await page.evaluate(() => { window.liveFixture.summaryError = "汇总失败"; window.liveFixture.updateRoom(0, { uname: "新昵称" }) })
await page.getByRole("button", { name: "刷新监控数据" }).click()
await page.getByRole("alert").filter({ hasText: "汇总失败" }).waitFor()
expect(await page.getByRole("heading", { name: "测试主播1", exact: true }).count()).toBe(1)
```

- [x] GREEN：统一 Query 以 Promise.all 返回完整数据，消费取消信号且 retry=false；新重读不复用过时在途请求。派生 rooms/summary/events/成功revision 来自同一缓存。移除命令的乐观缓存写入，保留本地交互状态和成功/失败说明。

```ts
const [roomList, summary, events] = await Promise.all([
  bridge.bilibiliLive.list({}), bridge.bilibiliLive.summary(), bridge.bilibiliLive.events({ limit: 20 })
])
signal.throwIfAborted()
return { roomList, summary, events }
```

- [x] 回归原趋势180ms/迟到隔离、505房间、暂停/间隔/删除、共享Widget和其他页签；不删旧失败测试。

## Task 2: 原汇总、事件与状态提示

**Files:** 新增 `BilibiliLiveOverview.tsx`、`live-overview.css`、`live-overview-presentation.ts`；修改 `BilibiliLiveWorkspace.tsx` 接入；同一浏览器测试及新增 `live-overview-presentation.test.ts`。

**Interfaces:** `LiveOverviewSummary({summary,rooms,events,now,available,pending})`；`LiveStatusEvents({events,rooms,now,available,pending})`；`liveEventName(event,rooms)`、`liveRelativeTime(value,now)` 为共享DTO上的纯展示函数。

- [x] RED：四个原指标和toolbar计数、summary最新事件优先、fallback/无事件、六类事件/缺房间名称、分钟/小时/日边界。房间页与事件页同一数据，每秒时钟不发查询，错误保留旧数据显示过期提示。

```ts
await page.getByRole("heading", { name: "最近状态事件" }).waitFor()
await page.getByText("测试主播1 · 开播", { exact: true }).waitFor()
await page.clock.runFor(1000)
await expect.poll(() => page.locator(".live-event-list time").first().textContent()).toBe("1 分钟前")
```

- [x] GREEN：摘要用原短数格式，时间复用原规则；事件名按当前房间匹配，不使用UID假装主播名称。不修改事件类型、顺序或已存事实。采用局部样式覆盖，状态/时间不仅靠颜色表达。
- [x] 明暗/宽窄窗口截图与布局检查；时间/辅助文字至少14px，长昵称完整title/换行，失败/空/加载状态可辨。

## Task 3: 全量回归与迁移台账

**Files:** README、`docs/implementation/2026-09-13-full-migration-tracker.md`；新增 `docs/implementation/2026-09-13-live-overview-audit.md`。

- [x] 独立只读代码复核、修复真实差异并回归。
- [x] 完整 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`，预期退出0，检查实际测试数/类型/格式/构建及D盘规则。
- [x] 检查diff/生产夹具/进程残留/原库未改动；记录证据、原生验收限制及完整未完成范围，不自动提交推送。

针对性命令：`. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; & $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliLiveOverview.interaction.test.ts src/renderer/src/live-overview-presentation.test.ts src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts src/renderer/src/BilibiliLiveTrend.interaction.test.ts`。
