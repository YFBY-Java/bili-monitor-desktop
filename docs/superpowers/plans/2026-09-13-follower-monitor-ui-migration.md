# M06 Follower Monitor UI Implementation Plan

> **For agentic workers:** Use the applicable inline test-driven-development workflow task-by-task. 不委派并行开发，不自动提交/推送。

**Goal:** 按原粉丝页补全汇总、用户横向列表、详情、采集节奏及趋势交互，而非重新设计业务。

**Architecture:** React 展示共享 Monitor/Trend 契约，TanStack Query 只读本地投影。单一 Core 调度负责平台请求；界面每秒时钟只计算剩余时间，不调用 refresh。保留既有主题、窄 Bridge、操作错误与删除确认。

**Tech Stack:** TypeScript、React、CSS、Vitest、现有 Playwright；不新增依赖。

**Readability:** 新代码只用 TypeScript/CSS，不增加 C/C++/Rust/Java。

## Global Constraints and Evidence

- 原项目 `D:/codex_work/BiliMonitor` 只读且基线 `fa2faa6`，客户端起点 `efda85b`。所有运行命令先加载 `scripts/activate-environment.ps1`；合成测试、截图、缓存留在 D 盘。
- 原 `social-data-monitor/frontend/src/views/bilibili/BilibiliView.vue` 的 summary-grid、monitor-user-tile、monitor-user-detail、nextCollectTime/Brief、collectProgress、intervalDrafts 是 Task 1 的事实来源；详情任一时刻最多一人，切换/收起不丢未保存草稿，列表刷新不覆盖草稿，删除清理展开/草稿/选中状态。
- 原汇总 totalFollowers/totalDelta 对缺失值按0累加，最早 nextCollectAt 包括暂停用户的原排程，间隔展示单值或最小到最大。单个未知数据仍显示未知，不伪造快照。
- nextCollectTime 优先 nextCollectAt，其次 (lastSnapshotAt || lastSuccessAt)+interval，最后当前时间。暂停进度0，错误/正在采集进度100，正常进度夹在4..100；剩余时间按秒/分/小时/天向上取整。只有实际手动刷新请求可标“采集中”，不能把保存间隔/改状态当采集；后台在途状态没有契约证据，不臆造。
- Task 2 依据原 BilibiliView.vue 的 points/chartHeight/swapTrendCards/pointer handlers、TrendChart.vue 的 axisBounds/timeAxisBounds/tooltip。原图读取最近500点，不增加小时筛选。
- 设计：继承白底 #FFFFFF、雾粉面 #FFF7FA、正文 #45343C、次要文本 #79646E、强调 #E16E93，状态沿用 mint/amber/coral token；中文沿用 Microsoft YaHei UI 字体，数据 tabular-nums。紧凑横条 + 独立宽详情，保持不少于40px控件命中区，不加营销动效；深色同样由现有 token 驱动。

## Task 1: 汇总、横向用户块和详情采集节奏

**Files:** Create `apps/desktop/src/renderer/src/follower-monitor-presentation.ts`, `follower-monitor-presentation.test.ts`, `BilibiliFollowerMonitorPanel.tsx`, `follower-monitor-panel.css`; Modify `BilibiliFollowerWorkspace.tsx`, `BilibiliFollowerWorkspace.interaction.test.ts`, `BilibiliFollowerWorkspace.test.tsx`, `__fixtures__/follower-workspace.tsx`.

**Interfaces:** 纯函数 `followerSchedule(user, now, collecting)` 返回 `{brief, progress, rhythm}`；`followerSummary(users)` 返回 `{totalFollowers,totalDelta,nextCollectAt,intervalText}`。`BilibiliFollowerMonitorPanel.tsx` 导出 `FollowerCollectionSummary`、`FollowerUserStrip`、`FollowerRhythm`、`useFollowerClock`，接收共享 Monitor 与界面状态；Workspace 维护单一展开ID及按用户ID的草稿，内部 `MonitorDetail` 保留原操作回调，不直达数据库。

- [x] 先写行为测试，真实原组件运行失败：没有汇总、横向详情按钮和倒计时；原有操作测试迁移到展开详情后操作，详情数据/操作由浏览器验收，静态断言按默认折叠状态更新。

```ts
expect(followerSchedule(user, start + 30_000, false)).toMatchObject({ brief: '30 秒后', progress: 50 })
expect(followerSchedule({ ...user, monitorStatus: 'PAUSED' }, start, true)).toMatchObject({ brief: '已暂停', progress: 0 })
await page.getByRole('button', { name: '展开测试用户1的详情' }).click()
await page.getByRole('spinbutton', { name: '采集间隔（秒）' }).fill('600')
await page.getByRole('button', { name: '展开测试用户2的详情' }).click()
await page.getByRole('button', { name: '展开测试用户1的详情' }).click()
expect(await page.getByRole('spinbutton', { name: '采集间隔（秒）' }).inputValue()).toBe('600')
```

- [x] 先运行真实浏览器回归确认缺失汇总区域，以及缺失详情按钮导致交互不可达；再新增纯计算回归。纯计算用例用于边界验收，不冒充旧源码存在相同函数时的失败。
- [x] 实现纯计算及组件：时钟 useEffect 1秒并清理；草稿 Record keyed ID、删除或服务端值已匹配时清理；独立真实 button 展开、独立链接与趋势 checkbox，不嵌套交互；详情具有 aria-label。归一化继续共享契约1..2592000，不复制平台调度。组件边界按现有文件调整为 MonitorPanel 展示块 + Workspace 的单人详情与草稿状态。

```ts
const next = Date.parse(user.nextCollectAt ?? '')
const last = Date.parse(user.lastSnapshotAt || user.lastSuccessAt || '')
const end = Number.isFinite(next) ? next : Number.isFinite(last) ? last + user.intervalSeconds * 1000 : now
const start = Number.isFinite(last) ? last : end - user.intervalSeconds * 1000
const progress = user.monitorStatus === 'PAUSED' ? 0 : collecting || user.lastErrorType ? 100
  : end <= start ? (now >= end ? 100 : 0) : Math.min(100, Math.max(4, (now - start) / (end - start) * 100))
```

- [x] 通过纯函数边界与浏览器操作回归，覆盖键盘展开/关闭、切换保草稿、后台刷新、取消删除、采集失败/暂停/恢复、滚动及小窗口；合成截图核对浅/深色。`check.cmd` 通过后写回台账，Task 2未完成仍明确标记。

## Task 2: 同页趋势、1/2/3/4布局与拖动

**Files:** Create `apps/desktop/src/renderer/src/BilibiliFollowerTrendBoard.tsx`, `follower-trend-presentation.ts`, `follower-trend-presentation.test.ts`; Modify workspace、interaction tests、样式。

**Interfaces:** TrendBoard 接收所选完整 Monitor、按ID映射的 Trend、refreshing/error及`onSwap(sourceId,targetId)`；选中ID顺序是唯一布局依据，刷新不更改顺序。折叠详情不改变趋势选择。

- [ ] 原组件先复现同页选中未请求趋势、布局缺失、拖动缺失、恒定/微幅数据纵轴误导。测试 1/2/3/4 的实际 bounding boxes，高度分别440、360、440/204、248；拖动只交换源/目标，忽略 button/a/input，8px阈值，取消/卸载清理。键盘提供等价交换操作。

```ts
const next = [...ids]
const a = next.indexOf(sourceId), b = next.indexOf(targetId)
if (a >= 0 && b >= 0) [next[a], next[b]] = [next[b]!, next[a]!]
const magnitude = Math.max(Math.abs(min), Math.abs(max), 1)
const span = Math.max((max-min)*2.2, magnitude*.000035, magnitude >= 1e6 ? 400 : magnitude >= 1e4 ? 80 : 8)*1.18
```

- [ ] 按源码迁移点回退（非空500点→recentTrend→当前值单点）、时间padding（单点±30min，其他max(跨度4%,30/60秒)）、数值轴padding与0下限、中文万/亿刻度和实际时间/数值tooltip。首次空/失败、刷新失败保留、选择快速变化不串用户，图表与选择同页。
- [ ] 选择变更180ms合并查询，忙时保留有效图，未选用户不展示迟到数据；刷新提示至少700ms、结果900ms且取消旧timer。本地轮询与原平台调度责任不混淆。
- [ ] 目标回归、完整 `check.cmd`、独立只读审查、生产包fixture排查及原仓库状态验证；更新README/台账。不据此把M07登录或整个迁移勾完成，不自动提交。

## Task 1 执行证据

- 原页面源码只读复核完成，先复现旧组件没有汇总区域和展开入口。新增14项纯计算边界、6项真实浏览器交互/布局回归，旧动作测试改为先展开再操作；第505用户选择、最多4用户、背景更新与失败保留仍通过。
- 布局回归先复现旧 light 样式覆盖新 panel token（#FFFAFB 而非 #FFF7FA），收紧组件选择器后通过。新区域字号13–24px，关键按钮不小于40px，浅/深色及760px宽窗口通过；截图 `.tools/temp/m06-monitor-light.png`、`m06-monitor-dark.png` 仅使用合成数据。
- 时钟回归使用 `setFixedTime` 固定 Date 而保持真实定时器运行，验证每秒更新为30秒/50%、实际刷新在途及暂停0%。此前安装完整虚拟时钟会遗漏已创建定时器/冻结 Query 通知，已修正测试前提；没有因此改变采集调度或放宽生产语义。
- 只读审查发现1处P2：采集中标志覆盖了采集后的本地投影重读；新增 pending-list 回归先真实失败，再将标志限制到 bridge.refresh promise，复查确认关闭。零增长/未知值中性样式也先复现后修复。无遗留 Critical/Important。
- 最终 `check.cmd` 退出0：Node344项、Python54项，TypeScript/mypy、Black/isort、Electron生产构建及D盘路径验证通过；目标31项通过，`git diff --check`通过，生产包没有本轮fixture。没有更改契约/数据库/Worker。
- 原B/S仍为`fa2faa6`且工作区干净；本轮没有重启已安装应用、打安装包、真人平台验收、提交或推送。Task2趋势同页/布局/拖动/轴与提示继续保留，M06整体和全量迁移均未完成。
