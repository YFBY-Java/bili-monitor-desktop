# 用户工作台创建/修改输入对齐（2026-10-07）

## 原业务与范围

原B/S `fa2faa6`只读，对照 `CreateSubjectRequest`、`UpdateSubjectRequest`、`SubjectService` 和 `SubjectRepository`，以及完整V5建表脚本。名称DTO只限制原始Java UTF-16长度160；头像和备注是普通可空字符串，未要求URL或2000字上限；原始标签没有48字/12项输入上限，Service用Java trim清空、去重后取前12。修改名称null不改变旧值；头像/备注空或null经COALESCE不清旧值，tags:null不变、[]清空。

本批相对 `.tools/temp/20261007-subject-text-before/manifest.json` 的493源任务前基线，开工核对0漂移；8路径冻结差量为 `20261007-subject-text-review-v1.txt`。只改共享契约、Core、两份portable响应schema和代表用例/同一golden fixture；不新增界面、Python Subject业务层、依赖或数据库迁移。保留工作区全部先前增量。

## 已实现

- 共享创建/修改输入支持原可空字段，原始名称先执行160 UTF-16上限，再由Core规范化；文本头像、长备注、标签原始数组均允许。原UID/房间号精确域、UUID和严格对象约束保持。
- Core只移除U+0000..U+0020首尾字符，不使用JS Unicode trim；保留NBSP等原文。标签在清理/去重后截取12项。创建空名称从绑定资料回退，头像按原资料来源回退且返回原存储文本；修改空名称拒绝，null/空头像备注与null/空数组区别保持。
- 工作台v1/v2/v3响应不再拒绝超过48字的有效标签，也不二次Unicode trim。Python用同一个fixture检查v2/v3响应；它不执行Subject命令，不为此复制Python输入业务。

## 有限证据

- 实际RED：共享输入代表流程拒绝原有效请求；真实Core/SQLite流程因null、URL、备注/标签限制失败；Python portable响应因maxLength48失败。
- 修正后，两个既有TS契约用例、七个既有Core用例（含五个资料原文代表）、一个Python跨版本响应代表通过。没有扩张矩阵；新命名测试只有一个Python响应用例，TS/Core复用原流程。
- 全工作区TypeScript typecheck和修改Python文件Black/isort检查exit0；冻结8路径限定只读审查C0/I0/Minor0。当时Desktop生产构建exit0；后续回填/绑定修改的当前验证另列，不用本次构建覆盖后续源码。
- 本批没有再次运行完整check。此前完整 `20261007-two-failures-phase-check.log` 已exit1：Core1036通过/1个Subject501对象5秒超时，Desktop和后续阶段未执行。定点绿色不关闭该并行性能缺口。

## 接续边界

自动资料回填随后已区分列表/详情与工作台规则实现，绑定修改也已继续对齐，见[后续审计](2026-10-07-subject-backfill-and-binding-audit.md)。其它配置/JSONB/部分提交、性能、最新schema16目录包和真人/原生/安装验收保持开放；完整M01–M18目标active。本批未提交推送、访问真实平台/用户库或启动原服务，全部新资料位于D盘。
