# 弹幕连接、认证与心跳生命周期迁移（2026-10-06）

本轮实现范围：按原 B/S 迁移真实 Worker→Core→SQLite 的弹幕启动、认证、协议尝试与关闭状态，不增加业务服务端。原仓库 `D:/codex_work/BiliMonitor`（`fa2faa6`）及 API 资料库只读。客户端继续基于 `4c94959` 的未提交工作区；没有提交、推送、安装、启动原项目或访问真实凭据/用户数据库。

## 原业务与本地实现

原依据为 `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/danmaku/service/BilibiliLiveDanmakuService.java` 的 start/startWithProtocol、sendAuth、心跳及消息/error/close 处理，配套 DanmuInfoClient 的首 host/defaultWssUri、原 Vue 弹幕组件和 SubjectWorkbenchService。API 资料的认证/心跳章节仅作历史研究，不代替当前线上协议验收。

| 原规则 | 本轮实现 |
| --- | --- |
| 每个候选重新获取信息，只用首 host；默认 WSS URI 不带显式端口 | Node 候选循环重新 fetch；取消即退出，不再遍历全部 host |
| 发 AUTH 后即返回，认证回复异步处理 | 启动返回 AUTHENTICATING；connected 事件推进 CONNECTED，无额外认证回复超时 |
| 同步启动失败才回退，异步认证拒绝关闭 | connecting/attempt-failed 标识每次尝试；认证 ERROR 不再触发当前轮候选回退 |
| 每次尝试独立会话，前次失败留存 | 固定 Worker connectionId 与 SQLite sessionId 分离；每次 connecting 创建会话，事实/指标归属当前 session，stop 仍路由固定 connectionId |
| 心跳发送和回复均更新时间 | 发 AUTH 后启动默认30秒、至少5秒的周期；heartbeat-sent 只更新时间，回复才更新人气指标 |
| ERROR/STOPPED 不被迟到 close/result 覆盖 | socket/timer/Manager ownership 回收；Core 不降级早到 CONNECTED、不复活终态，停止与退出后不写迟到数据 |

AUTH_REPLY 保留原 Jackson “整数 JSON 数字且数值为零”的判定：`0`/`-0` 成功，`0.0`/`0e0` 不成功。复用项目 Node 24 的 JSON.parse reviver source，按 root 对象实际 code 的词法判断，不用全文正则误读嵌套、重复或转义键。

Core 不在 HTTP 成功前生成虚假 DB 会话；创建会话成功后才更新 persisted/sessionId。WorkerSource 处理协议 reader 栈上的 schema/consumer 异常，解除订阅、停止固定连接并报告错误，避免异常逸出 NDJSON reader。原共享 Widget/工作台明确把 running 映射为 connected，已核对并保留；仅独立直播页停止按钮改按 running，使鉴权期间能停止，原空消息判断仍按真正 CONNECTED。

## 精简验证与实际结果

遵照用户“测试项不需要那么多”“迁移太慢”的要求，主要复用已有 Socket/Manager/Core 用例，只新增一个贯穿候选会话、早到认证、终态和鉴权中停止的 Core 集成用例，外部 I/O 合成、SQLite 真实。新契约共用7个小型 TS/Python golden 样例。未新增故障矩阵、清理框架、诊断循环，没有重跑 root check 或累计历史分支审查。

- 实际 RED：Worker 两项失败（缺 connecting、仍等认证回复）；新 Core 一项失败（未知 connecting）。
- 最终相关 TS 77项、Python28项及 contracts/Core/realtime types 通过；Main 的最小类型修正后仅复跑 Source 文件7项，通过。
- 首次 build exit1：独立直播页遗漏 connected 消费者；第二次 exit1：Desktop 严格编译发现 Source 可选 attempt 收窄问题。分别最小修正，最终生产 build exit0，Desktop web/node types、Main/Core/两个Worker、CJS Preload/Renderer 全部生成。真实失败日志保留，不称首轮成功。
- 修改 Python 文件首次 Black1/isort0；单文件机械格式化后 Black/isort0，不重复 Python 业务测试。

原始命令、退出码与日志索引在 `.tmp/2026-10-06-danmaku-auth-lifecycle-report.md`；最终 build 日志 `.tmp/2026-10-06-danmaku-auth-lifecycle-build-final.log`。Main 已完整读17文件、76902字任务前后差量及相关实际日志，随后完整阅读正式独立复审报告 `.tmp/2026-10-06-danmaku-auth-lifecycle-task-review.md`：Spec compliant / Task quality Approved，新增 Critical/Important/Minor 均无。仅本任务获准，不以任务审查代替全量验收。

## 未完成与下一步

本轮没有新增配置字段，原15项弹幕属性仍余9项待迁移，包括心跳/连接超时可配置贯通、WBI/buvid/昵称缓存和覆盖窗口等对应消费者；Node 额外100连接上限另待核对。其余 M09、完整 M01–M18、真实平台/真人认证、原生与安装验收继续未完成。

此前整套 Desktop Vitest 异常退出和旧 pending add/trend 验证缺口没有解决证据，继续保留；本轮局部通过不能写成全量绿色或可发布。阶段收尾再统一回归，下一步继续原业务实现，不重派已完成的观察/测试任务。

最终安全检查（15:02:29）：任务前90个dirty路径的无关内容保留，17文件冻结差量无变化；当前98个dirty路径，无预期范围外新修改。原源码/API仓库 clean，HEAD/分支/空暂存区保持。环境、测试数据库、缓存和构建产物仍全在D盘；项目运行进程与监听端口均0，diff/新增文件空白检查通过。原始记录在 `.tmp/2026-10-06-danmaku-auth-lifecycle-final-safety.json`。此后仅补充本段和进度记账，没有源码/测试或验收重跑。
