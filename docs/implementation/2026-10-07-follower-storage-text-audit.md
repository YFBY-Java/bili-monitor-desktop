# 粉丝资料与错误文本直接存储规则（2026-10-07）

本项完成限定实现、定向验证、独立任务复查与最终生产构建/隔离启停。只关闭Follower四个新写入字段的存储编码/NUL边界，不代表整个M06、原JSONB或全量迁移完成。

后续[Subject直接文本切片](2026-10-07-subject-direct-text-audit.md)将同一算法抽到内部通用helper，Follower包装和原错误/昵称规则不变，旧真实SQLite流程再次定向验证通过。下文冻结hash为本项当时版本，不代表后续抽取后的当前源码；不以旧hash覆盖后续改动。

## 原业务与实现

对照原 `fa2faa6` 的 `BilibiliFollowerMonitorService` 添加/刷新/重试及 `BilibiliFollowerMonitorRepository` 资料直接绑定、错误截断和快照SQL。历史API资料 `docs/user/info.md` 先只读核对。原代码与API参考库均未修改，未启动原服务或新增PG/JVM实验。

- `followerStoredText`：实际NUL用固定安全本地错误拒绝，孤立UTF16单元按既有pgjdbc编码观察转ASCII `?`；正常emoji、字面U+FFFD、空格与其它原文保持。
- nickname先上述编码，再原160字符/仅超出ASCII空格的截取规则；nullable avatar仍为null，profile同样显式映射。错误字段先UTF16 slice900再编码，截断后的孤立单元变 `?`，900以外NUL不影响该字段。
- 仅Follower两个Storage方法调用，不修改临时资料/Worker协议/原始响应、重试/错误分类、计数/ID/URL规则、其它TEXT、历史数据或schema16。
- 保留monitor/snapshot/artifact登记/outbox原子事务；独立成功API日志及CAS仍保留。持久化异常不进入平台失败/重试/关系接口回退。

## 验证与修正

- 实施者报告实际行为RED→GREEN，初始19个Storage用例（14既有、5代表项）及1个真实HTTP→Python→NDJSON→Core→SQLite NUL刷新通过；Storage/Core类型与单夹具Black/isort通过。过滤项及重跑不重复计数。
- root本轮实际Storage两个Repository场景通过；最初NUL Worker验证失败于日志排列断言。辅助查询无ORDER BY，随机UUID索引顺序可能把新任务放前；实际schema索引和有界SQLite观察确认，不是旧API行被覆盖的证据。
- 同一实施者仅修测试fixture：两个既有NUL/数字文本流程用逆序有效UUID获得确定性RED2失败，再明确按首条API行rowid枚举任务，保留公开投影与完整断言。修复后限定2流程/14过滤、Core类型通过；root最终同2流程exit0。没有改生产日志排序或增加测试矩阵。
- 独立初审/复审Spec compliant / Task quality Approved，无当前Critical/Important/Minor。初审Minor为报告夸大旧CAS重开后断言，已收窄：旧字节重开前检查，新字节重开后检查，不增加无必要测试。
- root最终Desktop web/node类型与Main/Core/Preload/Renderer生产构建exit0。新D盘 `.tools/temp/bmd-production-final-z8egJG` 启动ready/schema16、精确Live/Subject桥接、真实平台注册表、单Core启动/重启、正常退出均通过，记录PID残留0。自动采集/OAuth关闭，无真实平台、用户库或凭据；不是安装/真人验收。
- 真实任务前488源仅5个声明路径变化，其余483保持；root最终review-v2五个当前hash一致，限定空白检查exit0，项目Node/Python/Electron进程0。LF→CRLF仅Git换行提示。无提交推送、安装或C盘项目产物。

## 交接与保留边界

冻结文件：Storage helper、control-database、Storage测试、Core profile-text集成测试、Python profile-text HTTP fixture。Core集成测试最终SHA256 `9f2ae1c1a847faf318691e1d758f5b0061ed010a506ff14c58c2c02e4f4d3d6f`；另外四个冻结hash未变。完整hash与命令保存在D盘同前缀report/before/review-v2及review.md，当前交接同步持久摘要。

原raw/failureMeta JSONB接受域、数据库异常/SQLSTATE及原可能的monitor先提交仍未等价；保留客户端原子事务，不递归清洗JSON、不拆事务或猜测修复历史U+FFFD。其它编码/消费者及极端组合不由本项证明。

本功能收尾后按用户要求暂停后续迁移，本次仅记录进度。恢复后下一项为原直播HTTP响应转换与错误域，尚未实现；阶段完整check及历史失败、性能/阻塞SQL、最新目录包、真人扫码/获准目标与原生保存/安装仍未完成。完整M01–M18目标暂时暂停而非完成，不重派本项或已完成响应归属/数字文本/Live/导出任务。
