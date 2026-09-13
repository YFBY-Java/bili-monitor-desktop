# M08 直播房间监控操作区 Implementation Plan

> **For agentic workers:** 在当前工作区按 test-driven-development 逐项实施；使用 requesting-code-review 独立只读审查，不派发实现代理，不自动提交或推送。

**Goal:** 将原直播页的房间列表、单房间展开详情、采集节奏及间隔编辑完整适配到本地客户端。

**Architecture:** 继续由 TanStack Query/typed bridge 管理已保存房间；Renderer 单独保存展开房间与每房间未保存草稿。从过大的 Workspace 抽出监控面板和纯展示函数，不改 Core/Worker/存储，也不由倒计时发起采集。沿用现有 React 局部状态惯例，不在此次业务迁移中额外引入状态库。

**Tech Stack:** TypeScript、React、现有 CSS tokens、Vitest/Playwright 浏览器测试。

**Readability:** 只新增 TypeScript/CSS/Markdown，不新增 C/C++/Rust/Java 或依赖。

## Global Constraints

- 客户端基线 `2896d1b`；原仓库 `D:\codex_work\BiliMonitor` 为 `fa2faa6`，只读、不启动。
- 依据 `social-data-monitor/frontend/src/views/bilibili-live/BilibiliLiveView.vue` 的 room-strip、room-detail、normalizeSelection、syncIntervalDrafts、collectProgress、nextCollectBrief、statusText、missingFieldItems、saveInterval。
- 默认展开第一房间；同房间点击收起；成功重读时若展开项不存在（含主动收起）恢复首项；添加成功展开返回房间，包括重复添加。
- 状态优先级暂停→异常→直播/轮播/未开播；暂停进度0，异常100；未知时间不制造采集事实。
- 间隔1..2592000秒，四舍五入并夹取范围；步长依次1/60/300/3600。草稿跨收起、切房、页签切换保留；后台重读不覆盖脏草稿；成功保存清草稿，失败保留。删除清理对应草稿。
- 详情八字段、封面/头像回退、UID/长短房间号/分区、字段完整性、异常、刷新/启停/删除确认、已迁移共享直播数据组件必须保留。
- 使用项目 D 盘环境，隔离浏览器只拦截 typed bridge/外部平台边界，不打开真人数据或启动原应用。测试 Vite 为随机端口、测试后关闭，不是业务 Server。
- 此计划不代替全量台账：M08趋势完整交互/状态事件汇总/添加边缘数值域/配置仍需后续逐项迁移；详情场次区域单列 M11，不声称本轮完成。

## 视觉约束

既有色板：白色 `#FFFFFF`、樱花雾白 `#FFF7FA`、正文 `#45343C`、辅助字 `#79646E`、分隔 `#F0E4E9`、粉色点缀 `#E16E93`；全部通过现有变量引用，兼容深色模式。标题/正文沿用 Microsoft YaHei UI/PingFang SC/Segoe UI，数值用同字体等宽数字；不新增字体。结构是横向房间卡片→单个展开详情→原共享直播数据，强调采集节奏条而非大面积深粉；14px辅助字、16px正文、20px标题，焦点清晰，窄屏可换行，不在每张卡片重复整套详情。

## Task 1: 可验证的原监控操作

**Files:** 修改 `apps/desktop/src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts` 和 `__fixtures__/live-workspace.tsx`；随后新增 `live-monitor-presentation.ts`、`BilibiliLiveMonitorPanel.tsx`、`live-monitor-panel.css`，修改 `BilibiliLiveWorkspace.tsx`。

**Interfaces:** 展示函数 `liveCollectionSchedule(room: BilibiliLiveRoom, now: number): { brief: string; progress: number }`、`liveMonitorStatus(room): { label: string; tone: string }`、`clampLiveInterval(value: number): number`、`liveIntervalStep(value: number): number`；面板接收共享 Room、now、expandedId、selectedTrendIds、草稿、busy/error及现有 typed action 回调。`onAdd` 可返回添加后的共享 Room；`onRoomAction` 返回 boolean 标记实际成功（保留 void 展示调用兼容），以免失败清草稿。

- [x] RED：浏览器验证默认单详情、键盘展开/收起及重读恢复；详情八字段/缺失健康标签/错误；每秒倒计时/时长变化但不调用refresh；草稿跨房间/页签保留、范围归一化/步长、失败保存保留；新增后展开且添加中禁止编辑。

```ts
const detail = page.getByRole("region", { name: "测试主播1房间详情" })
await detail.waitFor()
await detail.getByRole("spinbutton").fill("600")
await page.getByRole("button", { name: "展开测试主播2的详情" }).click()
await page.getByRole("button", { name: "展开测试主播1的详情" }).click()
expect(await detail.getByRole("spinbutton").inputValue()).toBe("600")
```

- [x] GREEN：将卡片全内容点击区域做原生 button（其他操作为兄弟按钮，避免嵌套交互），横向列表保留所有房间；展开区渲染事实字段与操作；单一1000ms展示计时器清理，不增加请求。

```ts
const end = Date.parse(room.nextCollectAt!)
const start = Date.parse(room.lastSnapshotAt || room.lastSuccessAt || "")
const progress = Math.min(100, Math.max(4, (now - start) / (end - start) * 100))
// 完整函数需先处理 PAUSED、lastErrorType、未排程及没有 start 的原间隔回退。
```

- [x] 接入 Workspace：展开状态在房间成功重读时规范化，草稿只剔除删除/与持久值一致项；添加返回目标后展开。保存只在 action 成功后清对应草稿，按键/鼠标趋势操作不展开房间。

```ts
const saved = await onRoomAction("interval", room, draft)
if (saved !== false) clearDraft(room.id)
```

- [x] 回归：把旧测试中已迁移到详情的操作定位同步到详情，不删行为断言；不把现有趋势/场次测试的旧行为当成新功能验收。

Run: `. .\scripts\activate-environment.ps1; & $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts src/renderer/src/BilibiliLiveWorkspace.test.tsx src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts`

## Task 2: 审查与证据

**Files:** 更新 README、`docs/implementation/2026-09-13-full-migration-tracker.md`，新增 `docs/implementation/2026-09-13-live-monitor-panel-audit.md`。

- [x] 浏览器截屏检查浅色/深色、宽/窄窗口、长名称/来源接口和无图片；错误状态另由浏览器交互断言验证。截图只保存在 D 盘测试输出。
- [x] 按 requesting-code-review 派发一次独立只读审查，修复真实问题并重跑相关回归。
- [x] 完整 `check.cmd`（本次进程设`VITEST_MAX_WORKERS=2`，全部测试仍执行）退出0：Node616/Python183，类型/格式/Electron生产构建/D盘约束通过；`git diff --check`、生产夹具扫描、原仓库fa2faa6且clean、项目测试进程0。已记录剩余范围，不提交、不打包、不重启安装客户端。
