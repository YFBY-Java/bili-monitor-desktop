# 原 B/S 全量业务迁移台账（2026-09-13）

## 基线与完成条件

- 原项目只读：`D:\codex_work\BiliMonitor`，当前 `fa2faa6`；开始时工作区干净。
- 客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`，起点 `22d0d0b`；开始时工作区干净。
- 原基线 `01200f3` 到 `fa2faa6` 共 4 个提交、24 个变化文件。本次范围不止这 4 个提交：旧功能仍逐操作对照当前源码验收。
- 不启动或编辑原 B/S 工程；原 Java/Vue/PostgreSQL 仅作为业务参考。运行时仍为 Electron + React + TypeScript Core + SQLite + Python/Node Worker。
- 不把已有方法、页面入口或绿色测试等同于业务完整。每项必须记录原源码、客户端实现、输入/状态/输出、差异回归及剩余手工验收。
- 所有新文件、工具缓存、测试数据库、构建产物位于 D 盘；禁止保存真实凭据到测试或文档。
- 下表所有“待核对”都属于未完成项；没有被排除出目标。原 Mock/占位能力单列，不伪装真实业务，也不擅自扩展它的能力。

## 逐项顺序与验收矩阵

原路径以下以 `social-data-monitor/` 为根；客户端路径以本仓库为根。

| 编号 | 原业务及依据 | 客户端位置 | 当前差异/必须验证 | 状态 |
| --- | --- | --- | --- | --- |
| M01 | `backend/.../live/danmaku/parser/BilibiliGiftV2Decoder.java`、`BilibiliLiveGiftV2Tests.java`，提交 `1101952` | `workers/node-realtime/src/bilibili-danmaku-event.ts`、`bilibili-danmaku-connection.ts`，Core 场次事实 | 已补批量解码、金额/UID/事件时间、旧新协议同交易去重、缺 ID 独立接收、坏包恢复；二进制和文本连接消费全部事件 | 实现与自动回归完成；非真人送礼验收 |
| M02 | `backend/.../live/session/service/BilibiliLiveSessionBoundaryService.java`，`441d423` | `packages/core-runtime/src/bilibili-live-session-service.ts` | 已修离线互动建场、历史归属、互动撤销 END_PENDING，Core null REST 保留状态；复核原 HTTP 解析及 SQL 后确认缺失状态转 0、非空落库与原项目一致，不扩展可空采集链路 | 本项实现与自动回归完成；不代表全部场次业务验收 |
| M03 | `BilibiliLiveSessionQueryService.sessions`，`441d423`；DataCenter/Analytics 最近 200 场 | `packages/contracts/src/bilibili-live-session.ts`、`packages/storage/src/control-database.ts`、`BilibiliLiveWorkspace.tsx` | 默认/非正数 20、最大 200；SQLite 时间/插入顺序倒序及房间隔离；场次面板 20、数据/分析 200；查询缓存按 limit 隔离，等待响应不清有效选择 | 本项实现与自动回归完成；不代表数据中心/分析全部业务完成 |
| M04 | `BilibiliLiveSessionExportController`、`BilibiliLiveExportSequence`、`V12__bilibili_live_export_daily_counter.sql`，`1a36b43` | Core export service/name helper、SQLite migration 12、现有 Main 保存链路 | 已接入昵称/UID 回退、上海日期、当日跨格式/场次共享序号、80 码点及原 strip 语义；已分配编号在 IO 失败/未保存后不复用；重开数据库保持。Main 仍使用建议文件名 | 本项代码与自动回归完成；原生保存对话框尚未手工验收 |
| M05 | `frontend/src/views/bilibili-live/BilibiliLiveView.vue` 与 `subjects/widgets/BilibiliLiveDanmuWidget.vue`，`fa2faa6` | `BilibiliLiveDataWidget.tsx`、`ConnectedBilibiliLiveDataWidget.tsx`、Live/Subject workspace | 共用三模式、60 条/2 秒轮询、UID/看过人数、离线监听及协议启停；最新快照、家族/类型排序记忆、当前榜单 4 页刷新、失败保留、迟到响应隔离、展开/收起 | 组件迁移与针对性自动回归完成；独立页面/采集深层语义仍在 M09/M10，详情场次区域在 M11 |
| M06 | `bilibili/BilibiliView.vue`、Follower Controller/Service/Repository | Follower workspace/service/Python worker/storage | 已补全部列表、history边界/数量/顺序、原重试/资料覆盖、监控与趋势UI；最终复核增删改/失败/历史/调度，并补 Core 退出取消、迟到结果不落库、重开排程恢复。逐项证据见 `2026-09-13-follower-workflow-audit.md` | 代码及自动业务闭环审计完成；真人采集、原生传输/安装包验收仍在M18，登录单列M07 |
| M07 | `bilibili/components/BilibiliAuthPanel.vue`、QR Dialog、Auth Service/PassportClient/SessionStore、CredentialActivatedListener | Auth panel/service/worker/shared contracts、credential storage、Core/Realtime停机 | UI、Cookie/会话/撤销与恢复已有审计；续补首次激活触发匿名升级、协议/归属保持、部分失败隔离、串行连接操作、撤销与切号原语义、退出及子进程取消。证据见 `2026-09-13-bilibili-auth-core-audit.md`、`2026-09-13-auth-danmaku-link-audit.md` | 登录UI/存储/连接联动代码与自动回归已复审；真人扫码、OS密钥/剪贴板、原生客户端验收仍未完成，M09全部弹幕规则另列 |
| M08 | `bilibili-live/BilibiliLiveView.vue`、Live Monitor/Snapshot Service/Repository | Live workspace/overview/monitor panel/trend board/service/worker/storage | 查询、采集、Python/NDJSON、fixedDelay/退出、监控操作区和趋势已审计；续补loadAll整体发布/失败保留、命令确认先于重读、四项原汇总和同页状态事件；已接自动REST开关/延迟/两级批量及间隔/限流/重试/失败退避的本地配置，续接四个REST端点HTTP配置/请求存活。证据见 `2026-09-13-live-query-audit.md`、`2026-09-13-live-collection-audit.md`、`2026-09-13-live-worker-audit.md`、`2026-09-13-live-lifecycle-audit.md`、`2026-09-13-live-monitor-panel-audit.md`、`2026-09-13-live-trend-audit.md`、`2026-09-13-live-overview-audit.md`、`2026-09-13-live-collection-configuration-audit.md`、`2026-09-13-live-collection-policy-audit.md`、`2026-09-13-live-http-lifetime-audit.md` | 查询/采集/调度/退出及监控/趋势/整体刷新/事件汇总已实现并通过本轮自动回归；原数值域/边缘解析、其余HTTP消费者/真实管道失联验收/storageEnabled、严格并发限流和API耗时语义及原生验收未完成；详情场次在M11 |
| M09 | Danmaku Controller/Service/parser、`BilibiliLiveEventIngestionService` | Node Realtime、Core Danmaku/Session services | 启停重连、protover 0..3/自动、匿名/登录降级、心跳、UID/昵称补全缓存、原始事件/指标去重、连接结束与覆盖窗口 | M01/M02 后逐项核对 |
| M10 | Rank Controller/Service + 原 DanmuWidget | Rank worker/service/contracts、Live/Subject UI | 在线/进房/日周月榜、大航海周/月/陪伴；页码/排序/类型、已保存快照、部分失败、切换后不串房 | 待逐操作核对 |
| M11 | Session Controller/Query/Repository、`BilibiliLiveSessionPanel.vue`、`DataCenterView.vue` | Session service/storage、Live 场次/数据页签 | 状态/边界、覆盖窗口、房间/场次选择、事件类型/关键词/UID/付费、分页、用户聚合、未知 UID、空数据与查询失败、自动刷新；M08审查发现platformLiveTime按字符串判重启而原按Instant，需补同刻不同格式回归 | M02/M03 后逐项核对 |
| M12 | Export Service + `docs/bilibili-live-session-data.md` | Core export service、Main save | CSV BOM/CRLF/注入保护、XLSX 四表/两行表头/文本 UID、ZIP manifest schema 2、同快照一致性、筛选作用范围、取消及失败清理 | M04 后逐格式比对 |
| M13 | Insight Controller/Service/Calculator、`AnalyticsView.vue`、`liveInsightPresentation.ts` | Session insight/contracts、Live 分析页签 | 60/300/900 秒桶；互动、人数、付费/免费、复购、历史复购、层次、礼物、峰值、质量与无覆盖 null；原 UI 所有指标和规则文本 | 待公式与 UI 双向核对 |
| M14 | Subject Controller/Service/Workbench + `subjects` 组件 | Subject service/storage/workspace | UID-first、资源复用、直播弱失败、绑定改删、subject 状态、采集设置、健康事件、聚合趋势、布局保存/恢复及删 Subject 的资源语义 | 待逐操作核对 |
| M15 | Douyin Controller/Web/OAuth/Credential services、`DouyinView.vue` 及子组件 | Douyin workspace/services、Python OAuth/Node Browser | Web 与 OAuth 隔离、QR 图片/五态及 USER_ACTION_REQUIRED、过期/失败/关闭后迟到响应、全新 context 复验、查看复制导出撤销、回调 state 校验/一次性处理、重启恢复 | 待逐操作核对；真人授权单列 |
| M16 | `/api/platforms/adapters`、`/api/collect/tasks/run-once`、`PlatformView.vue`、CollectTaskExecutor | 当前通用 contracts/Core 与 product model | 接口确实存在，不能仅因任务列表 Mock 就整体排除。继续查 adapter 能力和 run-once 的可执行行为，再映射本地 command；不把模拟成功当真实采集 | 待实现依据核对 |
| M17 | Dashboard/Tasks/AI/Identity/Settings、`/api/ai/mock-summary`、`/api/analytics/summary`、`/api/dev/*` | 当前隐藏演示导航、runtime health | 已见 Dashboard/任务列表/AI 为 Mock。逐页核实哪些只是占位、哪些有持久化/可执行操作；真实部分纳入迁移，Mock 只记录对等边界；开发健康映射本地运行时 | 待最终分类核对 |
| M18 | 全部可执行业务收尾 | `check.cmd`、生产包/本地 smoke | 全量操作矩阵、无测试数据进生产、离线启动/重启/退出、旧数据库升级、D 盘约束、无业务 HTTP 服务、原仓库仍无差异；真人确认项没有证据不能勾完成 | 未开始 |

## 工作方式

1. 每次处理一项业务，先读原实现及原测试，再读对应客户端链路；必要依赖包含在该项中，不跨项假冒完成。
2. 先保存该项执行计划和失败回归，再实现，跑针对性测试与 `check.cmd`。
3. 每轮把证据、差异和剩余项写回本表。原仓库出现新提交时记录新基线及新增差异，不覆盖历史验收记录。
4. 本次授权不包括推送远程或修改原仓库；保留用户现有数据，不清空错误场次来掩盖问题。若需历史数据修复，先定义可审计识别条件和备份/预览方案。

## 执行记录

- 2026-09-13：完成基线检查、4 个新增提交对照及原前端路由/后端 Controller 清点。M01、M02、M04 明确有差异，其余按上表继续；全量迁移尚未完成。
- M01：`bilibili-gift-v2.test.ts` 7 项（6 项原有单条接口行为在修改前失败，批量接口缺失单独失败）；真实 socket 消费测试先复现丢批内第二条，再复现文本消息丢失，均修复。Core 测试走 JSON 序列化、WorkerSource 校验与真实 SQLite，验证批内数量/金额、交易去重、无 ID receipt 独立及用户聚合。共新增 9 项测试。`check.cmd` 退出 0：Node 228、Python 23，类型/格式/生产构建通过。
- M02：新增 `bilibili-live-session-boundary-parity.test.ts` 9 项，修改前 8 项失败，修复后全通过。使用真实 SQLite 验证离线/轮播/陈旧 live=1、历史迟到、不串新场、END_PENDING 保持、Core 未知 REST、LIVE 开场与离线 recent/metrics 保留。全量 `check.cmd` 退出 0：Node 237、Python 23，类型/格式/生产构建通过。
- M02 提交前纠正：此前把缺失状态转 0、数据库 NOT NULL 判断为待迁移差异，依据不足。重新只读核对原 `backend/.../live/client/BilibiliLiveApiClient.java:114,162,202,242` 均使用 `orElse(0)`，原 `V4__bilibili_live_monitor.sql:15,50` 同样为 NOT NULL。因此保留原采集/存储语义，仅对齐服务层 null 防护，取消扩展可空链路的 Task 2；这不构成“原 API 缺失状态不会关场”的端到端保证。后续按 M03 继续。
- M03 已确认三层限制仍为 100：`ListBilibiliLiveSessionsInputSchema`、`ControlDatabase.listBilibiliLiveSessions`、`BilibiliLiveWorkspace` sessions query；原 DataCenter/Analytics 查询 200，之后单独迁移。
- 本轮原仓库仍 `fa2faa6` 且 `git status --porcelain` 为空；没有启动或改写原项目，没有访问用户真实数据库，没有提交或推送。本轮构建不等于已重启客户端或重建安装包。
- M03：计划见 `docs/superpowers/plans/2026-09-13-recent-session-limits-migration.md`。先复现契约 5 项拒绝/上限差异、SQLite 2 项、Core Router 的 200 请求和 UI 固定 100；上限修复后继续复现并修正查询键切换清掉第 6 场选择的问题。新增 13 项测试，含 205 条真实临时 SQLite 场次、Preload 归一化、实际 Connected 页面第 200 场/数据和分析请求、刷新保持及换房。最终 `check.cmd` 退出 0：Node 250、Python 23，类型/格式/构建通过；新测试 fixture 未进入生产包，原仓库仍干净。此轮未重启客户端或生成安装包；下一项 M04。
- M04：计划见 `docs/superpowers/plans/2026-09-13-export-daily-sequence-migration.md`。新增 17 项测试：14 项真实 prepare/文件结果，3 项真实 SQLite 计数/升级；先复现旧文件名、无编号、v11 未升级，随后补查 NBSP/BOM 与原 strip 的差异并修正。验证 5 格式、跨场次/并发准备、上海午夜、80 码点、非法文件名字符、无效输入不占号、IO 失败/未保存占号、分配不嵌套快照事务、重开数据库及不同 UID/日期隔离。原 CSV/XLSX/ZIP 内容回归仍通过；只追加 migration 12，原 v1..11 未改，旧 v8 回填回归通过。最终 `check.cmd` 退出 0：Node 267、Python 23，类型/格式/构建通过。README/运行时/路线图已同步，生产 bundle 无新测试 fixture；原仓库仍为 `fa2faa6` 且干净。此轮未提交/推送、未重启已安装客户端、未操控原生保存对话框；M12/M18 的手工保存及发布验收仍保留。下一项 M05：直播页与用户工作台的弹幕/观众/大航海功能对照。
- 后续 M11 文案复核补充：`BilibiliLiveWorkspace.tsx` 场次空态仍有“在线弹幕事实出现后创建场次”的旧表述，与 M02 新边界规则不符；同时存在旧 SQLite v10 文案，需跟随场次页面完整验收修正，不能据此判断运行时实际版本。
- M05：计划见 `docs/superpowers/plans/2026-09-13-shared-live-data-widget-migration.md`。新增共享展示/Query 容器接入用户工作台和直播间“展开直播数据”，删除 Subject 重复的不完整榜单/弹幕实现；原 Subject 初始 DTO 同样不带 UID，维持其语义，UID 来自独立 recent(60) 查询。新增 14 项真实页面交互、2 项真实 Core/SQLite 回归；先复现缺失交互，再修禁用缓存泄漏、页面重开陈旧快照及首次榜单读取失败重入不重试。覆盖四页选中榜单请求、100 条聚合、头像失败、排序/陪伴/上期 TOP、父成功刷新保留状态、组件失败保留数据、迟到响应/换房、协议及自动滚动。只读审查无遗留 Critical/Important。最终 `check.cmd` 退出 0：Node 283、Python 23，类型/格式/生产构建通过；D 盘路径约束通过，生产包没有本轮测试 fixture。原仓库仍 `fa2faa6` 且干净；未提交/推送、未重启已安装应用或重新打包。父工作台整体错误页保留与原项目一致的行为，不当作新迁移差异。下一项 M06：粉丝监控按当前基线逐操作复验；M09/M10/M11 仍未全量验收。
- M05 后按用户明确要求提交到本地 `2b35225`，没有推送。以下继续迁移不自动提交。
- M06 查询/采集子项：计划见 `docs/superpowers/plans/2026-09-13-follower-query-collection-migration.md`。只读核验原 Controller/Service/Repository/RetryPolicy/API Client、原粉丝页及 TrendChart：原前端确实查询最近500点，纠正台账原先的小时范围假设。先复现6项契约、5项SQLite查询、4项采集行为及页面500人截断失败，再修正默认全部列表/全体趋势、历史数量归一化、真实时刻包含边界、同数值插入顺序、错误类型决定重试、card无头像清旧值、批失败保留来源。history 使用秒范围索引加9位小数比较键，不改存量时间或历史migration。两处共用粉丝缓存的页面统一读全量，浏览器实际选择第505人对比通过。
- M06 尚余 UI：原页汇总总粉丝/净增/下次采集/间隔、每秒采集节奏、展开详情、1/2/3/4用户趋势布局、拖动交换、图表轴刻度/提示与刷新提示逐项实现；原的两套调度适配为已有单一 Core 调度，不重新在 Renderer 发起后台采集。上述仍属于全量迁移范围，本子项回归不代表 M06 或全量业务完成；B站登录仍由 M07单独验收。
- M06 查询/采集提交前验证：`check.cmd` 退出 0，Node 324项、Python 54项，类型/格式/Electron生产构建及D盘路径验证通过；`git diff --check` 通过，生产包没有本轮测试 fixture。原B/S仍为 `fa2faa6` 且工作区干净；未重启已安装客户端、重新打包或真人平台验收。按用户后续“提交代码”的明确要求提交本子项到本地，不推送远程。
- M06 查询/采集已按用户要求提交至本地 `efda85b`。随后进入监控UI子项，计划见 `docs/superpowers/plans/2026-09-13-follower-monitor-ui-migration.md`：按原源码迁移四项汇总、横向用户块、单一详情、每秒倒计时/进度、草稿切换保留；不把客户端倒计时变成另一套平台调度。先复现缺失交互，再新增14项计算边界、6项浏览器交互/视觉回归，原动作与第505用户等测试仍通过。独立审查的采集中标记时机P2已用pending-list先失败后修复，复查关闭。
- M06 监控UI子项最终 `check.cmd` 退出0：Node344项、Python54项，类型/格式/生产构建/D盘路径验证通过；生产包无本轮fixture，原项目仍`fa2faa6`且干净。浅/深色和760px窗口已用合成数据验证，没有重启已安装应用、打安装包、真人平台验收、提交或推送。下一项仍是M06趋势同页展示、1/2/3/4布局、拖动交换、坐标刻度/提示与刷新状态；全量目标不缩减，不能据此将M06整体或M07登录勾为完成。
- M06 监控UI随后按用户要求提交为本地`9a024cd`，未推送。继续实现趋势UI：同页选择与图表、原1/2/3/4布局、高度/值域/时间padding、拖动及键盘两槽交换、500点/回退、180ms合并/单在途/120ms补读、700/900ms提示；旧Tab仅定位、不丢选择/详情草稿。平台采集仍仅由Core调度，不新增Renderer平台定时器。
- M06 趋势UI新增10项计算边界及13项真实Connected浏览器回归。先复现同页不请求/无轴、旧CSS10px覆盖、窄窗口初次自动滚动、清空选择提示残留；审查P2“旧错误在新选择请求中显示”也先复现后修复、独立复查关闭。覆盖4×500点、数据点键盘导航、失败保留、迟到隔离、清空/卸载及浅深色/窄宽。完整`check.cmd`退出0：Node367、Python54，类型/格式/生产构建/D盘路径通过；生产包无本轮fixture，原项目仍`fa2faa6`且干净。最后仅改截图稳定等待与高度、单项回归通过。未重启已安装应用、打包、真人平台/真实DB验收或自动提交/推送。下一步M06新增/改删/调度最终闭环复核，再M07登录；M07–M18不缩减范围。
- M06 趋势UI随后按用户要求提交为本地 `e014fa9`，未推送。最终业务审计计划见 `docs/superpowers/plans/2026-09-13-follower-workflow-final-audit.md`，逐操作证据见 `docs/implementation/2026-09-13-follower-workflow-audit.md`。新增 Preload校验/真实Core/SQLite 的8类方法完整流程，验证重开保留和删除级联；既有业务通过记为审计证据，不冒充新实现。
- M06 本地退出适配：原Service.stop只关Worker，6项回归先复现等待后继续请求/重试、迟到写库及继续同批采集，再补退出检查和限流/重试计时器取消。取消不写平台失败/退避。独立审查发现add/display-name错误传递中途退出仍返回风控错误，2项微任务回归先失败后修复、复审关闭；另补立即清计时器/API日志为空/手动在途失败保留。最终新增11项回归（生命周期9、调度重开1、完整链路1）。
- M06 最终 `check.cmd` 退出0：Node378（Core118、Desktop154）、Python54；TypeScript/mypy、Black/isort、Electron生产构建和D盘路径验证通过。首次检查发现测试用了当前TS目标未支持的Promise.withResolvers，改用普通Promise gate后重跑通过，没有提高技术栈要求。`git diff --check`与生产fixture排查通过；原项目仍`fa2faa6`且干净。未重启已安装客户端、打安装包、访问真实数据库/平台、自动提交或推送。本项代码与自动闭环审计结束，下一项M07，真人及M18验收并未豁免。
- M07 UI阶段性实现补齐刷新/复制/反馈与迟到响应隔离，新增13项Connected浏览器回归。按用户“提交代码”要求停止扩展并核验当前工作；完整`check.cmd`退出0：Node391（Desktop167）、Python54，类型/格式/Electron构建/D盘路径通过。仅修正新测试的两处DOM类型写法，不改编译目标或依赖。M07独立审查、Core/Worker/连接完整审计和真人/原生验收尚未完成，后续M08–M18范围不变；此次仅本地提交，不推送。
- M07 UI及M06生命周期随后已提交为本地 `b7ce839`。本轮完成UI独立复审和窄屏单列修正，补登录HTTP会话/展示Cookie分离、删除与作用域、二维码生命周期、凭据重开恢复、撤销/换号/停机保护及未知错误分类；逐项证据见 `2026-09-13-bilibili-auth-core-audit.md`。共享fixture同时经TS/Python验证，实际Preload/Core/SQLite链路覆盖六类登录操作，独立复审的重要问题已关闭。
- 用户再次要求“提交代码”后，停止业务扩展。复现并修正Cookie.rest的mypy类型错误，完整 `check.cmd` 退出0：Node423（Core143、Desktop169）、Python77，类型/格式/Electron生产构建/D盘路径检查通过；`git diff --check`及生产fixture排查通过。原B/S仍为 `fa2faa6` 且干净，未启动或修改原项目、未访问真实凭据/用户库。此次仅本地提交，不推送；M07连接联动与真人/原生验收、M08–M18仍未完成。
- 上述登录采集/生命周期按用户要求提交为本地 `e10cae8`。本轮按 `2026-09-13-auth-danmaku-link-migration.md` 继续M07连接联动：首次激活事务后通知、缓存成功不重放；逐房升级保留协议/归属与失败隔离；原撤销/换号不主动踢既有LOGIN连接。新增有界串行控制、Core立即停止边界与真实Realtime子进程取消。逐项证据和原依据见 `2026-09-13-auth-danmaku-link-audit.md`。
- M07联动新增31项回归。先复现业务与生命周期差异，审查中的DB失败跳过关socket、Worker无应答阻挡退出均补失败测试再修复；复审无遗留重要问题。真实测试子进程验证退出前PID存在、退出后ESRCH，旧事件/昵称查询在实际DB关闭后不落库；不把合成进程当作原生Electron/真人平台验收。
- 最终完整 `check.cmd` 退出0：Node454（Core174、Desktop169）、Python77；类型/格式/Electron生产构建/D盘路径检查通过。`git diff --check`、生产fixture与测试Worker残留排查通过；原项目仍 `fa2faa6` 且干净。本轮未自动提交/推送、未启动原项目、未重启安装应用或生成安装包。下一项M08直播REST；M07真人/原生和M08–M18范围未缩减。M09预检发现先slice容量再跳过手动房间与原规则不同，已记录到本轮审计剩余项，后续按原调度/Repository一起修正。
- M07联动随后按用户要求提交为本地 `27c1297`，未推送。M08查询子项对照原Controller/Service/Repository及列表/趋势加载，补全量房间查询、插入排序、历史与事件数量归一化、时区/微秒边界；真实505房间/2005快照、Preload/Core/SQLite重开及Connected页面第505房回归。逐项证据见 `2026-09-13-live-query-audit.md`，独立审查的重要问题已关闭。
- 用户要求“提交代码”后停止扩展迁移范围；提交前修正新集成测试跨包内部fixture引用的TS6307及Python测试格式。重新完整运行 `check.cmd` 退出0：Node493、Python105，类型/格式/Electron生产构建/D盘路径通过；生产fixture、测试Worker残留与原仓库只读检查通过。此次仅本地提交、不推送；M08采集/Worker/完整UI及M09–M18、真人/原生验收仍未完成，没有重启已安装客户端或生成安装包。
- M08查询随后按用户要求提交为本地 `9e091f6`。本轮按 `2026-09-13-live-collection-migration.md` 逐段核对原采集/快照/Repository/RetryPolicy，补资料与实时观测分离、重新添加的事件/设置规则、原事务顺序、微秒陈旧及REST待结束保护、事件落库时间、错误来源和类别重试。原stale re-add传入旧时间但SQL实际用now，已纠正旧错误测试期望；未修改原B/S。
- 新增33项真实Core/SQLite回归，初轮23项失败加旧测试1项失败；后补待结束同刻格式、并发旧失败事件上下文及同秒历史身份覆盖，分别先失败后修复。实际数据库唯一键冲突、场次失败和批内部分成功覆盖内部错误不误记平台失败。独立复查无未关闭Critical/Important；实际NDJSON错误字节传输尚未验证，已明确记录，未假冒完整Worker验收。
- M08采集子项最终 `check.cmd` 退出0：Node526（Core214、Desktop172）、Python105，类型/格式/Electron生产构建/D盘路径检查通过；diff检查、生产fixture与测试Worker残留排查通过，原仓库仍`fa2faa6`且干净。未自动提交/推送、未重启安装应用或打包。下一项M08 Python Live parser/真实Worker链路，之后退出生命周期与完整UI；M11补platformLiveTime同刻字符串判重启差异。M07真人/原生及M09–M18范围不缩减。
- M08采集随后按用户要求提交为本地 `fcc2920`。续补Live独立解析、0分区/short ID、昵称/字段回退、时间/空结果/原错误分类、Pydantic输入输出校验，以及真实Python→NDJSON→Core→SQLite链路。共享16组HTTP、17组输出、12组输入fixture；只替换HTTP外部传输，不修改生产parser/业务为模拟实现。证据见 `2026-09-13-live-worker-audit.md`。
- 独立审查发现负计数被新契约拒绝，先补失败回归，后贯通Live/Subject signed-safe-integer；真实存储链路再暴露非负CHECK，追加v13并保留历史迁移。隔离测试验证旧数据、rowid/证据/关联/索引、重开和失败回滚；未打开用户实际数据库。复审无剩余Critical/Important。
- 用户要求“提交代码”后停止扩大业务。提交前最终完整`check.cmd`退出0：Node576、Python183，类型/格式/Electron生产构建/D盘路径检查通过；diff/生产fixture/测试Worker检查通过，原项目仍`fa2faa6`且干净。仅本地提交，不推送、打包或重启已安装客户端。M08完整数值域/边缘解析/配置、退出生命周期及完整UI，M07真人/原生和M09–M18仍保留，不能把本轮自动回归当成全量迁移完成。
- 上述Worker与v13改动按要求提交为本地`c78797a`。本轮依照`2026-09-13-live-lifecycle-migration.md`继续M08：对照原Scheduler/Service/Repository/Properties和LiveView开关，恢复默认每秒fixedDelay及启动到期扫描，保留1500ms限流；补Live立即停止/计时器取消/迟到保护、Core同步触发停止、内部存储异常安全日志与后续调度。
- 新增22项回归：首12项生命周期、4项调度及1项真实SQLite触发器失败均先复现再修复；暂停退避/重开原有行为只补覆盖，另补已完成批次保留/最后成功后停止及真实Python退出验证。实际生产Python runtime/NDJSON/WorkerSource链路验证在途HTTP停止后PID消失、无迟到库写入；不把该测试等同于原生安装客户端验收。证据见`2026-09-13-live-lifecycle-audit.md`。
- 本轮最终完整`check.cmd`退出0：Node598、Python183，类型/格式/Electron生产构建/D盘约束通过；独立只读审查无Critical/Important，生产fixture和测试Worker残留排查通过，原仓库仍`fa2faa6`且干净。未自动提交/推送、未重启已安装应用或打包。下一项M08原直播页的卡片详情、采集节奏、间隔/趋势/事件交互；完整数值域/配置、M07真人/原生及M09–M18仍不豁免。
- 生命周期按用户要求提交为本地`2896d1b`后，本轮按`2026-09-13-live-monitor-panel-migration.md`继续M08原直播页：抽出监控操作区、默认首房/成功重读规范化、canonical添加展开、八字段/完整性/异常、原状态优先级、秒级展示节奏、跨房间/页签草稿及失败保留；原共享三模式部件不变。保持浅粉白主题，不改原项目或本地Core/Worker/数据库。
- 首6项浏览器行为回归RED后实施；审查又用实际输入框复现键盘步进300→301和滚轮误改，分别补RED并修复为显式数字spinbutton语义，保留焦点与页面滚动；长名称换行也先RED后修复。另补8项纯展示边界与1项重复添加的覆盖，不把补覆盖当新增RED/GREEN。证据见`2026-09-13-live-monitor-panel-audit.md`。
- M08下一项为完整趋势（1/2/3/4布局、交互图表/排序/回退/刷新/清空规范化），再迁移事件/汇总及原loadAll语义；现有对应测试仍有客户端旧行为，不能当原业务等价证明。详情场次M11、原数值域/配置、M07真人/原生及M09–M18全部保留。
- 本轮最终完整`check.cmd`退出0：Node616/Python183，类型/格式/Electron生产构建/D盘检查通过。先同步过时v6文案断言，后遇esbuild内存分配失败；确认失败检查终止及测试进程退出后，仅设置本次进程`VITEST_MAX_WORKERS=2`重跑全部用例，不删测试或改依赖/系统。独立复审无Critical/Important，diff/生产夹具扫描通过，项目测试进程0，原仓库仍fa2faa6且干净；没有自动提交/推送/重新打包/重启应用。
- 监控操作区随后按用户要求提交为本地`9eb5602`。本轮按`2026-09-13-live-trend-migration.md`继续M08趋势：原选序/最多4房、1/2/3/4布局与420/320/200/240高度、真实时间轴/原值域与精度、鼠标/键盘提示、fetched→recent→current回退及missing按0绘制的明确缺失说明。同页及独立页签共用组件，500点、180ms选择合并、500ms提示、成功重读规范化和旧响应隔离；不新增服务端/依赖/存储事实。详见`2026-09-13-live-trend-audit.md`。
- 首8项浏览器回归和原clear规范化分别RED后实施；后补同选择旧在途吞新查询、10px CSS覆盖与超长名称、生产15秒缓存阻挡重读、快切返回旧key绕过180ms，均先复现后修复。独立复核Critical/Important/Minor均无剩余；9项纯算法为补覆盖，不冒充RED。既有错误/删除/505房间/粉丝图表与共享Widget回归保留。
- 最终完整`check.cmd`退出0：Node636（Desktop210）、Python183，类型/格式/Electron生产构建/D盘路径检查通过；本次仍仅进程级`VITEST_MAX_WORKERS=2`，全部测试执行。diff/新增文件空白/生产fixture扫描通过，项目测试进程0；原仓库仍fa2faa6且干净。没有提交、推送、打包、重启安装客户端或真人平台验收。
- M08下一项仍按原源码迁移loadAll的rooms/summary/events原子赋值、错误与事件/汇总区；当前三个Query各自读取，summary/events失败时整体页面语义尚不等价，不能用趋势测试掩盖。原数值域/配置、M11详情场次/同刻字符串问题、M07真人/原生及M09–M18继续保留。
- 趋势随后按用户要求提交为本地`25a7b55`。本轮依`2026-09-13-live-overview-migration.md`继续整体刷新/事件汇总：三个typed bridge全部成功才发布同一页面投影，失败保留完整旧数据、首次失败显示未知；成功后规范化选择/草稿和刷新趋势。恢复原四项汇总、toolbar计数、主播名+六类事件及同页/独立页签复用、秒级相对时间。
- 首批11项业务差异先RED后实现；另保留原已通过的迟到读取回归。独立复核发现delete/interval成功后本地清理错误地等在loadAll之后，补2项挂起测试RED并修复为onCommitted先确认再重读；删除后重加同房间号的新monitorId、旧卡片误点不查已删ID已有回归。截图又补深色刷新按钮1.01:1对比度RED，复用既有button-secondary后通过。纯展示4项为补覆盖，不冒充RED。
- 最终完整`check.cmd`退出0：Node658（Desktop232）、Python183；类型/格式/Electron生产构建/D盘检查通过。相比基线新增22项，全部执行；仅本轮进程设置`VITEST_MAX_WORKERS=2`。独立复核无Critical/Important，README歧义措辞已修正；diff/新增空白/生产fixture扫描通过，项目测试进程0，原库fa2faa6且干净。没有自动提交/推送/打包/重启/真人平台或用户库操作。详见`2026-09-13-live-overview-audit.md`。
- M08下一项为剩余原数值域/特殊解析（标识符、URL、字符串及宽松数值）和配置对齐；随后依完整台账继续M09弹幕、M10榜单、M11场次等。M11详情场次和同刻不同格式问题、M07真人/原生及M09–M18未完成范围不变。本轮不是全量迁移完成。
- 整体刷新随后按用户要求提交为本地`f100ebc`。本轮按`2026-09-13-live-collection-configuration.md`迁移自动REST开关/扫描延迟/到期与状态批量配置，实际D盘数据目录只读JSON+原环境变量覆盖，Core打开数据库前验证。修正误把30默认UID当上限的TS/Python/portable/service限制；实际64/11批次及75UID真实Python回放通过。enabled=false保留手工操作、房间启用状态、粉丝和弹幕调度。
- 新配置集成先11项RED（宿主全局调度opt-out原已通过），批次/Worker上限分别RED后修复；原同秒快照upsert的测试时钟修正，不改生产幂等性。独立审查两次指出启动错误链路，真实entry/runtime/controller经Node Worker适配器先复现退出堆栈、再复现stderr污染；仅对已知配置错误保留固定core.error并停止失败Core，修正文件可重启，最终无Critical/Important。共享配置样例/加载器/direct guard为补覆盖，未冒充RED。
- 完整`check.cmd`退出0：Node706（Desktop233）、Python200，类型/格式/Electron构建/D盘检查通过，新增48/17项；进程级`VITEST_MAX_WORKERS=2`执行全量。diff/新增空白/生产fixture扫描通过、测试进程0、原库fa2faa6且干净。本轮未提交/推送/打包/重启/访问用户数据库。证据见`2026-09-13-live-collection-configuration-audit.md`。
- M08配置剩余：HTTP连接/读取超时、UA/Referer及外层Worker/Core超时协调；重试/退避/默认和最小最大间隔、短间隔提示；跨直播/榜单/弹幕/场次的storageEnabled开关。随后继续原完整数值域/特殊解析与M09–M18，不把本次4项调度配置等同于所有配置迁移。
- 自动采集配置随后按用户要求提交为本地`0b4dd57`。本轮按`2026-09-13-live-collection-policy.md`续接八项间隔/限流/重试/失败退避配置：文件和八个原环境别名进入真实Core；保持手工DTO和SQLite的1..2592000硬约束，非法默认不夹取，已有房间排程不随默认配置重写。短间隔只记原警告，失败保存max(60,min(interval,configured))；maxAttempts仍受原最多4次规则限制。
- 首轮共享TS4/Python3与Core24/loader2项RED后实施；Auth清理interval导致夹具runAllTimers错误，修正测试推进而不动登录业务。长退避两项RED复现Node大timer被缩为1ms，生产改为可取消分段等待；Core环境全链一项为后补覆盖。独立只读复核无Critical/Important，新增两文件27/27通过。
- 完整`check.cmd`退出0：Node745（Core298、Desktop233）、Python211；类型/格式/Electron构建/D盘检查通过，新增39/11项。详情见`2026-09-13-live-collection-policy-audit.md`。本轮未提交/推送/打包/重启或访问用户数据库；原仓库只读。
- 下一项继续M08 HTTP/外层35秒与90秒时限协调、storageEnabled及完整解析域。另已查明原RateLimitService共享锁内等待与客户端预约的严格并发/迟醒差异，以及原API duration包含限流而当前不含的定义差异，保留后续修正；不把八项策略配置接入当作全部采集语义等价。M07真人/原生、M09–M18全量范围不变。
- 用户随后要求提交当前代码：本批已接四个 REST 端点的连接/读取超时、UA/Referer，以及显式 opt-in 的 Core/Python 存活帧与无响应看门狗。提交检查修正默认字段断言和 portable Schema 末尾换行边界；独立只读复核无 Critical/Important。完整 `check.cmd` 退出 0：Node 781、Python 247，类型/格式/Electron 构建/D 盘检查通过。详见 `2026-09-13-live-http-lifetime-audit.md`。这只覆盖 REST 消费者；其他 HTTP 消费者、真实 OS 管道失联验收、storageEnabled 和其余既定全量目标仍未完成。本次仅本地提交，不推送。
