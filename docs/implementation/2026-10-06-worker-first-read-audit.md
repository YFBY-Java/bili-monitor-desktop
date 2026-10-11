# 首次 Worker 读取与测试目录保护（2026-10-06）

## 范围

续迁原 B/S，当前优先收尾粉丝 Worker 首次请求的全量验收缺口，不新增业务、AI/Agent、依赖或服务。原仓库 `D:\codex_work\BiliMonitor`（fa2faa6）和 API 参考（271b123）只读；客户端仍为 `codex/follower-monitor-actions`、HEAD 4c94959，既有51项变化和空 index 保留，未提交推送。

本轮[计划](../superpowers/plans/2026-10-06-worker-first-read-verification.md)覆盖上一完整审查的两项待办：真实首次 stdin 读取的有限取证，以及 auto-target 测试创建 TEMP 前的 D 盘保护。生产代码、原业务顺序、请求契约、预算、并发和停止语义不改变。

## 原业务和未闭合边界

亲读原 `BilibiliFollowerMonitorService.java:64–83`：添加先采集卡片；失败不添加，成功再保存用户和快照。原业务没有给测试提前 ping/预热的理由。真实客户端测试经 Preload/router/Core/SQLite 和 Python HTTPX MockTransport，不调用真实 B站，也不是本地业务 HTTP 服务。

上一冻结完整检查 Node2170/2171，仅 pending add 的10000ms marker等待失败；停止、实际子进程退出和 SQLite 不变断言没有到达。Node 已写 stdin，Python fixture 已 patch-ready，但这不证明 runtime 完成导入或读取首行；refresh 的第二次请求通过不能代替首次请求。上一清理 exited=false 是当时快照，不是已证明持续孤儿进程。

本轮唯一假设 H2：marker 截止之前 Python 尚未实际进入首次 stdin.readline。观察到 enter 可证伪 H2；没有 enter 只定位缺失边界，不能归因 CPU、导入、线程或管道。诊断不是修复，定向通过也不等于完整取消验收。

## 本轮执行记录

主代理已完成源仓库/HEAD/分支/index/进程只读核对、原业务/API参考重读、计划和3文件任务前快照，并亲读实现与实际报告。任务前快照用于审查增量，不拿 HEAD..HEAD 的空 diff 代替未提交变化。

实现仅为5个测试文件：新增纯 Python 首读代理和6项pytest，现有 sitecustomize 按原前缀安装；Node allowlist 新增四个固定阶段；auto-target 创建前验证绝对D盘TEMP，保存本次创建状态和根，清理前验证严格后代。代理首次调用原 readline 恰好一次，不记录返回内容；诊断回调失败不替换读结果/异常。后续读取直接透传，Python总10阶段、Node4096字节/10阶段和全局40阶段保持。

RED证据是行为断言失败，而非缺文件：Python直通实现6失败、路径无检查2失败（过滤旧9项）、原allowlist1失败（过滤旧11项）；过滤项不计通过。GREEN串行执行Python6/6、Core11/11（原9业务+2纯路径）、Desktop12/12（原11+1allowlist），两项类型、Black/isort均退出0，未执行整套或构建。详细命令、实际输出/退出码及无持久日志的说明在D盘 `.tmp/2026-10-06-first-read-report.md`。

定向真实Worker首次add在Node1178ms记录enter/line，随后1179ms HTTP回调、1242ms marker等待完成、1246ms child exit，pending被拒绝；原停止和monitor/snapshot/artifact无迟到写入断言实际执行通过。refresh的新child首次读1126ms，后续请求退出也执行通过。这只能证伪本次定向运行的H2，不能解释此前全量失败或证明生产冷启动已修复。

独立task审查 Spec compliant / Quality Approved，无待修项。主代理核对不能从任务diff验证的全局项：原stop/exit/SQLite断言和10000/25000/35000/1500预算保持，前缀启用、10/4096/40/8/65536限制、原9业务及生产文件未改、源码/HEAD/index/D环境保持。H2和whole gate仍由主代理裁定，不把task批准扩大为整体验收。

## 冻结后的整轮结果

代码冻结后只运行一次 `check.cmd`，原并发和预算不变，D盘 `.tmp/2026-10-06-first-read-full-check.log`，同一会话99515终态退出1，实际 `CHECK_EXIT=1` 已用支持的 Tee 参数记录。没有重启、预热或再跑Node碰绿。

| 检查 | 实际结果 |
| --- | --- |
| 非桌面Node包 | Contracts475、Storage53、Task3、Browser12、Realtime46、Core939全部通过 |
| Desktop | 55文件：49过、6失败；646项：623过、4失败、19跳过 |
| 合计Node | 2174项：2151过、4失败、19跳过；全check退出1 |
| 被截断步骤的独立补验 | 全TS、Black60、isort、mypy18、Python1022（2.80s）、生产build各退出0，补验总退出0 |

补验日志 `.tmp/2026-10-06-first-read-complement.log` 会话9153已终态，每步和 `COMPLEMENT_EXIT=0` 都有真实退出码；它不能把原check改称绿色。构建生成Main/Core/两NodeWorker、CommonJS Preload和Renderer，没有制作安装包或运行用户应用。

本次全量 pending add 在Node3489ms观察enter/line，3490ms replay、3491ms marker，3535ms进入stop，3538ms观察child exit，3553ms stop完成；pending拒绝、monitor/snapshot/artifact无迟到写入断言实际执行通过，cleanup3578ms exited=true。refresh的新child1259ms首读，随后第二请求marker10902ms、child exit10923ms，原退出和数据库断言也执行通过。没有probe-limit。

因此H2在**本次全量运行**被证伪，并补上此前未执行到的首次add取消/退出/SQLite路径；这不是新增生产启动修复，也不能解释或保证此前间歇超时已根除。不需要为该成功路径继续堆叠未支持的Worker导入探针。

当前失败均为浏览器setup/导航，并非这些case业务body断言失败：Delete beforeAll10000ms导致9项跳过，Status beforeAll10000ms导致10项跳过；Trend首case与Workspace Long64 case beforeEach10000ms，Widget505 `goto(commit)`2500ms，TabRail深色case beforeEach20000ms。后四项记4失败；前两项记failed suites，不把19跳过计为通过。TabRail是本次新观察到的失败位置，不能因没有改其代码就豁免。

阶段证据保留：Delete goto3542ms开始，到9919ms才observed committed，10158ms开始teardown，页面关闭和监听清理有记录；当时3项本地资源仍pending。Widget fixed HTML的server finish/close1251ms，但goto没有记录commit，Node导航采样最大lag6355ms。Trend/Workspace fixture loaded接近各自10s hook期限，body并未到达。这些只确定观察边界，不能单凭lag或server finish断言CPU、浏览器、网络或Vite是根因。

下一步以完整失败清单做一次新的只读边界核对，优先定位本地浏览器startup/await与Vite资源阶段，再选最小可证伪回归；不改原预算/并发、不盲目重跑，也不开始下一业务掩盖验收缺口。最终累计审查和安全核对在下节更新。

## 最终安全与完整审查

主代理2026-10-06 12:34:34 +08:00核对：项目Node/Python/Electron/Chromium进程及所属TCP监听0；原fa2faa6/API271b123 clean，client4c/分支/空index保持，55项累计变化含原51项保留。TEMP/Python/pnpm均D盘，diff检查和新增文本尾空白通过（Git仅有既有LF→CRLF提示）；无新增C/C++/Rust/Java源码。Main/Core无外置source workspace包、CJS Preload存在，生产源中本轮测试marker0。没有提交推送、工具安装、原B/S启动、真实平台、用户数据库或凭据操作。

完整累计审查已结束，独立最强模型完整读取409221字节/5311行/55路径及当前终态证据，主代理亲读正式报告：Implementation-slice quality Approved、Ready to merge With fixes、Ready to ship No；未发现新增生产Critical/Important。上一Worker未执行原取消断言的缺口由本次真实whole补齐，auto-target创建前D预检Minor关闭；保留一个Important整体验证项，完整覆盖当前6个浏览器文件、4失败及19跳过。没有把定向/补验绿色或局部修补扩大为完整迁移完成。

正式D盘报告 `.tmp/2026-10-06-first-read-whole-review.md`；审查后仅补Markdown结论/交接，生产与测试代码保持冻结。完整目标仍active，不暂停、不标完成、不变更Git状态。

审查后2026-10-06 12:39:33 +08:00再核对：项目进程/监听0，原/API仍clean，client4c/分支/空index/55路径保持，diff及新增文本尾空白通过。只有Markdown记账发生在冻结审查之后，不重复测试或修改失败日志。

## 下一轮最小候选（仅提案，未实施）

主代理亲读独立只读审计 `.tmp/2026-10-06-browser-current-six-audit.md` 并核对实际Trend/Workspace/Status/TabRail startup及直接fixture入口。6处是同一个本地浏览器启动核对域，不拆6个重复fixer；Status与TabRail目前没有精确阶段证据，不能借用Delete/Widget阶段替它们下结论。

唯一下一候选是供6处复用的测试侧被动有限observer：原setup每个既有await的begin/end/error和main-frame framenavigated/DOMContentLoaded/load观察，操作只调用一次、值/异常身份原样透传；不替换默认load/commit、不提前warmup、不改route/middleware/clock/预算/并发/cache。最多40固定阶段/每hook与4096字节失败摘要，只输出Node相对时间、active await、固定lifecycle及closed/removed/capped等状态；不输出URL、内容、原错误或用户数据，清理/迟到回调不能续记录或跳过page关闭。

候选假设仅区分“Node已观察到相关lifecycle，但原goto/locator续段未完成”与更早未观测边界；未记录callback不等于浏览器未发生，须同时保留安装/上限/错误完整性限制，Node观察时间不代替浏览器发生时间。实施前需exact-once/结果异常身份、observer失败不改变操作、bounds/redaction、detach/late cleanup以及deferred goto vs deferred locator行为RED→GREEN，再独立审查。当前没有helper代码、新测试或新全量执行，不称根因/修复已证明。

## 剩余范围

完整 M01–M18 仍未完成；M06共享执行域及解析/承载、原15项弹幕设置余11、M08/M09–M18业务、真人与原生/安装验收继续保留。本轮不更新安装客户端、不启动原 B/S、不访问用户实际数据库或凭据。
