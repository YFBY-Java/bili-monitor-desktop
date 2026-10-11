# 工作台创建的整体提交与失败回滚（2026-10-07）

## 原业务与实现

原只读 B/S `fa2faa6` 的 `SubjectService.createSubject` 使用 `@Transactional`：资源解析中的粉丝/直播监控及 API 日志、直播初始化的场次/快照、工作台/绑定/布局都参与创建事务。`bindSubject` 没有这层整体事务，不能顺便改成相同语义。

客户端原来先提交监控资源，再单独保存工作台，后一步失败会残留监控、快照和日志。本片把 Follower/Live 添加拆为资料准备与同步提交；普通添加仍立即提交，改绑保持原流程。工作台创建先准备资料，只在准备全部结束后开启 SQLite 事务，提交 API 日志/artifact 记录、监控、快照/场次及工作台/绑定/布局/Outbox。提交时重读资源，保持复用和并发添加的原上插规则；UID 自动查直播间的可预期业务弱失败保持。

API 日志仅在该次异步准备上下文中缓冲，最多64条；独立操作不加入该缓冲或事务。没有跨 `await` 持有数据库事务，没有补偿删除、降低持久性或改数据库版本/契约/依赖。已发出的平台请求、CAS物理字节及共享HTTP缓存不是数据库事务，不能声称撤回。

## 实际验证

- 真任务前镜像：`.tools/temp/20261007-subject-create-transaction-before`，仅本片五个源文件；逐文件 no-index 差量同前缀保存。独立只读复核确认五文件当前hash与冻结diff匹配，Critical/Important/Minor均0；不是累计分支审查。
- 只新增一个代表流程，真实 services/SQLite，平台I/O合成。RED实测NUL工作台失败后残留相关记录。GREEN同时验证十二表完整回滚、准备期间另一UID独立添加保留、布局SQL trigger后置失败回滚、成功场次、资源复用及数据库重开。
- 新流程1通过/2过滤；相关三个既有文件合计12通过；Storage/Core最终类型检查通过。早期类型检查发现共享输入/输出类型区别，改为使用共享schema的parse返回类型，保留旧失败日志，不扩大输入接受域。
- 当前Desktop类型及全部生产bundle构建exit0；实际生产Main/Preload/Core在新D盘隔离目录 `.tools/temp/bmd-production-final-zPXzX3` ready/schema16，IPC资料创建、Core59284→59796重启保留、删除/正常退出自有PID残留0通过。该流程不调用平台、不访问用户库；OS保护原语保留，不等于真人凭据/安装验收。

证据日志为 `.tools/temp/20261007-subject-create-transaction-{red,green,regression,types-final,build,production-smoke}.log`。本片四个生产文件与一个测试文件，只有TypeScript变更；原B/S只读干净、HEAD4c94959及空暂存区保持，全部已有改动保留，未提交推送。

## 当前独立目录版

新unsigned目录 `release/migration-20261007-subject-transaction/win-unpacked/BiliMonitor Desktop.exe` 已生成，不覆盖旧产物、不安装、不重新编译native依赖。该版本包含直播添加、Subject文本及本片事务修改；`resources/app.asar` 为87,846,737字节，SHA256 `36404CC043CA6A0D813B55041D9EB3DBE2AF7E181DD98F787882F7F364D2E777`。

实际exe验收清空开发环境、PATH只保留Windows系统目录，确认 `isPackaged=true` 和从该app.asar运行；内置Python握手、Live v2精确汇总、真实Adapter注册表、工作台创建与原文绑定、Core62232→59696重启保留、删除/正常退出自有PID0通过。隔离目录 `.tools/temp/bmd-standalone-schema16-cpkX4w`；自动采集/OAuth关闭，不访问用户库或真实平台。日志同前缀 `{package,standalone-smoke}.log`。这不是NSIS安装、真人授权或原生保存验收。

## 剩余范围

本片结束后的阶段 `check.cmd` 已实际终态exit1，日志 `20261007-subject-create-transaction-phase-check.log`：Task3、Contracts511、Storage77、Realtime162、Browser12通过；Core1035通过/3失败（1038项），无未处理拒绝报告。失败全部为原5000ms预算：Subject501对象6784ms、直播75/64批量配置5246ms、弹幕101连接6106ms。新增回滚代表流程在该阶段通过。Desktop及后续全量类型/Python/构建未由此命令执行；不能拿前面的生产构建/目录验收改称整套通过，也不能将三处超时统一归因于本片或测试负载，根因仍需有限定位。

对本轮新增出现的两个超时仅做一次有限诊断：原配置批量和101容量用例在原预算下合计2通过/11过滤，日志 `20261007-subject-transaction-phase-timeout-diagnostic.log`。它们的真实业务断言在这次运行执行完成，但不是相同完整并行条件，不能用它关闭阶段失败。501对象准备与原durable提交、超时/并发均未修改。桌面旧阶段的删除启动probe显示六个预打包依赖请求待完成；已只读确认当前Vite默认扫描根内八个HTML且等待crawl/优化，不把该观察直接当根因或关闭冷启动缺口，尚未修改Vite或夹具。

这里只关闭创建的数据库整体回滚；原 JSONB 规则、其他数据库异常/部分提交行为、配置兼容、阶段失败/批量性能及真人/原生/安装验收仍开放。最近生产bundle已经包含直播添加、Subject文本和本片事务修复；旧schema16目录包不自动获得这些变化。完整M01–M18仍未完成，不将本片或定向绿色作为全量验收。
