# M08 直播采集策略配置审计

## 依据与本轮边界

客户端基线 `0b4dd57`；原只读 B/S 基线 `fa2faa6`。计划见 `docs/superpowers/plans/2026-09-13-live-collection-policy.md`。原文件以下相对 `D:\codex_work\BiliMonitor\social-data-monitor`：

- `backend/src/main/java/com/socialmonitor/bilibili/live/config/BilibiliLiveMonitorProperties.java`：八项策略均为有符号 int，默认值见下表。
- `.../bilibili/live/service/BilibiliLiveMonitorService.java:99–136,350–438`：先解析间隔再采集；修改先找房间，再解析新间隔；原重试、限流、警告、失败退避公式。
- `.../collector/service/RetryPolicy.java`、`RateLimitService.java`：重试类别/次数上限与按endpoint限流。原共享锁及唤醒延迟的严格并发等价另列剩余项。
- `.../bilibili/live/dto/AddBilibiliLiveRoomMonitorRequest.java`、`UpdateBilibiliLiveRoomMonitorRequest.java` 与 `backend/src/main/resources/db/migration/V4__bilibili_live_monitor.sql`：手工输入及数据库间隔均限定1..2592000。不可把配置的 int 域误当成存储和输入域。
- `backend/src/main/resources/application.yml:79–88`：原环境别名。

## 已接入的策略

仍从实际 D 盘数据目录 `config/bilibili-live-collection.json` 只读、重启生效；[示例](../../config/bilibili-live-collection.example.json)已加入八字段。所有环境变量前缀为 `SOCIAL_MONITOR_BILIBILI_LIVE_`，覆盖文件值。

| 配置字段 | 默认 | 环境变量后缀 | 实际消费行为 |
| --- | --- | --- | --- |
| defaultIntervalSeconds | 300 | INTERVAL_SECONDS | 省略添加间隔时使用；无效默认值不自动夹成合法值 |
| minIntervalSeconds | 1 | MIN_INTERVAL_SECONDS | 有效最小值=max(1,配置)，低于则拒绝 |
| maxIntervalSeconds | 2592000 | MAX_INTERVAL_SECONDS | 有效最大值=max(有效最小值,配置)，高于则拒绝 |
| shortIntervalWarningSeconds | 120 | SHORT_INTERVAL_WARNING_SECONDS | 成功通过间隔校验且小于max(1,配置)才记录结构化警告；边界相等不警告 |
| failureBackoffSeconds | 900 | FAILURE_BACKOFF_SECONDS | 失败到期=失败时刻+max(60,min(房间间隔,配置))秒 |
| requestMinIntervalMs | 1500 | REQUEST_MIN_INTERVAL_MS | 每个endpoint请求间距至少max(0,配置)毫秒；不把负值当无限等待 |
| maxAttempts | 3 | MAX_ATTEMPTS | 至少1，且受原RetryPolicy最多4次实际请求限制；10不是10次 |
| retryBackoffMs | 1500 | RETRY_BACKOFF_MS | max(100,配置)×2^min(零基尝试号,4)+整数抖动[0,300)毫秒 |

间隔校验错误为 `BILIBILI_LIVE_INTERVAL_INVALID`，提示原最小/最大秒数，不提前采集或改库。配置格式、类型、int越界仍使用已实现的启动错误链路。文件本身先校验，环境变量不掩盖错误文件；本轮没有实现完整Spring relaxed-binding文本语法。

配置默认/最大值即使在int域内，也不意味着数据库会接受超过30天的房间间隔：原SQL与本地SQL均拒绝。测试覆盖“显式输入在请求层拒绝；省略输入时先走原服务规则、再由SQL拒绝且事务不留房间/快照”。没有修改历史migration或放宽UI/契约限制。默认值变更只影响新添加，不重写已有房间间隔/到期时间。

重试按网络、限频、服务端错误类别决定，错误元数据的 `retryable` 布尔值不改变原集合。API日志和最后失败仍保留真实分类；取消后不再增加终态失败、快照或后续请求。正常成功仍按房间间隔安排下一次；关闭自动REST和手工操作等既有配置语义不变。

## 长等待修复

原 int 退避乘指数并加抖动可能大于2147483647毫秒。旧代码直接 `setTimeout(total)`，测试实际复现本应很久后的第二次请求在1毫秒就发出。现生产等待按单段<=2147483647拆分，每段继续沿用AbortController取消；没有夹小配置值、跳过等待或新增服务/Worker协议。

本项只证明 Core 等待规则，不证明宿主和Worker外层请求时限已对齐：目前的宿主90秒、Worker35秒仍可能先超时，后续必须协调完整请求/取消/进度语义，不能简单用connect+read当总耗时上限。

## 回归与复核证据

- 首轮 TS配置4项、Python portable3项，以及Core配置24项/loader2项在实现前失败，原因是新增字段/默认值/环境别名尚不支持。新增无效类型样例为补覆盖，不冒充RED。
- 实现后Core测试中的9项失败定位到夹具误用 `runAllTimersAsync`：真实Auth有60秒清理interval，全球调度关闭不等于Auth清理关闭。测试改为精确推进1000/2000ms并与已有后台timer数量比较；不改或mock Auth业务。
- Core配置25项通过真实Core/SQLite验证默认和重启、手工拒绝不变事实、数据库硬边界、警告阈值、失败退避、负限流、四档次数与错误类别、退出取消。八个原环境变量同时贯穿Core行为的测试为实现后补覆盖，文件字节保持。
- 新增长等待2项先RED（1ms多发请求），修复后测试完整抖动/双倍多段等待、API日志attempt=1/2/3及第二段退出取消。针对性策略、加载器与生命周期均通过。
- requesting-code-review 独立只读复核无Critical/Important，独立运行新两文件27/27。指出已有API duration统计与原不同，列入下节，不把它当成本轮新引入或已修复。

完整 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd` 退出0：Node745（Contracts161、Storage19、Task3、Core298、Browser12、Realtime19、Desktop233），Python211；TypeScript/mypy、Black/isort（25文件）、Electron生产构建、D盘路径检查通过。比基线新增39项Node和11项Python测试。未启动原B/S、已安装客户端或真人平台，未使用用户数据库/凭据，未提交或推送。

## 全量剩余项保持

1. M08 HTTP连接/读取超时、UA/Referer，其他直播HTTP消费者和宿主/Worker外层超时协调；storageEnabled跨直播/榜单/弹幕/场次。
2. 原RateLimitService在共享锁内等待，客户端为异步预约；并发跨endpoint、事件循环迟醒时的严格间距/完成顺序仍需单独迁移验证。
3. 原API duration在限流前开始计时；客户端失败在限流后计时、成功使用Worker duration。较大等待下日志耗时低估，后续API诊断语义需修正，不声称完全等价。
4. 原完整signed Long/未知状态、URL/字符串/非标准数字/时间解析；完整配置绑定；M07真人/原生验收、M09–M18完整业务继续在全量台账中。本轮不代表M08或全目标完成。
