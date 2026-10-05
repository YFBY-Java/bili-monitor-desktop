# M08/M10 榜单 HTTP 配置与长请求生命周期 Implementation Plan

> **For agentic workers:** 本轮按 test-driven-development 内联实现，requesting-code-review 只读复核；不派发实现代理，不提交或推送。

**Goal:** 将原榜单三个 HTTP 端点及它们依赖的 WBI 请求接入本地直播 HTTP 配置，支持健康长请求并在客户端退出时终止榜单工作。

**Architecture:** 复用已验证的四项 HTTP 配置契约，Core 在构造榜单 Source 时传递配置，Python 使用 HTTPX 的连接/读取分阶段超时。榜单与 WBI 不共用 Referer 规则；复用 opt-in 存活协议。Rank 服务的取消边界与 Core 的数据库关闭顺序一起验证。

**Tech Stack:** TypeScript/Zod、Python/Pydantic/HTTPX、SQLite、NDJSON、Vitest/pytest。

**Readability:** 只写 TypeScript、Python 和声明式配置，不新增 C/C++/Rust/Java 或工具链。

## Global Constraints

- 原 `D:\codex_work\BiliMonitor` 基线 `fa2faa6` 只读不启动；客户端基线 `b2e5a89`、干净工作区。所有运行命令先加载 `scripts/activate-environment.ps1`，全部缓存/临时数据在 D 盘。
- 依据原 `BilibiliLiveRankApiClient` 构造器和 requestFactory：三个榜单接口共用 liveProperties connect/read/UA/Referer。原 `BilibiliWbiSigner` 构造器固定 Referer=`https://www.bilibili.com/`，其他三项仍来自 liveProperties。
- 保持固定端点、原榜单 query、CAS/SQLite 链路，不透传任意 URL/Cookie/Auth。旧请求不要求新增字段。
- HTTPX connect/read 0→None，无独立总耗时预算；Main/Core/Python 的有效存活只续期无响应看门狗，不表示结果成功。
- 本轮 HTTP 子流程不冒充完整 M10：排行榜类型/查询/解析域/页面参数/重试分类等仍须逐业务复审。弹幕 Node HTTP 消费链（DanmuInfo、SPI、WBI）已核对其配置与固定首页 Referer 差异，作为下个独立链路迁移；M01–M18 总目标保持。

## Task 1: 榜单及 WBI HTTP 配置贯穿

**Files:** 修改 `packages/contracts/src/bilibili-live-rank.ts`；新增 `schemas/bilibili-live-rank-worker.v1.schema.json`；扩展共享 HTTP fixture 的 TS/Python 测试；修改 `packages/core-runtime/src/bilibili-live-rank-worker-source.ts`、`local-core-runtime.ts`、`workers/python/src/bmd_workers/bilibili_rank.py`。

**Interfaces:** `BilibiliLiveRankWorkerRequestSchema.httpConfiguration?: BilibiliLiveHttpConfiguration`；Source 构造器第二参数可选；Pydantic 继承 `BilibiliLiveHttpRequest`，省略时不输出该字段。

- [x] RED：共享 15 个 HTTP 配置样例验证榜单请求；实际 HTTPX MockTransport 检查三个榜单端点、WBI 的默认/自定义/0 超时、Referer 差异和无凭据。原请求不含配置仍可执行。
- [x] GREEN：Core 从只读配置提取四字段并交给 REST/Rank Source；Python 显式构造配置，导航请求仅覆盖 Referer。

```python
configuration = request.http_configuration or BilibiliLiveHttpConfiguration()
async with httpx.AsyncClient(timeout=configuration.timeout(), headers=configuration.headers()) as client:
    # Only WBI uses the homepage Referer; the remaining request headers stay configured.
    response = await client.get(ENDPOINT_URLS[endpoint], params=params,
        headers={"Referer": "https://www.bilibili.com/"} if endpoint == WBI_NAV_ENDPOINT else None)
```

- [x] 实际 Core→Python→HTTPX→SQLite/CAS 测试：磁盘配置与原环境别名均有效；三榜单路径和在线榜备用路径；配置文件字节不变、不访问用户库。

## Task 2: 榜单存活和退出取消

**Files:** `packages/contracts/src/runtime-protocol.ts`、`workers/python/src/bmd_workers/request_lifetime.py`；扩展 `python-request-lifetime.test.ts`、`core-request-lifetime.test.ts`、`core-startup-configuration.test.ts`；修改 `bilibili-live-rank-service.ts`、Core 停止顺序；新增 Rank 生命周期测试。

**Interfaces:** Worker 白名单追加 `bilibili.live.rank.fetch`，Core 追加 `bilibili-live.ranks.refresh`；Rank `stop()` 立即 abort，入口/await 后/写库前检查 `CORE_STOPPED`，取消不能转为备用接口或下一个榜单。

- [x] RED：HTTP 配置为 0 的 rank 请求仍启用 keepAlive；虚拟时钟 >35/90秒只由有效帧续期，最终结果仍使用榜单 Schema。真实 Core entry 输出 rank 存活帧。
- [x] RED：暂停在 fetch、限流等待时退出；迟到成功/失败均不落库、不继续备用/下页/其他榜单；Core 不等其他 Worker 停完才禁用 Rank。
- [x] GREEN：追加白名单；Rank AbortController 守卫与可取消 timer；Core 同时发起所有采集服务 stop，再关库。

```ts
private ensureRunning(): void {
  if (this.lifetime.signal.aborted) throw new CoreApplicationError("CORE_STOPPED", "本地榜单采集已停止。", false)
}
// In every fetch catch, check cancellation before logging or selecting fallback.
```

- [x] 补真实 Python 输出管道失联验证：只替换测试 HTTP 传输为可等待响应，关闭父进程读管道；确认子进程退出、活动请求 finally 取消。健康实际长请求也跨越测试看门狗但仍获得最终响应。不增加固定端口或业务 HTTP Server。

## Task 3: 全量验证、独立复核、台账

- [x] `pnpm --filter @bmd/contracts test`，Core/desktop 指定新增测试，`python -m pytest workers/python/tests/test_rank_http_configuration.py workers/python/tests/test_request_lifetime.py`。
- [x] 独立只读检查 HTTP 默认/Referer、原请求兼容、停止传播；修复新增 Critical/Important。
- [x] `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`；无生产夹具/孤儿 Worker、原 B/S 仍干净。
- [x] 更新 README、`docs/implementation/2026-09-13-rank-http-audit.md`、全量台账。本轮完成项与 Node 弹幕/完整 Rank 业务剩余项明确分开；不提交/推送/打包或启动真实应用。

**完成与停止：** 本计划当前功能已实现并验证，Node 792/Python 278、类型/格式/Electron构建/D盘检查通过，独立只读复核无新增Critical/Important。按用户后续指令在此结束，不执行下个业务；未提交或推送。全量剩余项见迁移台账与 `docs/implementation/2026-09-13-migration-handoff.md`，不得据本计划完成标记整个迁移完成。
