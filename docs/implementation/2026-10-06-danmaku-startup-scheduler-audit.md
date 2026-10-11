# M09 弹幕启动控制与完成后调度迁移审计

## 目标与边界

按原 B/S 逐项续迁，本项只覆盖四个弹幕启动设置与自动调度。客户端仍 `codex/follower-monitor-actions` / HEAD `4c94959`；原 `D:\codex_work\BiliMonitor` / `fa2faa6` 和历史 API 参考 `271b123` 保持只读。此前粉丝操作、候选/容量和测试诊断全部保留，未提交/推送。

[实施计划](../superpowers/plans/2026-10-06-danmaku-startup-scheduler.md)下的代码、定向回归及独立 task gate 已完成；修改后整轮检查已退出1，补充类型/Python/构建通过。最终分支审查切片质量Approved、合并With fixes、发布No，四项验证失败仍为Important。不是 M09 或 M01–M18 完成声明，不等于真人平台/原生安装验收。

## 原规则与当前实现

原路径以 `social-data-monitor/backend/` 为根：`src/main/java/com/socialmonitor/bilibili/live/danmaku/config/BilibiliLiveDanmakuProperties.java`、`service/BilibiliLiveDanmakuScheduler.java`、`service/BilibiliLiveDanmakuService.java` 和 `src/main/resources/application.yml:91–106` 已逐段亲读。

| 字段 | 默认 | 本项消费语义 |
| --- | --- | --- |
| enabled | true | false 拒绝新 start，先于已连会话、容量、房间/Source；查询与 stop 仍可用，不主动删除或淘汰已有连接 |
| autoStartEnabled | true | false 使自动同步提前返回；手动仍可 start，不自动停止已连会话 |
| schedulerDelayMs | 5000 | 首次到期为注册时0，后续每轮完成/失败后再等待配置毫秒；不复用 REST/粉丝的 Host 测试 override |
| maxConnections | 10 | 始终绑定 signed32；消费最少1，0/负数不在绑定阶段拒绝，容量错误不伪造成平台失败 |

`dataDirectory/config/bilibili-live-danmaku.json` 只读、重启生效；缺失默认、不创建文件，支持 UTF-8 BOM。严格 typed JSON 验证在环境覆盖前执行；未知字段/字符串 bool/字符串整数/越界/小数不会被环境遮住。示例见 [bilibili-live-danmaku.example.json](../../config/bilibili-live-danmaku.example.json)。

原四 alias 为 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ENABLED`、`...AUTO_START_ENABLED`、`...SCHEDULER_DELAY_MS`、`...MAX_CONNECTIONS`；canonical 对应 `APP_BILIBILI_LIVEMONITOR_DANMAKU_ENABLED`、`...AUTOSTARTENABLED`、`...SCHEDULERDELAYMS`、`...MAXCONNECTIONS`，优先于 alias/file。复用已核对的 Spring 标量转换、来源查询和占位符 helper，没有复制 parser 或改粉丝消费者。

primitive boolean/int 始终绑定；只有既有 live storage 判定决定 raw Scheduled 消费，两个弹幕开关和 Host scheduler opt-out 都不绕过它。storage=true 时 raw `" 5000 "` / hex / Duration / 0 / -1 拒绝；storage=false 只跳过 raw Scheduled 消费，仍必须是合法 primitive int。原 duration 能被 Scheduled 单独解析不代表同字段 int Properties 接受它。已有直播 storage 条件输入映射的 M08 缺口不在本项扩大，不能称完整 Spring Environment 等价。

Spring 6.1.15 / 已有 JDK 只读 bytecode 核验支持首次注册零延迟及完成后固定延迟，但不是原应用实际启动证明，也不证明全局线程池/执行域等价。`Runtime.start` 返回不保证首轮已经完成。原 Service 已有 Promise 合并/拒绝处理，旧 interval 差异不意味着已证明每 tick 重入或必然 unhandled rejection。

## 生产改动

- 新 shared Zod/JSON Schema、TS/Python 同源 goldens；startup 错误白名单新增 `BILIBILI_DANMAKU_CONFIG_INVALID`，常量提示不含原文件值、路径或进程诊断。
- 新 Core loader 在 `ControlDatabase.open` 前读取；Runtime 传开关/容量、单独保存 delay。没有 Worker 环境扩张、IPC 业务方法/数据库 migration/依赖变化。
- Service 只增加两项 optional flag 和两个 guard，原候选/手动保护、会话/凭据/取消保留。开关只读重启生效；same-options mutation 仅是 Service 测试，不是热重载功能。
- 弹幕 `setInterval(5000)` 换为 `setTimeout` → real sync settle → 新 timeout，首次0；成功/失败均续调度，失败只记录常量 `bilibili.danmaku.scheduler-failed` / `BILIBILI_DANMAKU_SCHEDULER_FAILED`。stop 清 timeout 且 stopped 后不 rearm/log/write。
- 两项旧回归最小适配：直播 REST 关闭测试 advance0 首次扫描1，再5000累计2；auth联动第一次 advance5000→0。未改其它旧操作、预算、并发或 Source；只读审计未发现会因首次0而暴露真实网络的未注入合格目标。

## TDD 与定向证据

日志前缀 `.tmp/2026-10-06-danmaku-startup-`，完整报告 `report.md`、task delta `review.diff`。所有实际命令先激活 D 盘环境，仅外部 Source 合成，Core/Service/SQLite/实际 Host entry 保持生产实现。

- 首次业务 RED：12项中11失败/1既有行为通过，`red.log` 保留；disabled 实际 CONNECTED、容量未消费、坏配置未拒绝和首轮未扫描等具体差异。后增覆盖不全部称 RED。
- 最终定向 Core **8套/105项通过**，contracts25、真实 Host15、Python13、全部 types通过；`core-green.log` / `contract-green.log` / `host-green.log` / `python-green.log` / `types-final.log`。这是相关回归总数，不是105项全新增。
- Core 103/105阶段的两次夹具修正明确保留：storage禁用入口是既有同步 throw，不能用 rejects；storage关仍有auth清理timer，不能误断言全部timer0。现在断言同步稳定禁用码、无候选扫描、仅auth timer、stop后0；未改生产/预算。中间 Core日志被覆盖的时间/计数写在report，磁盘只保留最新 Core log；不是全套稳定性重复验收。
- 真实 SQLite 联合验证手动/auto开关与既有连接保护、max0/负/2、guard优先、REST关auto仍可、storage条件、缺失文件不写、history/recent/metrics跨禁用再启用保留；held Source跨多倍delay无新扫描，完成后delay-1/最后1ms边界、安全失败下轮恢复、stop-before-first和关闭库后迟到结果不写/不 rearm。
- Host实际 entry/controller 验证 unknown synthetic-private 字段和delay0在开库前安全报错；同controller修正后恢复ready、文件不被写回。不是fake Controller测试，也不是原生安装客户端验收。

## 整轮验证与审查

生产修改前的[删除启动诊断](2026-10-06-delete-startup-diagnostic.md)记录独立的一次whole check：Node2087/2089、2旧失败、无跳过，删除9执行通过；不能挪用为本项生产修改后的整轮结果。

首次 task review：四字段生产行为符合原代码，无生产问题；Spec有一项Important、Task quality Needs fixes。新增Host用例沿用既有beforeAll/setup的mkdtemp与rm，没有创建前D盘绝对路径和清理前隔离TEMP后代预检。本轮实际命令已激活D盘不能替代该显式约束。

已修复并独立复审关闭：现有suite局部纯路径guard覆盖两次创建前D绝对TEMP、两次清理前严格TEMP后代；不跨层导入Core夹具、不改预算。guard定义no-op阶段6个非法路径断言失败/1合法通过（15Host过滤），实际guard后未过滤Host **22/22** 和Desktop types通过，日志 `danmaku-host-path-fix-{red,green,types}.log`。纯路径输入没有实际C文件操作。复审 **Spec compliant / Task quality Approved**，无剩余Critical/Important/Minor。

主代理一次生产修改后的完整check已终态退出 **1**，日志 `.tmp/2026-10-06-danmaku-startup-final-check.log`（11:34–11:37 +08:00）；生产冻结，未与定向测试重叠，外层显式传递内部exit code。

- Node **2161通过 /2165，4失败，无跳过**；Contracts475、Storage53、Task3、Browser12、Realtime46、Core937全部通过；Desktop635/639。新配置/调度、Host安全错误/路径与先前粉丝删除/status、候选/容量测试均执行通过，不能因此称整套绿色。
- 四项旧失败分别保留：MainLong64 pending add 等待 `http-started` 后ENOENT；趋势2000点测试体5s；趋势700/900提示poll未变空（不是hook超时）；Widget第505房间 `page.goto` 等commit超2500ms（本次不是beforeEach10s）。不改预算/并发/操作，也不推断已证实的CPU或Vite根因。
- 删除probe本次startup4976ms、pending/failure0、watchdog=false、unfinished=false/cleanup完成。再次执行通过仍非冷启动/超时根因修复证明。
- Node失败截断后续；主代理第一次另行补充检查通过全部TS，随后Black报告新增 `test_danmaku_configuration.py` 1文件需格式化、57未变。这是新文件问题，不归入四项旧失败；日志 `.tmp/2026-10-06-danmaku-startup-complement-check.log`，这次补充退出1。
- 仅对该Python文件机械Black格式化，不改逻辑/Schema/goldens；单文件Black/isort和13测试通过，日志 `danmaku-startup-python-format-fix.log`。主代理随后从Black继续原截断步骤：**58文件Black、isort、mypy18源文件、Python1016项、Electron Main/Core/Workers/CJS Preload/Renderer生产构建全部通过**，补充恢复日志 `.tmp/2026-10-06-danmaku-startup-complement-recovery.log` 退出0。全部TS证据在首次补充中，格式修正不影响TS；没有重复Node整套求绿，这些单独通过不等于check.cmd退出0。

## 最终安全与整轮审查

主代理收尾重新核对：原B/S `fa2faa6` 与API参考 `271b123` 均clean；客户端仍 `4c94959` / `codex/follower-monitor-actions`、普通checkout、index空、45项未提交改动全部保留。diff检查、`CLAUDE.md`仅`@AGENTS.md`、生产新增测试marker0、Main/Core无外置source-only workspace包、CJS Preload存在；项目Node/Python/Chrome/Electron进程与监听均0。实际TEMP/工具/Python/pnpm/测试库/日志/构建均D盘，不读用户库/凭据、无真实平台/原B/S启动、工具安装、提交/推送或安装客户端更新。

代码冻结后的最终whole-branch独立审查已完成，覆盖45项全部未提交增量及必要上下文；审查者直接核对原Vue toggle/remove、Java弹幕Service/Scheduler与候选SQL，未运行测试/构建/应用或网络，也未改写checkout。未发现本批生产增量引入的Critical或需修改的Important；**Implementation-slice quality Approved、Ready to merge With fixes、Ready to ship No**。本项task审批不替代整分支/发布门禁。

- **Important保持开放：** 完整检查四失败不能仅按旧测试豁免。Main Long64用例在 `follower-long64-worker.integration.test.ts:62` 等待http-started失败，后面的停止/Worker退出/SQLite历史与对象无迟到写入断言没有执行到；Trend2000点体超时、700/900提示实际仍刷新中、Widget第505房间导航未完成也没有得到本次业务证明。审查未找到当前生产差异导致它们的证据，也未证明无害；下一步分别补Worker启动/请求及浏览器导航/提示状态证据，按既定预算修复验证，不放宽预算或机械反复求绿。
- 此前删除suite9项未执行的缺口已有最新整轮9项通过的证据，现不再称“9项仍跳过”；冷启动根因与稳定性仍未关闭。
- **Minor保持开放：** `bilibili-danmaku-auto-targets.integration.test.ts:42` 在mkdtemp之前未检查D盘TEMP，cleanup才检查。实际本轮激活后的TEMP确在D盘，未发生本轮C盘写入；仍建议补创建前绝对D盘校验及清理前严格后代预检。新startup/Host测试已补的guard不替代这个既有候选suite的建议。

以上为整体验证缺口/测试安全建议，不是假造已定位的新生产缺陷。复审后只更新文档，没有代码变更或追加测试执行；源码、HEAD/index、D盘和无残留安全核验再次通过。

## 未完成范围与下一候选

原15属性尚余11项未接完整启动/消费链。先处理上述验证Important；业务队列下一小切片可选 **recentMessageLimitPerRoom 最近弹幕保留数量**：原默认200，ingestion最少20且无额外上限，当前Service/Storage额外夹取1..500；它与read接口最多200和完整场次历史是三个不同概念，不能以扩大read上限替代保留修复。原alias实际是 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT`，不是推测的长字段名。此项尚未实现。

另有 bucket 原raw值/对齐与客户端双重夹取差异、WebSocket连接/auth完成边界、配置协议偏好、WBI默认12小时与客户端1小时、buvid/WBI共享域及并发刷新、凭据开关、webLocation/clientVersion等待。原 listenProbeSeconds 在生产源码未找到getter消费，仅声明/YAML，不能臆造探测timer。以上只读审计不算功能完成或当前平台验证。M06共享recycler、M08其余、M10–M18、真人/原生/发布和旧测试稳定性继续保留；全量目标 active。
