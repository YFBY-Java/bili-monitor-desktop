# API日志 JSONB 文本保存（2026-10-07）

## 对照原项目

原 Follower Repository.recordApiCall 和 Live Repository.recordApiCall 将请求/响应元数据经 `ObjectMapper.writeValueAsString(HashMap)`、pgjdbc UTF8编码，再 CAST 为JSONB。failureMeta.message 保留API原消息；日志落库异常逃逸平台失败捕获，不触发平台重试/回退或监控失败状态。

本片把已有Subject的相同纯编码算法抽为 `postgres-json-storage.ts`，Subject wrapper保留原函数/安全错误消息；仅API两个新写入参数接入它。孤立UTF16按该Jackson String writer/pgjdbc域转`?`，真正NUL拒绝；正常emoji、字面反斜杠-u、UID字符串及未声明历史metadata的null保持。没有改schema16、历史、CAS原字节、服务流程、Worker生产代码、契约、UI或布局事务。

依据为原Repository/Service和已核定的[Jackson2.17.3 String writer](https://github.com/FasterXML/jackson-core/blob/jackson-core-2.17.3/src/main/java/com/fasterxml/jackson/core/json/WriterBasedJsonGenerator.java)；[PostgreSQL JSON类型文档](https://www.postgresql.org/docs/current/datatype-json.html)明确JSONB拒绝真实U+0000。本片未启动原B/S、Java或PostgreSQL；源码/文档推导不等于原数据库实机等价，也不扩大为全部JSONB数值/排序/任意映射器兼容。

## 实现与真实验证

六源任务差量：Storage control-database/既有test/Subject wrapper/新共享helper、Core既有HTTP错误集成test、Python合成HTTP fixture。实际before已包含此前裁剪SQL，位于 `.tools/temp/20261007-api-meta-json-before`；v1 manifest/diff同前缀。没有从HEAD重新审查累计修改。

- 复用原Storage case，新增编码后的metadata读取、真实NUL拒绝、同事务artifact索引回滚、日志不增及数据库重开保留。按callId查新增记录，不依赖相同attempt顺序。真正业务RED-v2→GREEN，原case操作/断言/预算不削弱。
- 仅新增一个代表流程，实际Python HTTP→NDJSON→Core→SQLite：同Worker正常card→孤立UTF16/emoji/字面escape失败消息→NUL失败消息。验证编码后的日志、真正存储拒绝、无等待/平台回退及原监控/历史不变。只替换httpx I/O，fixture通过ensure_ascii=True生成合法wire；不以Python构造非法UTF8的错误冒充业务RED。
- 最终Storage全部77项通过，Follower/Live/Rank/共享限流四文件31项通过；原Subject JSON流程通过，过滤项不计通过、不累加重复用例。
- 全workspace TypeScript、fixture Black/isort通过；当前生产build退出0。独立六源有限复核 C0/I0/Minor0，当前hash/字节与manifest一致。
- 最新实际Electron生产装配在 `.tools/temp/bmd-production-final-NaXZ9k` 验证五页切换、schema16/精确桥接/注册表、单Core70576→58712重启、Subject TEXT/JSON保留/NUL拒绝、自有OS保护原语、正常退出自有PID0。没有真实平台、凭据、用户库或安装包操作。该smoke验证装配/原Subject共享函数，不冒称生产包实际平台日志验收。

## 阶段与全量状态

最新完整check是**本片之前裁剪版本**的 `.tools/temp/20261007-retention-prune-phase-check.log`：exit1，Core1037/1039，最近弹幕5016069ms和Subject批量6483ms超原5000ms；Task3/Contracts511/Storage77/Realtime162/Browser12通过，后续未执行。它不包含本片新增代表流程，不能当作当前完整验收。本片按用户少量验证/阶段汇总要求未再次重复整套求绿，只有以上限定证据。

原快照raw_payload JSONB、其它数据库失败/部分提交差异、默认共享执行域/完整配置及独立兼容域继续OPEN；布局逐条/原子策略尚待用户选择。全量并行性能、浏览器整套崩溃/交互超时、最新目录包、真人扫码/原生保存/安装验收未关闭。旧目录包不含本片、裁剪、懒加载和Subject JSON最新修改。

全量M01–M18目标 active。本片实现和有限验收有实质进展，不是整体完成或暂停。原B/S/API参考干净只读，累积修改与空index保留；所有新产物在D，没有提交推送、全局记忆或用户库写入。
