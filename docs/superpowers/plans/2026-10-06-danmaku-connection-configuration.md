# 可配置弹幕连接与身份策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task. 当前用户要求减少验证，不逐字段微切片。

**Goal:** 原B/S连接五项配置在本地客户端完整生效。

**Architecture:** 共享启动配置→LocalCoreRuntime→Core Service→WorkerSource共享请求→Manager→真实连接。Core先门控凭据，Node控制WS/心跳/请求与AUTH；不新增业务Server。

**Tech Stack:** Electron/React、TypeScript Core/Node Worker、SQLite、JSON Schema/Python契约验证。

**Readability:** 仅TypeScript/Python/声明式配置，无新增C/C++/Rust。

## 执行步骤

- [x] 使用下方完整规格和22文件任务前快照，先确认少量实际业务RED。
- [x] 实现五项启动配置、共享可选连接配置契约、真实Consumer/凭据策略和长计时器安全。
- [x] 串行运行改动覆盖文件、三个包types及两Python契约/修改文件格式检查，记录真实退出。
- [x] Main初轮build/独立task复审，R1/R2一波修复、必要覆盖/重建及定向确认PASS，保留初轮历史。
- [x] Main更新业务审计/README/台账/交接；15:24安全核验冻结23项/原98路径无关内容/源API只读/D盘/HEAD空index/实际bundle/进程监听通过，余四项与全量迁移保持open，不提交推送。

# Task 1: 可配置弹幕连接与身份策略

当前任务是完整 M09 迁移中的一个功能：一次贯通 heartbeatSeconds、connectTimeoutMs、useLoginCredential、webLocation、clientVersion 五项，不能只加配置/Mock测试。原 `D:/codex_work/BiliMonitor` HEAD fa2faa6 只读；客户端 `D:/codex_work/bili_reptile/bili-monitor-desktop` HEAD4c94959/branch codex/follower-monitor-actions，任务前98dirty，22现有文件快照在 `.tmp/2026-10-06-danmaku-connection-configuration-before`。上一连接/认证生命周期已DONE，不重做。Main亲读原Properties/application、DanmuInfoClient全链、Service握手/心跳/升级、PacketCodec/WbiSigner，完整只读审计 `.tmp/2026-10-06-danmaku-remaining-configuration-readonly.md`。

## Global Constraints

- 原项目与API资料库只读，保留此前全部未提交修改；不提交、推送、切分支、安装、启动原B/S、原生客户端或访问用户实际数据库/配置/凭据、真实平台。
- 本地 Electron + React + TypeScript Core + SQLite + Node/Python Worker；禁止新增C、C++、Rust、业务HTTP Server、固定监听端口、容器或外部数据库。
- 工程命令先 `. ./scripts/activate-environment.ps1`，工具、TEMP/TMP、缓存、测试数据库、日志、构建产物全部D盘。
- Core唯一控制数据库写入者；Worker只通过共享契约通信；新wire仅追加可选兼容字段，TS/Python使用相同golden。不得把Cookie开关或Secret下放Renderer。
- 用户明确要求减少测试、加快迁移：目标仅3个代表性新增业务场景，复用既有用例/fixture，禁止大矩阵、新故障/清理框架、诊断循环。只运行改动相关文件及types，严格串行；Main一次生产build和task-only review，不跑root check/全历史/cumulative98路径审查。旧全量失败保留，阶段收尾统一回归。
- 不增加test-only生产接口，不静默吞异常，不将合成I/O/临时SQLite当真人/原生/线上验收；不放宽旧预算/并发/安全断言，不删除已有有价值回归。

## 业务与实现规格

1. Shared完整启动配置由6项变11项。raw heartbeatSeconds/connectTimeoutMs使用现有signed32(-2147483648..2147483647)整数schema，default30/8000；useLoginCredential primitiveboolean defaulttrue；webLocation/clientVersion是原文string default"444.8"/"1.14.3"，允许空字符串，不trim、不做number/header格式限制；本地JSON null仍类型错误，不扩展原输入。
2. loader复用现有canonical relaxed环境优先、原alias再disk、placeholder链。新增alias全前缀 SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ + HEARTBEAT_SECONDS、CONNECT_TIMEOUT_MS、USE_LOGIN_CREDENTIAL、WEB_LOCATION、CLIENT_VERSION。canonical属性 app.bilibili.live-monitor.danmaku.heartbeat-seconds、connect-timeout-ms、use-login-credential、web-location、client-version。boolean三键用bindFollowerBoolean；这两个int用bindFollowerInteger；string经expand原样返回，不能落入旧integer分支；错误保持现有安全码/固定文案，不打印原config。
3. 从完整配置derived/export BilibiliLiveDanmakuConnectionConfigurationSchema/type，只pick这五项，保留默认和strict。Core SourceStartInput新增可选connectionConfiguration、ServiceOptions同字段；LocalCoreRuntime真实装配这五项到Service。WorkerSource透传、shared WorkerStart新增可选connectionConfiguration、Manager透传、Node连接真正消费，旧没有新增字段的start仍默认工作。没有手写另套wireDTO，不向UI新增控制器或改展示。实际Source/Manager不可漏字段。
4. Core credential() 在useLoginCredential=false时先返回undefined，不调用provider、不解密/传输凭据。默认true仍原逻辑。Worker也按false忽略提供的credential，防止独立请求绕过此策略；nav/getDanmuInfo和AUTH都不使用登录Cookie/UID。仅禁登录凭据，不禁匿名buvid。原auth激活hook与匿名重连保持（即false重连后仍匿名），不自行优化成不重连。
5. WS connectTimeoutMs仅握手/HttpClient max(1000,raw)毫秒；heartbeatSeconds max(5,raw)秒、发AUTH后初始与周期一致，不把WS值覆盖live HTTP配置。保持AUTH发后返回、异步拒绝不fallback、stop/abort/early terminal/attempt/ownership隔离。Node秒*1000可能超过2147483647ms，不能变1ms心跳、截断raw范围或提前发送。为长周期分段等待，按原fixed-rate目标时间推进，取消能清当前timer；正常小周期仍同原周期，不新增公共调度框架。直接底层旧input.connectTimeoutMs/heartbeatSeconds已有调用可兼容，无配置时同默认。
6. webLocation原文传到getDanmuInfo参数并参与现有WBI签名，沿每候选fetch/现有凭据与风险回退；不重写cache/HTTP/fallback。clientVersion传至实际AUTH包；PacketCodec仅null/undefined/Java isBlank回退"1.14.3"，非空白原文（含两侧空格）保留。Java isBlank不包含NBSP/FEFF，空串包含；可以private轻量predicate，不能用JS trim造成额外裁剪。包头版本1、实际protover、UID精度保持。
7. 同步JSON Schemas(完整11字段、Worker兼容可选nested5字段)、example；新golden只少量正常/非法样例同时TS/Python验证。复用已有完整config fixture自动跨语言；新增worker connection golden建议2-3条。原6字段defaults精确旧断言须更新新完整默认对象，不改旧行为断言为宽泛toMatch来掩盖变化。
8. 本任务不迁移余bucket/WBI/Buvid/probe，不声称M09/fullgoal完成。probe原主代码无消费者，未来只补兼容绑定不能臆造功能；bucket raw/no3600/缓存TTL仍原业务待做。旧Node额外100容量另保留。不要围绕这些或旧Desktop异常另跑诊断。

## 文件范围

22existing snapshots: config/example；contracts config.ts/test、fixtures/live-danmaku-configuration.json、config schema、worker start schema、worker.ts/test；Core config.ts/test、local-core-runtime.ts、service.ts、worker-source.ts/test、configuration.integration.test.ts；Node connection.ts/test、packet.ts/test、Manager.ts/test；Python test_danmaku_http_contract.py。仅实际必要文件改动，大文件局部，不重构无关模块。
可新建 `packages/contracts/fixtures/danmaku-worker-connection-configuration.json`。其他需改现有路径先消息Main，Main保存任务前快照后允许。Python配置测试未必修改：已读取同一完整fixture，验证时包括它即可。Main owns README/tracker/handoff/audit/build/review/safety。

## 精简TDD与交接

- 首先少量代表业务RED，至少实际Core/Socket真实行为差异红灯，不能只schema/type缺失。推荐3个新增场景：loader五字段alias/canonical/rawstrings+安全失败；realCore配置/合成QR已登录但false匿名→保留原激活重连/切true重启后LOGIN；Socket非默认请求/AUTH/心跳/floor并验证一个长周期不提前发送。可扩展已有Source/Manager/Packet正常用例验证透传/原文，不新建大矩阵。利用现有follower/danmaku D盘fixture和SyntheticAuthSource，无真实网络/端口。
- 最终一次related unfiltered Core loader/configintegration/source + Worker connection/packet/Manager + contracts config/worker 与两Pythoncontractfiles，三包types；Python修改文件Black/isort也一次运行确保Main build前消掉格式问题。工程执行严格串行，日志.tmp唯一名字，每次真实native exit写报告，不盲目重跑求绿。
- 完整报告 `.tmp/2026-10-06-danmaku-connection-configuration-report.md`：DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT，准确文件、RED/GREEN命令/log/exit、实业务/cleanup自审与未完成边界。全部工程命令终态后再报告，Main再build。只返回状态+报告路径+一行结果；不Git commit。
