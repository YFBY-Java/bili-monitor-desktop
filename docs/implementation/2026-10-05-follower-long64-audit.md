# M06 粉丝 Long64 精确计数全链迁移审计

## 范围与基线

本轮续接粉丝业务，不新增臆造功能。原 B/S `D:\codex_work\BiliMonitor` 为 `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，只读；历史 API 参考 `D:\codex_work\bilibili-API-collect-new` 为 `271b123`，只作定位/字段研究。客户端 HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`，157 条既有工作区增量保留、index 空。本轮工具、缓存、回放响应、临时数据库、构建产物全部在 D 盘；未访问凭据或用户运行库，未安装、提交、推送、打包或重启安装应用。外部 I/O 原本限定合成边界；收尾发现并修正一处桥接 fixture 默认直播 Worker 路径，详见下文，不将整轮写为“平台请求为零”。

这是 Long64 子项的实现与验证记录，不是 M06 或 M01–M18 完整迁移完成声明。前一轮 JSON 子项有实质代码与新鲜全检查证据，分类为进度；本轮继续推进完整目标。

## 原业务依据

先读本机 API `docs/user/info.md` 用户名片与关系接口，再逐操作核对原源码：

- `backend/.../bilibili/client/BilibiliApiClient.java:67–121,214–229`：数值 `JsonNode.asLong()`；整数低 64 位回绕，Double 先 binary64 再截断/饱和。文本 `Long.parseLong` 不 trim，接受 ASCII 正负号、任意前导零、BMP 十进制数字，越界返回缺失，按原字段优先级回退。零和负计数有效，不能因其值而回退。
- `BilibiliFollowerMonitorService.java:64–78,135–151,310–337` 和 Repository：添加按响应 MID upsert 并复用实际行 ID；刷新只按监控 ID 更新，监控 MID 不变，快照 MID 使用响应值。相同秒快照冲突保留已有快照 MID/ID，仅更新计数、时间、来源、原响应。返回采集结果仍用监控 MID。
- `V2__bilibili_follower_monitor.sql` / Subject binding 迁移：monitor/binding MID 为正 Long；响应/快照 MID 为 signed Long。四个计数列没有非负 CHECK。添加遇到非正响应 MID 是持久化失败，不是平台 PARSE。
- `SubjectWorkbenchService.java:74–90,153–184,517–518`：24h 基线是区间内最新 2000 条的第一条；趋势同桶取最后值。差值按 Java signed64 回绕；粉丝增长率用已经回绕的差值转 Double 再除 previous，previous=0 时无值。

独立只读调用原 compiled client、现成 Groovy/Jackson 2.17.3/JDK20.0.1 做 golden。BMP 65,536 字符有 370 个被 Long 文本解析接受，摘要 `1d045c18e872fac97712feb1f31ca5c8347f0228aaa5bc97352e98f87d4a4976` 与 Python 一致。未新增 Java/C/C++/Rust 源码或工具链，亦不将此观察扩大为所有 JVM 的兼容证明。

## 实现与业务通路

1. 共享 `java-long.ts` 定义 canonical signed64/positive64 值域、严格转换、safe v1 投影与 Java 回绕差值。新增 follower/Subject v2 DTO、standalone portable schema、跨 TS/Python golden。旧 v1 schema 与 API 保留，不静默舍入。
2. Python 原转换层补 Long 规则。`fetch-card.v2` / `fetch-relation-stat.v2` / `fetch-profile.v2` 在 JSON 出口前转换 canonical 字符串，使用原 HTTP、parser、CAS 和持久 stdio。旧 v1 无法表达的数据明确报兼容错误，而非平台 PARSE；临时 profile 不因未输出的大计数而失败。
3. SQLite 内部计数为 bigint，五种粉丝 reader 独立启用精确读取；小的 interval/version 仍安全 number，不改变直播读域。写入严格 signed64，拒绝已不精确的 numeric 输入。追加 v14 去除多加的四个非负 CHECK，保留原 MID、间隔和外键规则。
4. Core 精确共同业务提供八个 v2 方法；旧出口才投影 safe numeric。内部 Subject add/bind 与调度不得绕回 v1。新快照 outbox topic 为 `bilibili.follower.snapshot-collected.v2`，响应 MID/计数为精确字符串；历史消息不重写。v1 不支持的值经 Runtime 外部出口返回 `LONG64_LEGACY_PRECISION_UNSUPPORTED`，不进入采集失败、回退或历史覆盖逻辑。
5. Main、Controller、Preload 新增 `bilibiliFollowersV2` 八操作和 Subject workbenchV2/trendsV2；严格共享请求/响应 schema。长请求白名单同时包含 v2 添加/刷新。RuntimeEnvelope 仍为 v1，业务方法使用 `.v2`。
6. Renderer 生产查询/操作切 v2，MID 不经 Number。分组数值、排序、总计、差值、轴刻度、提示保留 BigInt；只把已归一化有界绘图坐标转 Number。UI 总计/区间净变化为无界展示运算，与 Core signed64 回绕字段明确区分；直播数值轴未改。

## 先失败后修复与独立复审

- Contracts 新 116 例先 RED；Python 新 Long/stdio 180 例覆盖原解析、v2/legacy、portable 输出、GBK stdout、错误后后续请求。实际 Worker 使用原 parser/CAS/stdio，仅合成替换外部 HTTP。
- Storage 初始 7 例 6 失败；Core 新八个业务回归全失败后实现，另补全部旧出口、历史查询与 JVM 算术 golden。Root Subject/WorkerSource/liveness 7 个失败、Runtime v2 入口失败后接通；兼容码转换两例先失败。
- Main/Preload 第一轮 19 失败，真实 router/client 六例另行失败后接通；Renderer 新纯展示/SSR/预览 6 失败、浏览器粉丝交互两例失败后修复。
- 复审发现 Subject v2 三处嵌套 MID 仍沿用无上限且 trim 的旧域：共享 golden TS 1 失败、Python portable 9/81 失败后修复。
- 复审发现 v2 portable HTTP 默认字段误必填、末尾 LF 误接受：TS 1/43、Python 6/28 失败后，仅修 schema 输入域，旧业务规则不变。
- 复审发现 v14 对其他表 trigger / view 引用不兼容：实际 v13 开库失败。新增 13 例，20 中 7 失败后修复迁移作用域，保存/恢复 foreign_keys 与 legacy_alter_table；成功、FK 回滚、BEGIN 失败均保留调用方状态，不回滚调用方事务。重开、稀疏 rowid、全附属 SQL、真实触发器副作用、视图、CAS/outbox、FK cascade/SET NULL 验证。
- 复审发现 Main 最终帧只按 ID 接收的既有弱点：针对 v1/v2 result/error 的错误类型与关联字段补先失败回归；最终帧必须匹配关联字段及预期类型，错误帧不续约、不提前结束请求。

## 验证证据与边界

定向证据：真实 Python HTTP/CAS/stdio → Core/SQLite → Router → typed Preload 的极值/相邻大数/整数回绕/Double 饱和/BMP 文本、signed response MID、关系回退、认证失败历史保留及同 Worker 后续请求通过；另外覆盖 Controller carrier 的全部十个通道。实际 v2 长 HTTP 超出 watchdog 后成功，以及三种 v2 parent-pipe 丢失取消已通过。新增 v2 添加/刷新 pending HTTP 时 Core 停止与关闭 SQLite 的回归防止迟到写入。

退出证据必须区分：parent-pipe 回归观察 Python HTTP 取消；Core 主动 stop 则沿用 transport 的 `stdin.end()` 后立即 kill，实际 spawn probe 返回真实 ChildProcess、观察其终态，再重开 SQLite 核对监控/历史/证据没有新增写入。后者证明强制终止与持久化保护，不证明 Python finally、优雅 HTTP 取消或原生 Electron 退出。

这些回放没有访问真实平台，Preload 集成直连 Router、Controller carrier 为模拟 utility child，不能描述为真实 Electron 原生 IPC/安装客户端全链验收。该手工验收继续保留。

首次完整 `check.cmd` 执行到 Core 后退出 1：Core 860 例中 854 通过、6 失败，Desktop/类型/Python/构建未执行。五处失败是调度已切 v2、测试 spy 仍看旧方法；只改五个测试文件的九处 spy（含四处关闭状态负断言），保持时序、gate、调用数和实际状态断言。定向先复现 65/70，再验证 70/70 及 Core typecheck。

另一个历史查询压力用例在全量并行下超时；阶段测量数据准备约 20,011ms、查询约 24ms，单跑没有复现超时，全量负载放大为测量支持的推断。中间 2003 点改用真实 Repository 同步批量事务，首 add/末 refresh 保留真实 service 和 2005 条历史，原 500/2000/48、时间、顺序与监控投影断言全部保留；补 microsecond/同秒全字段等价与原子回滚，两例先 RED，再相关 14/14。压力用例约 805ms；不把异步调用包进同步事务，不改业务、超时或并发。中间合成 HTTP/API 日志不再逐次构造，该用例不是采集或日志全链证明。

第二次完整检查 Core 862/862 通过，但 Desktop 370 中 352 通过、18 失败，均为测试等待/隔离边界，尚不能报完整绿灯。桥接首例默认 5 秒超时，测量发现 refresh 在合成源上等待原限速、Subject 绑定还会查询直播间：原 fixture 没有注入 liveSource，实际进入默认 LiveWorkerSource/Worker 启动请求链。旧运行目录已清理，缺少保留的 PID、HTTP 完成结果或日志，不能声称证明公开 HTTP 已完成，也不能声称平台零请求。发现后显式注入合成“无直播间”source，真实 Subject 弱失败流程/目标 UID/调用次数保留；只在本用例恢复性覆盖启动限速为 0，补真实 SQLite BigInt/INTEGER 断言。首例约 3519→196ms，6/6 和 Desktop Node typecheck 通过；这些默认链路运行不作为实网验收。

另外旧直播组件夹具只提供旧 Subject 方法和查询失效 key，已识别为 v2 切换后的漂移。先复现首例 beforeEach 失败；修方法后又复现三处旧查询 key 失效，再仅同步夹具的 v2 方法/key。冷缓存导航探针也复现 Overview 的 `load` 等待超时：未完成的均为本地 Vite 依赖，约 200ms 后 load、370ms 后真实 heading 就绪，无 pageerror 或外部请求。三套导航改等 `commit` 后仍等待原真实 heading/alert，动作/Hook 时限、并发与所有业务断言不变；合成头像限定同源，不外发。最终三文件 44/44、web typecheck 通过；全新冷缓存独立探针 UI 就绪约 2.1/3.2/2.7s，pageerror/external 都为 0。

### 最终收尾验证

所有代码与测试补丁冻结后，于 2026-10-05 21:00 开始第三次完整 `check.cmd`，最终退出 0：

- Node **1807/1807**：Contracts 461、Storage 53、Task Engine 3、Core 862、Node Browser 12、Node Realtime 46、Desktop 370；Desktop 45 文件全部通过。
- Python **1003/1003**；TypeScript 全 workspace、mypy 18 source、Black 57 文件、isort 与 Electron 生产构建通过。D 盘工具/缓存/临时文件/浏览器/数据路径检查通过。
- Root 独立核对补丁；跨代理契约/Worker、Storage/Core、Main、Renderer 及最后测试修补限定复审没有新增未关闭 Critical/Important。已有 recycler 等完整目标差异仍保留，不将该结论扩大为整个 M06 或全部迁移无问题。
- 新鲜 `git diff --check` 和 132 个新增文件的适用文本尾空白检查通过；生产本轮 fixture 标记 0，项目 Node/Python/Electron/Chromium 进程残留 0、对应监听端口 0。
- 原 B/S `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`、历史 API `271b123a083698bf576101c21f534b3418768a43` 工作区均 clean；客户端 HEAD 仍 `b2e5a89c3d08c63e6a811567e69019b80b39bff7`、index 空，既有与本轮增量保留。`CLAUDE.md` 仍仅 `@AGENTS.md`。未提交/推送、安装工具、生成安装包或重启安装应用，未访问凭据/用户运行库；测试外部隔离缺口已如上记录，不伪造平台零请求或真人验收。

本轮是有代码、有完整检查与差异记录的实质进度；全量迁移目标继续 active，不标 complete、paused 或 blocked。

## 仍未完成

M06 的默认共享 recycler/交叉模块缓存执行域、其他 JVM Unicode 基线、完整 charset/MIME 内部异常与 API 日志链、Double 文本/数字 message/日志 failureMeta、PG-SQLite/NUL/TEXT 编码与孤立 surrogate 的存储差异、完整属性源/JVM/cache/冲突/indexed 域继续保留。Java 增长率负零在内核保持，但 JSON stringify 的负零符号传递仍属 Double wire 边界，未新增业务字段冒充原协议。

原 `BilibiliView.vue:507–515` 经 `Number(addForm.mid)` 再校验整数，输入文本正规化及原 HTTP Long DTO 绑定仍须独立核对；新 v2 wire 采用正 Long canonical 字符串不能描述为整个原文本接受域已对齐，也不能以恢复 unsafe Number 舍入代替精确迁移。Main 最终帧关联保护已补，NDJSON Python Worker 的最终帧 ID-only 关联边界仍待独立迁移复核。M08、M09–M18 与真人/原生/安装包验收仍未完成，全量目标保持进行中。
