# 粉丝投影刷新语义与失败边界取证实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复经原源码及受控RED证实的无变化后台列表读取反复触发趋势刷新，并补足四项失败的边界证据；未证实原因的失败不以放宽预算掩盖。

**Architecture:** 保留Renderer每2秒读取本地Core投影及真实Query缓存。后台以结构共享的items变化通知趋势；显式共享读取成功仍主动通知，失败不通知。Worker及浏览器只在测试层追加有界阶段记录，不新增生产诊断协议或服务。

**Tech Stack:** TypeScript、React/TanStack Query、Vitest、Playwright、Python HTTPX合成边界。

**Readability:** 新代码只用TypeScript/Python/Markdown，不新增C/C++/Rust/Java、依赖、服务或数据库migration。

## Global Constraints

- 客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `4c94959`、分支 `codex/follower-monitor-actions`；保留45项既有未提交增量。原 `D:\codex_work\BiliMonitor` / `fa2faa6` 与API归档 `271b123` 只读，不启动。index保持空，不提交/推送/合并/创建worktree或更新安装客户端。
- 命令先加载 `scripts/activate-environment.ps1`；新临时目录创建前验证D盘绝对TEMP，递归清理前验证目标为隔离TEMP严格后代。不读取用户数据库、凭据/真实Profile，不请求真实平台，不下载工具，不在C盘写产物。
- 保留现有2秒本地列表读取、共享pending read（`cancelRefetch:false`）、单history在途/180ms选择合并/120ms补读、700ms刷新最短展示与900ms结果展示、选中最多4人、500点查询和精确V2值。
- 不改变任何既有测试操作、assert、预算、并发、缓存/optimizer策略；不预热、预先ping、降低容量、删除测试或用重复整套运行求绿。
- 后台相同items成功读取不重复history或打断提示；真实items变化仍排history。每次显式成功共享列表读取即使items相同也排history；显式读取失败不排history，已提交操作仍可确认成功、不等待history；添加raw-ID选择、删除即时清理及旧快照回流保持。
- Worker/Core/SQLite/Renderer保持生产实现，只替换外部HTTP/IPC边界。诊断只留固定阶段/允许的错误码/数值时间和计数，不留raw协议、响应、URL查询、环境内容、绝对敏感路径、错误message/stack或用户/凭据内容；stdout仍是原Worker协议。
- 未复现或未证实的Worker、2000点、HTML导航失败不能称已修复。focused通过不关闭整套缺口；一次新完整check由主代理在代码冻结后执行，准确记录失败/跳过/后续截断。

## 已亲读的依据

- 原 `BilibiliView.vue:470–501,688–760`：成功loadUsers后排history、pending共享；新趋势请求清旧提示timer，700/900固定语义。`:560–620,1128–1135` 的自动tick只有due并尝试采集后才loadUsers，不能把旧合成时间当原版不会到期的证据。
- 当前Workspace每2000ms读列表，把Query dataUpdatedAt给hook；Query成功即更新时间戳，即使replaceEqualDeep保持items引用。Core每次list更新snapshotAt，所以不能用整个DTO/snapshotAt作为内容变化信号。
- `.tmp/2026-10-06-worker-start-boundary-audit.md` 与 `browser-failed-boundaries-audit.md` 为只读审计，不是运行验证。最新whole2161/2165：pending add未到http-started；volume数据已ready但后续键盘链未完；提示done后又refreshing；505停在HTMLcommit前。没有完整根因结论。

## Task 1: 修正投影触发并补失败边界（一次完整fix wave）

**Files:**
- Modify: `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/use-follower-trends.ts`
- Create: `apps/desktop/src/renderer/src/BilibiliFollowerProjectionPolling.interaction.test.ts`
- Modify: `apps/desktop/src/renderer/src/BilibiliFollowerTrendBoard.interaction.test.ts`
- Modify: `apps/desktop/src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts`
- Modify: `apps/desktop/src/main/follower-long64-worker.integration.test.ts`
- Modify: `workers/python/tests/fixtures/live_http_wait/sitecustomize.py`
- Modify only if needed for bounded list chronology: `apps/desktop/src/renderer/src/__fixtures__/follower-workspace.tsx`
- Report only: `.tmp/2026-10-06-follower-projection-verification-report.md`

**Interfaces:**
- Existing `useFollowerTrends`第三参数从成功时间戳改为 `readonly BilibiliFollowerMonitorV2[] | undefined`，共享类型从 `@bmd/contracts`导入；只有Workspace调用点，不改变IPC/后端契约。
- Workspace调用 `useFollowerTrends(bridge, selectedUserIds, monitorsQuery.data?.items)`；hook原成功list effect用items作为deps，undefined跳过，成功空数组仍prune/queue。
- Workspace集中显式共享读取，保持以下行为；所有原add/delete/settings/status/refresh及页面刷新成功读走它，后台Query本身不走它：

```ts
const loadMonitors = async (): Promise<void> => {
  const result = await monitorsQuery.refetch({ cancelRefetch: false })
  if (result.isSuccess) trendsQuery.reload()
}
```

- hook的关键effect仍用真实Query cache，不复制投影真相：

```ts
useEffect(() => {
  if (monitors === undefined) return
  client.setQueryData<BilibiliFollowerTrendV2[]>(queryKey,
    current => current?.filter(trend => latest.current.userIds.includes(trend.user.id)))
  queue.current(0)
}, [client, queryKey, monitors])
```

- 不新增热重载、UI锁、墓碑、强制invalidate/cancel或history等待。不要仅删除2s轮询。

- [x] **Step 1: 受控真实浏览器RED**

新独立suite使用已有follower-workspace.html/真正Connected组件、Query与SVG，独立自定位cacheDir；只在该新suite安装/暂停Playwright clock，旧suite保持原样。新page在导航前安装clock，页面external请求只允许同源fixture。每例新page，正常关闭所有资源。

先在旧生产代码上运行以下关键回归，确认业务差异失败，而非缺import/导航：选择一人并完成初次history及700/900提示；推进原2s轮询，确认list请求增加、items相同，但history仍应1且提示idle。随后显式刷新相同数据应history2；模拟采集字段/最近快照变化后后台poll应读取新history；显式失败共享read不新增history并保持已有图。相同pending read的成功/失败语义用既有status/manual-refresh用例补回归，不拿mock调用代替真实UI。

可复用fixture现有 `calls/listRequests/trendRequests/trendStartedAt/trendFinishedAt/patchUser/history/holdList/releaseList`；不复制平台响应或引入新fake Service。既有2s/700/900数字不改，clock推进后用现有DOM和fixture完成状态确认真实操作。

- [x] **Step 2: 最小生产GREEN**

仅按上述接口修改两文件。将原显式 `await monitorsQuery.refetch(...)` 和页面onReload替换为loadMonitors，失败不reload；Query queryFn、成功确认/清理次序、原方法返回值、旧错误优先级全部保留。运行新suiteGREEN；不能为偶然通过改回归断言或旧预算。

- [x] **Step 3: Worker最小只读探针**

在原真实spawn wrapper、fixture和pending catch追加观察：spawn/OS-spawn/exit/error；仅记录cwd/PYTHONPATH/BMD_DATA_DIR相等的bool；真实Source/transport调用、现有stdin write及callback；已知card.v2/worker.request-alive/error Envelope类别；pending resolved/rejected/unsettled；marker wait开始/结束和stop/cleanup。不发额外请求、不改原回调/返回/参数、不保留spy payload。

stderr只解析Pythonfixture固定前缀和允许的 `fixture:enter/httpx-ready/patch-ready,replay:enter,marker:write-ok/write-error`；仅long64隔离目录固定prefix启用，其他消费者没有新输出。异常原样raise，不把未知errno/code/message输出。stdout observer有64KiB buffer/8帧上限，阶段最多40，stderr阶段最多10；超限仅固定probe-limit，停止观察，不影响真实消费者。

Node和Python各用自身相对时钟，不跨时钟相减；退出和finally移除listener/恢复pass-through wrapper，清理前先导出有界summary，清理后另记退出。现有marker10000ms、case25000ms、35s watchdog/stop1500ms和真实强杀保持。新增或调整目录使用前后D盘安全预检；旧pending Error断言不替换成已resolved才通过。

- [x] **Step 4: 复用浏览器现有探针，补可判别的缺失阶段**

- volumePhases只增加tabindex计数前后、focus前、End tooltip前后、Home前/tooltip前后；最多100阶段。该例test-only PerformanceObserver最多32longtask与固定focus/tooltip事件，不记录文本；关闭前disconnect。不能把Node await慢直接称浏览器渲染慢。
- 提示在失败时也能导出已有MutationObserver状态，以常量IDLE/REFRESHING/DONE/ERROR代替文本，最多64条；导出现有trend时间/计数及fixture最多64条LIST_START/LIST_SETTLED，不输出payload。原三个poll和700/900/1500预算不变；用既有afterEach清理观察器。
- Widget只追踪固定HTML pathname的浏览器REQUEST/RESPONSE/FINISHED、现有route入口/continue、Vite test-only configureServer middleware的ENTER/FINISH/CLOSE；继续同源abort策略。复用原100阶段cap。仅navigation阶段100ms lag采样保留maxLag/最多16条，finally/afterEach/afterAll全部清理；没有资源开销或额外HTTP请求。原goto commit2500ms/heading15000ms/hook及cache配置不变。

- [x] **Step 5: 定向验证、真实证据与自审**

所有测试序列执行，不与主代理整套并行：

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliFollowerProjectionPolling.interaction.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/main/follower-long64-worker.integration.test.ts src/renderer/src/BilibiliFollowerTrendBoard.interaction.test.ts src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts src/renderer/src/BilibiliFollowerStatus.interaction.test.ts src/renderer/src/BilibiliFollowerDelete.interaction.test.ts src/renderer/src/BilibiliFollowerManualRefresh.interaction.test.ts src/renderer/src/BilibiliFollowerInterval.interaction.test.ts src/renderer/src/BilibiliFollowerAddFlow.interaction.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop typecheck
```

先用rg核对实际测试文件名：若两个最后名称与仓库不同，只替换为同功能已存在的真实路径并记录，不造新路径。命令输出写D盘唯一日志，显式保留LASTEXITCODE；分别记录RED、GREEN、新增/既有测试数、过滤/失败及安全阶段。不因旧失败盲目重复命令；先解释最后完成边界，超出本任务的生产修复请求主代理另行决定。

Pythonfixture发生修改时对该文件Black/isort检查，相关真实Python HTTP/stdio回归由主代理在整轮确认；只读probe不是业务RED修复证明。报告写完整过程和不确定项，返回DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED，不提交。主代理亲读delta与报告后task审查；再运行一次新check、补充截断步骤、记录审查与安全。本项不是M06/M09或全量迁移完成。

## 主代理验收（尚未完成）

- [x] Task独立spec/quality审查及Cannot Verify核对。
- [x] 冻结后一次新的完整check；如截断，明确记录并补后续步骤，不冒称退出0。
- [x] 更新审计、台账、交接及进度账本；完整分支审查和最终安全核验。

Step1–5勾选表示实现/定向工作已执行，不表示完整迁移或整套检查已通过。实际RED1失败/1通过、GREEN2通过，8文件103通过，最终Worker10通过，全部在原预算/默认并发下；详见D盘任务报告，待主代理独立验收。

后续task-review修补闭环：清理RED2→GREEN2/过滤13，上限1通过/过滤10，最终8浏览器98/Worker11/types通过；复审Spec compliant / Approved。一次新whole2170/2171仍退出1，无skip，pendingadd到fixture patch但未到HTTPmarker；补充全部types/Black58/isort/mypy18/Python1016/build退出0，不冒称whole绿色。详细最终结果见[审计](../../implementation/2026-10-06-follower-projection-verification-audit.md)。本清单勾选“完整check”只表示该验收动作完成且准确记录失败，不表示通过。

完整51项累计变更审查完成：slice Approved、merge With fixes、ship No；Worker整体验证Important及auto-target前置Dguard Minor未关闭。后续以单波完整清单推进最小首stdin读取取证/路径guard，不豁免失败或改预算。当前任务实现与审查动作完成，不标M06/M09/全量目标完成；源/API clean、HEAD/index/51路径和D环境/产物封装/进程监听/空白安全已核验。
