# 原 B/S 全量业务迁移台账（2026-09-13）

## 基线与完成条件

- 原项目只读：`D:\codex_work\BiliMonitor`，当前 `fa2faa6`；开始时工作区干净。
- 客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`，本台账历史规划起点 `22d0d0b`；本次记录HEAD `4c94959`，工作区有累积未提交改动，暂存区为空，最新状态见下文当前执行点。
- 原基线 `01200f3` 到 `fa2faa6` 共 4 个提交、24 个变化文件。本次范围不止这 4 个提交：旧功能仍逐操作对照当前源码验收。
- 不启动或编辑原 B/S 工程；原 Java/Vue/PostgreSQL 仅作为业务参考。运行时仍为 Electron + React + TypeScript Core + SQLite + Python/Node Worker。
- 不把已有方法、页面入口或绿色测试等同于业务完整。每项必须记录原源码、客户端实现、输入/状态/输出、差异回归及剩余手工验收。
- 所有新文件、工具缓存、测试数据库、构建产物位于 D 盘；禁止保存真实凭据到测试或文档。
- 下表所有“待核对”都属于未完成项；没有被排除出目标。原 Mock/占位能力单列，不伪装真实业务，也不擅自扩展它的能力。

## 最新入口调整（2026-10-11）

按用户要求，在侧栏新增“数据中心”(`#live-data`)与“分析看板”(`#live-analytics`)独立入口。对照原 `MainLayout.vue` 的 `/data`、`/analytics` 命名，复用已迁移的直播数据中心/场次分析组件和查询，不新增业务、API或schema；原直播页8个页签保留。三种入口共享已挂载的直播工作区，保留场次、筛选和分析交互状态；独立页使用各自标题，不显示直播页签，折叠导航也有可访问名称。实际RED→GREEN，4文件22项通过（仅新增2个SSR入口case和1个浏览器操作case），Desktop类型与生产构建通过。一次`check.cmd` exit1：Core1048/1050，仍是Subject501与粉丝2004两个旧规模超时，未改预算或重跑整套；日志 `.tools/temp/20261011-standalone-navigation-check.log`。开发客户端仍运行；未更新独立目录包、未提交推送，不标全量迁移完成。

## 当前执行点（2026-10-11，恢复迁移与榜单配置）

用户重新要求对照本机原B/S继续迁移。本轮核对路由/Controller与客户端入口，并补齐榜单enabled/pageSize/guardPageSize/maxPages/requestMinIntervalMs/webLocation六项配置。Core开库前读取、规范env/原别名/文件优先级、原服务开关、默认页数穿过Main/Preload、消费者夹值、Python WBI参数与关闭/恢复历史已接；schema18不变。详见[功能缺口复核与本轮证据](2026-10-11-feature-gap-and-rank-configuration.md)。新增命名case仅4个；本切片定向/类型/生产构建通过，限定复审C0/I0/Minor0。一次check终态exit1：Core1048/1050仍有Subject501和粉丝2004旧规模超时；没有重复跑整套求绿，不标全量完成。下一明确功能缺口是B站登录启动配置；真人/原生/安装、冷启动/规模稳定性和布局失败策略仍未关闭。未提交推送、原项目只读，D盘输出保持。

## 历史执行点（2026-10-07，阶段回归与暂停）

当前停止点：[直播采集启动配置](2026-10-07-live-startup-binding-audit.md)已补齐17字段的标准环境变量/旧别名、复用转换与raw条件/调度规则。最终Core35、Contracts52、Python62、workspace类型/生产构建及实际Main/Preload/Core关闭→重启开启/配置原字节/退出PID0通过；本功能完成后按用户要求停止后续迁移，不标全量完成。一次check终态exit1，Core1045/1048含两个旧规模超时和一处旧开关夹具；后者已按原不trim条件修正并定向覆盖，不冒称整套通过。详见新审计；旧记录中的“继续”保留为历史状态。

最新：[WBI材料与缓存发布](2026-10-07-wbi-cache-publication-audit.md)已限定收尾：Python在成功缓存发布前按Java UTF16派生mixin，短材料返回PARSE且保留旧缓存，59单元仍接受；仅两个Python源改变、复用现有case，真实两轮RED及最终35项/格式/类型、限定复审C0/I0/Minor0。标准check93298 exit1，Core1045/1047剩Subject501/粉丝2004两个规模超时，其他历史超时未冒称修复；build59877与当前生产23623五页/IPC/证据/重启/PID0通过。独立目录版为本片前版本，不含本WBI修复；继续原功能收尾审计及实际剩余缺口，完整目标仍OPEN。

最新：[当前平台采集目录版](2026-10-07-platform-account-directory-audit.md)已实际交付验收：Python打包22257、Electron目录59233及脱离开发路径的独立运行91268均终态exit0。新 `release/migration-20261007-platform-account/win-unpacked` 包含schema18与当前平台输入/失败证据；内置Worker新能力/非法输入校验、五页、实际IPC、本地对象Core重启保留与正常退出自有PID0已验证。旧目录不覆盖，NSIS/真人/原生和四规模超时/桌面稳定性仍OPEN；继续剩余业务对齐，不以此标全量完成。下文“下一步更新目录版”为此前状态。

最新：[平台account输入](2026-10-07-platform-account-input-audit.md)已有限收尾：原不trim的signed64/BMP数字精确解析、新Worker请求、原样页面输入及默认监控正数隔离已接。两个既有流程真实RED→GREEN、共享校验/类型通过；capability夹具遗漏Important实际复现后闭合，最终15路径v2限定复核C0/I0/Minor0。标准check84193 exit1，Core1043/1047为四个既有规模超时，后续未执行；build22107与真实生产3345五页/输入/证据/重启/PID0通过。下一步更新当前独立目录版及内置Worker验收，再继续其余全量缺口；旧目录包不覆盖最新源码。下文signed输入“未迁”是历史状态，已由本片关闭。

最新：[平台失败响应归档](2026-10-07-platform-failure-evidence-audit.md)已有限收尾：generic account opt-in，实际失败字节/媒体类型经CAS及typed ObjectRef接通，普通粉丝/profile默认不增加失败归档。旧strict root样例缺陷已实际RED→GREEN关闭，不放宽schema；最终13路径v2限定复核C0/I0/Minor0。标准check session48412 exit1，Core1044/1047仍三个既有规模超时，后续未执行；build45468及真实生产Main/Preload/Core/Python/证据核对/五页/重启/PID0通过。继续平台signed64/BMP数字输入，已发布监控正数请求不扩大；其他全量缺口仍OPEN。下面失败结果片的“失败响应证据未迁”是当时记录，已由本片关闭。

最新：[平台单次采集失败结果](2026-10-07-platform-failure-result-audit.md)已有限收尾：原错误文案/风险与内部请求失败边界已接，两个源v2限定复核C0/I0/Minor0，当前hash/字节2/2匹配；既有实际Worker流程RED→GREEN、当前build及真实生产Main/Preload/Python/五页/重启/正常退出通过。标准check session3284 exit1，Core1044/1047仍是Subject501、弹幕501、粉丝2004三个规模超时，后续未执行。失败响应证据与signed MID输入仍未迁，下一业务继续该链路。[被动提交测量](2026-10-07-business-commit-profile-audit.md)显示COMMIT占主要耗时，不支持盲调checkpoint/索引/cache；未改变生产性能设置、预算/并发/持久性。布局选择、完整兼容/桌面/真人原生/最新安装仍OPEN。

最新：[榜单勋章与条目原文归档](2026-10-07-rank-entry-facts-audit.md)已有限收尾：真实Worker/Fetched v2/Core/SQLite接通medal_ruid、medal_is_light、raw_entry_json，追加v18、历史未知NULL；公开DTO/旧wire及原三阶段提交不改。21源限定复核C0/I0/Minor0，当前hash/字节匹配；复用既有case实际RED→GREEN，当前构建及隔离生产五页/真实Rank归档IPC/重启保留/正常退出通过。一次标准check session82158终态exit1，Core1044/1047仍有Subject501、最近弹幕501、粉丝2004三个规模超时，Desktop及后续未执行。下一步被动测量提交/WAL实际耗时再定位，未改预算/并发/持久性；布局选择/桌面稳定性/其他兼容/真人原生/最新安装及全量目标仍OPEN。

此前：[榜单公开数值v2与历史兼容](2026-10-07-rank-long64-audit.md)的signed64/Integer语义、v17精确存储及完整Worker/Core/Main/Preload/UI出口保持；43源v3限定复核与历史宽整数/排序LIMIT的RED→GREEN属于该收尾版本。该片的归档“尚未实施”由上方v18归档片关闭，不重复开发；该片阶段结果不代替最新终态。

此前：[榜单三类响应字段选择](2026-10-07-rank-response-fields-audit.md)的主榜/备用字段隔离、原firstPresent及大航海人数说明保持限定完成；其检查结果是历史版本，不替代上方最新阶段终态。

此前：[榜单API返回码与错误分类](2026-10-07-rank-api-values-audit.md)已有限收尾：数值文本code、-101登录失效、-500可重试及原消息/日志已接，未新增自动重试。五源复核、Core1044/1045及生产结果属于本片收尾版本，不代替最新阶段终态。

此前：[榜单直接文本保存](2026-10-07-rank-storage-text-audit.md)已有限收尾：完整抓取文本在原SQL点截断/编码，人数说明按Unicode64及ASCII-space溢出规则保存；成功日志/CAS及已迁三阶段提交保持。十源限定复核及Core1042/1044属于本片版本，不代替最新阶段结果。

此前：[榜单原始快照与独立提交链](2026-10-07-rank-raw-payload-storage-audit.md)已接，九源复核C0/I0/Minor0；本片前九个收尾hash/字节重新匹配。其Core1041/1043等结果保留历史，后续同名源增量不覆盖它的版本边界。

此前：[直播主原始快照与整体回滚](2026-10-07-live-raw-payload-storage-audit.md)已接，只检查实际主响应，业务整体回滚而独立成功日志/CAS保留；11源限定复核C0/I0/Minor0。其Core1040/1042与相关定向结果是直播片收尾记录，不代替最新榜单阶段终态。

此前：[粉丝原始快照与提交顺序](2026-10-07-follower-raw-payload-storage-audit.md)已补普通资料/日志先提交、历史失败不重试与工作台外层整体回滚；完整原文 JSONB 输入状态穿过真实 Worker，但不改 CAS 字节。16源v2限定复核C0/I0/Minor0；资料Outbox使用实际monitor MID的Important已RED→GREEN关闭，快照MID保持响应值。粉丝旧check和定向结果各自保留，不用直播通过宣称全部性能或模块完成。

最新：[API日志JSONB文本](2026-10-07-api-meta-json-storage-audit.md)对齐两个元数据参数的新写入及失败传播，Subject共享算法保持；原Storage case与唯一新增实际Worker→Core流程RED→GREEN，Storage77/相关Core31/原SubjectJSON/全TS/格式/当前build及隔离生产启停通过，六源限定复核C0/I0/Minor0。未清历史、改schema/服务流程或把普通JSON写入当全JSONB兼容。最新完整check仍是本片前的裁剪版本exit1，不包含此新case；性能/浏览器/布局/真人原生继续OPEN。下一业务先核对原snapshot raw_payload JSONB及部分提交失败的实际链路，未实施，不凭API日志成果关闭它。

此前有限收尾：[最近弹幕裁剪](2026-10-07-retention-prune-audit.md)仅改两个Storage源，以相同排序选择超出N的rowid删除，schema/永久事实/指标/同步提交/预算/并发不变。复用原case真实RED→GREEN，Core原15项/两包类型/当时build及隔离生产五页/IPC/重启/退出通过，限定复核C0/I0/Minor0。阶段check仍exit1，Core1037/1039，弹幕5016069ms及Subject批量6483ms超原5秒，后续未由check执行；提交仍是单次profile主要耗时，不能宣布整体超时修复。不重复旧矩阵求绿；桌面失败/布局策略/真人原生仍OPEN。

最新阶段见[业务页面加载及依赖核验](2026-10-07-workspace-module-startup-audit.md)：七个真实业务模块懒加载/安全失败恢复、16个同配置夹具的标准依赖准备已接，原case/预算/并发保持；最终21源复核C0/I0/Minor0、当前全TS/构建及隔离生产五页切换/IPC/重启/退出通过。旧Python环境 recoverable 保留后按现有锁重建，不新增依赖。阶段 check 仍exit1（Core1038/1039，最近弹幕501原5s超时）；冷Desktop仍exit1（676/686，无跳过，含2个空白页创建 Target crashed）。不把局部修复算整套稳定性完成。当前继续裁剪 SQL 的真实定位；已有目录包未包含本片和最新JSON，不重做旧业务或改预算求绿。

此前：[工作台 JSON 文本保存](2026-10-07-subject-json-storage-audit.md)已对齐五个新写入参数的文本编码和 NUL 拒绝，绑定修改返回实际落库对象；一个新增代表流程真实 RED→GREEN，相关两文件12项、类型、当前生产构建和实际 IPC/重启保留/正常退出验证通过。未改 schema16、历史、布局事务或其他 JSON 参数。阶段 check 终态和最终测试版本见本片审计；原布局逐条提交与客户端原子替换的差异已向用户询问，尚未据此关闭。下面创建事务与旧目录包属于前一片结果，目录包不包含本片 JSON 修复，全量目标仍 active。

JSON片阶段 check 已终态exit1：Core1038通过/1个原5000ms超时（Subject501对象7641ms），新增JSON及前片回滚通过，无未处理拒绝报告；Task3/Contracts511/Storage77/Realtime162/Browser12通过，Desktop/后续未由check执行。最终四源限定复核C0/I0/Minor0，最后移动后的测试定向1项通过；生产代码在check期间保持。配置/101容量在此次完整阶段通过但旧超时根因不冒称已修；桌面历史失败继续开放。不重跑整套求绿或重打包，具体版本边界见最新审计。

此前：[工作台创建整体回滚](2026-10-07-subject-create-transaction-audit.md)已按原创建事务实现：先准备资料，再同步一次提交监控、快照/场次、日志、工作台/绑定/布局及Outbox；不跨await持事务、不补偿删除，改绑原非整体事务保持。一个新增真实流程先RED后GREEN，相关三文件12项、Storage/Core类型、当前Desktop生产构建与实际隔离IPC启停通过；五文件限定复核C0/I0/Minor0。独立并发添加保留，失败十二表不残留，成功复用与重开已验证。JSONB/其他失败行为、阶段超时和真人/原生仍开放；下面各片“跨资源回滚OPEN”为当时记录，不覆盖此最新结果。

本片后阶段检查已exit1：Task3/Contracts511/Storage77/Realtime162/Browser12通过，Core1035通过/3个原5秒超时（Subject501、直播批量配置、弹幕101容量），无未处理拒绝报告；后续阶段没有被该check执行。最新unsigned目录 `release/migration-20261007-subject-transaction/win-unpacked` 实际脱离开发环境运行的内置Worker/IPC/对象重启/退出验收通过，包含本片及前两修复；不是NSIS/真人/原生验收。具体终态与包hash见本片审计，旧1失败/旧包均只作历史结果。

用户已恢复“继续直到全部完成”的全量目标，M01–M18全部真实业务范围保持。上一轮状态核查仅只读、不计进展；随后[直播添加输入](2026-10-07-live-add-identifier-audit.md)补齐原有效数值写法，遵循用户精确UID决定，不复刻Number舍入。一个既有真实浏览器流程先RED后GREEN，Desktop类型/生产构建通过，两源限定复查C0/I0/Minor0；不新增case/fixture或放宽预算。当前继续工作台失败提交等具体原业务边界，统一入口见[交接快照](2026-09-13-migration-handoff.md#当前进度快照2026-10-07)。

随后[Subject三个直接TEXT字段](2026-10-07-subject-direct-text-audit.md)完成限定对齐：复用原pgjdbc编码，姓名/头像/备注新写入的孤立UTF16→`?`、NUL安全失败，正常文本/null语义不改；不转换JSON或清历史。既有Core1/Follower2、Storage/Core类型、当前Desktop构建通过，四源限定复查C0/I0/Minor0。实际新生产隔离Main/Preload/Core的IPC资料创建、单Core重启保留、删除/退出自有PID0通过；自有隔离密钥的OS保护原语已实际验证。后者不等于真实凭据/剪贴板/安装验收；跨资源创建事务、JSONB、阶段失败/性能及其它全量边界继续OPEN。

[阶段回归及目录版](2026-10-07-stage-regression-and-directory-audit.md)已经结束而非仍在运行：check exit1，Core1036通过/1个Subject501对象8098ms超原5000ms；三处夹具失配核定后，一次桌面阶段exit1，664通过/3失败/19跳过，4文件失败。剩粉丝Delete/Status/ProjectionPolling与平台采集超时根因未核定；Widget15项、Realtime等待/退出7项在该完整桌面阶段通过。schema16新unsigned目录版实际启动/重启/本地绑定/退出限定验收通过；它生成于随后直播表单修改前，不声称含最新Renderer修复。当前生产bundle已更新，NSIS/真人/原生仍开放，旧失败日志不改写。

本批已对齐[普通材料API、错误传递与直播媒体文本](2026-10-07-material-api-and-live-media-audit.md)：nav/SPI/DanmuInfo代码与标量原文、空错误消息/共享错误契约、nav解析日志归属、弹幕biliCode匿名回退、精确hex转换，以及Live/Subject头像/封面/关键帧文本。代表流程和相关类型通过，43源冻结差量只读复审无C/I/Minor；阶段完整check已exit1，见下方真实结果，不预称整模块/全量完成。此前String响应、精确计数、导出等成果保持，不重做。

随后处理[导出完整背压与工作台绑定读取](2026-10-07-export-backpressure-and-subject-binding-audit.md)：原路径RED281行，显式64KiB双侧归档缓冲保持256行预算；Subject501对象读取从1002次对齐501次，缺绑定不重查。四源复查无C/I/Minor，两个既有文件8项和Core类型通过；新阶段完整check终态exit1，Core1036通过/1个Subject批量5秒超时，XLSX通过，性能问题不以定点绿色关闭。

本次继续[工作台创建/修改输入](2026-10-07-subject-text-input-audit.md)：原可空字段、文本头像/长备注、raw UTF-16名称上限及Java trim、标签清理去重后12项、null修改不覆盖/[]清标签已接。复用TS2/Core7和同fixture Python响应1项通过，全工作区TS/修改Python格式与八源限定复查通过。随后[资料回填与绑定修改](2026-10-07-subject-backfill-and-binding-audit.md)已实现两种原资料回填规则、历史空串头像及 null 保留/[]清能力、能力列表原文。回填两源及绑定九源限定复查均无C/I/Minor；阶段完整check实际exit1见上方当前结果，不预称整套通过，不扩测试矩阵。

弹幕SPI与DanmuInfo复用String转换：先验证响应头，再分类HTTP失败；SPI按原UNKNOWN/可重试，DanmuInfo429为RATE_LIMITED、其他HTTP失败为UNKNOWN/可重试，保留原消息及安全端点/状态。内部转换错误不进入匿名fallback、不清成功材料缓存；缺省Latin-1资料实际进入LOGIN AUTH包。仅一个新增代表流程RED→GREEN，最后复用3项通过/9项过滤未运行，Node类型、3路径限定复查C0/I0/Minor0、Desktop类型/生产构建及新 `.tools/temp/bmd-production-final-WnU9wa` schema16/精确桥接/单Core重启/正常退出PID0通过。没有改schema、依赖或正常API字段解析；不能扩称完整M09/M10完成。

阶段完整 `check.cmd` 已结束，日志 `.tools/temp/20261007-http-phase-final-check.log`、exit1：Task3、Contracts510、Storage77、Realtime161、Browser12通过；Core1025通过/12失败（10文件），另有2个未处理拒绝。旧Storage Number/bigint断言已修且Storage本轮全部通过；当前Core失败包含弹幕自动/停止/升级状态、Worker启动夹具、禁用配置、场次时间文本、直播Worker解析、限流/日志异常和两项5秒超时，观察值逐项保存于最新审计，根因未核定。Desktop与后续全量类型/Python/构建未由该命令执行，不用单独构建改称整套通过。历史桌面异常退出、Worker启动和趋势超时未据此关闭。

HEAD `4c94959f81033eee544211cfce29a18c84fd602f` / `codex/follower-monitor-actions`和累积未提交改动保持；暂存区空，原B/S `fa2faa6` /API `271b123`干净只读。弹幕任务前489源中仅3声明路径变化、其余486保持，记录时3个当前hash/字节与冻结manifest一致。WBI v2是其收尾时版本，不要求后来被弹幕切片改动的同名文件仍匹配旧hash。没有提交推送、打包、用户库/真实平台/全局记忆写入，文档与证据均在D盘。

上述Core12项是历史结果，定点4+6+2通过不替代完整绿色。材料批次完整exit1为Core1035通过/2失败；其后 `.tools/temp/20261007-two-failures-phase-check.log` 已终态exit1：Task3、Contracts511、Storage77、Realtime162、Browser12通过，Core1036通过/1失败，无旧未处理拒绝报告，剩Subject7840ms超过原5000ms。Desktop及后续未由该命令执行。本批输入仅有限验证；其他配置、JSONB/部分提交、性能、最新schema16目录包和真人/原生验收仍OPEN，完整回归留阶段收尾。

## 上一已完成功能停止点（2026-10-07，直播热度/关注数精确链路）

当前功能已完成，按用户要求到此暂停后续迁移。Live v2 / Subject v3 贯通实际 Python/NDJSON/Core/SQLite/Main/Preload/UI；热度、关注、汇总、差值、工作台历史峰值保持 signed64 精确语义，旧接口安全投影/超域明确错误，不返回舍入值。任意布局 JSON 保真、长轴标签与精确可访问提示的复查问题已闭合，独立 Spec compliant / Quality Approved，无本片未关闭问题。

代表流程与独立类型检查通过；root 最新 Desktop 生产构建 exit0，实际 D盘 `.tools/temp/bmd-production-final-XGdKas` schema16/精确桥接/单Core启动重启/注册表/正常退出PID0通过。最终431任务前源与62本片路径保持核验、限定空白检查通过；原B/S/API只读干净、HEAD4c/空index保持，无提交推送。见[本功能审计](2026-10-07-live-long64-audit.md)与[停止交接](2026-09-13-migration-handoff.md)。

本段为 Live 功能完成时的历史结果，不作为当前状态。此后普通 Double 文本、NDJSON最终帧关联及Follower直接TEXT字段均已完成限定收尾验收，详见上方当前记录点。其他独立兼容域、阶段全量回归/历史问题、同步 SQL/性能、最新目录包、真人扫码/原生保存/安装仍开放；本片完成不是全量 M01–M18 验收完成。

## 此前执行点（2026-10-07，XLSX 表数据背压）

对照原 SXSSF100 行窗口和当前 ExcelJS4.4.0/Archiver5.3.2 实现，只接管 worksheet XML 输入为双向64KiB标准流；立即转换复用 StringBuf，表头/每行等待 drain，sheet.end 后等待消费完再生成下一表。错误/取消主动销毁自有表流并等待关闭，原五格式/schema2/列/类型/样式/编号/快照及 Prepared/Main 保存恢复不改。

一个真实 cork 文件输出代表流程：原路径489行越过256预算，修复后生产停顿且队列≤HWM+单行，释放后读取四表，同夹具阻塞取消完成清理；新增1项及既有内容/取消3项通过，Core类型通过。预算包含已核对 Archiver 固定1MiB缓冲，不是任意RSS承诺。独立任务审阅 Spec compliant / Quality Approved，无C/I；其全局保持警告由前片差量冻结和既有内容回归承接。root Desktop类型/生产构建、实际新 `.tools/temp/bmd-production-final-ZxdbhH` schema16/单Core/重启/真实注册表/退出PID残留0通过；文件hash与冻结报告一致。

报告 `.tools/temp/20261006-xlsx-backpressure-report.md`；日期跨日不改旧任务locator。下一片直播 online/attention Long64、直接汇总/差值/Subject和UI精确出口，设计 `20261006-live-long64-design.md` 已只读核对、尚未实施。之后普通Double文本和Python最终帧关联。同步SQL/写入、性能、当前目录包、阶段回归和真人/原生验收继续开放，目标active、原库干净只读、无提交推送。

## 此前执行点（2026-10-06，prepared 成品交接）

继续只读原 Export Service/Controller/XLSX Writer，五格式/schema2/事务快照/建议文件名保持，编号仍在文件 IO 前分配一次。新 prepared 使用专属目录，先 wx/sync 唯一 HMAC owner，再固定 output；owner 包含可信 Main UUID/PID、creator Core PID、根/目录稳定身份与完整类别。Main 身份仅从主进程 fork env 注入，不来自 Renderer；公共契约/UI 不变。

Core 启动开库/Worker 前校验 key、恢复 prepared；两个 PID 分别明确 ESRCH 才清理，Main 存活时保护 Core 重启/保存对话框。签名/身份/链接/未知成员不明保留，恢复首次 unlink 前持久审计失败不删；正常 finally 按 expected owner/marker/output identity 清理，固定 output→owner→rmdir、不递归。Main 接受前和对话框后分别核对，实际 RED 查明替换输出仍被保存后补二次核对。legacy flat 可保存但不恢复，saved 成品与 `.part` journal 不变。共享安全原语抽取，snapshot 规则保持。

仅新增 Core 真实双进程交接与 Main 私有保存两个代表流程，复用五格式/退出/part/保活/host：最终 Core5、Main定点6通过，31 filtered 不计通过；两包类型通过。独立13路径任务差量审阅 Spec compliant / Task quality Approved，无本片 C/I。root 最终 Desktop类型/生产构建与实际生产 Main/Preload/Renderer/Core 在 `.tools/temp/bmd-production-final-4qEFsn` ready/schema16、单 Core、重启单 Core、真实注册表与正常退出/PID残留0通过。自动平台/OAuth关闭，无用户库或真实凭据。

额外旧 host rank 用例本轮两次确实失败，未豁免或宣称全套通过。只读定位：fixture未提供现行 shared Node Realtime entry，Runtime 在 Python transport 创建前返回 unavailable Rank source；prepared前后该选择方法相同。另发现 Python fixture要求 raw cache=-8 而 host未写配置。仅原case新增9行合成依赖/明确配置，72条原断言保持；原case定点1通过/21 filtered与Desktop类型通过，独立Spec compliant/Quality Approved，无C/I。关闭该项当前失败，不代表全22项/WBI/真人验收。见 `.tools/temp/20261006-prepared-export-report.md`、`20261006-rank-startup-availability-diagnosis.md` 与 `20261006-rank-fixture-report.md`。

下一业务已有源证据：XLSX StreamBuf 忽略真实背压，拟窄接 worksheet XML 标准有界流；然后直播响应 Long、普通 Double 文本、Python final 关联三个有限兼容子片。只读报告不计实现。同步 SQL/写入/单条90秒、未知残留/恶意换路径/断电、旧阶段检查、最新目录包及真人/原生继续开放；目标 active，未提交推送。

## 此前执行点（2026-10-06，导出自有临时文件恢复）

再次只读原 Export Controller/Service/XLSX Writer：原来是事务快照写 HTTP 输出流与正常 finally 清理，本片是客户端文件生命周期适配，不新增导出格式、UI 或业务服务器。原五格式、schema2、编号和成品内容不变。

Core ZIP/XLSX snapshot 目录先写 owner v1，再写快照；记录随机任务、Core PID、类型、相对名称及根/工作目录稳定身份。启动时在 SQLite/Worker 之前仅恢复确认自有、PID 明确 ESRCH、无链接和未知成员的目录；固定名单 unlink/rmdir，不递归。平铺 prepared 与用户成品不在扫描范围。恢复删除前先安全持久审计 attempted，失败保留；删除后写 removed，完成审计失败单列 removed_audit_unconfirmed。正常 finally 使用同一所有权检查，owner 不进入 ZIP/XLSX 成品。

Main `.part` 使用现有 key 的 HKDF 独立域与 AES-GCM/AAD 加密 journal，不记录 savedPath、内容或明文 key。独占创建取得 FD 身份后，journal 写入/sync/close 成功才复制；完整关闭后复核身份、同目录 rename。主实例锁/key 后、Core/IPC 前只恢复确认自有且 dead Main 的精确 part；删除前持久审计失败就保留，不枚举用户目标目录。Core restart 不重复 Main recovery。新增 startup barrier 后独立复查发现在途 start 可能双 fork，实际源码函数探针 RED starts2→GREEN starts1；增加在途 Promise 共享，完成后失联仍可重启，最终复查无本片 Critical/Important。

只新增两个代表流程：Core 恢复用实际退出子进程 PID 与真实文件，Main 用实际保存函数在 Node 子进程中复制后强杀，验证活动 part、类似名称的无关文件、原成品与 legacy prepared 保留。恢复缺失、首次并发 mkdir EEXIST、缺持久审计均先 RED 后修复；最终根代理定向 Core4/Main3 共7通过，Core 类型和最终 Desktop 类型/生产构建通过，无全量检查或格式矩阵。复用原编号/计数回归也通过，不把同一用例重复执行累计计数。

实际最新生产 Main/Preload/Renderer/Core 在新 D 盘 `.tools/temp/bmd-production-final-aKQdSb` ready/schema16、真实平台注册表、单 Core、重启后单 Core及正常退出/记录 PID 残留0通过。首次 smoke 将 utilityProcess 配置的 serviceName 误作 ProcessMetric.serviceName，采样和已安装 Electron 类型确认它实际在 name 中；只修验证脚本字段再通过，不改业务源码或删断言。自动采集/OAuth关闭，无用户库/真实平台/凭据。

Main 中间一次测试因 finally 重复等待已退出 signal 子进程而超时，修正 harness 后三项通过；早期合成目录 `.tools/temp/bmd-export-save-i6evpE` 的精确清理被自动审查拒绝，未绕过，保留于 D，最终用例各自正常清理。Core/Desktop 只添加已锁定 zod4.4.3 的直接依赖，离线恢复链接，无下载新版本/工具链。原 B/S 干净只读、旧增量/空 index 保持，未提交推送。

下一片是 prepared 成品的所有权：拟采用先写签名 owner 的专属工作目录，Main 与 Core 双 PID 均明确死亡才回收，避免 Core 重启误删正在保存的成品；当前仅方案核对完成，尚未实施。marker/journal 前不可证明残留、旧无标记文件、PID复用/权限不明、恶意并发路径替换/断电事务仍保守保留。同步 SQL/写入、严格有界/性能、真人与原生验收及其他 M01–M18 缺口不关闭，目标仍 active。

## 此前执行点（2026-10-06，API 日志、响应归档与导出退出）

对照原 Follower/Live/Rank Service 的 `recordApiCall` 与 V1 Repository，补齐每次请求的白名单参数、成功标记、原失败消息及可选 `biliCode`。UID/房间身份沿本地契约保持精确十进制字符串，不序列化整个 Worker 请求、WBI 材料或 Cookie；原项目没有日志查询界面，不新增 UI。追加 SQLite v16 两个可空 JSON 字段，旧行保持未知、不编造元数据；旧迁移不改。

复用一个真实 Python→Core→SQLite 粉丝失败流程 RED→GREEN；一个直播房间解析流程和一个 Rank 风控重试流程通过。旧 v15→v16、重开保留与精确 UID 复用已有存储流程通过；因 schema 前进，既有旧版本夹具还原旧 API-call 布局，v8/v11/v12/v13/v14 五个代表升级流程通过。首次 Rank 断言误写 pageSize=30，按实际配置修正为50后通过，不改业务配置。Storage/Core 类型通过，未运行全套。

Live 响应改为端点解析和既有共享业务字段契约都通过后才写 CAS；平台错误及契约失败不归档原响应。复用同一个 Python HTTP 用例两次 RED→GREEN，最终1通过，三文件格式/两源类型通过；早先78项是在契约提前校验之前，不算最终版本覆盖。独立只读复查的 CAS Important 已修，无剩余本片阻断。

M12 补 Runtime 内部停止信号，异步 ZIP/XLSX 压缩、读取及 commit 阶段取消后，等待输入/输出/归档流关闭并清理快照目录，最后关闭 SQLite。原五格式内容、编号和同步事务快照不改，无新取消界面。复用旧退出流程的 ZIP/XLSX 两阶段 RED→GREEN，连同原五格式主流程3通过；修复 ExcelJS 延迟 finalize 在取消后引发的未处理拒绝。独立只读复查及已安装库实现核对无本片 Critical/Important；Archiver 自然成功不保证 close，成功路径等待输出关闭、取消显式 destroy 后等待归档 close。同步 SQL/写入仍不能被事件循环外取消即时打断，严格有界、性能、崩溃恢复仍开放。

最终 Desktop 类型/生产构建通过，初次构建发现 Rank 元数据联合类型带隐式 undefined，显式白名单类型标注后通过，未扩大字段类型。实际运行最新生产构建 Main/Preload/Renderer/Core，独立 `.tools/temp/bmd-production-final-xMCjK5`：ready/schema16、真实平台注册表、Core 重启/正常退出及记录 PID 残留0通过，自动采集/OAuth关闭，无真实平台/凭据/用户库。限定 diff check、最终 Core 类型及项目进程0通过。

M06 原 API日志 failureMeta 子项及 M12 异步压缩退出取消已闭合；其他精细兼容、旧整体检查、M12 性能/崩溃恢复及真人/原生验收仍保留。原 B/S 干净只读，客户端旧增量与空 index 保持，无提交推送。上次目录包是本次改动前的 v15，不冒称它已经包含 v16/最新 Python 修复；目标仍 active。

## 此前执行点（2026-10-06，HTTP 异常边界与独立目录客户端）

再核对原 15 个 Controller 及真实消费者，未发现新的功能级漏迁。M06 补 MIME/charset 转换异常先于 HTTP 状态/空体分类：Worker 安全回帧且不退出，Core 映射内部错误而不记 API 失败、不重试/回退或更改 monitor/backoff/历史。一个已有 HTTP503 主流程 RED→GREEN，并复用普通解码回归；无新 case/文件/矩阵。类型、Python生产源格式/类型、最终 Desktop 构建与限定 diff check 通过。

旧默认 Jackson recycler Important 经原 compiled client 再复现，限定为病理长数值的线程/预热历史兼容残差；普通短浮点/精确 Long64 一致，不臆造缓存模型或关闭该残差。完整 Java codec/UTF16、其他编码/配置等待核对保持。

M18 新 unsigned 目录版 `release/migration-20261006-YHQ4nF/win-unpacked/BiliMonitor Desktop.exe` 已离线构建并实际启动：移除开发 Node/Python/环境路径，内置 Python 握手、真实 app.asar/Main/Preload/Core/SQLite v15、注册表、本地对象写入/重启保留/删除、正常退出及记录 PID 残留 0 通过，数据独立 D 目录。未安装 NSIS、未覆盖旧安装包、未访问真实平台/凭据/用户库。细节见[交接](2026-09-13-migration-handoff.md)。

尚需用户配合真人扫码、授权测试 UID/房间及原生导出；旧整体回归超时、精细兼容/大数据/崩溃恢复边界仍在范围内。源库干净只读，旧增量/空 index 保持，无提交推送，目标 active，不标全验收完成。

## 此前执行点（2026-10-06，功能面收口与真实客户端验证）

M15 补原 Web/OAuth 原子保存、重叠消费/刷新合并、Worker 终态/TTL 清理、完整复验及原浏览器配置与身份字段。界面接原扫码重开/关闭/失败重试/手动刷新、迟到隔离与进度、完整字段抽屉/复制，校验无效不再报成功。M14 补 key 原文/80 Unicode 字符及 Service 内部 null 恢复，同时保持公共 Runtime/IPC 必填数组边界。

M16 已接注册表及真实 account run-once Worker 链路、新平台采集页及精确 UID/计数/失败展示，portable schema/同一合成样例的 TS/Python 校验已补齐；其余通用采集沿原 unsupported，不新增空方法的任务历史。M17 完成 Mock/静态/真实健康分类，不恢复伪业务导航。

M09 数量夹值、M10 最新分钟页集合/latest 单页/头像格式已修；另补 PREPARING→立即 REST 确认促排、原六处搜索选择器、事件数字分页及五页跳转。M01–M08、M11–M14 只读功能面核对发现的具体缺口均闭合，不把旧深层兼容清单误称缺失操作。

代表性回归、全 workspace 类型、Python 生产源格式/类型和最终生产构建通过。真实 Electron Main/Preload/Renderer/Core 离线验证 ready/schema15、空列表/真实注册表、新 Core 重启及正常退出，无记录 PID 残留；旧 v12→v15/外键/rowid/重开保留代表用例通过。使用新 D 盘目录、无真实平台/凭据/用户库，headless 跳过系统协议注册。原库干净只读、旧增量/空 index 保持，无提交推送。

代码功能面与真人/原生验收分开：尚需用户配合扫码、测试 UID/房间和原生导出；已询问是现在验收还是先交付代码。旧全量 check 超时、精细 JVM/Spring/HTTP/编码和性能/崩溃恢复边界不凭此次核对关闭，不扩上千项矩阵。目标仍 active，不标完整验收完成。具体证据和边界见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，工作台页头与指标）

原页头的头像三层来源/直播标记、健康条、直播/弹幕标签准入和监听/采集文案已接；KPI 补原净增/峰值/弹幕状态/模块标签，普通数值万/亿精度及净增 0/今日文案，保留超安全整数 Long64 精确展示。最近成功/下一轮沿原相对时间/月日时分秒/缺省 `--`，无实际 user/room 显示原资源绑定提醒。沿用粉白 token，未改后端数据、轮询或采集。

一个已有 UI 主流程 RED→GREEN，1 通过、3 未运行；类型与生产构建通过，未扩测试矩阵/新命名用例或全量回归。只读并行核对确认 Core/V2 所需字段和时间聚合已存在。下一业务 M15 抖音 Web/OAuth 登录态管理；M14 layout key 原文/内部 null 与必填 body 边界及其他全量业务/阶段回归/真人原生验收仍开放。原库只读、D 盘产物、旧增量/空 index 保持，无提交推送，详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，布局真实边界）

对照原固定四块/静态占位 UI，移除客户端额外组件列表与恢复按钮、专属 mutation/props，恢复“待添加模块”原文并保留已迁临时拖动。后台布局数据及 typed bridge 不删除：null/省略三字段归一原 true/{}/{}，false/非空对象保留，去掉额外 50 项限制；原 [] 恢复四项和 upsert 语义保持。不增加隐藏/重排/保存 UI 或 AI 能力。

仅复用两个既有定点 RED→GREEN（Core/SQLite 主流程、静态工作台渲染），2 通过、7 未运行；Core 类型与最终 Desktop 类型/生产构建通过，无新测试文件/命名 case/fixture、完整回归或矩阵。下一项原页头/KPI/无资源提醒；layout key 原文 trim 和内部 null 列表/必填 HTTP body 边界仍待核对，不标全部 M14 完成。原 B/S 只读、旧增量/空 index 与 D 盘约束保持，无提交推送；完整 M01–M18/阶段回归/原生手工继续开放，详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，健康面板展示）

原健康组件的最近成功/事件相对时间、未来时间绝对回退、下一轮月日时分秒、缺省 `--`、对象标题和 85/65 分动态健康标签已接现有粉白 UI。复用既有格式函数/颜色 token，无新查询、轮询、后端或菜单。

只扩一个既有 UI 主流程及 fixture，RED→GREEN；夹具返回独立快照，不共享 Query 缓存对象。一次 fork 异常退出保留记录且原因未知，限定检查后原命令一次补验通过（1 通过、3 未运行），桌面类型/生产构建通过，健康面板截图已检查；未新增测试文件/命名 case、全量回归或矩阵。

下一项 M14 布局真实边界：原 UI 只有宽高拖动和静态占位，客户端额外组件列表/恢复入口需对齐；原后台 layout 对显式 null 的缺省语义独立保留，不臆造隐藏/重排/保存 UI。原 B/S 只读、旧增量/空 index 与 D 盘约束保持，无提交推送；完整 M14/M01–M18/阶段回归/原生手工仍开放，详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，当前房间事件聚合）

原工作台按房间查询最近 6 条状态事件，再合并直播/粉丝采集成功与异常、倒序取 8 条。客户端已去掉全局 200 后过滤的遗漏路径，保留原全局调用；事件标题/Java blank 说明回退、可空说明、无事件提示的本次读取时间及 lastEventAt 投影已对齐。健康扣分原规则核对一致，没有新采集/契约/schema。

只扩一个既有真实 Core/SQLite 主流程，RED 复现预期 8 条实得 2 条，修正一个夹具表名笔误后 GREEN（1 通过、1 未运行）；Core 类型和最终 Desktop 类型/生产构建通过。未新增命名 case/文件、全量回归或矩阵。并行只读核对健康 UI，下一项最近成功/事件相对时间、下轮采集格式和动态健康标签；来源回退已一致，不迁移原无 handler 的“更多”为新菜单。原 B/S 只读、旧增量/空 index 与 D 盘约束保持，无提交推送。完整 M14/M01–M18/原生手工仍开放，详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，对象列表完整读取）

原对象列表无 LIMIT；已移除客户端 Subject 默认 100/上限 500/Core 截断/UI 固定 500，省略 limit 默认全量，显式数量限制和原排序保持。粉丝/直播绑定资源原本已经全量，核对后不改。临时 SQLite 的 501 个对象覆盖全量及显式限制，现有 UI 主流程确认传 `{}`。

复用四个既有定点 RED→GREEN（4 通过、12 未运行），Core 类型和最终 Desktop 类型/生产构建通过；限定只读复核无阻断项。没有新增测试文件/命名 case/矩阵或全量回归。按用户最新提速要求，后续默认一个代表性业务主流程加必要编译，不逐层重复验证同一行为；只为实际高风险数据/凭据/退出变更补必要检查，历史回归和累计审查留阶段收尾，不再追加本片测试。

下一业务 M14 工作台采集健康/事件聚合：修正先取全局 200 再过滤造成当前房间事件遗漏，并逐项对照原事件映射。后台布局、工作台其余展示、完整 M01–M18 和原生手工仍开放；原 B/S 只读、旧增量/空 index 与 D 盘约束保持，无提交推送。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，创建输入与绑定缺省）

对照原 DTO/Service/Repository，创建弹幕开关由错误 default(true) 改为 optional，保留省略与显式 false/true；Core 创建绑定判断纳入显式开关。仅名称全省略无绑定，名称+开关有空身份绑定且不新增采集资源，身份+省略开关的首次绑定默认 false。原 UI 仍 UID 必填、名称可选、默认显式 true，不新增仅名称入口；UID 输入复用精确规范化器兼容空白/前导零，移除 browser pattern，required 保留。

只扩四个既有相关用例，RED→GREEN（4 个不同定点通过、12 项未运行），没有新用例文件/命名 case/fixture；Core 类型、最终 Desktop 类型/生产构建通过，限定生产修改只读复核无 C/I。无全量回归或扩展矩阵；原 B/S 只读、旧增量/空 index 与 D 盘约束保持，无提交推送。

下一业务是原无 LIMIT 的监控对象列表与绑定资源读取：客户端 Subject 默认100/上限500/UI硬500仍会截断；粉丝选择已全量，直播选择缺省继续核对。后台布局与工作台展示等剩余 M14、完整 M01–M18 和原生手工仍开放。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，工作台双指标趋势）

对照原 `BilibiliFollowerLiveHeatWidget.vue`，已替换工作台简图：真实时间间距、有效指标时间并集、原时间范围/粉丝热度双轴范围与刻度、分别跨缺失点连线、悬停时间/指标行。粉丝范围用 BigInt 精确有理运算，超安全整数的刻度/提示不舍入；安全值沿原 compact，缺失不填零。响应式 SVG 随拖动测量像素尺寸，不拉伸文字；原平滑程度/低透明面积与现有粉白 token 保持，无新依赖/API/schema。

仅扩一个既有 UI 主流程和 fixture，RED→GREEN（1 通过、3 项未运行），未新增测试文件/命名用例；截图已检查，最终 Desktop 类型/生产构建通过，限定图表/样式/接线只读复核无 C/I。没有全量回归或扩展矩阵；原 B/S 干净只读、旧增量/空 index 与 D 盘约束保持，无提交推送。

下一业务为原工作台名称创建/可选身份/弹幕缺省契约，再逐项核对列表资源分页、后台布局与页头/页脚格式等 M14 差异。完整 M01–M18、阶段回归和原生手工仍开放。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，工作台拖动尺寸）

对照原 `SubjectWidgetBoard.vue`，已接入工作台右下角拖动双列宽度/首行高度：默认 61%/650px、原比例 44–76% 与高度 560–920px、宽板主列 520/副列 360px 下限；<=1180px 单列且隐藏手柄。趋势 SVG 随高度缩放，合并触发 resize；释放/取消/失焦/卸载清理监听与 body 状态。只有当前页面临时尺寸，不增加原 UI 不存在的重排、隐藏或布局持久化。

只在已有交互文件新增一条拖动主流程，RED→GREEN（1 通过、3 项未运行）；最终 Desktop 类型/生产构建通过，限定组件/样式/接线只读复核无 C/I。无全量回归或额外矩阵，原 B/S 干净只读、旧增量/空 index 与 D 盘约束保持，无提交推送。后续继续主流程优先，不设测试数量配额，阶段末再完整回归。

下一业务核对原 `BilibiliFollowerLiveHeatWidget.vue` 的时间轴、双轴范围及悬停数据，保留精确 Long64。后台布局 API、名称创建缺省契约、列表截断/资源分页、其余 M14/M01–M18 与原生手工仍开放。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，监控对象列表与删除）

对照原 `SubjectListView.vue` 的常驻刷新、具名确认、删除成功提示和刷新列表，已补客户端列表入口与 pending/成功反馈。客户端额外补强状态/删除失败反馈和重试，错误不隐藏正常内容；暂停仍仅改变对象，不改变共享监控状态。删除成功取消旧列表读取、更新列表缓存、移除该对象工作台/趋势缓存并清选择；切回工作台不再请求已删除对象，加载/错误/空状态都能返回列表。新建对象先发布实际返回值到列表，避免选择校验误回到旧对象。

仅扩一个既有 UI 主流程，失败反馈 RED→GREEN（1 通过、2 项未运行）；最终 Desktop 类型/生产构建通过，限定本轮三文件只读复核无 C/I。无新测试文件/用例、矩阵、审计或计划文档，无全量回归；原 B/S 干净只读，旧增量与 D 盘约束保持，无提交推送。

下一功能按原 `SubjectWidgetBoard.vue` 实现双列宽度/首行高度的临时拖动：默认 61%/650px，比例 44–76%、高度 560–920px，小屏单列/隐藏手柄。原 UI 没有重排、模块隐藏或布局持久化操作，不把这些计划成已存在业务；后台布局 API 仍独立核对。名称创建缺省契约、列表截断/资源分页、其余 M14/M01–M18 与原生手工继续开放。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，用户工作台改绑）

对照原 `SubjectService.bindSubject/resolveBindingInput` 与 `SubjectRepository.upsertBinding`，修复旧监控 ID 覆盖新 UID/房间的改绑错误：只解析本次请求，再逐字段保留未提供的旧值；只切开关不重新创建资源，`false`/空能力数组按输入保存，旧共享监控与历史不删除。绑定失败保留弹窗、选择和错误，按钮恢复后可重试，消费提交 rejection。

复用一个 Core 主流程与一个原绑定 UI 用例，RED→GREEN；Core 类型和最终 Desktop 类型/生产构建通过。没有新增测试文件、用例数量配额、矩阵、审计/计划文件或全量回归。用户再次要求提速：优先落地原业务，必要检查通过就移到下一功能，不在当前功能继续扩展验证范围。

当时下一项为 M14 删除后的选择恢复、正常列表刷新及操作错误反馈；本轮重新核对原布局 UI，仅有双列宽高的临时拖动，没有隐藏/重排/保存操作。只含名称创建的绑定/弹幕缺省契约、资源列表分页和其余工作台差异仍待核对，不能将本片标成 M14 或 M01–M18 全量完成。原 B/S 只读、旧增量保持、产物 D 盘，无提交推送。详见[交接](2026-09-13-migration-handoff.md)。

## 此前执行点（2026-10-06，长导出与本地保存）

[实现与交接](2026-09-13-migration-handoff.md)：对照原 Controller 同步下载、XLSX finally 清理和 Vue 下载入口，没有新增原项目不存在的取消任务界面。同步快照按墙钟遍历保活全部已接收请求；Main 在活动导出期间用经关联验证的存活帧保护排队长请求，默认短查询/无导出的 HTTP 预算不变。Controller/Core 等活动导出及清理完成后退出/关闭 SQLite。

Main 跟踪准备与保存操作；退出 abort 对话框等待和复制，重复退出在 drain 结束前继续阻止，迟到的准备结果只清理不保存。同目录独占部分文件完整复制、关闭后 rename，失败保留已有目标；检查 D 盘与真实路径、拒绝临时目录目标。取消/成功/失败和清理异常写入脱敏本地审计日志，不保存选址或导出内容。5 个不同关键用例、两项实际回调 RED/GREEN、Core/桌面类型和最终构建通过，限定只读审查无剩余 C/I；未全量回归或原生操作。

等待生成完成不等于立即取消压缩；单条阻塞 SQL/写入超过 90 秒仍有 watchdog 边界，严格有界/大规模性能/超 4GB/原生保存/崩溃恢复与完整 M12/M01–M18 继续保留。下一业务 M14 用户工作台绑定改删与资源复用，先核对原实现，再逐功能迁移；不重复已完成导出取证或扩测试矩阵。原库只读、旧增量保持、所有产物 D 盘，无提交推送。

## 此前执行点（2026-10-06，CSV/ZIP 逐行导出）

[实现与交接](2026-09-13-migration-handoff.md)：三个 CSV 分类已用 SQL 迭代器同步逐行生成；ZIP 的摘要/明细/用户与 manifest 在一次事务写出 D 盘快照，再顺序流式压缩。BOM/CRLF/表头/转义/原 Java whitespace 防公式、固定五文件/schema 2/epoch 时间戳、字段与日编号保持。fflate 不支持写 ZIP64，新增纯 JS yazl 3.3.1 保留原大文件能力；未做超 4GB 实跑验收。

仅扩充已有唯一导出主流程，先 bulk-read guard 失败后通过；复用两项编号规则，共 3 个不同定点通过，无新命名用例/测试文件或矩阵。Core 类型通过；首次桌面构建因定向安装后的依赖链接失效失败，冻结锁恢复工作区链接后类型/构建通过。下一项长任务/保存/取消生命周期；ExcelJS 严格有界、压缩库内部完整取消、原生手工与完整 M12/M01–M18/旧整体缺口保留。原库只读、产物 D 盘、未提交推送。

## 此前执行点（2026-10-06，Excel 逐行导出）

[实现与交接](2026-09-13-migration-handoff.md)：XLSX 已改为 SQL 汇总/事件和用户游标，在同一同步事务写出四表 D 盘快照；关闭事务后按行生成 Excel，不再保留全部事实或 Workbook/writeBuffer。原内容和样式保持，成功/失败清理快照、失败删除自身部分输出，EEXIST 不删除已有文件。编号先于文件 I/O 分配，保留并发调用顺序及失败占号。

未新增测试文件/命名用例：扩充原唯一导出主流程（1000 条合成事实、禁全量读取、部分输出/EEXIST），复用两项摘要和两项编号规则，5 个不同定点通过；类型/构建通过，限定只读审查无新增阻断项。ExcelJS 慢盘内部队列不保证严格有界，未做大规模性能验收。下一项 CSV/ZIP 流式与失败清理；原生保存、完整 M12/M01–M18 及旧整体缺口仍开放，原库只读、产物 D 盘、未提交推送。

## 此前执行点（2026-10-06，Excel 导出内容）

[实现与交接](2026-09-13-migration-handoff.md)：对照原 XlsxWriter/Columns/ExportRepository，确认四表、双行表头、冻结/筛选/列宽、文本 UID 和主要数据口径；修正 XLSX 协议版本写为文本、历史昵称只按普通空格判空、表头/说明行细线。复用一个真实 SQLite→导出文件→ExcelJS 读取用例，先失败后通过；Core/桌面类型和构建通过，无新增测试文件或矩阵。

原 SXSSF 流式行窗口与客户端全量内存生成仍有能力差异，下一项继续此导出链，不把内容对齐标成完整 M12。上游已经裁剪的昵称空白不能由导出恢复，后续采集字段核对仍保留。原生保存、其他格式/失败清理、全 M01–M18 及旧整体缺口继续开放；原库只读、产物 D 盘，未提交推送。

## 此前执行点（2026-10-06，分析看板）

[实现与交接](2026-09-13-migration-handoff.md)：原分析页所有展示区块与选择/粒度/刷新控制已接本地 insight。默认不轮询，启用后请求完成再计时；失败保留同场次成功结果。零金额付费用户、全弹幕阶段边界、场次内覆盖区间与分段整秒、连续 P95、转化时长四舍五入及两项五位占比按原计算修正。用户分层总数跟随当前 insight，不使用旧场次摘要。

仅新增一个 UI 主流程与一个合成事实统计场景，复用两个选场和一个历史付费用例：5 个不同定点通过；Core/桌面类型及生产构建通过。限定静态审查发现的分层人数问题已修正。粉白截图已检查；无全量历史回归、测试矩阵或新增审计文件。

下一项 M12 原导出业务，先 Excel XLSX 内容核对；M11/M13 完整验收、全 M01–M18、真人/原生安装及旧整体验证缺口仍开放。用户再次要求提速：不设最低新增测试数量，不重复历史诊断，必要验证后继续业务。原库只读、产物 D 盘，未提交推送。

## 此前执行点（2026-10-06，直播场次面板）

[本轮实现与交接](2026-09-13-migration-handoff.md)：原最近 20 场、独立详情/Top 100 身份、11 项统计与边界/覆盖说明、五种本地导出、默认 10 秒/1–3600 秒刷新和失败恢复已接通。独立面板与 hook 复用 typed bridge；自动/手动列表刷新链完成后计时，房间/视图过期结果不发布。此前[数据中心](2026-10-06-data-center-migration.md)、[场次识别](2026-10-06-session-instant-identity.md)与[共享材料](2026-10-06-shared-materials-migration.md)实现保留。

仅新增 1 条代表流程，复用原选场/静态用例；三项交互、静态定点、桌面类型与构建通过。限定只读审查无新增阻断项，原版并行换选限制留可选改进。未运行全套历史回归，旧整体缺口不撤销；完整回归留阶段收尾。

下一项原分析看板：信号轨/趋势图、参与阶段/重复弹幕、消费档/用户分层、礼物结构。完整 M11/M01–M18/真人原生安装及原生导出手工验收继续 open，目标 active；原库只读、旧增量和 D 盘约束保持，未提交推送。

## 此前执行点（2026-10-06，弹幕指标时间范围）

[本轮审计](2026-10-06-danmaku-metrics-range-audit.md)：保留原range输入，Java trim/Long64/BMP数字/非正floor1及无效/Duration溢出回退1h；日期减法越界报错。合法超JS范围窗口仅省略恒真下界，不夹窗口；原闭区间/最新2000升序保持，不改UI/数据库版本。

仅2个新Core用例+1共享fixture，复用portable对齐；5个定点通过，28项选择外不计通过。三包types/Main一次build退出0，任务审查与安全结论见审计。没有完整历史套件或矩阵，旧整体缺口保留。

下一原事实写入时间、共享缓存/同步双检/fallback与其它M09；完整M01–M18/真人原生安装仍open，goal active。原B/S/API只读、旧增量/D盘/HEAD4c94959/空index保持，未提交推送。

## 此前执行点（2026-10-06，弹幕连接容量）

[本轮审计](2026-10-06-danmaku-capacity-audit.md)：移除Worker额外100存活session限制，Core按原默认10/floor1/配置值单点仲裁，保留手动自动共享、活动连接复用、操作队列背压与停止保护。只改1生产文件，无新契约/Worker配置。

仅1新贯穿用例，复用4项，共5个不同定点通过；25选择外不计通过。测试适配曾类型/strict结果失败，已最小修正，最终两包types/Main一次build退出0，2路径任务审查通过，Critical/Important无，Minor测试清理异常兜底留阶段收尾，不追加验证。无完整历史检查或矩阵，旧整体验证缺口保留。

下一步M09指标range回退/Long解析、写入时间、共享缓存/同步双检/fallback及其它原业务；完整M01–M18/真人原生安装仍open，goal active。原B/S/API只读、旧增量/D盘/HEAD4c94959/空index保持，未提交推送。

## 此前执行点（2026-10-06，弹幕指标分桶）

[本轮审计](2026-10-06-danmaku-metric-buckets-audit.md)：bucketSeconds原signed32/default60贯通实际Core/SQLite/返回；max(10,raw)仅对齐，raw字段/唯一键保留，无3600上限。追加v15保留历史及依赖/外键，不重算旧桶，不改已发布迁移。probe默认20仅绑定，原无消费者不造任务，15个原输入字段已支持。

仅3个新用例，复用7项定点共10通过；TS108项选择外不计通过。三包types/Main一次build退出0，19路径任务审查通过，Critical/Important/Minor均0，无修复或追加验证。按用户要求减少测试、加快迁移，每功能2–3个关键用例，完整回归留阶段末；旧整体验证缺口保留。

下一步Node100容量、range回退/Long解析、created/updated写入时间、共享缓存/同步双检/fallback等原M09业务；完整M01–M18/真人原生安装仍open，目标active。原B/S/API只读，旧增量/D盘/HEAD4c94959/空index保持，未提交推送。

## 此前执行点（2026-10-06，WBI / Buvid 缓存时长）

[本轮审计](2026-10-06-danmaku-cache-configuration-audit.md)：两项 raw signed32/default43200、成功后 floor300/到期重取已贯通实际弹幕连接与 Python Rank。独立 cacheConfiguration 保持旧五项连接配置；AUTH_EXPIRED 保Buvid强刷WBI、risk清两项、nav匿名，发布前取消保护已接。

只有3个新命名测试，新旧定点共10项通过（其余选择外用例不计通过），三包types/三个Python文件格式及Main一次build通过；27路径任务增量审查Spec/Task quality PASS，无需修复，未重跑验证。用户再次明确迁移太慢：不逐项跑历史套件、不铺矩阵，阶段结束再完整检查。

现13/15配置，余bucket/probe。跨Worker共享WBI、同步双检、多段fallback重新LOGIN以及Node100/其他M09/完整M01–M18/真人原生安装仍open。旧完整检查缺口不撤销；原B/S/API只读、旧增量/D盘/HEAD4c94959/空index保持，未提交推送。

## 此前执行点（2026-10-06，弹幕连接配置与身份策略）

[本轮审计](2026-10-06-danmaku-connection-configuration-audit.md)：五项heartbeat/connectTimeout/useLoginCredential/webLocation/clientVersion贯通shared/loader/Core/Worker/Socket。禁凭据先于读取，原匿名激活重连保持；WS超时独立HTTP，原心跳floor/固定周期/长等待取消、原文与Java blank已接。

仅3个新代表场景、复用原回归，相关验证/types/build通过。task-only审查R1墙钟/R2brace文本已一波修复，未新增矩阵，覆盖验证及必要重建通过，定向确认Spec/Task quality PASS。没有全历史check/累计98dirty审查，旧完整缺口保留。

现11/15配置，余bucket/WBI TTL/Buvid TTL/probe四项、Node100及其它M09继续；probe无消费者不臆造。完整M01–M18/真人/原生/安装未完成，阶段收尾统一回归。原项目/API只读、此前增量/D盘/HEAD4c94959/空index保持，未提交推送。

## 此前执行点（2026-10-06，弹幕连接与认证生命周期）

[本轮审计](2026-10-06-danmaku-auth-lifecycle-audit.md)：每候选重新获取信息/首host，发AUTH后返回AUTHENTICATING，认证回复异步推进；启动前失败才回退，异步拒绝关闭。每次尝试独立SQLite会话、固定Worker connectionId用于停止，发后心跳更新、早到终态/迟到结果保护已接通。保留原共享Widget/工作台running展示规则，仅独立页鉴权期间可停止。

主要复用原有验证，只新增一个Core贯穿业务用例及7个共享契约样例；相关定向、类型、最终build与17文件任务差量独立复审通过，Spec compliant/Approved。前两次真实构建失败和修正日志保留。没有root/全历史重复检查或累计分支审查；旧Desktop整套异常和pending add/trend缺口仍开放。

下一步继续原剩余9项配置及对应消费者、额外Node100容量等M09业务；完整M01–M18/真人/原生/安装未完成。减少测试、阶段收尾统一回归的要求持续有效，不扩张诊断矩阵或把局部绿色当全量完成。原项目/API只读，90个任务前dirty路径的无关内容保留，HEAD/空index保持，产物D盘，未提交推送。

## 此前执行点（2026-10-06，弹幕协议选择）

[本轮审计](2026-10-06-danmaku-protocol-selection-audit.md)：第六项配置 `protocolVersion` 保留原 signed32/default3、环境别名及规范名优先，贯通真实 Core/Worker/认证循环。自动按配置偏好再3/2/1/0去重；手动0..3单协议；其他signed32请求按自动复用活动连接。成功记录实际协议，登录升级与包头版本1保持。

仅新增3个代表性业务场景和8个小契约样例；相关既有定向验证、类型检查、Python修改文件格式检查及一次生产构建通过。独立23路径任务差量复审Spec compliant/Approved；本轮不重复完整check或77路径累计审查。此前Desktop整套异常和旧pending add/trend缺口保留，不称已修复或全量绿色。原项目/API只读、D盘环境和旧修改保留，HEAD4c94959/空index，无提交推送/安装/用户库操作。

下一功能：原连接/认证生命周期（首host、每候选获取信息与创建会话、发认证即返回、异步拒绝关闭而非候选回退），随后心跳/缓存等剩余9配置与其他M09业务。额外Node100连接上限另列容量等价核对项。完整M01–M18及真人/原生/安装仍未完成。

## 此前执行点（2026-10-06，弹幕正文与最近消息准入）

[本轮审计](2026-10-06-danmaku-text-admission-audit.md)：DANMU_MSG 字符串原文与完整 scalar 转换已接真实 Worker 解析/订阅→Core→SQLite，精确整数和观察到的 JDK20 Double 格式单独实现；空白仅拒绝 recent，不阻止事实/原指标/ordinal/session，也不触发 recent 裁剪，永久完整正文/recent500 保持。独立任务 Approved，I1清理 finding关闭，最终串行23文件310项及两类型检查通过。

唯一冻结check会话49085终态exit1/真实CHECK_EXIT1：此前阶段1716项通过（Core1004、Realtime140、Contracts486、Storage71、Browser12、TaskEngine3）；桌面Vitest异常退出3221226505/外层-1073740791，仅RUN，无用例汇总。本次不能算Desktop全过/跳过，也不能沿用旧两普通失败作当前实际清单。另串行补验23448 exit0：全部TS/Black60/isort/mypy18/Python1037/build及真实Electron四bundle/CJS通过；不改完整check失败。旧pending add/trend两缺口尚无解决证据。新异常只读取证，不猜根因或盲目重跑。下一protocolVersion偏好仅只读提案，原15属性余10、完整M01–M18及真人/原生/安装继续open。

用户调整迁移节奏：测试数量过多影响功能进度。下一功能仅新增少量正常/关键失败/退出数据安全代表性测试，以原源码和真实实现为主；完整历史回归及累积分支审查移到阶段收尾，不在每个小切片重复。当前异常和历史两缺口单列保留，不继续用测试扩张阻塞业务，也不宣布已经修复。

## 此前执行点（2026-10-06，最近弹幕保留数量）

[本轮业务审计](2026-10-06-danmaku-recent-retention-audit.md)：第五字段 `recentMessageLimitPerRoom` 已贯通原别名/规范名、项目本地加载、真实Core组装和SQLite；raw signed32/default200、服务floor20/no upper500、存储次级floor1、query200独立。真实501 retained/502永久DANMAKU/502指标、两房隔离/插入序/晚到/重启有回归；启动和非弹幕不裁剪历史。task Spec compliant/Quality Approved，R1/R2/R3测试清理/路径问题全部关闭。另[UID/Worker测试边界](2026-10-06-uid-worker-observation-audit.md)task Approved，仅观察不改生产/预算。

主代理唯一冻结check会话94060终态exit1/真实CHECK_EXIT1：Node2276过/2失败/2278，无跳过，Desktop669/671、57files；Core989/Contracts486/Storage71等全部过。当前完整两失败：pending v2 add marker10s（patch-ready已观察、截止无first-read观察，原显式stop/exit/SQLite断言未执行）、四用户2000点趋势body5s（已到Home tooltip，未见最终complete）。UID12轮本次实际完成、refresh退出/SQLite实际通过，不当旧超时根因修复或失败add替代；finally实际退出仅是清理。

全types/Black60/isort/mypy18/Python1037/build各0；会话75506末尾main错误bundle路径检查致整个补验命令exit1，随后只检查实际Electron四bundle/CJS exit0。未重跑整套求绿/改预算，不改写失败为通过。69路径最终累计独立审查已完整结束：7494行/693413bytes，累计实现质量Approved，无新增生产Critical/Important/Minor；两个whole验收Important保持，merge/ship NOT READY。原B/S/API只读clean、HEAD4c/分支/空index、原60路径保留，产物D盘；无Git/安装/真人/用户库操作。完整M01–M18、其它10弹幕属性仍active。下一业务原字符串正文/Java blank recent准入仅只读提案，未实施；不重派已完成观察任务，独立非重叠业务安排不豁免验证缺口。审查后仅Markdown记账，详细正式结论见业务审计。

## 此前执行点（2026-10-06，六处浏览器启动边界）

[本轮审计](2026-10-06-browser-startup-boundaries-audit.md)：仅Node测试共用有限被动observer，原操作/异常身份、等待/断言/预算/并发/route/clock/cache保持。行为RED7失败与serializerRED1失败/8过→最终9过；定向6files77过、types与独立task Spec compliant/Quality Approved。

一次冻结check退出1：Node2181/2183、Desktop653/655（56files、2failed），无跳过；Core939等全部过。旧六处startup路径本次完成，Delete9/Status10确实执行通过；当前失败完整清单为Workspace UID12输入循环body5000ms超时、pending Worker add marker10000ms未到firstread，原stop/SQLite断言未执行。cleanup实际退出true不代替业务断言；refresh对照通过。补验全TS/Black60/isort/mypy18/Python1022/build各0，不转换原check失败。阶段/限制与完整剩余见审计。完整60路径累计独立审查已结束：slice Approved / merge With fixes / ship No、无新增生产Critical/Important；上述两个验收Important保持，审查后仅Markdown记账。

两项只读边界核对已完成，唯一下一波候选是原12轮UID await有限状态 + 既有FirstReadProbe首次readline属性获取（只是准备，不是线程提交），不新增RPC/payload/import/global asyncio wrapper；尚未实施，不重复旧observer/首读任务或碰绿。最近消息保留配置signed-int/raw默认200、消费min20无upper与独立read200已源代码核对，未实施；原alias RECENT_LIMIT，不把其它11属性完成。完整M01–M18与真人/原生/安装验收保持active；原B/S/API只读、HEAD/index保持、产物D盘、无提交/安装/平台/用户库操作。

## 此前执行点（2026-10-06，首次Worker读取与测试目录保护）

[本轮审计](2026-10-06-worker-first-read-audit.md)：纯首读代理保留原stdin参数/结果/异常、不记录协议内容，auto-target先验证D盘TEMP再创建SQLite、清理检查捕获根的严格后代。行为RED→GREEN；独立task Spec compliant / Quality Approved；定向Python6/Core11/Desktop12及类型/格式通过。生产代码、原业务/预算/并发不变。

只运行一次冻结check，退出1：非Desktop全部通过（Core939），Desktop623过/4失败/19跳过（646，55files/6failed）；Node合计2151过/4失败/19跳过（2174）。本次首次add3489ms实际读入、3538ms child退出，原取消/SQLite不变断言执行通过，refresh亦通过；H2只在本次被证伪，不宣称旧间歇超时根因修复。当前6处浏览器setup/导航缺口：Delete/Status两个beforeAll（19项未执行）、Trend/Workspace两个beforeEach、Widget505 goto、TabRail深色beforeEach。阶段证据和预算在审计内，不豁免或改并发碰绿。全TS/Black60/isort/mypy18/Python1022/build单独补验退出0，不是整套绿色。

下一步优先整体验证失败的完整清单核对；不重派已完成Worker/路径切片，不继续堆未支持Worker导入探针，不启动下一业务掩盖缺口。M06/M09剩余业务、其它11弹幕属性、完整M01–M18与真人/原生/安装验收继续保留。下表及后文为历史切片状态，以本节和新审计为当前验收事实。

完整55路径最终独立审查：slice Approved / merge With fixes / ship No；无新增生产Critical/Important，旧Worker未达断言缺口本次补齐、D预检Minor关闭，当前6浏览器验收Important保留。只读六文件审计已完成；下一候选共用被动有界startup/lifecycle observer，精确透传/安全回归先行，目前只是提案、未实施。不把缺callback当未发生或Node时钟当浏览器耗时。代码冻结、实际源/APIclean与进程0继续核验。

## 此前执行点（2026-10-06，粉丝投影刷新与失败边界）

[本轮审计](2026-10-06-follower-projection-verification-audit.md)：相同后台items读取不重复趋势；显式成功共享读仍排history、失败不排，操作确认不等待history。受控RED→GREEN，独立task复审Approved；最终定向8浏览器文件98项+Worker11项来自两条串行命令，不能合称一条全量检查。诊断异常保证清理/有界旁路，原操作和预算不变。

修改后一次完整check退出1：Node2170/2171、Desktop644/645、55文件、无跳过，Core937/Contracts475全部过。唯一失败是pending add尚未进入HTTP回调，旧取消/无迟到写入断言未执行：已到OS spawn/stdio，Pythonfixture patch-ready5693ms后，到10228ms等待截止仍unsettled且无replay/alive；cleanup11871ms退出观察为false。其他3项旧失败本次没有出现，只有投影反复触发有受控生产修复证据，不能宣称图表/导航稳定性根因已修复。新whole失败不能豁免；后续先补Python入口边界，不重复整套求绿。全部types/Black58/isort/mypy18/Python1016/build另行通过，不冒称check退出0。

完整51项累计增量独立审查已结束：Implementation-slice quality Approved、merge With fixes、ship No。未发现新增生产Critical/Important；pendingadd完整检查未到stop/exit/SQLite断言为Important，auto-target创建TEMP前D预检为Minor，均不豁免。下一轮以一波处理完整清单：最小首次真实stdin读取探针及fixture创建前纯路径guard；探针只是分界，不预先称修复/CPU或import根因，不改预算/并发。原B/S/API只读clean、HEAD4c和空index保持，51项含原45增量保留、实际项目进程/监听0、D环境及构建封装通过；未提交推送/更新安装客户端。M06剩余共享recycler/解析等、原15弹幕属性余11、M08/M09–M18与真人/原生/安装验收保持未完成。下表M06/M09及后文保留原历史检查点，当前验证状态以本节及本轮审计为准。

## 逐项顺序与验收矩阵

原路径以下以 `social-data-monitor/` 为根；客户端路径以本仓库为根。最新提交前验证见[2026-10-06提交快照](2026-10-06-commit-snapshot.md)，下表与执行记录的历史验证结果不改写成当前全量验收。

| 编号 | 原业务及依据 | 客户端位置 | 当前差异/必须验证 | 状态 |
| --- | --- | --- | --- | --- |
| M01 | `backend/.../live/danmaku/parser/BilibiliGiftV2Decoder.java`、`BilibiliLiveGiftV2Tests.java`，提交 `1101952` | `workers/node-realtime/src/bilibili-danmaku-event.ts`、`bilibili-danmaku-connection.ts`，Core 场次事实 | 已补批量解码、金额/UID/事件时间、旧新协议同交易去重、缺 ID 独立接收、坏包恢复；二进制和文本连接消费全部事件 | 实现与自动回归完成；非真人送礼验收 |
| M02 | `backend/.../live/session/service/BilibiliLiveSessionBoundaryService.java`，`441d423` | `packages/core-runtime/src/bilibili-live-session-service.ts` | 已修离线互动建场、历史归属、互动撤销 END_PENDING，Core null REST 保留状态；复核原 HTTP 解析及 SQL 后确认缺失状态转 0、非空落库与原项目一致，不扩展可空采集链路 | 本项实现与自动回归完成；不代表全部场次业务验收 |
| M03 | `BilibiliLiveSessionQueryService.sessions`，`441d423`；DataCenter/Analytics 最近 200 场 | `packages/contracts/src/bilibili-live-session.ts`、`packages/storage/src/control-database.ts`、`BilibiliLiveWorkspace.tsx` | 默认/非正数 20、最大 200；SQLite 时间/插入顺序倒序及房间隔离；场次面板 20、数据/分析 200；查询缓存按 limit 隔离，等待响应不清有效选择 | 本项实现与自动回归完成；不代表数据中心/分析全部业务完成 |
| M04 | `BilibiliLiveSessionExportController`、`BilibiliLiveExportSequence`、`V12__bilibili_live_export_daily_counter.sql`，`1a36b43` | Core export service/name helper、SQLite migration 12、现有 Main 保存链路 | 已接入昵称/UID 回退、上海日期、当日跨格式/场次共享序号、80 码点及原 strip 语义；已分配编号在 IO 失败/未保存后不复用；重开数据库保持。Main 仍使用建议文件名 | 本项代码与自动回归完成；原生保存对话框尚未手工验收 |
| M05 | `frontend/src/views/bilibili-live/BilibiliLiveView.vue` 与 `subjects/widgets/BilibiliLiveDanmuWidget.vue`，`fa2faa6` | `BilibiliLiveDataWidget.tsx`、`ConnectedBilibiliLiveDataWidget.tsx`、Live/Subject workspace | 共用三模式、60 条/2 秒轮询、UID/看过人数、离线监听及协议启停；最新快照、家族/类型排序记忆、当前榜单 4 页刷新、失败保留、迟到响应隔离、展开/收起 | 组件迁移与针对性自动回归完成；独立页面/采集深层语义仍在 M09/M10，详情场次区域在 M11 |
| M06 | `bilibili/BilibiliView.vue`、Follower Controller/Service/Repository、Properties/application.yml | Follower workspace/service/Python worker/storage | 列表/history、采集/重试/资料覆盖、监控/趋势UI、配置/解析/Long64/v2/SQLite v14、用户确认的精确UID及添加/间隔/立即刷新成果保留。本轮对齐原toggle/remove：状态不锁按钮、清共享错误/忽略返回/共享list；删除取消不清错、成功先清选择/对应详情/单user cache、读失败仍已删除，允许旧卡片回流。真实V2/Core/SQLite验证外键隔离/重加重开和自动在途4路径，见`2026-10-06-follower-monitor-actions-audit.md` | 两操作实现与定向验收完成：新19 browser+14 Core共33、主代理8套84项通过，task复审Approved。当时完整check退出1（Node2072/2080，旧4 suites8导航hook）；四行独立缓存未消除问题，冷预打包仅候选。Types/Python1003/生产构建单独通过，不冒称当前全量绿色。普通binary64资料/独立数字message及NDJSON最终帧关联已完成限定收尾验收，分别见`2026-10-07-python-scalar-text-audit.md`和`2026-10-07-python-final-association-audit.md`。直接资料/错误TEXT编码及NUL拒绝已完成定向验证、独立复查、最终构建与新隔离启停，见`2026-10-07-follower-storage-text-audit.md`；本次记录核对5个冻结源码hash一致。raw/failureMeta JSONB、数据库异常/部分提交差异仍OPEN。HTTP承载差异映射、默认recycler共享执行域Important、完整JSON缓存/其它JVM/charset-MIME异常链、增长率负零数值wire、完整属性源/JVM/cache/冲突/indexed及其他独立边界仍未关闭；API日志请求/失败元数据已补齐并升级v16，阶段完整回归及真人/原生/安装验收保留，不等同整模块完成 |
| M07 | `bilibili/components/BilibiliAuthPanel.vue`、QR Dialog、Auth Service/PassportClient/SessionStore、CredentialActivatedListener | Auth panel/service/worker/shared contracts、credential storage、Core/Realtime停机 | UI、Cookie/会话/撤销与恢复已有审计；续补首次激活触发匿名升级、协议/归属保持、部分失败隔离、串行连接操作、撤销与切号原语义、退出及子进程取消。证据见 `2026-09-13-bilibili-auth-core-audit.md`、`2026-09-13-auth-danmaku-link-audit.md` | 登录UI/存储/连接联动代码与自动回归已复审；真人扫码、OS密钥/剪贴板、原生客户端验收仍未完成，M09全部弹幕规则另列 |
| M08 | `bilibili-live/BilibiliLiveView.vue`、Live Monitor/Snapshot Service/Repository | Live workspace/overview/monitor panel/trend board/service/worker/storage | 查询、采集、Python/NDJSON、fixedDelay/退出、监控操作区和趋势已审计；续补loadAll整体发布/失败保留、命令确认先于重读、四项原汇总和同页状态事件；已接自动REST开关/延迟/两级批量及间隔/限流/重试/失败退避的本地配置，续接REST、Rank/WBI及Node弹幕HTTP配置/请求存活与管道断开验证，续接直播storageEnabled及工作台启用依赖，见 `2026-09-25-live-storage-audit.md`；Node详情见 `2026-09-25-danmaku-http-audit.md`。证据见 `2026-09-13-live-query-audit.md`、`2026-09-13-live-collection-audit.md`、`2026-09-13-live-worker-audit.md`、`2026-09-13-live-lifecycle-audit.md`、`2026-09-13-live-monitor-panel-audit.md`、`2026-09-13-live-trend-audit.md`、`2026-09-13-live-overview-audit.md`、`2026-09-13-live-collection-configuration-audit.md`、`2026-09-13-live-collection-policy-audit.md`、`2026-09-13-live-http-lifetime-audit.md`、`2026-09-13-rank-http-audit.md` | 查询/采集/调度/退出及监控/趋势/整体刷新/事件汇总已实现并通过对应自动回归；2026-10-07直播热度/关注数、汇总/差值signed64精确链及安全旧出口已完成，见`2026-10-07-live-long64-audit.md`。普通Double资料/独立message及直播HTTP响应文本/内部错误域已完成，见`2026-10-07-python-scalar-text-audit.md`和`2026-10-07-live-response-text-audit.md`。其他独立数值/边缘解析、Spring宽松绑定、原生验收未完成；共享限流/API耗时及日志隔离已续接，见`2026-09-26-shared-rate-limit-audit.md`；详情场次在M11 |
| M09 | Danmaku Controller/Service/parser、`BilibiliLiveEventIngestionService` | Node Realtime、Core Danmaku/Session services | 自动候选/手动容量、15输入字段、fixedDelay/recent、正文/scalar/Java blank、协议/连接认证/关闭保护、缓存TTL/分桶/容量、range、事务写入时间已接；probe仅绑定。跨Worker共享/同步双检/多段fallback与当前账号重读已接；recent.limit 原 int32/default30/1–200 夹值已恢复 | 功能入口已接，代表流程/types/build有各自通过记录。2026-10-07共享WBI/nav及SPI/DanmuInfo的限定String响应处理完成，见对应审计；普通API错误/字段解析仍OPEN。阶段check Core12失败/2未处理错误和未执行后续阶段、历史整体检查、其他解析/时间/覆盖边界及真人原生未验收，不据此标完整M09完成 |
| M10 | Rank Controller/Service + 原 DanmuWidget | Rank worker/service/contracts、Live/Subject UI | 在线/进房/日周月榜、大航海周/月/陪伴；页码/排序/类型、已保存快照、部分失败、切换不串房；最新分钟分页集合/latest 单页/原头像文本已对齐，旧秒行仅读取兼容不删除 | HTTP配置/WBI固定Referer、长请求/退出、共享许可/排队耗时/日志隔离/Node共享provider已接；四页 SQLite 主流程与构建有各自通过记录。2026-10-07榜单HTTP响应文本/内部异常直传与共享Node/Python WBI/nav转换、nav失败日志归属已完成限定验证和审查，见`2026-10-07-rank-response-text-audit.md`和`2026-10-07-wbi-response-text-audit.md`；普通nav API错误/字段、当前阶段限流/日志异常失败、其它独立边界和真人榜单仍未验收，不标完整M10完成 |
| M11 | Session Controller/Query/Repository、`BilibiliLiveSessionPanel.vue`、`DataCenterView.vue` | Session service/storage、Live 场次/数据页签 | 场次识别/边界/恢复、数据中心和场次详情/Top 100 身份/完整统计/五类导出入口/刷新周期/失败恢复已接通，见最新交接 | 原生导出/真人场景验收保留，完整 M11 未完成 |
| M12 | Export Service + `docs/bilibili-live-session-data.md` | Core export service、Main save | CSV BOM/CRLF/注入保护、XLSX 四表/两行表头/文本 UID、ZIP manifest schema 2、同快照一致性、筛选作用范围、取消及失败清理 | 五格式逐行/ZIP64、保活/排队、退出 drain/异步取消、完整发布及脱敏审计已接；确认自有 Core snapshot、Main part 与 prepared 专属签名目录/双 PID 交接恢复已接。XLSX worksheet64KiB输入背压/逐表消费/阻塞取消已接，代表流程/内容/类型/独立审阅/实际生产启停通过；旧/不可证明残留、同步阻塞/性能及原生验收保持开放，完整 M12 未完成 |
| M13 | Insight Controller/Service/Calculator、`AnalyticsView.vue`、`liveInsightPresentation.ts` | Session insight/contracts、Live 分析页签 | 60/300/900 秒桶；完整信号/趋势/深度/分层/礼物/洞察/质量展示与刷新已接通；已修正本轮查明的统计差异 | 本轮少量业务验证与类型/构建通过；不代表所有公式边缘或真人场景已验收，完整 M13 保留 |
| M14 | Subject Controller/Service/Workbench + `subjects` 组件 | Subject service/storage/workspace | UID-first、资源复用、直播弱失败、绑定改删、subject 状态、采集设置、健康事件、聚合趋势、布局保存/恢复及删 Subject 的资源语义 | enabled 双依赖、原资料域/头像、Long64 身份和24h基线已接。改绑、列表刷新/删除缓存恢复、临时尺寸拖动、真实时间/精确双轴/悬停、创建输入缺省与原 UID 必填、列表全量及绑定资源、当前房间事件/健康投影和时间标签已迁。额外布局 UI 恢复原静态占位；后台 null 字段/全量项、key 原文/80 Unicode 字符、内部 null 列表及公共必填数组边界均已对齐。页头头像/健康条/标签准入、KPI 状态/时间/精度与资源提醒已接。2026-10-07 Subject v3热度/24h差值/历史峰值/趋势精确链和v1/v2任意布局JSON保真已完成。代表流程/类型/构建通过；深层边缘和原生/真人验收仍单列，见最新执行点与交接 |
| M15 | Douyin Controller/Web/OAuth/Credential services、`DouyinView.vue` 及子组件 | Douyin workspace/services、Python OAuth/Node Browser | Web/OAuth 独立；QR 重开/关闭/手动刷新/迟到隔离/失败重试；完整字段抽屉/复制；原子保存/刷新会话/合并/竞争保护；Worker TTL 清理、新 Context 复验、身份及配置均已接 | 代表 Web/OAuth/浏览器/UI 流程及类型/构建通过；真人授权、原生复制导出和重启验收保留 |
| M16 | `/api/platforms/adapters`、`/api/collect/tasks/run-once`、`PlatformView.vue`、CollectTaskExecutor | platform-collection contracts/service、Main/Preload、PlatformCollectionWorkspace | 注册表和真实 account 单次查询已迁移；UID/计数精确，失败/unsupported 保留，证据只传 ObjectRef；原空 Raw/Log/checkpoint 不伪实现 | Core/桥接/UI 主流程及类型/构建、portable schema 同一 TS/Python 样例、真实生产页读取注册表通过；原其余七类 unsupported，不列成待造新业务 |
| M17 | Dashboard/Tasks/AI/Identity/Settings、`/api/ai/mock-summary`、`/api/analytics/summary`、`/api/dev/*` | 隐藏演示导航、runtime health、已迁真实 M13 分析 | 已按原源码确认 Mock/固定数据/无保存/预留；dev health 映射现有 bootstrap/Worker，真实场次分析属于 M13 | 分类完成；未新增原不存在的 AI/身份/设置业务 |
| M18 | 全部可执行业务收尾 | 代表性既有回归、生产包/本地 smoke | 全 workspace 类型/生产构建/Python源格式类型、实际 Main/Preload/Renderer/Core 启动与重启/退出、旧 v12→v15 重开保留已验证；新 unsigned win-unpacked 脱离开发路径的内置 Python 握手/真实 IPC/本地对象重启保留/退出已通过。用户提速要求下不扩矩阵 | 等用户真人扫码/测试目标与原生导出选择；NSIS安装、旧全量超时/精细兼容/大数据/崩溃边界保留，不勾全验收完成 |

## 工作方式

完整迁移继续推进，不将当前波次或单项完成视为全量完成。统一入口是[交接中的当前快照](2026-09-13-migration-handoff.md#当前进度快照2026-10-07)；完成/验证缺口以上方“当前执行点”和对应审计为准。先处理当前阶段Core差异，再续迁API错误/字段等剩余业务，不重派已完成的历史任务。

原弹幕15个输入字段已支持，probe无消费者仅绑定；其它M09及全M01–M18继续open。以迁移为主，只补必要主流程/关键失败验证并尽量复用旧用例，不规定每功能最低新增数量；不默认跑完整文件/历史套件或逐分支铺矩阵。阶段收尾再完整check，旧失败如实保留；不重复已完成取证、累计审查或无限观察器。

### 历史启动控制检查点（以下是当时状态，不作为当前未完成清单）

**当前进度（2026-10-06，逐项迁移进行中）：** 在`codex/follower-monitor-actions`、HEAD`4c94959`继续迁移，保留此前粉丝暂停/恢复与删除等全部未提交增量。M09自动候选/容量及四字段启动控制、首次0/完成后delay已按原源码对齐并经task复审，见[启动控制审计](2026-10-06-danmaku-startup-scheduler-audit.md)与[实施计划](../superpowers/plans/2026-10-06-danmaku-startup-scheduler.md)。最终whole-branch切片质量Approved、merge With fixes、ship No，四项整体验证Important仍开放，候选suite创建前D盘校验为Minor建议；不能据单切片审批称M09或全量完成。

最新修改后完整check退出1：Node2161通过/2165、4旧失败、无跳过，Core937与Contracts475全部通过。先前缺失的删除9项本次完整执行通过；其启动诊断不证明冷启动或稳定性修复。四个旧失败为MainLong64等待http-started后ENOENT、趋势2000点测试体5s、趋势700/900提示poll、Widget第505房间goto2500ms；根因仍未关闭。第一次补充全部types通过后新增Python文件Black失败，仅机械格式修正并13项定向通过，后续Black58/isort/mypy18/Python1016/生产构建另行通过，不能合并宣称check退出0。此前DEBUG2077/2080、auto-targets2076/2089（9跳过）及诊断2087/2089仍按历史执行记录保留。未放宽预算、降低并发、改操作、预热或重复完整check求绿。先处理整体验证Important，分别补Worker启动/请求及浏览器导航/提示证据；其后下一业务候选是M09最近弹幕保留配置，尚未实现。其余11属性、M06共享recycler执行域Important、NDJSON最终帧、完整JVM/HTTP编码/Double/日志/数据库/属性来源及M08、M09–M18全部保留。历史暂停及提交验证见[提交快照](2026-10-06-commit-snapshot.md)，本轮不自动提交/推送，不把切片或本轮结束等同全量完成/暂停。

1. 每次处理一项业务，先读原实现及原测试，再读对应客户端链路；必要依赖包含在该项中，不跨项假冒完成。
2. 保存简短范围与少量业务失败回归，再实现；只跑覆盖改动的验证、必要types/build和task复审，阶段收尾统一 `check.cmd`。
3. 每轮把证据、差异和剩余项写回本表。原仓库出现新提交时记录新基线及新增差异，不覆盖历史验收记录。
4. 本次授权不包括推送远程或修改原仓库；保留用户现有数据，不清空错误场次来掩盖问题。若需历史数据修复，先定义可审计识别条件和备份/预览方案。

验证策略：旧全量失败/异常保留，不称已修复或全量绿色；最新实际结果以上方审计为准。业务迁移不再被历史诊断、完整回归或测试扩张占用，必要安全问题仍修复，阶段收尾统一回归。受控验证不能代替真人平台或原生应用验收。

## 执行记录

- 2026-10-06（弹幕启动控制/完成后调度）：原primitive与storage-only raw消费/首次0/完成后delay核对后，首批RED11业务失败/1已有通过；接共享契约、只读loader/安全Host错误、Service双guard/容量与Runtime可取消单次调度。最终相关Core105/Contracts25/Host15/Python13/types通过；task Important为复用Host目录未显式安全检查，补纯路径RED6→Host22/22+Desktoptypes→独立复审Spec compliant/Quality Approved。主代理一次修改后wholecheck终态退出1：Node2161/2165、四旧失败、无跳过；删除9执行通过。全部types及格式修正后的Black58/isort/mypy18/Python1016/build另行通过，final broad切片quality Approved、merge With fixes、ship No；四项验证Important/候选suite创建前D预检Minor保持开放，下一优先取证，不冒称全量绿色。最终源码/APIclean、HEAD/index/45增量和D盘/无残留检查通过。其余11字段含recent保留min20/no upper差异、协议/缓存/完成域及M01–M18继续；无提交推送、原库修改/启动、真实平台或用户库访问。详见[新审计](2026-10-06-danmaku-startup-scheduler-audit.md)。

- 2026-10-06（删除启动诊断/下一弹幕控制项）：仅新增测试有界phase探针，独立Spec compliant / Quality Approved；一次instrumented whole check中删除9项执行通过，startup4274ms/pending0。Node2087通过/2旧失败/2089，无跳过；旧趋势5s和MainLong64 http-started ENOENT仍在，不称根因/冷启动稳定性或完整绿色。后续types/Python/build本次未执行。[诊断记录](2026-10-06-delete-startup-diagnostic.md)保留前后差异；[四字段启动控制及fixedDelay计划](../superpowers/plans/2026-10-06-danmaku-startup-scheduler.md)已开始实现但未验收，M09/M01–M18不标完成、原仓库只读、无提交推送。

- 2026-10-06（弹幕自动候选与容量）：原Repository/Service/V4/BIGSERIAL/upsert及客户端rowid映射先只读审计；最终RED6失败/2通过，最小修改Storage完整候选与Service跳过手动后的目标收集，最终新9/旧33通过，独立task Spec compliant/quality Approved。保留手动协议与会话、先停auto再启动、无递补/下轮重试和退出取消；不把9项全部说成曾RED，无新schema/配置/Worker/UI。
- 2026-10-06（本轮验证）：DEBUG基线终态2077/2080、Subject清理hook，暖缓存8旧导航失败未复现但不证明冷启动修复。修改后一次check终态退出1：Node2076通过/4失败/9跳过（2089），Desktop617/630，Core884通过。旧趋势5s/提示时序及直播2个初始化hook失败，新粉丝删除beforeAll超时导致9项跳过；全Types/Black57/isort/mypy18/Python1003/生产构建补跑通过。未改预算/并发/操作或重复完整check求绿。细节与D盘日志见[最新审计](2026-10-06-danmaku-auto-targets-audit.md)；完整M09/M01–M18和真人/原生/发布未完成。
- 2026-10-06（最终复审/安全）：24项完整增量独立复审切片quality Approved，无新增生产Critical/Important；merge With fixes，完整check缺口（删除9项未执行）为Important保留，M09测试创建前D盘预检为Minor建议未实现。11:09安全进程/监听/生产标记0、bundles/CJS/diff/新文本尾空白/规则/index核验通过，原/API clean、HEAD4c94959/分支/全部增量保留；新产物D盘，无提交推送/合并/安装或原B/S/用户库操作，不标全量完成/暂停。
- 2026-10-06（粉丝暂停/恢复、删除）：两个原操作分别源码核对→RED/最小实现→GREEN→独立task复审。status准确4失败/5通过；delete初2明确断言后修，完善夹具临时恢复自有patch补6失败/3通过，保留顺序/中间夹具错误记录。最终新19 browser+14 V2/Core/SQLite共33项通过，主代理8套84项通过；后台生产已相同，仅补GREEN审计，不重写规则或schema。恢复next=now但不直接采集；删除先清选择/当前详情/单用户cache，再共享list，读失败仍已删除；Subject/live/另一用户整对象隔离、重加/重开和自动在途4路径通过。
- 2026-10-06（同轮验证）：四旧suite只新增各1 cacheDir，独立复审Approved；原预算/并发/操作的完整check仍退出1，Node2072/2080、Desktop622/630，8旧导航hook未执行业务断言、新33全部通过。缓存隔离未消除问题，Vite默认6个HTML扫描/crawl processing为未证实候选；后续一次DEBUG时间线诊断，不反复重跑求绿。Types/Black57/isort/mypy18/Python1003/生产构建单独通过；10:43安全进程/监听/生产标记0、源/API clean、index空、HEAD4c94959。未提交推送/安装/平台或用户库访问，不标M06/全量迁移完成。证据见[操作审计](2026-10-06-follower-monitor-actions-audit.md)。

- 2026-10-06（本地提交快照）：按用户要求将`b2e5a89`以来累计240项源码/测试/配置/文档增量与新增提交快照一起保存；不推送、不继续下一功能。提交前Node2046/2047通过、完整check退出1，唯一旧趋势5s超时；其余类型/格式/Python1003/生产构建单独通过。安全审计未发现真实凭据、运行数据或生成二进制，原B/S与API参考只读clean。修正README手动刷新说明及本台账active/下一refreshUser陈旧状态；历史失败和未完成项保留，提交哈希以包含[快照记录](2026-10-06-commit-snapshot.md)的Git提交为准。

- 2026-10-06（手动立即刷新，始于10-05）：按原页面/后台全链对照，新增17真实browser+9真实Core/SQLite。最初UI RED后专用refresh替代generic finally/busy/collecting；Core在途interval、relation profile和deleted分类分别RED后用开始user修补，保留collect-only/退出取消/Long64。独立前端复审2个Important加4条RED后闭合，Core无遗留问题；78定向/19 Core通过。两轮check失败日志保留，第二轮Node2045/2047、新17全过，旧容量键盘5s和Worker标记10s超时；原预算5suite46通过仍不宣称根因修复，不降并发或动旧操作/图表。被Node中断的TypeScript/Black57/isort/mypy18/Python1003/生产构建另行全部通过；安全进程/监听/生产fixture0、源/API clean、HEAD/index/diff/CLAUDE/D盘核验通过，240项含151新增保留，无提交推送/安装工具/平台或用户库访问。按用户“本功能跑完就先停止”暂停目标，不进入下一功能；完整M06/M01–M18及真人/原生/发布仍未完成。

- 2026-10-05（采集间隔保存）：先核对原save/load/draft/实际ElementPlus input与后台，专用settings流程不再丢返回值或失败重读；raw文本/整数model及显式dirty独立、commit清dirty→共享list→成功，旧read可覆盖clean、list失败仍成功、success捕获提交值、逐用户busy不锁其他动作。初13 browser RED后修，鼠标/旧readerror第14/15分别RED后补；19纯规则/4真实V2 SQLite补覆盖，后台生产不改。首轮旧容量超5s而新15全部过，原预算隔离过；冻结第二轮完整check退出0，Node2021/Python1003、Desktop580、类型/格式/mypy/生产构建/D盘过，独立复审无未闭重要问题。生产fixture/残留进程/监听0、原库/API clean、index空/diff/新增空白/CLAUDE通过，234项含147新增全保留，无提交推送/工具安装/平台或用户库访问；失败和旧稳定性风险保留，下一refreshUser，不标M06/M01–M18完成。

- 2026-10-05（添加成功链）：原Vue真实函数6场景/生产回调7场景内存核验后，先12项浏览器RED9/3，再实现共享list、读后raw选择、draft归属；成功通知、第14项二次清UID及第15项夹具finally漏计数均先RED后修补。新15及既有定向回归通过，原独立最终业务复审保留。四轮fullcheck失败/测量保留；独立cache先RED再GREEN，readyPage沿用原30s预算。第四次Node1978过/5旧beforeEach超时；五suite诊断后第五次GREEN，补审再发现三Live receiver变更Important，guard RED→恢复原page操作GREEN→独立复查关闭；冻结第六次完整check退出0：Node1983/Python1003、Desktop546、类型/格式/mypy/生产build/D盘通过。最终原测试体/等待归属/预算/并发/业务不变，旧超时未复现而风险不关闭；生产fixture/进程/监听0、源库clean/空index/diff/CLAUDE通过，226项含140新增全保留，无提交推送/安装工具/平台凭据或用户库访问。下一saveInterval，不称整模块完成，M01–M18范围不缩减。

- 2026-10-05（UID输入）：原页面/安装Axios、Controller/DTO/compiled Spring-Jackson离线核验后，用户明确选精确输入兼容而非Number舍入复刻。新增helper158和实际浏览器3共Node161，原生pattern拦截、旧错误优先级和50KB平方回溯均先RED再修复；精确oracle2672零差异，限定复验无新未关闭Critical/Important。最终第二轮完整Node1968/Python1003退出0，类型/格式/Electron构建/D盘通过。原库和历史API参考clean、HEAD/index和既有增量保留，无提交推送/工具安装/平台凭据/用户库/原应用启动；添加后的选择和抽屉迟到竞态明确未修，下一切片单独实施，M01–M18范围保持。

- 2026-10-05（JSON响应）：先读本地card参考与原client/HTTP/service，再以既有compiled client/Jackson/Groovy内存核验。新增Node26/Python170；真实Python/NDJSON/Core/SQLite验证UNKNOWN/PARSE/认证分类、原回退、历史/CAS保留、首JSON/重复字段成功与原同秒upsert。Unicode出口/profile与观察Java20 identifier均先RED后修复，独立同进程/heartbeat/GBK复核通过；最后代码完整Node1531/Python714退出0，类型/格式/生产构建/D盘及生产fixture/残留检查通过。原库只读clean、HEAD/index和所有增量保留，无提交/推送/原应用启动/平台或用户库访问。默认recycler Important、其它JVM与完整charset/MIME、Long64/Double/TEXT编码等明确未完成，详见本轮审计，M01–M18范围保持。
- 2026-10-05（资料文本）：先读本地card API参考、原client/DTO/SQL和Subject消费，再用原compiled client/Jackson内存核验。新增Node93/Python39回归；真实Python/NDJSON/Core/SQLite验证原文、160字符/超空格写入、超长失败与relation保留，真实浏览器验证安全头像/生产CSP，工作台实际创建/查询/聚合/重启兼容。复审两项Important均先RED后关闭，最终完整Node1505/Python544退出0，类型/格式/Electron构建/D盘检查通过，生产本轮fixture0/残留进程0。原B/S和历史API参考clean、客户端HEAD/index保持、全部增量保留；无提交推送/原应用启动/真实平台或用户库访问。普通String/bool/int切片不等于Double/Long64/rootJSON及全模块完成，继续全量目标。
- 2026-10-05（占位符）：原源码/官方版本实现与D盘JAR离线核验后，补共享字符串语法、已知16字段逐来源/查询及三类消费；JSON仍严格、Worker仍只用typed设置。先loader/业务/Host RED后实现；修正Zod4 default来源污染和收尾3类bracket边界。新增Node183，最终第二轮完整Node1412/Python505退出0；独立定向复审与真实JAR一致、生产fixture0/残留进程0。原库只读clean，增量保留，无提交推送/原应用启动/真实平台/用户库访问。完整Spring来源/冲突/indexed边界仍记录未完成，接着推进正常profile等业务解析，不以本子项收缩M01–M18。
- 2026-10-05（绑定）：原Spring3.3.6/6.1.15和编译属性类离线验证后，修正enabled八别名/primitive空值、storage未trim条件、普通int的Java空白/hex/Unicode/int32、raw fixedDelay及条件关闭后合法非正delay。先53份Core差异和TS/Python各5份golden RED，再实现GREEN；增补自动扫描/Host恢复和字符边界。本轮新增Node180/Python9，全量Node1229/Python505退出0；独立literal差分和173项定向通过。原库干净、生产测试标记0、项目残留0，无提交推送/原应用启动/真实平台。嵌套placeholder仍待对齐，不宣称完整Spring输入兼容，整体目标继续。
- 2026-10-05：两仓库基线与上次交接一致，原库仍干净，客户端保留既有增量；开始时项目Node/Python/Electron残留0。续接M06错误响应，新增Python120参数及Core5实际集成；初次RED后修正code/message分类，独立复核再补`+`后Double空白及5000前导零两项RED；定向134/20通过，第二轮完整check退出0（Node1049/Python496），类型/格式/生产构建/D盘及生产fixture隔离通过，原库干净、残留进程0。本轮未启动原B/S、未访问真实平台/用户数据、未提交推送。完整配置绑定与直播parser候选已记录在审计的后续范围中，本切片不结束全量迁移。
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
- 上述 REST HTTP 子项按用户要求提交为本地 `b2e5a89` 后，续补 Rank/WBI HTTP 配置和请求存活/退出；上轮完整检查 Node792/Python278 通过，按用户要求于9月13日收尾，增量未提交。历史交接见 `2026-09-13-migration-handoff.md`。
- 2026-09-25 用户要求“继续”后恢复，保留上轮 Rank 增量；按 `2026-09-25-danmaku-http-configuration.md` 接通 Node 弹幕 SPI/WBI/DanmuInfo 的原 HTTP 配置，分离连接与读取空闲期限，补长请求存活、在途 HTTP/认证取消及父管道失联退出。独立复核发现跨房间 stop 被全局 start 队列阻塞，补失败回归后修复；排队 start 立即取消、停止后重启及控制请求容量均有回归。
- 本项最终完整 `check.cmd` 退出0：Node853（Contracts199/Storage19/Task3/Core326/Browser12/Realtime46/Desktop248）、Python294；较上轮新增61/16项，含补覆盖，不全部宣称为RED/GREEN。类型/格式/Electron生产构建/D盘路径验证通过，独立只读复核无剩余Critical/Important。实际NDJSON子进程覆盖文件/env配置、旧请求兼容、stop及stdin/stdout失联退出，但没有进行真人平台或原生安装应用验收。详见 `2026-09-25-danmaku-http-audit.md`。
- 收尾diff/新增文件空白/生产fixture检查通过，项目测试Worker残留0；原B/S仍fa2faa6且干净，客户端HEAD仍b2e5a89、暂存区为空，未提交/推送/打包/重启安装应用或访问用户数据库。下一独立项是M08跨直播/榜单/弹幕/场次的storageEnabled：原ConditionalOnProperty影响组件/接口是否存在，不能直接实现成“仍采集但不保存”。M09全部弹幕规则及M10–M18、真人/原生验收继续保留，全量迁移未完成。
- 2026-09-25 续补直播storageEnabled和subject-monitor.enabled：按原条件装配及强制依赖，冲突配置开库前安全拒绝；关闭直播不创建相关服务/源/调度/登录升级，24个直播与9个工作台方法明确返回禁用错误，其他模块保留。真实SQLite跨启用/关闭4小时/再启用逐行验证历史、场次、绑定、孤儿连接和导出序号不被关闭操作改变。计划见`2026-09-25-live-storage-configuration.md`，细节见`2026-09-25-live-storage-audit.md`。
- 本项最终完整`check.cmd`退出0：Node893（Contracts215/Storage19/Task3/Core347/Browser12/Realtime46/Desktop251）、Python308，新增40/14项，含补覆盖。独立只读复核无Critical/Important；Minor宿主env污染先复现后修正，并补真实host环境覆盖与文件不变测试。类型/格式/Electron生产构建/D盘检查通过，diff/新增文件空白/生产测试标记排查通过，项目Node/Python残留0；原B/S仍fa2faa6且干净、客户端HEAD仍b2e5a89、暂存区为空。
- 首轮工作台测试曾因漏注入followerSource触发公开UID9资料请求，随后改为明确合成边界并重新验证；未使用真实凭据或用户数据库，不将该请求算实网验收。未提交/推送/打包/重启安装应用。本轮在当前子项收尾；粉丝独立storage-enabled/enabled及完整配置已补列M06待核对，M08其余差异、M09–M18和真人/原生验收继续保留。
- 2026-09-26继续M06独立配置：16个字段只读文件/原别名/规范环境覆盖、开库前错误与双存储依赖、8类粉丝方法禁用、历史/排程/绑定跨重启保留。补原fixedDelay和配置策略、分段可取消长退避；HTTP配置经真实Core/Python并具显式保活/管道失联取消。直播昵称绕开粉丝服务，独立单次查询/原缓存，不依赖粉丝存储。
- 首轮配置10项/策略15项/等待2项/HTTP契约5项/source1项/Python11项/TS保活3项先RED再实现；共享fixture、数据保留、实际Main入口与昵称迟到写库spy等为补覆盖。独立审查P2发现无引用CAS，真实Core/Worker补失败回归后增加无落盘profile契约，普通采集保持强制evidence，复审无剩余问题。旧直播测试扫描计数按原启动即扫描修正5→6，不回退生产行为。
- 最终完整 `check.cmd` 退出0：Node1015（Contracts276/Storage19/Task3/Core402/Browser12/Realtime46/Desktop257）、Python376，较上一存储子项新增122/68项；类型/格式/生产构建/D盘检查通过。diff/新增空白/生产测试标记检查通过，项目Node/Python/Electron进程0，原B/S仍fa2faa6且干净。客户端HEAD b2e5a89、暂存区空，未提交/推送/打包/重启安装应用；所有新回归使用合成响应和D盘临时库。详见 `2026-09-26-follower-configuration-audit.md`。
