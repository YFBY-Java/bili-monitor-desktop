# 弹幕连接容量迁移（2026-10-06）

原依据：`BilibiliLiveDanmakuProperties.java:13,51-55`、`application.yml:95`、`BilibiliLiveDanmakuService.java:114-123,244-270`。原B/S只读，容量是应用配置，不是B站平台许可。

## 本轮完成

移除Node Realtime manager额外的100个存活连接限制。配置仍由Core单点消费：默认10、实际至少1、已有活动连接先复用、手动/自动共享名额。Worker不新增容量配置或契约字段；取消、替换、停止和迟到事件身份保护不变。

Core与NDJSON的未完成操作/请求队列100/120背压保持，它们限制的是在途请求，不是已经建立的连接数量。没有改数据库版本、UI或Python生产代码。

## 验证

仅1新用例，实际配置→LocalCore→SQLite→WorkerSource→Manager：101连接成功，同连接复用；102被Core拒绝且没有新会话，停止后补位，全停清空。外部socket与物理IPC使用合成传输，不代表真实平台、NDJSON子进程或原生客户端验收。

先RED为第101触发Worker额外限制，删除后GREEN。复用4项floor1/手动自动共享容量/在途停止/shutdown，最终5个不同定点用例通过；25项选择外不计通过。新测试的事件类型适配与strict结果中的stop函数曾失败，已改用现有WorkerSource并按生产协议去除函数；最终新用例及两包类型检查退出0。Main单次生产构建终态退出0。

本次2路径增量只读审查通过，Critical/Important均无；Minor为测试清理异常时可能跳过后续shutdown/环境恢复，已核实并记录到阶段收尾，不改生产或追加验证。两冻结SHA及117个无关增量SHA保持，原B/S/API干净，HEAD/空index不变；工程环境/6个非空bundle在D盘，项目进程/监听0、空白检查通过，生产包无旧容量错误及本次测试标记。没有全历史check、测试矩阵或累计分支审查；旧整体验证缺口仍保留，不把局部绿色当全量完成。

## 下一步

继续M09指标range回退/Long解析、事实写入时间、共享缓存/同步双检/fallback等；全M01–M18/真人/原生/安装未完成，目标保持active。原B/S/API只读，产物D盘，旧修改保留，未提交推送、安装或访问用户真实配置/库/凭据。当前范围以[迁移台账](2026-09-13-full-migration-tracker.md)为准。
