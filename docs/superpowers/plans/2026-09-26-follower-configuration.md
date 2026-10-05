# 粉丝监控启动配置与独立运行 Implementation Plan

> **For agentic workers:** 当前会话使用 test-driven-development 逐项实施，verification-before-completion 收尾；保留既有未提交增量，不提交或推送。

**Goal:** 将原粉丝监控的16项启动配置接入本地 Core/Worker，区分自动采集与存储总开关，正确处理工作台强依赖及直播昵称查询的独立能力。

**Architecture:** Core 只读数据目录配置并在开库前校验；按开关装配粉丝服务，调度按批次完成后的固定延迟运行。配置通过共享契约传给 Python HTTP Worker，长请求使用已有显式存活/取消机制；昵称查询不借粉丝持久化服务。保留现有SQLite数据，不新增业务服务端。

**Tech Stack:** TypeScript、Zod/JSON Schema、SQLite、Python/httpx、Vitest/pytest；不新增依赖。

**Readability:** 实现只用 TypeScript、Python、JSON，不引入 C/C++/Rust。

## Global Constraints

- 原B/S `D:\codex_work\BiliMonitor` HEAD fa2faa6只读、不启动；客户端HEAD b2e5a89，保留Rank/弹幕HTTP/直播存储开关的全部未提交改动。
- 运行命令先加载 `scripts/activate-environment.ps1`，工具/缓存/测试库/产物在D盘。测试明确注入外部源，不访问真实平台/凭据/用户数据库。
- 本项16字段：enabled、storageEnabled、schedulerDelayMs、dueBatchSize、defaultIntervalSeconds、minIntervalSeconds、maxIntervalSeconds、shortIntervalWarningSeconds、failureBackoffSeconds、requestMinIntervalMs、maxAttempts、retryBackoffMs、connectTimeoutMs、readTimeoutMs、userAgent、referer。
- 默认取原application.yml有效值：schedulerDelayMs=1000（不是Properties备用60000）、dueBatchSize=10、defaultIntervalSeconds=3600、shortIntervalWarningSeconds=60；其余按原Properties/消费者归一化。
- 原Spring宽松布尔/整数绑定的全部输入形式、全局共享锁限流和API耗时统计、响应完整解析仍明确留在全量台账，不将配置接入等同于整个粉丝模块完全对齐。
- 原DB V3限制间隔1..2592000秒；不因配置最大值更大而迁移掉原有存储约束。

## 原业务依据

- `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/config/BilibiliFollowerMonitorProperties.java` 和 `backend/src/main/resources/application.yml`；storageEnabled来自条件注解/YAML，不在原Properties字段中。
- `bilibili/service/BilibiliFollowerMonitorService.java`：enabled只影响collectDueUsers，storage-enabled控制Service/Repository/Controller；手工增改/刷新保持可用；各项策略由消费者归一化。
- `bilibili/service/BilibiliFollowerMonitorScheduler.java`：enabled与storage-enabled均需启用，@Scheduled fixedDelay；完成一批后再等，不用setInterval占周期。
- `subject/service/SubjectService.java`、SubjectWorkbenchService：粉丝Service/Repository是必需构造依赖；工作台开但粉丝存储关在开库前给固定错误。
- `bilibili/live/danmaku/service/BilibiliLiveDanmakuService.java:571`：直接用独立BilibiliApiClient.fetchUserCard解析遮罩昵称，不要求粉丝存储、不执行粉丝重试或记录粉丝API日志。当前借用followers.resolveDisplayName必须拆开。
- `bilibili/client/BilibiliApiClient.java`：卡片与relation/stat都使用粉丝HTTP配置；connect/read=0语义沿用已有HTTP配置模型；昵称查询也使用这份配置。
- 已检索本地 `D:\codex_work\bilibili-API-collect-new\docs\user\info.md` 卡片资料与`status_number.md`关系数，不改平台协议，不将资料等同当前实网验证。
- 已核对[Spring官方环境映射/属性优先级](https://docs.spring.io/spring-boot/reference/features/external-config.html)：支持YAML里的原SOCIAL_MONITOR别名及APP_BILIBILI_FOLLOWERMONITOR_*规范映射，规范变量优先于YAML别名；不新增虚构SOCIAL_MONITOR别名。

## Task 1：配置、存储门控和独立昵称查询

Files: 新增 `packages/contracts/src/bilibili-follower-configuration.ts`、对应schema/共享fixture/TS与Python测试；新增 `packages/core-runtime/src/bilibili-follower-collection-config.ts`；修改`local-core-runtime.ts`、`subject-monitor-configuration.ts`及实际Main入口测试。

Interfaces: `BilibiliFollowerCollectionConfigurationSchema`返回16字段；`loadFollowerCollectionConfiguration(dataDirectory, environment)`只读加载；原公开粉丝方法签名不变。错误码`BILIBILI_FOLLOWER_CONFIG_INVALID`、`BILIBILI_FOLLOWER_STORAGE_DISABLED`、`BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID`；Main使用现有安全错误白名单。

- [x] 真实Core先复现文件被忽略、工作台依赖无校验、8项粉丝方法在禁用后仍可执行；所有平台源使用合成边界。
- [x] 配置文件`config/bilibili-follower-collection.json`，BOM/ENOENT默认/非法文件或IO拒绝，坏文件不被环境掩盖，原别名与规范变量覆盖有测试；共享fixture跨TS/Python。
- [x] storage=false不建粉丝持久化服务/调度，不删历史和绑定；工作台必须同时关。直播仍可按原规则单次获取遮罩昵称、不写粉丝监控/快照/API日志。
- [x] 真实SQLite启用→关闭→重新启用验证历史、排程、绑定不变；实际Core entry/host验证固定错误无私有路径与堆栈，改配置可恢复。

```ts
await expect(LocalCoreRuntime.start(options)).rejects.toMatchObject({code:"BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID"})
expect(() => core.listBilibiliFollowerMonitors()).toThrow(/粉丝.*关闭/)
expect(afterFollowerTables).toEqual(beforeFollowerTables)
```

## Task 2：采集策略与固定延迟调度

Files: `packages/core-runtime/src/bilibili-follower-service.ts`、`local-core-runtime.ts`；新增`bilibili-follower-configuration.test.ts`、补既有scheduler/lifecycle测试。

Interfaces: Service options补`enabled/defaultIntervalSeconds/minIntervalSeconds/maxIntervalSeconds/shortIntervalWarningSeconds/failureBackoffSeconds`；既有dueBatchSize/requestMinIntervalMs/maxAttempts/retryBackoffMs接配置。无需Renderer发平台采集。

- [x] RED配置默认间隔/上下限/警告/失败退避/批量被忽略，以及enabled=false仍被调度；手工操作仍可用、重启不改存量排程。
- [x] Service按原resolveInterval、Math.max(300, Math.min(interval, configuredBackoff))、分类重试实现；大重试等待分段并支持退出，不让Node溢出为1ms。
- [x] RED后将粉丝setInterval替换为首轮0延迟、后续批完成再等待配置delay；内部失败安全记录并继续，stop取消后不重排。
- [x] 回归负配置归一化、最大重试次数/原RetryPolicy上限、每端点限流等待与退出；明确全局共享锁语义仍待另项统一对齐。

```ts
expect((await core.addBilibiliFollowerMonitor({mid:"2"})).intervalSeconds).toBe(420)
await vi.advanceTimersByTimeAsync(399)
expect(collectionStarts).toHaveLength(1)
await vi.advanceTimersByTimeAsync(1)
expect(collectionStarts).toHaveLength(2)
```

## Task 3：HTTP契约、Worker及长请求生命周期

Files: `packages/contracts/src/bilibili-follower.ts`/portable schema、`bilibili-follower-worker-source.ts`、`runtime-protocol.ts`、Python `bilibili_follower.py`/`runtime.py`/`request_lifetime.py`；新增HTTP合成fixture及Core/Main集成回归。

Interfaces: FetchRequest兼容追加可选`httpConfiguration`（四字段）；旧请求沿用原粉丝默认。Worker只读契约，不自行读取应用配置/环境；本地文件只由Core解析。Follower源仍使用现有NDJSON request/stop接口。

- [x] RED：TS/Python旧契约拒绝HTTP配置，Worker固定UA/超时；两端点与昵称实际配置传播测试只替换外部HTTP。
- [x] 接入原connect/read独立期限、UA/Referer，旧请求兼容且不允许null/错类型/换行头；共享fixtures验证TS/portable/Python一致。
- [x] 明确扩展现有Core/Worker存活请求白名单至粉丝add/refresh/card/relation及profile，不泛化到全部命令；保活不代表成功，旧无opt-in请求仍遵守原超时。
- [x] 真实Python子进程及Core入口验证配置/存活；stop与管道失联取消在途请求，迟到结果不能写关库；不因长超时卡死退出。
- [x] 复核发现昵称丢弃evidence产生无引用CAS，补RED后增加专用profile请求/结果，复用HTTP但不落盘；正常采集evidence仍必需。

```ts
expect(payload.httpConfiguration).toMatchObject({connectTimeoutMs:1250,readTimeoutMs:0,userAgent:"Fixture follower/2"})
await core.stop()
await expect(pending).rejects.toMatchObject({code:"CORE_STOPPED"})
```

## Task 4：完整验证与迁移记录

- [x] 按阶段运行定向Vitest与Python pytest，记录真实失败原因后实施；使用既有生命周期/工作台/直播回归防止误伤。
- [x] 独立只读代码复核，修复重要问题后完整`check.cmd`；Node1015/Python376通过，不把测试进程替身写成原生Electron验收。
- [x] 更新配置示例、开发文档、README、全量台账/交接和本项审计，列明所有未完成范围。
- [x] 核验原库仍干净、生产bundle无测试fixture、测试Worker无残留、git diff --check；不提交/推送/打包/启动原项目。

运行命令（本地D盘环境）：

```powershell
. .\scripts\activate-environment.ps1
$env:VITEST_MAX_WORKERS = '2'
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run bilibili-follower-configuration.test.ts
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_follower_configuration.py
.\check.cmd
```
