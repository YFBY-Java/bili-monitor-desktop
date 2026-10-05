# 弹幕 HTTP 配置与可取消连接 Implementation Plan

> **For agentic workers:** 按任务在当前会话内使用 test-driven-development 执行；完成前 verification-before-completion。无需另起实现代理，不自动提交。

**Goal:** 将原直播 HTTP 四项配置贯穿到弹幕 SPI、WBI、DanmuInfo，允许健康的长请求完成，同时保证停止能取消在途连接。

**Architecture:** 复用现有只读启动配置和共享校验。Node Worker 使用独立 HTTPS 请求适配器控制连接与读取空闲超时；在途 start 的显式存活帧只延长看门狗，不充当业务成功。连接尝试使用 AbortController，停止、替换、退出都清理同一尝试拥有的 HTTP/WebSocket。

**Tech Stack:** TypeScript、Node 内置 HTTPS/stream/zlib、既有 ws、Zod、Vitest、现有 Python JSON Schema 验证。

**Readability:** 只新增可读 TypeScript 和测试/声明式配置，不新增 C/C++/Rust 或依赖安装。

**完成记录（2026-09-25）：** 本计划子项已实现并通过独立只读复核；最终完整 `check.cmd` 退出 0，Node 853 / Python 294，类型、格式和生产构建通过。下方勾选表示对应实现/验证已完成；新模块首次不存在的失败不算旧业务 RED，实际先失败再修复和后补覆盖的区别见[审计证据](../../implementation/2026-09-25-danmaku-http-audit.md)。全量迁移尚未完成，未自动提交/推送。

## Global Constraints

- 原 B/S `D:\codex_work\BiliMonitor`（fa2faa6）只读、不启动；保留已有未提交 Rank 增量。
- D 盘工具/临时目录/测试数据；不使用用户数据库、真实凭据或平台请求。
- 不新增业务监听端口，不重启已安装客户端，不提交/推送。
- 这只完成 M08/M09 的 HTTP 子项；storageEnabled、完整弹幕/榜单/场次及 M09–M18 不因本项而豁免。

## 原源码及差异

原 `backend/src/main/java/com/socialmonitor/bilibili/live/danmaku/client/` 的 `BilibiliLiveDanmuInfoClient.java`、`BilibiliAnonymousCookieProvider.java`、`BilibiliWbiSigner.java` 均读取 LiveProperties 的 connect/read/UA。DanmuInfo 读取配置 Referer，SPI/WBI 固定 `https://www.bilibili.com/`。默认 5000/10000，0 表示该阶段不设超时，不是 connect+read 总期限。

客户端当前全为 `fetch + AbortSignal.timeout(10000)`；Realtime transport 30 秒、Main 90 秒会提前终止，Worker 只管理已连接 socket，stop 未管理待完成 start。原匿名降级/风险刷新逻辑本次保留，完整业务等价另列 M09。

本地 API 资料：`D:\codex_work\bilibili-API-collect-new\docs\live\message_stream.md`、`docs/misc/buvid3_4.md`、`docs/misc/sign/wbi.md`，只作资料，不代表当前协议实测。

## Task 1：共享输入与 HTTP 适配器

Files: `packages/contracts/src/bilibili-danmaku-worker.ts`、对应 portable schema/fixture 验证；`workers/node-realtime/src/bilibili-http.ts` 及测试；`bilibili-danmaku-connection.ts` 及测试。

Interfaces: `BilibiliDanmakuWorkerStartSchema` 包含 connectionId、roomId、protocolVersion、credential、可选 httpConfiguration；HTTP 使用 `getBilibiliJson(url, { configuration, headers, signal })`，返回 status/ok/json。网络失败只暴露安全固定消息。

- [x] 配置回归：配置共享 fixture 全量进入新请求；三端点 UA/Referer 不同、0 超时、旧调用默认；网络读取不能在总 10 秒取消。原配置注入差异已先复现后修复。
- [x] 适配器覆盖：连接超时、连接成功后的读取空闲超时、分段响应延长读取、取消、坏 JSON、压缩/体积及重定向边界；新文件首轮模块缺失不计业务 RED。
- [x] GREEN：独立连接 timer；TLS 成功后 socket 空闲超时，失败必须 destroy；信号贯穿整个 body。固定 HTTPS B 站 API 主机白名单，重定向上限 20、跨 origin 不转发 Cookie；响应/解压均限 8 MiB；保持 gzip/deflate/br 读取能力。
- [x] 验证入口：`. .\scripts\activate-environment.ps1; & $env:BMD_PNPM_CMD --filter @bmd/realtime-worker test`，契约：`--filter @bmd/contracts test`。

```ts
const configuration = BilibiliLiveHttpConfigurationSchema.parse(input.httpConfiguration ?? {})
// getDanmuInfo: configuration.referer; SPI/nav: https://www.bilibili.com/
expect(await starting).toMatchObject({ authMode: "ANONYMOUS" })
expect(requests.map(item => item.headers.Referer)).toEqual([
  "https://www.bilibili.com/", "https://www.bilibili.com/", configuration.referer
])
```

## Task 2：Worker start 生命周期与 Core 配置贯穿

Files: `workers/node-realtime/src/process.ts`、独立 `realtime-session-manager.ts` 及测试；Core `bilibili-live-danmaku-worker-source.ts`、`local-core-runtime.ts`、`bilibili-live-danmaku-service.ts` 及对应回归。

Interfaces: start 输入新增 `httpConfiguration` 和仅进程内 `signal`；manager 按 connectionId 拥有 controller/connection/promise，stop 中断正在开始的请求。源构造器可选共享 HTTP 配置；Core 默认源传入已有提取值。

- [x] 生命周期回归：挂起 HTTP stop/stopAll 不等待默认期限，替换同 ID 不接收旧结果；认证阶段取消不回退下一 host/protocol；Core 停止不排在无限 start 后。Core 停止/队列与连接取消差异先复现后修复，manager 新模块另记补覆盖。
- [x] GREEN：取消先于等待，迟到结果关闭不注册，已停止实例拒绝新请求；输出通道失联立即停止并退出。错误不包含原始 URL/headers/token。
- [x] GREEN：配置仅由 Core 启动文件/env 传入，保持旧无字段请求兼容，不开放 Renderer 任意 HTTP 参数。
- [x] 验证：`--filter @bmd/core-runtime test`；真实进程 fixture 只替换网络边界，不修改生产解析/连接/管理器。

```ts
const starting = service.start({ roomMonitorId: id }).catch(error => error)
await gate.started
expect((await service.stop(id)).running).toBe(false)
gate.release()
expect(await starting).toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_ENDED" })
```

## Task 3：双层存活、验证和交接

Files: `ndjson-realtime-worker-transport.ts` 及测试；`runtime-protocol.ts`、Main lifetime 测试；README、迁移台账及 `docs/implementation/2026-09-25-danmaku-http-audit.md`。

- [x] 存活回归：start 显式 keepAlive 之后超过 30/90 秒仍等待真实结果；错误 ID/connectionId 不续期；stop 不接收保活；旧调用不产生额外帧。Main 未 opt-in 已先复现后修复，协议边界另补覆盖。
- [x] GREEN：5 秒 request-alive，验证请求身份后续期；无响应销毁 child 并拒绝全部在途请求，旧 child 事件不得污染替代实例；停止释放全部 timer/listener。
- [x] 完整 `.\check.cmd`（仅进程级 `VITEST_MAX_WORKERS=2`），核对输出、类型、构建、D 盘和原库干净状态。
- [x] 独立只读复核；记录已完成/未完成和实际证据，不把自动 fixture 等同于真人平台/原生安装客户端验收。

```ts
for (let n = 0; n < 4; n++) {
  await vi.advanceTimersByTimeAsync(60_000)
  respond(request, { requestType: request.type })
  expect(settled).toBe(false)
}
```

## 超时依据

Node 官方 [request.setTimeout](https://nodejs.org/api/http.html#requestsettimeouttimeout-callback) 和 [socket.setTimeout](https://nodejs.org/api/net.html#socketsettimeouttimeout-callback)：socket 空闲超时仅通知，必须主动销毁，0 关闭空闲期限。连接阶段单独计时，包含 DNS/TCP/TLS；TLS/系统解析的精细 Java 实现差异在审计中明确，不声称跨运行时所有边界完全相同。
