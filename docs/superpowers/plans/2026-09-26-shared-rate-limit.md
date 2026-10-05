# 共享限流与 API 耗时迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 本任务承接现有未提交迁移，在当前任务按已启用的 TDD 工作流逐项实施，不另建执行任务、不委派实现、不提交代码。

**Goal:** 对齐原粉丝、直播 REST 和榜单的共享限流及包含等待的单次 API 耗时。

**Architecture:** Local Core 持有一个内存限流器，服务按原键申请许可；仅限流等待串行，HTTP 操作在许可释放后执行。保留每服务停止信号，排队和正在等待的申请都可取消，不因取消更新下一次许可时间或记录平台失败。

**Tech Stack:** TypeScript、Vitest、真实临时 SQLite；不变更 Worker 契约与数据库结构。

**Readability:** 新代码只用 TypeScript，不增加 C、C++、Rust。

## Global Constraints

- 原项目 `D:\codex_work\BiliMonitor` 只读，不启动；保留客户端全部既有修改。
- 测试、缓存、产物在 D 盘；先加载 `scripts/activate-environment.ps1`。
- 合成外部数据源，不访问用户数据库、凭据或真实平台。
- 不增加业务 HTTP 服务、依赖、配置开关或界面占位。
- 不提交/推送、不打包或重启安装应用；全量 M01–M18 不在本子项宣告完成。

## 原业务依据与明确差异

`RateLimitService.acquireMinInterval` 在共享 map 的锁内等待，按实际唤醒时间设置下一次许可；非正间隔直接返回且不修改 map。三个调用方的计时从申请许可前开始，使用 `System.nanoTime` 并截断到整数毫秒，包含等待/操作，不包含重试退避或日志写入。

| 调用方 | platformCode | policyKey |
| --- | --- | --- |
| FollowerMonitorService.fetchWithRetry | bilibili | 实际 card / relation endpoint |
| LiveMonitorService.fetchWithRetry | bilibili-live | 实际 REST endpoint |
| LiveRankService.fetchWithLog | bilibili-live | live-rank（所有榜单共用） |

`CollectTaskExecutor` 调用的 `acquire` 在原项目为空实现，不擅自为其增加限制。直播昵称查询直接走独立 profile，不纳入此限流。研究材料已查本地 API 参考 user/info、status_number、live/info、guard；不把历史文档当当前协议验证。

客户端适配：Java 不保证锁公平性，客户端按到达顺序排队；队列最多 256 个申请（含正在等待者），满时返回 `LOCAL_RATE_LIMIT_BUSY`，可重试，不发起 HTTP/写 API 失败。原线程池/锁无对应独立队列配置，此上限是本地内存背压而非平台限频规则。

### Task 1：真实调用链差异回归

**Files:**
- Create: `packages/core-runtime/src/bilibili-shared-rate-limit.test.ts`
- Reuse: `packages/core-runtime/src/__fixtures__/follower-configuration.ts`、`live-lifecycle.ts`

**Interfaces:** 使用 `LocalCoreRuntime.start`、addBilibiliFollowerMonitor / addBilibiliLiveRoom / refreshBilibiliLiveRanks；仅替换外部 Source。真实 Core、SQLite、配置加载和停止逻辑保留。

- [x] 写并运行失败测试：已有一个粉丝许可，下一粉丝在等 100ms，此时直播与榜单申请均不得绕过该等待。断言 `expect(live.calls).toHaveLength(0)`、`expect(rankCalls).toHaveLength(0)`；现实现应失败。
- [x] 三路 API 结果故意保留 `durationMs: 1`，让实际合成操作等待 5ms；读取 SQLite 断言总耗时包含限流，成功/失败均不等于 Worker 的 1ms。补重试间隔不累计、整数截断及墙钟跳变测试。
- [x] 运行：`. .\scripts\activate-environment.ps1` 后 `& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-shared-rate-limit.test.ts`，记录真实断言 RED。

### Task 2：共享许可、取消与接线

**Files:**
- Create: `packages/core-runtime/src/local-request-rate-limiter.ts`、`local-request-rate-limiter.test.ts`
- Modify: `packages/core-runtime/src/bilibili-follower-service.ts`、`bilibili-live-service.ts`、`bilibili-live-rank-service.ts`、`local-core-runtime.ts`

**Interfaces:**
```typescript
interface RateLimitRequest {
  platformCode: string
  policyKey: string
  minIntervalMs: number
  signal: AbortSignal
  sleep?: (milliseconds: number) => Promise<void>
}
// new LocalRequestRateLimiter(now: () => Date)
// acquire(request: RateLimitRequest): Promise<void>
// 服务 options 增加 rateLimiter?: LocalRequestRateLimiter；未注入时拥有独立实例。
```

- [x] 对公共服务先复现并发榜单/迟醒聚集；限流器单测覆盖独立键、非正值绕过、不提前预留、实际唤醒重计、取消排队/活跃等待、满队列恢复、大定时器分段。
- [x] 最小实现有界 FIFO 申请集合和单个活跃等待；停止立即移除申请、清定时器、拒绝 `CORE_STOPPED`。晚到的注入 sleep 结果不得更新时间。下一位等待不需要等上一个 HTTP。
- [x] 接线如下，三服务传同一实例，键按上表，不改变 HTTP、重试和 fallback。
```typescript
const rateLimiter = new LocalRequestRateLimiter(normalized.now)
// 三个服务的 options 对象都增加 rateLimiter。
// 每次尝试开始：
const startedAt = performance.now()
await this.rateLimiter.acquire({ platformCode: "bilibili-live", policyKey: "live-rank",
  minIntervalMs: Math.max(0, this.options.requestMinIntervalMs ?? 1_500),
  signal: this.lifetime.signal,
  ...(this.options.sleep ? { sleep: this.options.sleep } : {}) })
// 成功/失败 API 日志中：
const durationMs = Math.max(0, Math.floor(performance.now() - startedAt))
```
- [x] 申请放在 Source 错误处理外，背压不误记为平台错误；Follower/Rank 成功日志放在 Source catch 外，不因写库失败额外记录平台失败或再次抓取。
- [x] 定向测试、原 lifecycle/policy/HTTP 回归和 TypeScript 检查通过。

### Task 3：复核、全量验证与交接

**Files:** Create `docs/implementation/2026-09-26-shared-rate-limit-audit.md`；更新 `docs/implementation/2026-09-13-full-migration-tracker.md`、`2026-09-13-migration-handoff.md`、`docs/development.md`。

- [x] 按请求代码审查技能做只读复核，发现问题先 RED 后修复。
- [x] 运行 `.\check.cmd`，记录实际测试数、类型、格式、构建、D盘检查，不沿用历史通过数。
- [x] `git -c core.autocrlf=false diff --check`，检查新增文件空白、测试标记、两仓库状态与项目残留进程。
- [x] 记录已完成和剩余差异。下一项仍是原完整解析/绑定域及 M09–M18；不把本项作为全量完成。

## 执行结果

本子项已完成。新增29项回归；最终全量检查Node1044/Python376、类型/格式/构建/D盘检查通过，独立复核无剩余问题。首轮并发榜单测试含旧计时API与假时钟混用因素，不将其误记为纯业务RED；跨服务排队和三路耗时差异已有真实断言RED，迟醒等单测为补覆盖，完整经过见本轮审计。复核发现的成功/失败日志异常边界另补RED后修复。用户最新要求完成本功能后结束，因此只记录并暂停，不开始下一项、不提交推送。
