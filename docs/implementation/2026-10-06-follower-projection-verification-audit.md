# 粉丝趋势投影刷新与验证边界（2026-10-06）

后续检查点已推进到[首次Worker读取与目录保护](2026-10-06-worker-first-read-audit.md)：本文以下是此前冻结51项时的记录，不代表新一轮结果；该轮已实施有限首读探针和D预检，新的全量失败清单以新审计为准。

## 范围和当前结论

继续逐功能迁移原 B/S 业务。本轮只修粉丝列表无变化轮询反复触发趋势读取，并为此前四项完整检查失败补足边界证据；不新增业务、AI/Agent入口、服务或依赖。原仓库只读，客户端仍在 `codex/follower-monitor-actions`、HEAD `4c94959`，未提交/推送。

生产差异已由真实浏览器受控 RED→GREEN 证实；独立 task 复审 Spec compliant / Task quality Approved。冻结后的新完整检查退出1：Node2170/2171，仅首次Worker请求未到HTTP标记；类型/Python/构建单独补充通过。完整51项增量独立审查Implementation-slice quality Approved、merge With fixes、ship No，无新增生产Critical/Important，但该全量验证Important仍开放。定向通过不等于此前三项间歇失败修复，也不等于 M06、M09 或全量迁移完成。

## 原业务依据与本地映射

亲读原 `D:\codex_work\BiliMonitor\social-data-monitor\frontend\src\views\bilibili\BilibiliView.vue`：

- `470–501`：`loadUsers` 共用在途请求，成功后同步草稿、选择和展开详情、清理趋势缓存，再排历史读取；失败保留原数据及错误。
- `688–760`：趋势选择180ms合并、单请求在途、选择变化120ms补读；每次刷新清旧提示计时器，刷新最少700ms，完成/错误900ms。
- `560–620,1128–1135`：原自动tick每秒检查到期用户，只有实际尝试采集后才重读列表。不能把“查看列表成功”当作每次发生新采集；旧合成时间也不能证明原页面不会到期。

客户端平台采集仍由 Local Core 负责，Renderer 每2秒读本地投影。原实现把 Query `dataUpdatedAt` 作为历史触发器：成功读即更新该时间，即使 `items` 经过结构共享保持不变。Core 的列表 `snapshotAt` 每次读取都会变化，因此也不能用整个 DTO 引用作为内容变化信号。

现在 `useFollowerTrends` 接收共享契约的 `readonly BilibiliFollowerMonitorV2[] | undefined`：后台只有真实 `items` 变化才清理/排历史，尚未成功读取的 undefined 不触发，成功空数组仍清理。Workspace 用统一 `loadMonitors` 进行显式 `refetch({cancelRefetch:false})`，仅成功后主动排趋势，因此显式刷新相同数据也有效，失败不排历史。

添加、删除、间隔保存、暂停/恢复、立即刷新和页面刷新均保持原提交确认、共享读、草稿/选择清理顺序；不等待历史完成，不增加动作锁或乐观数据，不取消旧读/禁止旧卡片回流。180/120、700/900、最多4人、最近500点和精确 V2 值未改。

## 实现和定向验收

修改的生产文件只有 `BilibiliFollowerWorkspace.tsx` 与 `use-follower-trends.ts`。新增 `BilibiliFollowerProjectionPolling.interaction.test.ts` 使用真实 Connected组件、Query缓存及SVG；仅新suite在导航前安装/暂停时钟，原suite操作、预算和默认并发保持。

| 验证 | 结果 | 实际边界 |
| --- | --- | --- |
| 新受控回归 RED | 1失败、1通过，退出1 | 初次history/700–900提示已完成；推进2秒后台列表读取，history实得2而应为1，不是导航失败 |
| 最小生产 GREEN | 2通过，退出0 | 无变化后台读保持idle；显式同数据读排第2次；采集字段/最近快照变化排第3次；显式失败保图、不新增history |
| 8文件既有操作回归 | 103通过，退出0 | 原添加、间隔、手动刷新、状态、删除、趋势、Widget和真实Worker；无跳过，42.39s |
| 最后Worker回归 | 10通过，退出0 | 包含新增纯D盘路径安全测试；旧9项操作/assert保持，35.82s |
| Desktop web/node类型 | 通过 | 首次新probe写函数重载错误已修正，最终两个tsc通过 |
| 修改Pythonfixture格式 | Black1文件通过；isort终端退出0 | isort静默输出未产生Tee日志，不把不存在的文件作为证据 |

以上为第一检查点。独立审查发现测试取证拒绝/卡住可跳过页面关闭（Important），stderr上限只限制保存未终止旁路解析（Minor）；同一fix wave补了有界500ms提取、固定失败阶段和finally关闭、终端字节/阶段上限及全局停止标志。两条清理回归先RED再GREEN，过滤的13项不计通过；一项纯上限回归验证字节/10stderr阶段/全局40阶段及停止后不再计数/解析，过滤10项不计通过。

修补后最终8浏览器文件98项、Worker11项、Desktop web/node类型均通过；来自两条串行测试命令的109个唯一case，不写为一次109项整套运行。原操作/断言/预算不变；生产代码没有因审查再改。独立复审关闭两项，无本task剩余问题。主代理亲读日志、修改及原断言/精确V2和Worker停止消费路径，核对Cannot Verify；整个仓库检查仍待终态。

D盘日志在 `.tmp/2026-10-06-projection-{red,green,focused,worker-frozen,types-frozen,black-frozen}.log`，修补后在 `projection-review-{cleanup-red,cleanup-green,browser-final,worker-frozen,types-frozen}.log`；详细命令/终态由 `.tmp/2026-10-06-follower-projection-verification-report.md` 记录。isort没有持久正文日志，仅有实际终端退出0，不虚构文件。

## 三项未知失败的取证（不是生产修复）

1. Worker：真实 Python Source/NDJSON/spawn/stdin/stdout 只观察、不替代执行。固定阶段最多40；64KiB/8帧只做瞬时关联校验，不输出raw payload；仅允许的错误码和数值；Pythonfixture固定stderr最多10阶段，stdout仍为原协议。D盘创建前预检/严格后代清理有无文件操作的回归；退出/异常恢复observer和原函数身份。未预先ping、预热或新建HTTP服务。
2. 2000点：原阶段进一步分开tabindex计数、focus、End/Home及tooltip读取；测试专用longtask最多32条、固定focus/tooltip最多64条。不把 Node await 慢直接当成浏览器渲染慢。
3. 提示与导航：提示最多64条常量状态和列表settlement时序；Widget只记录固定HTML的browser/route/Vite入口、finish/close，导航100ms采样最多16条lag。未变goto2500ms、heading15000ms或旧hook预算/缓存策略。

定向Worker实际add marker写入Node1167ms/Python相对829ms，pending拒绝、真实子进程退出、清理exited=true；refresh对照也完成原停止/SQLite无迟到写入断言。这些是本次定向执行事实，不能解释此前完整压力条件下的marker缺失。

## 主代理整轮验收

- Task审查：独立复审Spec compliant / Quality Approved，Important和Minor修补闭环；主代理核对执行/全局/未改源码依赖，整个仓库验收仍单列。
- 冻结后一次新 `check.cmd`：终态退出1，D盘 `.tmp/2026-10-06-follower-projection-final-check.log`。Contracts475、Storage53、Task3、Browser12、Realtime46、Core937全部过，Desktop644过/1失败/645（55files）；合计Node2170/2171，无跳过。删除9项实际执行通过；旧2000点/700–900提示/Widget505本次通过，不证明容量/导航稳定性根因已修复。
- 失败仍为pending add的10000ms marker等待，实际Node10228ms结束。OS spawn248ms、stdin249ms已成功；Pythonfixture enter2557ms、httpx-ready/patch-ready5693ms，未记录replay/alive，pending仍unsettled/childAlive=true。cleanup11871ms已停Core但观察exited=false；该例没有执行到取消/SQLite无迟到写入断言。refresh对照第一次replay11412/result19430，随后第二次replay20980、退出断言执行通过。只能定位到fixture patch-ready→HTTP回调之间，不能称CPU或某import已证实根因。
- Node失败后类型/Black58/isort/mypy18/Python1016（2.65s）/Electron构建被原check截断；主代理单独顺序补全，`.tmp/2026-10-06-follower-projection-complement.log`逐步EXIT=0及COMPLEMENT_EXIT=0。没有重跑Node求绿；Main/Core/两Worker/CJS Preload/Renderer均生成。
- 检查捕获器在原check终态之后用不兼容Tee参数追加exit marker失败；原日志没有CHECK_EXIT，实际Node报错及shell终态仍为1，不以不存在的标记作证据。独立说明 `.tmp/2026-10-06-follower-projection-check-capture-note.md`；补充检查用支持的参数保留每步退出码，没有修改原日志或重复check。
- 全分支审查：完整读取378572字节/4939行/51项累计变更，slice Approved、merge With fixes、ship No；无新增生产Critical/Important。当前一个pendingadd整体验证Important、auto-target创建前D预检Minor保留，不把旧缺口豁免；不继续把本次已通过的三项写为当前失败。
- 安全核验：项目Node/Python/Electron/Chromium进程及所属监听0；TEMP/Python/pnpm均在D盘，Main/Core无外置源workspace包、CJS Preload存在，指定生产消费文件本轮测试marker0；diff和新增尾空白通过。原B/S `fa2faa6`、API参考 `271b123` clean，客户端HEAD4c/分支/空index保持，51项改动含原45项增量保留。没有新C/C++/Rust/Java源码、提交推送、工具安装、实际用户库/凭据操作或启动原B/S。完整审查后于2026-10-06 12:20:33 +08:00再次刷新进程/监听、源/API clean、HEAD/分支/index、51路径和空白检查，均保持；审查后仅追加Markdown结论，生产/测试代码未改。

## 下一次定位边界（只读审计，未实施）

主代理已亲读新的Worker入口审计：Node write完成不能证明Python实际读到首行；原runtime模块级依赖/声明→main→asyncio.run→to_thread(stdin.readline)之间没有观测。refresh的新child在Python自身patch→replay跨度7218ms，也不能推导被提前清理的add未来必定会发生什么。当前stderr/global cap未到上限，已记录的缺失事件不是容量截断；cleanup exited=false仅为当时尚未观察到exit，不是持续孤儿或marker根因，检查后当前实际项目进程0。

下一最小候选只在既有test fixture为第一次真实stdin.readline增加进入及返回/EOF/异常的最多两条安全阶段，全部参数/返回/异常和其他stdin属性透传；不主动readline、import runtime、ping/预热、增预算/并发或生产hook。不输出/复制协议行，保留现有10stderr/40global上限。它只区分首次read前、read内和read后，不能直接证明某import或CPU根因。目前只是审计建议，没有代码或验证，后续须独立受控回归/审查后再运行一次有假设的完整检查。

完整审查的全部待修清单已保留为下一轮单次fix wave：上述Worker入口/退出验证Important，加 `bilibili-danmaku-auto-targets.integration.test.ts:42` 创建前绝对D盘TEMP检查和严格后代清理/纯路径回归Minor。不能把实现probe等同关闭Worker验证；最终仍须实际执行原pendingadd stop/exit/SQLite断言。当前已完成的projection/task不重新派发，旧终态check/complement不再poll或重复。

## 剩余范围

原15项弹幕属性余11、最近弹幕保留配置（原min20/无上限，当前1..500）仍未实现；M06共享recycler执行域及完整解析/承载等保留；M08、M09–M18、真人/原生/安装包验收均未整体完成。当前优先关闭或明确定位整体验证缺口，再接下一独立业务，不重跑整套碰运气。

总范围见[全量台账](2026-09-13-full-migration-tracker.md)，恢复步骤见[交接](2026-09-13-migration-handoff.md)，本轮执行核对见[计划](../superpowers/plans/2026-10-06-follower-projection-verification.md)。
