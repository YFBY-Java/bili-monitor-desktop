# M06 粉丝完整链路与本地退出适配 Implementation Plan

> **For agentic workers:** 使用适用的内联测试驱动流程逐任务实现；完成后独立只读审查，不派发实现代理，不自动提交或推送。

**Goal:** 以原粉丝 Controller/Service/Repository 和页面为依据，验证全部操作闭环，修复本地退出后悬挂采集仍可能请求/写库的问题。

**Architecture:** 保留 Preload 窄化 API → Main 路由 → Local Core → SQLite/Worker。原服务的业务规则不变；桌面 Core 停止是新的生命周期边界，取消不是平台采集失败。

**Tech Stack:** TypeScript、React、SQLite、Vitest、现有 Python Worker。

**Readability:** 只用现有可读语言，不增加 C/C++/Rust/Java 或依赖。

## Global Constraints

- 原 `D:\codex_work\BiliMonitor` 的 `fa2faa6` 只读，不启动、不改写。
- 客户端基线 `e014fa9`。缓存、测试库和构建都留在 D 盘，不访问真实凭据/数据库/平台。
- M07 登录及 M08–M18 不以本项回归代替；原生应用重启/安装包验收另列。
- 不添加业务 HTTP Server、Renderer 平台调度、测试专用生产 API。

## Task 1: 取消粉丝采集生命周期

**Files:** Modify `packages/core-runtime/src/bilibili-follower-service.ts`; Create `packages/core-runtime/src/bilibili-follower-lifecycle.test.ts`; Extend `bilibili-follower-scheduler.test.ts`。

**Interfaces:** 保持现有 `addUser/refreshNow/collectDueUsers/stop`；停止后的手动任务返回稳定 `CORE_STOPPED` 错误，批任务停止取下一个用户。不改共享响应结构。

- [x] 先复现：限流等待后仍发请求；重试等待后继续尝试；已停止后的迟到成功落库；退出被记成平台失败；停止后仍消费同批下一个用户。

```ts
const pending = service.refreshNow(user.id).catch(error => error)
await vi.advanceTimersByTimeAsync(0)
await service.stop()
await vi.advanceTimersByTimeAsync(10_000)
expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
expect(service.listUsers().items[0]).toEqual(user)
```

- [x] 运行 `pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-follower-lifecycle.test.ts`，最初6项均为行为失败。
- [x] Service 内增加停止状态与可取消等待。网络调用前后、重试/回退前、落库前检查停止；取消不写 API 失败和业务失败，批循环退出。保留原 1500ms 限流、重试次数和回退类别。

```ts
private ensureRunning(): void {
  if (this.lifetime.signal.aborted) throw new CoreApplicationError("CORE_STOPPED", "本地粉丝采集已停止。", false)
}
```

- [x] 验证任务停止后没有新调用/快照/失败排程，Core 真正关闭数据库后没有迟到写入或未处理拒绝；重开仍保留旧排程。

## Task 2: 原操作闭环证据

**Files:** Create `apps/desktop/src/main/follower-workflow.integration.test.ts`; update README、全量台账、本计划。

**Interfaces:** `createDesktopBridge` 校验输入/输出；`dispatchBusinessRequest(runtime,envelope)` 执行真实服务与 SQLite。测试仅替换 Electron 传输和外部平台 source，不替换业务服务。启停使用 `LocalCoreRuntime.start/stop`，重开同一隔离目录。

- [x] 用合成平台响应验证：首次失败不创建；成功添加首快照；暂停后手动刷新不启用；暂停修改间隔不改排程；重复添加复用 ID 并启用；启用后按新间隔排程；风控失败保留数据并退避；历史/趋势结果；退出重开后保留用户与历史；删除级联并且再次查询 NOT_FOUND。

```ts
const user = await bridge.bilibiliFollowers.add({ mid: "2", intervalSeconds: 60 })
await bridge.bilibiliFollowers.updateStatus({ userId: user.id, enabled: false })
await bridge.bilibiliFollowers.refresh({ userId: user.id })
expect((await bridge.bilibiliFollowers.list()).items[0]?.monitorStatus).toBe("PAUSED")
```

- [x] 已有行为直接通过则记录为审计证据，不声称新实现/RED。发现实质差异才先失败后修复。
- [x] 对照原操作逐项写证据表；独立只读审查；完整 `check.cmd`、`git diff --check`、生产 fixture 排查与原仓库状态复验。
- [x] M06 代码及自动闭环验收通过，进入 M07 源码预检；真人与安装包验收保持未完成，不自动提交/推送。

## 执行结果

- 初始6项生命周期行为失败后修复；另补1项手动在途取消。审查发现2处外层错误传播边界，补2项双微任务回归先失败后修复，复查无遗留问题。
- 生命周期9项 + 调度2项（含原有1项）定向通过。新增实际Preload校验/Router/Core/SQLite完整业务流程1项通过，没有模拟业务写入或返回成功。
- 最终全量 `check.cmd` 退出0：Node378、Python54，类型/格式/构建/D盘路径通过。原项目`fa2faa6`工作区干净，生产包无本轮fixture。
- 审计矩阵：`docs/implementation/2026-09-13-follower-workflow-audit.md`。没有改契约/数据库schema/Worker/依赖；没有自动提交/推送、重启已安装应用、打包或真人平台验证。
- 下一步M07：原登录Service/SessionStore/PassportClient及两前端组件已只读预检，当前UI确实缺未登录刷新、等待扫码刷新二维码、分字段复制、全部复制的部分账号/到期字段；原测试和Worker及连接升级链路仍需进一步核验，不能仅凭源码预检勾为完成。
