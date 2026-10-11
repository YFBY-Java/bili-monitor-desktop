# 弹幕事件入库时间迁移（2026-10-06）

原只读依据：`BilibiliLiveEventIngestionService.java` 的事务和 legacy 投影；`BilibiliLiveDanmakuRepository.java:142-215` 的 metric.updated_at=now()；`V6__bilibili_live_danmaku_monitor.sql` 的 metric/recent.created_at 默认now()；`V10__bilibili_live_session.sql:73` 及 `JdbcBilibiliLiveSessionEventRepository.java:19-39` 的事实created_at默认now()。`BilibiliLiveDanmakuService.java:403-429` 先补昵称再开始入库事务。原路径位于 `D:/codex_work/BiliMonitor/social-data-monitor/backend/`。

## 已实现

分开业务发生时间、Worker接收时间和本地写入时间。命令在入库事务开始采样一次Core时钟，事实、最近消息和指标共享这一写入时间；昵称异步补全后才取时间。事实occurred_at/received_at、最近消息sent_at、指标bucket_start仍保留原事件时间。指标冲突更新保留首次created_at，只更新本次updated_at，不再因迟到消息而回填旧的更新时间。心跳指标也使用独立本地写入时间。

只新增内部可选writtenAt参数，没有IPC/Worker协议或数据库升级；直接Repository/SessionService调用缺省时使用当前写入时间。历史数据不重写，不伪造无法恢复的旧入库时间。没有修改其它传输生命周期时间规则，不把整个M09的时间域宣称完成。

## 轻量验证

仅2新Core贯穿用例，使用实际Core/SQLite与合成平台源：迟到更新/首次创建保留/三表共用事务时钟；昵称等待后写入/心跳时间独立。先RED后GREEN，复用2项原场次/存储用例，共4定点通过，32项未选择不计通过。Core/Storage类型检查及主代理一次生产构建均退出0；非真人/原生验收。

4路径冻结任务差量审查通过，Critical/Important/Minor均0，无修复或追加验证。最终124个无关增量及4个冻结SHA一致，原B/S/API干净、HEAD/空index保持，D盘环境/6个非空实际bundle/项目进程监听0/diff空白检查通过。没有历史套件重跑、新矩阵或累计分支审查；旧整体验证缺口保留，完整M01–M18仍active。

## 下一步

原WBI共享缓存/同步双检/完整fallback只读核对已完成，材料provider独立锁、失败后逐等待者重取、force不合并与当前凭据重读均需忠实迁移；下一步实施此功能，不当成本轮已实现。随后按[迁移台账](2026-09-13-full-migration-tracker.md)推进剩余M09和其它模块。原B/S/API只读、所有输出D盘、旧增量保留，未提交推送、安装或访问用户真实配置/库/凭据。
