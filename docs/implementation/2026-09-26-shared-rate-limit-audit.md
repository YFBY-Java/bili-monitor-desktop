# 共享限流与 API 耗时迁移审计（2026-09-26）

## 本次范围与停止要求

本次仅完成 M06/M08/M10 交叉的共享请求限流、API 日志耗时与相关错误边界。用户最新要求：**跑完这个功能就先结束**。本项验证、记录结束后暂停迁移，不启动下一项。M01–M18 全量目标尚未完成，不能标记全部完成。

原 B/S `D:\codex_work\BiliMonitor` 基线 `fa2faa6` 只读，未启动或修改；客户端 `b2e5a89` 上保留全部既有未提交增量。未提交/推送、未打包/重启安装客户端，不使用用户运行数据库或真实凭据。测试/工具/产物在 D 盘，无新依赖、业务服务端、端口或数据库 migration。

## 原源码依据

原源码以 `social-data-monitor/backend/src/main/java/com/socialmonitor/` 为根：

- `collector/service/RateLimitService.java`：单例 map 的共享锁内等待，每个 platform/policy 保存下一次许可时间；从实际醒来时刻加间隔，非正间隔直接返回且不改变时间。
- `bilibili/service/BilibiliFollowerMonitorService.java`：`fetchWithRetry` 以 `bilibili:<endpoint>` 申请许可；计时在申请前开始，`Duration.ofNanos(...).toMillis()` 截断整数毫秒。`collectUser`/fallback 仅捕获 `BilibiliFetchException`，不是任意存储异常。
- `bilibili/live/service/BilibiliLiveMonitorService.java`：`bilibili-live:<endpoint>`，相同的计时口径。
- `bilibili/live/rank/service/BilibiliLiveRankService.java`：全部观众/大航海/备用榜单都用 `bilibili-live:live-rank`，不是按榜单接口拆键；`fetchKind` 仅因采集异常考虑 WBI 重试或备用接口。
- `collector/service/CollectTaskExecutor.java` 的通用 `acquire` 在原实现为空，本片未擅自增加通用限流。
- 已搜索并阅读本地 API 参考的 `user/info.md`、`user/status_number.md`、`live/info.md`、`live/guard.md`。本片不改平台协议，这些历史资料和合成数据不构成实网验收。

## 客户端实现

`packages/core-runtime/src/local-request-rate-limiter.ts` 是 Core 内的轻量共享许可器，`local-core-runtime.ts` 将同一实例注入粉丝、直播、榜单服务。独立构造服务仍有自己的默认实例，不使用进程全局单例污染其他 Core 或测试。

| 行为 | 实现与边界 |
| --- | --- |
| 原共享锁 | FIFO 申请队列，仅许可等待互斥；HTTP 在锁外运行，可以并发，不串行化整个抓取 |
| 原键 | 粉丝 card/relation 分键；直播 REST 分键；全部榜单共用 live-rank |
| 实际唤醒 | 获准时才写下一次时间；不提前预约多个未来时间，不在迟醒后密集放行 |
| 0/负间隔 | 直接放行，不排队、不更新时间；已停止服务仍拒绝 |
| 背压 | 最多256个申请，含当前等待者；满时 `LOCAL_RATE_LIMIT_BUSY`、retryable=true，不发出HTTP、不记API失败或改监控失败排程 |
| 退出 | 一个服务一个abort监听器；同步移除该服务全部申请、清timer；不会占用被取消键的下一许可。其他仍运行的服务可继续 |
| 迟到结果 | 已取消的注入sleep再完成/失败不更新时间、不再次释放其他申请 |
| 大等待 | 超Node单timer上限时分段，避免溢出成1ms |

FIFO、256上限和即时取消是本地生命周期/内存背压适配，原 Java 锁公平性未定义，未声称精确复刻 JVM 线程调度。该上限不是平台风控数值或新配置字段。

粉丝、直播和榜单每次尝试均从申请许可前用 `performance.now()` 计时，写入 API 日志时向下取整，包含排队、限流和 Source/解析操作，不含日志落库、后续 retry backoff。墙钟跳变不改变耗时。Worker 返回的 HTTP `durationMs` 契约仍保留，但不再充当 Core API 日志的总耗时。

`FollowerFetchFailure` / `RankFetchFailure` 仅在外部 Source/结果校验失败时产生。成功或失败日志落库自身出错，不进入备用接口、平台重试或监控失败退避。取消和本地队列满也不冒充平台异常。原直播服务已有对应的 `LiveFetchFailure` 边界，继续沿用。

独立昵称 profile 不经过粉丝监控限流/重试/API日志；本轮未更改该原业务边界。未增加抖音、Agent 或模拟页面功能。

## 回归证据

- 首轮 Core 集成测试复现跨服务绕过等待、三路成功日志沿用 Worker 1ms 的断言差异。榜单并发测试还暴露旧 `node:timers/promises` 与假时钟混用；最终明确推进 0/1500/3000ms 并在第一个 HTTP 未结束时验证后续请求。
- 两项取消专项先 RED：同服务8个请求注册8个abort监听器；批量abort中意外更新另一个被取消请求的键。修复为按服务共享监听器、排空前检查aborted。
- 复核后再 RED：成功/失败API日志写库失败使 contribution_rank 额外请求备用接口；粉丝refresh改写失败状态/下次时间。限定 Source 错误类型后转绿，并补 due 扫描在成功/失败日志异常时不改状态。
- 新增两文件共29项：13项许可器、16项真实Core/SQLite集成。覆盖跨服务队列、所有榜单共享间隔、HTTP锁外并发、迟醒、零/负值、主动/排队/批量取消、监听器释放、容量恢复、大timer、背压无业务写入、成功/失败/重试/写库/墙钟计时、存储错误边界。补覆盖与直接GREEN项目不冒充逐项RED。
- 旧粉丝测试曾断言必须保留Worker的28ms，改成独立单调钟测得40ms而Worker仍28ms；旧直播并发测试需推进到6000ms让共享锁后的三次详情完成，仍严格断言状态请求0/1500/3000ms，不提高测试超时。
- 相关服务/lifecycle/policy定向检查通过；最新新增29项+原快照6项共35项通过，Core typecheck通过。

## 收尾验证

最终全量 `check.cmd` 已退出0：**Node1044项、Python376项**；TypeScript、Python类型/格式、Electron生产构建和D盘检查均通过。

- Node分项：Contracts276、Storage19、Task3、Core431、Browser12、Realtime46、Desktop257。新两文件29项包含在Core总数内。
- 独立复审关闭两项Important，无遗留Critical/Important/Minor；复审独立跑35项新增/并发与34项原榜单/粉丝回归均通过。
- 首次全量运行发生于复核修正过程中，发现当时的三项日志错误边界RED和旧直播假时钟只推进5000ms导致超时；修正后重新完整运行全仓检查，以上统计为最终运行，不拼接早先分项结果。
- `git -c core.autocrlf=false diff --check`、新增文本空白和生产测试标记检查通过；项目Node/Python/Electron残留进程0。`CLAUDE.md`仍仅`@AGENTS.md`。
- 客户端HEAD仍`b2e5a89`，main领先origin/main19，暂存区为空，本轮和此前增量均未提交；原B/S仍`fa2faa6`且干净。没有推送、安装包制作、重启安装应用或访问真实平台/用户运行库。

本功能已完成，按用户要求在此停止并暂停全量迁移；不开始下一项。

## 后续保留事项

待用户再次要求继续，先核对两个仓库和本交接、保留未提交修改。下一项仍是 M06/M08 完整数值/字符串/URL/时间解析与 Spring 配置绑定输入域，再按全量台账推进 M09–M18。真实平台授权、原生界面、安装包及最终全流程验收未做。本子项不关闭这些范围。
