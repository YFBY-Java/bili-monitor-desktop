# 普通材料 API、错误传递与直播媒体字段迁移（2026-10-07）

## 范围与基线

继续完整 M01–M18 目标，不把本批切片当作全量完成。原 B/S `D:\codex_work\BiliMonitor` 的 `fa2faa6` 只读，客户端 HEAD `4c94959f81033eee544211cfce29a18c84fd602f` / `codex/follower-monitor-actions` 保持，累计未提交改动与空暂存区保留。

主代理完整核对原 `BilibiliWbiSigner`、`BilibiliAnonymousCookieProvider`、`BilibiliLiveDanmuInfoClient`、`BilibiliLiveApiClient` 和快照合并域。API 资料库仅作历史参考；没有访问真实平台或读取用户凭据。

真正的本批起点是 D 盘 `.tools/temp/20261007-core-phase-reconciliation-before/manifest.json`（489 源），不是干净 HEAD。媒体字段前另存492源快照；最终 v2 差量包含43路径，`20261007-core-phase-reconciliation-review-v2.txt` 及 manifest 保存准确差异。下一媒体报告也包含审查修正波，不能当作纯媒体单独差量。

## 已实现的业务对齐

- Node nav/SPI/DanmuInfo 的 `code` 按原 `JsonNode.asInt` 区分 JSON 整数、Double、布尔和文本；不再只接收 JavaScript number。nav 允许0/-101，其余 UNKNOWN/可重试；SPI 非0同样 UNKNOWN/可重试。日志保留 nav/HTTP200、B站返回码和原生成消息，不借用榜单错误分类。
- 材料及 Token 按原 scalar text/Java blank 规则处理，保留非空白原文；Buvid4 的布尔标量也可转换为文本。DanmuInfo 非认证/风控码使用 UNKNOWN，并保留显式空消息。host_list 同原迭代对象值或数组，缺有效 host 时仍使用原默认服务器。
- 实时 Worker 错误进入共享 `RealtimeWorkerErrorSchema` 与 portable JSON Schema；只传 code/message、可选 retryable、合法 HTTP 状态、signed32 B站码及白名单 nav 端点。旧错误缺可选字段仍兼容；Secret/任意端点等额外属性不进入错误帧。
- 弹幕 attempt-failed 的 message 允许空字符串，Core 不再将合法空消息当成协议失败并停止连接。
- 仅给 JSON PARSE_ERROR 补原端点/200。String 头部转换异常及取消仍旁路，不伪装平台失败。nav 解析失败的 API 日志不再记到榜单端点。
- DanmuInfo 包装层按原 biliCode=65530/-352/-403/-412 执行匿名回退，原 -352 分支清材料并重读登录凭据。Rank nav 的 UNKNOWN 仍不触发榜单风控重试，两条业务规则不混同。
- 十六进制 Double 文本先归并尾数/指数并做 binary64 舍入，再转换 Number，避免中间 Infinity 导致正常 -101 变为 sentinel；String 的 q 参数复用同一转换。
- Live face/cover/keyframe 是原文文本，不强制完整 URL。Python、Worker v1/v2、直播房间与用户工作台响应及 portable schemas 同步；原手工 avatar/profile URL 输入校验保持。未改变 Renderer 渲染、凭据或资源获取权限，不把坏图片判成整次采集失败。

## 旧阶段12项失败的核定

旧完整日志 `20261007-http-phase-final-check.log` 的 exit1 是历史事实，未改写。按原源码核对后，只修正不符合原业务的旧夹具/断言：

- DanmuInfo 成功前不建弹幕会话；停止和匿名升级失败保留原 STOPPED/NOT_STARTED 边界。
- Worker 启动夹具返回实际 status/attempt；两项采集存储禁用不应删除独立账号单次查询源。
- 场次同一时间采用现有九位精度存储文本；无效 UTF-8 的 String 替换不是 JSON 解析失败。
- Rank 队列满仍拒绝，不伪装部分平台失败；日志存储异常的拒绝先附观察器，避免用例产生未处理拒绝。
- recent.limit=201 按原夹到200，永久502事实/最近501条等业务断言保持。原 Subject 与 retention 两项在定点验证中不再超时，但不据此关闭全量并行性能问题。

定点日志 lifecycle4、semantics6、throughput2 均通过，未降低超时/并发、减少原数据量、跳过失败或更改 SQLite durability。其通过不替代新阶段完整结果。

## 有限验证与真实失败记录

1. 共享契约和 Core 空消息先出现真实 RED（契约拒绝及 REALTIME_WORKER_EVENT_FAILED），修复后既有合同32项、Core代表1项、Node代表1项、Python共享8项通过；只有共享错误各语言一个新增分组，其余复用现有用例。
2. 媒体字段先在契约与真实 Worker 两条流程 RED，修复后合同2项、真实 Python→Core→SQLite2项通过；CAS保留原字节，数据库重开原文保持，缺 room_id 仍拒绝且 Worker 保持 ready。Python `media or zero` 复用11项通过。中途误删被 Follower-v2 导入的 UrlString 导致 ImportError，恢复原通用 helper 后只更改三处 Live 类型声明；该失败不冒充目标行为 RED。
3. 只读初审发现 nav PARSE 元数据、biliCode 回退和长 hex 中间溢出三项，均先扩充原代表流程并观察 RED 再修复。另一个 String q 代表 RED→GREEN；不新增格式矩阵。最终实际 Core/Worker/SQLite1项与 Node2项通过，缓存、原 API 日志、CAS、停机断言保留。
4. Contracts/Core/Realtime/Desktop 的已运行类型检查通过；Python涉及源/夹具已格式化。43源冻结差量的最终只读复查未发现C/I/Minor。完整日志 `20261007-migration-phase-check.log` 已终态exit1：Task3、Contracts511、Storage77、Realtime162、Browser12通过，Core1035通过/2失败；XLSX背压断言和Subject批量5秒超时，Desktop及后续阶段未执行。后续定位与最小修正见[导出与绑定读取审计](2026-10-07-export-backpressure-and-subject-binding-audit.md)，不把定向结果改称完整绿色。

RED/GREEN 日志统一在 D 盘 `.tools/temp/20261007-{realtime-error-contract,realtime-empty-message,live-media-contract,live-media-worker,material-api-hex,material-api-fallback,material-hex-quality,material-api-parse-metadata,material-api-review-correction,material-api-node-final}*.log`。没有旧终态会话重启或自动提交推送。

## 保留的完成边界

本批不等于完整 M06/M08/M09/M10/M14/M18 完成。其他配置源、JSON/JSONB/部分提交、独立数字/时间/编码域、同步 SQL/大数据性能、历史不稳定全量回归、最新 schema16 目录包及真人/原生保存/安装验收继续开放。完整目标 active；不恢复原服务端、不造原 Mock/unsupported 业务。
