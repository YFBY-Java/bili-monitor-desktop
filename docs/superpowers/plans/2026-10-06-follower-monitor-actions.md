# 粉丝监控暂停/恢复与删除迁移计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对照原B/S逐项完成粉丝暂停/恢复和删除的真实交互及本地持久化验收。

**Architecture:** 维持React → typed Preload → Local Core → SQLite。命令成功只等待共享列表读取，趋势由现有队列处理；不增加业务服务端。Core/SQL已相同部分补实际V2路由、隔离SQLite与重开证明，不为制造改动而重写。

**Tech Stack:** Electron、React、TypeScript、TanStack Query、Vitest、Playwright、node:sqlite。

**Readability:** 新代码仅TypeScript和Markdown，不增加C/C++/Rust。

## Global Constraints

- 原项目`D:\codex_work\BiliMonitor`、`fa2faa6`只读，不启动原服务；客户端基线`4c94959`，迁移分支`codex/follower-monitor-actions`。
- 所有产物、测试临时数据库、缓存、日志位于D盘；命令前加载`scripts/activate-environment.ps1`；不访问用户运行库、凭据或真实平台。
- 保持现有樱花雾白UI，V2精确UID/Long64、添加/间隔/立即刷新行为不回退。
- 原Vue `toggleUser/removeUser/loadUsers/UserActions`是事实源；不新增操作锁、乐观列表写入、新鲜度/删除墓碑或迟到结果保护。
- 成功命令忽略返回用户，等待`monitorsQuery.refetch({ cancelRefetch: false })`；列表失败保留旧数据并吞掉，不等历史、不强制另读新列表；已有旧在途读允许回流。
- 新动作开始清共享错误，包括隐藏旧列表错误；失败写同一last-writer通知。原暂停/恢复没有成功toast；删除成功提示`已删除`，重读失败也不能抹掉删除成功事实。
- 删除确认取消不清错误、不调用桥接、不修改选中/展开/草稿/趋势。失败不做成功清理；成功先清该ID选中、当前对应展开与趋势缓存，再读列表。草稿只在成功列表同步发现用户不存在时删除。
- 后台暂停保留排程和错误，恢复next=now但不在status请求内直接采集；重复enabled更新仍按原规则执行。删除历史CASCADE、主体引用SET NULL，主体及其他业务不删除。
- 原测试预算、并发和真实浏览器操作不变；旧全量失败单列，不以隔离通过宣称根因修复。新差异必须先观察RED再最小修复。
- 本轮不自动提交/推送，不更新安装客户端；逐项记录剩余M06/M08/M09–M18与真人/原生验收。

## 原源码证据

- `social-data-monitor/frontend/src/views/bilibili/BilibiliView.vue:470–504,637–667,929–943,1206–1247`：共享读取、toggle、确认/delete、草稿同步和无操作锁。
- `frontend/src/api/bilibili.ts:56–68,88–89`、`api/http.ts`：实际PATCH/DELETE与错误上抛。
- `backend/.../BilibiliFollowerMonitorService.java:81–98`、Repository`:146–179`：requireUser、status、删除；Service`:106–154`为自动在途规则。
- `V2__bilibili_follower_monitor.sql`与`V5__subject_monitor.sql`：历史级联、工作台引用置空。

### Task 1: 暂停/恢复原交互与V2本地持久化

**Files:**
- Modify: `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/__fixtures__/follower-workspace.tsx`
- Create: `apps/desktop/src/renderer/src/BilibiliFollowerStatus.interaction.test.ts`
- Create: `apps/desktop/src/main/follower-status-parity.integration.test.ts`
- Create if shared startup setup is needed: `apps/desktop/src/main/__fixtures__/follower-actions-core.ts`（仅测试使用的薄Core/SQLite夹具，Task2复用）

**Interfaces:** 使用现有`bridge.bilibiliFollowersV2.updateStatus({ userId, enabled })`及`dispatchBusinessRequest(runtime,envelope)`，不改变共享契约。保留通用delete流程到Task2；仅为status移除busy锁和await趋势。

- [x] 增加可控制状态请求计划/ledger（hold、resolve、reject），列表沿用捕获等待前快照的controlledList；opt-in `status-flow=1`，不改变旧夹具路径行为。
- [x] 真实React/Query/Chromium回归：失败不重读/状态与dirty草稿不变；开始清旧read错误；held请求允许重复点击；忽略返回视图；成功仅共享列表决定显示、旧读复用/状态回流；列表失败保留旧状态且无toast；history held不阻塞；命令与读取完成顺序决定错误最后写者。

关键RED断言示例（通过生产按钮，不调用模拟UI）：

```ts
await page.evaluate(() => window.followerFixture.statusFlow.statusPlans.push({ hold: true }))
await page.getByRole("button", { name: "暂停监控", exact: true }).click()
expect(await page.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
```

- [x] 先运行新browser suite并保存RED日志：修正成功提示定位后，生产修改前9项为4失败/5通过；失败源为旧操作锁与旧列表错误可见性，全部正常导航。held history用例已通过，只补回归，不宣称复现了强制历史读取差异。
- [x] 专用status实现：

```ts
const updateStatus = async (userId: string, enabled: boolean): Promise<void> => {
  setActionError(undefined)
  setReadErrorVisible(false)
  try {
    await bridge.bilibiliFollowersV2.updateStatus({ userId, enabled })
    await monitorsQuery.refetch({ cancelRefetch: false })
  } catch (error) { setReadErrorVisible(false); setActionError(errorMessage(error)) }
}
```

将`onUpdateStatus`接入此方法并移除status按钮disabled；不增加状态成功提示或乐观投影。
- [x] 真实V2 router/Core/临时SQLite覆盖完整响应、暂停next/错误/历史保持、恢复next=now及重复true/false、missing/非boolean拒绝无成功事件、到期筛选与重开恢复；平台Source为窄合成边界。现有后台相同的规则只补验证。
- [ ] 整组旧Workspace回归仍待绿色：新19项、主代理连同manual/interval/add的66项与Task1复审通过；最终旧Workspace2条导航hook失败，不能把整组验收勾完成。保留实际RED→GREEN及未提交状态。

### Task 2: 删除确认、即时清理、成功通知与持久化

**Files:**
- Modify: `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/use-follower-trends.ts`
- Modify: `apps/desktop/src/renderer/src/__fixtures__/follower-workspace.tsx`
- Create: `apps/desktop/src/renderer/src/BilibiliFollowerDelete.interaction.test.ts`
- Create: `apps/desktop/src/main/follower-delete-parity.integration.test.ts`
- Reuse: `apps/desktop/src/main/__fixtures__/follower-actions-core.ts`（如Task1已创建，不重复大段启动载体）

**Interfaces:** 现有`bridge.bilibiliFollowersV2.remove({userId})`；Workspace UI `onDelete`可以增加可选`onCommitted?:()=>void`回调，以便桥接成功后、list完成前清理当前对应展开。趋势hook提供仅清指定用户缓存的实际业务方法（不是test-only方法），不取消已有历史读取或添加墓碑。

- [x] opt-in `delete-flow=1` controlled remove plans/ledger及旧快照列表，覆盖确认cancel/accept、pending/失败保留、成功先清选中展开缓存、失败列表仍`已删除`、旧读回流不自动重选/展开、dirty草稿清理时点、重复点击和最后写者。
- [x] 新browser RED先记录“成功但held列表期间详情未收起/重复删除被禁用”两项；完善夹具后临时恢复自有Task2 patch补干净6失败/3通过，包含独有666666缓存及通知断言。保留实际顺序，不将fixture异常计作RED；旧卡片可回流，另一用户777777历史保持。
- [x] 最小专用delete流程，清共享错误与delete旧提示；await remove → 过滤选中 → 仅清该用户趋势cache → `onCommitted?.()` → await共享list → set删除成功。catch沿用last-writer错误；确认取消不进入此流程。删除按钮不disabled，不await趋势。
- [x] 删除后正确收起只在当前展开等于删除ID时执行；用户在pending期间换到其他详情，不误收起其他用户。
- [x] 删除generic wrapper与仅为其使用的busy/invalidate死代码，必要更新直接组件fixture类型；不扩大其他业务结构。
- [x] 真实V2 router/Core/隔离SQLite验证删除missing、用户/历史删除、Subject保留及引用置空/MID保留、其他用户隔离、重新添加同UID新ID、重开保持，以及自动在途成功不复活/内部失败、在途平台失败原退避分类保持。不新增后台规则。
- [ ] 整组旧回归仍待绿色：新14项、主代理新旧84项与Task2复审通过；完整check已跑仍有8旧hook失败，Types/Python/构建和安全检查另行通过。审计/README/台账已记录，不自动提交，不将未执行的旧业务断言写成通过。

### 验证配套：隔离四个旧浏览器 suite 的依赖缓存

本项不增加业务功能，不改变原断言、导航/键盘操作、预算或并发。基线4个旧suite各2项在依赖加载阶段超时；本地源码核查发现四套Vite server及开发renderer共用`apps/desktop/node_modules/.vite`。磁盘缓存存在竞争风险，但现有日志不足以证明具体超时根因。

**Files:** 仅以下四个旧suite的`createServer.cacheDir`：`BilibiliFollowerWorkspace.interaction.test.ts`、`BilibiliFollowerTrendBoard.interaction.test.ts`、`BilibiliAuthPanel.interaction.test.ts`、`BilibiliSubjectWorkspace.interaction.test.ts`。

- [x] 前两项完成及复审后，各设相对本文件自定位的独立D盘缓存：`.vite-follower-workspace-test`、`.vite-follower-trend-board-test`、`.vite-bilibili-auth-panel-test`、`.vite-bilibili-subject-workspace-test`，例如`fileURLToPath(new URL("../../../node_modules/.vite-follower-workspace-test", import.meta.url))`。
- [x] 不删除旧缓存、不预热旧suite、不放宽预算或缩减测试；独立复审仅四个配置行变化。原预算原并发完整检查仍有同8条旧hook失败，缓存隔离没有消除问题；冷预打包/crawl commit仅候选。同suite跨运行实例的资源竞争仍不保证消除。

## 验证与记录

主代理拥有全量验证调度；不让多个browser suites/full check同时运行。每项新旧focused命令使用项目pnpm，日志放`.tmp/2026-10-06-follower-*-{red,green}.log`。

- [x] 基线完整check及旧稳定性失败分类：Node2039/2047，Desktop589/597；4个旧suite各2项在beforeEach导航/依赖加载阶段超时，Core875全通过。日志`.tmp/2026-10-06-follower-actions-baseline-check.log`，不以隔离通过宣称根因修复。
- [x] Task1 RED/GREEN与独立复审：新2套19项通过；主代理连同添加/间隔/手动刷新5套66项通过，独立review Approved，无Critical/Important。cold hook波动Minor及旧Workspace整组待最终验证。
- [x] Task2 RED/GREEN与独立复审：新2套14项通过，主代理新旧8套84项通过，独立review Approved，无Critical/Important/Minor。
- [x] 旧suite独立缓存风险隔离与复审：精确4新增行，无预算/操作/并发变化，review Approved；主代理已复核6实际suite目录互异，不是已证明根因的修复。
- [x] 最终整轮diff只读独立复审通过，无Critical/Important及需修改的新增Minor；完整check已执行但退出1（2072/2080，8旧导航hook失败），不是全量绿色。单独Types/Python1003/构建及源库/生产fixture/残留进程检查通过。仅本轮代码增量可合并，整体不可发布，不自动提交/合并/推送；Task1/Task2整组旧回归验收仍保留未勾选。
- [x] 审计与台账当前摘要更新为已恢复逐项迁移，历史暂停/提交记录保留；新增业务的验证与旧失败、真人/原生未验收分别记录。

本计划仅两个原操作，全部迁移目标仍以全量台账为准。后续M06配置/解析/共享执行域等剩余项与M08–M18不会因为本轮通过而自动完成。
