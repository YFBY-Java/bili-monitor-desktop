# M08 直播趋势 Implementation Plan

> **For agentic workers:** 当前工作区按 test-driven-development 逐项实施，完成后 requesting-code-review 独立只读审查；不派发实现代理，不自动提交或推送。

**Goal:** 将原直播页的趋势选择、布局、真实时间图表、历史回退和刷新行为适配到纯客户端。

**Architecture:** 原 `BilibiliLiveView.vue` / `TrendChart.vue` 是业务依据，继续使用共享 DTO、typed bridge 和 TanStack Query。从 Workspace 抽出 LiveTrendBoard/LiveTrendChart；粉丝与直播只共享原图表的纯坐标轴算法，不共享领域 DTO，不影响粉丝拖动行为。没有新增依赖或业务 HTTP Server。

**Tech Stack:** TypeScript、React、CSS、Vitest/Playwright。

**Readability:** 不新增 C/C++/Rust/Java，仅现有可读技术栈。

## Global Constraints

- 客户端基线 `9eb5602`；原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读且不启动。
- 原查询是最近500点，不是标题所写固定24小时；沿用真实查询，标题改为“最近500次采集”。不改历史/存储契约。
- 选择最多4个，顺序由选择发生顺序决定。1个420px，2个各320px，3个首420px占左列/其余200px在右列，4个各240px的2x2，900px以下单列。原直播没有拖动/缩放操作，不额外添加。
- 数据优先 fetched非空→recentTrend非空→当前onlineCount单点→空。当前值回退仅用于显示，明确非新增历史；没有lastSnapshotAt时标注展示时间。缺失onlineCount按原`?? 0`绘制，空心点与提示标注原始缺失，存储不补0。
- 原时间轴按真实时间间距，加4%/30或60秒边距，单时间点前后30分钟；数值轴按原range*2.2、幅度下限、1.18留白和零下界规则。采用原precise-compact万/亿精度，纵轴不是跨房间同量程，明确提示各图独立缩放。
- 继续使用樱花雾白 `#FFF7FA`、白色 `#FFFFFF`、正文 `#45343C`、辅助 `#79646E`、分隔 `#F0E4E9`、粉色 `#E16E93` 的现有token。图表颜色使用已有coral/cyan/violet/mint；字号14px刻度/辅助、18px标题、20px当前值。无大面积深粉、无新字体。
- 原页面同页可看趋势，保留客户端独立趋势页签，两处复用同组件/同一选择。使用原180ms合并选择，成功重读规范化并刷新；500ms完成提示延迟，错误保留上次点集，删除清理，迟到响应不得串房。
- 纯展示状态沿用该Workspace已有React状态约定；不为了局部迁移另装状态库。全部运行环境/截图/缓存在D盘；测试隔离typed bridge，不能称为真人平台/原生IPC验收。
- M08全局loadAll原子赋值、事件/汇总、边缘解析/配置以及M07/M09–M18仍保留全量台账，不能用本计划代替全部迁移完成。

## Task 1: 趋势图表与布局

**Files:** 新增 `apps/desktop/src/renderer/src/BilibiliLiveTrendBoard.tsx`、`LiveTrendChart.tsx`、`live-trend-presentation.ts`、`live-trend-board.css`、`trend-axis.ts`；修改 `follower-trend-presentation.ts` 复用纯轴算法，`BilibiliLiveWorkspace.tsx` 接入；测试新增 `BilibiliLiveTrend.interaction.test.ts`、`live-trend-presentation.test.ts`。

**Interfaces:** `liveChartHeight(count,index):number`；`liveChartSamples(room,fetched,now)`返回共享TrendPoint的capturedAt/onlineCount投影和history/recent/current/empty来源；`trendValueBounds`、`trendTimeBounds`与原算法相同，`formatTrendAxisNumber(value,span,precise)`；`LiveTrendChart`接收samples、roomName、height，渲染pointer/keyboard tooltip与轴。

- [x] RED：真实React页面验证同页趋势、选房顺序和1/2/3/4几何布局、非均匀真实时间、键盘左右/Home/End/Escape与悬停、万/亿精度、缺失0标注及回退层级。

```ts
await page.getByRole("button", { name: "查看趋势", exact: true }).click()
await page.getByRole("checkbox", { name: "测试主播4", exact: true }).check()
expect(await page.locator(".live-chart-heading h3").allTextContents()).toEqual(["测试主播2", "测试主播4"])
await page.locator(".live-history-svg circle").first().focus()
await page.keyboard.press("End")
await page.getByRole("tooltip").getByText("在线/热度", { exact: true }).waitFor()
```

- [x] GREEN：选择ID映射最新room而不是旧trend.room，按fetched/recent/current选择点；显示来源/范围/缺失提示。SVG保留原平滑曲线、3px线与7px点、主题透明填充，真实可见悬停与键盘提示，React转义文本。

```ts
const selectedRooms = selectedIds.flatMap(id => rooms.find(room => room.id === id) ?? [])
const values = samples.points.map(point => point.onlineCount ?? 0)
const y = trendValueBounds(values)
// display-only，不回写samples.points或任何DTO。
```

- [x] 检查900/390窄屏、明暗主题、长名字、单点/常值/负值；纯算法断言锁定边界；既有粉丝图表回归保持。

## Task 2: 原趋势读取与状态恢复

**Files:** 修改 `BilibiliLiveWorkspace.tsx`，新增 `useLiveTrendQuery.ts`；更新 `__fixtures__/live-workspace.tsx` 和既有 `BilibiliLiveWorkspace.interaction.test.ts`；复用Task1浏览器测试。

**Interfaces:** `useLiveTrendQuery(bridge,rooms,revision,selectedIds)` 返回Query数据/错误/刷新状态/refetch。180ms选择合并，revision变动立即发起；Query key仍基于选择，不将每次刷新时间加入缓存键。

- [x] RED：初始直播页即取500点；快速勾选只提交最终组合；clear保持到下次成功重读，再恢复live-first；失败保留、删房和迟到响应隔离；普通重读不调用平台refresh。

```ts
await page.getByRole("checkbox", { name: "测试主播2", exact: true }).uncheck()
await page.getByText("尚未选择直播间", { exact: true }).waitFor()
await page.evaluate(() => window.liveFixture.reload())
await expect.poll(() => page.getByRole("checkbox", { name: "测试主播2", exact: true }).isChecked()).toBe(true)
```

- [x] GREEN：成功rooms重读用函数式更新规范化选择（不是选择变化时立即填回）；请求前校验当前room IDs并消费AbortSignal，阻止旧请求覆盖；上次成功点集只为仍存在房间保留。禁用额外30秒趋势轮询，跟随本地房间重读与手工重试，不增加平台采集。
- [x] 调整既有“clear后reload仍空”“missing heat断线”“新选择无历史就无卡”的错误等价断言，保留原错误/删除/选房隔离覆盖。

Run: `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; & $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliLiveTrend.interaction.test.ts src/renderer/src/live-trend-presentation.test.ts src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts`

## Task 3: 复核与迁移证据

**Files:** 更新 README、`docs/implementation/2026-09-13-full-migration-tracker.md`；新增 `docs/implementation/2026-09-13-live-trend-audit.md`。

- [x] requesting-code-review独立只读审查，修复真实问题并回归；不以模拟bridge验收替代native运行。
- [x] 完整运行 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`，检查退出码/全量测试数/类型/格式/构建/D盘规则；diff、生产夹具、进程残留、原仓库clean检查。
- [x] 记录每项原来源/客户端对应和剩余迁移项。更新本计划勾选；不自动提交、推送、打包或重启应用。
