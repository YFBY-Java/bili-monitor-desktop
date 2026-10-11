# 用户工作台资料回填与绑定修改（2026-10-07）

## 原业务依据

原 B/S `fa2faa6` 只读，分别核对 `SubjectService.maybeBackfillSubjectProfile`、`SubjectWorkbenchService.backfillSubjectAvatar/resolveUser/resolveLiveRoom`、`UpdateSubjectBilibiliBindingRequest` 和 `SubjectRepository.upsertBinding/readStringList`。这两种回填不是同一个流程：列表/详情只查询显式绑定的 monitorId，可以回填姓名；工作台允许按 UID/房间号回退，只回填头像。Java blank 判定与 NBSP 等原文区别保持。

原修改绑定 DTO 字段可空，Repository 用 COALESCE 保留旧身份；null 能力列表/弹幕开关保留旧值，空数组清空能力。能力是原样保存的 List<String>，允许 null 元素、空白/空串、重复和未知名称；保存名称不等于实现该能力。

## 已实现

- 列表/详情按显式绑定读取，用户头像非 null（包括空串）优先，只有 null 才回退房间；Java blank 姓名才回填。备注和标签保持。
- 工作台按已有身份回退读取，选择非 Java blank 用户头像，否则房间头像；不改姓名。Subject 响应保留历史空串头像。
- 绑定修改的共享输入允许 null 并转换为未提供，Core 保留现有身份和开关；能力列表不清理、不去重、不限制枚举，[] 清空。
- SQLite 绑定读取单独保留 string/null 数组，不改变标签的 string[] 读取。共享 TS 响应和 portable v2/v3 同步，复用同一 JSON fixture；不新增 Python Subject 命令层、能力消费者、依赖或数据库迁移。

## 有限验证

回填真实任务前快照 `20261007-subject-backfill-before`（494 源），最终两源差量 `20261007-subject-backfill-review-v2.txt`。原流程先复现 Java blank/来源差异，再修正；复查发现空串头像漏传后补实际 RED→GREEN。历史空串资料仅写入 D 盘隔离测试库，独立句柄关闭后通过实际 Core 读取，不放宽采集资料契约。最终七项既有流程和全 workspace 类型通过；两源限定复查 C0/I0/Minor0。这是当时切片结论，后续绑定修改已改变其中两个文件，旧 hash 不代表当前冻结版本。

绑定任务前快照 `20261007-subject-binding-input-before`（494 源、3,993,506 字节），最终九源差量 `20261007-subject-binding-input-review-v1.txt`（50,121 字节）。真实 RED 为契约拒绝输入、Core 的 nullable ID/能力/开关校验失败、Python portable enum 失败；首次契约命令末尾曾误含无效命令，测试已先输出真实断言失败，之后纠正命令。GREEN：Contracts 两项、Core 服务文件两项、Python 同 fixture 一项（81 项过滤未运行），全 workspace TS 类型 exit0。没有增加 TS/Core 测试名称或矩阵。九源限定只读复查 C0/I0/Minor0；随后九个当前源码哈希核对无漂移。

阶段完整 `check.cmd` 已终态exit1，日志 `.tools/temp/20261007-subject-binding-phase-check.log`：Core1036通过/一个Subject501对象8098ms超过原5000ms，Desktop和后续阶段未由该命令执行。本批之后的桌面补验、夹具失配修正和实际schema16独立目录版，见[阶段回归与目录版审计](2026-10-07-stage-regression-and-directory-audit.md)，不把定点通过当完整回归绿色。

## 保留边界

原 Jackson 对非字符串 scalar 的强转、raw JSONB 接受域和数据库失败/部分提交仍是独立待核对项，不通过过滤测试数据假称完全等价。配置、同步SQL/大数据性能、真人扫码/采集和原生保存/安装继续开放；最新schema16独立目录版已通过限定启动/重启/本地绑定保留验收，不代表这些开放项已完成。原B/S/API只读，全部新数据在D盘，未提交推送、安装或访问用户库/真实凭据；完整M01–M18目标active。
