# 本地开发环境

## 硬约束

- 仓库和所有可变运行数据固定在 D 盘。
- Node、pnpm、缓存、临时文件、Playwright 浏览器、Python venv、构建物、运行数据和导出只接受 `D:\`；C、E 与 UNC 路径均拒绝。
- 项目不安装 Cargo、Rustup、LLVM、MSVC 或其他本地原生编译工具链。
- 不直接调用全局 `node`、`pnpm`、`python`；统一通过仓库脚本激活环境。

## 首次准备

```bat
bootstrap.cmd
```

脚本执行以下动作：

1. 校验仓库不在 C 盘，并设置全部项目路径变量。
2. 下载并校验 Node 24 LTS 到 `.tools/node-v*-win-x64`。
3. 安装 pnpm 到 `.tools/pnpm-runtime`。
4. 使用 E 盘 Python 创建 D 盘 `.venv`，拒绝 C 盘 base runtime。
5. 从 `workers/python/requirements.lock` 安装当前 B站 HTTP、抖音 OAuth 与测试所需依赖，只接受预编译 wheel；未实现的 AI、Agent 和分析依赖不安装。
6. 根据 `pnpm-lock.yaml` 安装 Electron、React、Crawlee、Playwright 等依赖。
7. 下载 Chromium、Headless Shell、FFmpeg 和 Winldd 到 `.tools/playwright-browsers`。

更新依赖锁只在维护依赖时使用：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -UpdateLock
```

## 常用入口

- `dev.cmd`：启动 Electron 开发模式。
- `check.cmd`：路径门禁、Node 测试/类型检查、Python 格式/类型/测试、Electron 构建。
- `build.cmd`：生成 Electron 生产构建。
- `build.cmd -Package`：在构建后生成 Windows 安装包。

## 路径布局

```text
.tools/                 Node、pnpm、缓存、浏览器、模型缓存、临时文件
.venv/                  Python 项目环境；base runtime 在 E 盘
.local-data/            control.db、Electron userData/session、Worker 数据
apps/desktop/out/       Electron 构建
release/                安装包
```

安装版的可变数据位于 `D:\BiliMonitor Desktop Data`。抖音 OAuth 配置模板在其 `config` 子目录；填入一次明文配置并重启后，应用会使用 Electron `safeStorage` 迁移为本机加密文件并移除明文。

`scripts/activate-environment.ps1` 会设置 `BMD_DATA_DIR`、`PLAYWRIGHT_BROWSERS_PATH`、`PIP_CACHE_DIR`、`ELECTRON_CACHE`、`HF_HOME`、`TEMP` 等变量。路径测试会逐项验证。

## 直播与用户工作台启动配置

以下文件放在实际数据目录的 `config` 下；开发版使用 `BMD_DATA_DIR`，安装版使用 `D:\BiliMonitor Desktop Data`。文件在启动时只读，修改后需重启；源码中的 `config/*.example.json` 只是示例，不会自动改变运行配置。

- `bilibili-live-collection.json`：`enabled` 和 `storageEnabled` 都缺省为 true。`enabled=false` 只停止自动 REST 采集；`storageEnabled=false` 关闭直播、弹幕、榜单、场次、分析与导出业务，不删除已有数据。
- `subject-monitor.json`：`enabled` 缺省为 true，控制 B站用户工作台。它同时依赖直播和粉丝存储，因此关闭任一存储时必须同时设置本文件的 `enabled=false`；单独关闭工作台不影响两个采集模块。
- 环境变量 `SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED`、`APP_SUBJECTMONITOR_ENABLED` 分别覆盖上述两个开关。文件要求 JSON boolean，环境值接受 true/false；环境覆盖不能掩盖格式错误的文件。若改文件后仍未启用，检查是否还存在覆盖值。
- 配置错误返回 `BILIBILI_LIVE_CONFIG_INVALID` 或 `SUBJECT_MONITOR_CONFIG_INVALID`；直播关闭但工作台启用返回 `BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID`，均在打开数据库前拒绝启动。修正配置后重启，不需要删除数据库。
- 正常启动后，已关闭的业务返回 `BILIBILI_LIVE_STORAGE_DISABLED` 或 `SUBJECT_MONITOR_DISABLED`，不会返回伪造的成功空数据。重新启用后原历史与导出编号继续保留。

示例见 [直播配置](../config/bilibili-live-collection.example.json) 和 [工作台配置](../config/subject-monitor.example.json)；原业务依据与验证边界见 [直播存储审计](implementation/2026-09-25-live-storage-audit.md)。粉丝使用以下独立配置。

## 粉丝监控启动配置

实际数据目录下的 `config/bilibili-follower-collection.json` 支持原粉丝监控16项设置，[完整示例](../config/bilibili-follower-collection.example.json)可作参考。文件只读、启动生效；缺少文件使用默认值，不自动创建或写回。

- `enabled=false` 仅停止自动到期扫描，仍允许手工添加/刷新、查询及工作台；`storageEnabled=false` 关闭全部8类粉丝业务方法，不是“采集但不保存”。两个值默认均为 true。
- 工作台必须同时依赖粉丝和直播存储。关闭粉丝存储时还需 `subject-monitor.json` 的 `enabled=false`，否则开库前返回 `BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID`。非法配置返回 `BILIBILI_FOLLOWER_CONFIG_INVALID`。修正配置后重启即可，不要删除数据库。
- 正常启动后的禁用操作返回 `BILIBILI_FOLLOWER_STORAGE_DISABLED`，不会返回成功空列表。关闭/重新启用不改已有监控状态、采集间隔、排程、历史快照和工作台绑定。
- 直播仍开启时，遮罩昵称按原规则通过独立公开卡片查询解析；不需要开启粉丝存储、不使用粉丝服务重试、不产生粉丝监控或API日志。它使用同一份粉丝HTTP配置。
- 默认启动即扫描，完成一批后等待 `schedulerDelayMs=1000` 再扫；`dueBatchSize=10`。默认新监控间隔3600秒，上下限1..2592000秒；小于60秒只作短间隔警告。修改默认值不会重写存量监控。原SQLite及手工输入的1..2592000秒硬约束仍保留。
- `requestMinIntervalMs=1500`，`maxAttempts=3`，`retryBackoffMs=1500`，`failureBackoffSeconds=900`。原重试分类/最多4次上限仍适用；失败排程采用 `max(300, min(监控间隔, 配置退避))`。长等待分段计时，可随客户端退出取消。
- `connectTimeoutMs=5000`、`readTimeoutMs=10000` 独立生效，0表示该阶段不限时；User-Agent/Referer见示例。HTTP配置由Core通过契约传给Worker，长请求存活不会冒充业务成功，退出和父管道断开会取消在途采集。

环境变量高于文件：支持原YAML中的10个 `SOCIAL_MONITOR_*` 别名，以及16个规范名 `APP_BILIBILI_FOLLOWERMONITOR_<字段名去分隔后全大写>`。例如 `APP_BILIBILI_FOLLOWERMONITOR_READTIMEOUTMS=0`、`APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED=false`。同一字段的规范名优先于别名。完整映射见[粉丝配置审计](implementation/2026-09-26-follower-configuration-audit.md)。

JSON值严格校验类型，不接受字符串布尔/数字；未知字段、null、非法HTTP头、JSON格式错误和非ENOENT读文件错误不能被环境覆盖掩盖。字段类型有效时先合并高优先级环境，再检查启停组合，例如文件延迟0可被环境延迟1000或精确的 enabled=false 覆盖。

- 环境 `enabled` 沿用 Spring 布尔绑定：去首尾 Java trim 字符（U+0000..U+0020），大小写不敏感接受 true/on/yes/1 和 false/off/no/0；空字符串/空白不能绑定 primitive，不会回退低优先级值。
- 环境 `storageEnabled` 不是普通布尔绑定，只按原条件注解的未trim、大小写不敏感字面值 false 关闭；`off`、`no`、`0`、空字符串和 ` false ` 都仍启用。需要关闭时使用 `false`，不要加空格。
- 普通整数删除 Java Character.isWhitespace 空白，支持 signed int32 的十进制、0x/0X/#十六进制（负号可用，+0x不可用）和原JDK支持的BMP数字；不接受小数、指数、下划线或溢出。前导0的无前缀数字按十进制，不是八进制。
- `schedulerDelayMs` 另有原始字符串规则：原 enabled/storage 条件均开启时，必须是不带空白/hex前缀的正十进制整数。因此 enabled=off 或 ` FALSE ` 虽停止自动采集，仍不能使用0、负数或` 1000 `；精确 enabled=false 或 storageEnabled=false 关闭该调度条件后，允许有效int32延迟字段0/负数/hex。空值、PT1S等非法int始终拒绝。

上述literal转换见[绑定与调度审计](implementation/2026-10-05-follower-binding-audit.md)。后续已接已有16字段的嵌套`${NAME:default}`展开：环境值和文件String字段先展开再消费；JSONbool/int仍要求实际类型，不接受模板字符串。空字符串存在时不使用default，循环拒绝；未解析Header可保留原文，但enabled/storage条件严格解析，不能因已关闭自动采集而忽略坏storage值。

例如 `APP_BILIBILI_FOLLOWERMONITOR_DEFAULTINTERVALSECONDS='${MY_INTERVAL:420}'`，从环境MY_INTERVAL取值，缺失则420。default也会先递归解析，并非惰性；`${EXISTING:${MISSING}}`在严格条件中即使EXISTING存在仍失败。不要把模板放到HTTP头来引用凭据，配置值会用于对应请求。

原YAML的10项缺省属性和JSON显式字段可被canonical引用；仅Java初始化缺省值不作为属性来源。已知16字段支持modern/legacy/dotted等经核验的原环境名称形式，按来源和查询名取值，不把任意camel/snake引用自动正规化。此模型限定env与局部JSON/YAML，**不是完整SpringEnvironment兼容层**：跨模块来源、JVM属性/cache及同层多等价enumerable冲突仍需核对，也未新增YAML/CLI入口。详见[占位符审计](implementation/2026-10-05-follower-placeholders-audit.md)；完整响应/JSON缓存/Double文本和API日志元数据仍待后续对齐，Long64已续接以下独立链路。

## 粉丝资料文本迁移

粉丝昵称和头像保留原非Java-blank文本，不再在Worker/契约/投影中误trim；头像格式异常不应使成功card变失败。临时profile不受存储160上限，落库按原VARCHAR(160)的Unicode字符和超空格规则处理；不通过回退或截断普通超长昵称掩盖存储错误。relation保留已有三个资料字段，正常card可替换或清除头像。

卡片/详情及已有用户工作台的头像显示投影只允许HTTP(S)，协议相对地址转HTTPS，生产CSP白名单内的CDN HTTP升级HTTPS；原字段不改写，CSP不放宽，其他受限/异常头像使用fallback。工作台默认昵称保留粉丝原文，创建、读取、聚合与重启可消费合法160个补充字符和原头像文本；手工输入限制未放宽。普通文本/bool/int已补回归，Double文本及完整数据库编码域仍未完成。详见[资料文本审计](implementation/2026-10-05-follower-profile-text-audit.md)。

粉丝card/relation现已续补原首JSON值、合法非对象根UNKNOWN/非法JSON的PARSE、重复字段与已核验读取约束，以及HTTP零字节/UTF8/Latin1转换。UNKNOWN不误回退，PARSE按原规则回退；失败不覆盖既有快照和资料，CAS保存原始响应字节。临时profile与错误消息中的合法UTF16转义使用ASCII NDJSON保留，Worker无需重启即可处理下一请求，业务和heartbeat共用出口；不增加服务端。

这不是完整JSON/JVM/编码兼容声明：默认共享BufferRecycler的线程/交叉模块顺序效应、其它JDK Unicode基线、完整charset/MIME异常链，以及PG和SQLite对孤立surrogate不同的TEXT存储行为仍待对齐。读取规则以当前只读原B/S代码为准；历史API参考与合成回归不等于当下平台或原生安装验收。细节见[JSON响应与失败链路审计](implementation/2026-10-05-follower-json-response-audit.md)。

## 粉丝 Long64 精确计数

生产粉丝页面使用窄化的 `bridge.bilibiliFollowersV2`，工作台使用 `workbenchV2` / `trendsV2`。计数、差分与 UID 按共享 v2 schema 传 canonical 十进制字符串，不能在写库或通信前先转 JavaScript Number。旧 v1 接口仅保留显式兼容投影；不可表示的数据返回 `LONG64_LEGACY_PRECISION_UNSUPPORTED`，不把它当平台失败或重写历史。

SQLite schema v14 追加精确粉丝迁移：五类粉丝读取独立启用 BigInt，直播读取不改；四个计数列接受原有 signed64 域，监控/绑定 UID 仍是正 Long。刷新保留监控 UID，快照保存响应 UID，同秒 upsert 保留原快照身份。差分按 Java signed64 回绕，增长率再按原 Double 运算，工作台 24h 基线取窗口内最新 2000 条的第一条；图表仅在有界绘图坐标转换 Number，提示/文本/排序保留精确值。

首次启动新代码才会升级数据库，本轮只验证 D 盘隔离测试库，未打开用户运行库或更新安装应用。完整原输入文本/HTTP DTO 绑定、Double wire 负零及其它 JVM/编码域仍待核对；typed Preload/真实 Python 回放不等于原生 Electron 或真人采集验收。详见[Long64 审计](implementation/2026-10-05-follower-long64-audit.md)。

## 粉丝添加 UID 输入

按用户确认的策略，粉丝页可输入带前导零/ECMAScript空白/正号的 UID，也支持结果为整数的科学记数法和 unsigned `0x/0b/0o` 进制写法。例如 `+0002`、`2.0`、`.2e1` 都发送 canonical `"2"`；`9.223372036854775807e18` 发送精确 LongMAX。UID 不经 JavaScript Number，不复刻原网页将 `9007199254740993` 舍入为另一个 UID 的问题。

真实小数（包括 `2.0000000000000001`）、非正数、非有限数及越过 LongMAX 的结果直接报校验错误，不调用采集。添加失败保留原输入和间隔以便修正重试。此规则仅用于粉丝页输入，typed IPC 仍要求 canonical Long 字符串；原 HTTP 宽松转换不变成客户端业务 Server。详见[UID输入审计](implementation/2026-10-05-follower-uid-input-audit.md)及[原HTTP绑定核验](implementation/2026-10-05-follower-http-binding-audit.md)。

## 粉丝添加成功与列表同步

添加成功后只清空UID，不重置采集间隔；按钮保持同步状态直到本地列表读取结束。读取成功先清理失效趋势选择，再去重并按最多4人补选返回用户；重复添加返回已有ID时不重复选中。成功确认不等待趋势历史请求完成。

沿用原 `loadUsers` 的共享在途读取，不承诺每次添加后立即得到新快照。旧快照暂不显示新用户时仍按raw ID查询历史；后续读取出现该用户时保留选择。读取失败不撤销已经提交的添加、不再次采集，保留旧列表并显示读取错误；恢复后可手工刷新。列表请求不作隐式重试。

关闭重开抽屉保留草稿。旧抽屉在途请求仍可完成业务同步，但不能关闭/清空新抽屉或附上旧错误。提交清UID后、列表仍在同步时输入下一UID也不会被完成回调再次清掉。这是已有抽屉对原内联表单的生命周期适配，不是新的后端操作协议。

本项通过真实React/Query/Chromium配合合成bridge回归；不替代原生Electron、平台采集、用户库升级或安装包验收。完整检查及边界见[添加成功链审计](implementation/2026-10-05-follower-add-flow-audit.md)，其它M06与全量迁移待办继续保留。

## 共享采集限流与耗时

粉丝、直播REST、榜单使用同一个Core内存许可器，沿用原项目在等待许可期间的共享锁：粉丝/直播按接口计间隔，所有榜单共用一个间隔。HTTP操作在锁外；不同业务也可能因当前正在等待的申请而延后，这不代表采集服务卡死。间隔0直接放行且不更新时间，独立昵称查询不走粉丝监控许可器。

本地最多排队256个申请（含当前等待），满时返回 `LOCAL_RATE_LIMIT_BUSY`，请稍后重试；不会当成B站失败或修改监控失败退避。客户端退出会取消全部排队，不会继续发请求。API日志的 `durationMs` 是每次尝试从申请许可到结果校验完成的单调计时，包括排队/限流，不包含重试退避和日志写库，并非Worker单独HTTP耗时。日志存储失败不会触发备用抓取或写监控失败状态。规则、桌面适配和测试边界见[共享限流审计](implementation/2026-09-26-shared-rate-limit-audit.md)。

## 故障定位

- “Project Node.js is missing”：运行 `bootstrap.cmd`，不要回退到全局 Node。
- Python base runtime 指向 C 盘：移走 `.venv` 后重新运行 `bootstrap.cmd`。
- Chromium 缺失：在已激活环境中运行 `pnpm --filter @bmd/browser-worker exec playwright install chromium`。
- Local Core 启动失败：检查 `apps/desktop/out/main/core-process.js` 和 `.local-data/logs`。
- SQLite 无法打开：确认没有另一个应用实例占用同一个数据目录，并检查 D 盘剩余空间。

应用不需要也不应该监听业务 HTTP 端口；调试 Worker 使用 stdio Envelope 和 Trace ID。
