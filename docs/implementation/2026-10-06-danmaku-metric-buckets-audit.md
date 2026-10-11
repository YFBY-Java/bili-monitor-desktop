# 弹幕指标分桶迁移（2026-10-06）

## 完成范围

对照原 `BilibiliLiveDanmakuProperties`、Repository、Service及EventIngestionService实现，不改原B/S项目。

- `bucketSeconds` 默认60、signed32原值，兼容 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS`，规范名 `APP_BILIBILI_LIVEMONITOR_DANMAKU_BUCKETSECONDS` 优先。配置→Core→Service→SQLite→返回完整贯通，无额外3600上限。
- 只在计算桶起点时使用 `max(10,raw)`；保存字段和唯一键保留raw。秒数先floor，再按Java整数除法向零截断，UTC表示保持同一瞬时值。
- 命令按事件时刻落桶，heartbeat按接收时刻落桶。现有查询仍按桶起点闭区间、取最新2000后升序；配置改变不重算历史桶，不添加重聚合任务。
- 追加SQLite v15，解除旧10..3600约束，改signed32整数检查；事务内保留历史行/rowid/索引/触发器/视图/外键，失败回滚，恢复连接设置。已发布v7/v13/v14不改。
- `listenProbeSeconds` 默认20，兼容原 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROBE_SECONDS` 和规范名 `APP_BILIBILI_LIVEMONITOR_DANMAKU_LISTENPROBESECONDS`。原项目没有消费者，本地只绑定配置，不虚构探测任务。15个原启动输入字段已支持，不等于15个实际消费者或M09完成。

## 最小验证与当前状态

新增仅3项代表用例：超3600真实Core链路/epoch边界/heartbeat；低raw跨重启保留；v14升级保留历史及依赖/外键。均先复现差异再通过。最终复用7项已有断言，定点共10项通过；TS108项未选中，不计通过。Contracts/Core/Storage类型检查退出0，Main单次生产构建退出0。

本次19路径任务增量只读审查通过，Critical/Important/Minor均0，冻结SHA保持；没有追加测试/build或累计分支审查。98个无关增量SHA未变、原B/S/API干净、HEAD/空index保持，工程环境及6个非空bundle位于D盘，项目进程/监听0、空白检查通过，生产包无本次测试标记。后续每功能只保留2–3个关键用例，完整回归留阶段收尾。

旧整体验证缺口未撤销：最近一次完整check的Desktop进程异常退出，未给出桌面用例汇总；更早pending add/trend等待失败也没有证明根因已修复。局部通过不等于全量绿色或发布可用。

## 后续

继续M09原业务：Node额外100容量、无效range回退/Long解析、created/updated写入时间、跨Worker共享缓存/同步双检/完整多段fallback等；完整M01–M18和真人/原生/安装仍未完成。原B/S/API资料只读，所有工程产物D盘，未提交推送、安装或访问真实用户配置/库/凭据。

逐功能进度以[迁移台账](2026-09-13-full-migration-tracker.md)为准。
