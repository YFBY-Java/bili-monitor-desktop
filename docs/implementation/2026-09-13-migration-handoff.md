# 迁移进度与停止交接（2026-09-13）

## 最新交接（2026-10-06，本地提交快照；业务迁移保持暂停）

按用户“提交一下代码，记录当前状态和进度”保存自`b2e5a89`以来的累计迁移源码、测试、配置示例与文档；本次仅本地提交，不推送、不恢复开发，也不进入下一业务。完整范围、未完成项及本轮验证见[提交快照](2026-10-06-commit-snapshot.md)；本提交哈希以`git log -1`为准，历史记录里的旧HEAD/未提交状态保留为当时证据。

- 00:10–00:14 +08:00重新运行`check.cmd`：Node2046/2047通过，Desktop596/597；唯一失败为旧粉丝趋势2000点键盘交互5s超时，完整检查退出1。最新手动刷新17项与Core875项全部通过；旧Worker启动等待本轮通过，不据此宣称稳定性根因已修复。
- Node失败后单独补跑全部TypeScript、Black57/isort/mypy18、Python1003（2.72s）、Electron生产构建，均通过；D盘日志见快照。未修改业务、旧测试操作、超时预算或并发以追求绿色。
- 两项独立只读核验确认进度分类与候选文件安全；修正文档残留的active/下一refreshUser和手动刷新“采集中”说明。候选不包含真实凭据、浏览器Profile、数据库、缓存或生成二进制；原B/S和API参考仍clean，只读。

## 功能交接（2026-10-06，粉丝“立即刷新”；本项后按用户要求暂停）

当前功能实现及定向验收完成，**完整check.cmd尚未全绿**；用户要求本项跑完先停，不进入下一业务。M06和M01–M18仍未完成，全量迁移已按用户要求暂停；本次提交不恢复迁移。详见[手动刷新审计](2026-10-05-follower-manual-refresh-audit.md)和[执行核对表](../superpowers/plans/2026-10-05-follower-manual-refresh.md)。

- 对照原Vue refreshUser/loadUsers/UserActions及Controller/Service/Repository/API Client逐段迁移：失败不重读；成功只等待共享list，list失败仍确认“已刷新”、不等history；同步dirty草稿/选择；无手动busy/autoCollecting或重复点击锁，无乐观投影/freshness/迟到保护。
- Core成功next及relation回退profile取请求开始user；collect-only SQL保留后来interval/status。在途删除成功为本地内部落库失败、不复活，开始missing仍NOT_FOUND；平台失败退避/旧measurement和history/恢复清三错误、退出取消与Long64保持。独立复审补4项RED后关闭新queryFn清错造成的generic失败提示丢失和read/write最后写入不互斥；这是必要交叉修补，不称状态/删除全部验收完成。
- 新17条真实浏览器与9条真实V2/Core/SQLite回归，逐项RED→GREEN；新旧定向78/78及Core19/19通过。前后两位独立只读复审均无未闭Critical/Important/Minor；用户已确认的精确UID和既有添加/间隔功能保持。
- 两轮完整check均退出1，日志保留D盘`.tmp/2026-10-05-follower-manual-refresh-{check,final-check}.log`。第二轮Node **2045/2047**、Desktop595/597，新17全部通过；仍失败的旧2000点图表键盘5s、Worker add开始标记10s等待在原预算五suite定向46/46中通过，但全量压力下仍超时，**未修复根因、不调整预算/并发/真实操作或图表**。首轮另有Live初始化和Subject/TabRail清理超时，详见审计。
- 继续完成被Node失败中断的其余检查：全部TypeScript、Black57/isort/mypy18、Python **1003**、Main/Core/Worker/CJS Preload/Renderer生产构建通过，日志为同目录`remaining-checks.log`、`python-checks.log`（均带本项日期前缀）；这些单独通过不冒充check退出0。
- 00:03:36 +08:00安全核验：项目进程/监听0，生产本项fixture0，Main/Core无外置源workspace包、CJS Preload存在，diff/新增尾空白/index/CLAUDE通过。原B/S`fa2faa6`与API`271b123`只读clean，客户端HEAD仍`b2e5a89`，240项含151新增全部保留，新产物D盘；未提交推送/安装工具/访问平台凭据或用户库、未启动原B/S或安装应用。
- 恢复时先处理/重验全量测试稳定性，再继续原toggleUser/removeUser逐操作核对；M06默认recycler/完整解析编码/HTTP承载/NDJSON最终帧/配置来源候选及M08、M09–M18不缩减，真人/原生/安装验收继续单列。本轮没有执行下一项。

## 历史交接（2026-10-05，粉丝采集间隔输入与保存）

本项实现及完整自动检查通过，M06和M01–M18全量迁移仍active，不标整个模块或目标完成。详见[间隔保存审计](2026-10-05-follower-interval-audit.md)和[执行核对表](../superpowers/plans/2026-10-05-follower-interval.md)。

- 按原Vue470–504/530–546/929–978与实际ElementPlus2.14.1核对：整数夹取/动态相对step、focused raw缓存/native change、显式逐用户dirty、返回值commit清dirty→共享list→独立成功确认。接受旧在途读，成功读先同步；PATCH失败不读，list失败仍成功，文案捕获提交值。saving至读结束且不锁输入/其他actions、不等趋势，不加freshness/晚草稿保护/业务锁。
- Query仍拥有业务数据/error，保存开始清旧读error的UI可见性；后续新读失败照常显示。按原controls=false隐藏该input的native spinner，不改添加表单或主题。用户确认的精确UID策略和上一添加成功链保持。
- 新15条真实浏览器回归：初13条旧实现失败后修复，复审鼠标/旧读错误两条分别RED→GREEN。新19条纯draft规则和4条真实Core/SQLite V2 settings仅补覆盖；后台生产无改。独立最终只读复查无未闭Critical/Important；纯handler溢出差异经实际native input carrier证实测试输入不可达，不猜测性改生产。
- 首轮完整check退出1：Node2020过/旧2000点容量1超时，Desktop579/580、新15全过。setup已ready，body集中focus/键盘阶段，原5s隔离用例通过；不增预算、不降并发、不动图表。第二轮冻结正常完整check退出0：**Node2021/Python1003**，Desktop49文件580项、全部类型/Black57/isort/mypy18/Main、Core、Worker、CJS Preload与Renderer生产构建、D盘通过。两份日志保留在D盘`.tmp`；旧容量/初始化稳定性风险未宣称修复。
- 2026-10-05 23:35:42 +08:00最终安全：项目进程/监听0、生产本轮fixture0、diff/新增尾空白/CLAUDE通过；原B/S`fa2faa6`/API`271b123`只读clean，客户端仍`b2e5a89`/空index，234项含147新增全部保留。未提交推送/安装工具/平台凭据或用户库访问、未启动原B/S或更新安装应用，新产物D盘。
- 下一独立业务核对原`refreshUser:548–558`：失败是否重读、共享旧list/成功提示与手动busy。当前generic action finally不等于原规则，本轮不跨入实现。默认recycler/完整解析编码/HTTP承载/NDJSON最终帧/配置来源等M06待办，以及M08、M09–M18全部继续保留；真人/原生/安装包验收单列。

## 历史交接（2026-10-05，粉丝添加成功链自动检查收尾）

本项功能实现及完整自动检查通过，M01–M18全量迁移仍active，不标M06或完整迁移完成。

- 沿用用户确认的精确UID规则，以及原添加commit清UID/保留间隔、共享旧list读后prune/raw去重/<4补选、raw趋势/独立成功确认和抽屉归属；本次只做验收诊断，生产SHA仍`F650FEB6…`，不跨入新业务。
- 五个旧suite增加失败setup阶段/Request资源及迟到创建观测，各列表最多100、pathname最多256，不含query/凭据；原测试体、预算、并发和业务保持。三个Live已有独立cache，不能统一归因共享cache；Vitest超时不取消内部Promise及迟到赋值风险已用源码/carrier核验，但未证明本轮真实浏览器级联。
- 第五次完整检查通过后，补审发现三Live诊断改用了局部setupPage操作，改变超时交错路径；三文件receiver guard先RED（3违规）再恢复原page引用/参数GREEN（0违规），独立复查关闭Important。恢复后再次冻结，第六次完整`check.cmd`退出0：**Node1983/Python1003**，Desktop47文件546项及新15项全过，全部TS/Black57/isort/mypy18/Main、Core、Worker、CJS Preload和Renderer生产构建通过。最终日志`.tmp/2026-10-05-add-flow-final-check.log`仅D盘，第五次日志也保留；没有平台/原生/安装包验收。
- 这次旧页面初始化和容量用例均未失败，没有迟到告警；不能将GREEN写为旧间歇性超时根因已查明或已修复。前四轮失败及Worker标记/取消生命周期/容量性能诊断待办保留，见[审计收尾](2026-10-05-follower-add-flow-audit.md)。
- 下一项按原Vue `saveInterval:530–546`逐段核对clamp、返回间隔、dirty草稿、写入失败与共享重读/成功通知；当前通用action finally重读不等于原规则。本轮未实现下一项；M06其它解析/执行/编码和M08、M09–M18继续保留。
- 2026-10-05 23:03:36 +08:00安全核验：项目进程/监听0、生产本轮fixture/诊断0、diff通过、`CLAUDE.md`正确；原B/S/API clean且只读，客户端HEAD`b2e5a89`、index空、226项增量含140新增全部保留。未提交推送/安装工具/访问平台或用户库/更新安装客户端/修改或启动原B/S，新产物D盘。

## 历史交接（2026-10-05，粉丝添加成功链第四次检查）

全量迁移继续，M01–M18不缩减。最新M06只接原添加成功后的列表同步、raw趋势选择和抽屉草稿/归属；不是整个粉丝模块或原生平台验收完成。详见[本轮审计](2026-10-05-follower-add-flow-audit.md)与[执行计划](../superpowers/plans/2026-10-05-follower-add-flow.md)。

- 按原Vue470–527/688–735及Service/Repository逐段核对：写入commit时清UID/保留间隔→复用在途list、单次读取→成功读先prune、之后raw去重/<4补选→raw趋势请求→独立成功确认。读失败不回滚/重试add，趋势未完成也不挡成功；旧读不保证fresh，不新增全局串行/tombstone/Core取消。
- 草稿由持续挂载的workspace持有，旧抽屉A迟到成败不能关闭/清空或污染新B。提交清UID后列表pending期间输入下一UID不会被completion再次清掉；精确UID沿用上一项用户确认策略。
- 新增15项真实React/Query/Chromium回归，初12项9失败/3过，成功通知第13项、二次清UID第14项和fixture计数泄漏第15项均先RED再修；raw初始在途读明确锁为1call。独立生产真实回调7/7、最终测试修补复审均无未关闭Critical/Important/Minor；仅窄化bridge合成，不冒充完整backend upsert或原生采集验收。
- 四轮fullcheck未通过的启动/容量超时全部保留。已定位新suite依赖资源未就绪就进入业务计时，补独立cache、原启动预算内真实readyPage、有限无敏感阶段日志；原预算/并发未改。最后第四次完整check退出1：Node1978通过/5失败（1983总数），Desktop541/546，新15项全过，五个旧页面beforeEach超10s；本轮不是容量body失败。当前**实现及定向通过，完整验收未完成**，不把单次整套Desktop全过写为最终验收。
- 单独全TS/Black57/isort/mypy18/Python1003均通过；最终`pnpm build`退出0，最新Main/Worker/Core/Preload/Renderer生产构建和web/node类型检查通过。没有安装包/原生/平台验收。
- 下一步先定位既有初始化/导航及容量超时的实际边界，不盲目重跑；本项全套验收收尾前不启动下一业务。收尾后下一独立交互核对原saveInterval530–546的clamp、返回间隔/dirty草稿、失败与共享重读/成功提示；其它M06解析/运行时/编码及M08、M09–M18全部保留。
- 原B/S `fa2faa6` 与历史API参考 `271b123` 再确认clean/只读，客户端HEAD仍`b2e5a89`、index空，225项增量含140个新增文件全部保留。2026-10-05 22:38:01 +08:00项目进程/相关监听0、生产本轮fixture0、diff/新增文本尾空白通过、`CLAUDE.md`正确。没有提交/推送、安装工具、打开用户运行库/凭据、启动原B/S或更新安装客户端；新产物D盘。完整目标仍active，不标暂停/完成/blocked。

## 历史交接（2026-10-05，粉丝 UID 文本输入）

全量迁移继续，M01–M18不缩减。本轮只接粉丝添加表单UID输入，不把已发现的整个添加流程算作已修复。

- 先读原页面/Controller/DTO和历史card参考，原安装Axios转换及 compiled Jackson/Spring内存核验区分原文本、舍入Number、实际JSON token和HTTP绑定。用户明确选择保留精确UID、兼容整数写法、拒绝真正小数和Long越界；未默默恢复原舍入缺陷。见[UID输入审计](2026-10-05-follower-uid-input-audit.md)及[HTTP只读核验](2026-10-05-follower-http-binding-audit.md)。
- 纯renderer helper处理ECMAScript空白/前导零/正号、decimal/scientific/unsigned radix，输出既有canonical v2 Long；UID不经Number，指数有安全界限，BigInt/补零有界。表单统一校验，失败保留原文本和间隔，可精确重试；旧添加错误不再遮新UID校验。
- 新增Node161：helper158和实际浏览器3；先RED再实现，提示优先级再RED修复。独立复审发现尾零regex平方回溯，再以50KB1365.6ms的RED回归改线性扫描；158项GREEN，2672精确oracle零差异，5000padding保留，反例降至0.026/0.034ms。复验本轮无未关闭Critical/Important。
- 性能修复前完整check退出0（Node1967/Python1003），不作为最终验收；冻结后第二轮完整check退出0：**Node1968/Python1003**，全部类型/格式/mypy/Electron生产构建及D盘检查通过。原生Electron/平台/安装包验收未执行，本轮不提交推送，不打开用户运行库/凭据，不改或启动原B/S；所有新文件/产物D盘。
- 下一独立项：原添加成功后的清空→重读/清理→4人上限→自动选择→趋势请求，以及读失败仍成功、间隔草稿保留和抽屉迟到mutation归属。先扩fixture捕获真正新增用户/旧list快照/独立请求延迟做RED，再实现；不得把成功add后的读失败回滚或自动重试add。
- 原HTTP raw body/path/query完整承载表面已核验但不是typedIPC已实现一比一HTTP兼容；其它M06解析/运行时/数据库编码及M08、M09–M18仍保留。2026-10-05 21:47:55 +08:00最终核验：项目进程残留/监听0、production本轮fixture0、diff/新增文本尾空白0，`CLAUDE.md`正确；原库和历史API参考clean，客户端`b2e5a89`/空index保持，222项增量（含137个新文件）全部保留。

## 历史交接（2026-10-05，粉丝 Long64 精确计数全链）

完整迁移继续进行，M01–M18不缩减；本节是已验证切片的检查点，不是停止、整模块或全量完成声明。

- 本轮M06原signed64解析/计数贯通Python→NDJSON→Core→SQLite v14→Main/Preload→粉丝及工作台UI；按原语义处理响应MID与监控身份、同秒快照、relation资料回退、Java回绕差分/Double增长率及Subject24h最新2000基线。生产走v2 canonical字符串，v1仅显式safe投影，不静默舍入、不把兼容错误写成平台失败。详见[Long64审计](2026-10-05-follower-long64-audit.md)。
- v14仅移除多加的四个粉丝计数非负CHECK，BigInt读写精确；保留正监控/绑定MID、rowid、记录身份、索引、跨表trigger/view/FK及原PRAGMA设置，失败原子回滚，重开幂等。Main补最终帧关联与无效错误保护；Worker最终帧ID-only边界仍待独立核对。
- 实际合成HTTP/生产parser/CAS/stdio、真实Core/SQLite、typed Preload和浏览器交互均有回归；Core stop证明真实子进程强制终止及数据库无新增写入，parent-pipe取消另行证明。不将模拟Controller carrier或typed Preload写为原生Electron/安装客户端验收。
- 首两次完整检查分别发现调度spy/历史数据准备和Desktop测试隔离/导航问题，全部先复现/测量再修补，未改生产业务来迎合测试、未加超时或降低并发。桥接fixture原先进入默认LiveWorker请求链，HTTP完成证据未保留，不能写平台零请求或实网验收；已显式注入合成无房间source，其他测试外链头像也限定本地同源。
- 最终全部代码/测试冻结后第三次完整`check.cmd`退出0：**Node1807/Python1003**，TS/mypy/Black/isort/Electron生产构建/D盘检查通过。限定实现/测试修补独立复审无新未关闭Critical/Important；本轮生产fixture标记0、项目进程残留/监听0，diff和新增尾空白通过。
- 原B/S仍`fa2faa6`且clean、只读未启动；历史API参考`271b123`且clean；客户端HEAD仍`b2e5a89`、index空，全部既有与本轮增量保留。未提交/推送、安装工具、制作安装包或重启安装应用，未访问凭据/用户运行库，所有新产物D盘。
- 下一独立业务先核对原`BilibiliView.vue`的MID文本正规化和HTTP Long DTO绑定；精确请求不能退回unsafe Number舍入。默认recycler/跨模块缓存、其它JVM Unicode、完整charset/MIME异常/API日志链、Double文本/负零wire/数字message/failureMeta、PG-SQLite/NUL/TEXT编码、完整属性源/JVM/cache/冲突/indexed继续保留；随后M08及M09–M18逐操作迁移，真人/原生/安装包验收单列。

## 历史交接（2026-10-05，粉丝 JSON 响应与失败链路）

完整迁移继续进行，M01–M18范围不缩减；此处只记录已验证切片的检查点，不是停止或完整完成声明。

- 本轮M06补首JSON值/合法根UNKNOWN、非法格式与读取约束PARSE、重复字段及普通HTTP空体/UTF8/Latin1。真实Python→NDJSON→Core→SQLite验证原分类/回退、既有资料/历史/CAS保留和成功同秒upsert。见[本轮审计](2026-10-05-follower-json-response-audit.md)。
- 独立复审发现合法孤立surrogate使Worker退出、临时profile被Rust长度校验拒绝；实际同循环两请求及真实同进程第三次请求均先RED再修复。统一ASCII出口用于业务与heartbeat，保留别名/关联/日期/JSON serializer/非有限数→null；StrictStr与Python非空/Java blank校验保持。已观察Java20的两处identifier先RED再修，BMP全域核验0差异，不宣称Java17或数据库无损UTF16。
- 新增Node26/Python170；最终补丁冻结后完整`check.cmd`退出0：**Node1531/Python714**，类型/格式/Electron生产构建/D盘检查通过。限定实现子域最终复审无新Critical/Important；默认共享recycler Important仍未关闭，不能写全接受域完成。生产本轮fixture0、项目Node/Python/Electron残留0，diff与新增尾空白通过。
- 原B/S仍`fa2faa6`且clean、只读未启动；历史API参考`271b123`且clean。客户端HEAD仍`b2e5a89`、暂存区空，既有和本轮增量全部保留。未提交/推送、安装工具、制作安装包或重启安装应用；不访问平台/凭据/用户运行库，所有新产物D盘。
- 后续仍须完成M06默认recycler执行通道与交叉模块缓存、其它JVM Unicode基线、完整charset/MIME内部异常/API日志链，再Long64精确契约/SQLite迁移/溢出与消费者全链、Double/数字message/日志failureMeta及PG-SQLite/NUL/TEXT编码；完整属性源/JVM/cache/冲突/indexed域也保留。Long64不能用safe53bit限制代替原Long域。随后按台账M08和M09–M18逐操作推进，真人/原生/安装包验收单列。

## 历史交接（2026-10-05，普通粉丝资料文本）

全量迁移继续进行，M01–M18范围不缩减、不暂停；本节是已验证切片的检查点，不是完整迁移完成声明。

- 本轮续接M06原粉丝普通资料语义：保留昵称/头像非Java-blank原文，bool/int及container/null按原parser处理；临时profile与VARCHAR(160)持久化域分开，Unicode字符计数及超ASCII空格规则在事务内保护。正常card更新或清头像，relation保留已有三个资料字段；真实Python→NDJSON→Core→SQLite与重开库有回归。见[资料文本审计](2026-10-05-follower-profile-text-audit.md)。
- 卡片/详情/已有用户工作台共享安全头像显示投影，仅对白名单CDN HTTP升级HTTPS，原字段和生产CSP不改写。独立复审发现的HTTP被CSP拦截、Subject先写成功后读取被旧契约拒绝均已先RED再修复；工作台创建/get/list/聚合/重启回归通过，手工输入和直播字段限制未扩大。不把此依赖兼容项当M14工作台全量完成。
- 本轮新增Node93/Python39；最终重新跑完整`check.cmd`退出0：**Node1505/Python544**，类型/格式/Electron生产构建/D盘检查通过。独立最终复审Critical/未关闭Important均0；生产本轮fixture标记0、项目运行进程残留0、diff check与新文件尾空白检查通过。
- 原B/S仍`fa2faa6`且clean，只读、未启动；历史API参考`271b123`且clean。客户端HEAD仍`b2e5a89`、暂存区空，所有既有和本轮增量保留。未提交/推送、制作安装包或重启已安装客户端，未访问真实平台/凭据/用户运行库，所有工具/缓存/测试/产物继续D盘。
- 下一项继续M06 Double文本/Long64/rootJSON/数字message与API日志failureMeta；完整属性源/JVM/cache/冲突/indexed边界、NUL/编码/孤立surrogate数据库域和弹幕Java trim边界仍保留。随后M08及M09–M18逐操作核对；真实平台、系统密钥/剪贴板、原生保存和安装包验收不能由本轮合成回归代替。

## 历史交接（2026-10-05，配置占位符）

完整迁移仍进行中，M01–M18不缩减，不沿用历史暂停指令。

- 续接M06已有16字段的嵌套placeholder、局部env/JSON/YAML来源及Binder/Condition/Scheduled消费；default急切、循环/未解析两种模式、条件不短路、Java-only初值不冒充source。未新增页面、业务或配置文件类型，JSON类型/HTTP限制不放宽，Worker仍只用现有typed契约。见[本轮审计](2026-10-05-follower-placeholders-audit.md)。
- 新增Node183份repo回归（helper53、来源57、loader65、实际Core6、Host2），先RED后实现。真实Core/SQLite/Host/固定Python HTTP验证自动与暂停、手工采集、8类禁用、间隔/HTTP配置、开库前错误及修正后文件/历史不变。收尾3类bracket来源误映射先RED后修；再次完整`check.cmd`退出0：**Node1412/Python505**，类型/格式/Electron生产构建/D盘检查通过。独立最终复审无可行动问题，生产fixture标记0/项目残留0。
- 原B/S仍`fa2faa6`且clean，只读、不启动；客户端HEAD`b2e5a89`、暂存区空、所有既有和本轮增量保留。没有提交/推送、打包/安装应用重启或真实平台/用户库/凭据访问，所有产物仍D盘。
- **不是完整SpringEnvironment兼容。** 任意跨模块来源、JVM systemProperties、Default mapper cache顺序效应、同层多等价enumerable冲突及完整indexed/query语法仍在全量目标，不能因本轮绿色回归排除。已补三类scalar/indexed来源边界，不统一拒绝bracket。
- 下一项继续M06正常资料字符串（原optionalText/requiredText，不trim返回值）→Long64/rootJSON/数字message→API日志failureMeta，再M08及M09–M18；配置完整来源边界也仍需核对。真人/原生/安装包验收单列；本轮仅完成已审计的bounded配置切片，整模块与全量迁移未完成。

## 历史交接（2026-10-05，配置literal绑定）

完整迁移继续进行，M01–M18不缩减、不暂停。

- 续接M06原16字段的literal环境绑定、存储原文条件与raw fixedDelay启动校验，未新增业务或配置入口。enabled八种别名、empty primitive失败、普通int的Java空白/hex/Unicode/int32、停用条件下合法非正delay等均按原Spring3.3.6/6.1.15核验；详见[本轮审计](2026-10-05-follower-binding-audit.md)。
- 新增189份repo回归（Node180/Python9），含159绑定、11真实Core/SQLite、1隔离Host、9份golden分别供TS/Python校验。先RED后实现；实际验证yes自动扫描与暂停、false/off手工仍可采集、配置间隔落库、无效delay开库前失败、修正后历史不变。最终完整`check.cmd`退出0：**Node1229/Python505**，类型/格式/Electron生产构建/D盘检查通过；独立literal审查与差分通过，生产fixture标记0、项目残留进程0。
- 原库仍`fa2faa6`且clean，只读未启动；客户端HEAD`b2e5a89`、暂存区空、全部增量保留。未提交推送/安装包制作/已安装应用重启/真实平台或用户库凭据访问，所有产物仍D盘。
- 审查发现原Spring对环境值内嵌`${NAME:default}`的解析仍需专门对齐，不宣称literal转换等于完整Spring绑定；此差异保留在全量目标，不视为新业务排除。下一项先继续placeholder，随后M06完整profile/Long64/rootJSON/数字message/API日志failureMeta，再M08/M09–M18。
- 本轮已验证的是literal转换与启停消费子项，整模块及全量迁移均未完成；真人平台、原生密钥/保存/安装包验收仍单列。

## 历史交接（2026-10-05，错误响应）

用户再次明确要求继续，按原 Web 业务逐功能迁移；不沿用9月26日的暂停指令，**全量迁移仍为进行中，M01–M18范围不缩减**。

- 本轮切片是M06粉丝card/relation错误响应，不扩展臆造业务。已对照原API Client/RetryPolicy/回退规则修正返回码转换、UNKNOWN分类、非空白错误消息保留；实际Python→NDJSON→Core→SQLite验证普通API/认证/403不重试不回退、历史保留、503重试后relation成功。
- 新120项Python参数回归和5项实际Core集成，复核两项边界均先RED再修复：`+`剥离后的Double空白转换、超过4300位的前导零；不关闭Python安全保护。定向Python134、Core20通过；冻结后第二轮完整`check.cmd`退出0：**Node1049/Python496**，类型/格式/Electron生产构建/D盘检查通过。独立复审无未关闭的重要问题，生产无本轮fixture标记，项目Node/Python/Electron进程0。最终证据见[本轮审计](2026-10-05-follower-error-response-audit.md)。
- 保留先前和本轮所有未提交增量；客户端HEAD仍`b2e5a89`，暂存区空，原B/S仍`fa2faa6`且干净，只读、未启动。所有工具、缓存、测试数据和产物在D盘，无真实平台调用/用户凭据或运行库访问，无提交、推送、安装包制作或已安装客户端重启。
- 下一项先对齐已有粉丝环境配置的原绑定语义（storage条件与enabled布尔转换分开、普通整数规则、调度原始字符串另核对），再继续M06完整昵称/头像/Long64及API日志failureMeta、M08完整直播响应/共享输出域，随后逐项推进M09–M18。真实平台、原生、安装包验收仍单列；不把本切片当作粉丝模块或全量迁移完成。
- 本切片实现与自动验证完成；全量目标仍进行中，继续按台账推进，不标为完成或暂停。

## 历史交接（2026-09-26，共享限流）

用户最新要求：**跑完当前功能就先结束**。本轮仅收尾[共享限流与API耗时迁移](2026-09-26-shared-rate-limit-audit.md)，不启动下一项；全量迁移尚未完成。

- 粉丝、直播REST、榜单共用本地许可器，按原键限流，等待互斥、HTTP锁外；实际唤醒重计、0间隔绕过、256申请背压及服务级取消已实现。
- API总耗时包含排队/限流，单调时钟向下取整，不含日志写入和重试退避。复核发现的日志写入异常误触发榜单fallback/粉丝失败退避，已先RED后通过Source错误类型隔离修复。
- 最终完整 `check.cmd` 退出0：**Node1044、Python376**；类型、Python格式、Electron生产构建、D盘检查通过。新两文件29项包含在总数内。独立复审无遗留Critical/Important/Minor；空白/生产测试标记检查通过，项目Node/Python/Electron残留0。
- 客户端仍`b2e5a89`，main领先origin/main19，暂存区空，保留既有Rank/弹幕HTTP/直播存储/粉丝配置和本次未提交修改。未提交、推送、打包、重启安装应用或访问真实用户库/凭据。原B/S仍`fa2faa6`且干净，只读、未启动或修改；所有工具/数据/产物在D盘。
- **当前功能已完成，按用户要求暂停在这里，不自动开始下一项。**
- 待用户再次要求继续，先复核两仓库状态并保留增量，从M06/M08完整解析/配置绑定输入域继续，再按[全量台账](2026-09-13-full-migration-tracker.md)逐项推进M09–M18。真实平台、原生和安装包验收不能由本轮合成回归代替。

## 历史交接（2026-09-26，粉丝配置）

用户要求“继续”后，本轮完成[粉丝16项启动配置、独立昵称查询和HTTP生命周期](2026-09-26-follower-configuration-audit.md)，在当前子项收尾，不启动下一项；**全量迁移仍未完成**。

- 已接文件/环境配置、粉丝自动与存储开关、工作台双存储依赖、原间隔/批量/重试/失败退避、fixedDelay。关闭再启用保留监控状态、排程、趋势和绑定。
- HTTP四字段贯穿实际Core/Python；card/relation/profile明确保活、取消和迟到结果保护。直播昵称不依赖粉丝存储，不经过粉丝重试/API日志。审查发现的无引用CAS已RED后修复：独立profile仅返回UID/昵称、不落盘，正常采集仍保存证据。
- 最终完整 `check.cmd` 退出0：**Node1015、Python376**；类型、格式、Electron生产构建和D盘检查通过。独立复核无剩余重要问题，生产无本片测试标记，结束后项目Node/Python/Electron进程0。
- 客户端HEAD仍 `b2e5a89`，main较origin/main领先19；Rank/弹幕HTTP/直播存储/本片增量均未提交，暂存区空。原B/S仍 `fa2faa6` 且干净，只读、未启动。未推送、打包、重启安装应用或使用真实用户库/平台凭据。
- 使用说明见[粉丝启动配置](../development.md#粉丝监控启动配置)，示例 `config/bilibili-follower-collection.example.json`；放到实际D盘数据目录的config下才生效，示例不会自动覆盖用户运行配置。
- 下次先核对两仓库状态并保留增量，再从M06/M08共享并发限流/API耗时定义继续，随后完整数值/字符串/URL/时间解析和Spring绑定输入域；M09–M18及真人/原生验收全部保留。不要把本次16字段接入当作整模块或全量完成。

以下是历史交接；其中“下一项”仅代表当时状态，以本节和全量台账为准。

## 历史交接（2026-09-25）

用户要求“继续”后，已在原未提交 Rank 增量上完成[弹幕HTTP配置与取消](2026-09-25-danmaku-http-audit.md)、[直播存储开关与工作台依赖](2026-09-25-live-storage-audit.md)。本轮在当前功能收尾，不启动下一项；全量迁移尚未完成。

- 最终 `check.cmd` 退出0：Node893、Python308；类型、格式、Electron生产构建、D盘约束通过。独立复核无剩余Critical/Important，宿主环境影响测试的Minor已复现并修正。
- `storageEnabled=false` 关闭直播持久化业务，工作台必须显式一并关闭；不是继续采集但不保存。关闭不会清数据或消耗导出编号，重新启用后继续读取。详见[配置用法](../development.md#直播与用户工作台启动配置)。
- 客户端HEAD仍`b2e5a89`，Rank/弹幕HTTP/存储开关增量全部未提交，暂存区为空。原B/S仍`fa2faa6`且干净，未启动或修改；未打包或重启已安装客户端。工具、临时数据、产物均在D盘，检查结束后项目Node/Python残留0。
- 没有使用用户数据库或真实平台凭据。首轮工作台测试漏注入源而触发过公开UID9资料请求，随后修正测试隔离；具体经过记录在存储审计，不将其作为真人平台验收。
- 下次先复核工作区、原B/S基线和[全量台账](2026-09-13-full-migration-tracker.md)，保留未提交增量。下一独立项是M06原粉丝storage-enabled/enabled及完整配置和工作台依赖；随后继续M08数值/时间/URL等完整解析、Spring绑定、严格并发限流/API耗时，再按M09–M18推进。
- 不自动提交/推送，不修改或启动原B/S，不访问真实凭据/数据库做验收。历史绿色测试不代表真人或原生安装包验证完成。

以下为9月13日历史记录；其中的“当前功能”和“下一项”仅表示当时状态，不能覆盖上面的最新交接。

## 9月13日历史停止位置

用户要求：**完成当前功能后结束，记录进度和完成情况。** 当前功能是“榜单 HTTP 配置与长请求/退出处理”。本轮收尾后不继续下一项；后续需用户再次要求继续。

- 客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`。
- 原 B/S：`D:\codex_work\BiliMonitor`，当前参考基线 `fa2faa6`。原项目只读，未启动或修改。
- 最近一次已提交代码：`b2e5a89`，直播采集策略和 REST HTTP/保活，位于本地 main；未推送。
- 本轮榜单增量保留在工作区，**尚未提交/推送**。不要丢弃或重新实现这批改动。
- 所有工具、缓存、构建和测试数据继续在 D 盘；未使用真实用户数据库或平台凭据。

## 已完成到哪里

详细逐项原源码、实现位置和边界以 [全量迁移台账](2026-09-13-full-migration-tracker.md) 为准，以下是停止时摘要，不是新的缩小范围。

| 项目 | 当前情况 |
| --- | --- |
| M01–M04 | Gift V2 事件适配、场次边界专项、最近 200 场查询、导出文件名/每日编号已实现并有自动回归；不代表弹幕、场次、导出整模块或实机全验收完成 |
| M05 | 直播详情与用户工作台共用弹幕/观众/大航海组件及交互回归已完成；深层采集仍在 M09/M10 |
| M06 | 粉丝监控逐操作代码/自动闭环审计已完成；真人/原生安装验收仍在 M18 |
| M07 | 登录 UI/凭据存储、撤销切号、登录与弹幕联动已复审；真人扫码、系统密钥/剪贴板等未完成 |
| M08 | 直播查询、采集、调度/退出、监控区/趋势/汇总/事件和 16 项本地配置已有实现与回归；共享 HTTP 配置已进入 REST 与 Rank/WBI，仍未完成全模块 |
| 当前功能 | 榜单三端点与其 WBI 配置贯穿、Referer 差异、长请求保活、分页等待/迟到响应退出保护、真实 Python 管道断开取消已实现；详见 [本轮审计](2026-09-13-rank-http-audit.md) |
| M09–M17 | 弹幕、完整榜单、场次/数据中心、导出、分析、用户工作台、抖音授权、适配器/单次任务和 Mock/真实功能分类仍须按台账逐项迁移复核；不是空实现，也不能视为已全部对齐 |
| M18 | 全量原生客户端/安装包、数据库升级、真人平台等最终验收尚未完成 |

## 下次从哪里继续

1. 先查看本交接、全量台账和当前 git diff，不回滚未提交的榜单改动。再次只读确认原 B/S 基线是否更新。
2. 下一独立功能：Node 弹幕 HTTP 配置贯穿。原来源 `BilibiliLiveDanmuInfoClient`、`BilibiliAnonymousCookieProvider`、`BilibiliWbiSigner`；客户端 `workers/node-realtime/src/bilibili-danmaku-connection.ts` 及 Core/Realtime Worker 传输。DanmuInfo 使用配置 Referer，SPI/WBI 固定首页 Referer；不能把目前 10 秒总 AbortSignal 简单改成 connect+read 总期限。
3. 随后继续 M08 storageEnabled、完整解析、并发限流和耗时定义，以及 M09–M18。所有真实业务仍在目标内，没有因收尾而排除。
4. 未获新授权，不提交/推送、不启动或编辑原 B/S、不重启已安装客户端、不使用用户凭据或清理用户数据库。

## 验证记录说明

本轮完整 `check.cmd` 已退出 0：**Node 792 项、Python 278 项**；类型、格式、Electron 构建和 D 盘检查通过。独立只读复核无新增 Critical/Important，测试/Worker 残留进程 0，原 B/S 仍干净。当前功能已完成并停止，全部迁移尚未完成。

本轮完整检查和只读复核结果记录在本轮审计的“收尾验证”中。历史审计是各批次当时证据；例如旧 HTTP 审计中的“Rank/真实 Python 管道待补”已被本轮推进，不能据旧条目重复开发，也不能据本轮测试推断原生 Electron/真人平台已经验收。
