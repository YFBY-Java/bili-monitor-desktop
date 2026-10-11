# Buvid/SPI与DanmuInfo响应处理及阶段检查（2026-10-07）

## 范围与停止状态

限定String响应处理已实现并完成定点验收；不代表完整M09/M10、整体验证或发布完成。按用户要求，记录当前功能与阶段检查结果后停止推进，本次不继续新功能或修复阶段失败，不提交推送。

客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `4c94959f81033eee544211cfce29a18c84fd602f`、分支 `codex/follower-monitor-actions`，累积未提交改动保留，暂存区为空。原B/S `fa2faa6`、API资料库 `271b123`干净只读。所有新证据、工具和合成数据在D盘；没有访问用户库、真实平台或凭据，没有新增服务端、依赖或数据库迁移。

## 原业务依据与实现

先读取本地API资料 `docs/misc/buvid3_4.md` 与 `docs/live/message_stream.md`，再对照原Java `BilibiliAnonymousCookieProvider.fetchCookie` 和 `BilibiliLiveDanmuInfoClient.fetchDanmuInfo`。资料仅用于定位，不作为当前实网协议或访问授权证明。

仅修改以下3个任务路径：

- `workers/node-realtime/src/bilibili-anonymous-material-provider.ts`：SPI显式启用既有 `responseText: "spring-string"`；HTTP状态至少400时按原UNKNOWN/可重试及原消息处理，附安全端点/状态。
- `workers/node-realtime/src/bilibili-danmaku-connection.ts`：DanmuInfo启用相同响应转换；HTTP429为RATE_LIMITED，其他至少400状态为UNKNOWN/可重试，保留原消息、安全端点/状态。
- `workers/node-realtime/src/bilibili-danmaku-connection.test.ts`：一个代表流程，只替换HTTPS/WebSocket边界I/O，实际材料缓存、解码、签名、连接策略与AUTH构建运行。

响应头转换优先于HTTP分类。内部转换错误保留固定安全错误，不进入登录凭据失效/风控的匿名fallback、不清已有成功缓存；普通失败规则保留。缺省Latin-1材料和Token通过实际LOGIN AUTH包验证。nav、缓存TTL、正常API代码/字段解析、协议候选与取消策略未扩改。

## 已执行的有限验证

1. 同一新增流程先RED：SPI503的非法charset被旧逻辑分类成HTTP错误而不是内部转换错误。修复后GREEN1通过、11项过滤未运行。
2. 最后复用该流程及既有串行缓存/登录过期与风控fallback场景，3项通过、9项过滤未运行；过滤项不算通过。Node Realtime类型检查exit0。
3. 独立限定复查Critical0/Important0/Minor0。489个任务前源中仅3路径改变，其余486保持；记录时3个当前SHA256和字节数仍匹配冻结manifest。差量3路径/15708字节，不混入前WBI或Storage修正。
4. Desktop web/node类型及生产bundle构建通过。实际生产Main/Preload/Renderer/Core在新D盘 `.tools/temp/bmd-production-final-WnU9wa` 启动：schema16、精确Live/Subject桥接、真实注册表、单Core重启、正常退出，自有PID残留0。自动平台/OAuth关闭；不是安装包、真人或用户库验收。

## 阶段完整检查实际终态

本组响应消费者收尾后运行一次 `check.cmd`，会话4351确认结束，**exit1**，日志 `.tools/temp/20261007-http-phase-final-check.log`。没有更改并发/超时、跳过失败或重复整套求绿。

| 已执行部分 | 结果 |
| --- | --- |
| D盘工具/缓存/数据路径门禁 | 通过 |
| Task Engine | 3通过 |
| Contracts | 510通过 |
| Storage | 77通过 |
| Node Realtime | 161通过 |
| Node Browser | 12通过 |
| Core | 1025通过/12失败，10文件失败/80文件通过；另有2个未处理拒绝 |

命令在Node/Core失败后终止；Desktop测试和随后全workspace类型、Python格式/类型/测试、最终构建未由此命令执行。此前单独生产构建/启停不替代这一检查，也不能将阶段结果称为绿色。

### Core失败清单（观察结果，根因尚未核定）

路径均位于 `packages/core-runtime/src/`。本次记录没有更改以下用例或生产实现。

| 文件 | 失败数 | 实际观察 |
| --- | --- | --- |
| `bilibili-danmaku-auto-targets.integration.test.ts` | 1 | 失败后重试场景预期ERROR，实际NOT_STARTED |
| `bilibili-danmaku-recent-retention.integration.test.ts` | 1 | 501条recent/502条永久事实流程达到原5000ms超时 |
| `bilibili-danmaku-scheduler.integration.test.ts` | 1 | 关闭重开后预期STOPPED会话，实际查询undefined |
| `bilibili-danmaku-upgrade.test.ts` | 1 | 单房升级失败预期ERROR，实际STOPPED |
| `bilibili-follower-configuration.test.ts` | 1 | 两store禁用场景预期source停止次数0，实际1 |
| `bilibili-gift-v2-ingestion.test.ts` | 1 | Worker启动结果未通过现行契约：status非法且缺attempt |
| `bilibili-live-session-boundary-parity.test.ts` | 1 | endedAt预期毫秒文本，实际纳秒格式文本 |
| `bilibili-live-worker-integration.test.ts` | 1 | bad output场景预期解析拒绝，实际Promise成功返回 |
| `bilibili-shared-rate-limit.test.ts` | 3 | 队列满返回LOCAL_RATE_LIMIT_BUSY；两日志存储失败场景抛Synthetic log storage failure，并产生上述2个未处理拒绝 |
| `bilibili-subject-service.test.ts` | 1 | UID-first/资源复用/聚合删除隔离流程达到原5000ms超时 |

这些观察不能未经对照原源码就统一解释为旧断言、夹具或生产缺陷。下次先逐类定位，复用原失败流程做少量关键验证，不盲目批量替换期望或放宽预算。

前轮完整检查 `.tools/temp/20261007-http-phase-check.log` 在Storage的Number `200`/bigint `200n`断言失败。只同步一处测试期望后定点通过，当前Storage77全部通过，生产/schema未改变；原失败日志保留。历史桌面异常退出、首次Worker启动和趋势超时仍无关闭证据。

## 恢复材料与剩余工作

D盘 `.tools/temp/`（被忽略，不随Git提交）：

- `20261007-danmaku-response-text-before/manifest.json`：489源/3960531字节。
- 同前缀 `brief.md`、`review-v1.txt`、`review-v1.txt.manifest.json`。
- 同前缀 `red.log`、`green.log`、`final-tests.log`、`build.log`、`production-smoke.log`。
- `20261007-http-phase-final-check.log` 及旧阶段检查、Storage期望修正日志。

本文、总台账与交接快照保存持久结论，临时证据不是唯一接续入口。普通nav/SPI/DanmuInfo JSON/API错误/字段转换、完整字符集兼容、其它独立配置/JSONB/部分提交差异、同步SQL/性能与崩溃边界、最新schema16独立目录包，以及需用户配合的真人扫码/获准目标/OAuth/原生保存/剪贴板/安装仍开放。原Mock/预留或无消费者probe不扩造成新业务；不按入口数量推算完成率。
