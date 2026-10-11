# 弹幕正文与最近消息准入迁移审计（2026-10-06）

## 当前结论

本轮只迁移原 B/S 的 `DANMU_MSG` 正文转换和最近弹幕准入，未扩展新业务。正文不再被客户端通用转换函数裁掉空白或丢失标量；Java 空白消息不进入最近列表，也不触发该列表裁剪，但仍保存受支持的场次事件并计入原指标。永久事实完整正文与最近列表的前 500 个 UTF-16 单元保持区分。

独立任务复审 Spec compliant / Quality Approved，测试清理问题 I1 已关闭。最终定向串行回归 23 文件、310 项通过，两个改动包的类型检查通过。这不代表完整 M09 或 M01–M18 已完成。

主代理的一次冻结 `check.cmd` 退出 1：桌面 Vitest 进程以 `3221226505`（外层 Node 报 `-1073740791`）异常结束，只有 RUN 行，没有桌面用例结果或汇总。此前阶段报告 1716 项通过：task-engine 3、contracts 486、storage 71、node-browser 12、node-realtime 140、Core 1004。不能把没有报告的桌面用例算通过、跳过或两项普通断言失败。

另一次串行补验退出 0：全部 TypeScript、Black（60 文件）、isort、mypy（18 源文件）、Python（1037 项）及 Electron 生产构建通过；实际 Main/Core/browser-worker/realtime-worker bundle 与 CJS preload 检查通过。补验没有重跑 Node 测试，不改变完整 check 的退出 1。

## 原业务依据与实现

原仓库只读基线 `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，原目录 `D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live`：

- `danmaku/parser/BilibiliLiveDanmakuEventParser.java:112–143`：正文来自 `info[1].asText("")`，不是 trim 后的字符串。
- `danmaku/service/BilibiliLiveEventIngestionService.java:50–115,147–149`：事实/去重、原指标和最近投影分别处理；仅最近投影要求 DANMAKU 且不是 Java `String.isBlank()`。
- `danmaku/repository/BilibiliLiveDanmakuRepository.java:193–230,387–391`：最近正文取前 500 UTF-16 单元，不修改完整场次正文。
- `session/repository/JdbcBilibiliLiveSessionEventRepository.java:79–107`：受支持的永久事件保留完整正文；空白不等于不持久化。
- API 参考仓库 `D:/codex_work/bilibili-API-collect-new/docs/live/message_stream.md:329–370` 已先检索阅读；其文档只作消息结构背景，不冒充本轮实网协议验证。

生产修改仅三文件：

1. `workers/node-realtime/src/bilibili-danmaku-message-text.ts`：普通 JSON 解析值保持原样，按 holder/key 保存数字 token；只在最终根对象的 `info` 数组索引 1 被消费时转换正文。重复键取最终树，转义键、嵌套诱饵不会串入正文。
2. `workers/node-realtime/src/bilibili-danmaku-event.ts`：只有规范化后的 DANMU_MSG 使用上述惰性正文；身份、勋章、时间、原始 JSON 和其它命令仍走原路径。
3. `packages/core-runtime/src/bilibili-live-danmaku-service.ts`：仅 recent 条件追加已有 Java 空白判定；不在整条事件入口 return，不改 ordinal、事务、sessionSink、去重及指标的顺序和参数。

字符串保留原文；布尔值转小写文本；缺失/null/容器转空串。整数 token 以 BigInt 精确转十进制，包括超过 signed64 的正文整数；这不是修改用户 UID 范围。浮点 token 保留 Double 类型语义，包括负零、溢出、下溢、科学格式与最短数字选择。

浮点格式针对已观察的 JDK 20.0.1 / Jackson 2.17.3 原诊断基线。实现使用精确 binary64 有理数距离及偶数尾数择优，包含 `5e-324 → 4.9E-324`、`1e-323 → 9.9E-324` 等边界；没有添加 Java 运行时依赖、近似 fallback 或新包。原 pom 的 Java 17 编译目标不能被误当作运行时格式保证；本轮没有运行新的 Java oracle，不承诺所有 JVM 版本等价。

## 测试与复审

四个任务测试文件覆盖真实 Worker 解析/订阅和真实 LocalCore/config/SQLite：

- 正文 scalar token、400 位整数、负零、浮点阈值/次正规数/精确平局；最终树和无关命令保持。
- 全 Java 空白集合、空/缺失正文：永久事实、原指标、ordinal 和 session 身份保持，recent 不插入、不裁剪。
- NBSP、figure space、narrow NBSP、BOM 不是 Java 空白；长正文永久完整、recent 500。
- 两房隔离，30 条历史重启后将配置降为 20；空白和其它事件不删历史，下一条合格弹幕才裁剪，比较实际幸存 ID。
- 强 ID 重复永久事实去重，但指标继续，合格消息 recent 继续。
- 测试资源独立拥有、延迟启动/关闭/晚到获取/错误聚合；创建前 D 盘检查及 strict-descendant 清理保护。

实际行为 RED 在实现前：Worker 36 失败/21 通过，Core 8 失败/4 通过；日志保留。中间类型错误和早期 Worker/Core 命令重叠也保留，不能改写为始终全绿或始终串行。最终 I1 波全部相关命令串行：15 Core 文件 170 项 → 8 Worker 文件 140 项 → 两类型检查。

初审唯一 Important I1 是测试 deferred-run 拒绝会跳过后续 owner 清理。原路径实际 RED 1 失败/7 通过；修复后该文件 10 项通过。只修改新 Core 测试，三生产文件 SHA256 与修复前一致。复审确认错误不丢失、后续资源必清理和 afterEach fallback，最终无开放任务代码 finding。

证据保存在 D 盘忽略目录：`.tmp/2026-10-06-danmaku-text-{report,task-review-approved}.md`、`...-i1-{red,green,core-regression,worker-regression,core-typecheck,worker-typecheck}.log`、`...-full-check.log`、`...-complement.log`。这些 scratch 日志不是随仓库交付的文档；本页记录可交接结论。[计划](../superpowers/plans/2026-10-06-danmaku-text-admission.md)保留任务执行边界。

## 全量验证缺口与下一步

当前全量缺口是桌面测试进程异常退出；仅凭退出数字不能认定 CPU、内存、某个 native 模块、Playwright 或本轮正文实现是根因。只读取当前日志、启动配置和匹配的本机事件取证，不修改测试预算、并发、预热或运行时，不盲目重跑完整检查。

有界只读诊断已完成：退出值为同一32位值`0xC0000409`的两种表示；限定Application1000/1001窗口内4条事件均不匹配Node/项目，没有可关联的PID/模块/栈/最后测试阶段。没有新增复现、测试或修复，不能凭无事件宣称没有异常。详细scratch报告`.tmp/2026-10-06-desktop-native-exit-audit.md`；保留为独立验证缺口，不以诊断循环阻塞下一业务迁移。

上一轮 root 的 pending-v2-add 10 秒 marker、四用户 2000 点趋势 5 秒 body 两项失败是历史执行结果，尚未证明解决；这次没有桌面用例结果，不能宣称它们已通过，也不能把它们说成本次实际报告的失败列表。旧 startup 的 19 跳过也不是本次结果。

下一业务只读提案为原 `protocolVersion` 启动偏好→自动候选队列：例如偏好 2 的原队列 `[2,3,1,0]`，有效手动 2 仍只 `[2]`。尚未实施；原越界手动输入的 auto 语义、认证/host/session 回退生命周期必须一并明确边界，不能只接一个配置就称协议全等价。

原 15 弹幕属性仍只迁移 5 项、余 10 项；全 JSON reader 限制、PostgreSQL/SQLite NUL/无效 Unicode/孤立代理单元、M09 其它解析与配置、M01–M18、真人平台/原生/安装验收继续未完成。

## 安全与交接

本轮延续已有工作树，未提交/推送、安装工具、重启安装客户端、启动原 B/S 或操作真实用户数据库/凭据。工具、scratch、测试数据库、缓存、构建均使用 D 盘项目环境；没有新增 C/C++/Rust 业务源码。14:24:49核验原B/S/API干净、client HEAD4c/分支/空index保持，77脏路径中前70路径（含本轮计划）仍存在；仅这3生产文件的SHA冻结验证不变，不能扩大为全部69旧文件逐字节不变证明。D环境/项目进程监听0/diff及新增空白检查通过。任务Approved不替代完整发布批准。

## 后续迁移节奏（用户调整）

用户明确指出测试项过多、迁移太慢。从下一功能起，以对照原源码和实际业务实现为主，只新增少量代表性测试，覆盖正常链路、关键失败和退出/数据安全；不为每个小边界铺设大规模用例。既有有价值测试保留，但不在每个小功能后重跑全量历史回归或重复整个累积分支审查，阶段收尾再执行完整回归与累计评估。当前轮已经完成的测试和失败记录不改写，不再追加或重跑；开放验证问题单列，继续下一业务，不伪称已修复。
