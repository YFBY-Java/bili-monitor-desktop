# M09 弹幕启动控制与完成后调度迁移计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐原弹幕 enabled、autoStartEnabled、schedulerDelayMs、maxConnections 的启动绑定、消费条件与完成后固定延迟；不宣称 M09 全部完成。

**Architecture:** 保留 Electron Host → Local Core → 真实 SQLite / Realtime Source。Core 启动前读取本地文件和环境；Service 负责拒绝新连接与自动扫描开关；Runtime 以单次定时器在上一轮结束后安排下一轮。文件只读，关闭开关不删除历史或关闭查询入口。

**Tech Stack:** TypeScript、Zod、Vitest、node:sqlite；Python pytest + JSON Schema 校验跨语言配置金样本。

**Readability:** 新代码为 TypeScript、Python、JSON、Markdown，不新增 C/C++/Rust/Java，不新增服务端、依赖或数据库 migration。

## Global Constraints

- 客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`、HEAD `4c94959`、分支 `codex/follower-monitor-actions`；原 `D:\codex_work\BiliMonitor`、`fa2faa6` 只读且不启动。保留已有全部增量、index 空，不提交/推送/合并。
- 所有命令先激活 `scripts/activate-environment.ps1`；新临时目录在创建前验证 `tmpdir()` 为 D 盘绝对路径，清理前验证目标在该隔离 TEMP 内。不得读用户运行库/凭据、使用真实平台或修改 C 盘缓存。
- 本地文件 `dataDirectory/config/bilibili-live-danmaku.json`，缺失默认、不自动写入；UTF-8 BOM 可读；文件字段严格验证且不能被高优先级环境遮住文件错误。
- 四字段 defaults：`enabled=true, autoStartEnabled=true, schedulerDelayMs=5000, maxConnections=10`。typed JSON 的两个数为完整有符号 32 位整数；不在绑定时把零/负 max 改成错误。Service 消费时 `Math.max(1,maxConnections)`。
- 使用原 YAML aliases 和 canonical relaxed 环境名。复用已有 Spring 标量/占位符 helper，不复制 parser 或重构粉丝配置。原 `app.bilibili.live-monitor.danmaku.*` 属性 primitive boolean/int 始终绑定，即使 storage=false 或 Host 测试关闭 scheduler。
- 原 Scheduler Bean 仅由直播 storage 条件决定，与弹幕 enabled/autoStartEnabled、直播 REST enabled 无关。storage=true 时 raw Scheduled delay 仍严格验证，即使两个弹幕开关为 false；不能对 raw 字符串 trim、接受 hex/Duration、将 -1 解释为关闭。storage=false 只跳过此消费，仍做 int/boolean 绑定。已有 live storage 条件映射的 M08 缺口不在本项扩大修改，传入既有解析结果。
- enabled=false 先于 active-existing/capacity/requireRoom/Session/Source 检查，拒绝新 start（含已连房间重复 start）；status/recent/metrics/stop 可用。autoStartEnabled=false 只令 sync no-op，手动仍可连接。两者关闭不主动停止已有手动/自动连接；只读启动配置不增加热重载功能。
- 原首次到期为注册时零延迟，不保证 Runtime.start 返回前执行完成。后续完成后才等待配置 delay；成功、失败都安排下一轮，异常只记录常量事件/错误码，不泄漏原异常消息。stop 后不重新调度、不写已关闭 SQLite；保留现有取消、来源和登录联动。
- 不把 Host 现有 `schedulerDelayMs`（粉丝/REST 测试覆盖）复用给弹幕；弹幕用自己的配置。正 delay 可小于 1000；不改旧预算/并发/浏览器操作/缓存预热，不删除旧测试。
- 外部连接仅合成 Source，Core/Service/Storage/Host entry 使用生产实现。新测试不能仅断言 spy 调用；要断言实际连接/SQLite 会话、历史和重启状态。
- 原 15 个弹幕属性其余 11 个，以及完整协议、心跳、超时、bucket/recent、缓存、凭据/线程执行域映射和 M01–M18 仍保留。测试诊断不等于业务修复；整轮旧失败和新增 suite 跳过必须准确保留。

## 已核对的原依据

以原 `social-data-monitor/backend/` 为根：

- `src/main/java/com/socialmonitor/bilibili/live/danmaku/config/BilibiliLiveDanmakuProperties.java`：15 属性，四个本项默认值、primitive 类型及无消费前范围限制。
- `service/BilibiliLiveDanmakuScheduler.java`：`@ConditionalOnProperty` 只有直播 storage；`@Scheduled(fixedDelayString="${app.bilibili.live-monitor.danmaku.scheduler-delay-ms:5000}")` 无 initialDelay；异常 catch 后返回。
- `service/BilibiliLiveDanmakuService.java:75–140,240–276`：enabled guard、max 最小 1、auto 两开关提前返回、不淘汰已有连接。
- `src/main/resources/application.yml:68–110`：四个 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_*` alias，5000/10 实际默认。
- 本机 Spring 6.1.15 / 已有 JDK javap 只读取证：属性 int 转换与 raw Scheduled 消费是两条路径；Scheduled 不 trim；默认 initialDelay 转零；执行器 delay<=0 拒绝；next time 以本轮完成时间加 delay。不是原应用启动验证，也不证明全局线程池等价。
- 原 API 归档 `D:\codex_work\bilibili-API-collect-new/docs/live/message_stream.md` 已亲读作背景，本项不改协议/端点，不把它当当前平台证据。

## Task 1: 四字段启动绑定、Service 开关与 fixedDelay 实现

**Files:**
- Create: `packages/contracts/src/bilibili-live-danmaku-configuration.ts`、`.test.ts`
- Create: `packages/contracts/schemas/bilibili-live-danmaku-configuration.v1.schema.json`、`packages/contracts/fixtures/live-danmaku-configuration.json`
- Modify: `packages/contracts/src/index.ts`、`packages/contracts/src/subject-monitor-configuration.ts`、其 `.test.ts`（安全 startup code 白名单）
- Create: `packages/core-runtime/src/bilibili-live-danmaku-config.ts`、`.test.ts`
- Modify: `packages/core-runtime/src/bilibili-live-danmaku-service.ts`、`packages/core-runtime/src/local-core-runtime.ts`
- Create: `packages/core-runtime/src/__fixtures__/danmaku-configuration.ts`（隔离环境/真实临时 SQLite/合成 Source）、`packages/core-runtime/src/bilibili-danmaku-configuration.integration.test.ts`、`packages/core-runtime/src/bilibili-danmaku-scheduler.integration.test.ts`
- Modify: `packages/core-runtime/src/bilibili-live-configuration.integration.test.ts:53–61`、`packages/core-runtime/src/bilibili-auth-danmaku-link.test.ts:136–153`（原首次扫描 5s 断言最小适配）
- Modify: `apps/desktop/src/main/core-startup-configuration.test.ts`（复用真实 entry/controller fixture，增加弹幕安全错误与恢复）
- Create: `workers/python/tests/test_danmaku_configuration.py`、`config/bilibili-live-danmaku.example.json`

**Interfaces:**
- Produces `BilibiliLiveDanmakuConfigurationSchema`、type `BilibiliLiveDanmakuConfiguration`、`BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE`；strict typed schema **不 refine delay>0**（它依赖 storage 条件，不能塞进四字段金样本）。
- Produces `loadLiveDanmakuConfiguration(dataDirectory: string, environment: NodeJS.ProcessEnv, storageEnabled: boolean): Promise<BilibiliLiveDanmakuConfiguration>`。
- Consumes `createFollowerPropertyLookup`、`lookupFollowerCanonicalEnvironment`、`resolveFollowerPlaceholders`、`bindFollowerBoolean`、`bindFollowerInteger`、`validateFollowerSchedulerDelay`，保持原接口和粉丝消费者不变。
- Service options 增加可选 `enabled?: boolean`、`autoStartEnabled?: boolean`；已有 `maxConnections?: number` 不改名；Runtime 传入四配置中前三个 Service 消费项并保存 delay。
- 已有 `followerConfigurationFixture`、`SyntheticRealtimeSource`、`seedLoginRoom`、`ControlDatabase` 可复用；新 wrapper 在创建前 D 盘检查，env 只隔离本测试所需前缀，恢复后不污染其他 suite。
- 真实 Host fixture `apps/desktop/src/main/__fixtures__/core-process-worker.ts` 不改生产入口；仅在现有测试 setup 加两个 Danmaku env 前缀的恢复隔离。

- [x] **Step 1: RED 行为测试，生产实现之前运行**

使用已有真实 Core fixture，新 wrapper 写 `{enabled:false}` 并 seed liveStatus=1 的隔离房间（seed 库关后 Runtime 才打开）；第一 RED 不依赖尚未存在的新 export。示例关键断言：

```ts
const f = await danmakuConfigurationFixture({ enabled: false })
const room = await f.seedRoom({ liveStatus: 1 })
const runtime = await f.start({ schedulerEnabled: false })
await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id }))
  .rejects.toMatchObject({ code: "BILIBILI_DANMAKU_DISABLED" })
expect(f.realtime.starts).toHaveLength(0)
expect(runtime.getBilibiliLiveDanmakuStatus(room.id).running).toBe(false)
```

新 wrapper 的 `seedRoom({liveStatus:number}): Promise<{id:string}>` 在同一隔离库使用 `seedLoginRoom` 并关闭临时连接，`start({schedulerEnabled?:boolean}):Promise<LocalCoreRuntime>` 只封装既有 `LocalCoreRuntime.start`。公开生产方法为 `startBilibiliLiveDanmaku`、`getBilibiliLiveDanmakuStatus`、`getBilibiliLiveDanmakuRecent`、`getBilibiliLiveDanmakuMetrics`；不添加生产测试接口。其他首批 RED：auto=false 手动可用自动无会话；max=1 第二手动被 CONNECTION_LIMIT 拒绝；scheduler 第一次 advance0 建真实 CONNECTED 会话；Source gate 卡住 >delay、完成后才等 delay；坏配置启动前 no control.db。

运行：先 `. .\scripts\activate-environment.ps1`，再 `& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-danmaku-configuration.integration.test.ts src/bilibili-danmaku-scheduler.integration.test.ts`，保留 `.tmp/2026-10-06-danmaku-startup-red.log`。预期生产差异失败；夹具/API 拼写或 import 错不能算业务 RED，先改夹具再重复定向。

- [x] **Step 2: strict 契约、JSON Schema、同源 Python 金样本**

```ts
import { z } from "zod"
export const BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE =
  "弹幕启动配置无效。请检查 config/bilibili-live-danmaku.json 和对应环境变量后重启。"
const IntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
export const BilibiliLiveDanmakuConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  autoStartEnabled: z.boolean().default(true),
  schedulerDelayMs: IntegerSchema.default(5000),
  maxConnections: IntegerSchema.default(10)
}).strict()
export type BilibiliLiveDanmakuConfiguration = z.infer<typeof BilibiliLiveDanmakuConfigurationSchema>
```

JSON Schema draft2020-12 对象、additionalProperties=false、字段 optional、bool/int 类型与有符号32范围/default相同。fixtures 包括默认、关闭、delay/max 两端、零/负 typed 合法、字符串数字/字符串 bool/null/浮点/越界/未知字段非法。TS `it.each` 和 Python `Draft202012Validator(schema).is_valid(fixture["input"]) == fixture["valid"]` 消费同一 JSON。`index.ts` 导出；startup 白名单增加 `case "BILIBILI_DANMAKU_CONFIG_INVALID": return BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE`，已有 unknown 返回 undefined 保留。

- [x] **Step 3: startup-only loader，复用已核对的绑定层**

完整 loader 主体如下，风格 import/换行与工程保持一致：

```ts
type Key = keyof BilibiliLiveDanmakuConfiguration
const aliases: Record<Key, string> = {
  enabled: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ENABLED",
  autoStartEnabled: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_AUTO_START_ENABLED",
  schedulerDelayMs: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_SCHEDULER_DELAY_MS",
  maxConnections: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS"
}
const propertyName = (key: Key) =>
  `app.bilibili.live-monitor.danmaku.${key.replace(/[A-Z]/gu, c => `-${c.toLowerCase()}`)}`
export async function loadLiveDanmakuConfiguration(
  dataDirectory: string, environment: NodeJS.ProcessEnv, storageEnabled: boolean
): Promise<BilibiliLiveDanmakuConfiguration> {
  try {
    let contents: string
    try { contents = await readFile(resolve(dataDirectory, "config/bilibili-live-danmaku.json"), "utf8") }
    catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    const values = BilibiliLiveDanmakuConfigurationSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const keys = Object.keys(values) as Key[]
    const properties = new Map(keys.map(key => [propertyName(key), `\${${aliases[key]}:${String(values[key])}}`]))
    const lookup = createFollowerPropertyLookup(environment, properties, keys.map(propertyName))
    const raw = new Map(keys.map(key => [key,
      lookupFollowerCanonicalEnvironment(environment, propertyName(key)) ?? properties.get(propertyName(key))!]))
    const expand = (key: Key, strict: boolean) => resolveFollowerPlaceholders(raw.get(key)!, lookup, strict)
    const configuration = BilibiliLiveDanmakuConfigurationSchema.parse(Object.fromEntries(keys.map(key => [key,
      key === "enabled" || key === "autoStartEnabled" ? bindFollowerBoolean(expand(key, false))
        : bindFollowerInteger(expand(key, false))])))
    if (storageEnabled) validateFollowerSchedulerDelay(expand("schedulerDelayMs", true))
    return configuration
  } catch {
    throw new CoreApplicationError("BILIBILI_DANMAKU_CONFIG_INVALID", BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE)
  }
}
```

import 实际 fs/path/contracts/helper 与已有 follower loader 相同。单测记录 defaults/missing不写/BOM/非法文件不被 env 掩盖、现代名优先 legacy/file、8种 bool token、int hex/Unicode/空白及边界、别名与 canonical/nested placeholder/cycle、enabled/auto=false 时 delay 仍拒绝、storage=false 只跳过 raw消费且 invalid primitive 仍拒绝。raw `" 5000 "`、`"0x10"`、`"PT5S"`、0/-1/storage开拒绝；关时前两项 int合法，Duration/越界仍拒绝；不复制解析器。

- [x] **Step 4: Service guard 与 Runtime 接入，最小生产差异**

```ts
// startInternal 内，ensureRunning 后、existing/capacity/requireRoom 前
if (this.options.enabled === false) {
  throw new CoreApplicationError("BILIBILI_DANMAKU_DISABLED", "弹幕监听已由启动配置关闭。启用 enabled 后重启客户端可恢复，已有数据不会删除。")
}
// syncAutoConnectionsInternal 内，在候选查询/淘汰之前
if (this.options.enabled === false || this.options.autoStartEnabled === false) return
```

Runtime `start` 在 liveConfiguration/followerConfiguration/subjectConfiguration 读取阶段加入 loader，**ControlDatabase.open 前**，传 liveConfiguration.storageEnabled，不传 host schedulerEnabled。构建 Service options 时传 enabled/autoStartEnabled/maxConnections，原凭据/sessionSink/显示名参数全部保留。private `liveDanmakuSchedulerDelayMs = 5000`，在启动 timer 前赋配置 delay。start 条件仍 `runtime.schedulerEnabled && liveDanmaku存在`，无两个flag/live.enabled额外条件；调用 `startLiveDanmakuScheduler(0)`。

替换原方法并将 stop 的 clearInterval 改 clearTimeout：

```ts
private startLiveDanmakuScheduler(delayMs = this.liveDanmakuSchedulerDelayMs): void {
  this.liveDanmakuScheduler = setTimeout(() => {
    this.liveDanmakuScheduler = undefined
    if (this.stopped) return
    void this.liveDanmaku.syncAutoConnections().catch(() => {
      if (!this.stopped) console.warn(JSON.stringify({
        event: "bilibili.danmaku.scheduler-failed", code: "BILIBILI_DANMAKU_SCHEDULER_FAILED"
      }))
    }).finally(() => {
      if (!this.stopped) this.startLiveDanmakuScheduler()
    })
  }, delayMs)
  this.liveDanmakuScheduler.unref()
}
```

- [x] **Step 5: GREEN + 真实生命周期/Host 回归**

新集成必须：disabled 手动拒绝/不写新会话、查询/停止可用/重启历史保留；auto disabled 手动仍连、无 auto 新会话；同 Service options 在合成测试变 false 后已有手动/auto 不被淘汰、不加生产热重载；max负/0消费1/上限2及 capacity错误不伪造平台失败；live.enabled=false 自动照常；storage=false入口仍走已有禁用码、不建Danmaku scheduler，primitive坏配置仍fail；host schedulerEnabled=false不绕配置校验。

fake timers 测试 Core + SQLite + Source gate：首次 advance0→真实会话；gate未释放推进多倍delay不扫描/重入；gate完成后 delay-1 不连新目标、最后1ms才连；失败用临时 `ControlDatabase.prototype.listBilibiliLiveDanmakuAutoStartRoomIds` 一次 throw（恢复真实 query）断言常量 log且下一轮SQLite CONNECTED；stop before-first及pending/late completion零timer、无重建/关闭库写入。受控释放与 stop 使用已有取消语义，避免测试悬挂。真实 status/session 与调用时序联合验证。

已审计两处最小旧测试适配：live配置集成 advance0 首次调用1，再5000累计2；auth联动合成Source首次等待改advance0，其退出取消和stop保持。不批量换未注入Source的 fixture：只读审计未发现合格自动目标暴露真实网络。

Host 在现有 real-entry suite setup 隔离 `APP_BILIBILI_LIVEMONITOR_DANMAKU_` / `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_` 前缀；新增输入 unknown synthetic-private 字段或无效delay，controller.start返回稳定BILIBILI_DANMAKU_CONFIG_INVALID、不含私有marker/路径/stderr，control.db不存在；修正后同controller可ready，文件不改、历史不删。与 fake Controller 单测区别清楚。

运行下列命令，将准确 RED/GREEN/Types/Python 与日志路径写到 `.tmp/2026-10-06-danmaku-startup-report.md`；只定向，不与主代理 whole check 重叠：

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PNPM_CMD --filter @bmd/contracts exec vitest run src/bilibili-live-danmaku-configuration.test.ts src/subject-monitor-configuration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-live-danmaku-config.test.ts src/bilibili-danmaku-configuration.integration.test.ts src/bilibili-danmaku-scheduler.integration.test.ts src/bilibili-live-configuration.integration.test.ts src/bilibili-auth-danmaku-link.test.ts src/bilibili-danmaku-auto-targets.integration.test.ts src/bilibili-danmaku-lifecycle.test.ts src/bilibili-danmaku-upgrade.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/main/core-startup-configuration.test.ts
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_danmaku_configuration.py
& $env:BMD_PNPM_CMD typecheck
```

预期定向全过，不把 expected 拒绝码/SQLite ExperimentalWarning 误报平台错误；异常输出说明来源。所有运行序列化，确实卡住先取证，不加测试预算或机械反复跑。

- [x] **Step 6: task gate、整轮验证、文档与最终 review（执行完成，整体验证失败仍开放）**

独立 task spec/quality 审查，Important 修复后复审；主代理亲读报告、核对 source delta/配置消费、D盘/原只读/HEAD/index。主代理运行一次新的 `check.cmd`（只有生产增量完成后的整轮）；不覆盖此前删除 probe 的诊断记录、准确区别历史和新结果。

主代理新增 `docs/implementation/2026-10-06-danmaku-startup-scheduler-audit.md`，更新 README、full-migration-tracker、migration-handoff 和 `.superpowers/sdd/progress.md`：逐项默认/绑定/开关/调度/测试、已实现与余11字段、原生/真人未验收、整轮失败保留。最终 whole-branch 独立审查一次，不能用单切片通过称全部完成。此任务不包含 git commit/合并/推送。

执行结果：task Important已修并复审Approved；一次修改后wholecheck退出1（Node2161/2165，四失败、无跳过），types/Python1016/构建另行通过。最终whole-branch切片质量Approved、merge With fixes、ship No，四项整体验证Important和候选suite创建前D盘预检Minor仍开放，详见审计；本勾选只表示本步骤执行/记录完成，不表示整分支门禁通过、M09或M01–M18完成。
