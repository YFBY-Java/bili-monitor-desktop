# M07 登录与弹幕连接联动 Implementation Plan

> **For agentic workers:** 按测试驱动流程在当前客户端内逐项执行；完成后使用 requesting-code-review 做独立只读审查。不自动提交或推送，不派发实现代理。

**Goal:** 将原凭据激活后的匿名弹幕升级迁移为本地真实业务链路，保留协议、自动/手动归属、逐房间失败隔离及撤销语义。

**Architecture:** AuthService在SQLite凭据/Outbox事务成功并缓存扫码结果后通知内部监听；Local Core将通知交给DanmakuService，不在扫码结果查询层推断事件。原Java synchronized操作在TypeScript中以有界串行队列适配，后台调度避免积压；退出立即关闭写入入口和Worker。

**Tech Stack:** 现有TypeScript、SQLite、Vitest及Node Realtime Worker。无新依赖、业务HTTP端口或数据库服务。

**Readability:** 新实现只用TypeScript；原Java仅只读参考，不新增C/C++/Rust/Java代码。

## Global Constraints

- 原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读、不启动；客户端起点 `e10cae8`。
- 所有测试库、工具和构建产物在D盘；运行前加载 `scripts/activate-environment.ps1`。
- 依据：原AuthService.completeLogin/revokeCurrentCredential、CredentialActivatedListener及测试、DanmakuService.reconnectAnonymousConnections/start/stop/sync/shutdown及测试、DanmuInfoClient.loginCredential。
- 原只升级active ANONYMOUS连接；已登录连接不强制切号。原撤销只停用凭据，不主动踢掉已建立WebSocket；下次建立连接不再读取已撤销凭据，不虚构远端退出功能。
- 保留实际使用协议0..3和autoManaged；一个房间升级失败不阻断其他房间；重复成功回读不再发起升级。
- M09协议/HTTP风控回退/全部调度规则、真人扫码及原生验收不因本子项测试通过而视为完成。

## Task 1: 激活事件和逐连接升级

**Files:** 修改 `packages/core-runtime/src/bilibili-auth-service.ts`、`local-core-runtime.ts`、`bilibili-live-danmaku-service.ts`；新增 `__fixtures__/login-connections.ts`、`bilibili-auth-activation.test.ts`、`bilibili-auth-danmaku-link.test.ts`、`bilibili-danmaku-upgrade.test.ts`（均位于core-runtime/src）。

**Interfaces:** AuthServiceOptions增加内部 `onCredentialActivated?: () => void`；DanmakuService提供 `reconnectAnonymousConnectionsAsync(): void`。原Renderer/IPC响应不变，不另造公开接口。

- [x] RED：真实Auth/Core/SQLite登录后升级一次；Worker仍返回匿名时，再次读取同一SUCCESS不重复断线；失败登录不触发；凭据提交后可供新连接读取。

```ts
const qr = await runtime.startBilibiliQrLogin()
await runtime.pollBilibiliQrLogin(qr.loginId)
await vi.waitFor(() => expect(source.starts).toHaveLength(2))
await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
await runtime.pollBilibiliQrLogin(qr.loginId)
await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
expect(source.starts).toHaveLength(2)
```

- [x] GREEN：在saveActiveBilibiliCredential事务返回、session.completed设置后通知监听；Core只转发事件。后处理错误不得回滚已成功登录，使用固定错误码/资源ID诊断，不输出Cookie或原始异常。

```ts
session.completed = completed
try {
  this.options.onCredentialActivated?.()
} catch {
  console.warn(JSON.stringify({ event: "bilibili.auth.activation-listener-failed", credentialId,
    code: "BILIBILI_AUTH_LISTENER_FAILED" }))
}
return completed
```

- [x] RED/GREEN：三房间中一个升级失败，下一匿名房间仍升级，已登录房间会话ID不变；保留实际协议及autoManaged。撤销/切号只影响之后建连，不主动中断已登录连接；有界异步任务不会阻塞扫码成功响应。
- [x] 运行定向测试，覆盖SQLite旧会话STOPPED、新会话CONNECTED/ERROR、失败不影响已保存凭据；记录原本已有行为而非全声称新实现。

## Task 2: 原串行语义与本地退出适配

**Files:** 继续修改 `bilibili-live-danmaku-service.ts`、`local-core-runtime.ts`，新增 `bilibili-danmaku-lifecycle.test.ts`；同一退出边界修改 `bilibili-live-danmaku-worker-source.ts`、`ndjson-realtime-worker-transport.ts`，新增 `ndjson-realtime-worker-transport.test.ts` 与 `__fixtures__/realtime-pending-worker.ts`、`__fixtures__/realtime-unresponsive-worker.ts`。不扩大成M09全部实现。

**Interfaces:** 保留start/stop/syncAutoConnections/reconnectAnonymousConnections/stopAll；内部串行队列上限100，自动sync同时只保留一次在途任务。stopAll为终止服务，幂等且先禁止新操作/事件落库，再关闭source。

- [x] RED/GREEN及补充验证：升级与手动停止/协议切换/另一次真实激活不能并行制造两个句柄；匿名回退后第二次真实激活仍执行，不因合并丢失。先前连接的迟到结果不能覆盖新连接。退出在等待其他Worker时也立即取消弹幕落库；迟到credential/start/事件不访问已关闭数据库或重启Worker。

```ts
const gate = authGate()
source.startWait = gate.wait
const pending = service.reconnectAnonymousConnections()
await gate.started
const stopped = service.stop(roomMonitorId)
gate.release()
await pending
expect(await stopped).toMatchObject({ running: false, status: "STOPPED" })
```

- [x] GREEN：原同步临界区映射为受控串行操作；内部调用不再递归排队。异步边界验证服务状态和句柄身份；退出同步清句柄并记录STOPPED，迟到异常不覆写终态。Core首次await前同时开始停止Auth、Follower和Danmaku服务。
- [x] 验证队列错误后下一项仍可执行、队列有界、自动tick合并；关闭事件在start完成前到达时不伪装CONNECTED。
- [x] 复审补强：stop数据库失败也在finally关闭socket；terminal WorkerSource不等待stopAll ACK，直接停止专属transport。真实子进程从存在到ESRCH验证退出，在途请求取消且不能重启；旧listener与昵称lookup在DB关闭后不落库。
- [x] 独立只读审查并修复重要问题；完整check.cmd、git diff --check、生产fixture扫描及原仓库clean复验。更新README与迁移台账，保留M07/M09/M18剩余边界。

## 核验命令

```powershell
. .\scripts\activate-environment.ps1
pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-auth-activation.test.ts src/bilibili-auth-danmaku-link.test.ts src/bilibili-danmaku-upgrade.test.ts src/bilibili-danmaku-lifecycle.test.ts src/ndjson-realtime-worker-transport.test.ts
.\check.cmd
git diff --check
git -C D:\codex_work\BiliMonitor status --porcelain
```

## 执行结果

- 本轮新增31项定向回归；独立复审的重要问题已关闭，随后补了两次真实激活依次使用新账号的回归。
- 最终完整 `check.cmd` 退出0：Node454项（Core174、Desktop169）、Python77项；TypeScript/mypy、Black/isort、Electron生产构建及D盘路径检查通过。
- `git diff --check`通过，生产包没有本轮合成fixture；测试Worker进程已退出。原仓库仍为 `fa2faa6` 且工作区干净。未自动提交/推送、未启动或修改原项目、未重启已安装客户端/打安装包、未访问真人平台或用户库。
- 本计划仅关闭登录连接联动的代码/自动验证子项；M07真人/原生验收、M08–M18均继续保留，下一步M08直播REST监控逐操作核对。
