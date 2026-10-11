# 最近弹幕保留数量迁移（2026-10-06）

## 原业务与实现边界

本次只迁移 `recentMessageLimitPerRoom`，不是完成整个弹幕模块。原 B/S `fa2faa6` 保持只读；客户端基于 `4c94959` 的既有未提交增量继续开发，所有测试数据和产物在 D 盘。

原路径以 `social-data-monitor/backend/src/main/` 为根：

| 原依据 | 原规则 | 本地客户端 |
| --- | --- | --- |
| `java/com/socialmonitor/bilibili/live/danmaku/config/BilibiliLiveDanmakuProperties.java` | 原始 signed32 整数，默认 200 | TS/共享 JSON Schema 加第五字段；真实启动先校验，再建库 |
| `resources/application.yml` | 原环境别名 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT` | 项目本地配置加载器保留别名；规范环境名优先，之后别名、JSON、默认值 |
| `java/com/socialmonitor/bilibili/live/danmaku/service/BilibiliLiveEventIngestionService.java` | 有资格的永久场次事件先保存；新非空弹幕后按 `max(20, raw)` 裁剪最近列表 | LocalCoreRuntime 真正传入服务；去掉额外 500 上限，仅裁剪最近表 |
| `java/com/socialmonitor/bilibili/live/danmaku/repository/BilibiliLiveDanmakuRepository.java` | 按监控对象隔离，时间倒序/插入身份倒序；存储次级下限 1，无额外上限 | SQLite 保留 `sent_at`/`rowid` 排序和事务，仅移除 500 clamp |
| `java/com/socialmonitor/bilibili/live/danmaku/service/BilibiliLiveDanmakuService.java` | 最近列表单次查询最多 200 | 查询限制不随保留数量扩大 |

六个生产文件：contracts 字段及便携 schema、Core 配置加载器、真实 Core 组装、DanmakuService、ControlDatabase。没有修改 UI、Worker 协议、自动候选/调度、事件资格、永久场次表或数据库版本。

## 配置与操作结果

数据目录的 `config/bilibili-live-danmaku.json` 只读加载、重启生效；缺失文件不自动写入。[示例](../../config/bilibili-live-danmaku.example.json)现在包含五字段。规范名 `APP_BILIBILI_LIVEMONITOR_DANMAKU_RECENTMESSAGELIMITPERROOM` 优先于原别名。

原始 MIN/MAX/0/19/20/501 都在 signed32 配置域中；服务消费才应用最少 20。真正小数、越界、字符串型 JSON/null 拒绝，文件错误不能由环境覆盖掩盖，安全错误不泄露配置值。环境文本沿用已存在的 Spring 兼容整数绑定，不新增另一套解析器。

降低保留数量不会在启动、重启、LIVE、heartbeat 或 UNKNOWN 时主动删记录；下一条符合原最近列表条件的新弹幕触发裁剪。提高数量不补造已裁剪记录。永久场次事实、指标累计和公共查询上限独立。

## 定向验证与审查

初始有效业务 RED：contracts 7 失败；Core 35 失败/43 通过；Storage 指定新用例 1 失败/14 排除。Core RED 同时包含新增测试误把 `+#19` 当作有效输入，后续首次 GREEN 也揭示此错误；已按既有绑定器规则修正有效测试为 `+25` 并补 `+#19` 拒绝用例，未改生产绑定器或抹除失败日志。

初始最终 unfiltered focused：contracts 25、Core 四文件 92、Storage 15 共 132 项通过，共享 Python fixture 24 项和 workspace 类型检查通过。数量只表示这些定向命令，不是全项目通过数。

真实 Core/隔离 SQLite 证明：alias 25 覆盖文件 75；低 raw 实际 floor20；501 配置下 502 条不同的合成弹幕保留 501 最近条，同时保留全部 502 永久 DANMAKU、502 弹幕指标及含 LIVE 的 503 raw 事件。transport/broadcast 身份、receipt ordinal、查询 200/拒绝 201、两对象隔离、相同时间插入顺序、旧时间晚到、重启降/升配置均有断言。只替换平台边界，不 mock repository。

独立初审业务 Spec compliant；测试资源清理 R1 Important 和路径 guard R2 Minor 已集中修复。复审发现修复引入的 Storage pending-open 兜底退化 R3 Important，已仅在新增测试中修复。最终 Core 故障清理 29、Storage 32、相关类型通过；初始 R3 RED4 及额外 late-rejection mutation RED1→GREEN1 的实际顺序保留，后加用例不倒算进初始 RED。最终 v3（103139 bytes/12文件）及 R3 增量独立复审 Spec compliant / Quality Approved，R1/R2/R3 全部关闭，main 读完整报告并复核真实业务 body、旧测试尾部/原 afterEach 保持。synthetic pending 测试不是实际超时或真实文件系统故障验收。

## 一次冻结全量结果

主代理唯一 `check.cmd` 日志 `.tmp/2026-10-06-recent-retention-full-check.log`、会话 94060 已终态 exit1，真实 `CHECK_EXIT=1`。Node 合计 2276 通过/2失败/2278，无跳过；Desktop 669/671、57文件中2失败。Contracts486、Storage71、Task3、Core989、Browser12、Realtime46 全部通过。

当前失败的完整清单只有：

1. `follower-long64-worker.integration.test.ts` pending v2 add：10秒等待 `http-started` 文件失败；5491ms 已观察 fixture patch-ready，截止10238ms仍pending、没有观察到 first-read lookup/enter/line。该缺失不是未发生/导入/CPU根因证明。原显式 stop、child-exit 与 SQLite 无迟到写入断言未执行；finally 实际 child10445ms退出/exited=true 只能证明清理结果，不代替这些断言。
2. `BilibiliFollowerTrendBoard.interaction.test.ts` 四用户2000点：5秒 body 超时。setup已完成；2000点、4个tabstop、End/Home tooltip断言到4615ms已执行；未见最终 `complete`，最后 limitPerUser 查询断言没有本次完成证据。focus/end/home步骤耗时是观察值，不证明性能根因；浏览器 longtask/events 输出为 `[Object]`，没有明细值可引用。

本次 UID12轮实际完成（12×63、两个最终true、74次、3513ms），关闭此前该case缺少执行的本次证据缺口，不宣称间歇超时已修复。Worker refresh对照实际读取/marker/stop/exit21721ms/SQLite对比通过；不能替代失败的add。旧startup路径本次完成、无19项跳过；当前清单不沿用之前失败列表。

Node截断后主代理一次补验：全TypeScript、Black60、isort、mypy18、Python1037、Electron生产build各exit0。会话75506末尾附加bundle校验错用了不存在的 `workers/node-browser/dist/index.js`，因此补验命令终态exit1，原始日志完整保留，不能称整个补验命令exit0。这是main验证路径错误，不是build失败。按实际 `apps/desktop/out/main/{index,core-process,browser-worker,realtime-worker}.js` 及CJS preload仅补做路径/无源包外置检查，独立 `.tmp/2026-10-06-recent-retention-bundle-validation.log` 真实 `BUNDLE_VALIDATION_EXIT=0`；没有重跑Node、static、Python或build碰绿。

13:45主代理安全刷新：原B/S `fa2faa6`/API档案 `271b123` 工作区干净；client HEAD4c/原分支/空index不变，之前60路径全部保留、当前69路径。D盘TEMP/工具/cache/browser路径验证，项目进程及监听0；diff与新增文本尾空白0、新C/C++/Rust/Java源0、真实四bundle/CJS存在、源包外置0、诊断标记0。

最终全69路径累计独立审查已完成：完整7494行/693413bytes包全部读取，累计实现质量 Approved，未发现新增生产Critical/Important或Minor；当前完整清单仅I1 pending-add、I2 2000点趋势两个whole验证Important。merge/ship NOT READY，完整M01–M18仍active/incomplete。main读完整正式报告 `.tmp/2026-10-06-recent-retention-whole-review.md`；审查后仅Markdown记账，不重跑全量/补验、不新加诊断或修改源码。

13:54:59最终刷新再次确认原B/S/API干净、client HEAD/branch/index/69路径和原60路径保持、D运行环境、进程/监听0、diff/新增尾空白/原生语言源0；日志 `.tmp/2026-10-06-recent-retention-final-safety.json`。完整goal仍active/unbounded，未标完成/暂停/阻塞。没有安装、真人、用户数据、提交或推送操作。

## 当前未完成

完整检查仍非绿色：当前 pending-add 与2000点趋势验证缺口保留为 Important。下一项业务只读提案是 DANMU_MSG 字符串原文与 Java isBlank 的最近列表准入，尚未实施；不重复已完成 UID/Worker/启动观察任务、不放宽预算或盲目重跑。原始输入与取消业务仍要完整验收；保留独立非重叠业务迁移的安排，不无限叠加无依据诊断代替迁移。

原 15 项弹幕属性已有本次第五项，余 10 项仍需逐项迁移。空白文本 admission 差异、不同格式等价 timestamp 的统一、全部协议/缓存/覆盖窗口、完整 M01–M18 和真人平台/原生/安装验收保持未完成。MAX 接受只证明类型域，不证明数十亿条负载可行。未操作用户实际数据库、凭据或安装客户端；未提交/推送。
