# M08 直播调度、退出与重启恢复 Implementation Plan

> **For agentic workers:** 按 test-driven-development 在当前工作区逐项实现，完成后用 requesting-code-review 独立只读复审；不派发实现代理，不自动提交或推送。

**Goal:** 将原直播监控的到期调度、暂停/恢复/间隔与重启恢复规则迁移为可安全退出的本地采集闭环。

**Architecture:** 原 Spring 固定延迟调度改为 Local Core 单一计时器；原 SQLite 监控状态和下次采集时间是重启依据，不从 UI 生命周期推导。Live service 立即建立停止边界，取消限流/重试等待，拒绝迟到成功/失败写入；实际 Python Source 停止在途 I/O。源端取消属于本地适配，不宣称原 Java 的中断循环已有同等保证。

**Tech Stack:** TypeScript、SQLite、Python 测试传输、Vitest/pytest；复用项目依赖。

**Readability:** 仅新增 TypeScript/Python/Markdown，不新增 C/C++/Rust/Java 工具链。

## Global Constraints

- 原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读、不启动；客户端基线 `c78797a`。
- `scripts/activate-environment.ps1` 激活 D 盘工具/缓存；只用 D 盘隔离测试库，不访问真实用户数据、凭据或真人平台，不新建服务器/监听端口。
- 原依据：`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/service/BilibiliLiveMonitorScheduler.java` 的 fixedDelay 默认1000ms、MonitorService 的 collectDueRooms/updateRoom/refreshNow、Repository 的 ACTIVE+到期+backoff过滤及 updateMonitor、Properties；原前端 LiveView 的单独开关/间隔请求。
- 与退出相关的取消和错误保护属于本地运行时适配。原宽松数字域、配置全量映射、完整直播UI及M09–M18/真人原生验收继续保留，不能以本计划代替全量迁移。

## Task 1: Live停止边界与迟到结果

**Files:** 新增 `packages/core-runtime/src/__fixtures__/live-lifecycle.ts`、`packages/core-runtime/src/bilibili-live-lifecycle.test.ts`；修改 `packages/core-runtime/src/bilibili-live-service.ts`。

**Interfaces:** 保留所有业务签名；`stop(): Promise<void>` 立即置停止状态且幂等停止source。新增私有 `ensureRunning(): void`、`wait(milliseconds: number): Promise<void>`；停止后手动请求抛 `CoreApplicationError("CORE_STOPPED", "本地直播采集已停止。", false)`，自动批只返回已完成项，不记平台错误。

- [x] RED：限流/重试等待取消，停止后0计时器/无新请求；在途新增/刷新成功或失败、batch缺UID或下批均不再写API日志、快照/事件/场次或退避；迟到异常跨await传播时优先返回停止。

```ts
const pending = service.refreshNow(room.id).catch(error => error)
await vi.advanceTimersByTimeAsync(0)
await service.stop()
expect(vi.getTimerCount()).toBe(0)
expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
expect(database.findBilibiliLiveRoomById(room.id)).toEqual(before)
```

- [x] GREEN：调用入口、每次等待/平台响应后、上层成功与catch分支、存储应用前检查生命周期。AbortController取消内部setTimeout并移除监听；保留原重试类别/次数及1500ms限流，source只stop一次。

```ts
stop(): Promise<void> {
  if (!this.stopPromise) {
    this.lifetime.abort()
    this.stopPromise = Promise.resolve().then(() => this.options.source.stop?.())
  }
  return this.stopPromise
}
```

- [x] 验证：`pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-lifecycle.test.ts src/bilibili-live-collection-parity.test.ts`；差异用例先失败后通过，原事务/重试回归不变。

## Task 2: 固定延迟调度与重启

**Files:** 新增 `packages/core-runtime/src/bilibili-live-scheduler.test.ts`；修改 `packages/core-runtime/src/local-core-runtime.ts`。

**Interfaces:** 保留 `LocalCoreRuntime.start/stop` 和现有 `schedulerDelayMs` 注入；Live默认1000ms，每批完成后再等1000ms；启动先执行一次到期扫描。Follower/Danmaku计时规则不变。Core.stop在等待其他Worker之前调用Live.stop。

- [x] RED：启动扫描、每秒调度但不绕过1500ms端点限流、长请求不重叠且完成后等固定延迟；关闭过程中其它Worker尚未停止时Live迟到结果不写库。暂停/恢复/间隔/退避持久化跨重启为已有行为，仅补验证。

```ts
await vi.advanceTimersByTimeAsync(1000)
expect(source.calls.filter(call => call.method === "status")).toHaveLength(1)
await vi.advanceTimersByTimeAsync(500)
expect(runtime.listBilibiliLiveRooms().items[0]?.onlineCount).toBe(102)
```

- [x] GREEN：将Live setInterval改为单次setTimeout串联，finally且未停止才安排下一次；内部异常输出固定结构化事件 `bilibili.live.scheduler-failed`/`BILIBILI_LIVE_SCHEDULER_FAILED`，不泄露SQL/原始平台信息，下一批继续。

```ts
void this.live.collectDueRooms().catch(() => {
  if (!this.stopped) console.warn(JSON.stringify({
    event: "bilibili.live.scheduler-failed", code: "BILIBILI_LIVE_SCHEDULER_FAILED"
  }))
}).finally(() => { if (!this.stopped) this.startLiveScheduler() })
```

- [x] 验证：`pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-scheduler.test.ts src/bilibili-follower-scheduler.test.ts`。用真实SQLite/服务和可控外部Source，不mock调度器或数据库；已有开关/间隔规则仅补覆盖，不冒充新增实现。

## Task 3: 真实Python退出链路与收尾

**Files:** 新增 `workers/python/tests/fixtures/live_pending/sitecustomize.py`、`packages/core-runtime/src/bilibili-live-shutdown-integration.test.ts`；更新 README、全量台账及 `docs/implementation/2026-09-13-live-lifecycle-audit.md`。

**Interfaces:** 复用真实 `NdjsonPythonWorkerTransport` / `BilibiliLiveWorkerSource` / runtime；test-only httpx MockTransport挂起外部HTTP，将合成请求PID写到隔离数据目录后等待，不改生产Worker、不访问平台。

- [x] 实际进程验证：真实调用 `service.addRoom({uid:"903"})`，条件等待测试标记证明HTTP已开始，验证PID存在，再`service.stop()`；pending返回CORE_STOPPED、PID已退出、SQLite无监控/日志/事件、未重启新Worker。此项验证Task 1已有实现的真实进程效果，不冒充新的RED/GREEN。

```ts
expect(() => process.kill(pid, 0)).not.toThrow()
await service.stop()
expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
expect(() => process.kill(pid, 0)).toThrow()
```

- [x] 独立只读审查无Critical/Important；完整`check.cmd`退出0（Node598/Python183），`git diff --check`、生产fixture/Worker残留排查、原仓库clean复验通过。更新证据和剩余范围，不自动提交/推送，不重打安装包或重启已安装应用。
