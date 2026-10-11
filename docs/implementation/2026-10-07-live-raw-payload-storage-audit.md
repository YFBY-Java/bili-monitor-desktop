# 直播原始快照保存与失败回滚（2026-10-07）

## 原业务与实现

原 B/S `fa2faa6` 保持只读。`BilibiliFetchedLiveRoomSnapshot.mergeWith` 选择主响应 raw；`BilibiliLiveSnapshotApplicationService.initializeMonitor/applySuccessfulSnapshot` 有整体事务。采集成功 API 日志先写，之后存储失败直接传播，不触发平台重试、备用接口或失败退避。过期/待结束快照在历史 INSERT 之前拒绝，不提前检查没有写入的原文。

客户端复用粉丝的完整原文 JSONB 输入扫描器和窄枚举；Python 仅计算状态并保留 CAS 原始字节，不将它变成采集错误。Live v1/v2 的 TS、portable Schema 与 Pydantic 增加相同可选字段。Core 的 status/info/init/old 合并只保留实际主原文的状态。Storage 在既有整体事务内、历史 INSERT 之前拒绝无效输入；房间、事件、场次、历史与 Outbox 一起回滚，已经独立提交的成功 API 日志及其 CAS 引用保留。没有 schema、历史、同步持久性、预算、并发或 UI 变化。

## 有限证据

- 一个新增实际 Python→NDJSON→WorkerSource→Core→SQLite 流程，HTTP I/O 离线回放：非法主快照的刷新/添加回滚、非法非主详情不阻止保存、日志/CAS 保留、恢复、真实 SQL 触发器失败及数据库重开。真实 RED 接受了原应拒绝的 online20，最终 GREEN1项通过。首次 GREEN 的 harness 错将独立日志归档引用算入回滚，修正期待并显式检查这些引用；没有删除业务/Outbox 不变断言。
- 复用原 TS/Python case 与粉丝六个共享原文样例，校验 v1/v2、未知/null 拒绝及 CAS 字节。相关 Core42、Contracts43、Python85、mypy20、格式和全 workspace TS 分别通过；不是扩展历史矩阵。第一次 TS 的本地 NonNullable 注解错误改为共享契约 indexed type，运行契约没有放宽。
- 当前生产构建和实际隔离 Main/Preload/Renderer/Core 五页、IPC、单 Core 重启/数据保留、正常退出通过：`.tools/temp/bmd-production-final-k8W54N`，Core64028→59980，自有 PID 残留0。没有用户库、真实平台或凭据访问。
- `check.cmd` 的 session40575 已终态 exit1。Task3/Contracts511/Storage77/Realtime162/Browser12通过；Core1040通过/2失败，既有粉丝2004刷新超原30000ms、Subject501创建超原5000ms。Desktop及后续阶段未由该命令执行，不放宽预算或反复全量求绿。
- 11个真实 before/hash 与差量 `.tools/temp/20261007-live-raw-payload-review-v2.json` / `.diff` 已限定只读复核：Critical0/Important0/Minor0；主响应传播、实际保存点、整体回滚及成功日志隔离符合本片要求。

日志 `.tools/temp/20261007-live-raw-*`。完整 JSONB 物理输出规范化/极大分配、Live 直接 TEXT、Rank 写入及事务、配置边缘、整体性能/桌面稳定性、布局提交选择、真人/原生/安装仍开放。没有提交推送或重打安装包；完整 M01–M18 目标 active，不以本片关闭全部直播或全量验收。
