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
| M06 | `bilibili/BilibiliView.vue`、Follower Controller/Service/Repository | Follower workspace/service/Python worker/storage | UID 校验、首次快照、card 回退、启停删改刷、1..2592000 秒、批量调度/退避、并发、1/6/24 小时等原趋势范围及最多 4 用户 | 前轮部分回归；按新基线复验 |
| M07 | `bilibili/components/BilibiliAuthPanel.vue`、QR Dialog、Auth Service | `BilibiliAuthPanel.tsx`、Auth service/worker、credential storage | 五态、轮询/过期/关闭后响应、Cookie 合并、凭据查看/复验/撤销、登录升级及撤销后的弹幕连接、进程恢复 | 待逐操作核对；真人扫码单列 |
| M08 | `bilibili-live/BilibiliLiveView.vue`、Live Monitor/Snapshot Service/Repository | Live workspace/service/worker/storage | 房间/UID 解析、弱回退、批量轮询、间隔及错误退避、并发更新、事件及趋势；保持真实状态与房间隔离 | 前轮部分回归；按新基线复验 |
| M09 | Danmaku Controller/Service/parser、`BilibiliLiveEventIngestionService` | Node Realtime、Core Danmaku/Session services | 启停重连、protover 0..3/自动、匿名/登录降级、心跳、UID/昵称补全缓存、原始事件/指标去重、连接结束与覆盖窗口 | M01/M02 后逐项核对 |
| M10 | Rank Controller/Service + 原 DanmuWidget | Rank worker/service/contracts、Live/Subject UI | 在线/进房/日周月榜、大航海周/月/陪伴；页码/排序/类型、已保存快照、部分失败、切换后不串房 | 待逐操作核对 |
| M11 | Session Controller/Query/Repository、`BilibiliLiveSessionPanel.vue`、`DataCenterView.vue` | Session service/storage、Live 场次/数据页签 | 状态/边界、覆盖窗口、房间/场次选择、事件类型/关键词/UID/付费、分页、用户聚合、未知 UID、空数据与查询失败、自动刷新 | M02/M03 后逐项核对 |
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
