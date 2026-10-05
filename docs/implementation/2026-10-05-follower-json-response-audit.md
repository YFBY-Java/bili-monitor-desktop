# M06 粉丝 JSON 响应、失败采集与 Worker 输出审计

## 基线和范围

原B/S `D:\codex_work\BiliMonitor` 基线 `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，只读、未启动；客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop` HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`。开始时147条既有工作区增量全部保留，暂存区为空。本轮没有提交/推送、安装工具、打包安装或重启已安装客户端；不访问真实平台、凭据或用户数据库。工具、缓存、合成响应、临时数据库和构建产物均在D盘。

先读取本机历史API参考 `bilibili-API-collect-new/docs/user/info.md:518–715` 与原 `BilibiliApiClient`/原测试、Service/RetryPolicy。参考仓库不是实时协议证明，本轮业务分类以当前原源码和既有compiled client为准。现成D盘Groovy/Jackson2.17.3与E盘既有JDK只做内存诊断，不新增Java源码、编译器或服务端。

这是M06的一个已验证响应子域，**不是JSON全部接受域、粉丝整模块或全量迁移完成**。默认recycler、其他JVM基线、完整charset/MIME异常链、Long64及数据库编码仍在目标内，见下文。

## 原业务核验

- 原 `ObjectMapper.readTree(String)` 只消费首个完整值；合法null/array/scalar、空白直接字符串经缺失code门归UNKNOWN，不是PARSE。数字根后紧邻非空白字符仍非法，literal后缀按Java char identifier规则判断；不能简单用Python整文档 `json.loads` 替代。
- 重复字段最后值胜出，但先出现的非法值仍失败。裸NaN/Infinity、前导零、注释、非法转义/控制字符、BOM String失败；合法数字token的IEEE溢出允许成为Double Infinity。
- 原默认深度1000、整数token1000位、name50000与string20000000的长度限制按UTF-16单位执行。Python递归/4300位全局保护不能冒充原规则，也不能为迁移关闭全局安全保护。
- 原HTTP零字节由Spring返回null，最终PARSE；与直接String空输入的UNKNOWN不同。StringHttpMessageConverter对JSON兼容application媒体默认UTF-8，其他默认Latin1，显式charset优先；无效字节按原替换规则，不使用Python严格解码使Worker退出。响应CAS仍保存原始字节，不保存修复后的文本。
- 原UNKNOWN（即使某些code带retryable标记）不触发relation回退；PARSE按原规则一次后回退，认证错误不重试/回退。采集失败保留既有资料、计数、历史点和证据；成功同秒快照仍按原upsert，不人为增加历史点。

实现依据包括现成原compiled client和原Spring HTTP模拟，不把代理层改成模拟业务。Jackson源码辅助核验：[ReaderBasedJsonParser](https://raw.githubusercontent.com/FasterXML/jackson-core/jackson-core-2.17.3/src/main/java/com/fasterxml/jackson/core/json/ReaderBasedJsonParser.java)、[ParserBase](https://raw.githubusercontent.com/FasterXML/jackson-core/jackson-core-2.17.3/src/main/java/com/fasterxml/jackson/core/base/ParserBase.java)、[StreamReadConstraints](https://raw.githubusercontent.com/FasterXML/jackson-core/jackson-core-2.17.3/src/main/java/com/fasterxml/jackson/core/StreamReadConstraints.java)。

## 本轮实现

1. `bilibili_follower_json.py` 专用reader使用标准库字符串扫描、显式容器栈和局部限制，接入两个原粉丝parser；不改Python全局递归/整数保护，不加新依赖。安全PARSE错误不携带原始响应文档。
2. `bilibili_follower_response_text.py` 实现已核验的默认/显式UTF8、Latin1、零字节与BOM差异，接入HTTP→parser。UTF8非法surrogate字节组先按JDK替换粒度处理，其他无效字节继续替换。未知charset暂为安全UNKNOWN、无回退；这不是原完整MIME/charset异常域等价，详见剩余项。
3. `RuntimeEnvelope.to_wire_json` 保留普通消息原Pydantic输出；UTF-8序列化失败时，用Pydantic JSON-mode投影后由stdlib编码ASCII转义。别名、字段排除、日期/Z、非有限数字→null及JSON专用字段serializer保持；未知对象仍失败，不伪造业务成功。业务结果和heartbeat共用该出口。
4. 临时profile的nickname保留StrictStr，仅将非空规则从Rust长度校验移到Python非空/Java blank validator，恢复原JSON合法UTF-16字符串域；字节/数字/null/空串/Java空白仍拒绝。不改共享字段或方法形状、不放宽手工输入或宣称数据库可无损保存孤立surrogate。
5. literal suffix补已观察本机Java20的U+0CF3/U+0ECE。原pom编译target17、compiled major61；现存 `.dev-data/backend-dev.log:38,61` 记录2026-09-13成功运行Java20.0.1，当前原应用未运行。补丁只以这份已观察基线为依据，不宣称所有JDK等价。

## 测试先行与独立复审

- 新Python JSON文件149例（含后补12例），HTTP→实际 `run_stdio` 16例，协议组合5例；合计新增170例。新Core集成26例，均使用合成HTTP边界、实际Python parser/runtime/NDJSON/WorkerSource与D盘SQLite，不注入模拟业务结果。
- 初127例公开parser测试64失败/63通过；后补HTTP17例14失败/3通过（与先前案例有重叠，不能相加为独立失败数）。修复后137例通过，后来literal12例全部先UNKNOWN误分类RED，再修复通过。
- Core首20例中修正测试用错table和同秒历史期待后，有效RED为13失败/7通过，再GREEN。后加UTF16真实NDJSON4例全部先失败（Worker退出或无关联protocol_error）；literal2例也先RED，最终26例通过。早期测试自身错误不算生产RED证据。
- 生产HTTP→`run_stdio` 两请求16例先12失败/4通过：错误message的孤立surrogate使Worker退出，成功临时nickname被Rust长度校验拒绝；修复后16通过。协议5例先失败，再验证普通输出逐字一致，以及surrogate与NaN/Infinity、日期、bytes/Decimal/UUID/tuple、嵌套JSON专用serializer组合及不可序列化对象失败域。
- 第三次真实Worker请求必须返回仅同进程状态能产生的`same-process-third`，排除transport自动重启掩盖问题；直接一个 `run_stdio` 输入流中的业务请求→ping进一步证明同循环持续存活。独立严格GBK stdout、keepAlive=True探针验证heartbeat→完整关联业务error/result→ping，全部ASCII且UTF16文本保留。
- 独立最终只读复审：上述已限定的实现子域未发现新的Critical/Important。默认recycler的Important仍未关闭，不能写成整体无遗留问题。复审实际跑Python定向82/JSON149、Core26全部通过。审查者误用`test -- file`启动Core全套830例，出现一处并行负载下直播查询30秒超时；该次829通过/1超时**不作完整检查通过证据**，随后正确限定的26例通过。

### 只读差分探针（非repo测试计数）

- 修复后的identifier helper对Oracle JDK20.0.1+9-29 BMP65536点差异0。现有JBR17.0.10+8-b1207.12差异96点；Java17/20各自`true/false/null × BMP`196608次真实Jackson解析与其Character预测均0差异。没有下载JDK或写源码。结果证明已观察20基线匹配，不证明17/全部JVM兼容。
- UTF8非法surrogate组修复对JDK20抽样1214368个字节串相符（全部一/二字节、E0..EF三字节及100000个确定性随机串），摘要`8507390d7d450d173d9fe676d9d0d7ed7e508e3c5a9ae16cd7da2381f6b714ac`；不把抽样当所有charset或目标17证明。
- 孤立surrogate：原compiled client保留UTF16单元；现成pgjdbc UTF8编码替换为`?`，Node SQLite TEXT替换为U+FFFD，有效emoji双方保持。传输修复不等于数据库编码等价。

## 最终完整检查

最终补丁冻结后于19:17重新运行完整 `check.cmd`，已退出0：**Node1531/Python714**（Contracts315、Storage33、Task3、Core832、Browser12、Realtime46、Desktop290）。较前一资料子项新增Node26/Python170，全部repo测试执行；未删测试或放宽断言。TypeScript类型、Python Black/isort/mypy、Electron生产构建和D盘约束全部通过；仅本次进程设置 `VITEST_MAX_WORKERS=2`。

前一轮Node1525/Python681也退出0，但不含随后Unicode和literal补丁；只以上述重新完整运行作为最终代码证据。收尾diff check、新增文本尾空白、生产源及最终bundle的本轮fixture标记检查通过；项目Node/Python/Electron残留0。原B/S仍 `fa2faa6` 且clean，历史API参考仍 `271b123` 且clean，客户端HEAD仍 `b2e5a89`、暂存区空，全部既有和本轮增量保留。未提交/推送、打包安装/重启已安装应用或真实平台/凭据/用户库访问。

## 明确保留的后续迁移

1. **默认recycler与执行通道（Important未关闭）：** 当前reader只覆盖fresh4000缓冲及短String直读模型。原默认ThreadLocal BufferRecycler按线程跨JsonFactory/ObjectMapper共享，HTTP/调度线程分开，live/rank/auth/Subject也读JSON。同一UTF16长度34103响应、数字offset3100、token为1000个9加`.1`，fresh接受；先读取长度8000字符串后相同响应被拒绝，已独立复现。后续须定义原各执行通道及共享使用方、reader-session租借/失败关闭归还、warm/fresh和交叉模块顺序golden；只加follower全局max缓存不能兑现完整目标。
2. **其他JVM/Unicode基线：** 实际启动日志20与pom17分开；JBR17与当前helper的96个BMP差异须在明确源基线后迁移，不能跟着Pythonunicode库自动漂移。supplementary在Jackson literal门中先读Java char surrogate，本轮按该域处理。
3. **完整HTTP charset/MIME异常链：** 原无效/空charset及无效Content-Type可能在get阶段抛InvalidMediaTypeException（即使403/503/零体），外层内部错误、不记API失败日志、不重试回退；当前安全UNKNOWN多记一条API日志，仍不等价。全部Java别名、UTF16端序/替换及其他codec也待核对，不把普通UTF8/Latin1切片当完整兼容层。
4. **Long64完整链：** 原字符串Long.parseLong不得trim/下划线，溢出不是safe53限制；JsonNode数值wrap/saturate、负计数、请求正UID与响应signed MID分开。须新兼容契约/精确十进制传输，保留v1适配；SQLite int64 BigInt精确读写和迁移、原signed64溢出增量/Double growth、Source/Core/Main/Preload/Renderer/Subject/event/outbox全链核对。不能仅放宽Python或把原可表示数拒绝为safe53。
5. Double.asText/数字message、API日志failureMeta、NUL与全部TEXT编码（昵称/头像/错误消息等）、完整属性来源/JVM/cache/冲突/indexed边界继续保留。随后按台账M08与M09–M18逐操作迁移；真人平台、系统密钥/剪贴板、原生保存/安装包验收单列，合成回归不替代。

全量目标保持进行中；本审计只记录当前已验证进度，不缩减M01–M18、不标完整迁移完成或暂停。
