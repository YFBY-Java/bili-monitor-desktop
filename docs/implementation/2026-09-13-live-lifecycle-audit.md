# M08 直播调度、退出与重启恢复审计

## 原依据与本地适配边界

原仓库 `D:\codex_work\BiliMonitor` 本轮仍为 `fa2faa6`，只读、不启动；客户端基线 `c78797a`。本轮处理直播采集的调度/生命周期，不声称完整直播UI、全配置或全量业务已完成。

原路径以 `social-data-monitor/` 为根：

- `backend/src/main/java/com/socialmonitor/bilibili/live/service/BilibiliLiveMonitorScheduler.java`：`@Scheduled(fixedDelayString="...:1000")`，完成本轮后等待固定延迟；默认启用及存储开关控制调度。
- `config/BilibiliLiveMonitorProperties.java` 与 `backend/src/main/resources/application.yml`：默认1000ms调度、20间到期房、30 UID状态批、1500ms接口限流、300秒默认间隔、失败退避配置。
- `service/BilibiliLiveMonitorService.java`：collectDueRooms逐批采集；updateRoom单独切换启用/修改间隔；手动refresh不要求ACTIVE。
- `repository/BilibiliLiveMonitorRepository.java`：仅ACTIVE、next_collect_at和backoff_until均到期；按下次采集/创建时间排序。暂停保留下次时间，恢复立即到期但不清退避；修改间隔仅在ACTIVE时重排，PAUSED保持旧时间。
- `frontend/src/views/bilibili-live/BilibiliLiveView.vue`：toggleMonitor和saveInterval分别发enabled/intervalSeconds，和客户端的独立命令对应；本轮不把服务端DTO允许同时传两字段的全集配置能力宣称已迁移。

原Java直播服务没有客户端式显式stop边界，重试sleep遇中断只恢复线程中断标记。**退出取消属于纯客户端所需的适配**：保持原采集/存储规则，但Core关闭后不能继续访问已关闭SQLite，也不能重启Worker继续请求。没有修改原Java代码。

## 实现与证据

| 业务/边界 | 本轮实现与验证 |
| --- | --- |
| 原每秒fixedDelay | Local Core默认1000ms，启动先扫描到期房间；本轮完成再等1000ms，不按固定时钟追赶、不重叠批次；仍保留端点1500ms限流 |
| 正常暂停/恢复/间隔 | 原有规则保持；真实SQLite验证PAUSED修改间隔不重排、恢复保留backoff、重启读持久化状态，退避结束后才自动采集 |
| 限流与重试等待中退出 | Live的AbortController立即取消内部计时器；source只stop一次，停止后新写操作返回CORE_STOPPED，自动批返回已完成部分 |
| 在途成功/失败退出 | 平台响应后及上层业务应用前验证停止状态；不新增API日志、快照/事件/场次、错误退避，不启动下一接口或下一批 |
| Core整体停止顺序 | 在等待Follower/Auth/Danmaku退出前立即触发Live.stop；其它Worker尚未退出也不能让Live迟到响应落库 |
| 存储内部异常 | 用隔离库真实触发器复现SQLite失败；安全记录固定事件/错误码，保留事务回滚，不记录为平台失败，下一调度轮仍执行 |
| 真实Python子进程 | 真实runtime、NDJSON、WorkerSource、Live service、SQLite；test-only httpx传输挂起HTTP并输出合成PID标记，停止后PID不存在且无监控/API日志/状态事件 |

新增测试文件：

- `packages/core-runtime/src/bilibili-live-lifecycle.test.ts`：首12项停止边界回归先全部失败，再修复通过；覆盖uid/roomId新增、手动成功/失败、batch正常/缺UID/错误、下一批、幂等stop、微任务错误传播。后补2项覆盖已完成批次保留和最终详情成功后的停止，不冒充新增RED/GREEN。
- `packages/core-runtime/src/bilibili-live-scheduler.test.ts`：7项真实Core/SQLite测试，默认周期/固定延迟/启动扫描/Core停机次序4项先失败后修复；存储失败另1项先复现未处理Promise拒绝再修复；已有暂停退避及重开保护只补覆盖。
- `packages/core-runtime/src/bilibili-live-shutdown-integration.test.ts`：真实Python退出1项，是上述停止实现的实际进程验收，不冒充新增RED/GREEN循环。仅外部HTTP挂起，未替换生产parser/Core。

总计新增22项Node测试。真实进程测试先确认PID存在，stop完成后检查进程消失；测试finally关闭服务/库并清理D盘隔离目录。测试脚本不进入生产包，不连接真人平台，不读取实际用户数据。

## 验证记录

- 停止边界和既有采集/服务回归：49项通过；调度/停止/粉丝调度回归：21项通过；真实Python退出：1项通过。
- 类型检查发现测试可变PID在闭包中不能维持非空缩小，改为检查后保存局部const；未改变生产类型约束或依赖。
- 独立只读审查无Critical/Important。Minor：可选测试注入`options.sleep`自身的Promise不被强制取消，需其自行完成后返回CORE_STOPPED；当前生产构造不注入sleep，内部生产计时器已立即取消。此限制不扩大为生产行为的完成证明。
- 最终完整`check.cmd`退出0：Node598（Contracts132、Storage19、Task3、Core241、Browser12、Realtime19、Desktop172）、Python183；TypeScript/mypy、Black/isort、Electron生产构建及D盘路径约束通过。
- `git diff --check`与新fixture生产包扫描通过；没有匹配的测试Worker残留；原仓库仍`fa2faa6`且干净。没有自动提交/推送、重启已安装应用或重新打包。

## 仍未完成

1. M08原宽松完整数值域、特殊解析/URL/别名/UTF16长度，以及全部配置项映射仍待逐项对齐；本轮没有缩小这些目标。
2. 直播监控页的完整卡片、详情、采集节奏、间隔编辑、趋势/事件交互还要对照原前端逐操作验收；新调度不等于UI已经等价。
3. 原生Electron utilityProcess、安装包、真人平台与完整应用级退出/重启验收仍在M18；本轮实际进程是自动测试启动的Python，不是原生安装客户端。
4. M07真人/原生，M09–M18以及M11同刻不同时间拼写判重启问题继续保留。没有自动提交/推送、重新打包、启动原项目或重启已安装客户端。
