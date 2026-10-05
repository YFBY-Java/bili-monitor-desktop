# M06 原粉丝“立即刷新”迁移审计

## 范围与原依据

原 B/S `D:/codex_work/BiliMonitor` 的 `fa2faa6` 只读；客户端 `b2e5a89`，开始时234项增量/147新增、index空，保存既有改动。历史本地API资料的card段先行读取，只作研究材料。所有新夹具/缓存/临时库/输出D盘；无平台请求、凭据、用户运行库、原项目启动、原生安装验收或提交推送。

原 `BilibiliView.vue:470–504,548–558,1206–1254`：清apiError→await refresh→await共享loadUsers→提示“已刷新”。refresh抛错不重读；list抛错被loadUsers吞下仍确认刷新成功；共享已有read时不再清错，启动新read时清共用错误。list成功按原dirty规则同步间隔、清失效选择并排队趋势，不等待历史。手动不设busy/autoCollecting、不锁重复点击/状态/删除/间隔。手动后成功状态沿用客户端现有本地status呈现，不增加新通知系统。

原 Controller:64–67、Service:101–104,134–168、Repository:110–146,183–207：手动平台失败markFailure后抛BusinessException，不返回success:false；false DTO属于自动批采集。开始即missing是NOT_FOUND；在途删除后成功路径UPDATE0再history FK失败，是内部错误；失败路径UPDATE0后仍平台拒绝。原成功next和relation回退用户资料均使用请求开始的user；后来的interval/status由SQL保留，成功next即使PAUSED也重写。原失败退避按开始interval取max(300,min(interval,backoff))。

## 本项生产修补

- Workspace专用refreshUser：手动开始清旧写/读错，不进入generic busy/finally invalidate；await refresh后只await共享list，list失败仍确认“已刷新”，拒绝时仅错误。手动不再设置autoCollecting，手动按钮不被其它操作busy锁；其它状态/删除完整迁移仍在后续队列。
- 新list queryFn清actionError，复用在途read不会再次执行queryFn。列表仍单读无重试，成功仍显式同步dirty草稿/选择与既有趋势队列，无乐观投影、串行化、latest-only或迟到丢弃策略。独立复审补修本次清错的交叉影响：generic action只在成功后invalidate，失败不读从而不吞掉错误；读失败清写错、写失败隐藏读错，按原单一apiError的最后写入显示，而不是新增错误归属/迟到guard。成功状态/删除完整流程与原其它差异仍留后续核验。
- Core persistSnapshot使用请求开始的interval和relation资料；collect-only SQL保留后来status/interval、不INSERT用户。删除中成功落库失败保持普通内部错误（本地typed IPC的通用分类，不另起HTTP服务器；SQLite事务阻止复活/失败snapshot）。退出ensureRunning/取消、Long64计数、失败落库/原重试规则保持。

## RED→GREEN与覆盖

真实React/Query/Chromium只窄化typed bridge，refresh-flow新夹具可按调用索引等待/失败/结果，列表调用开始捕获旧DTO，默认旧夹具保留。新增13项覆盖：失败无list/history且可重试；开始清旧读写错误；不锁任何同用户动作且无auto标记；成功await list且不乐观写Long64计数；list失败仍成功且只读一次；共享旧在途read/后读取得新值；不等held历史；clean同步/dirty保留；同UID重复点击/逆序完成共享read；不同用户并发/保留当前详情草稿；status busy不锁manual；新read清并发旧错、共享旧read不再次清错。

首次13项失败：12项业务差异；1项夹具DOM选择器错误导致5秒超时，修正为实际.follower-counts后独立重跑，490ms在“手动按钮应启用”处真实RED。保持原5秒case/30秒startup/1.5秒poll预算，不改并发/强制click/延迟掩盖。生产修补后13/13通过（10.14秒进程，9.34秒cases），无pageerror或外部网络请求。

新增真实Core/V2/SQLite 9项：active/paused在途间隔变化next；失败退避/三错误/旧measurement+history/API记录；恢复清三错误；回退保留开始profile；同UID重叠逆序写/两条history；在途删除成功内部错/失败平台错均不复活；开始missing零Source。初次8项4失败，其中一处测试忘记既有CoreApplicationError消息code前缀，修正期待后3项真实RED；追加回退profile独立RED。修补后9项及settings4/parity6合计19/19通过（2.24秒）。旧v1删除断言和2个旧浏览器手动collecting/busy断言按原证据修正，其它流程、时钟、预算保持。

独立前端复审发现2个Important：列表开始清错配合旧generic finally会吞状态/删除失败；read/write分离展示会留下两条错误。新增4条真实浏览器case（status/delete失败不读且保留提示；list与manual失败两个完成顺序只有最后一错）全部先RED，最小修补后绿色。新17及旧workspace25/add15/interval15/Main carrier6共78/78通过（29.93秒），保留既有图表/输入/添加业务；首次59定向遗漏错误文件名过滤下的add suite，不将它计作通过证据，后来以实际AddFlow文件补齐。Core独立只读复审无Critical/Important/Minor，确认shared collectUser与auto共用改变符合原request-start，退出保护和本地内部分类仍有效。

## 最终验证与暂停交接

前端修补已独立复核：两项Important关闭，前端/Core均无未闭Critical/Important/Minor，冻结Workspace `18DA04BC…`、新browser `14A461BF…`、service `1DA39F45…`、新Core `C7DF6B26…`，前后验证保持。

首轮完整check退出1：其它Node1450通过，Desktop589/593、新13均通过；旧LiveOverview两处page.goto(commit)2500ms、TrendBoard2000点键盘5s、Long64 Worker add开始标记10s等待失败，Subject和TabRail afterAll清理10s超时。保留日志`.tmp/2026-10-05-follower-manual-refresh-check.log`；五个旧suite原预算定向46/46通过（37.16秒）。第二轮完整check仍退出1，日志`2026-10-05-follower-manual-refresh-final-check.log`：Node2045/2047、Desktop595/597、新17全部通过，旧2000点键盘5秒和Worker add启动标记10秒仍失败。图表setup720ms、points1171ms、focus3575ms、End3691ms、Home4537ms后未完成；Worker标记ENOENT。**完整check未全绿，根因未修复**，没有提高预算/降低并发/删断言/改变真实操作或图表，不以定向绿色掩盖全量问题。两轮都在Node gate退出，因此Python/格式/生产构建不是那两次fullcheck的执行结果。

Node中断后另行全部通过：root所有TypeScript检查、Black57/isort/mypy18、Python1003（2.67秒）、Main/Core/Node Worker/CJS Preload/Renderer生产构建。独立日志`.tmp/2026-10-05-follower-manual-refresh-remaining-checks.log`与`2026-10-05-follower-manual-refresh-python-checks.log`，不冒称check退出0。原HTTP503/Python NDJSON与Main/Preload V2真实Router/SQLite carrier本轮有通过证据；合成进程不等于实际Electron utilityProcess或真人平台验收。

2026-10-06 00:03:36 +08:00安全：项目进程/监听0、生产本项fixture0，Main/Core无外置源workspace包、CJS Preload存在，diff/新增尾空白/空index/CLAUDE核验通过。原B/S `fa2faa6`与API `271b123`只读clean，客户端HEAD `b2e5a89`，240项含151新增保留；新输出/日志/缓存/临时数据库D盘，无提交推送/安装工具/平台凭据或用户运行库访问，无原B/S/安装应用启动或新安装包。

本项实现及定向验收已完成，但完整仓库自动验收仍未通过。按用户明确“本功能跑完就先停止”，写交接后暂停全量目标，不进入下一切片。恢复时先复验全量稳定性再原toggleUser/removeUser；M06/M01–M18没有标完成，默认recycler、NDJSON尾帧、HTTP编码/分类、其它配置/JVM/Double/SQL文本候选、M08–M18以及真人/原生/安装验收不缩减。
