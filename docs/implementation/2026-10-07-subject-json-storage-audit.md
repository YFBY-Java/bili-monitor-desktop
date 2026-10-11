# 工作台 JSON 文本保存边界（2026-10-07）

## 原业务与本次差量

原只读 B/S `fa2faa6` 的 `SubjectRepository` 把标签、绑定能力、布局 position/settings 经过 `ObjectMapper.writeValueAsString` 和 pgjdbc UTF8 参数编码，再 `CAST(... AS jsonb)`；不是直接 TEXT 字段，也不是原响应 CAS 字节。

本片只修改这五个参数的新写入，以及绑定修改的返回对象。采用单一内部 `serializeSubjectJson`：对 JSON.stringify 结果按完整 JSON escape 消费，真正 NUL 用固定安全错误拒绝；孤立 UTF16 转 ASCII `?`，配对 emoji、字面反斜杠-u、正常文本、数组/null/普通数字不改。处理包含嵌套值和对象键，编码后同名键的读取沿 JSON 的最后一值；标签先按原 Service 去重再编码，不在编码后额外去重。绑定修改完成后读取实际落库对象返回，避免返回原输入而后续查询返回另一值。

依据：原 Repository/Service/V5 DDL 和原工程未配置非 ASCII/custom escaping 的源码；默认 Jackson String writer 的 [_writeString2](https://github.com/FasterXML/jackson-core/blob/jackson-core-2.17.3/src/main/java/com/fasterxml/jackson/core/json/WriterBasedJsonGenerator.java) 复制非 ASCII UTF16 单元，以及此前直接 TEXT 片已核定的 pgjdbc 编码边界。[PostgreSQL JSON 类型文档](https://www.postgresql.org/docs/current/datatype-json.html)说明 JSONB 不接受真实 U+0000、对象重复键保留最后值。本次没有启动原 B/S 或 PostgreSQL，也没有新增 JVM 实验；不把官方源码与文档推导冒称真实原 HTTP/数据库运行验收。

源码范围仅四文件：`packages/storage/src/{subject-json-storage.ts,control-database.ts}`、`packages/core-runtime/src/{bilibili-subject-service.ts,bilibili-subject-service.test.ts}`。三已有文件真任务前镜像和 no-index 差量在 D 盘 `.tools/temp/20261007-subject-json-before` 与同前缀 diff。schema16、契约/IPC/Worker/依赖、历史数据、直接 TEXT 和非 Subject JSON 均不改。

## 验证

- 只新增一个实际 Core services/SQLite 流程。RED 同时观察创建/更新/绑定/嵌套布局保存不符和 NUL 错误成功；不是初始化错误。GREEN 首次在新测试误用 API 日志查询缺少 taskId 处失败，纠正验证代码后最终 1 通过/3 过滤，旧失败日志保留。
- 同流程检查普通 emoji/字面 escape、编码后键冲突、数据库重开、创建/更新 NUL 拒绝。两既有相关文件合计12通过；Storage/Core 类型检查通过。没有删除既有断言、放宽预算、降低持久性或扩测试矩阵。
- 新测试之后把非法布局的拒绝检查移动到合法布局保存前，取消“失败后旧布局必须保留”的新增断言，避免锁死尚未由用户选择的原/客户端事务差异；三生产源没有再修改。该最终测试的定向结果另记下方，之前12项不冒称对最终测试版本重跑。
- 最终四源限定只读复核 Critical/Important/Minor 均0，任务前差量与四个当前 hash 匹配，HEAD/空暂存区保持。根代理随后实际定向验证最终测试1通过/3过滤（`20261007-subject-json-test-final.log`）；复核不替代根代理的运行结果，重复运行不累加用例数。
- 当前 Desktop 类型及 Main/Core/Preload/Renderer 生产 bundle 构建 exit0。实际 Electron 在新 D 盘 `.tools/temp/bmd-production-final-JGkDMB` 经真实 IPC 创建标签、改绑能力、保存嵌套布局、拒绝非法 NUL，Core35720→14552重启后全部保持，删除/正常退出自有 PID 残留0。schema16、精确 Live/Subject v3 桥接、真实 Adapter 注册表及隔离 OS 密钥保护原语保留通过。

日志：`.tools/temp/20261007-subject-json-{red,green,green-final,regression,storage-types,core-types,build,production-smoke}.log`。生产 smoke 脚本独立保存在 `.tools/temp/subject-json-production-smoke.mjs`；不调用真实平台，不使用用户库、真实凭据或正式 OAuth。它不是原生保存/剪贴板/真人扫码/安装验收。

## 阶段与未完成项

本片仅启动一次 `check.cmd`，已终态 exit1，日志 `.tools/temp/20261007-subject-json-phase-check.log`。Task3、Contracts511、Storage77、Realtime162、Browser12通过；Core1038通过/1失败（90文件1039项），失败是既有Subject501对象7641ms超过原5000ms，未出现未处理拒绝报告。新 JSON 流程和创建回滚在该阶段通过；此前两处配置/101容量用例在这次完整并行阶段实际通过，但本片未修改其生产代码或证明以前超时的根因，不宣称稳定性已修复。Desktop及后续完整类型/Python/构建没有由该命令执行，旧桌面阶段失败仍未关闭。

该 check 加载的是上述断言移动前的测试版本，生产源与当前一致；最终测试另由定向1项通过覆盖。不重新跑完整套件求绿，不把这次1失败改写前一片3失败证据，也不将先前12项回归称为最终测试版本的全套验证。

最终源 hash：control-database `6F436B5CAE95756E9D9AC3ACE18786A1B4EF8BE51456941B811BCB8097B27E5B`，新 helper `2BEAAF553CDA85BB6830801B93D8B9843B4E3456200738E73D0F7AE990690330`，Subject service `F5525E0ED111023217E4E0588589BE8168906678B4C4CFA7D83ECA22B2CD4E14`，Subject test `7829E1E9A9385B0CFBB1E4542BB7CCD0F2FD43C97FB07854D3F8E053AC796542`。根代理收尾核验与复核一致，当前项目相关进程为0，原B/S只读干净；未在测试/构建运行途中改变生产代码。

原 `SubjectService.updateLayout` 是删除后逐条提交，客户端既有实现是整体替换事务。本片没有变更该策略，已向用户询问保留客户端原子保存（推荐）还是完全复刻原逐条提交；在回复前，这项差异继续 OPEN。本片不扩大为所有 JSONB 数值/键排序/异常类型/部分提交行为等价，不清理历史数据，也不改其他 B站 JSON 写入。

最新生产 bundle 包含本片。独立目录版 `release/migration-20261007-subject-transaction/win-unpacked` 是本片前的版本，没有此次 JSON 保存修复，本轮未重新打包/安装、未覆盖旧包。完整 M01–M18、原有阶段超时/性能、其他兼容和真人/原生验收未完成，目标 active；原 B/S 保持只读，已有未提交改动与空暂存区保留，无提交推送或全局记忆写入。
