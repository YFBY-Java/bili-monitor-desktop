# 粉丝原始快照与提交顺序（2026-10-07）

## 原业务与本地实现

原 B/S `fa2faa6` 的 `BilibiliApiClient` 返回解码后的原始 HTTP String；Follower Service 先记录成功 API 调用，再保存用户资料，最后由 Repository 将原文转换为 JSONB 写入历史。普通添加/刷新没有外层事务，所以最后一步失败不能回滚先前资料/日志，也不能触发平台重试、备用接口或失败退避。原 `SubjectService.createSubject` 则有外层事务，必须整体回滚。

当前 Python 扫描完整解码原文，包括重复字段和第一个 JSON 根之后的文本，保留数字原文，不经过 binary64；通过窄枚举传递 JSONB 输入拒绝原因。CAS 仍保存原始字节，正常字段解析不变。Core 仅在历史快照保存点拒绝无效原文；普通操作分两次事务提交资料及其 Outbox、历史及其 Outbox，嵌套在工作台创建事务时仍整体回滚。真实 SQLite 历史写入失败同样保留资料/成功日志。没有修改 schema16、同步持久性、原历史数据、预算或并发。

输入约束来自 PostgreSQL JSONB 与 PG16 numeric 源码，不等于 PostgreSQL 实机全面等价；完整 JSONB 输出规范化、极大分配/服务端栈限制及其他 JVM/configuration 兼容仍开放。直播/榜单另核对，不能复用粉丝的非整体事务结论。

## 有限验证与当前边界

- 最终 before、16 路径 hash 与差异：`.tools/temp/20261007-follower-raw-payload-review-v2.json` / `.diff`。限定只读复核已关闭：Critical0/Important0/Minor0。初审发现 collect 资料 Outbox 错用响应 MID，现改为实际 monitor MID；同一既有 signed-response 流程先 RED 后 GREEN，快照事件仍保留响应 MID。后续直播对共享 Storage 的修改另有独立冻结，不混算为此前粉丝复核漂移。
- 一个新增实际 Python→NDJSON→Core→SQLite 流程先 RED 后 GREEN：刷新/添加的部分提交、工作台整体回滚、恢复、真实触发器失败、Outbox 与重开。另一个 Python 主流程及既有契约 case 共用六个原文样例；不展开新测试矩阵。
- 最终定向 Core 主流程通过；相关 Core21、契约43、Python stdio80 及修正夹具的既有4项分别通过。初始清理 double-close 与 mypy API 错误已修，旧失败日志保留。最新全 workspace TS、生产构建及隔离实际 Electron 五页/IPC/单 Core 重启/正常退出已通过；数据在 D 盘 `bmd-production-final-gimN5z`，无真实平台/用户库请求，记录 PID 残留0。
- 标准 `check.cmd` 已结束 exit1：Core1037/1041，4失败。三处旧断言/UUID 夹具已按真实提交语义修正且定向通过；剩2004次刷新原30000ms预算的并行性能问题未关闭，未再次全量求绿。独立同一用例约19.54秒通过不替代整体稳定性；测量6000次同步提交约17.75秒，没有减弱持久性或合并原提交顺序。

后续直播完整 check 已终态 exit1：Core1040/1042，剩原粉丝2004刷新30秒和Subject501创建5秒超时；不是粉丝整个模块或完整性能验收。最新日志均在 `.tools/temp/20261007-follower-raw-*`，事件修正证据为 `event-red.log` / `event-green.log`。历史桌面交互超时/崩溃、布局提交选择、真人扫码/采集/原生保存及安装验收继续开放。未提交、推送或重新打包；全量 M01–M18 尚未完成。
