# Browser startup boundary observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前六处浏览器启动验证缺口补齐有限、被动的等待位置证据，不宣称已修复原业务或历史超时。

**Architecture:** 一个仅测试使用的 TypeScript 观察器包装已有异步操作，并监听页面的主框架跳转、DOM 就绪、load。所有等待、页面输入、断言、请求与超时保持原样；关闭时停止记录、移除监听并输出一次有限摘要。

**Tech Stack:** TypeScript、Vitest、现有 Playwright/Vite；不添加依赖。

**Readability:** 新代码使用 TypeScript，不编写 C、C++、Rust 或 Java。

## Global Constraints

- 仅修改独立客户端 D:\codex_work\bili_reptile\bili-monitor-desktop；原 B/S D:\codex_work\BiliMonitor 和参考 D:\codex_work\bilibili-API-collect-new 保持只读。
- 沿用 codex/follower-monitor-actions / HEAD 4c94959f81033eee544211cfce29a18c84fd602f，保留此前55个改动路径；不提交、暂存、推送、重置、建工作树、安装工具或启动原应用。
- 所有日志、临时数据、缓存和测试输出在 D 盘。每个执行单元先运行 scripts/activate-environment.ps1，再使用 BMD_PNPM_CMD；不访问真实用户数据库、凭据或平台接口。
- 本波是测试观察，不修改生产代码、配置、IPC、数据库、业务断言、等待时间、并发、缓存目录、预热或重试策略。
- 原 beforeAll/beforeEach 10000、30000、TabRail beforeEach 20000、Widget默认2500及heading15000保持；原 default-load/commit、route、page.clock.install、页面参数与fixture query保持。
- 原操作恰好调用一次，包装返回相同成功值、抛出同一个失败对象；日志/时钟/监听失败不能影响操作结果或跳过资源清理。
- 观察器每个hook最多40条固定阶段/事件记录、仅一次失败/teardown摘要、最多4096 UTF-8字节；不记录原始错误、堆栈、URL、域名、query/hash、请求响应内容或fixture/user状态。
- 没有新增计时器、RPC、导航、路由、Vite transform/middleware wrapper或网络请求；原有独立有限诊断保持，不扩大其payload。
- 在关闭页面前停记、移除自己注册的确切回调；晚到回调不改变记录。若newPage在teardown开始后才返回，关闭该测试自有页面并提前返回，不能再导航或创建替代页面。
- 审查输入是本波 pre-task snapshot delta，不用空的HEAD..HEAD；主控制器负责一次冻结全量check、文档与最终累计审查。
- 观察回调的Node时间不是浏览器实际发生时间；没记录到回调不等于事件没发生。通过一次运行只描述该运行，不改写旧失败或宣称稳定性/全部迁移完成。

---

### Task 1: Complete six-file await/lifecycle observation wave

**Files:**

- Create: apps/desktop/src/renderer/src/__fixtures__/browser-startup-observer.ts — 仅Node测试导入的观察器。
- Create: apps/desktop/src/renderer/src/__fixtures__/browser-startup-observer.test.ts — 真实转发、有限记录和资源所有权行为测试。
- Modify: apps/desktop/src/renderer/src/BilibiliFollowerDelete.interaction.test.ts — beforeAll现有await及其teardown；beforeEach页面等待可用同一hook观察器。
- Modify: apps/desktop/src/renderer/src/BilibiliFollowerStatus.interaction.test.ts — beforeAll现有await及其teardown；beforeEach页面等待可用同一hook观察器。
- Modify: apps/desktop/src/renderer/src/BilibiliFollowerTrendBoard.interaction.test.ts — beforeAll现有await和beforeEach/afterEach边界。
- Modify: apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts — beforeAll现有await和beforeEach/afterEach边界。
- Modify: apps/desktop/src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts — beforeAll现有await和beforeEach/afterEach边界，原sampler/route/middleware保持。
- Modify: apps/desktop/src/renderer/src/TabRail.style.test.ts — beforeAll现有await和beforeEach/afterEach边界。
- Report only: .tmp/2026-10-06-browser-startup-report.md；主控制器之后维护docs/implementation、tracker、handoff、README、ledger。

**Interfaces:**

固定phase union：`server.create | server.listen | browser.launch | page.create | page.route | page.clock | page.goto | page.visible | page.close | browser.close | server.close`。
固定label union：`delete | status | trend | workspace | widget | tab-rail`，hook union `beforeAll | beforeEach`。
`createBrowserStartupObserver(label, hook, options?)` 返回 `run<T>(phase, operation: () => T | Promise<T>): Promise<T>`、`attachPage(page): boolean`、`stop(): void`、`finish(): void`、`snapshot(): safe structured summary`；options仅测试注入 `now?: () => number` 和 `output?: (line: string) => void`。
`attachPage`返回false只表示该hook已stop；监听安装故障只设置diagnosticFailure，不能终止正常业务。返回false时调用端在原cleanup路径关闭late page并return。
`stop`幂等，冻结startup active await、结束记录并独立移除三类回调；`finish`幂等，最多尝试输出一次。可以在stop之后包装已有close，有限记录close完成/失败状态，但不得覆盖被冻结的startup outstanding await。
`snapshot`没有外部对象引用；字段只含固定label/hook、非负有限Node毫秒、阶段phase/begin/end/error、observed主框架/DOM/load布尔、active固定phase或null、truncated/diagnosticFailure/stopped/listenersRemoved/closed布尔。

- [x] **Step 1: Write behavioral failing tests against a deliberately minimal forwarding implementation.**

Use actual deferred Promise and simple in-memory lifecycle source (not tests of mock call bookkeeping alone). Tests must prove:

```ts
const value = { exact: true }
let invoked = 0
const observer = createBrowserStartupObserver("status", "beforeAll")
expect(await observer.run("page.goto", () => { invoked++; return value })).toBe(value)
expect(invoked).toBe(1)
const rejection = new Error("https://private.invalid/?secret=fixture")
await expect(observer.run("page.visible", () => Promise.reject(rejection))).rejects.toBe(rejection)
// With injected failing now/output, the original value and rejection identity still hold.
```

Cover sync throws, failed clock/output/listener attach+detach without skipping cleanup, overflow>40 and UTF-8<=4096, hostile URL/error/frame with throwing URL getter (never read), ignored non-main-frame events, detached callbacks and held late callbacks afterstop, repeatedstop/finish outputonce, latepage notnavigated/closed, and two deferred cases: lifecycle delivered whilegoto pending vs gotoend+locatorpending. Assert the safe resulting summaries, identities and actual cleanup state. Do not accept missing-file RED or tests that simply assert implementation text.

- [x] **Step 2: Run RED serially and retain actual failure output.**

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/__fixtures__/browser-startup-observer.test.ts
```

Expected: meaningful behavioral failures from minimal implementation; report exact command, exit and failures. Filtered cases are not passes.

- [x] **Step 3: Implement bounded diagnostic isolation and wire all six files.**

Core forwarding pattern (record functions catch diagnostics independently):

```ts
async function run<T>(phase: StartupPhase, operation: () => T | Promise<T>): Promise<T> {
  begin(phase)
  try {
    const value = await operation()
    end(phase)
    return value
  } catch (error) {
    failed(phase) // Never inspect/serialize error.
    throw error
  }
}
```

Snapshot only constants/finite numbers/booleans; whitelist names at runtime too, fixed cap40, diagnosticFailure on caught errors, safe fallback summary on serializer/output failure. Detach each callback in its own guarded attempt so one failure does not skip others. No timing wait added. Recording end/error afterstop cannot clear frozen outstandingphase. Frame identity is `frame === page.mainFrame()`; no frame URL reads.

All6 keep their existing createServer options, launch/newPage options and tests. Wrap actual functions, not promise creation beforewrapper:

```ts
server = await startup.run("server.create", () => createServer(existingOptions))
await startup.run("server.listen", () => server.listen())
browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
const setupPage = await startup.run("page.create", () => browser.newPage(existingPageOptions))
if (!startup.attachPage(setupPage)) {
  try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
  return
}
page = setupPage
await startup.run("page.goto", () => page.goto(url, existingGotoOptions))
await startup.run("page.visible", () => existingExactLocator.waitFor(existingWaitOptions))
```

`existingOptions` above are explanatory names, not new variables toinvent: copy exact existing values at each callsite. Route/clock similarly wrap same operation once. Setup-ready page close preserves existing error precedence. Hooks use per-invocation local observer; suite afterAll/afterEach callsstop immediately, retains existing cleanup and finish in finally. Capture pending setup observer before stopping so late continuations cannot affect the nexthook. Existing Delete watchdog remains its existing report; do not call newfinish there because it would consume teardown summaryearly. Resource diagnostics stayseparate.

- [x] **Step 4: Run GREEN, six existing files unfiltered, then Desktop types serially.**

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/__fixtures__/browser-startup-observer.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliFollowerDelete.interaction.test.ts src/renderer/src/BilibiliFollowerStatus.interaction.test.ts src/renderer/src/BilibiliFollowerTrendBoard.interaction.test.ts src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts src/renderer/src/BilibiliLiveDataWidget.interaction.test.ts src/renderer/src/TabRail.style.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop typecheck
```

Do not chain these into a script that discards failure codes. Capture each nativeexit immediately, full report actual passes/fails/skips and diagnosticlimits. A six-file failure yields evidence, not permission to rerun blindly or alterbudget.

- [x] **Step 5: Self-review and independent task gate without Git mutations.**

Implementer report status/changedfiles/RED-GREENcommands+outputs/testresults/constraints/selfreview/concerns. Controller creates eight-file snapshotdelta package and independently reviews exact forwarding/redaction/lifecycle/latecleanup and unchanged businessassertions/options. Every Critical/Important fix has coveringtests and rereview.

- [x] **Step 6: Main owns one frozen unchanged wholecheck, actual findings and documentation.**

After scopedgate, main runs check.cmd ONCE, tracks actualterminalexit, and uses current phaseevidence to accept/reject H onlywithin observerlimits. If Nodefails, main separately runs unchanged types/Black/isort/mypy/Python/build once; complement doesn'tconvertcheck togreen. Allsix outcomes/skips plus anynew failures retained. Audit/README/tracker/handoff/ledger record observationversusrepair, fullM01–M18active. Broadfinalreview readscumulativeuncommitteddelta; no finish/commit/release action.

实际执行结论：本步骤执行完成，不是whole gate通过。唯一check终态1、Node2181/2183无跳过，旧6startup本次完成；UID循环body/pendingadd原断言缺口保留。补验0，完整60路径独立审查sliceApproved/mergeWithfixes/shipNo，无新增生产Critical/Important。全目标仍active，下一候选未实施，审查后仅Markdown记账。

## Main self-review

Complete final findings list covered by one task/all6; no extra business/prod/refactor; exact phases, API, caps and meaningful RED defined. All six defaults/queries/pages/budgets preserved; teardown-afterpendingnewPage is explicitly bounded by ownedresource safety, not claimedcausefix. No conflicting globals or placeholder implementationstep; contextual `existing*` names are callsite transcription examples only. One helper and one unitfile; no duplication of sixobserverimplementations. Reuse current dedicated branch/dirtysnapshot; skill defaultcommit is overridden by user's current noGit-mutation scope.
