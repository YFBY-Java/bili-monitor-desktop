# M09 自动弹幕候选与容量仲裁迁移审计

## 目标、基线和状态

继续完整逐功能迁移。原B/S `D:\codex_work\BiliMonitor`、`fa2faa6`只读且工作区clean；客户端HEAD `4c94959`、分支`codex/follower-monitor-actions`，此前暂停/恢复与删除增量保留且未提交。所有本轮文件/日志/临时SQLite位于D盘，不使用平台、凭据或用户运行库，不启动原应用/安装客户端。

本项已按[计划](../superpowers/plans/2026-10-06-danmaku-auto-targets.md)完成实现、定向自动回归及task独立复审；完整check仍失败，不能称全量验收通过。原候选/容量仲裁是业务功能，测试环境排障单列；不能用本项结果标记M09或全量迁移完成。

## 原规则与已修复差异

原路径以`social-data-monitor/backend/`为根：

- `src/main/java/com/socialmonitor/bilibili/live/danmaku/repository/BilibiliLiveDanmakuRepository.java:113–134`：ACTIVE且绑定danmu_enabled或正在直播，绑定离线可进，直播不需绑定；UNION去重，直播优先、同类monitor_id ASC，无LIMIT。
- 同`service/BilibiliLiveDanmakuService.java:240–276`：手动所有连接占容量，遍历候选先跳过已有手动再收集自动目标；先停不入选auto再启动。单目标失败不递补，下一轮重试；显式stop没有永久禁自动语义。
- `db/migration/V4__bilibili_live_monitor.sql:1–2`及`live/repository/BilibiliLiveMonitorRepository.java:95–107`：原ID是创建时BIGSERIAL，upsert保留。客户端room普通rowid表、已有房间UPDATE保留rowid；沿用既有直播列表的rowid映射，不能把UUID词法当原创建顺序。

客户端修改前：自动候选query额外热度排序与最大连接数提前LIMIT；Service先slice(autoCapacity)后跳过manual。当容量2、优先A/B/C、A已手动时，旧目标只有A，B既不启动还可能被错误淘汰。现在`control-database.ts:3156–3176`两路均取rowid、去掉LIMIT/热度，返回直播优先/创建顺序的完整候选；`bilibili-live-danmaku-service.ts:290–316`扣除全部手动连接后先跳过手动再填目标，既有停止/启动/失败隔离不变。

本机历史API `bilibili-API-collect-new/docs/live/message_stream.md`认证说明已亲读；只作归档背景。本项不更换HTTP/WebSocket端点，不把历史资料当实时协议验证。

## 独立排障基线（业务修改前）

一次`DEBUG=vite:deps* check.cmd`已终态退出1，日志`.tmp/2026-10-06-vite-loading-debug-check.log`。Node2077/2080、Desktop627/630，另有Subject suite afterAll10s失败。Core875、Contracts461、Storage53、Task3、Browser12、Realtime46通过；本轮此前新增33项通过。

12个Vite server命中metadata/config hash并跳过优化。原8个beforeEach导航超时此次未复现；workspace/trend失败项页面分别812/704ms ready、pending0，因此此次不能继续泛称导航加载失败。

- 旧UID输入与2000点交互：测试体超过原5秒预算。
- 旧MainLong64 pending v2 add：等待HTTP开始标记15秒后ENOENT，启动/进程协调证据不足。
- 旧Subject afterAll：10秒清理超时，尚未分辨browser.close或server.close。

没有扩大预算、减少并发、改变旧操作、预热或删除cache。本次暖缓存运行不能证明冷启动因果或修复；Vite优化依赖自身不注册crawl集合，简单自等待死锁已被源码否证。冷scan/crawl/commit候选仍需时间线；如暖缓存下deps再次pending，下一取证应关联HTTP request/response finish/close，而不是继续猜扫描。此轮不反复运行求绿，风险保留。

粉丝共享recycler已重新只读核对，重要差异仍真实影响PARSE/回退/历史；原跨HTTP/调度/模块线程与客户端分Worker域不同，不能用follower全局最大缓存伪装等价。完整执行域映射、M06其它差异保留，未擅自决定新的兼容策略。

## 实施、验证与复审

### RED → GREEN与真实链路

- 初8项测试4失败/4通过；修正夹具使手动A确实占首位（热度999，不放宽断言）后，生产修改前最终RED为6失败/2通过。失败分别证明顺序/完整列表、手动空槽、错误淘汰、抢占顺序和入选失败目标问题；没有把夹具错误算业务RED。
- 生产仅修改上述两个方法，无schema/contract/Worker/UI变化。移除Storage内部limit参数后同步测试调用签名，保留数量和顺序断言；只有一个生产调用方。原`max(1,maxConnections)`保留。
- GREEN初8项通过；随后增加同热度12候选及非ACTIVE绑定排除，最终新增9项全部通过。不能声称全部9项曾RED。相关旧Service/lifecycle/upgrade/auth联动4套33项通过，Storage/Core类型检查通过。
- 新测试`bilibili-danmaku-auto-targets.integration.test.ts`使用真实临时SQLite、生产Service和现有合成Realtime边界。验证直播无需绑定、绑定离线入选、UNION去重/创建顺序、手动协议和会话身份、全手动容量、先停旧auto再启新auto、资格丢失、失败不递补/下轮同目标重试、显式stop后合资格重启、UPDATE/重开/重加顺序。不是生产test-only接口或平台验收。
- 独立task复审：Spec compliant、Task quality Approved，无新增Critical/Important/Minor。diff外的maxConnections最小值由主代理重新核对，退出/登录联动旧回归通过；环境/源只读与增量保留另作主代理安全检查。

日志均在D盘`.tmp/2026-10-06-danmaku-auto-{red,green,regression}.log`；brief/report/task review package也在同目录。未提交、推送或修改原B/S。

### 修改后的整轮检查（11:01–11:04 +08:00）

一次`check.cmd`终态退出1，日志`.tmp/2026-10-06-danmaku-auto-final-check.log`。Node **2076通过、4失败、9跳过（2089总数）**；Desktop617通过、4失败、9跳过（630），另有1个suite beforeAll失败。Contracts461、Storage53、Task3、Browser12、Realtime46、Core884全部通过，新增M09的9项在完整Core运行中再次通过。

- 旧趋势2000点：测试体5秒超时。
- 旧趋势700/900ms提示：时序断言未在原poll预算内变空；本次不是hook失败，不归类为纯加载超时。
- 旧直播Widget/房间展开：各一项beforeEach10秒超时。
- 此前新增粉丝删除suite：beforeAll10秒超时，9项业务测试因此跳过。此前定向通过仍是历史事实，但本次不能说新33项全过，也不能把该suite归成旧测试。

没有增加预算、减少并发、改操作/图表、预热或删除cache；没有重复完整check求绿。暖缓存基线和本次故障位置不同，初始化、测试体时序和清理风险分别保留，不宣称根因已修复。

被Node失败截断的后续检查另行运行：全部TypeScript、Black（57文件）、isort、mypy（18源文件）、Python **1003项**、Electron Main/Core/Workers/CJS Preload/Renderer生产构建通过，日志`.tmp/2026-10-06-danmaku-auto-complement-check.log`。这些单独通过不等于完整check退出0；没有安装包/原生客户端/真人平台验收。整轮最终独立复审与安全结果记录在台账和交接。

### 最终整轮复审与安全

独立最终复审覆盖HEAD以来全部24项未提交源码/测试/文档增量（含此前粉丝操作），并直接核对原自动候选SQL和Service：Implementation-slice quality **Approved**，无新增生产Critical/Important；Ready-to-merge **With fixes**，完整check中粉丝删除初始化失败/9项跳过仍是Important验证缺口，不能由此前定向通过替代。其它旧测试失败也保留，不合并/发布或声称完整绿色。

Minor建议单列：新M09测试只在清理时检查D盘TEMP，脱离规定激活环境运行会先创建目录；创建前也加D盘预检可增强夹具安全，尚未修改。当前所有实际命令先激活D盘环境，未在C盘创建本轮测试目录，不把建议写成已实现。

主代理重新核对`maxConnections=max(1,option??10)`、候选唯一生产调用方和原UPDATE保留rowid。11:09:11 +08:00安全检查：进程/监听0、生产本轮测试标记0、Main/Core外置源workspace包0、CJS Preload存在；diff、新文本尾空白及规则文件核验通过。原B/S`fa2faa6`、API参考`271b123`均clean，客户端HEAD`4c94959`/分支不变、index空，全部24项增量保留。TEMP/Python/pnpm/日志/测试库/产物D盘，无新增依赖/工具/服务、真实凭据/用户库访问、原B/S启动、安装客户端更新、提交或推送。

## 剩余目标

后续验证更新：已完成[删除启动诊断](2026-10-06-delete-startup-diagnostic.md)，一次新 instrumented whole check中删除9项执行并通过，startup4274ms、pending0；Node2087通过/2旧失败/2089，无跳过。上轮执行缺口获得新证据，不等于超时根因/冷启动稳定性修复；完整check仍未绿色。诊断未改预算/并发/操作。M09测试创建前D盘预检建议也继续保留。

下一独立业务项先核对M09的enabled/autoStartEnabled、schedulerDelayMs、maxConnections启动配置及原fixedDelay执行/失败/退出语义，再建立RED回归与实现；本项没有修改调度或接入配置。原15个属性的默认值/消费位置已只读审计，不把已发现差异算已实现，余下协议、心跳/超时、bucket/recent、缓存和凭据等继续保留。M06共享recycler、M08和M10–M18、真人/原生/安装验收都继续保留。没有提交/推送或标记完整目标完成。

下一项只读Spring/JDK核验已确认：原未配置initialDelay的fixedDelay首次到期为注册时零延迟（不保证立即执行），后续从执行完成后计算delay；当前客户端5秒setInterval并不等价。Service已有autoSync合并/拒绝处理，不能因此声称每tick并发或必然unhandled rejection。配置存在无条件int属性绑定与仅storage Bean存在时raw Scheduled消费两条路径；Scheduled不trim/raw Duration可解析不意味着同字段int绑定接受Duration。零/负delay在调度执行器拒绝，但storage=false不走此消费，仍保留int绑定。此为下一项依据，不是新配置已实现或全局线程/执行域等价证据。
