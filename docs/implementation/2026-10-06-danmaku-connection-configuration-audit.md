# 弹幕连接配置与身份策略迁移（2026-10-06）

本切片已实现，任务复审 Spec / Task quality PASS，初轮两个 Important 问题修复后关闭。不代表 M09、全部迁移或原生/真人验收完成。用户要求加快迁移：仅新增三个代表业务场景，复用既有验证，不跑全量历史检查或累计分支审查。

## 原业务与实际实现

原项目 `D:/codex_work/BiliMonitor` 只读，基线 `fa2faa6`。亲读原 Properties、application.yml、DanmuInfoClient、Service、PacketCodec 与 WbiSigner；API 资料库仅作历史参考，没有真实平台请求。

| 配置 | 默认值 | 实际消费 |
| --- | --- | --- |
| heartbeatSeconds | 30 | signed32原值，心跳至少5秒；发AUTH后开始，单调时间固定周期，超长等待分段，停止取消 |
| connectTimeoutMs | 8000 | signed32原值，WS握手至少1000ms，不覆盖独立HTTP超时 |
| useLoginCredential | true | false时Core不调用凭据提供者，Worker也不使用收到的登录凭据，匿名buvid保留 |
| webLocation | "444.8" | 原文进入getDanmuInfo参数及现有WBI签名/回退 |
| clientVersion | "1.14.3" | 原文进入AUTH，仅原Java blank/null语义回退，非空白不裁剪 |

共享完整配置由6项变11项，五字段连接契约由完整schema派生，新Worker字段可选，旧start仍可用。真实链路：loader → LocalCoreRuntime → Core Service → WorkerSource → shared WorkerStart → Manager → Node Socket。示例见[配置文件](../../config/bilibili-live-danmaku.example.json)，实际数据目录 `config/bilibili-live-danmaku.json` 只读加载、重启生效。

原环境别名前缀 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_`，新增后缀 `HEARTBEAT_SECONDS`、`CONNECT_TIMEOUT_MS`、`USE_LOGIN_CREDENTIAL`、`WEB_LOCATION`、`CLIENT_VERSION`。规范属性位于 `app.bilibili.live-monitor.danmaku.*`；规范relaxed环境 > 原别名 > 本地文件，保留递归placeholder与安全错误。两文本属性先选原值再展开，允许空串/普通花括号，不将任意原值拼进合成placeholder；文件null/类型/越界仍拒绝，环境覆盖不能掩盖非法文件。

原凭据首次激活后匿名重连hook保持：关闭登录凭据时仍重连，但不读取凭据且保持匿名；启用后重启会使用已保存凭据。没有新增业务服务器、Renderer凭据控制或未实现UI。

## 验证与复审

- 三个实际业务RED分别证明alias未消费、禁凭据仍登录、WS仍用写死超时，均exit1，不是只缺类型的红灯。
- 初轮相关Core83/Node14/Contracts62/Python61通过，三包types及Python单文件格式整理exit0；仅新增3个业务it和少量共享golden，其余复用原回归。
- Main初轮build exit0。独立23路径task-only审查发现R1墙钟影响心跳、R2合成placeholder改写brace文本；没有把局部绿色当审查通过。
- 一波最小修复：心跳目标/剩余时间用performance.now，日志/缓存/签名日期不变；仅两文本字段先选择属性源再expand，旧bool/int/scheduler不变。既有两个代表用例分别RED1→GREEN0；最终仅两个完整文件68项及Core/Worker types通过。
- Main必要的修复后build exit0，会话62621终态，生成Main/Core/两个Worker/preload CJS/renderer。复审仅定向确认四个修复路径，余19项哈希未变；最新Spec/Task quality PASS、R1/R2关闭，无遗留任务发现。

没有root/check.cmd、全历史回归、累计98路径审查或新诊断循环。全部工程命令串行，工具/临时SQLite/日志/产物在D盘。受控HTTPS/Socket、合成QR及实际Core/临时SQLite不等于真人、原生应用或线上验收。

详细证据保留在 `.tmp/2026-10-06-danmaku-connection-configuration-report.md`、`*-task-review.md`、`*-task-package-final.txt`、`*-frozen-final.json` 与 `*-build.log`/`*-build-final.log`；初轮NEEDS_FIXES和RED不覆盖。

## 剩余与安全边界

原15项弹幕配置余4项：bucketSeconds、wbiCacheSeconds、buvidCacheSeconds、listenProbeSeconds。原probe没有消费者，不臆造任务；统计桶raw/no3600上限、两缓存TTL下一步按原业务处理。Node额外100容量、其它解析/覆盖窗口、完整M01–M18、旧全量验证缺口、真人/原生/安装继续open。

原B/S/API只读，全部旧修改保留；未提交推送、安装、启动原项目或访问用户实际数据库/凭据。整体目标active。最终冻结/工作区/D盘/进程与监听核验见 `.tmp/2026-10-06-danmaku-connection-configuration-final-safety.json`。
