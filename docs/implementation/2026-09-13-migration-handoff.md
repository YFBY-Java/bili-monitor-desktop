# 迁移进度与停止交接（2026-09-13）

> 2026-10-11 用户重新要求核对原项目并继续迁移，覆盖10月7日暂停。当前完成榜单6项启动配置，并补齐数据中心/分析看板独立入口；完整迁移未完成，schema18，原B/S只读、D盘输出。最新提交检查点见下。

提交检查点（2026-10-11）：按用户“提交代码推送”要求，将此前累积的业务迁移、启动配置、契约/存储/Worker兼容修复、界面调整及本次导航修复纳入当前 `codex/follower-monitor-actions` 分支。全workspace类型检查通过；导航定向17项与Desktop生产构建通过。完整check仍有Core 3项超时及1个测试Worker异常退出，本检查点不表示完整迁移或全量验收完成。运行数据、真实凭据、工具缓存、构建产物和本地诊断日志保持忽略。下方“未提交推送”描述的是各切片完成当时的历史状态；本次提交和远程同步结果以Git记录为准。

最新导航修复（2026-10-11）：在用户正在运行的 Electron 窗口确认旧、新模块混用：侧栏已有7个入口，旧解析模块仍只有5个；首次点击新入口时 hash 已正确变为 `#live-data` / `#live-analytics`，hashchange 却回退到粉丝监控，同一入口再点一次因 hash 不变而正常。现改为监听器只保存原始 hash，渲染时使用与侧栏同一份当前菜单解析，取消模块级路由集合快照；初次加载优先保留真实 hash。仅新增1个混合模块回归，真实 RED→GREEN，最终串行定向4文件17项通过，Desktop类型及生产构建通过；原运行窗口无需重启已连续首击/重复点击正确，临时调试监听已关闭。一次完整check exit1：Core 3个超时及1个测试Worker意外退出，后续阶段未执行，不代表全量通过。证据：`.tools/temp/20261011-navigation-{targeted,live-check,stale-route-check}.log`。未改业务、schema或用户数据，未提交推送。

最新外观调整：按用户“暗色模式太暗”反馈，新增暖灰粉暗色token（主背景`#34313A`、卡片`#403B46`），提亮文字、边界与表单，导航/主操作沿用樱花粉；修正抖音页局部浅色token与固定白底，二维码白底仍保留。浅色、布局、业务/API/schema不变。仅新增1个真实浏览器主题case，RED→GREEN及同文件5项、Desktop类型/生产构建通过，分析/抖音离线截图已核对；截图`.tools/temp/dark-theme-*-after.png`。一次完整check仍被Core规模超时中断，日志`.tools/temp/20261011-soft-dark-theme-check.log`，不代表全量通过。开发窗口保留运行，未提交推送。

最新用户请求仅调整入口，已新增侧栏“数据中心”/“分析看板”，hash分别为`#live-data`/`#live-analytics`。复用原直播工作区并保留原8个页签，切换不重置已有场次、筛选与分析粒度；折叠键盘、刷新回退、独立业务页路由经实际浏览器与SSR验证。定向4文件22项、Desktop类型及生产构建通过；一次完整check exit1，Core1048/1050仍两个旧规模超时，日志`.tools/temp/20261011-standalone-navigation-check.log`。当前开发窗口保留运行，独立目录包未更新；本轮不继续登录配置，不自动提交推送。

## 当前进度快照（2026-10-11）

本轮完成[榜单配置与功能缺口复核](2026-10-11-feature-gap-and-rank-configuration.md)：开关、两类pageSize、默认maxPages、限流间隔、webLocation从只读启动配置贯穿Core/typed请求/Python实际签名HTTP；关闭不影响直播/不删历史、重启启用保持数据。规范env优先旧alias/文件；请求省略页数不再被Main/Preload提前填1。Core17/Contracts4/Python7/Router与Preload12、workspace类型、生产构建通过；只读复核的一处字符串问题真实RED后关闭，最终C0/I0/Minor0。一次check终态exit1：Core1048/1050仍两个旧规模超时，Desktop及后续未执行，最终loader小改后没有重跑全量求绿。当前生产隔离IPC禁用→Core重启启用/直播可读/配置字节/自有PID0有明确证据，具体最终日志见审计。独立目录包未更新，不代表最新代码。下一明确待迁是B站登录启动配置，不新增原未实现的Mock业务；真人/原生/安装、冷启动/规模及布局策略仍未关闭。

## 历史进度快照（2026-10-07）

当前停止点：[直播采集启动配置](2026-10-07-live-startup-binding-audit.md)。标准环境与旧别名优先、原转换/raw装配条件/调度校验已接；最终Core35/Contracts52/Python62、workspace类型、当前生产构建及实际IPC禁用→Core重启启用/文件字节保持/退出自有PID0通过。check30969终态exit1：Core1045/1048，两个旧规模超时未关闭，另一个旧夹具的错误开关输入已修并由最终定向回归覆盖；未再跑整套求绿。当前构建有本功能，独立目录包未更新；布局选择、性能/冷启动、其他兼容及真人原生/安装继续保留。按用户要求到此停止，不进入下一功能。

最新：[WBI材料与缓存发布](2026-10-07-wbi-cache-publication-audit.md)限定完成：Python抓取nav材料先按UTF16派生再发布成功缓存，短材料PARSE/保留旧缓存，59单元及原UTF8替换保持；仅两源改变，真实RED→GREEN、既有35项及类型/格式通过，固定签名Minor已闭合，复审C0/I0/Minor0。check93298终态exit1，Core1045/1047剩Subject501/粉丝2004两个规模超时；build59877/当前生产23623终态exit0，schema18/五页/实际IPC/证据/重启/退出自有PID0。下方目录版仍是本片前版本，不含本WBI修复；不重派已完成业务，继续原功能收尾审计、规模/桌面稳定性和其余真人原生/交付边界，未提交推送。

最新：[当前平台采集目录版](2026-10-07-platform-account-directory-audit.md)已更新并限定验收：Python22257/目录59233/真实独立运行91268均终态exit0，schema18，包内account/Rank v2能力及account非法模型校验、五页/实际IPC/本地对象重启保留/正常退出自有PID0通过。当前目录 `release/migration-20261007-platform-account/win-unpacked`，旧包保留；没有真实平台/用户库/安装/提交推送。继续业务差异及性能/桌面稳定性；真人原生和全量目标保持OPEN，下文旧包“未包含最新输入”的描述是历史状态。

最新：[平台account输入](2026-10-07-platform-account-input-audit.md)限定完成：新signed64请求保留原Long.parseLong/BMP数字语义，UI原样输入、旧监控正数域不扩大。实际Core/UI两既有流程RED→GREEN，共享TS/Python/portable校验、全TS/mypy23通过；capability旧夹具Important已实际RED→GREEN并v2复审闭合。最终15路径143844字节hash匹配；check84193 exit1、Core1043/1047四个既有规模超时，后续未执行；build22107和生产3345终态exit0，schema18/五页/真实页面与IPC/证据/重启/退出PID0通过。继续最新独立目录版和内置Worker验收；下文signed输入“未迁”是历史记录，已由本片关闭。其他兼容/布局/性能/桌面/真人原生/安装仍OPEN，未提交推送。

最新：[平台失败响应归档](2026-10-07-platform-failure-evidence-audit.md)限定完成：generic account opt-in，真实响应字节/媒体类型经CAS和共享ObjectRef传递；普通粉丝/profile不增加失败归档。旧strict样例容器已恢复原字节并RED→GREEN，最终13路径v2复核C0/I0/Minor0。标准check48412终态exit1，Core1044/1047仍三个既有规模超时；build45468与生产50441终态exit0，新隔离schema18、五页、证据哈希/长度/重启保留及退出自有PID0通过。下一业务是原signed64/BMP数字平台输入，不改已发布监控正数请求。下面此前“失败响应尚未实施”已由本片关闭；其他全量缺口仍OPEN，无提交推送。

当前：[平台单次采集失败结果](2026-10-07-platform-failure-result-audit.md)限定完成：已知平台错误原文和风险、内部安全请求失败、真实Worker无自动重试/无监控创建已接。两源v2复核C0/I0/Minor0，根代理hash/字节2/2匹配；当前build与新隔离生产五页/真实IPC/重启/退出PID0通过，最终session63689 exit0。标准check3284终态exit1，Core1044/1047剩三个规模超时；后续未执行。真实before/冻结/日志见本审计。下一片是原失败响应返回内容，尚未实施；正数ASCII平台输入与原signed64域也未对齐，不将本片标整M16完成。

[被动SQL测量](2026-10-07-business-commit-profile-audit.md)已确认提交占原三个规模case主要耗时：粉丝6015COMMIT共18.24s、五次history读取9.96ms；WAL重置前置提交合计0.35s。没有修改checkpoint/sync、提交语义、预算、并发或工作量，单独case通过不关闭完整阶段超时。后续继续业务并保留性能/桌面冷启动/布局策略/真人原生和最新安装包等全量目标。

当前：[榜单勋章与条目原文归档](2026-10-07-rank-entry-facts-audit.md)已有限收尾，21源复核C0/I0/Minor0，当前hash/字节匹配。真实Worker/Core/SQLite v18保存三项归档，旧历史NULL，原公开字段与独立提交链保持；复用原case实际RED→GREEN，Storage78/Contracts3/Python6/全TS等有各自通过记录。最新标准check session82158终态exit1，Core1044/1047：Subject501创建6752ms、最近弹幕501写入5260ms、粉丝2004查询33733ms三个规模超时，Desktop及后续未执行。当前build及隔离生产五页/真实Rank归档IPC/重启保留/正常退出通过，生产最终session47238 exit0；不是最新安装包/真人验收。下一步先被动测量SQL/提交/WAL耗时，未改变预算、并发、工作量或持久性；布局选择、桌面稳定性、其他兼容及真人原生/安装仍OPEN，目标active。

归档片true-before、21源v1差量/冻结及全部日志在D盘 `.tools/temp/20261007-rank-entry-facts-*`；主代理新核验无漂移。最终采用storage/contracts/python的`*-final.log`及`production-final.log`，首轮夹具/验证断言失败保留不改写。公开数值43源v3冻结仅代表其收尾版本，归档增量修改重叠源后不再拿旧hash要求当前全体相同；已接受数值语义由既有回归和本片实际链保持。

最新接续：[API日志JSONB保存](2026-10-07-api-meta-json-storage-audit.md)已对齐两个新参数的编码/NUL拒绝与日志失败隔离；共享Subject算法不改变既有行为。六源限定复核C0/I0/Minor0，原Storage77/相关Core31及Subject JSON/全TS/格式/当前build/隔离五页与单Core重启退出通过。最新完整check属于本片前裁剪版本，exit1两个原5s超时，不计入本片完整验收。原快照raw_payload/其它部分提交、完整兼容/性能、浏览器、布局选择及真人原生仍OPEN。下一片先核对原raw_payload实际写入和失败链；未实施，不重做API日志/裁剪/懒加载，不重复旧矩阵求绿。

此前：[最近弹幕裁剪收尾](2026-10-07-retention-prune-audit.md)，只有Storage SQL与原case增量。保留所有原数据/排序/事务和预算，限定复核C0/I0/Minor0，定向/类型/当时build与隔离生产五页/IPC/重启/退出通过。标准check已exit1，Core1037/1039剩弹幕5016069ms和Subject批量6483ms，Desktop及后续未由check执行；完整性能和浏览器崩溃/超时不关闭。

最新接续点是[业务页面加载及依赖核验](2026-10-07-workspace-module-startup-audit.md)，不再以旧Subject批量超时作当前唯一失败。21源限定复核与真实五页切换/IPC/重启/退出已通过；标准 check exit1，Core1038/1039剩最近弹幕501原5s超时；随后冷Desktop exit1，676/686无跳过，仍有交互/hook超时和两次空白页创建崩溃。现有Python锁环境已重建，旧环境 recoverable 保留；当前 build/全TS通过，旧目录包未包含最新JSON/懒加载。继续定位裁剪 SQL，浏览器失败根因、完整兼容及真人/原生/安装仍OPEN，不重跑旧矩阵求绿，不改预算/并发/持久性。

此前[工作台 JSON 文本保存审计](2026-10-07-subject-json-storage-audit.md)：五个 Subject JSON 参数的新写入和绑定实际返回已修，代表性 SQLite 流程、相关回归/类型、当前生产构建及真实 Electron IPC/重启保留通过。schema16、原布局事务策略和历史不改；布局部分提交差异已向用户询问。最新阶段 check 与最终测试版本的边界详见该审计。本片没有重打目录包，下面目录版只包含此前创建事务等修复；其他兼容/阶段超时/真人原生仍开放。

最新阶段终态exit1：Core1038通过/1个既有Subject501对象7641ms超原5000ms，Task3/Contracts511/Storage77/Realtime162/Browser12通过；Desktop及后续未由check执行。JSON片限定四源复核C0/I0/Minor0，最后测试定向1项通过，未放宽预算/持久性/并发。配置/101容量本次完整并行通过但旧超时根因未知，不能以本次关闭稳定性缺口。最新隔离生产目录 `.tools/temp/bmd-production-final-JGkDMB` Core35720→14552，真实IPC JSON/NUL/重启保留和退出PID0通过，无平台/用户库/真实凭据；当前源hash见新审计，旧创建事务冻结不代表这次已改变的同名文件。

这是当前接续入口。完整M01–M18尚未验收完成。[资料回填与绑定修改](2026-10-07-subject-backfill-and-binding-audit.md)九源限定复查已闭合；完整check终态exit1，Core1036通过/1个Subject501对象8098ms超过原5000ms。三处夹具与现行桥接/凭据握手对齐后，一次桌面阶段检查exit1，664通过/3失败/19跳过，失败根因尚未全部核定；[阶段审计](2026-10-07-stage-regression-and-directory-audit.md)记录实际schema16独立目录版与各限定证据。随后[直播添加输入](2026-10-07-live-add-identifier-audit.md)已按原有效写法及用户精确身份决定补齐，单一既有流程RED→GREEN、类型/生产构建及两源限定复查通过。旧失败保留，不把页面入口、定点通过或旧包当作全量完成。

以上Core1失败为创建事务片之前的历史结果。最新[创建事务审计](2026-10-07-subject-create-transaction-audit.md)记录已关闭的整体数据库回滚、当前目录包与最新check：Core1035通过/3个原5秒超时，后续阶段未由check执行。新出现的配置/101容量各一原流程在有限诊断中通过，不能代替完整并行条件；Subject501性能与桌面启动/平台采集超时继续开放。

| 项目 | 当前状态 |
| --- | --- |
| 最新创建事务 | [整体回滚](2026-10-07-subject-create-transaction-audit.md)已接：先资料准备，再同步提交监控/快照/场次/日志/工作台/布局/Outbox；准备期间独立添加不被回滚，改绑原流程不改。五源复查C0/I0/Minor0，三个相关文件12项及类型/当前构建通过 |
| 最新阶段结果 | 事务片后check终态exit1：Core1035通过/3个原5秒超时（Subject501、直播批量配置、弹幕101连接），无未处理拒绝报告；新增回滚流程通过。后续Desktop/Python等未由此命令执行，旧Core1失败只作历史结果 |
| 开发状态 | 全量目标active；工作台绑定九源、三处阶段夹具、直播添加两源及Subject直接TEXT四源限定复查已闭合，不代表全量验收 |
| 当前已实现切片 | 直播精确标识符输入、Subject姓名/头像/备注新写入编码，以及最新创建整体回滚。JSON字段和其他失败/部分提交行为继续开放；TEXT片原来未覆盖的创建事务已由新片关闭 |
| 已有业务实现范围 | 粉丝监控/B站登录、直播监控/弹幕/榜单、场次/数据中心/分析/五格式导出、用户工作台、抖音 Web/OAuth、平台 account 单次采集；各模块验收边界见总台账，不以入口存在推断全部完成 |
| 最近验证状态 | check已exit1：Core1036通过/1批量超时；桌面阶段已exit1：664通过/3失败/19跳过，4文件失败。其后直播添加1个既有流程、Subject1个既有流程/Follower存储2个回归、相关类型和当前Desktop生产构建通过；未再次全量重跑求绿。生产新隔离启停/IPC资料重启保留/OS保护原语通过，不是完整原生验收 |
| 接续重点 | 工作台创建整体回滚已关闭；继续原JSONB及其他数据库失败/部分提交、配置兼容和阶段超时根因。真人扫码/获准目标及原生验收保留，不重做已完切片、不铺矩阵 |
| 当前 Git 核对 | `codex/follower-monitor-actions`，HEAD `4c94959f81033eee544211cfce29a18c84fd602f`；累积未提交改动保留，暂存区为空，未提交推送，不回滚或覆盖 |
| 原项目与本地边界 | 原 B/S `fa2faa6` 干净只读；本地 Electron/React/TypeScript Core/SQLite/Python/Node Worker，工具与新数据在 D 盘，不新增业务服务端或 C/C++/Rust |
| 全量与发布状态 | 最新unsigned目录版 `release/migration-20261007-subject-transaction/win-unpacked/BiliMonitor Desktop.exe` 包含直播输入、Subject文本及整体创建事务，脱离开发环境的内置Worker/实际IPC/本地对象重启保留/正常退出已验证；旧包不覆盖。未生成/安装NSIS，真人/原生及全量不标完成 |
| 本次安全核对 | 直播添加2源与Subject文本4源true-before差量/当前hash分别匹配；最终隔离数据 `.tools/temp/bmd-production-final-nQrBbk`、Core61096→53132、退出自有PID残留0。旧增量/空暂存区保留，原B/S/API只读，D盘证据，无用户库/真实凭据/全局记忆写入或提交推送；历史冻结只对应其收尾版本 |

### 最新完成的限定切片：工作台直接资料文本

[本片审计](2026-10-07-subject-direct-text-audit.md)记录原SubjectRepository/DDL、真实RED→GREEN和四源限定复查。三个直接TEXT参数共享现有编码，不改变历史或JSON、事务/Outbox；既有Core1/Follower2及相关类型、当前生产构建通过。实际生产Main/Preload/Core IPC创建→Core重启→资料保持→删除→正常退出通过；自有隔离密钥的实际safeStorage保护原语验证通过，无密钥输出。跨资源创建回滚、JSONB/其他字段、完整回归与真人/原生保持OPEN。

### 此前完成：Buvid/SPI与DanmuInfo响应处理

按原 `BilibiliAnonymousCookieProvider.fetchCookie`、`BilibiliLiveDanmuInfoClient.fetchDanmuInfo`，SPI和DanmuInfo启用已迁移String响应转换，先校验MIME/charset再分类HTTP失败。SPI普通HTTP失败为UNKNOWN/可重试；DanmuInfo429为RATE_LIMITED，其余HTTP失败为UNKNOWN/可重试，原消息及安全端点/状态保留。内部转换错误不触发匿名fallback、不清成功缓存；缺省Latin-1资料/Token实际进入LOGIN AUTH包。未改正常JSON/API字段解析、协议/取消策略、schema或依赖。

只新增一个代表流程RED→GREEN；最后复用3项通过、9项过滤未运行，Node类型exit0。3路径限定复查C0/I0/Minor0；最终Desktop类型与生产bundle构建通过，新D盘 `.tools/temp/bmd-production-final-WnU9wa` schema16、精确Live/Subject桥接、真实注册表、单Core重启及正常退出自有PID残留0，自动平台/OAuth关闭、无用户库或真实凭据。不代表真人/安装包/整模块或阶段完整验收。

记录时3个当前hash/字节与冻结manifest一致；任务收尾489源中仅3路径改动，其余486保持。持久范围、完整检查失败清单和D盘证据见[本切片审计](2026-10-07-danmaku-response-text-audit.md)。本次记录不继续修复阶段失败，也没有提交推送。

### 最近完成：共享WBI/nav响应转换

已对照原 `BilibiliWbiSigner` 与 Rank `fetchWithLog`。Node仅WBI/nav启用String响应转换，Python nav复用既有解码器；响应头转换错误优先于HTTP状态分类，安全固定错误不携带原响应内容。普通nav HTTP失败保留原UNKNOWN/可重试/消息及白名单端点和状态；缓存只在成功后替换，强刷失败保留旧缓存。Referer、匿名请求、取消和其它业务规则不扩展。

仅新增Python和真实Core各一个代表流程，复用现有用例。复查修订前Python2、Node21、Core5及相关类型/格式通过，Desktop生产构建和 `.tools/temp/bmd-production-final-8o7qsw` schema16/精确桥接/注册表/单Core重启/正常退出PID0通过；自动平台/OAuth关闭，无用户库/真实凭据。这些是修订前证据，不是当前源码的完整验收。

**审查问题已闭合：** v1发现nav 403日志被误记榜单端点。按原Java修正真实测试期望后，本次再次实际RED；Core最小修复只允许精确白名单nav异常端点优先，其余保持原请求端点选择。修复后同一实际流程GREEN1/3过滤，Core类型exit0，v2限定复查C0/I0/Minor0。内部转换guard仍先于日志，没有退化为强制WBI/备用接口或假部分成功。

root修复后Desktop类型/全部生产bundle构建exit0，新 `.tools/temp/bmd-production-final-jOhL4a` schema16/精确桥接/真实注册表/单Core重启/正常退出PID0通过，自动采集/OAuth关闭，不是目录包或真人验收。正式实现与证据见[本切片审计](2026-10-07-wbi-response-text-audit.md)；不重做已完成任务或扩编码矩阵。

任务材料在D盘同前缀before/brief、v1/v2差量和manifest，最终v2为12路径/53042字节；WBI收尾时12个hash匹配，v1其余10源不变。该收尾时任务外477源仅Storage测试独立改变，剩余476保持。后续弹幕响应切片修改了其中两个同名文件，不能将旧v2称为当前全部源码冻结，也不能用旧hash覆盖后续修改；不以临时材料代替持久交接。

### 历史阶段完整检查：本批核定前的Core12项失败

WBI与弹幕响应切片后，仅运行一次阶段完整 `check.cmd`，确认终态exit1，D盘日志 `.tools/temp/20261007-http-phase-final-check.log`。Task3、Contracts510、Storage77、Realtime161、Browser12通过；Core1025通过/12失败（10文件），另有2个未处理拒绝。两项Core测试达到原5000ms预算；其余为状态/解析/时间文本/配置/限流及日志异常等观察差异，完整文件与现象见最新审计。尚未定位根因，不能统一归为测试陈旧或生产缺陷。

前轮 `.tools/temp/20261007-http-phase-check.log` 曾在Storage终止。该Number `200`/bigint `200n`期望已单独修正，当前Storage77全部通过；旧失败日志不改写。本阶段在Core失败后终止，Desktop及后续全workspace类型/Python格式/类型/测试/构建未由该命令执行；之前单独构建/启停只证明各自范围。没有放宽超时、跳过用例或反复重跑求绿，旧桌面异常退出、Worker启动和四用户趋势超时未据此关闭。

### 最近完成：直播与榜单HTTP响应转换

- 直播四端点和榜单三个端点复用既有响应头/正文转换：先校验MIME/charset，再分类HTTP失败，成功正文按原String规则解码；空体仍为PARSE，CAS保存原字节。
- Worker安全返回内部转换错误并保持存活。Core不记录平台失败、不重试/强制WBI/回退；榜单外层仅聚合原平台异常，内部错误直接拒绝刷新。普通部分失败、页面/排序/ID/分数/缓存/认证规则不变。
- 榜单只新增两个Python分组场景和一个实际Core/Worker/SQLite流程；复用既有测试，最终Python34/Core8通过。有限审查通过，但不代表完整M10或全量迁移完成。
- 持久证据见[直播审计](2026-10-07-live-response-text-audit.md)及[榜单审计](2026-10-07-rank-response-text-audit.md)。榜单任务前快照/差量/清单留在D盘 `.tools/temp/20261007-rank-response-text-*`；正式交接不能只依赖临时文件。

### 此前接续顺序（已由上方本批审计更新）

1. 先读取本阶段12项Core失败清单，对照原项目逐类定位，复用已有失败用例做有限验证，不猜根因或批量改期望；本次未继续修复。
2. Live/Rank/WBI及SPI/DanmuInfo的限定String响应切片已收尾；后续普通nav/SPI/DanmuInfo API错误/字段、其它响应字段/配置、JSONB/部分提交等独立差异继续开放。不要扩大为无穷JVM/异常编码矩阵，也不要据已有入口宣称100%。
3. Storage旧断言已修且本阶段全套通过；Core失败及未执行的后续阶段仍需接续。阶段收尾记录实际终态，不逐功能重跑完整套件求绿。历史桌面异常退出、Worker启动和趋势超时不能因定向通过标成已修复；性能/同步SQL及最新schema16目录包仍待验收。
4. 真人B站/抖音扫码、获准UID/直播间、OAuth正式授权、原生保存/剪贴板和安装需用户配合。原Mock/静态演示/预留及无消费者probe不扩造成新业务。

本次只同步停止记录，未继续新功能或修复上述阶段失败。没有提交推送、启动原B/S、重新打包、接触真实凭据或更新全局记忆；项目规则不变，全部累积改动保留在D盘工作区，完整目标仍未完成。

数字文本任务前483源仅7个声明路径变化、另有3新文件；最终10路径报告/审阅包/当前SHA一致、限定空白检查通过。root 最新生产启停目录 `.tools/temp/bmd-production-final-FXqJNf` schema16、单Core重启、精确桥接/注册表及正常退出PID0；自动平台/OAuth关闭，无用户库/真实凭据。它不是下一响应归属源码或独立安装包的验收。原 B/S/API 干净、客户端HEAD/分支/空暂存区保持。

### 最近完成：Python 数字资料/错误文本兼容

- 原 Follower/Live `JsonNode.asText(null)` 的三个独立入口接入纯 Python 转换；保持原文、blank/fallback、URL/长度、Long/ID/status、重试和错误分类。基线明确为已有 Node 的 JDK20 观测，不声称所有 JVM 一致。
- 原三轮 RED 后，有限 GREEN 已证明 `1.0E7` / `-0.0` 成功资料、`1.0E-4` 独立失败 message、API元数据/历史保持和SQLite重开；既有14资料项、Python定向70、Node14token及相关类型/格式通过。新增测试对既有bigint/错误前缀的两处预期已纠正，未改生产计数/错误规则。
- 独立任务复查无C/I/Minor；root最终构建及新实际生产启停通过。首次smoke误把分页列表当数组，只修脚本后通过，真实失败记录保留。
- 实现、证据与保留边界统一见[本项审计](2026-10-07-python-scalar-text-audit.md)。D盘 `.tools/temp/20261007-python-scalar-text-{report,review,review-package}.md/txt` 与 brief/design/before 保存细节；临时材料不随Git提交，不作为唯一交接文档。

### 最近完成：Python 最终响应归属

实施者 `python_final_association_implementation` 已停止。`ndjson-python-worker-transport.ts` 在非 alive 最终帧清理 timeout/pending 前核对成功类型或 worker.error、trace/correlation，以及提供时的 causation；不匹配合法帧不结算、不续期，省略 causation 仍可接收。现有存活帧、无效 JSON/Envelope、超时、停止和错误映射未改，不新增 RPC/状态机。

- 已有真实 stdio 场景先证明错误 final 导致提前结算（RED），修复后等待正确 final、匹配错误映射及后续 ping 均通过；最终 transport 文件 3/3、Core tsc、两夹具 Black/isort 均 exit0。早期夹具解析失败不冒充行为 RED，报告保留了纠正过程。
- 改动范围仅 `packages/core-runtime/src/ndjson-python-worker-transport.ts`、同目录 `.test.ts`，以及 `workers/python/tests/fixtures/final_association/bmd_workers/{runtime.py,__init__.py}`。root真实486源差量只有两个已有文件改变、两个新文件，其他484保持；独立复查当前四文件hash与冻结报告一致，Spec compliant/Task quality Approved，无C/I。测试标记+50ms管道消费假设为Minor，保留到阶段/最终审查。
- root本次transport3/3和最终Desktop类型/生产构建exit0；新 `.tools/temp/bmd-production-final-3Vf4zE` schema16、精确桥接/注册表、单Core启动重启/正常退出PID0通过。自动采集/OAuth关闭，无用户库/真实凭据；不是目录包/真人/阶段完整check通过。任务报告、before、review-v1.txt与review.md在D，正式结论见[本项审计](2026-10-07-python-final-association-audit.md)。

### 最近完成：Follower直接存储TEXT字段

实施者 `follower_storage_text_implementation` 已结束并冻结5个文件。仅新nickname/avatar/profile/lastErrorMessage写入：孤立UTF16单元转ASCII `?`，正常emoji、字面U+FFFD与原文保留；实际NUL用不含输入的本地错误拒绝。昵称先编码再160字符规则，错误先截UTF16至900再编码。当前schema16，未改Worker解析、重试/分类、协议、迁移、其它业务TEXT或历史数据。

实施者初始实际RED→GREEN、20个唯一用例（新增6、复用原昵称14）、Storage/Core类型及单夹具Black/isort exit0。root本轮Storage2通过；初次Worker场景在API日志前缀断言失败，原失败保留。确认测试DISTINCT任务查询无序、随机UUID索引可使新日志先列；只改fixture首插入次序与两个既有场景的逆序有效UUID，确定性RED2→GREEN2。root最终相关2实际流程通过，完整业务/API/artifact/CAS/重开断言保持，未改生产日志排序。

独立初审/复审Spec compliant / Task quality Approved，无当前C/I/Minor。报告Minor已核对并收窄：旧CAS字节重开前检查、新CAS字节重开后检查。root最终Desktop web/node类型与全部生产bundle构建exit0；新 `.tools/temp/bmd-production-final-z8egJG` schema16、精确桥接/注册表、单Core启动重启/正常退出PID0通过。自动平台/OAuth关闭，无用户库/真实凭据；不代表目录包/真人/阶段完整check。真实任务前488源仅5路径变化、其余483保持，review-v2/报告/当前hash一致、限定空白检查通过，正式结论见[本项审计](2026-10-07-follower-storage-text-audit.md)。

最终冻结文件（2026-10-07收尾重新核对一致）：

| 路径 | SHA256 |
| --- | --- |
| `packages/storage/src/follower-profile-storage-text.ts` | `62c9ab8c77b2f04d8b46b668eea7b20e98997aa649dfe0f00958a7dec3b1d10f` |
| `packages/storage/src/control-database.ts` | `cb58116e2d27c574ceaacd98cd4a99594dbe0c1b72ac52529db24c03f6a916e2` |
| `packages/storage/src/follower-profile-storage-text.test.ts` | `9329087dbe7b76d25fcea6c515b05a428cc98d12551c0545fe0e0399ba200a0c` |
| `packages/core-runtime/src/bilibili-follower-profile-text.integration.test.ts` | `9f2ae1c1a847faf318691e1d758f5b0061ed010a506ff14c58c2c02e4f4d3d6f` |
| `workers/python/tests/fixtures/follower_profile_text/sitecustomize.py` | `efc0b87a8bcf1e7380a8378673a754775571325891bc69e409bc449e6e7a2f5e` |

恢复材料均位于D盘 `.tools/temp/`：`20261007-follower-storage-text-{brief,report}.md`、同前缀before/manifest.json（488源/3,915,006字节）、最终review-v2.txt及manifest（5路径/29,511字节）、review.md（两轮结论），设计为 `20261007-pg-text-boundary-design.md`。旧review-v1保持历史，不能拿旧hash覆盖修复后版本；临时材料被忽略、不随Git提交，本审计与本节保存持久结论。

以下为Follower存储收尾时的历史接续顺序；直播及榜单HTTP现已完成，最新队列以上方快照为准：

1. 不重派已完成TEXT或响应归属任务；保留冻结源码及报告证据。
2. 对照原直播RestClient String转换，准备真实任务前快照与有限要求，再实施响应编码/HTTP错误域。Boot3.3.6/Framework6.1.15源码证明先验证MIME/charset，再HTTP status handler，成功后String转换；旧“先解码整个body再判status”概括不适用。
3. 少量正常/关键失败流程与独立复查/构建后，再继续其它原业务差异，阶段末统一完整check/发布与真人原生验收。下一项尚未实现，不借本项构建标其完成。

保留当前monitor/snapshot/artifact登记/outbox原子事务及独立已成功API日志/CAS，不清洗协议/原始字节或修复历史字段。原raw/failureMeta JSONB接受域、数据库异常/SQLSTATE及可能的monitor先写部分提交差异仍OPEN，不把本字段适配写成完全等价，不擅自拆当前事务。

之后有限解析/HTTP编码/配置等独立边界；阶段全量回归/历史失败、阻塞SQL/文件写入和性能、最新目录包、真人扫码/获准目标及原生保存/安装仍待处理。原Mock/预留不扩造成真实业务；没有可信全量完成百分比，不用入口数量换算完成率。

不重派已完成响应归属、数字文本、导出恢复、XLSX背压、Rank夹具、Live Long64或TEXT；少量关键验证，不逐功能铺矩阵。完整M01–M18尚未验收完成；未提交/推送、更新安装客户端或接触用户库/真实凭据。

## 上一已完成功能停止点（2026-10-07，直播计数精确链路）

Live v2 / Subject v3 已接通 Python→Core→SQLite→Main/Preload→Renderer；signed64 计数、汇总/差值、历史峰值及精确图表保持原业务，旧接口安全兼容，超出安全数值域明确拒绝而不返回舍入值。布局任意 JSON 保真、长轴标签及精确 title/aria 的复查问题全部闭合，独立 Spec compliant / Quality Approved，无当前任务未关闭问题。

修复后定点流程、独立类型检查和 root 最终 Desktop 生产构建通过。实际客户端在 D 盘 `.tools/temp/bmd-production-final-XGdKas` ready/schema16、Live v2 精确零值/Subject v3 桥接、单 Core 重启和正常退出/PID残留0通过；自动平台/OAuth关闭，未访问用户库或真实平台凭据。431任务前源/62本片路径冻结核验与限定空白检查通过，原 B/S/API仍干净只读、HEAD4c和空index保持，无提交推送。

详见[本功能实现与验证](2026-10-07-live-long64-audit.md)。本段保留 Live 收尾时的历史结果；普通 Double 文本、NDJSON最终帧关联及Follower直接TEXT字段此后均已完成限定收尾验收，当前状态以上方快照为准。阶段全量检查/历史问题、其他独立边界、性能、最新目录包及真人/原生验收仍开放，不宣称 M01–M18 全部迁移完成，不重派已完成任务。

## 此前续迁进度（2026-10-07，XLSX 表数据背压）

XLSX任务已完成并冻结，不重派：worksheet-only双向64KiB标准流、即时StringBuf转换、逐行drain/逐表完整消费、取消/错误关闭后清理。一个真实慢输出流程先RED489>256，再GREEN停顿/释放四表/阻塞取消；1新增+3既有内容/取消通过，Core类型通过。独立Spec compliant/Quality Approved，无C/I。root新Desktop类型/生产构建、实际schema16/单Core/重启/注册表/退出PID0 `.tools/temp/bmd-production-final-ZxdbhH` 通过。报告 `20261006-xlsx-backpressure-report.md`；真before2和review package保留D，旧prepared/Rank任务不重派。

已启动Live Long64实施：唯一实施者 `live_counter_long64_implementation`，brief `20261007-live-long64-brief.md`、true-before431源+manifest `20261007-live-long64-before`，report `20261007-live-long64-report.md`；恢复先读report/ledger，不重复派已完成导出任务。设计 `20261006-live-long64-design.md`：Live v2/Subject v3 counter精确链及安全旧出口，未验收；root已核对原解析、LongStream.sum、Long差值和历史peak。随后普通Double文本（只读设计 `20261007-python-scalar-text-design.md`）/Python最终帧关联，见 `20261006-remaining-business-closure-audit.md`。功能入口已迁但全量兼容/当前阶段check/最新目录包/真人原生未关闭；同步SQL/写入/单行/并发资源另计，worksheet有界不等于常量RSS。目标active；原库干净只读、当前HEAD4c/空index、D输出，无提交推送。

## 此前续迁进度（2026-10-06，prepared 成品交接）

原 `fa2faa6` 只读，客户端 `4c94959` 累积工作区/空index保持，无提交推送、原服务/用户库/真实平台/凭据。D盘工具与合成数据，原五格式/schema2/事务快照/编号/建议文件名和UI契约不变。

- `export-prepared-workspace.ts`：专属目录内先唯一HMAC owner写入/sync，再固定output；可信Main UUID/PID由Main→fork env→Core校验注入，marker及root/workspace身份、白名单、链接和输出身份检查。Main alive保护Core restart；启动开库前仅两个PID分别ESRCH回收。恢复审计attempted失败不删，正常按expected owner清理，不递归、不触碰saved/legacy。
- Main保存接入窄helper subpath，进入finally前核验；对话框后再核对原output身份，实际替换输出RED后修复。正常保存/取消/失败保持`.part`日志与完整关闭/rename。共享安全原语抽取，旧snapshot规则独立保持。
- Core真实Main/Core双进程和Main私有保存仅两个新增代表流程，复用内容/退出/part/保活/host。最终Core5/Main定点6通过、31filtered不计通过，两包类型通过；13路径独立审阅Spec compliant/Quality Approved，无本片C/I。root新Desktop类型/生产构建、实际`.tools/temp/bmd-production-final-4qEFsn` schema16/单Core/重启/注册表/退出记录PID残留0通过，自动平台/OAuth关闭。
- 未豁免本轮额外rank用例两次失败。只读证明host fixture缺现行Node entry→Python transport前不可用；prepared任务前后装配方法一致。raw cache=-8期待与缺省43200也静态冲突。仅原case新增9行合成Node依赖/明确配置、72原断言保持；定点1通过/21filtered和Desktop类型通过，独立Spec compliant/Quality Approved无C/I。当前该失败已关闭，不重派prepared/fixture或据此声称全22项/WBI/真人通过。

当前报告：`.tools/temp/20261006-prepared-export-report.md`、`20261006-rank-startup-availability-diagnosis.md`、`20261006-rank-fixture-report.md`。2026-10-07已启动XLSX背压实施，brief `20261006-xlsx-backpressure-brief.md`、before2目录`20261006-xlsx-backpressure-before`，尚未验收；恢复时先读其report，不重派prepared/fixture。随后直播响应Long、普通Double文本、Python最终帧关联，详见`20261006-remaining-business-closure-audit.md`。原生/真人、阶段check、当前目录包、同步SQL/性能及保守残留限制继续开放，full goal active。

## 此前续迁进度（2026-10-06，导出自有临时文件恢复）

本片继续原 `fa2faa6` 只读、客户端 `4c94959` 累积工作区；未提交推送/启动原 B/S/访问真实平台或用户库。对照原 Export Controller/Service/XLSX Writer 的事务快照、五格式及正常 finally；本片只适配桌面文件生命周期，不造新 UI/导出业务。

- Core `export-snapshot-workspace.ts`：ZIP/XLSX owner v1 与 strict Zod，随机 job/Core PID、类型、相对名称及根/工作目录稳定身份；先 marker 后快照。启动开库/Worker 前只在当前 exports/temp 恢复已确认死亡的自有目录，拒绝链接/未知成员/替换，固定名单非递归清理。prepared 平铺输出、legacy 无标记目录和用户成品不删除。恢复删除前 attempted 审计安全 append+sync，失败不删；完成后 removed，完成审计失败准确记录 removed_audit_unconfirmed。
- Main `session-export-journal.ts`：现有 key 派生独立 HKDF/AES-GCM/AAD journal，加密敏感 part/父目录，不记录 savedPath/内容/key。wx FD 所有权、root/parent/file 身份、journal sync/close 成功才复制，输出关闭后核验身份再 rename；清理失败保留记录。主实例/key 后、Core/IPC 前恢复一次；仅 dead Main 的完整有效 journal 能精确回收 part，先持久 attempted，再删除，无目标目录 glob。
- Main startup barrier 防早到 OAuth 抢先初始化；只读复查查明 !isRunning 否定在途 start 的双 fork 路径，真实源码函数 RED starts2→GREEN starts1，独立在途 Promise 共享后失联仍可重启，最终复查 Critical/Important=0。退出前后 guard 保留，Core restart 不执行 Main recovery。
- 只新增两个代表流程：Core 使用真实退出子进程 PID 和实际文件；Main 在 Node 子进程运行实际保存函数并于复制中强杀，不声称这等于实际 Electron Main 强杀或原生保存对话框验收。活动文件、同名模式无关文件、完整已保存文件与 legacy prepared 保留。恢复缺失、并发 root mkdir EEXIST、审计缺失实际 RED 后 GREEN；最后 root Core4/Main3 共7通过，Core类型及最终 Desktop类型/生产构建通过。复用编号/计数回归，不跑全量/格式矩阵，不重复计数。
- 最新生产 Main/Preload/Renderer/Core 在独立 D 盘 `.tools/temp/bmd-production-final-aKQdSb` ready/schema16、真实平台注册表、启动/重启各仅1 Core及正常退出/记录PID残留0通过。首次单Core断言误用 ProcessMetric.serviceName，采样实际 name=BiliMonitor Local Core、serviceName=node.mojom.NodeService，并核对已安装类型；仅修脚本字段后同断言通过，业务未改。自动采集/OAuth关闭，无真实凭据/平台/用户数据。
- 中间测试 harness finally 重复等已退出 signal 子进程导致一次超时，已修；早期 D 盘合成 `.tools/temp/bmd-export-save-i6evpE` 精确删除被自动审查拒绝，未绕过，保持保留。最终测试 fixture 正常自清。Core/Desktop 直接链接现有锁定 zod4.4.3，offline/ignore-scripts，无新下载或工具链。

下一片 prepared ownership 已核对方案但未写代码：专属目录先 HMAC owner，再固定 output；Main instance/PID 从 Main 注入，不接受 Renderer输入。Core startup 必须 Main+Core 双 PID 都明确 ESRCH 才清，Main活着即保护 Core restart/保存对话框；正常 Main finally 按 expected owner 清理。保持公共 Prepared 契约、五格式与编号，legacy flat 输入兼容但不恢复旧文件。不加 ACK/state machine/第二 journal。

本片不关闭全部崩溃恢复：marker/journal 落盘前与 marker删后空目录、旧无标记/PID复用/权限不明均保留；Node check+unlink 不原子抵御恶意换路径，文件 sync 不是断电事务。同步 SQL/写入、严格有界/性能、旧完整检查、其他精细兼容及真人/原生验收继续开放。旧目录包仍为本片之前 v15，目标 active，尚非全量完成。

## 此前续迁进度（2026-10-06，API 日志、响应归档与导出退出）

本片继续只读原 `fa2faa6`，客户端 `4c94959` 累积工作区、空 index 保持；未提交推送/启动原 B/S/访问真实平台凭据，所有新缓存和合成数据库在 D 盘。

- Follower/Live/Rank API-call 日志按原 Service 白名单保存请求参数与成功/失败元数据，失败保留原 message/可选 biliCode；成功 sourceEndpoint 只在原 Follower 中记录。ID 使用本地精确字符串，旧 mid 字段/错误类别/重试/历史语义保持，不保存整 Worker request 或完整失败原文，不新增原 reserved LogService 没有的界面。
- SQLite 追加 v16 两个可空 JSON 列，ALTER/迁移记录/user_version 同事务。旧记录仍无未知元数据；既有 API-call/证据事务保持。一个已有 v15→v16/精确 UID/写后重开流程通过，另五个既有历史升级代表通过；旧版本夹具需同时去除新增列以还原其真实布局。
- 一个既有真实 Python→Core→SQLite 粉丝流程 RED→GREEN，验证成功和 -101 失败元数据、失败不覆盖历史；一个 Live 解析、一个 Rank 风控重签代表通过。第一次 Rank 测试预期页大小误写30、实际配置50，修正断言后通过，生产配置未更改。Storage/Core 类型通过，未运行全套或新增测试文件/矩阵。
- Live CAS 顺序改为解析→既有共享业务字段校验→归档，runtime 完整校验仍保留。原单 HTTP 用例覆盖非零平台 code/无效 URL 均不写 CAS，以及合法空结果逐字节归档，两次 RED→GREEN，最终1通过；三文件 Black/isort 与两源 mypy 通过。早先78项是在追加契约检查前，不当作最终版验证。独立只读复查发现并关闭该 CAS Important，最终本片无新增 Critical/Important。

- M12：Runtime.stop 同步 abort 内部导出生命周期；prepare 的异步边界/逐行检查、ZIP 输入输出和归档关闭、XLSX read stream/行让步/commit 已接取消，清理完成后 SQLite 最后关闭。同步事务快照/五格式内容/编号不改，不增加原界面没有的取消功能。已有退出用例复用 ZIP/XLSX 两阶段 RED→GREEN，原导出测试文件最终3通过（含五格式/EEXIST/原失败清理），无未处理错误。实际发现 ExcelJS 忽略 Archiver.finalize Promise、取消后晚 finalize 会拒绝，已在本工作簿内处理该拒绝并走既有失败链路。同步快照执行时事件循环不能处理外部退出，单条阻塞 SQL/写入、严格有界、大数据性能及崩溃恢复不冒称已解决。
- 最终 Desktop 类型/生产构建通过；初次 Desktop 类型发现 Rank metadata 联合类型隐式 undefined，显式标注既有白名单类型后通过，字段白名单未放宽。最新生产构建真实 Main/Preload/Renderer/Core 在新 D 盘 `.tools/temp/bmd-production-final-xMCjK5` ready/schema16、平台真实注册表、Core 重启及正常退出通过，记录 PID 残留0；自动采集/OAuth关闭，无用户库/真实平台或凭据。最终 Core 类型、限定 diff check、实际项目进程0通过，原库仍干净/空index保持。

M12 独立只读复查与已安装 ExcelJS/Archiver 实现核对无本片 Critical/Important，未新增套件运行。自然成功不保证 Archiver close，成功路径等输出关闭；取消显式 destroy 后才等归档 close，没有将自然成功误改成等待一个不会到达的事件。

M06 的 API日志 failureMeta 子项与 M12 异步压缩退出取消已完成，其他精细兼容/旧整体检查/真人原生及 M12 剩余边界保持开放。上次 `release/migration-20261006-YHQ4nF` 是本次源码改动前的 schema15 目录包，没有据此宣称最新 v16 或 Python 修复已打包；全量目标 active，尚非完整验收。

## 此前续迁进度（2026-10-06，HTTP 异常边界与独立目录客户端）

本轮原 B/S HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400` 干净只读；客户端仍为 `4c94959f81033eee544211cfce29a18c84fd602f` 累积工作区，旧增量/空 index 保持，没有提交推送、启动原 B/S 或读取真实平台凭据。新构建、数据与缓存均在 D 盘，未安装新工具或 C/C++/Rust 工具链。

- 再核对原 15 个 Controller 真实操作及前端消费者，未发现新的功能级漏迁；原 Mock、静态演示、无 handler 和 reserved 不新造业务。该结论不关闭精细兼容及真人/原生验收。
- M06：只读原 `BilibiliApiClient.get`、Follower Service/advice 和 [Spring 6.1.15 响应读取源码](https://raw.githubusercontent.com/spring-projects/spring-framework/v6.1.15/spring-web/src/main/java/org/springframework/web/client/DefaultRestClient.java)，现有 compiled client/Groovy 内存 MockRestServiceServer 确认无效 MIME、空/不支持 charset 在 HTTP 状态分类及空体处理之前抛内部异常。Worker 补独立安全转换错误并保持请求循环，Core 在 API 日志/重试/回退之前映射 `INTERNAL_ERROR`，不改 monitor/backoff/历史/CAS。响应头使用首值，恢复 MIME/token/参数、引号/重复参数和 q 检查；普通默认 UTF-8/Latin1 及替换行为保留。这不是全部 Java codec/别名/UTF-16 兼容证明。
- 只扩已有 HTTP503→relation 主流程与原 HTTP 边界夹具：RED 复现原先 UNKNOWN；GREEN 验证无效 503 与无效零体两次失败不变更日志、监控、等待和历史，随后同一 Worker 正常三次 503 重试→relation 成功，1 passed/4 skipped。已有普通解码 17 项通过、132 deselected，无新命名 case/文件/矩阵；Python 18 源 mypy、修改源 Black/isort、Core 类型、最终 Desktop 类型/构建及限定 diff check 均 exit 0，独立限定复核无新增重要问题。首次 isort 发现 runtime import 排序，修正后通过，不掩盖初次失败。
- 默认 recycler 的旧 Important 重新以原 compiled client/Jackson 2.17.3 做小型内存复现：病理长浮点响应会因原线程预热缓冲而改变分类，普通短浮点/精确 Long64 fresh/warm 都一致。限定为跨请求/执行线程历史状态兼容残差，未关闭，也不臆造固定 channel/global max cache 或将其等同普通平台业务缺口。
- M18：使用既有 PyInstaller 6.22.2 离线重建 Python onedir，ping ready；使用既有 Electron 分发和 electron-builder 生成新的 unsigned **目录版**，不生成/安装 NSIS、不覆盖 2026-08-30 旧安装包。可执行文件：`release/migration-20261006-YHQ4nF/win-unpacked/BiliMonitor Desktop.exe`。这次不会调用 C 系 native rebuild 或签名凭据。
- 真实目录版运行验证清掉开发 `BMD_*`/Python/Node/renderer 配置，PATH 只留 Windows 系统目录；独立 Python exe 握手/能力读取通过，Electron `isPackaged=true`、从新 `app.asar` 运行、SQLite v15/Core ready、真实注册表及本地对象创建→Core 重启保留→删除→列表空通过。数据隔离在 `.tools/temp/bmd-standalone-final-wic7Iy`，自动平台采集/OAuth 关闭，无用户库/真实平台；正常退出后记录 PID 残留 0，整个主流程 exit 0。未据此声称所有 Worker 网络能力、扫码、系统剪贴板/原生保存或安装验收通过。

当前需要用户配合 B站/抖音真人扫码，提供允许采集的测试 UID/直播间并做原生导出验收；未擅自读取已有凭据。旧完整 check 超时、编码/配置/时间/性能/崩溃恢复等待核对仍在全量范围内，未被排除或标绿。全量目标保持 active，**不是全部迁移验收完成**。

## 此前续迁进度（2026-10-06，功能面收口与真实客户端验证）

继续对照只读 B/S `fa2faa6` 迁移；客户端仍在 `4c94959` 的累积工作区，未提交推送，旧增量及空 index 保持。所有新增源码、合成夹具、测试数据库、浏览器与构建产物在 D 盘，不读取用户真实凭据，不启动原 B/S。

### 本轮已落地

- M15 Web：对照原 `DouyinCredentialService`/`DouyinWebAuthService`，保存凭据与 SUCCESS 会话放进同一 SQLite 事务；重叠轮询只消费一次，附加失败、消费失败、失败/过期均清理 Worker。捕获和复验要求完整 bundle；Worker 成功凭据仍可消费，TTL 清理后不再保留原文，迟到复验不能复活已删除会话。
- M15 OAuth：授权完成原子保存；刷新保留独立 OAUTH_REFRESH 的 VALIDATING→SUCCESS/FAILED 记录，同一凭据重叠刷新合并，凭据变化时保留新凭据。Token 响应仅在加密 payload 中，session 只保存凭据引用，不复制原库的明文 token 结果。Web/OAuth 仍独立。
- M15 浏览器与界面：补 secChUa/userAgentData.platform、原导航/二维码等待/语言/时区/视口/UA/Origin 配置及安全环境转发；页面复验异常返回安全 valid:false 并释放 Context。扫码关闭/重新开始/失败重试/手动刷新/迟到响应隔离、进度及缓存图片覆盖状态；查看前先读取凭据，恢复原十个字段页签、完整 JSON、复制全部/当前字段和导出。复验无效显示错误而非绿色成功提示。沿现有粉白 token，不重新设计业务。
- M14 数据边界：布局 key 原文保存/返回，不 trim；80 个 Unicode 字符与 Java blank 校验对齐原 DTO/数据库。内部 Service 的 items:null 恢复默认四项，公共 Runtime/Main/Preload/Router 仍要求数组；缺 body/JSON null 不能触发恢复。不新增原 UI 没有的布局保存/恢复操作。
- M16：`PlatformView.vue`/`PlatformController.adapters` 与 `CollectTaskExecutor` 已映射 typed IPC。新“平台采集”页读取注册表并执行一次原 account→fetchCard Worker；不创建监控/定时任务，不伪造 Raw/Log/checkpoint 历史。原八项声明只有 ACCOUNT_PROFILE 真实现，其余返回 UNSUPPORTED/MANUAL_REVIEW。UID/计数保持 Long64 文本，Core 接纳原 +/前导零，UI 复用已批准精确输入归一化；失败类型/可重试/风险及成功结果实际展示，原响应传既有 ObjectRef。
- M17 分类已读取原 Controller/Service/页面：Dashboard/Tasks 固定演示，AI 只有 mock-summary/Mock Provider，Identity 预留，Settings 无保存，analytics.summary 静态；这些不伪装成真实业务。原 dev health 对应现有 Core bootstrap/Worker 状态，真实场次分析仍在 M13。
- M09：recent.limit 恢复原 signed Java int 输入域、缺省 30，再夹到 1–200；没有扩大消息保留量或新增查询。
- M10：新采集快照恢复分钟桶；汇总只读每一榜单类型最新分钟的分页，不混入旧页。旧秒桶在读取时归一分钟，同页重复按采集时间及 SQLite rowid 决胜，旧记录不迁移、不删除。latest 恢复原筛选下的单页语义；原头像文本由已有 Renderer 归一化，不因 // 或裸域名格式拒绝整个榜单。
- M02/M08：对照 `BilibiliLiveSessionBoundaryService.observePreparingSignal` 和 `JdbcBilibiliLiveSessionRepository.scheduleImmediateCollection`，收到 PREPARING 后在所有 active/历史分支前将房间 next_collect_at 设为事务写入时间、清 backoff_until、更新 updated_at。保留暂停、间隔、采集开关和 storage 依赖，不新增定时器或删除历史。
- M11/M13/M14：原六处 filterable 房间/场次/绑定资源选择已接复用 SearchableSelect；标签包含原场次 #ID，可按名称、房间号、UID 或场次标签搜索。选项不硬截断、不重排，搜索不改变精确 ID，支持键盘/鼠标、Escape/失焦恢复、原空项和 disabled。事件分页恢复数字页码、原默认七个数字页和五页快速跳转，分页保留已提交筛选。
- M16 契约：语言无关 `platform-collection.v1.schema.json` 与同一份合成 fixture 已补齐；TS 主流程和现有 Python jsonschema 校验通过，没有重复 Python 业务层。

### 已执行验证与当前下一项

只验证代表流程：抖音既有 Web/OAuth/环境和浏览器流程、一个新增扫码→抽屉复制→无效复验 UI 流程及既有抽屉渲染；布局复用两个定点；平台采集一个 Core/Worker 边界流程、一个既有 Preload 流程和一个 UI 流程。均完成 RED→GREEN；均为合成数据/离线浏览器，不代表真人扫码或正式授权完成。修复编译发现的夹具联合类型和测试跨 Renderer/Preload 项目导入；预览只读断言移到原 Renderer 测试文件，没有扩大生产权限或 tsconfig。

M09 复用两个既有定点，M10 复用一个四页 Core/真实 SQLite 流程，PREPARING 复用一个场次 SQLite 主流程，搜索/分页复用 Subject 主流程和四个既有 Live 页面流程；没有新矩阵。Python Worker→Core→V2 bridge 的精确 UID 主流程 1 passed，旧 v12 约束升级到 schema 15、引用/rowid 保留、写后重开读取主流程 1 passed。未运行项不计通过。

整个 workspace TypeScript typecheck exit 0；Python 18 个生产源文件的 Black/isort/mypy exit 0；最终 Desktop build（Web/Node 类型及 Main/Core/Worker/Preload/Renderer）exit 0。首次分页构建暴露可选 size 类型，补实际缺省 50 后通过。平台只读预览仍不伪造数据。最终工具/缓存/运行目录位置检查 exit 0，生产测试标记 0，原 B/S 干净、暂存区空；未改 CLAUDE 规则入口。

最终生产包直接启动真实 Electron Main/Preload/Renderer/utilityProcess Core：本地 bridge ready、SQLite v15、空列表、平台采集页显示真实注册表、Core restart 后 ready、正常退出且记录 PID 全部消失，exit 0。仅使用新 D 盘 `.tools/temp/bmd-production-final-Lgql07`，自动采集关闭、OAuth disabled、无用户库/真实平台/凭据；已有 headless 验证模式现在不注册系统 bilimonitor 协议，普通运行行为不变。前一次定点错误使用 heading 定位 strong 标签；可选截图又超时，修正定位并去掉非必要截图后主流程通过，不宣称平台业务故障或截图成功。另一个较早的真实空库启动截图在 `.tools/temp/bmd-production-smoke-rrxHt5/production-startup.png`，新数据中心分页截图在 `.tools/temp/bmd-data-center-light.png`。

当前完成范围是原可执行操作的代码迁移及代表性离线验证：只读核对 M01–M08、M11–M14 发现的 PREPARING、搜索选择和数字分页缺口均已修复；M15/M16 本轮补齐，M17 明确排除原 Mock/空实现。不是 100% 真人/原生验收结论。台账旧 JVM/Spring/HTTP 承载/编码等精细兼容和大数据/崩溃恢复风险没有凭此次功能面对照被关闭；历史完整 check 的旧导航超时也不宣称已修复，本轮按用户提速要求不重跑上千项完整矩阵。

下一步需要用户选择：现在配合 B站/抖音真人扫码、提供测试 UID/直播间并做原生导出，还是先交付代码、把真人验收留后。没有擅自启动真实授权或读取已有密钥；全量目标仍 active，不标完整验收完成，也未提交推送。真实流程结束后应用已退出。

## 此前续迁进度（2026-10-06，工作台页头与指标）

对照原 `SubjectHeader.vue`、`SubjectWorkbenchView.vue` 与 `subjects/formatters.ts`：头像按 subject/user/room 原先后来源回退，继续经过既有安全 URL 展示，来源改变重置失败占位；补直播头像标记和健康条。顶部只在实际有房间时展示直播状态，只在弹幕 enabled 时展示标签，connected 区分直播采集/离线监听，waiting/error/missing/fallback 使用原文。KPI 补粉丝净增、峰值、弹幕状态和模块数标签，最近成功相对时间/下一轮月日时分秒/缺省 `--`；无实际 user 与 room 时显示原资源绑定警告，不以 binding 存在代替资源存在。

普通粉丝数/热度沿原万/亿精度，净增缺省为 0、0 无加号、原“今日”文案保持（仍来自 followerDelta24h）。既有 Long64 超安全整数范围的精确展示保留，普通粉丝和热度提供完整数值 title。无 Core、IPC、契约、数据库、采集或轮询改动；粉白 token、字号和工作台结构保持，前端指导仅用于标签/健康条和警告的既有语义样式。

仅扩一个既有 UI 主流程和原 fixture：RED 复现顶部多出未绑定/未启用标签，GREEN 验证头像来源、标签准入、监听→实时、KPI 时间/精度、健康条和返回重开后的缺资源提示，原趋势/刷新/状态/删除链保留。1 passed/3 skipped，未运行不计通过；Desktop 类型/生产构建 exit 0，无新测试文件/命名用例/测试矩阵或全量回归。另一个既有展示测试仅同步“今日”文案，不额外运行。头像响应由测试内本地 route 提供，不访问真实平台。

下一业务转入 M15 抖音 Web/OAuth 登录态管理，先读原入口和服务，再迁移真实缺口。M14 布局 key 原文/Service 内部 null 与必填 HTTP body 边界、其余 M01–M18、阶段回归与原生/真人手工仍开放；不把当前界面片段标成全量迁移完成。原 B/S `fa2faa6` 干净只读，客户端 `4c94959`/旧增量/空 index 保持；产物 D 盘，无安装、提交推送、原项目启动或真实用户库操作。

## 此前续迁进度（2026-10-06，布局真实边界）

完整对照原 `SubjectWidgetBoard.vue`、layout Controller/DTO/Service/Repository：原 UI 固定四块，仅支持已迁入的临时宽高拖动；其余是“待添加模块”静态占位，后台 layout API 没有原前端调用。客户端移除额外组件列表/恢复按钮及专属 mutation、props、错误路径，恢复原占位文案；菜单描述不再把组件布局写成当前 UI 能力。保留 typed bridge/Core/SQLite 的真实布局接口，不删除任何用户布局数据，已有宽高拖动不变。前端指导仅用于沿用粉白 token 的静态占位样式，不新增 AI 能力、隐藏/重排/保存操作。

共享请求三字段支持 null/省略：enabled 归一 true，position/settings 归一 {}，显式 false/非空对象保留；去掉原项目没有的 50 项上限。原空数组恢复默认四项、先删后 upsert/重复 key 最后值生效已经存在，无需重写 Core/storage。响应类型、portable Subject v2 JSON/Python、schema 版本和数据库不变。

仅复用两条已有定点（实际 Core/SQLite 创建/布局主流程、工作台静态渲染），分别 RED→GREEN：null 字段原先被拒绝、UI 缺少原占位均已复现；验证 51 项完整回读、[] 原默认四项恢复和占位/无恢复入口。最终 2 个不同定点通过、7 项未运行不计通过；Core 类型与最终 Desktop 类型/生产构建 exit 0，未新增测试文件/命名用例、fixture、完整回归或矩阵。既有展示测试的旧 prop 同步移除，仅编译，不额外运行。

下一项原 `SubjectHeader.vue` 与工作台 KPI/未绑定提醒：头像来源回退及状态文案、未启用弹幕标签准入、最近成功时间与原资源缺失提示仍需对齐。layout widgetKey 原文 trim 差异、源 Service 内部 items=null 与 Controller 必填 body 的边界保留后续核对，不把本片标成全部 M14 完成；其余 M01–M18、阶段回归与原生手工继续开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持；产物 D 盘，无安装、提交推送、服务启动、真实平台或用户库操作。

## 此前续迁进度（2026-10-06，健康面板展示）

对照原 `SubjectHealthEventWidget.vue` 与 `subjects/formatters.ts`：最近成功和事件时间复用客户端已有 `widgetRelativeTime`，按秒/分/小时/天显示，未来时间回退绝对时间；下一轮采集复用月日时分秒格式，缺省为原 `--`。健康组件标题包含对象名，顶部与组件标签沿原 85/65 阈值同时显示正常/关注/异常及对应 token 颜色，来源回退保持。不增加菜单、轮询、后端或新格式助手；现有粉白布局/字体不重做。

仅扩一个已有界面主流程与原 fixture，固定 Date 而不停止计时器：RED 复现绝对时间与“10 分钟前”不符，随后同流程验证未来时间、缺省值、刷新后的三种健康标签，保留原趋势/刷新/状态/列表/删除动作。夹具改为模拟 IPC 的独立数据快照，避免共享可变对象导致 Query 不发布更新。一次 Vitest fork 在执行完成前异常退出，限定检查未取得原因或发现残留项目进程；原命令一次补验通过，不宣称该环境异常根因已修复。最终 1 passed/3 skipped，桌面类型/生产构建 exit 0，截图 `.tools/temp/bmd-subject-health-light.png` 已检查。无新测试文件/命名用例、全量回归或矩阵。

并行只读核对布局域：原 UI 仅固定四块与临时宽高拖动，后台 layout API 无前端调用；原占位组件没有组件列表或恢复按钮。下一项核对并消除这些客户端额外界面差异，连同原 layout 显式 null 缺省语义，保留真正后台数据能力而不包装成新业务。其余 M14/M01–M18、阶段回归与原生手工仍开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持；产物 D 盘，无安装、提交推送、服务启动、真实平台或用户库操作。前端指导仅影响健康标签的语义与既有 token 使用，未另起设计。

## 此前续迁进度（2026-10-06，当前房间事件聚合）

对照原 `SubjectRepository.findRecentLiveEvents` 与 `SubjectWorkbenchService.recentEvents/calculateHealth`：存储查询增加可选 monitorId，工作台先按当前房间筛选再取最近 6 条，不再被全局最近 200 条挤掉；原全局事件查询调用不变。合并直播/粉丝最近成功与失败事件后按真实时间倒序取 8 条，健康投影的 lastEventAt 取首条，不增加采集、IPC、schema 或数据库迁移。

事件说明沿原 Java blank 规则复用 `hasLiveSnapshotText`：空白标题回退原“在线/热度 null”，NBSP 等非 Java blank 原文保留。采集错误无说明/直播成功无标题时不再伪造“未知错误”或主播名，省略可选 description 供原 UI 来源回退。无采集事件的提示沿原服务使用本次读取时间，而非对象创建时间。原健康扣分规则核对一致，未重写。

仅扩一个已有 Core/SQLite 主流程：先复现其他房间 201 条事件导致预期 8 条仅返回 2 条，再验证当前房间最近 6 条、合并上限/顺序、全局查询保持、说明回退与 76 分健康、空事件提示及投影。首次实现验证发现夹具表名笔误，改为实际 `bilibili_monitored_subject` 后通过；最终 1 passed/1 skipped，未运行项不计通过。Core 类型与最终 Desktop 类型/生产构建 exit 0，未新增测试文件/命名用例、矩阵、全量回归或审计文件。

并行只读核对原健康组件：来源回退已一致；下一项接原最近成功/事件相对时间、下一轮采集月日时分秒与动态健康标签。原“更多”无 handler，不新增菜单业务。后台布局、其余 M14/M01–M18、阶段回归与原生手工仍开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持，产物 D 盘；无安装、提交推送、服务启动、真实平台或用户库操作。后续继续一个关键主流程加必要编译，不逐层重复测试。

## 此前续迁进度（2026-10-06，对象列表完整读取）

对照原 `SubjectRepository.findAllSubjects` 的无 LIMIT 查询和 `fetchSubjects()` 的无参数请求，去掉客户端 Subject 契约的默认 100/上限 500、Core 默认值/截断及 UI 固定 500。省略 limit 时 SQLite 读取完整对象列表，显式正整数 limit 保留，排序仍为状态、更新时间倒序、ID。Preload/Main/Router/Core 贯通可选参数，不增加命令、数据库迁移或采集任务。

原绑定弹窗的粉丝和直播资源均读取全量；客户端已有 `{}` 查询及无缺省 LIMIT 的存储实现，核对后不改这两条正确链路。实际临时 SQLite 创建 501 个对象，验证完整读取、暂停对象排序，以及显式 501/1 的数量限制；已有 UI 主流程验证不再传固定 500。

本片已完成的验证：只复用四个既有用例（契约、Preload、Core/SQLite、UI），RED→GREEN，4 个不同定点通过、12 项选择外未运行；Core 类型与最终 Desktop 类型/生产构建 exit 0。限定本次生产修改的只读复核未发现阻断或 minor 问题。没有新增测试文件/命名用例、全量回归或矩阵，不再追加本片测试。

用户再次明确测试拖慢迁移，后续进一步收缩：以一个代表性业务主流程和必要编译为默认验证，不逐层重复验证同一行为，不设置用例配额；仅数据损坏、凭据/权限、退出资源释放等实际高风险变更补必要检查。整套历史回归和累计审查统一留阶段收尾，优先完成原项目真实业务。

下一业务为 M14 工作台采集健康与事件聚合：原实现先按当前房间读取事件，客户端仍先取全局最近 200 条再过滤，可能漏掉当前房间事件；继续核对原事件映射与健康展示。后台布局、页头/页脚及其余 M14、完整 M01–M18 和原生手工仍开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持；产物 D 盘，无安装、提交推送、服务启动、真实平台或用户库操作。

## 此前续迁进度（2026-10-06，创建输入与绑定缺省）

对照原 `SubjectListView.vue`、`CreateSubjectRequest.java`、`SubjectService.createSubject/hasBindingPayload` 与 `SubjectRepository.upsertBinding`，区分 UI 与后台能力：原 UI 要求 UID、名称可选且显式默认启用弹幕；原后台支持仅名称，并以是否提供身份或 Boolean 判定是否写绑定。没有新增仅名称 UI 入口。

`CreateBilibiliSubjectInputSchema` 的弹幕字段去掉错误的 default(true)，改为 optional，Preload/Main/Router/Core 多次解析也不注入开关；Core 的创建判断纳入 `danmuEnabled !== undefined`，显式 false 同样建绑定。仅名称且全省略无绑定；名称加 false/true 写无身份绑定但不创建采集资源；有身份而遗漏开关的首次绑定按原仓库默认 false。UI 仍显式发送选中开关，原默认 true 不变。修原有错误缺省，不增加新字段/命令/持久化 schema；portable Subject v2 只有响应定义且 Python 不消费创建请求，未扩无关跨语言模型。

创建 Drawer 复用既有 `normalizeFollowerUidInput`，移除不兼容输入形式的浏览器 pattern，保留 required；空 UID 和越界不提交，带空白/前导零的 Long64 精确归一后提交。沿用户此前批准的“保留精确 UID、兼容原输入形式、拒绝真正小数及越界”规则，没有再改规范化器或 canonical 契约。

仅扩四个已有用例（contract、Preload 命令主流程、实际 Core/SQLite 创建/资源复用、UI 创建），各先复现后通过：4 个不同定点通过，12 项选择外未运行不计通过；未新增命名用例、测试文件或 fixture。Core 类型与最终 Desktop 类型/生产构建 exit 0，限定本次 schema/创建 predicate/Drawer 只读复核无 C/I。无完整回归、测试矩阵或新审计/计划文件。

下一项原监控对象/绑定资源列表的读取数量：原 `findAllSubjects` 无 LIMIT，客户端仍有默认100/上限500与UI硬500；粉丝绑定查询已使用全量 `{}`，直播资源缺省还需核对。后台布局、工作台页头/页脚等剩余 M14、完整 M01–M18、阶段回归及原生手工仍开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持；产物 D 盘，无安装、提交推送、服务启动、真人平台或用户库操作。

## 此前续迁进度（2026-10-06，工作台双指标趋势）

完整对照原 `BilibiliFollowerLiveHeatWidget.vue` 与 `subjects/formatters.ts`，新增 `BilibiliSubjectTrendChart.tsx`，替换按点序号排列/全幅归一化的简图。两条序列按真实 bucketAt 定位，分别跳过缺失指标并跨缺失桶连接；时间范围取有效指标并集，单点±15分钟、多点 padding 为跨度4%且限制1分钟至1小时。粉丝/热度独立轴范围沿原 magnitude/change floor 与 padding 公式；时间/左右值轴、点、平滑线和低透明填充、悬停实际时间和指标行已接入。缺失值不填零。复用现有共享 V2 趋势数据、格式/坐标助手，不新增依赖、后端、schema 或采集任务。

粉丝计数与轴边界用 BigInt 有理数计算，仅归一化坐标转 Number；超安全整数的刻度/悬停保留完整精确计数，安全值沿原万/亿格式。SVG 根据 ResizeObserver 读取实际像素宽高，避免拖动尺寸后文字被拉伸，卸载释放监听；补方向键/Home/End/Escape 逐桶提示。沿现有樱花雾白 token，不增加原图没有的图例开关。

只扩现有第一个交互主流程与原 fixture，四个非等距桶包含一个缺失粉丝和 Long64 相邻计数；旧固定坐标断言换成真实时间/原范围/精度断言，没有新增命名用例或测试文件。RED 缺少热度点（预期4、实际0），GREEN exit 0、1 passed/3 skipped；同一流程保留原刷新/状态失败重试/列表删除验证，并截图 `.tools/temp/bmd-subject-trend-light.png` 已检查。最终 Desktop 类型/生产构建 exit 0；限定本次图表、样式和接线只读复核无 C/I。无全量回归、扩展矩阵或新审计/计划文件。

下一项继续原工作台创建与绑定缺省契约（名称创建、可选身份与弹幕开关），再核资源列表分页/后台布局等剩余 M14。页头/页脚格式与原文差异仍待一并核对，不能将本次图表标为整个 M14/M01–M18 完成；原生手工及阶段完整回归继续开放。原 B/S `fa2faa6` 干净只读、客户端 `4c94959`/旧增量/空 index 保持，全部产物 D 盘；无安装、提交推送、服务启动、真实平台或用户库操作。

## 此前续迁进度（2026-10-06，工作台拖动尺寸）

对照并完整读取原 `SubjectWidgetBoard.vue`，新增 `BilibiliSubjectWidgetBoard.tsx` 并接入现有工作台：默认主列 61%、首行 650px；右下角拖动同时调整双列宽度与首行高度，保持原比例 44–76%、高度 560–920px 和宽板主列 520/副列 360px 下限。<=1180px 切单列并隐藏手柄；颜色、字体沿用现有樱花雾白 token。尺寸仅当前页面本地状态，不新增重排、模块隐藏或持久化布局业务，不改共享监控和采集数据。

趋势 SVG 随容器实际高度缩放，拖动合并发送图表 resize；释放、取消、失焦和卸载均清理监听、恢复此前 body 光标/选择状态，卸载取消待执行帧。仅在已有交互文件新增一条代表流程：真实拖动后尺寸变化且落在原范围，释放后样式恢复、小屏隐藏手柄。RED 失败于默认尺寸不存在，GREEN exit 0、1 passed/3 skipped（未运行项不计通过）；最终 Desktop 类型/生产构建 exit 0，限定本轮组件、样式和接线复核无 C/I。没有全量回归、额外测试矩阵或新测试/审计/计划文件。

下一项核对原 `BilibiliFollowerLiveHeatWidget.vue` 的时间轴、粉丝/热度双轴范围与悬停数据，替换客户端仍按点序号归一化的简图；继续保留精确 Long64 计数。名称创建缺省契约、后台布局 API、列表截断/资源分页、其余 M14/M01–M18 及原生手工仍开放，不能将本片标为完整迁移。用户要求继续提速：必要主流程/数据安全与编译后直接迁下一业务，完整回归留阶段收尾。原 B/S `fa2faa6` 干净只读、客户端 `4c94959` 与旧增量/空 index 保持；产物均 D 盘，无安装、提交推送、服务启动、真实平台或用户库操作。

## 此前续迁进度（2026-10-06，监控对象列表与删除）

原 `SubjectListView.vue:9/175-184` 正常页可刷新，删除按对象名确认并提示历史保留，成功显示“已删除”再刷新；原页面没有删除失败 catch，原工作台也没有暂停按钮，因此客户端失败重试/pending属于补强，暂停仍依据原后端仅更新 subject 状态的业务。`BilibiliSubjectWorkspace.tsx` 已补正常列表刷新、具名确认、删除/状态 pending 和可见成功/失败反馈；操作错误不再隐藏列表/工作台，失败保留数据且可重试。

成功删除后取消在途列表查询、发布已过滤列表、移除相应工作台/趋势缓存；删除当前对象清选择/绑定弹窗并回列表。有效选择必须属于已加载列表，避免随后进入工作台持续查询不存在的对象；创建后先将实际 create 返回值写入列表，再打开其工作台，避免新对象在列表刷新前被误认为不存在。工作台 loading/error/empty 也有返回入口。无新增共享监控或历史删除路径，暂停提示明确“未更改共享监控状态”，不伪称共享采集必然运行。

只扩现有交互测试第一个主流程及其内存夹具：原 Long64 刷新→状态首次失败/重试→列表刷新→打开/返回→具名删除首次失败/重试→成功空列表→切工作台无旧对象查询。RED 准确失败于状态错误未展示；GREEN exit 0、1 passed/2 skipped（不计未运行项）。最终 Desktop types/build exit 0，限定三文件静态复核 C/I 无；无新测试文件/命名用例/矩阵、全量回归或审计/计划文件。原 B/S `fa2faa6` 干净只读，客户端 `4c94959` 与旧增量/空 index 保持；全部测试/构建 D 盘，无安装、提交推送、服务启动或用户库/真实平台操作。

下一项是真正原有的工作台拖动尺寸：已完整读取 `SubjectWidgetBoard.vue`，默认主列 61%、首行 650px；拖动限制主列比例 44–76%、高度 560–920px，宽板最小主列 520/副列 360px，触发图表 resize，<=1180px 单列/隐藏手柄。原 UI 仅临时本地尺寸，没有重排、模块隐藏、保存 API 或持久化恢复，不能臆造这些交互。后台布局 API 与名称创建缺省契约、列表截断/资源分页、其余 M14/M01–M18 和原生手工仍开放；继续业务优先，阶段末再完整回归。

## 此前续迁进度（2026-10-06，用户工作台改绑）

原 `SubjectService.java:134/257` 只解析本次绑定请求，`SubjectRepository.java:136` 再逐字段 COALESCE 保留旧值。客户端原先先合入旧监控 ID，解析时优先旧 ID，导致新 UID/房间号无效；只切开关还可能按残留身份重建已删除的共享监控。`bilibili-subject-service.ts` 已改为先解析 parsed，再合并四个身份字段；未提供的开关/能力保留，显式 `false`/`[]` 正常保存；移除原 bind 没有的额外头像回填，读取时原有回填保留。没有改数据库 schema，改绑和删除对象仍保留共享采集资源。

`BilibiliSubjectWorkspace.tsx` 的绑定提交消费 rejection，继续由现有 mutation error 显示错误，弹窗和选择保留，finally 恢复按钮供重试。仅扩充两个已有用例，无新测试文件/命名用例或矩阵：Core 主流程先复现 UID 23 仍变成 UID 22 的失败，再验证改绑、共享资源保留及只切开关不重建；原 UI 绑定用例复用一次失败→错误展示/选择保留→重试成功关闭，先复现 pageerror 再通过。Core types 与最终 Desktop types/生产 build exit 0；限定只读 Core diff 核对无阻断项，不审累计脏分支。

按用户最新要求缩短迁移周期：只做相关主流程/数据安全检查及必要编译，过后继续原业务；不设置测试数量目标，不重复历史取证或扩大边界矩阵，阶段收尾才完整回归。下一功能为 M14 删除已选对象后的选择恢复、常驻列表刷新及操作错误反馈，然后原布局业务。只含名称创建的绑定/弹幕缺省契约、资源列表分页、其余 M14/M01–M18 和原生手工仍开放。本轮原 B/S `fa2faa6` 干净只读、客户端 `4c94959` 与旧增量/空 index 保持，产物 D 盘；无依赖安装、提交推送、服务启动、真实平台或用户数据库操作。

## 此前续迁进度（2026-10-06，长导出与本地保存）

对照原 `BilibiliLiveSessionExportController.java:39` 的同步 REPEATABLE_READ 响应流、`ExportService` 的 CSV/ZIP finish/flush、`XlsxWriter.java:25` 的 finally dispose/close，以及原 `SessionPanel.vue:335`/`DataCenterView.vue:347` 的浏览器直接下载。原项目没有异步导出任务或显式取消界面，不新增这类业务；客户端继续准备临时成品→原生选址→保存/取消，并承担浏览器原有的文件生命周期职责。

`runtime-protocol.ts` 增加 Main/Core 共用 `CORE_KEEP_ALIVE_REQUESTS`，不把本地导出冒充 HTTP。Process 的 5 秒 interval 支持异步压缩；service 的内部 Iterable 回调在同步 CSV/SQLite/XLSX 快照遍历中按墙钟发送关联存活帧。活动 reporter 集合保护全部已接收长请求，finally 删除；Main 在 activeExports 期间只用正确 id/type/trace/correlation 的 alive 刷新 pending keepAlive，包括尚在 utility 队列的请求。无导出时 HTTP 单请求规则和短查询默认预算不变，90 秒失活预算没有增加。一次不可回调 SQL/单行写入若阻塞超过 90 秒，仍可能触发 watchdog；不是完整巨量数据性能验收。

Controller 在 stop 开始后拒绝新请求，重复 stop 共用 Promise，start 可恢复；停止先请求 shutdown，再等本次准备任务结束，最后才进入原 1.5 秒退出等待。Runtime 在 Worker 停止后等所有 activeSessionExports 结束，随后关闭 SQLite，修复 prepare 在 mkdir/mkdtemp 后恢复访问已关闭数据库的竞争。这是等待生成与清理完成，不是 ZIP/XLSX 即时中断压缩。

新增 `apps/desktop/src/main/session-export-save.ts`：验证 D 盘及真实临时文件归属；原生取消或退出 abort 会结束对话框等待，迟到对话框不会继续发布。保存目标的真实父目录也须在 D 盘且不能是应用临时目录；先 wx 创建同目录 UUID 部分文件，用 pipeline 复制并等待 FD 关闭，再 rename 提交，失败/abort 删除自身部分文件，不覆盖已有目标。自产准备文件 finally 清理，ENOENT 视为已清理，其他错误结构化报告并写入 `logs/session-exports.ndjson`。成功/取消/失败也落本地审计，不记录选址绝对路径或内容；日志自身失败有脱敏报警。

Main handler 跟踪从准备到 finally 的在途 Promise；before-quit 立即阻止新导出、abort 保存阶段，同时等 Core.stop 与在途保存结束。`quitDrain` 和 `quitAfterCoreStops` 分离，重复退出在 drain 未完成时仍 preventDefault。迟到准备结果进入已 abort 的 save helper，仅清理、不打开保存。

验证保持少量主流程：2 项新保存主流程（实际 D 盘文件/取消/退出/迟到结果/安全目录/源消失/已有目标/实际本地日志），复用一个原格式用例加同步进度，新增一个真实 Core/SQLite 导出关闭竞争，现有 watchdog 文件新增一个 240 秒 fake-timer 用例并包含排队 HTTP，共 5 个不同命名关键用例。无原生对话框/真实平台/用户库操作；10 项选择外不计通过。保存未实现、缺 keepAlive/进度、数据库关闭竞争都先失败后通过；首次桌面 build 仅本轮 fixture 误写不存在的 COMPLETE coverage 枚举失败，按共享契约改为 RECEIVED_WHILE_ONLINE，未放松类型或契约。Core 类型和最终桌面类型/生产构建通过。

限定只读审查发现的重复退出和已接收/未接收请求并发窗口已修正：两项一次性 VM 执行当前实际回调/分支，重复退出 1!=2 与缺 http alive 均 RED→GREEN；排队窗口在同一 240 秒用例 RED 误杀→GREEN。最终审查无剩余 Critical/Important/Minor，不审累计脏分支、不新增测试矩阵或审计文件。

当前源 B/S/API 均只读且干净、客户端 HEAD `4c94959`/空 index/旧增量保持，工具/数据库/构建与日志全部 D 盘。本轮无依赖安装、提交推送、安装应用或服务启动。完整 M12/M01–M18、原生手工、严格队列有界/超 4GB/大数据性能、强杀崩溃临时恢复与旧整体验证缺口继续保留，不能将本轮绿色当作全量完成；阶段收尾再全量检查。下一业务核对 M14 用户工作台绑定改删和监控资源复用，再逐项实现，不重复已完成导出检查。

## 此前续迁进度（2026-10-06，CSV/ZIP 逐行导出）

对照原 `CsvWriter.java`、`ExportService.java`、`ExportRepository.java` 和原 `docs/bilibili-live-session-data.md` 的导出规则。新增 `bilibili-live-session-csv-zip.ts`；export service 删除原事实数组/用户 JS 分组/整文件 CSV 拼接/zipSync，复用 Storage 的事件与用户 SQL 迭代器。三个单独 CSV 在同步事务内逐行写出；完整 ZIP 的摘要、三类 CSV 与 manifest 在同一事务写出独占 D 盘临时子目录，事务结束后顺序按需打开输入、64KB 流式读取并 pipeline 背压输出。五种导出仍共享原日编号，在文件 I/O 前分配，失败不复用。

保留 UTF-8 BOM、CRLF、双行表头、标准引号/逗号/换行转义和 null/布尔/UID/金额口径；防公式按原 Java BMP whitespace 判定而非 JS `\s`。ZIP 固定 manifest/summary/danmaku/gifts/users 顺序与 schema 2，mtime 为 epoch 0。原 Java 支持 ZIP64；已核实 fflate 只写 classic ZIP，改用纯 JS `yazl@3.3.1` 和 `@types/yazl@3.3.1`，自动 ZIP64 与 UT 时间戳见[官方文档](https://github.com/thejoshwolfe/yazl)。未做超 4GB 实跑验收，不把库支持当成大规模验收结果。

同步 CSV 迭代/写入失败会关闭并删除自产部分文件，ZIP 源/输出失败会停止后续输入、销毁并等待自建读写 FD 关闭，再删除自产部分文件；`wx` 冲突保留原文件，ZIP 快照目录始终清理。yazl 没有 abort API，不 hook 私有流链；不宣称已经取消库隐藏的 zlib 链。

仅扩充原唯一真实 SQLite→文件用例：全部格式禁 findAll、1000 条事实、独立 gift/user CSV 与 ZIP 内容一致、时间戳/临时目录、CSV 迭代失败/ZIP 源不存在、部分文件/EEXIST 保留；bulk guard RED→GREEN。复用两项编号用例，共 3 个不同定点通过，无新测试文件/命名用例/矩阵。Core 类型通过；桌面首次构建类型阶段因定向 pnpm install 后旧 Vitest junction 失效失败，实际确认桌面链接不存在/Core 链接存在；随后 `pnpm install --frozen-lockfile --ignore-scripts` 恢复全工作区链接，最终桌面类型与生产构建 exit 0，不改测试或类型规则。依赖安装没有新增原生编译工具，缓存/产物均 D 盘。

限定只读代码审查通过，本次没有新增 Critical/Important 或必要修改建议；只看新 CSV/ZIP helper 与接线，不做累积分支审计。原 B/S/API 的 HEAD/干净状态、客户端 HEAD/空 index 与 D 盘路径保持，最终无项目残留进程。

下一项长导出请求/保存/取消链路：目前 Main 导出为 90s 固定请求预算、finally 临时文件清理会吞错误，尚未为长生成提供完整 keepalive/退出取消。ExcelJS 内部队列严格有界、大数据性能、库内部压缩链取消、原生保存手工、采集昵称和完整 M12/M01–M18/旧整体缺口继续保留。原 B/S/API 只读，旧工作区增量保持；未全量回归/安装客户端/提交推送/真实平台或用户库操作。

## 此前续迁进度（2026-10-06，Excel 逐行导出）

继续对照原 `SXSSFWorkbook(100)` 与 Repository 的逐行读取。新增 `bilibili-live-session-xlsx.ts`；Storage 增加场次事实 SQL 汇总和导出事件/用户迭代器；SessionService 的 list/get 摘要不再全量读事实，insight 显式数组的原口径保持。XLSX 在一个同步事务内逐行写四表 NDJSON 到导出目录的独占临时子目录，事务结束后按行读取、commit ExcelJS 行/表/工作簿，关闭输出后才返回。原四表、字段类型、双行表头、冻结/筛选/列宽和日编号保持。

失败关闭读写流、清理临时快照和自身部分输出；`wx` 冲突不删除已有导出。复用原主流程加入 1000 条合成事实与禁止全量读取、文件失败清理检查；两项旧摘要规则和两项旧编号用例复用，合计 5 个不同定点通过，没有新测试文件/命名用例或矩阵。编号提前分配的旧规则回归先失败，修正后通过；Storage/Core/桌面类型与构建通过。限定只读审查无新增 Critical/Important；内部 archive API 按已安装 ExcelJS 4.4 适配。

下一项：CSV/ZIP 仍采用旧数组/内存编码，继续迁移它们的逐行导出与失败清理。ExcelJS 内部 StreamBuf 不等待背压，每 100 行让步并不证明慢盘队列严格有界；大数据性能/严格有界优化、原生保存手工验收、昵称采集字段及完整 M12/M01–M18 保留，不把这一切片等同全量完成。未跑全量历史回归，旧整体缺口不撤销；无新契约/schema/依赖，原 B/S/API 只读、产物 D 盘，无安装/提交推送/真实平台或用户库操作。

## 此前续迁进度（2026-10-06，Excel 导出内容）

读取原 `BilibiliLiveSessionXlsxWriter.java`、`ExportColumns.java`、`ExportRepository.java`、`ExportService.java`、相关 XLSX 用例及 `docs/bilibili-live-session-data.md`，逐项对照现有本地导出。四表及两行完整列/中文说明、冻结/筛选/列宽、长 UID 文本、布尔/金额/null 主要语义已具备；全量查询无分页上限，数量/金额/正 UID 身份过滤在当前存储约束下与原查询一致。UUID 及 rowid 为本地标识/插入顺序适配。

本轮仅改 exporter 和其已有测试：XLSX 的 `protocol_version` 按原 String 写为文本，CSV 编码不受影响；聚合最新昵称按原 PostgreSQL BTRIM 只去普通空格判断非空，保留历史 tab 等字符；表头和中文说明行补原细底线。仅扩充现有唯一真实 SQLite→四表 XLSX/CSV/ZIP 导出用例，加入一条合成历史事实；五处断言先失败后通过，没有新增测试文件或铺矩阵。Core 类型、桌面类型/生产构建通过；限定只读代码审查未发现本轮新增回退或阻塞，未全量回归。

未完成且下一步继续：原 SXSSF 流式行窗口 vs 当前全量事实数组/Workbook/writeBuffer，必须补导出的大数据能力，不能把这轮内容修正当作完整 XLSX/M12 完成。已有上游 trim 造成的原昵称空白丢失不能靠 exporter 恢复，采集字段对齐仍待后续。当前两行表头蓝色使用客户端既有蓝色近似，边线已对齐；原生保存对话框/其他格式/取消失败清理与旧整体缺口保留。全部工程产物 D 盘、原 B/S/API 只读，无安装、提交推送或真实平台/用户库操作。

## 此前续迁进度（2026-10-06，分析看板）

对照原 `AnalyticsView.vue`、`liveInsightPresentation.ts`、`TrendChart.vue`、`useSessionAutoRefresh.ts` 与 Insight Repository/Calculator/Service。新增 `BilibiliLiveAnalysis.tsx/.css`、`SessionInsightTrendChart.tsx`，替换原简略分析区，复用现有 typed bridge、Core 和 SQLite，不新增后端、采集任务、依赖或 schema。

已接通：五项 KPI；同轴峰值信号轨；实际时间间距的互动/付费双序列图、图例显隐与提示；弹幕深度/三阶段/重复内容；付费深度/消费档/历史范围说明；四类互斥用户分层、Top 12 礼物结构、规则洞察和质量指标。空值显示 `--`，真实零不改为空。保持原 60/300/900 秒粒度、默认关闭自动刷新、默认 10 秒/UI 3–3600 秒、立即刷新；启用后请求完成才再次计时。同场次失败保留成功分析，取消的迟到请求不发布；分层总数来自当前 insight。保持樱花雾白 token，没有展示内部 UUID。

本轮统计修正：付费深度按付费事件数包含零金额付费 UID，用户分层仍按金额规则；持续参与阶段以全部弹幕确定边界；在线覆盖裁剪到场次边界、合并后每段取整秒；P95 连续插值；转化中位时长最后四舍五入；礼物收入/身份解析占比保留原五位。一个合成事实场景集中验证，不逐分支加案例。

验证：新增两个代表场景（UI 主流程、Core 统计），复用三个已有用例，5 个不同定点通过；Core 类型与桌面类型/生产构建通过，UI 修正后主流程重验通过。限定只读审查仅发现旧摘要导致分层总数滞后，已修正；付费事件 KPI 注释仍使用场次摘要，与原版一致，保留继承限制。现有主流程输出截图至 `.tools/temp/bmd-analytics-light.png` 并检查粉白布局；仅合成夹具，非真人采集/原生应用验收。

下一项 M12 原导出：先核 Excel XLSX 内容，再逐格式推进。此前场次面板与数据中心等勿重复迁移。用户再次要求迁移提速：不设最低测试数量、不铺矩阵、不重复历史审计或每次全量检查，必要验证后进入下一业务，全量回归留阶段末。完整 M01–M18、真人/原生安装和旧整体失败仍开放；原 B/S/API 只读，产物 D 盘，无提交推送/安装或真实平台、用户库操作。

## 此前续迁进度（2026-10-06，直播场次面板）

完整读取原 `frontend/src/views/bilibili-live/components/BilibiliLiveSessionPanel.vue` 与 `useSessionAutoRefresh.ts`，新增客户端 `BilibiliLiveSessionPanel.tsx/.css`、`useLiveSessionPanel.ts`，工作台接入。复用已有 session/sessionUsers/sessionExport bridge、Core 与共享类型，不新增后端、HTTP 端口、schema 或采集任务。

已接通：最近 20 场与跨数据中心/分析 200 场的有效选中保留；独立详情和 Top 100 身份读取；11 项完整统计、时间/来源、未覆盖指标保持空白、待确认/覆盖/身份原文说明；Excel XLSX/弹幕 CSV/礼物 CSV/用户 CSV/全部 ZIP 调用本地导出并反馈保存或取消；默认 10 秒、1–3600 秒刷新和立即刷新。详情/用户分别恢复，一项失败保留可用内容，两项失败显示原历史提示；列表刷新保留成功数据。TanStack Query 管理房间投影，自动/手动列表刷新链去重并在列表及其详情完成后计时；切房间、离开视图、卸载后的旧结果不发布。樱花雾白 token 保持。

验证按用户提速要求收缩：仅新增一条主流程（详情/导出/刷新失败恢复），先 RED 后 GREEN；复用两个选场交互和一个静态展示用例。三项交互定点通过，静态定点、桌面类型和生产构建通过；未跑全文件/全量历史套件，不追加边界矩阵。导出测试验证 bridge 参数和反馈，未操作用户文件；真实 Electron 保存对话框及五类产物的手工验收仍开放。限定只读审查无新增 Critical/Important；原版刷新期间手动换选可能被列表捕获的旧选中覆盖、直接详情读取独立于列表刷新链的限制保留为后续可选改进，不扩大本次迁移。

下一完整功能：原 `AnalyticsView.vue` 的信号轨、趋势图、参与阶段/重复弹幕、消费档/用户分层、礼物结构。此前[数据中心](2026-10-06-data-center-migration.md)、[场次识别](2026-10-06-session-instant-identity.md)及[共享材料](2026-10-06-shared-materials-migration.md)实现保留，勿重复迁移。完整 M11/M01–M18、真人/原生安装和旧整体验证缺口仍 open，目标 active；原 B/S/API 只读，输出 D 盘，未提交推送/安装或操作用户真实数据。

## 此前续迁进度（2026-10-06，弹幕指标时间范围）

[时间范围审计](2026-10-06-danmaku-metrics-range-audit.md)：原输入/Java Long与Duration解析回退已接实际Core/SQLite，日期减法越界独立报错；合法超JS日期窗口省略恒真下界，正常闭区间/最新2000升序保持。无UI/数据库升级或Python生产变更。

只有2新Core关键用例及1共享fixture，先RED后GREEN；复用portable对齐，共5定点通过，28选择外不计通过。三包types/Main一次build退出0，8路径任务审查/安全结论见审计。遵循用户提速要求，不跑历史套件或新矩阵，旧整体缺口不撤销。

下一项原事实写入时间、共享缓存/同步双检/fallback等M09；完整M01–M18/真人原生安装仍open，goal active。原B/S/API只读、旧增量/HEAD4c94959/空index保持，输出D盘，未提交推送或访问用户真实配置/库/凭据。下方为历次当时状态。

## 此前续迁进度（2026-10-06，弹幕连接容量）

[容量审计](2026-10-06-danmaku-capacity-audit.md)：删Node manager额外100存活连接拒绝，Core默认10/floor1/配置值/手动自动共享容量不变；100/120操作队列背压与取消/替换/停止保护保留，无新Worker配置/契约或数据库升级。

1新真实配置/Core/SQLite/WorkerSource/Manager用例先RED后GREEN，验证101连接/102拒绝/复用/停止补位/全停；socket及物理IPC合成，非真人/子进程验收。复用4项，共5不同定点通过、25未选中不计；新测试适配类型及stop函数strict响应失败已最小修正，最终两包types/Main一次build退出0。2路径任务审查通过，Critical/Important无，Minor清理异常可能跳过后续shutdown/环境恢复已记录阶段末，不追加验证；无全历史套件或矩阵。117无关SHA/2冻结一致，原库/API clean，进程监听0、D环境/实际bundle/空白通过。

下一项原指标查询range回退/Long解析，再写入时间/共享缓存/同步双检/fallback等M09；全M01–M18/真人原生安装与旧整体缺口仍open，goal active。原项目/API只读，旧增量/HEAD4c94959/空index保持，全D盘，未提交推送/安装/平台或用户库操作。

## 此前续迁进度（2026-10-06，弹幕指标分桶）

[分桶审计](2026-10-06-danmaku-metric-buckets-audit.md)：默认60/raw signed32配置已接实际Core/SQLite/返回；max(10,raw)仅计算桶起点，raw入库/唯一键不改，无3600上限。追加v15保留历史/rowid/依赖/外键，原迁移不改，换配置不重算旧桶。probe默认20仅绑定、不新增原本没有的任务；15个原输入字段已支持。

本次仅3新测试、复用7项共10定点通过，TS108项未选中不计通过；三包types与Main一次生产build退出0，19路径任务审查通过，Critical/Important/Minor均0，无修复或追加验证。每功能2–3个关键验证，完整回归留阶段末，不重复诊断矩阵或历史套件。旧整体验证缺口不撤销。98个无关增量SHA未变、19冻结一致、原B/S/API clean、进程/监听0、空白与实际bundle/D环境核验通过；所有执行会话已终态，不再轮询旧handle。

下一原业务候选：Node额外100容量、range回退/Long解析、写入时间、跨Worker共享缓存/同步双检/fallback等；其它M09/全M01–M18/真人原生安装继续open，goal active。原B/S/API只读、旧增量/HEAD4c94959/空index保持，产物D盘，未提交推送/安装或访问真实用户配置/库/凭据。

## 此前续迁进度（2026-10-06，WBI / Buvid 缓存时长）

[缓存时长审计](2026-10-06-danmaku-cache-configuration-audit.md)：两原配置已贯通Node弹幕与Python榜单，默认43200/成功后floor300/到期重取；登录过期保Buvid强刷WBI、risk清2、nav匿名，旧连接五项保持。仅3新测试、新旧定点10项、三包types/修改Python格式/Main唯一build全部exit0，27路径独立任务审查Spec/Task quality PASS，无需修复，未重跑验证。

再次按用户要求提速：每功能只补主流程与一两个关键边界，不默认跑完整文件/历史套件或铺矩阵；阶段结束统一完整检查，不撤销旧失败。现13/15，余bucket/probe；原probe无消费者不臆造。跨Worker共享缓存、同步双检、多段fallback重新LOGIN、Node100、其它M09与全M01–M18/真人原生安装仍未完成。

goal active，原项目/API只读、旧未提交增量/HEAD4c94959/空index保持，工程输出D盘；未提交推送、安装、启动原项目或访问用户真实配置/库/凭据。下方为历次当时状态。

## 此前续迁进度（2026-10-06，弹幕连接配置与身份策略）

[连接配置审计](2026-10-06-danmaku-connection-configuration-audit.md)：五字段已接实际Core→Worker→连接。false在读取前门控，Worker同样保持匿名；原激活重连保留。WS/心跳floor、长等待取消、原文参数/AUTH与Java blank已接。复审墙钟心跳/brace文本已修复关闭，最新Spec/Task quality PASS。

仅3个新代表场景、复用回归；相关验证/types/build通过，修复仅两完整文件68项/两types及必要重建exit0，全部工程命令终态。没有root/fullcheck/累计98dirty审查/新矩阵，旧缺口保留；后续少量关键验证，阶段末统一回归。

下一步余bucketSeconds、wbiCacheSeconds、buvidCacheSeconds、listenProbeSeconds四项及原消费者，probe原无消费者不臆造。Node100、其它M09/完整M01–M18/真人/原生/安装仍open，goal active。原项目/API只读、旧增量/D盘/HEAD4c94959/空index保持；未提交推送、安装、启动原项目或访问用户库/凭据。

## 此前续迁进度（2026-10-06，弹幕连接与认证生命周期）

[生命周期审计](2026-10-06-danmaku-auth-lifecycle-audit.md)：原首host/每候选fetch、发AUTH即返回AUTHENTICATING、认证成功/拒绝异步处理、每attempt独立SQLite会话、固定connectionId停止、发后心跳、ERROR/STOPPED及早事件/迟结果保护已实现；共享Widget/工作台原展示策略保留，独立页鉴权中可停止。主要复用原验证，一个新Core业务用例和7个小共享golden；相关定向/types、最终生产build及独立17文件task复审Spec compliant/Approved，前两次build实际失败与修正保留。

最新人类要求减少测试、加快逐功能迁移：只保留少量正常/关键失败/停止安全验证，不再每小功能跑全历史或累计审查，阶段末再统一。旧整体Desktop异常与pending add/trend缺口保留，不继续扩张观察/诊断或宣称已修复。原源码/API只读、旧修改保留、全D盘、HEAD4c94959/空index；无提交推送/安装/真人平台/用户库操作。

下一步核对并迁移剩余9配置及对应消费者、Node额外100容量等其它M09业务；完整M01–M18和真人/原生/安装仍未完成。协议与本轮生命周期task已完成，不重派。当前目标继续active，不代表全量完成或发布许可。

## 此前续迁进度（2026-10-06，弹幕协议选择）

完整迁移继续，未暂停/提交/推送。[协议选择审计](2026-10-06-danmaku-protocol-selection-audit.md)：第六项配置protocolVersion(default3/signed32/原alias/canonical优先)→Core→Worker→实际认证候选已接。manual0..3单协议，其他signed32请求auto，合法配置偏好先行再3/2/1/0去重；auto复用活动连接，实际协议/登录升级/包头1保持。只新增3个业务场景及8个小共享样例，相关定向/types/一次生产build通过，独立23路径任务复审Approved，无遗留finding。

本轮不再跑完整历史check、重复累计审查或扩张诊断；用户减少测试、加快逐功能迁移的要求继续有效。此前整套Desktop异常退出与旧pending add/trend缺口仍开放，未把局部通过写成全量通过；现有有价值回归不删除。源码与API参考只读，旧未提交增量保持，客户端HEAD4c94959、暂存区空，产物D盘；未访问用户库、执行真实认证、安装或启动原项目。

下一功能必须回到原连接/认证完整链：首host、每候选重新获取信息/创建会话、发auth即返回AUTHENTICATING、发后心跳、同步异常才回退、异步认证拒绝关闭。当前Node遍历hosts/等待认证/拒绝回退仍不等价，不把协议完成当作连接完成。原15项属性余9，Node额外100连接上限另待核对；M09其他解析/缓存/覆盖窗口及完整M01–M18/真人/原生/安装仍未完成。下一功能只保留少量正常、关键失败与关闭安全验证，阶段收尾再全量。

## 此前续迁进度（2026-10-06，弹幕正文与最近消息准入）

完整迁移继续，未暂停/提交/推送。[审计](2026-10-06-danmaku-text-admission-audit.md)/[计划](../superpowers/plans/2026-10-06-danmaku-text-admission.md)：真实Worker→Core→SQLite已按原保留DANMU_MSG原文和scalar转换、Java空白recent-only拒绝、永久完整正文/recent500；事实/指标/去重/ordinal/session不变。独立task复审Approved，I1关闭；最终串行Core170→Worker140→两types0，共310项通过，三生产SHA在清理修复前后不变。

唯一冻结whole会话49085终态exit1/CHECK_EXIT1：1716个此前阶段测试通过，Desktop仅RUN后进程异常3221226505/外层-1073740791，无桌面用例汇总。不要按旧2276/2278报告当前结果，旧pendingadd/trend仍未证明解决，本次也不能证明旧UID/refresh通过。补验23448终态exit0，各TS/Black60/isort/mypy18/Python1037/build及真实Electron四bundle/CJS通过；没有重复Node/check或改变预算/并发。新异常只读诊断，不凭数字猜根因。

下一protocolVersion启动偏好与自动候选只读提案在`.tmp/2026-10-06-danmaku-protocol-next-audit.md`，尚未实施；偏好2→[2,3,1,0]，有效manual2→[2]。原越界manual auto、认证/host/session生命周期差异未关闭，下一实施前main须亲读完整原链并明确边界。原15弹幕属性余10、全JSON/DB Unicode、完整M01–M18/真人/原生/安装保持open。当前代码/测试冻结；异常只读取证完成但根因未知，14:24:49安全核验源APIclean/HEAD分支空index/77路径及基线路径保持/D环境/进程监听0/空白native0。终态49085/23448不再poll，旧完成任务不重派。

用户最新要求“测试项不需要那么多”“这么多测试项迁移的太慢了”。后续只新增少量正常流程、关键失败、退出/数据安全代表性测试，重点原业务实现及实际运行；每小功能不重跑全量历史回归或重复77路径审查，阶段收尾再全量。不再围绕当前异常增设测试或诊断循环；旧验证缺口保留不伪称已修复，继续下个功能。当前已有310项结果仅作历史证据、不追加/重跑，不主动删除已有有价值回归。

## 此前续迁进度（2026-10-06，最近弹幕保留数量）

完整迁移继续，未暂停、提交或推送。[业务审计](2026-10-06-danmaku-recent-retention-audit.md)/[计划](../superpowers/plans/2026-10-06-danmaku-recent-retention.md)：第五recent配置default200/signed32/原alias/规范名/真实Core→SQLite已接；服务min20无upper500、query200独立，永久事件指标不裁剪，lower restart不主动删、高值不补造。真实501/502与两房/顺序/晚到/重启回归；独立task Approved、R1/R2/R3全部关闭。另[UID/Worker观察](2026-10-06-uid-worker-observation-audit.md)task Approved，不改变原业务/预算。

会话94060唯一冻结whole已终态exit1/真实CHECK_EXIT1，Node2276/2278、Desktop669/671/57files、2失败无跳过，Core989等全过。当前完整两缺口：pending v2 add marker10秒失败（fixture patch-ready5491ms→截止10238ms无first-read观察；原stop/exit/SQLite断言不到达），四用户2000点趋势5秒body超时（Home tooltip4615ms完成，未见最终complete）。cleanup实际child10445ms退出/exitedtrue不替代业务断言；refresh实际exit/SQLite通过。UID12×63/finals true/74ops/3513ms本次完成，不宣称旧间歇根因修复；旧startup19跳过不是当前状态。

会话75506补验各步全TS/Black60/isort/mypy18/Python1037/build真实exit0，但末尾main引用错误的workers/dist路径导致整个命令exit1，日志/工具回执保留。随后仅核真正的Electron Main/Core/browser-worker/realtime-worker及CJS，独立bundle验证exit0，没有重跑任何Node/static/Python/build。两个会话已终态，不再poll；完整check仍非绿。69路径最终累计review已结束，7494行/693413bytes全读，累计实现质量Approved，无新增生产Critical/Important/Minor；完整清单只有当前两个whole Important，merge/ship NOT READY。main亲读正式报告后仅Markdown记账，源码/测试冻结；原60路径/HEAD4c/空index/源APIclean/D盘保持，无安装/平台/用户库/凭据操作，最后安全随后刷新。

下一切片只读提案 `.tmp/2026-10-06-danmaku-next-business-audit.md` 已完整读：保留DANMU_MSG字符串原文并按Java isBlank限制recent-only准入，事实与指标仍接收空白；预期两生产文件，尚未实施，main实施前须亲自读对应原代码/API。余10配置消费者逐项核对在该报告；完整M01–M18/真人/原生/安装保持open。不要重派本轮或旧已完成observer/首读/生产切片，不盲目重复check或放宽预算；独立业务推进不豁免当前两Important。

最终13:54:59安全刷新已完成：原B/S/API clean、client4c/分支/空index/69路径及原60路径保持，D环境、项目进程/监听0、diff/新增空白/原生语言源0。审查后仅Markdown结论/安全记账；get_goal仍ACTIVE/unbounded，全量目标未完成，未暂停/阻塞。停止poll终态94060/75506，不重派已完成任务；本检查点不是全量成功或发布许可。

## 此前续迁进度（2026-10-06，六处浏览器启动边界）

完整目标继续，不暂停或提交。[审计](2026-10-06-browser-startup-boundaries-audit.md)/[计划](../superpowers/plans/2026-10-06-browser-startup-boundaries.md)：测试側共用被动observer、真实行为RED→GREEN9、6files77/77/types及task独立审查Approved；代码冻结，原业务/断言/预算/并发保持。

会话98674唯一whole已终态EXIT1（真实CHECK_EXIT=1），Node2181过/2失败/2183、Desktop653/655/56files，无跳过。旧六startup本次完成、Delete9/Status10本次实际通过；当前两项是Workspace12种UID循环body5000ms超时、pendingadd首Worker marker10000ms未到firstread，原stop/SQLite断言不到达。finally child实际退出true不代替断言；refresh另child实际通过。不得继续报告本次6startup失败/19跳过或称根因修复。

会话7776补验已终态EXIT0，全TS/Black60/isort/mypy18/Python1022/build各0，不能转换原whole失败；两个会话不再poll/restart。独立task八文件snapshot审查Approved；完整60路径最终累计审查已结束，slice Approved / merge With fixes / ship No、无新增生产Critical/Important，当前上述两个验收Important保持。原B/S/APIclean、client4c/空index、D产物及进程0保持。完整两项只读核对 `.tmp/2026-10-06-current-uid-worker-audit.md` 已完成：下一波候选原12轮await有限状态+既有FirstReadProbe首次方法获取（准备，非线程提交），无额外RPC/payload/import/global wrapper，目前未实施；旧已完成观察器/首读/生产切片不重派。下一弹幕保留业务仅源审计 `.tmp/2026-10-06-recent-retention-next-audit.md`，未实施。审查后仅Markdown记账，M01–M18/余11属性/真人/原生/安装保留未完成。

## 此前续迁进度（2026-10-06，首次Worker读取与目录保护）

完整目标继续，未暂停或提交。[新审计](2026-10-06-worker-first-read-audit.md)/[计划](../superpowers/plans/2026-10-06-worker-first-read-verification.md)：仅测试側有限首读代理和auto-target创建前Dguard，独立task Spec compliant/QualityApproved；Python6、Core11、Desktop12与类型格式定向通过。原生产业务、协议、预算和并发不变。

会话99515的唯一冻结check已终态EXIT1，日志 `.tmp/2026-10-06-first-read-full-check.log` 含真实CHECK_EXIT=1。Node2151过/4失败/19跳过（2174）；Desktop623/646，55files/6failed；Core939等其它包全过。首次pendingadd本次3489ms实际读入，3538ms childexit，原取消/SQLite不变断言执行通过；refresh亦通过，H2本次被证伪，不称旧超时根因修复。当前缺口是Delete/Status beforeAll导致19项跳过，Trend/Workspace beforeEach、Widget505 goto、TabRail深色beforeEach四失败；6处setup/导航完整清单保留。浏览器body未到达不能写成业务断言失败，跳过不计通过。

会话9153补验终态EXIT0，全TS/Black60/isort/mypy18/Python1022/build各0，日志 `.tmp/2026-10-06-first-read-complement.log`；不能替代原全量失败。两会话均不要再poll/restart。原51项变化保留、HEAD4c/空index、原/API只读、产物D盘；无提交/安装/平台/用户库/凭据操作，完整M01–M18仍未完成。

完整55路径最终审查报告 `.tmp/2026-10-06-first-read-whole-review.md` 主代理已亲读：slice Approved / merge With fixes / ship No，无新增生产Critical/Important；旧Worker取消执行缺口及D预检Minor按本次证据关闭，当前六浏览器整体验证Important保留。只读六文件审计 `.tmp/2026-10-06-browser-current-six-audit.md` 已完成并修正未观察callback不等于浏览器未发生的推理限制。下一轮ONE完整findings wave：6处共用被动有界startup await/lifecycle观察，先写精确透传/诊断失败/边界/redaction/迟到清理/deferred goto-vs-locator行为RED→GREEN；仍不改预算/并发/route/cache/prewarm，不盲目重跑。提案尚未实施，没有新helper/测试/plan或第三次check。已完成Worker/目录/projection/status/delete/startup切片不再派发，审查后仅Markdown记账。最新安全和详细剩余见新审计。

## 此前续迁进度（2026-10-06，粉丝趋势投影刷新）

完整目标继续，未暂停或提交。对照原Vue loadUsers/趋势调度/auto tick，已修复相同本地投影轮询反复读history，保留显式成功刷新、失败保图、共享pending、草稿/选择和原操作确认顺序。受控RED1失败/1过→GREEN2过；task复审关闭诊断异常跳过清理Important和旁路上限Minor，Spec compliant/Quality Approved。最终浏览器98/Worker11通过来自两条命令，不是整套109；types最终通过。

冻结后一次新的完整check退出1：Node2170/2171、Desktop644/645（55files）、无跳过，Core937/Contracts475全过。只剩pendingadd marker10s等待失败：OSspawn/stdio已达，Pythonfixture patch-ready5693ms，10228ms仍pendingunsettled且无replay/alive；cleanup11871ms observed exited=false，失败路径未到stop/SQLite无迟到写入断言。refresh对照首次replay11412/result19430，后续请求及实际退出断言通过。不能据此把时间差归因已证明的CPU/import根因；下一步只读细分runtime入口/依赖加载后再选最小probe，禁止放宽预算/预热/改并发。旧2000点/hint/505导航本次通过，除投影触发有生产RED/GREEN外，不称旧间歇稳定性已修复。

Node失败后补全全types/Black58/isort/mypy18/Python1016/生产构建，补充终态退出0，原check仍1。捕获器在check终态之后追加标记使用了不兼容Tee参数，原日志无CHECK_EXIT；原Node错误/实际shell退出1独立存在，不虚构标记，补充日志用正确参数逐步记录。详细D盘日志、审查、执行和剩余见[本轮审计](2026-10-06-follower-projection-verification-audit.md)与[计划](../superpowers/plans/2026-10-06-follower-projection-verification.md)。最终完整51项增量审查slice Approved、merge With fixes/ship No；无新增生产Critical/Important，Worker全量验证Important和auto-target创建前Dguard Minor开放。下一轮单次完整fix wave处理这两项，先实现首次真实stdin读取最小probe和D纯路径预检，再原预算定向与有假设whole，不盲目碰绿；探针不能预称修复。原45项增量保留，HEAD4c/空index、原/APIclean不变，51路径、D环境/封装/diff/生产marker核验通过、实际项目进程/监听0。未提交推送、安装、平台/凭据或实际用户库操作；所有会话已终态，不再poll旧handle66636/80289。原15弹幕属性余11/最近保留未实现，M06及完整M01–M18仍active。

## 最新续迁进度（2026-10-06，删除诊断与弹幕启动控制）

原完整目标继续，未暂停/提交。[删除启动诊断](2026-10-06-delete-startup-diagnostic.md) task Spec compliant / Quality Approved；一次新 whole check中删除9项执行通过、setup4274ms、pending0。Node2087通过/2旧失败/2089、无跳过；Trend2000点5s及MainLong64 http-started ENOENT保留，不声称根因/稳定性或全量绿色。后续类型/Python/build本次被Node失败截断，之前补充通过仅是历史证据。

[弹幕启动控制](2026-10-06-danmaku-startup-scheduler-audit.md)已按原Properties/YAML/Scheduler/Service和Spring/JDK消费路径实现四字段绑定、开关/容量、首次0与完成后delay、错误安全/退出保护。Host临时目录Important补纯路径RED6→Host22/22+types，复审Spec compliant / Quality Approved。修改后完整check终态退出1：Node2161/2165、4旧失败、无跳过（Core937/Contracts475全部过）；先前删除9也再次执行通过。首次补充types过、Black新文件失败；仅机械修该文件并13pytest过，再从Black恢复58文件/isort/mypy18/Python1016/build全部过，未重跑Node求绿。旧Trend2000点/700–900提示、Widget goto2500ms、MainLong64 markerENOENT仍保留，不称整套绿色或M09完成。最终whole-branch审查切片质量Approved、merge With fixes、ship No：无新增生产Critical/Important，但四项整体验证失败为Important开放，尤其pending add尚未执行到停止/无迟到写入断言；候选suite创建前D盘预检为Minor建议。先补Worker启动/请求与浏览器导航/提示证据，不豁免旧失败或放宽预算。源/APIclean、HEAD/index/45改动保留、生产测试marker/残留进程/监听0、构建封装/D盘核验通过，无提交推送。其余11属性、全局执行域、M06共享recycler及M01–M18范围保持。验证缺口之后的下一业务候选是最近弹幕保留配置（原min20/无上限，当前1..500），尚未实现；原alias RECENT_LIMIT已确认。

## 此前检查点（2026-10-06，弹幕自动监听候选与容量仲裁）

全量迁移继续，客户端仍`codex/follower-monitor-actions`/HEAD`4c94959`，原B/S`fa2faa6`和API参考`271b123`只读clean。此前粉丝操作18项增量保留，未提交/推送。原Repository/Service/V4创建ID与upsert逐段核对后，修复自动监听的额外热度排序、提前LIMIT及先slice后跳过手动：现在直播优先/创建序的完整候选，手动占位后跳过手动填容量，不错误驱逐已选auto。

- 原自动资格、手动协议/会话保护、先停旧auto再启动、失败不递补/下轮同目标重试、显式stop后重启、UPDATE/重开/重加顺序由真实Core/SQLite和合成连接边界验证。最终RED6失败/2通过、GREEN新增9通过；相关旧33项通过。task独立复审Spec compliant/Task quality Approved，无新增未关闭问题；不等同M09全量或真实平台验收。
- 一次DEBUG基线已终态2077/2080，另Subject清理hook；冷启动原因仍未证实。本轮一次最终check退出1：Node2076通过/4失败/9跳过（2089），Core884通过、Desktop617通过/4失败/9跳过（630），另1个suite初始化失败。旧趋势测试体/提示时序、直播两个beforeEach失败；新增粉丝删除beforeAll超时，9项跳过，不能写本次新33全过。未改预算/并发/操作、预热或重跑整套求绿。
- 后续全Types/Black57/isort/mypy18/Python1003/生产构建另行通过；无安装包、原生、真人或用户数据库验收。最新详细规则、RED/GREEN、失败分类与日志见[审计](2026-10-06-danmaku-auto-targets-audit.md)和[计划](../superpowers/plans/2026-10-06-danmaku-auto-targets.md)。最终整轮复审与安全核验结果另行追加，不把本段当已合并/发布。
- 最终整轮复审Implementation-slice quality Approved，无新增生产Critical/Important；Ready-to-merge With fixes，删除suite本次9项跳过是Important验证缺口，未关闭。Minor为M09测试创建前D盘TEMP预检建议，现有实际命令先激活D盘、只在cleanup检查，未伪称建议已实现。11:09:11 +08:00安全核验进程/监听/生产标记0、Main/Core源workspace外置0/CJS存在、diff/尾空白/规则/index通过；原/API clean，HEAD和24项增量保留。没有合并、提交推送、安装或原B/S/用户库操作。
- 下一独立业务先核对M09的enabled/autoStartEnabled、schedulerDelayMs、maxConnections启动消费与原fixedDelay/失败/退出，再测试实现；其余15字段中的协议/心跳/超时/桶/缓存/凭据等未完整迁移。M06共享recycler执行域Important及所有既有未完成项、M08/M09–M18、真人/原生/安装验收继续保留。新文件/缓存/日志/测试库/产物D盘；原项目不改不启动，不访问凭据或用户运行库，不自动提交推送。
- 后续先处理本次新增删除suite初始化验证缺口，按createServer/listen/browser/readyPage分段取证，不无依据重复整套或调整预算；下一M09配置/调度仍只是只读审计。Spring/JDK已确认零initialDelay到期及完成后delay，不能把当前setInterval/autoSync合并误称并发或必然unhandled rejection；双路径int绑定/raw Scheduled及storage条件仍须真实startup回归，未实施。

## 历史检查点（2026-10-06，粉丝暂停/恢复与删除迁移）

用户再次要求继续逐功能迁移，已在`codex/follower-monitor-actions`从`4c94959`恢复开发；本轮原toggleUser/removeUser的实现与定向验收完成，不扩展新业务。原Vue/Controller/Service/Repository/SQL只读核对；新19条browser+14条V2/Core/SQLite、主代理新旧84项通过，两项task复审Approved。状态不再锁按钮，忽略PATCH返回/只等共享list；删除先清选择/当前详情/该用户趋势cache，读失败仍提示已删除，不清错取消/不提前清草稿/允许旧卡片回流。

最终完整check仍退出1：Node2072/2080、Desktop622/630；新增33项全过，旧四组8条导航hook仍超时。四套仅各加1行独立缓存，不改预算/并发/操作，未消除问题；Vite冷预打包是未证实候选，后续先用一次DEBUG时间线定位，不重跑求绿。Types/Black57/isort/mypy18/Python1003/生产构建单独通过；10:43安全检查进程/监听/生产标记0、源/API clean、index空。源码/审计/计划增量仍未提交，未推送或更新安装应用。完整证据与剩余项见[本轮审计](2026-10-06-follower-monitor-actions-audit.md)和[计划](../superpowers/plans/2026-10-06-follower-monitor-actions.md)；M06、M08及M09–M18/真人/原生/发布未整体完成。

## 历史交接（2026-10-06，本地提交快照；当时业务迁移暂停）

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
