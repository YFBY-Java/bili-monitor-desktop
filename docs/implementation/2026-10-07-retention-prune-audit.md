# 最近弹幕裁剪 SQL 收尾（2026-10-07）

## 原业务与有限改动

只读对照原 `BilibiliLiveDanmakuRepository.trimRecent`、`BilibiliLiveEventIngestionService.projectLegacy`。每次合法弹幕入库后，按同房间 `sent_at DESC` 和原插入顺序保留最新 N 条；存储 floor1、服务 floor20、查询200、500正文上限、永久事件和指标均保持。

客户端只把“建立保留 UUID 集合并扫描房间”改为“用相同排序跳过前 N 条，按溢出 rowid 删除”。没有改 schema16、索引、同步模式、事务批量、提交次数、缓存、Worker、页面或用户库。实际变化只有 `control-database.ts` 与该文件既有测试。

## 定位与验证

- 原501真实 Core 用例的被动 SQL profile：500次 COMMIT约1609ms，498次裁剪约166ms；提交仍占主要耗时，不宣称完整超时根因已修。
- 隔离同schema、同数据比较200次：旧查询84.3ms，新22.3ms；完整 survivor rowid/UUID 集合相同，新外层只按 INTEGER PRIMARY KEY(rowid) 查找。该微基准不是实际整体时延承诺。
- 原 Storage 大量写入用例仅新增透明观察生产 prepare/expandedSQL 的 query plan 断言，所有原操作、断言、预算和并发保持，未新增case。首次漏vi import是测试错误；修正后的 RED-v2 真正因旧外层查询计划失败，新SQL后 GREEN。
- 定向 Storage原1项和Core整文件15项通过（被过滤项不计通过）；Storage/Core类型通过，任务差量空白检查通过。
- true-before 位于 `.tools/temp/20261007-retention-prune-before`；冻结v1 manifest/diff与两个当前hash/字节匹配。独立有限复核 C0/I0/Minor0，不代表累计全仓/全量迁移验收。
- 当前生产 build退出0；真实 Electron 隔离五页切换、schema16、精确桥接、注册表、单Core重启、Subject TEXT/JSON保留、NUL拒绝、自有OS保护原语、退出PID0通过。数据 `.tools/temp/bmd-production-final-1cbblr`，Core62612→33652。自动平台关闭，无真实凭据/用户库，未打包或安装。

## 阶段结果及剩余

唯一标准 `check.cmd` 终态 exit1，Core1037/1039、90文件中2失败：最近弹幕501原5000ms流程6069ms，工作台批量创建/聚合/隔离流程6483ms。Task3/Contracts511/Storage77/Realtime162/Browser12通过，无未处理拒绝报告；Desktop与后续类型/Python/build没有由该check执行。单独build/类型不改变check失败。

证据 `.tools/temp/20261007-retention-prune-phase-check.log`。不改预算/并发/持久性，不重跑完整检查求绿。SQL的重复扫描已处理，完整并行性能仍OPEN，下一步不能继续假设删除SQL是主要瓶颈。浏览器整套 Target crashed/交互超时、布局部分提交差异、其它真实业务兼容和真人/原生/安装验收继续OPEN。

所有新文件、日志与数据在D盘；原B/S/API参考保持只读，累积用户修改与空index保持，无提交推送。完整M01–M18目标 active，本片不是全量完成声明。
