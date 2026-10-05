# 粉丝 API 错误响应迁移审计（2026-10-05）

## 范围与原依据

用户再次授权继续迁移原 Web 业务，逐功能实现；全量 M01–M18 范围不变。本轮只交付 M06 的 **card/relation 错误判定链路**，不是完整粉丝模块完成。

- 原 B/S：`D:\codex_work\BiliMonitor`，HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`；开始及本轮中段只读检查均干净，没有启动。
- 客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`；保留所有此前 Rank/弹幕HTTP/直播存储/粉丝配置/共享限流未提交改动，暂存区为空。
- 原实现：`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/client/BilibiliApiClient.java` 的 `ensureSuccess/get/optionalText`；`bilibili/service/BilibiliFollowerMonitorService.java` 的重试、回退和失败记录；`collector/service/RetryPolicy.java`。
- 先阅读本机历史端点资料 `D:\codex_work\bilibili-API-collect-new\docs\user\info.md` 的 card 与 `docs\user\status_number.md` 的 relation；没有使用历史文档代替当前原代码。
- 为确认字符串/数字节点的转换差异，查阅 [Jackson NumberInput 源码](https://raw.githubusercontent.com/FasterXML/jackson-core/2.17/src/main/java/com/fasterxml/jackson/core/io/NumberInput.java)、[BooleanNode 源码](https://raw.githubusercontent.com/FasterXML/jackson-databind/2.17/src/main/java/com/fasterxml/jackson/databind/node/BooleanNode.java)、[Oracle Double 字符串语法](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Double.html#valueOf(java.lang.String))。原 pom 为 Spring Boot 3.3.6；本轮没有运行 Spring 或增加 JVM 工具依赖。

计划：[错误响应执行计划](../superpowers/plans/2026-10-05-follower-error-response.md)。实现仍是本地 Electron + TS Core + SQLite + NDJSON Python Worker，无新增业务服务或监听端口。

## 实现差异

| 原规则 | 旧客户端问题 | 本轮实现 |
| --- | --- | --- |
| `code.asInt(MIN_VALUE)` | `"0"` 被视为 API 失败，字符串错误码丢元数据，数字转换错误 | 独立 `bilibili_follower_errors.response_code`：bool 转0/1、整数低32位、浮点截断饱和、简单数字文本溢出 sentinel、浮点/科学/十六进制文本按原分支；只去掉 Java trim 范围 |
| -101 认证、-352/-412 风控，其余 UNKNOWN | 普通 API 错误分类为 API_ERROR | `BILIBILI_UNKNOWN_ERROR`，保留转换后的 `biliCode` 和HTTP200 |
| `retryable = code >= 500`，但 RetryPolicy 只看分类 | 缺/字符串 code 的 retryable 元数据不符 | 原始标记照原记录；UNKNOWN不会重试或回退，不能按 true 直接再次采集 |
| HTTP429限频、5xx服务器、其他4xx UNKNOWN | HTTP403归为另一个 HTTP_ERROR | 统一 UNKNOWN；503仍三次重试后 relation回退 |
| voucher 非null优先风险拦截 | 已有规则正确，但需要与新code转换一起锁定 | false/0/空字符串/对象/数组均先拦截，code固定0，不重试 |
| 非空白错误文本原样返回；bool小写，容器无文本 | strip改消息，bool变True/False，容器被拼成Python字符串 | 保留字符串外围空白、NBSP/figure-space/narrow-NBSP/BOM；Java whitespace为空时用转换后code生成默认消息 |

未改变正常 profile/count 字段解析，没有放宽共享契约或 SQLite 数值约束，也没有让其他 Worker 调用这套粉丝规则。直播的 `-500` 重试标记与粉丝不同，继续独立处理。

## RED → GREEN 与链路证据

- 修改生产代码前，新 Python 参数矩阵实际失败于字符串0/风控、UNKNOWN分类、元数据和消息；既有500/HTTP403断言也先改为原分类并失败。98个新参数回归中已符合原语义的voucher/部分文本等是锁定覆盖，不伪称全部都新增失败。
- 新 Core 5项第一次全部失败：风控类别/码/文本不符；其余业务测试初始 card 的 `"0"` 被拒绝，无法创建监控。修正 code 后，进一步修正测试使用必填 taskId 查询API日志以及省略字段断言，未为测试增加生产接口。
- 初次GREEN：Python112项（新98 + 原14）通过；Core20项（新实际Python集成5 + 既有采集规则15）通过。
- 集成 fixture 仅替换 HTTPX 网络传输，实际解析、WorkerRuntime、NDJSON子进程、WorkerSource、Core服务和临时SQLite保持真实实现。无真实平台调用或用户数据库。
- 实际NDJSON错误携带 `biliCode=-352`、HTTP200、card endpoint、原始消息；失败不创建CAS。
- 实际Core添加监控成功后，API `"500"`、`" -101 "`、HTTP403每次只记录一次card失败；无重试等待/无relation回退，历史点/资料/最后成功时间不变。
- HTTP503实际三次失败，再relation成功，记录四条调用、原100/200毫秒退避，保留原昵称/主页，更新粉丝数并清错误。
- mypy独立检查发现局部变量整数/浮点推断混用，重命名整数变量后严格检查通过；没有改变算法。
- 独立复核指出 `+` 删除后出现的ASCII空白还要走 Double 的trim，而不能在整数扫描前去掉；补12个参数，10项先失败、2项锁定NBSP拒绝，再修复double分支。首轮全量检查也在修正前导入旧模块并捕获这10项失败，不能计作全量通过。
- 独立复核指出Python4300数字字符串保护拒绝了原Java可解析的5000个前导零；补10参数，8项先失败、2项锁定超范围拒绝。修复只转换至多10个有效数字，不关闭全局安全保护。修后针对性Python134项（新120 + 原14）、mypy/Black通过。
- 独立最终只读复核确认两处P2均关闭，没有未关闭的重要问题；独立Python134通过。审查方使用原已有Jackson2.17.3/JDK20的D盘离线探针对照3264个字符串与10组极长浮点样例均一致；这是附加审查证据，不是仓库常驻回归，也不冒充启动原Spring服务。

## 验证状态

冻结源码后第二轮完整 `check.cmd` **退出0**，全部检查通过；不是拼接第一轮或9月26日历史结果。

- **Node1049、Python496**。Node分项：Contracts276、Storage19、Task3、Core436、Browser12、Realtime46、Desktop257。新125个自动回归（Core5 + Python120）包含于总数。
- TypeScript/Python类型、Black/isort、Electron生产构建、D盘路径检查均通过；不等同于安装包/原生/真人验收。
- 独立复核的两项P2均已RED后关闭，最终没有未关闭的重要问题。3264字符串/10极长浮点的附加对照不计入仓库测试总数。
- 新fixture标记未出现在生产Electron bundle或Python src；打包入口只包含src/worker_entry，不包含tests。没有制作新安装包。
- 收尾 `git -c core.autocrlf=false diff --check` 通过；项目Node/Python/Electron进程0；`CLAUDE.md`仍仅`@AGENTS.md`。
- 客户端仍`b2e5a89`，暂存区空，旧/新增量均保留且未提交/推送；原库仍`fa2faa6`、工作区干净，未启动或修改。

本切片实现与自动验证完成。全量迁移继续进行，下一项为粉丝已有环境配置的原绑定规则，不关闭完整M06或其余迁移范围。

## 未完成范围与下一项

M06 **完整 parser 接受域仍未完成**：正常昵称/头像的 trim、长度和URL；Long64（含负数）必须连同共享响应、SQLite和UI精确处理，不能只放宽Python；合法非对象根JSON、数字标量文本的完整Java Double.toString拼写等仍需单独实现。API日志也尚未对齐原 `failureMeta` 中message/biliCode的完整持久化；本轮只确认这些错误元数据到达NDJSON父进程，SQLite日志现有字段是类别/HTTP状态/retryable，不能称完整metadata存储已对齐。没有把这些边界排除出全量目标。

并行只读审计另外记录了下一项候选，**实现前仍逐项重新核对原依据**：

1. 粉丝已有环境入口的配置绑定：原 `storage-enabled` 使用未trim的 `@ConditionalOnProperty`，仅字符串false（忽略大小写）禁用；它不是 Properties 的 Boolean 转换。`enabled` 支持on/yes/1与off/no/0；普通整数支持框架空白删除和十六进制，但活动 scheduler 还独立读取原始 fixedDelayString，不能盲目复用。下一项先迁移这条配置输入→运行功能的规则，保留本地JSON的既有明确类型契约。
2. M08直播完整响应/输出域：未知liveStatus不能悄悄变离线；Int32窄化、Long64精确计数、辅助负ID、URL非空白文本、Unicode长度、扩展日期、合法非对象根和数字文本仍有差异。既有数百绿色测试未覆盖这些原语义；实现需同时走Worker/Core/SQL/Subject投影。

M09–M18、真实平台授权/采集、原生文件保存及安装包完整验收全部保留。此轮未提交/推送、未打包/重启已安装客户端，所有工具、临时数据、CAS和构建在D盘。
