# 导出完整背压与工作台绑定读取（2026-10-07）

## 范围与原业务

完整 M01–M18 目标保持 active，本批不等于全量迁移完成。原 B/S `fa2faa6` 只读；主代理完整核对原 `BilibiliLiveSessionXlsxWriter`、`SubjectService`、`SubjectRepository`。原 XLSX 为四表/流式临时数据与正常 finally 清理；原 Subject 的列表、详情每个对象只读取一次绑定。

真正起点为 D 盘 `.tools/temp/20261007-two-failures-before/manifest.json`（493 源），不是干净 HEAD。只改变四个既有源文件，冻结差量见 `20261007-two-failures-review-v1.txt` 及 manifest；保留其余累积改动、HEAD `4c94959` 和空暂存区。

## 根因证据与实现

- 上批完整检查 `20261007-migration-phase-check.log` 已终态 exit1：Task3、Contracts511、Storage77、Realtime162、Browser12通过；Core1035通过/2失败。失败为 XLSX 固定事件循环后生产数125→133及 Subject 501对象场景超过5秒。Desktop和后续检查未由该命令执行。
- 两处定点基线均通过，不能因此称根因已修复。临时观测复现 XLSX 153→161，归档 readable 队列仍仅610629字节、未达默认1MiB；固定20个 immediate 不能代表异步压缩链已经饱和。临时观测代码已全部移除，数据保留在 `20261007-two-failures-instrumented.log`。
- 改为观察归档真实 readable/writable 队列饱和，保留512行×四表、256行预算、两个64KiB表流阈值及原内容/取消断言。旧生产真实 RED 达281行，超过原预算。Archiver 默认两侧各1MiB，原测试遗漏第二侧缓冲。
- 生产仅将 Archiver 两侧高水位显式设置64KiB，与已有表XML输入一致；压缩等级、ExcelJS、四表、类型/样式、五格式、schema2、编号、事务快照、prepared/Main保存与恢复均不改。此为固定队列预算，不声称任意RSS或吞吐上限。
- 已安装 readable-stream3 没有 public writableNeedDrain；一次观察等待因此失败，随后用其真实 writableLength/highWaterMark，而非私有状态。最终代表流程观察两侧阈值/队列、完全暂停、释放后四表514行与阻塞取消清理。
- Subject 实际测量533次提交约1832ms、整体约3103ms、6871次prepare约214ms。不能把完整并行5秒超时全部归因于查询。原 durable 单次提交、501次创建、事务/Outbox、并发与超时预算均保持。
- 复用原501对象主流程，先加绑定读取次数断言观察 RED：1002而非501。list改为一次读取后传给资料回填与返回映射；回填参数改为必填的 binding-or-undefined，避免缺绑定触发默认参数重查。get/workbench同样不重复读取缺失绑定，业务结果/原资料回填保持。

## 有限验证

- 最终两个既有测试文件8项通过（`20261007-two-failures-green.log`），没有新增用例或文件；Core typecheck exit0（`20261007-two-failures-types.log`）。未减数据、提高超时、降低并发、修改durability或跳过原失败。
- 四源冻结差量只读复查已结束，Critical/Important/Minor均0。阶段完整 `check.cmd` 终态exit1，日志 `20261007-two-failures-phase-check.log`：Task3、Contracts511、Storage77、Realtime162、Browser12通过；Core1036通过/1失败，XLSX背压用例通过，Subject501对象主流程7840ms超过原5000ms。Desktop及其后全类型/Python/构建未由该命令执行，不能称整体绿色。上批43源材料复查不替代本批或全分支审查。
- 未提交推送、安装、新增依赖、访问真实平台或用户库、启动原B/S；工具、证据和新数据均在D盘。

## 保留边界与接续

完整并行场景的Subject提交/磁盘耗时尚未证明已修复；同步SQL/快照写入、大数据性能、其他配置/JSONB/部分提交、最新schema16目录包及真人扫码/原生保存/安装验收仍OPEN。后续Subject输入迁移独立记录于[输入审计](2026-10-07-subject-text-input-audit.md)，不计入本批四源结论。
