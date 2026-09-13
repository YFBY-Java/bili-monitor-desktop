# M08 直播 Python 解析与真实 Worker 链路 Implementation Plan

> **For agentic workers:** 使用 test-driven-development 在当前工作区逐项执行；完成后使用 requesting-code-review 独立只读审查。不派发实现代理，不自动提交/推送。

**Goal:** 将原直播 REST 的资料解析、空结果与错误分类迁移到真实 Python → NDJSON → Core 链路。

**Architecture:** 平台 HTTP 是测试中唯一替换的外部边界。真实 Python runtime、HTTP 参数构造、parser、CAS、NDJSON transport、WorkerSource 和 Core/SQLite 串联验证；生产路径不增加测试开关。Live 使用独立解析规则，不能改变 Follower/Auth 的既有规则。

**Tech Stack:** Python 3.11/Pydantic/httpx、TypeScript/Zod、SQLite、pytest/Vitest；不新增依赖。

**Readability:** 仅新增可读 Python/TypeScript/JSON，不新增 C/C++/Rust/Java 或工具链。

## Global Constraints

- 原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读且不启动；客户端起点 `fcc2920`。
- 先加载 `scripts/activate-environment.ps1`；测试库、HTTP证据、缓存、产物全部在 D 盘。不访问用户数据库、凭据或真人平台，不增加服务器/监听端口。
- 原依据：`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/client/BilibiliLiveApiClient.java`、`config/BilibiliLiveMonitorProperties.java`、`service/BilibiliLiveMonitorService.java`、`domain/BilibiliFetchedLiveRoomSnapshot.java` 和 `resources/db/migration/V4__bilibili_live_monitor.sql`。
- 本计划覆盖真实平台常用有效数据域的解析及错误链路。原宽松数值解析与客户端既有正ID/状态枚举/JS安全整数响应域的完整边界仍需逐项核对，不用本轮用例豁免该差异；原生 Electron/真人、M08生命周期/UI、M09–M18继续保留。

## Task 1: 字段与空结果

**Files:** 新增 `packages/contracts/fixtures/live-worker-responses.json`、`packages/contracts/src/bilibili-live-worker-contracts.test.ts`、`workers/python/tests/test_live_worker_parity.py`、`workers/python/src/bmd_workers/bilibili_live_values.py`；修改 `workers/python/src/bmd_workers/bilibili_live.py`、`packages/contracts/src/bilibili-live.ts`。

**Interfaces:** 保留四个 `parse_*_response` 和 `fetch_live_endpoint(endpoint, payload, data_directory)`；保留 `BilibiliLiveWorkerSource` 方法。zero short/area/parent ID不再复用正UID校验；`uname`非空文本保留原空格，不在跨语言校验时trim。共享fixture包含原HTTP body和预期snapshot/error，TS/Python共用。

- [x] RED：0分区优先于旧分区、0 short ID；昵称空白→`UID 22`，非空白首尾空格保留；无有效UID的条目跳过、重复有效UID最后值覆盖但位置不变；旧接口无房不输出`snapshot:null`。

```ts
expect(BilibiliLiveSnapshotDataSchema.parse({ uid: "22", roomId: "33", liveStatus: 0,
  shortId: "0", areaId: "0", parentAreaId: "0", uname: " 主播 " })).toMatchObject({ uname: " 主播 ", areaId: "0" })
```

- [x] RED：Live独立文本/数字解析，不把对象/数组变字符串、不把带空格数字当合法优先字段；旧camel状态解析失败后才回退snake字段。数字时间截去小数，字符串按原上海时区及原日期解析规则转换，不擅自trim。

```python
assert parse_room_info_old_response('{"code":0,"data":{"roomid":33,"liveStatus":"x","live_status":1}}', "22", NOW)["liveStatus"] == 1
```

- [x] GREEN：Live模块移除Follower的文本/数字/成功判断复用，新增独立纯解析辅助函数；旧接口无房返回仅metadata。修改后运行 `pytest workers/python/tests/test_live_worker_parity.py workers/python/tests/test_bilibili_live.py` 和 contracts定向Vitest。

## Task 2: HTTP与错误分类

**Files:** 继续修改 `bilibili_live.py`；补 `test_live_worker_parity.py`。

**Interfaces:** 保留 `BilibiliCrawlerError(code,message,retryable,endpoint,status_code,bili_code)`，runtime及TS错误类型不改形状。

- [x] RED：业务码 -101→AUTH_EXPIRED，-352/-412→RISK_CONTROL，其余→UNKNOWN；500与-500的raw retryable=true，不改Core按类别重试；code=0不套用Follower的voucher规则；HTTP 429/5xx/其他4xx分别RATE_LIMITED/SERVER_ERROR/UNKNOWN。
- [x] 验证默认原UA/Referer/Accept、5秒连接/10秒读取及四种参数；超时→NETWORK_ERROR；非法JSON/UTF8→带endpoint的PARSE_ERROR，消息不包含原始body。差异项先RED后修复，已有超时行为仅补覆盖。

```python
assert error.code == "BILIBILI_UNKNOWN_ERROR"
assert (error.retryable, error.status_code, error.bili_code) == (True, 200, -500)
```

- [x] GREEN：仅Live使用原错误码映射和请求默认值；保留独立 CAS 原始响应，控制消息只传ObjectRef。重跑定向测试并确认Follower/Auth回归不受影响。

## Task 3: 输出校验和真实进程

**Files:** 新增 `workers/python/src/bmd_workers/bilibili_live_contract.py`、`packages/contracts/schemas/bilibili-live-worker.v1.schema.json`、`workers/python/tests/fixtures/live_http/sitecustomize.py`、`packages/core-runtime/src/bilibili-live-worker-integration.test.ts`；补前述测试；修改 `workers/python/src/bmd_workers/runtime.py`。

**Interfaces:** Pydantic模型与共享JSON Schema/TS共用golden数据验证；公开的 `validate_live_result(endpoint, value)` 对输出校验并转换PARSE_ERROR。请求仍用现有Pydantic类，增加逐UID验证。测试通过现有transport的pythonPath指向test-only目录，`sitecustomize`只给httpx注入MockTransport，真实runtime从已安装项目包加载，不新增生产测试入口。

- [x] RED：非法batch UID/多余字段不发起HTTP；有效snapshot、空optional、batch与metadata通过三端校验，非法输出在Worker内转PARSE_ERROR，而非致进程退出。
- [x] RED：真实Python子进程输出中文、0分区、空旧房和错误，经真实Node transport/WorkerSource验证；接上真实Core/SQLite后新增房间、证据hash落库、旧接口无房及风控失败语义保持。

```ts
const source = new BilibiliLiveWorkerSource(transport)
expect(await source.fetchRoomInfoOld(request)).not.toHaveProperty("snapshot")
await expect(source.fetchStatusByUids(riskRequest)).rejects.toMatchObject({
  code: "BILIBILI_RISK_CONTROL", message: "合成直播风控", statusCode: 200, biliCode: -412
})
```

- [x] GREEN：补跨语言结果校验，不替换真实parser/Core，不依赖真实网络；stop后清理隔离测试目录。
- [x] 最终独立只读审查、`check.cmd`、`git diff --check`、生产fixture扫描和原仓库clean复验；更新README、迁移台账、`docs/implementation/2026-09-13-live-worker-audit.md`，明确验收边界和剩余差异。用户明确要求后才执行本地提交。

## Task 4: 审查补正有符号计数与旧库升级

**Files:** `bilibili-live.ts`、`bilibili-subject.ts`、`bilibili_live_contract.py`、共享fixtures/schema、真实Worker集成测试；新增 `packages/storage/src/bilibili-live-counter-migration.ts` 及测试，接入 `control-database.ts`。

- [x] 重新只读核对原Live parser与V4 SQL，负热度/关注是可保存的有符号计数；先补Worker/跨语言失败回归，避免整批拒绝或改用watched_show。
- [x] GREEN：安全整数范围内的负计数贯通Worker、Live/Subject契约及Core投影；不扩大到全部signed Long或未知直播状态。
- [x] 真实SQLite链路复现非负CHECK失败；追加v13，保留历史迁移、原rowid/字段/证据/关联/索引，提交前外键检查，失败关闭连接。
- [x] 隔离v12升级及重开回归；独立复审确认无剩余Critical/Important。将复审验证的失败回滚场景补入自动回归，纳入最终完整检查。

用户随后明确要求“提交代码”，仅执行本批收尾验证和本地提交，不推送，不继续扩展业务；最终证据见审计和全量迁移台账。
