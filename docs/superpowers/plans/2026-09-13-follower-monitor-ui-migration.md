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

**Files:** Create `apps/desktop/src/renderer/src/BilibiliFollowerTrendBoard.tsx`, `FollowerTrendChart.tsx`, `use-follower-trends.ts`, `use-follower-trend-drag.ts`, `follower-trend-board.css`, `follower-trend-presentation.ts`, `follower-trend-presentation.test.ts`, `BilibiliFollowerTrendBoard.interaction.test.ts`; Modify workspace、既有interaction tests、fixture、旧样式和README/台账。

**Interfaces:** TrendBoard 接收所选完整 Monitor、按ID映射的 Trend、refreshing/error及`onSwap(sourceId,targetId)`；选中ID顺序是唯一布局依据，刷新不更改顺序。折叠详情不改变趋势选择。

**接入细化（监控UI已提交为9a024cd后）：** 新增 `use-follower-trends.ts` 封装180ms合并、单请求在途、120ms补读以及700/900ms提示，业务数据仍在TanStack Query缓存中，按当前选中ID裁剪，不另建业务状态仓库。列表本地重读完成触发趋势读取，Renderer没有平台采集定时器。原有“趋势对比”入口作为同页定位，用户选择区不再卸载。图表用现有React/SVG适配时间/数值轴及提示，不引入新的图表依赖；`follower-trend-board.css`沿用已有浅粉白token、13px以上坐标文字和40px交换按钮，三人时首图主视图、侧边两图用于对照。仅合成浏览器fixture提供延迟/失败响应，不进入生产包。

- [x] 原客户端先复现同页选中不请求趋势、坐标轴缺失，再以10项纯函数RED/GREEN校验布局高度、交换/回退与轴规则。真实浏览器验证1/2/3/4 bounding boxes，高度440、360、440/204、248；拖动只交换源/目标，忽略button/a/input，8px阈值，取消/卸载清理；键盘等价交换。

```ts
const next = [...ids]
const a = next.indexOf(sourceId), b = next.indexOf(targetId)
if (a >= 0 && b >= 0) [next[a], next[b]] = [next[b]!, next[a]!]
const magnitude = Math.max(Math.abs(min), Math.abs(max), 1)
const span = Math.max((max-min)*2.2, magnitude*.000035, magnitude >= 1e6 ? 400 : magnitude >= 1e4 ? 80 : 8)*1.18
```

- [x] 按源码迁移点回退（非空500点→recentTrend→当前值单点）、时间padding（单点±30min，其他max(跨度4%,30/60秒)）、数值轴padding与0下限、中文万/亿刻度和实际时间/数值tooltip。首次空/失败、刷新失败保留、选择快速变化不串用户，图表与选择同页。
- [x] 选择变更180ms合并查询，忙时保留有效图，未选用户不展示迟到数据；刷新提示至少700ms、结果900ms且取消旧timer。本地轮询与原平台调度责任不混淆。
- [x] 目标回归、完整 `check.cmd`、独立只读审查、生产包fixture排查及原仓库状态验证；更新README/台账。不据此把M07登录或整个迁移勾完成，不自动提交。

## Task 1 执行证据

- 原页面源码只读复核完成，先复现旧组件没有汇总区域和展开入口。新增14项纯计算边界、6项真实浏览器交互/布局回归，旧动作测试改为先展开再操作；第505用户选择、最多4用户、背景更新与失败保留仍通过。
- 布局回归先复现旧 light 样式覆盖新 panel token（#FFFAFB 而非 #FFF7FA），收紧组件选择器后通过。新区域字号13–24px，关键按钮不小于40px，浅/深色及760px宽窗口通过；截图 `.tools/temp/m06-monitor-light.png`、`m06-monitor-dark.png` 仅使用合成数据。
- 时钟回归使用 `setFixedTime` 固定 Date 而保持真实定时器运行，验证每秒更新为30秒/50%、实际刷新在途及暂停0%。此前安装完整虚拟时钟会遗漏已创建定时器/冻结 Query 通知，已修正测试前提；没有因此改变采集调度或放宽生产语义。
- 只读审查发现1处P2：采集中标志覆盖了采集后的本地投影重读；新增 pending-list 回归先真实失败，再将标志限制到 bridge.refresh promise，复查确认关闭。零增长/未知值中性样式也先复现后修复。无遗留 Critical/Important。
- 最终 `check.cmd` 退出0：Node344项、Python54项，TypeScript/mypy、Black/isort、Electron生产构建及D盘路径验证通过；目标31项通过，`git diff --check`通过，生产包没有本轮fixture。没有更改契约/数据库/Worker。
- 原B/S仍为`fa2faa6`且工作区干净；本轮没有重启已安装应用、打安装包、真人平台验收、提交或推送。Task2趋势同页/布局/拖动/轴与提示继续保留，M06整体和全量迁移均未完成。

## Task 2 执行证据

- Task1 已按用户明确要求提交到本地 `9a024cd`；本轮在其后继续，无自动提交/推送。重新只读核对原 BilibiliView.vue 的选择/布局/拖动/队列/点回退及完整 TrendChart.vue；不扩充平台查询、日期筛选或模拟业务。
- 真实浏览器先复现监控页勾选不读取趋势、缺失坐标轴；纯计算10项从初始实现RED到GREEN，校验原值域/时间域padding、万/亿刻度、1/2/3/4高度、两槽交换和包含0的点回退。新13项真实Connected页面回归覆盖同页布局、原Tab定位/草稿、快速选择/单在途/120ms补读、数据/错误迟到隔离、700/900ms提示、清空/卸载、4×500点和键盘Home/End/左右/Escape。
- 调试修正：旧图表测试把Grip图标圆点算作数据点，已限定真实SVG数据点；旧CSS将说明压为10px，先失败后移除重复的旧TrendCard样式，保留现有主题token、13px以上说明/坐标与40px按钮。窄窗口初次挂载滚走汇总（scrollTop324）先复现，再仅在Tab变化时定位；清空用户后提示短暂残留先复现，再按空选择立即派生idle。
- 独立只读审查复现P2：新请求发起时把Query旧error错误归属给新选择。回归先失败后改为失败时记录请求key、成功清空；原路径复测及主回归通过，审查复查关闭。另实测恰好8px拖动和拖动中卸载的监听器清理；没有遗留Critical/Important。
- 完整 `check.cmd` 退出0：Node367项（desktop153）、Python54项，TypeScript/mypy、Black/isort、Electron生产构建及D盘路径验证通过。随后仅完善视觉用例的稳定状态等待/截图高度，单项重跑通过；没有再改生产实现。浅色/深色/760px窄宽截图已实际查看，均为合成fixture；截图位于 `.tools/temp/m06-trends-*.png`，不进入Git。
- `git diff --check`及生产包fixture排查通过；原项目仍`fa2faa6`且干净，没有更改契约、Worker、数据库或依赖。未重启已安装客户端、打安装包、访问真人平台或真实数据库；不能将这些列为已验收。
- 本计划两个UI子项已实现并自动验证。下一步对M06新增/状态/间隔/删除/调度链路做最终逐操作源码复核，再进入M07登录；M07–M18和全量目标仍保持，不能据本轮完成整个迁移。
