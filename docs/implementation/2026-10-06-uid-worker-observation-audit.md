# UID 输入与 Worker 等待边界观察（2026-10-06）

本任务仅补测试证据，不迁移新业务、不改变生产流程或测试预算。既有 UID 精度/原输入兼容规则与原 12 轮输入、选项、提交、查询和断言保持。

## 实现与限制

UID 测试侧 observer 只记录固定 phase、轮次、有限状态位与相对耗时，不保存 UID、页面文本、消息或协议内容。最多 80 次操作、最终单行最多 4096 UTF-8 bytes；结果/异常精确透传，停止后迟到完成不更新快照，输出故障不影响原操作。每例重新创建，退出前停止。

Python fixture 在正常 `stdin.readline` 属性查找已经取得原方法后补一次固定 `stdin:first-read-lookup`，再原样返回方法。没有提前读取、导入/线程/asyncio 包装、额外 RPC 或进程预热。此阶段只代表准备取得方法，不等于已经提交线程或读取了输入；缺失阶段也不能证明事件未发生。Node 仅扩充该固定 stderr allowlist，沿用原全局 40 条/10 条 stderr 和单条 4096 cap。

范围六文件：renderer observer/纯测试、Workspace 原交互测试、Python first-read fixture/纯测试、main long64 Worker 集成测试。原 Worker 启停、取消、子进程实际退出及 SQLite 无迟到写入断言未改。

## 定向记录

RED：UID 16、Python 10、Node 固定事件纯例 1（其余 11 排除）失败；GREEN 分别 16、10、1 通过。最后原 Workspace + Worker 两文件 37 项 unfiltered 全过、无跳过；Desktop 类型、两个 Python 文件 Black/isort 通过。

该次 UID 12 轮状态位均为 63，所有最终布尔为 true，共 74 次操作。Worker pending-add 和 refresh 在该定向命令中实际执行原 stop、child-exit 和 SQLite 对比断言；不把 finally 清理当作这些断言的替代。cap 达到后的缺失阶段不作非发生结论。

独立 task 审查 Spec compliant / Quality Approved、无未关闭问题。实施报告最初误列一个不存在的 isort raw log 已更正为九份实际日志及静默终端 exit0；没有补造历史日志或为文案重新运行测试。main 已检查六文件任务增量和报告；这不替代主代理冻结全量检查，也不是此前间歇超时根因或稳定性已修复的结论。

全量检查及跨任务状态统一记录在[最近弹幕保留迁移审计](2026-10-06-danmaku-recent-retention-audit.md)和[迁移台账](2026-09-13-full-migration-tracker.md)。原 B/S/API 档案只读，数据/缓存/产物 D 盘；完整迁移仍未完成，未提交、推送或安装。
