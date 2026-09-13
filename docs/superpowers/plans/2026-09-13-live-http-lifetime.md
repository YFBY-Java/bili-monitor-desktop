# M08 直播 REST HTTP 配置与请求存活 Implementation Plan

> **For agentic workers:** 内联按 test-driven-development 执行，再 requesting-code-review 只读审查；不派发实现代理，不提交或推送。

**Goal:** 把原直播REST的连接/读取超时、User-Agent和Referer接入真实Core→Python链路，并消除健康长请求被固定35/90秒外层时限截断的问题。

**Architecture:** 复用D盘启动配置，四个HTTP字段通过窄化Worker请求传递，不扩展环境白名单。RuntimeEnvelope新增可选keepAlive（旧请求不发送额外消息）；选定直播请求每5秒发送存活帧，外层固定时限用作无消息看门狗，而不是总业务耗时上限。Worker进程失联须停止活动工作；Core退出仍取消全部采集。

**Tech Stack:** TypeScript、Zod、Python/Pydantic、HTTPX、NDJSON、Electron MessagePort、Vitest/pytest。

**Readability:** 不新增C/C++/Rust/Java，不安装依赖、业务服务或工具链。

**提交检查点（2026-09-13）：** 用户后续明确要求“提交代码”，覆盖本计划原先“不提交”的执行约束。现保存已实现的策略、四个 REST 端点 HTTP 配置和存活协议增量；完整检查通过，具体证据与仍未完成的实机管道验收见 `docs/implementation/2026-09-13-live-http-lifetime-audit.md`。不因本次提交声称计划或全量迁移完成，不推送远程。

## Global Constraints

- 原B/S `D:\codex_work\BiliMonitor` fa2faa6 只读不启动；客户端HEAD 0b4dd57，保留上一轮八策略未提交修改。所有测试/缓存/数据库均D盘，不使用用户凭据或真实平台。
- 原LiveApiClient使用SimpleClientHttpRequestFactory和固定endpoint；connect/read默认5000/10000毫秒，0禁用对应超时。读取是数据块间等待，不能把connect+read当总耗时预算。
- 请求头默认保留原值；不得新增任意URL、Cookie、Authorization或环境透传。HTTPX采用ASCII头值，控制字符/不支持的字符在配置层明确拒绝，全集Spring绑定/字符编码等价不在此处冒认。
- keepAlive是显式opt-in兼容扩展，旧请求/响应保持旧形状。只接受匹配已知请求id/type/trace的帧，不当成业务结果。Core按请求刷新看门狗；Python单执行通道的有效存活也覆盖已排队的直播请求，不能让队列等待35秒就误超时。
- 存活帧不声称业务有进展；readTimeout=0可一直等待，退出/失联负责取消。HTTP错误仍由原分类/重试策略处理。
- 本计划先完成四个REST端点和包含它们的Core命令；Rank/WBI/弹幕HTTP消费者单列续迁，不因共享四字段就宣称已接入。M08 storageEnabled/解析/并发限流/耗时统计及M07/M09–M18完整目标不变。

## Task 1: 四项HTTP配置实际进入Python

**Files:** 新增 packages/contracts/src/bilibili-live-http.ts；修改同包index、bilibili-live.ts、bilibili-live-configuration.ts及相关schemas/fixtures/tests；新增 workers/python/src/bmd_workers/bilibili_live_http.py、tests/test_live_http_configuration.py；修改 bilibili_live.py、runtime.py、Core live-worker-source/local-core-runtime/config-loader；新增 Core http配置集成测试。

**Interfaces:** BilibiliLiveHttpConfigurationSchema及其inferred type，字段connectTimeoutMs/readTimeoutMs/userAgent/referer；Live Worker base请求可选httpConfiguration；Python同名Pydantic配置。旧请求未传用默认，Core从实际配置显式传给BilibiliLiveWorkerSource。

- [ ] RED：TS/Python共享默认/自定义/0/非法值，实际请求扩展的timeout和headers（MockTransport只替换网络）；NDJSON返回CAS和中文输出不变；Core磁盘/环境非默认值贯穿实际Python进程。
- [ ] GREEN：配置合并四字段，超时0→None；不设额外写入/连接池总期限，固定原endpoint。

```python
timeout = httpx.Timeout(None, connect=config.connect_timeout_ms / 1000 or None,
                        read=config.read_timeout_ms / 1000 or None)
```

## Task 2: 可协商存活帧与失联终止

**Files:** runtime-protocol.ts、runtime-envelope.v1.schema.json、Python protocol.py/runtime.py；Core ndjson-python-worker-transport.ts；Desktop core-client.ts/core-process.ts；新增对应协议/传输/实际宿主测试。

**Interfaces:** RuntimeEnvelope.keepAlive?: boolean；RequestKeepAliveSchema={requestType:string}；worker.request-alive/core.request-alive；固定5000ms间隔。选定Core直播add/refresh及subjects create/bind请求启用；Python仅4个REST请求启用。

- [ ] RED：健康帧超过原总时限仍等待最终结果，帧不能解决Promise；错误id/type/trace不能续期，旧请求仍正常超时。并发排队的直播请求不因其他健康长请求而提前失败。
- [ ] GREEN：发送opt-in；发/收方显式allowlist，只有有效存活刷新看门狗。Python等待HTTP期间异步发送帧，发送失败时取消活动协程并退出；超时的Python传输终止Worker并拒绝pending，避免迟到继续写。Core同理在失联时停止进程。

```ts
if (envelope.type === "worker.request-alive") {
  // Validate request type, id, correlation and trace before refreshing the watchdog.
  return
}
```

- [ ] 测试停止/错误/最终响应均清timer，实际Python输出管道断开后工作被取消；保留旧stdin一次性请求兼容，不借助真实平台或固定端口。

## Task 3: 验证与台账

- [ ] 更新README、配置示例、M08台账、docs/implementation/2026-09-13-live-http-lifetime-audit.md，区分已接REST与未接其他消费者，记录官方HTTPX/Spring依据。
- [ ] 独立只读复核，修复Critical/Important；完整 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`。
- [ ] diff/生产夹具/孤儿进程/原库只读检查。保留全量目标；不打包、不重启用户应用、不提交推送。
