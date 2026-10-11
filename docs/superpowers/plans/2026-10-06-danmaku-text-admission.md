# DANMU_MSG 正文与最近消息准入实施计划

Goal: 从原 B/S 完整迁移这一条正文/最近消息业务链；依赖已完成最近消息数量切片，不改其它配置/业务。

Architecture: Node Realtime 在真实 JSON 解析入口保留字符串、布尔和无损数值文本；纯 Worker-local formatter 对齐已观察的 JDK20 Double 格式；Core 在事实和指标之后仅对 recent 执行 Java blank 准入。SQLite 架构与 UI 不变。

Task 1 的完整要求、Global Constraints、原源码映射、精确输入输出、文件和 RED/GREEN 验证见 [任务要求](../../../.tmp/2026-10-06-danmaku-text-brief.md)。Task 1 先失败测试，再最小实现、定向回归及独立 Spec/Quality 审查；通过后主代理执行一次冻结 check、如实记录失败/补验、更新迁移台账与 handoff、累计独立审查和最终路径/进程核验。

不以定向绿色宣称全迁移完成，不修改历史失败记录，不重派已完成任务，不提交/推送/安装/真实平台验证。当前 pending-v2-add 和四用户2000点趋势全量验收缺口、原15弹幕属性余10、完整M01–M18继续未完成。

执行记录：任务已实现并独立复审Approved，I1清理修复关闭，最终串行310项和两类型检查通过。主代理唯一冻结check49085退出1：此前1716项通过，Desktop异常退出且没有用例结果；另补验23448退出0（全部类型/格式/Python1037/build/实际bundle）。代码/测试冻结，累计审查与最终安全收尾；详情及剩余项见[可交接业务审计](../../implementation/2026-10-06-danmaku-text-admission-audit.md)。完整目标未完成。

用户随后要求减少测试、加快迁移：本轮不再追加或重跑测试；后续只保留少量关键代表性新增用例，完整历史回归/累计评估放在阶段收尾。计划中的每切片完整验证节奏不再延续，历史结果保留不改写。
