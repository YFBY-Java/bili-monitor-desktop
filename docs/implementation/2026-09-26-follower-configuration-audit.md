# 粉丝启动配置、独立运行与HTTP生命周期审计（2026-09-26）

## 范围

M06的16项配置及直接依赖迁移；保留当前Rank、弹幕HTTP和直播存储增量。原B/S `D:\codex_work\BiliMonitor` HEAD `fa2faa6`只读；客户端HEAD `b2e5a89`。不新增业务服务端、监听端口、依赖、数据库迁移或UI占位功能。工具、测试数据库和产物均在D盘。

本子项实现、独立复核和最终全量检查已完成，结果见收尾记录；不能代表M06全部解析/配置输入语法或M01–M18完成。未自动提交、推送、打包或重启已安装应用。

## 原源码依据

原路径以 `social-data-monitor/backend/` 为根：

- `src/main/java/com/socialmonitor/bilibili/config/BilibiliFollowerMonitorProperties.java`、`src/main/resources/application.yml`：15个属性及条件装配使用的storage-enabled，共16项。scheduler Properties备用60000，但application.yml的有效缺省是1000，客户端以1000为准。
- `bilibili/service/BilibiliFollowerMonitorService.java`：enabled只影响到期扫描；区间验证、短间隔警告、分类重试、失败退避由消费者处理；storage-enabled决定Service/Repository/Controller是否存在。
- `bilibili/service/BilibiliFollowerMonitorScheduler.java`：自动与存储两开关同时开启，fixedDelay按整批完成后等待，首次立即执行。
- `subject/service/SubjectService.java`、`SubjectWorkbenchService.java`：必需注入Follower Service/Repository和Live Service/Repository。缺少依赖的组合按源码推导为无效，本轮没有启动Spring验证；本地开库前给固定可操作错误。
- `bilibili/client/BilibiliApiClient.java`：card、relation/stat共享粉丝HTTP设置；connect/read独立期限，0沿用无限制语义。
- `bilibili/live/danmaku/service/BilibiliLiveDanmakuService.java`：直接用公开BilibiliApiClient解析遮罩昵称，不通过FollowerMonitorService，不要求粉丝存储，不执行粉丝重试或写粉丝API日志。客户端已移除该错误耦合；原12小时成功/10分钟失败缓存保留。
- 已检索本地 `D:\codex_work\bilibili-API-collect-new\docs\user\info.md`、`status_number.md`；本项没有修改平台协议，资料和合成回放不等于当前实网验证。

## 配置字段与原映射

实际数据目录 `config/bilibili-follower-collection.json` 只读加载；缺文件默认、BOM支持、坏文件不被环境覆盖掩盖。文件校验和工作台依赖校验均早于SQLite打开。

| 字段 | 默认值 | 原YAML环境别名 |
| --- | --- | --- |
| enabled | true | SOCIAL_MONITOR_BILIBILI_FOLLOWER_MONITOR_ENABLED |
| storageEnabled | true | SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED |
| schedulerDelayMs | 1000 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_SCHEDULER_DELAY_MS |
| dueBatchSize | 10 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE |
| defaultIntervalSeconds | 3600 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_INTERVAL_SECONDS |
| minIntervalSeconds | 1 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_MIN_INTERVAL_SECONDS |
| maxIntervalSeconds | 2592000 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_MAX_INTERVAL_SECONDS |
| shortIntervalWarningSeconds | 60 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_SHORT_INTERVAL_WARNING_SECONDS |
| failureBackoffSeconds | 900 | SOCIAL_MONITOR_BILIBILI_FOLLOWER_FAILURE_BACKOFF_SECONDS |
| requestMinIntervalMs | 1500 | SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS |
| maxAttempts | 3 | 无YAML别名 |
| retryBackoffMs | 1500 | 无YAML别名 |
| connectTimeoutMs | 5000 | 无YAML别名 |
| readTimeoutMs | 10000 | 无YAML别名 |
| userAgent | SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor) | 无YAML别名 |
| referer | https://www.bilibili.com/ | 无YAML别名 |

全部字段同时支持规范环境名 `APP_BILIBILI_FOLLOWERMONITOR_` 加字段名全大写，规范名高于YAML别名，两者都高于本地文件。该映射按[Spring官方环境映射与属性优先级](https://docs.spring.io/spring-boot/reference/features/external-config.html)核对；没有为后6项虚构SOCIAL_MONITOR别名。

当前本地输入域：布尔true/false、带符号十进制整数、ASCII HTTP头；类型/null/未知字段严格拒绝，调度延迟必须正数，HTTP期限0..Java int最大值；策略有符号值由原消费者规则归一化。完整Spring宽松绑定语法仍未移植，不能声称所有外部配置输入等价。

## 实现边界

- `enabled=false`保留全部手工操作；`storageEnabled=false`不装配粉丝持久化服务/调度，8类业务方法返回固定禁用错误。关闭不删除任何历史或绑定。
- 工作台必须显式关闭才能关闭粉丝存储，固定错误 `BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID`；非法配置为 `BILIBILI_FOLLOWER_CONFIG_INVALID`。Main白名单仅允许安全固定文案，不带原始值、路径、堆栈。
- 直播需要独立昵称时仍创建公开资料源；粉丝与直播都关闭则不创建该源。停止时只由粉丝服务或独立源拥有者关闭一次。独立 `bilibili.follower.fetch-profile` 复用HTTP/卡片解析，只返回严格的UID/昵称，不保存CAS；正常粉丝采集的强制evidence契约保持不变。注入源可选提供该独立能力，缺少时保持遮罩名，不回退到持久化卡片采集。
- 间隔上下界、警告阈值、批量、失败退避和重试配置进入实际服务；fixedDelay替代旧setInterval。内部扫描失败仅安全日志并继续后续扫描，停机不重排。
- 重试/限流等待可取消并按Node计时器上限分段，避免大整数延迟变成1ms。原共享RateLimitService锁等待和API耗时差异保留后续统一处理。
- HTTP四字段兼容追加到Worker请求；旧无配置请求使用原默认，拒绝显式null/非法头。TS、portable JSON Schema、Python共同fixture；Worker不读取应用配置环境。
- 显式存活白名单仅新增粉丝add/refresh/card/relation及独立profile；保留既有直播/工作台/榜单项。普通请求仍有原看门狗；保活不是成功。stop/管道失联取消，迟到返回不写关闭的数据库。

## 测试证据

- 首轮Core配置10项RED复现忽略文件、错误开关组合、方法仍执行和昵称错误依赖；采集策略15项RED覆盖默认/边界/警告/失败退避/次数/批量/fixedDelay。测试错误地将工作台数组当作items曾导致一次失败，按真实返回契约修正，不修改生产接口迎合错误断言。
- 长退避2项RED复现Node溢出为1ms；分段后等待与中途退出通过。契约HTTP5项、Worker source1项、Python11项及TS看门狗3项先失败，再接入HTTP参数和显式存活。
- 后补覆盖：33组配置fixture、18组HTTP fixture跨语言校验、14项只读loader、真实SQLite启用→关闭→重新启用保留、独立昵称失败只调用一次并缓存、关闭后迟到成功/失败不调用存储写方法、内部扫描错误不泄露诊断且继续调度。后补用例不冒充都经历过RED。
- 真实Main controller→独立Node Worker执行实际Core entry→真实Python→HTTPX合成外部传输→SQLite验证配置贯穿；新增卡片成功、刷新卡片失败后的relation回退，以及存活帧与最终结果身份匹配。独立昵称在粉丝存储关闭时也用真实Python验证HTTP配置。
- 真实Python请求在超过原看门狗窗口后正确返回；card/relation/profile三类在父管道关闭后取消并退出，写入取消标记。既有粉丝退出、直播存储、工作台、登录和弹幕回归一并保留。
- 独立复核发现P2：最初直接fetchCard解析昵称仍会保存CAS，而新路径丢弃evidence引用。真实Core/Python补“不创建CAS”断言先RED，Python专用profile请求先RED；随后将HTTP获取/解析与落盘拆分，独立profile绕开写入，正常采集保留。新增9组profile输出fixture跨TS/Python/portable校验，实际Core同时断言粉丝/工作台/API日志/object_artifact表不变。
- 一次完整检查在旧直播配置用例失败：原断言5秒5次粉丝扫描，但本片按原规则增加启动即扫描，实际是6次。只更新该旧断言并保留定向固定延迟测试，没有为让旧测试通过而退回setInterval。另修正新增测试删除必填属性的TS类型写法，不改业务或编译约束。
- Main进程替身不是原生Electron。所有新用例使用临时D盘数据、合成外部边界，不使用真实用户库/平台凭据，不当作真人采集验收。

## 收尾验证

- 2026-09-26最终完整 `check.cmd` 退出0：Node **1015**（Contracts276 / Storage19 / Task3 / Core402 / Browser12 / Realtime46 / Desktop257），Python **376**。相对本片基线893/308新增122/68项，包含补覆盖，不全部宣称RED/GREEN。
- TypeScript、Python mypy、Black/isort、Electron Main/Core/Preload/Renderer生产构建和D盘工具/缓存/临时/数据路径检查全部通过。进程级 `VITEST_MAX_WORKERS=2` 执行全部测试，未删减用例。
- 独立只读复核的CAS P2已修正并复审关闭，未发现剩余Critical/Important/Minor。复核合成诊断确认独立profile writer调用0、数据目录读取0；本片真实Worker集成断言CAS不存在及artifact/API表不变。
- `git diff --check`、新增文件行尾空白检查通过，生产包无本片合成响应/测试入口标记；检查结束后项目Node/Python/Electron进程0，无测试Worker残留。
- 原B/S仍 `fa2faa6` 且工作区干净，未启动或修改。客户端HEAD仍 `b2e5a89`、main较origin/main领先19，暂存区为空；既有增量与本片全部保留在未提交工作区。不推送、不打包、不重启安装应用，也没有使用真实用户库或凭据做验收。
- 配置示例、开发文档、README、执行计划、全量台账和最新交接均同步。当前功能在此收尾，不继续扩展下一项；全量迁移目标仍未完成。

## 后续未完成

M06/M08的完整Spring宽松绑定、数值/字符串/URL/时间解析域、共享锁限流与API耗时定义仍需逐项对照。原间隔数据库约束与DTO差异不因本次配置最大值可调而被擅自放宽。M09–M18按全量台账继续，包括独立Rank/弹幕规则配置、场次、导出、分析、工作台其余业务、抖音、适配器、真假能力分类及原生/真人最终验收。本轮不扩展这些新项。
