# M08 直播 Python 解析与真实 Worker 链路审计

## 原依据与范围

原 B/S 仓库 `D:\codex_work\BiliMonitor` 当前 `fa2faa6`，本轮只读、不启动；客户端起点 `fcc2920`。本轮实现直播 REST 字段、空结果、错误分类与真实 Python 子进程链路，不宣称整个 M08 或全量迁移完成。

原路径以 `social-data-monitor/` 为根：

- `backend/src/main/java/com/socialmonitor/bilibili/live/client/BilibiliLiveApiClient.java`：四个接口的参数、字段优先级、Map覆盖、文本/整数/日期解析和错误分类。
- `backend/src/main/java/com/socialmonitor/bilibili/live/config/BilibiliLiveMonitorProperties.java`：默认 UA、Referer、5000ms连接/10000ms读取。
- `backend/src/main/java/com/socialmonitor/bilibili/live/service/BilibiliLiveMonitorService.java`、`domain/BilibiliFetchedLiveRoomSnapshot.java`：资料合并和无旧直播间的业务错误。
- `backend/src/main/resources/db/migration/V4__bilibili_live_monitor.sql`：昵称/分区长度、原整数字段；不修改任何原 SQL。
- 原默认日期解析使用 SMART：月份末尾规则参见 [JDK ResolverStyle](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/format/ResolverStyle.html#SMART)，24:00规则参见 [DateTimeFormatter](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/format/DateTimeFormatter.html#parsedExcessDays())；GET重定向依据 [Spring请求工厂源码](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-web/src/main/java/org/springframework/http/client/SimpleClientHttpRequestFactory.java)。只读参考，不安装 Java 工具链。

## 逐项迁移

| 原业务/本地适配 | 本轮实现与验证 |
| --- | --- |
| 0 short ID和0分区不是字段缺失 | 独立辅助ID契约允许0；v2值为0时不回退旧分区；真实Python→Core→SQLite保留0 |
| 缺失/原空白昵称回退UID；非空白文本不trim | Live独立文本解析保留首尾空格、NBSP；对象/数组不是文本，布尔标量按原小写文本；TS房间与snapshot契约不二次trim昵称 |
| 状态批结果按有效UID构造Map | 无可解析有效UID的条目跳过；重复UID最后数据覆盖、保留首次位置；缺room_id仍失败，不悄悄跳过坏房间 |
| 字段按解析后的可用值回退 | 分区v2优先、封面按原顺序；online为0优先于watched_show；带空格数字不当作合法优先字段；旧liveStatus解析失败后回退live_status |
| 开播时间 | 数字秒截去小数；文本精确原格式、上海时区，不擅自trim；支持原SMART月末及24:00规则；极大epoch不再让Worker直接崩溃 |
| 旧接口无房 | parser返回None；HTTP响应省略snapshot，不发送与TS optional冲突的null；Core实际返回原UNKNOWN无房业务错误，不变成Zod错误 |
| 原平台错误分类 | -101认证、-352/-412风控、其他业务码UNKNOWN；500/-500保留raw retryable=true；code=0不套用Follower的voucher逻辑；HTTP429/5xx/其他4xx为限频/服务端/UNKNOWN |
| HTTP请求 | 四种参数、Accept、原默认UA/Referer、5s连接/10s读取；GET跟随重定向；超时为NETWORK_ERROR；非法JSON/UTF8/字段解析异常为带endpoint的PARSE_ERROR |
| 本地输入/输出边界 | 逐UID/尝试号校验；坏输入返回BILIBILI_INPUT_INVALID且不发HTTP；输出经Pydantic模型校验，不将含原输入的ValidationError泄露给UI；保留原NDJSON envelope与错误metadata形状 |
| 原有符号计数 | 热度/关注在JS安全整数范围保留负值，负online仍优先于watched_show；Live和Subject投影契约同步兼容，避免一个负计数导致整批PARSE_ERROR |
| SQLite升级 | 追加v13，仅重建两张直播表去除计数非负约束；保留rowid、列值、索引/触发器和外键关联，提交前检查外键；历史迁移不改，升级失败关闭连接 |

## 验证方法

- `packages/contracts/fixtures/live-worker-responses.json`：16组原HTTP形状和预期字段/错误，由Python parser与真实子进程测试共享。
- `live-worker-validation.json`：17组snapshot接受/拒绝用例；`live-worker-inputs.json`：12组请求归一化与拒绝用例。TS/Zod、Python/Pydantic和语言无关JSON Schema共用数据，不手写另一套Renderer响应类型。
- portable请求schema验证**归一化之后**的wire数据；输入trim由TS和Pydantic共同验证。Pydantic模型用同一fixture和schema交叉验证，不声称所有JSON Schema/URL实现天然完全等价。
- `bilibili-live-worker-integration.test.ts`：实际启动项目Python，加载真实`bmd_workers.runtime`，通过真实Node transport、WorkerSource、Core和隔离SQLite验证。`tests/fixtures/live_http/sitecustomize.py`仅替换httpx的外部HTTP传输，未替换parser、NDJSON或业务服务，不新增生产测试参数/后门；未知请求直接失败，不访问真人平台。
- 实际验证中文首尾空格、0分区、CAS原字节SHA-256、空旧房、风控/业务错误code、retryable、statusCode、biliCode、endpoint；坏输入和坏输出处理后再次ping，Worker仍能响应。所有临时目录在D盘，finally停止子进程并清理隔离数据库。
- 真实Worker集成共5项，包含负计数新增/刷新、趋势、汇总和事件；Subject部分验证共享投影契约，不冒充完整工作台端到端验收。v13隔离数据库测试覆盖旧非负约束升级、稀疏rowid/证据/关联保留、重开，以及外键检查失败后的完整回滚和版本/约束恢复。

## RED/GREEN与审查记录

- 初轮Python字段/HTTP测试20项失败，随后单独复现旧接口snapshot=null；TS初轮10项中5项失败，均为真实业务/契约差异。
- 真实进程最初2项失败：坏输出只在Node得到ZodError，非法UID进入HTTP并使测试Worker退出；补结构化输入/输出错误后4项通过。runtime坏输入3项先失败后修复。
- 共享输出fixture复现Python把true当作liveStatus、接受紧凑ISO拼写，以及JSON Schema环境未装可选URI format校验器；已补严格数字/日期形状及portable URL scheme约束。
- 极大epoch和GET重定向先失败后修复；超时等已存在行为仅补审计覆盖，不冒充新增业务。
- 测试搭建中的pytest保留参数名、afterEach重复close、JSON反斜杠转义及mypy空值分支均已修正；不混淆测试设置错误与原业务差异。
- 独立审查发现负计数被新增输出校验拒绝，先补失败回归，再将有符号计数贯穿契约、Worker及投影；实际Core链路随后暴露SQLite非负CHECK，故追加v13，旧v12升级测试先复现版本差异再修复。回滚用例是已有事务逻辑的覆盖验证，不宣称新RED/GREEN。
- 首轮完整`check.cmd`退出0：Node557、Python165，类型/格式/生产构建/D盘检查通过。随后补共享请求与30 UID上限，定向Contracts40、Python73通过；最终检查及独立审查结果在收尾补记。
- 提交前最终完整`check.cmd`退出0：Node576（Contracts132、Storage19、Task3、Core219、Browser12、Realtime19、Desktop172）、Python183；TypeScript/mypy、Black/isort、Electron生产构建和D盘路径验证通过。回滚测试最初在构造失效外键数据时失败，显式关闭fixture准备连接的外键后，再开启外键执行迁移验证；生产代码未因此更改。
- 独立只读复审确认负计数Important已关闭，v13回滚/数据保留无剩余Critical/Important；URI校验、别名和字符串长度边界留在以下剩余项。`git diff --check`、生产fixture扫描通过；无测试Worker残留，原仓库仍`fa2faa6`且干净。用户要求本地提交，不推送，不访问实际用户数据库或重启已安装应用。

## 仍未完成，不从全量目标豁免

1. 原parser支持的完整signed Long、未知直播状态及部分非标准数字与客户端既有正UID/0..2枚举/JS安全整数输出域仍有差异；本轮仅完成安全范围内有符号计数，完整数值域仍需整体迁移。`live-worker-validation.json`中的state=3拒绝用例记录当前边界，不是原业务最终验收标准。
2. Pydantic、WHATWG URL与portable schema对所有边缘URL、日期年份/控制字符、别名的全集等价尚未证明。当前环境缺少可选URI format校验器，portable schema仅附加scheme约束，对无主机/越界端口弱于生产Pydantic/Zod；Python允许snake_case别名，字符串长度按码点而TS按UTF-16，均列后续对齐。原非对象根JSON、负ID/溢出数字及跨协议重定向亦须逐条核对；不能把已有fixture通过当作全集等价。
3. 默认HTTP参数已对齐，但原配置的全部可变项和本地设置映射还要随M08配置/生命周期一起核对。
4. 原生Electron utilityProcess环境、安装包、真实平台、应用退出取消/重启排程和完整直播UI仍待验收。本轮是实际Python子进程自动回归，不是原生安装客户端或真人平台验收。
5. M09–M18、M07真人扫码与M11开播时间同刻不同拼写判重启差异均保留。原仓库不修改、不启动；用户要求提交后仅收尾验证并提交本地，不推送、不重打安装包或重启已安装应用。
