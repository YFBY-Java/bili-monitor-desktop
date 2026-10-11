# 六处浏览器启动验证边界（2026-10-06）

## 本轮范围

续迁原B/S，先处理上一完整审查列出的六处startup/导航验收缺口；不新增产品业务、AI/Agent、依赖或服务。[计划](../superpowers/plans/2026-10-06-browser-startup-boundaries.md)是一波完整清单任务，不重复派发已完成Worker首读或生产投影切片。原B/S fa2faa6/API参考271b123只读；客户端沿用4c94959 / codex/follower-monitor-actions、空index、此前55路径保留，所有产物D盘，未提交推送。

新增一个仅Node测试导入的TypeScript共享观察器和行为测试，为Delete、Status、Trend、Workspace、Widget、TabRail的既有await与主框架/DOM/load回调做被动记录。原操作只调用一次，返回值/异常身份不变；diagnosticFailure只影响安全状态，不改变原操作或跳过清理。每hook最多40固定记录、一次摘要、含换行最多4096 UTF-8字节，不输出URL/内容/原错误。stop冻结outstanding await、移除自有回调，迟到页面关闭后不导航。生产文件、业务断言、页面query/options、route/clock、中间件、超时、并发、缓存和预热不变。

假设H只问：Node已经观察到相关lifecycle时，原goto/locator续段是否仍未完成。Node记录时间不是浏览器发生时间；没记录callback不等于浏览器没发生。观察器不是性能修复。

## 定向实现与独立审查

行为RED：最小直通实现7/7失败；补充serializer故障实际导致清理不到达，RED1失败/8通过。固定安全primitive fallback后，最终9/9通过。单次六文件未过滤运行77/77、无失败/跳过；Desktop types通过。81个hook摘要最大23记录/1277字节，无diagnosticFailure/残留监听或outstanding阶段。报告和原始日志位于D盘 `.tmp/2026-10-06-browser-startup-report.md` 及同名前缀日志；初次GREEN日志被最终GREEN覆盖，初次结果只保留在工具输出，不虚构持久日志。

八文件pre-task snapshot delta（62941字节）独立完整审查：Spec compliant / Task quality Approved，无待修项。主代理亲读报告、helper/unit、六文件完整改动和实际结果，并核对原选项/预算/断言不变；任务diff不能证明的原仓库、分支/index、D环境和进程由主代理单独检查。Task批准不等于全量绿色。

## 一次冻结完整检查的实际结果

代码冻结后只运行一次原 `check.cmd`，会话98674终态退出1，`.tmp/2026-10-06-browser-startup-full-check.log` 有实际 `CHECK_EXIT=1`。不重跑、调预算/并发或预热碰绿。

| 检查 | 本次实际结果 |
| --- | --- |
| 其它Node包 | Contracts475、Storage53、Task3、Browser12、Realtime46、Core939全部通过 |
| Desktop | 56文件：54通过/2失败；655项：653通过/2失败，无跳过 |
| Node合计 | 2183项：2181通过/2失败，无跳过；整套退出1 |
| 独立补验 | 全TS、Black60、isort、mypy18、Python1022（2.67s）、build各退出0；补验总退出0 |

补验会话7776终态退出0，`.tmp/2026-10-06-browser-startup-complement.log`逐项真实EXIT与COMPLEMENT_EXIT=0。构建生成Main/Core/两个NodeWorker/CJS Preload/Renderer，不是安装或真人/原生验收，也不替代Node失败。

### 六处startup本次确实完成，不改写历史

81个本次摘要全部active=null、truncated=false、diagnosticFailure=false、listenersRemoved=true；最大23记录、含换行1288字节。Delete9、Status10本次均实际执行通过，不再报告本次19项跳过。Trend首case、Workspace Long64首case、Widget505以及TabRail深色本次达到body并通过；六文件合计76/77，唯一失败为下面独立的UID输入循环body，而不是setup。

各beforeEach第一case的goto/visible完成Node观察时间(ms)：Delete291/1172、Status189/1097、Trend3783/3948、Workspace2874/3058、Widget549/4542、TabRail3677/3905。所有75个页面scope都完成原等待；没有本次待判的startup H停滞，不能由此倒推上一失败的根因或保证未来稳定性。默认load的callback与goto续段、commit和后续DOM/locator仍按原操作观察，无新的RPC或计时器。

### 当前完整失败清单（两项，均保留）

1. `BilibiliFollowerWorkspace.interaction.test.ts:126`“normalizes original integer input forms without rounding the UID”：本次setup完成，body包含12个输入依次打开/填入/原生validity/提交/等待抽屉关闭/核对精确UID；原5000ms测试预算超时，报告5748ms。没有逐轮阶段，不能认定哪种输入解析错误或最后哪个await未完成；不能改预算、拆少输入或由startup通过宣称这项验收完成。
2. `src/main/follower-long64-worker.integration.test.ts:253` pending v2 add的10000ms HTTP marker等待再次失败：Node写stdin232ms，fixture enter1865/httpx-ready4425/patch-ready4427，marker-wait截止10256ms仍pending，未观察首读enter/HTTP replay/marker。cleanup期间child exit10424、pending拒绝10427、cleanup10502/exited=true；当前失败body没到原stop及SQLite无迟到写入断言，不能拿finally清理代替业务断言。上一whole执行通过仍是历史真实结果，不作为本次pass。

对照refresh的新child本次first-read9988/replay9989/marker9990、result18010；第二请求marker19634、stop19634、child exit19644、stop完成19661，原退出/SQLite断言通过。首add与不同child的refresh不能互相代替。缺首读只定位patch后/实际首读前尚未观测边界，未证明CPU、模块导入、线程、管道或生产原因，当前没有持续孤儿证据。

下一步只读核对当前两项完整失败清单，再选最小可证伪行为/边界工作；不重派已批准观察器、盲目重跑或开始下一业务掩盖缺口。下一独立业务的最近弹幕保留设置已只读核对：原RECENT_LIMIT别名、signed-int raw值，消费max(20)、无500业务上限，读取上限200独立；尚未实施，原15属性余11仍待迁移。

## 当前安全与最终审查

主代理补验后核对项目Node/Python/Electron/Chromium进程及所属监听0；原B/S/API clean、client HEAD/branch/index保持，TEMP/Python/pnpm均D盘，diff检查通过、CJS Preload存在、Main/Core无source-only workspace外置、本轮测试markers未进构建、无新增C/C++/Rust/Java。未访问用户库/凭据/平台、安装工具或原应用，未提交推送。

最终独立审查已完整读取60路径、478939字节、6238行的累计未提交包与当前原始验证证据；主代理亲读正式报告 `.tmp/2026-10-06-browser-startup-whole-review.md`：Implementation-slice quality Approved / merge With fixes / ship No，无新增生产Critical/Important。当前两个Important就是上述UID循环body与pendingadd未达原断言；旧六startup本次执行缺口补齐，不宣称历史稳定性修复。审查之后仅补Markdown结论，生产/测试代码冻结，无新检查或重跑。

完整M01–M18、M06共享recycler/解析承载、M08/M09剩余业务与真人/原生/安装验收保持active/未完成。不标目标完成、暂停或阻塞；本波完成的是可独立审查的验证观察切片，不是全部业务。

最终2026-10-06 13:02:41 +08:00再核对：项目进程/所属监听0、原B/S/APIclean、client4c/分支/空index/60路径保持，D环境与diff检查通过。审查之后只有上述Markdown交接，不重新执行终态98674/7776；目标工具确认active/unbounded。

## 下一波候选（源核对完成，尚未实施）

主代理亲读 `.tmp/2026-10-06-current-uid-worker-audit.md` 并修正提案的观察效应/内容边界。两项完整清单作为一波后续任务：UID只被动包装原12轮await/断言，记录固定轮号/阶段/完成状态，不新增evaluate/RPC或UID/raw输出；Worker只考虑既有FirstReadProbe首次readline绑定方法获取的局部事件，不改已有首读、包内容、asyncio或导入顺序，不提前调用/预热线程。该lookup只能称“获取/准备”，不能称run_stdio进入、协程派发或线程提交；缺回调仍不是未发生证明。

实施前仍需精确透传、diagnosticFailure、有限输出与迟到停止的行为RED→GREEN及独立gate，保留5000/10000/25000/35000/1500等原预算、12输入及停止/SQLite断言。候选只是更细分边界，不称生产修复；没有新的helper/test/plan/fullcheck。完成的browser/first-read任务不重派。最近保留业务仍只是下一独立业务候选，当前两个验收缺口先处理。
