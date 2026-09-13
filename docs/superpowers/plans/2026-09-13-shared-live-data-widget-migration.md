# M05 Shared Live Data Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the applicable inline test-driven-development workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 不委派并行开发。

**Goal:** 对齐原直播间详情和用户工作台共用的弹幕、房间观众、大航海交互。

**Architecture:** 抽出纯展示组件与一个窄 Bridge / TanStack Query 容器。两个真实页面共用容器；按房间隔离查询与组件状态，不引入服务端。保留独立实时弹幕/榜单页，其深层采集规则继续由 M09/M10 审计。

**Tech Stack:** TypeScript、React、TanStack Query、Vitest、现有 Playwright。

**Readability:** 无 C/C++/Rust/Java，无新工具、依赖、数据库迁移。

## Global Constraints

- 原仓库只读 `fa2faa6`，客户端起点 `a5587ff`。依据原 `frontend/src/views/subjects/widgets/BilibiliLiveDanmuWidget.vue`、`subjects/formatters.ts` 和 `bilibili-live/BilibiliLiveView.vue:298`。
- 原 Subject 初始 DTO 也不含 UID，不能误判为后端差异：UID 来自组件独立调用 recent(60)，每 2 秒与 status 一起更新；保持原初始 8 条聚合与共享契约不变。
- 弹幕三指标：近 5 分钟弹幕数、带符号点赞增量、看过人数；未知不伪造零。昵称 trim 后空值用游客，正 UID 展示身份。保留离线监听/未启用/无房间/停止/等待/异常状态。
- 指针阅读时暂停自动滚动，离开后恢复；消息最多 60 条，榜单排序后最多 100 条。清理定时器，不因父页面刷新清空列表。
- 榜单按 family/type/switch 取最新 capturedAt，顺序为在线贡献/进房/日/周/月、周/月/陪伴。family 独立记住所选类型，各类型独立记住升降序。
- 重新打开组件时重新读取最新本地快照；初次读取失败、切回榜单时重试读取，不等于重新采集平台。原父 `SubjectWorkbenchView.vue:16-20` 的整体错误分支仍会隐藏工作台，本项不把这个共同已有行为误报为迁移差异。
- 刷新仅发选中 family、`types: [rankSwitch || rankType]`、`maxPages: 4`、`force: true`；部分失败展示结果和警告，失败保留旧快照。未绑定时不发送请求。
- 排序完全按原值与 rankNo 二级排序；贡献值、进房在房、陪伴天数、大航海等级/上期 TOP 不互相混用。头像失败回退文字；沿用樱花雾白 token。
- 所有命令先 `. .\scripts\activate-environment.ps1`。测试只用临时 fixture，不访问真实采集数据库，不修改原项目，不自动提交/推送。

## Task 1: 共用组件与用户工作台

**Files:** Create `apps/desktop/src/renderer/src/BilibiliLiveDataWidget.tsx`、`ConnectedBilibiliLiveDataWidget.tsx`、`bilibili-live-widget-format.ts`；Modify `BilibiliSubjectWorkspace.tsx`；Create `BilibiliLiveDataWidget.interaction.test.ts`、`__fixtures__/live-data-widget.tsx`、`__fixtures__/live-data-widget.html`；Modify `styles.css`。

**Interfaces:**
- `BilibiliLiveDataWidget` 消费共享 `BilibiliSubjectWorkbench['danmu']`、可选 `BilibiliLiveDanmakuRecent[]`、`BilibiliLiveRankSummary`、房间 monitorId/liveStatus；动作返回 Promise，让组件展示等待和错误。
- `ConnectedBilibiliLiveDataWidget({bridge, room, initialDanmu})` 使用现有 `bridge.bilibiliLive`。status/recent 同时读取，查询键 `['bilibili-live-widget', roomId, 'danmu']`；rank 查询键同前缀加 `'ranks'`。
- 格式 helper 只消费共享 rank/message 类型，不创建后端响应类型。

- [ ] 先用实际 Connected 用户工作台和符合共享类型的 Bridge fixture 复现缺失：60 条请求/UID、看过人数、离线空态、排序、4 页刷新、陪伴/上期 TOP、tab 状态保持。

```ts
await page.getByRole('tab', { name: '房间观众 榜单' }).click()
await page.getByRole('tab', { name: '日榜', exact: true }).click()
await page.getByRole('button', { name: '刷新榜单', exact: true }).click()
expect(await page.evaluate(() => window.widgetFixture.rankRequests.at(-1)))
  .toMatchObject({ families: ['AUDIENCE'], types: ['today_rank'], maxPages: 4, force: true })
```

- [ ] 抽出排序/格式/空态展示和视图；连接窄 bridge，去掉 Subject 原有不完整小组件和重复 rank/操作状态。

```ts
const query = useQuery({
  queryKey: ['bilibili-live-widget', room?.monitorId, 'danmu'],
  queryFn: async () => {
    const [status, recent] = await Promise.all([
      bridge.bilibiliLive.danmakuStatus({ roomMonitorId: room!.monitorId }),
      bridge.bilibiliLive.danmakuRecent({ roomMonitorId: room!.monitorId, limit: 60 })
    ])
    return { status, recent }
  },
  enabled: Boolean(room) && initialDanmu.enabled,
  refetchInterval: 2000, retry: false
})
```

- [ ] 回归操作 pending/失败/部分失败、旧消息保留、父刷新不清排序、指针滚动暂停；无房间和 disabled 不轮询。

## Task 2: 接回直播间详情并验证房间隔离

**Files:** Modify `apps/desktop/src/renderer/src/BilibiliLiveWorkspace.tsx` 和 Task 1 的 interaction fixture/test。

**Interfaces:** Presentation 增加 `renderRoomData?: (room: BilibiliLiveRoom) => ReactNode` 插槽，房间按钮展开一个详情，Connected 用上面的共享容器。两处用房间 ID key，元数据刷新不改 key；关闭/删除/换房卸载旧监听。

- [ ] 在实际 Connected 直播间页先断言展开入口与三模式，旧版本失败；延迟房间 A 响应、切到 B、再释放 A，断言 B 不出现 A 的消息/榜单。

```ts
await page.getByRole('button', { name: '查看直播间' }).click()
await page.getByRole('button', { name: '展开直播数据' }).first().click()
await page.getByRole('tab', { name: '大航海 舰长' }).click()
await page.getByRole('tab', { name: '陪伴榜', exact: true }).click()
expect(await page.locator('.subject-rank-list').innerText()).toContain('365 天')
```

- [ ] 实现展开/收起和共享容器接入；不移除原独立页面，不把本项当成整个直播业务已迁移。
- [ ] 运行目标测试、完整 check.cmd；原仓库 status 为空、无测试数据进生产包、更新迁移台账记录未验收项。

```powershell
pnpm --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts src/renderer/src/BilibiliSubjectWorkspace.test.tsx src/renderer/src/BilibiliLiveWorkspace.interaction.test.ts
.\check.cmd
git diff --check
git -C D:\codex_work\BiliMonitor status --porcelain
```

## 执行记录

- [x] 首批 5 项页面测试在旧实现失败，分别确认无 60 条轮询、原三模式交互不全、离线状态缺失和直播详情入口缺失，再实现共用组件。
- [x] 扩展测试后复现“关闭弹幕仍显示热缓存”，按 binding 启用状态隔离可见数据，确认不再轮询；换房迟到弹幕/榜单响应、并发按钮保护、失败保留和阅读滚动通过。
- [x] 只读审查发现 rank 的无限 staleTime 跨页面保留旧快照；重新进入页面用例先失败，改为正常过期读取后通过。首次读取失败后切回榜单也先复现，再补显式读取重试。
- [x] 新增 14 项真实 Connected 页面浏览器交互回归；另在 `packages/core-runtime/src/bilibili-live-rank-service.test.ts` 增加 2 项真实 SQLite 集成测试，验证日榜/陪伴榜选择、4 页 Worker 请求与 100 条聚合，不只断言前端 mock 收到了参数。
- [x] 浅粉白主题截图检查与 650px 宽度检查通过；测试图片仅保存在 D 盘 `.tools/temp/bmd-shared-live-widget.png`。开发仍逐项内联进行，按代码审查技能单独安排只读审查，不委派并行开发；没有待修的 Critical/Important。
- 原 Subject 初始 DTO 无 UID 的行为经原源码复核保留；不修改 Core/契约去补一个实际不存在的差异。原父工作台整体加载失败隐藏内容也保持原样；组件自身轮询/刷新失败才保留上次数据。
- 本轮没有真人平台、原生窗口或已安装包验收；没有修改原 B/S 项目，没有提交/推送。
- [x] 最终 `check.cmd` 退出 0：Node 283、Python 23，TypeScript/Python 类型检查、Python 格式检查、Electron 生产构建通过。D 盘路径约束通过，生产包未含新增测试数据，原 B/S 仍为 `fa2faa6` 且工作区干净。
