# 粉丝配置绑定与调度启动规则 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐原 BiliMonitor 已有粉丝监控配置的环境绑定、条件启停和调度延迟启动校验，不扩展配置入口。

**Architecture:** Local Core 先校验只读 JSON 文件的类型与字段，再合并环境变量。普通属性按原 Spring 转换，存储开关按原条件注解读取原文；调度原文仅在原调度条件成立时校验，所有失败发生在 SQLite 和 Worker 启动前。

**Tech Stack:** TypeScript、Zod、JSON Schema、Vitest、Python pytest。

**Readability:** 新实现仅 TypeScript 和声明式 JSON，不新增 C、C++、Rust 或 Java 源码。

## Global Constraints

- 原 B/S 仓库只读；原 HEAD fa2faa6c11c89376cd8e492856bdaf5cc58ac400。
- 所有测试、工具、缓存、运行数据位于 D 盘；执行前加载 scripts/activate-environment.ps1。
- 保留已有未提交改动；不提交、推送、打包或启动已安装客户端。
- 不新增 HTTP 服务、YAML/CLI/Spring JSON 配置入口或真实平台请求。
- Core 是控制库唯一写入者，Worker 不读取环境配置。

## 原业务证据

原 application.yml 的10个别名、BilibiliFollowerMonitorProperties 的16个属性，以及 Scheduler、Service、Controller/Repository 的条件注解分别核对。Spring Boot 3.3.6 / Framework 6.1.15 的真实 Binder、调度处理器、线程池执行器使用原编译类和 D 盘已有依赖做离线验证：空 primitive 失败；仅原文 equalsIgnoreCase false 关闭条件；整数转换和调度字符串转换不是同一规则。

### Task 1: 先锁定环境转换和启停差异

**Files:**
- Create: `packages/core-runtime/src/bilibili-follower-binding.test.ts`
- Modify: `packages/core-runtime/src/bilibili-follower-collection-config.test.ts`
- Modify: `packages/contracts/fixtures/follower-collection-configuration.json`

**Interfaces:**
- Consumes: `loadFollowerCollectionConfiguration(dataDirectory: string, environment: NodeJS.ProcessEnv): Promise<BilibiliFollowerCollectionConfiguration>`。
- Produces: 只读配置测试，覆盖 enabled 八种布尔别名、storage 原文条件、Java 空白/整数/十六进制、原始延迟校验、覆盖优先级。

- [x] 写失败测试；例如原条件开关 off 不关闭存储，而普通 enabled 转成 false：

```ts
expect(await loadFollowerCollectionConfiguration(directory, {
  APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED: "off",
  APP_BILIBILI_FOLLOWERMONITOR_ENABLED: "off"
})).toMatchObject({ storageEnabled: true, enabled: false })
```

- [x] 执行定向测试，确认行为差异为 RED：

```powershell
. .\scripts\activate-environment.ps1
$env:VITEST_MAX_WORKERS = '2'
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-follower-binding.test.ts src/bilibili-follower-collection-config.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/contracts exec vitest run src/bilibili-follower-configuration.test.ts
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_follower_configuration.py
```

### Task 2: 实现配置转换并同步契约

**Files:**
- Create: `packages/core-runtime/src/follower-configuration-values.ts`
- Modify: `packages/core-runtime/src/bilibili-follower-collection-config.ts`
- Modify: `packages/contracts/src/bilibili-follower-configuration.ts`
- Modify: `packages/contracts/schemas/bilibili-follower-collection-configuration.v1.schema.json`

**Interfaces:**
- Produces: `followerPropertyCondition(value: string): boolean`、`bindFollowerBoolean(value: string): boolean`、`bindFollowerInteger(value: string): number`、`validateFollowerSchedulerDelay(value: string): void`。
- Consumes: 上述只读 loader；新增共享输入字段 schema 保持 JSON 类型严格，最终 schema 对 enabled && storageEnabled 检查延迟 > 0。

- [x] 将存储条件与普通布尔转换分开：

```ts
export function followerPropertyCondition(value: string): boolean {
  return !/^false$/iu.test(value)
}
export function bindFollowerBoolean(value: string): boolean {
  const text = value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, "").toLowerCase()
  if (["true", "on", "yes", "1"].includes(text)) return true
  if (["false", "off", "no", "0"].includes(text)) return false
  throw new Error("Invalid primitive boolean configuration")
}
```

- [x] 数字先去所有 Java Character.isWhitespace 字符，再识别负号后的 0x/0X/#；+0x 不应变成有效十六进制。使用 BMP Nd 数字和全角 A-F 的显式映射，逐位有限累加，正上限2147483647、负绝对上限2147483648；不使用 JS trim/Number/parseInt 宽松解析。
- [x] 调度字符串使用未 trim 的十进制规则、正负号及 BMP 数字；归一化值必须 > 0。仅未 trim 的 enabled/storage 原条件均开启时检查。空字符串和无效 primitive 即使模块停用也不可被忽略。
- [x] JSON 输入 schema 允许完整 int32 延迟；最终契约按启停条件要求正延迟。保留未知字段、null、字符串数字、非法 HTTP 头失败规则。有效字段可被高优先级环境覆盖；不让覆盖掩盖格式/类型错误。
- [x] 执行 Task 1 命令，预期全部 GREEN。

### Task 3: 真实 Core 消费与失败恢复回归

**Files:**
- Modify: `packages/core-runtime/src/bilibili-follower-configuration.test.ts`
- Modify: `docs/development.md`
- Create: `docs/implementation/2026-10-05-follower-binding-audit.md`
- Modify: `docs/implementation/2026-09-13-full-migration-tracker.md`
- Modify: `docs/implementation/2026-09-13-migration-handoff.md`

**Interfaces:**
- Consumes: 现有 `followerConfigurationFixture` 的真实 LocalCoreRuntime、调度、SQLite，以及仅网络边界为合成的源。
- Produces: storage 原文启停、enabled=false 手工可用、环境整数实际写入监控间隔、无效调度启动前失败/修正后恢复且历史不变。

- [x] 先添加真实 Core RED 用例：

```ts
const f = await setup({ requestMinIntervalMs: 0 })
vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_DEFAULTINTERVALSECONDS", "0x1a4")
const core = await f.start()
expect((await core.addBilibiliFollowerMonitor({ mid: "2" })).intervalSeconds).toBe(420)
```

- [x] 执行并确认定向结果：

```powershell
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-follower-configuration.test.ts
```

- [x] 请求独立只读审查；literal域无未关闭的重要问题，发现的placeholder差异单列为全量迁移未完成项。
- [x] 冻结实现后执行 `check.cmd`、`git -c core.autocrlf=false diff --check`；核对原仓库 clean、无孤儿进程、无 C 盘产物。
- [x] 记录实际测试数量和人工验收边界；M06 的完整画像/Long/JSON/日志元数据及后续 M08–M18 不标完成。

不执行 git commit/push。计划由当前任务直接实施，整套迁移目标持续进行。

## 执行边界补充

本轮literal环境布尔/整数转换、条件启停、调度原文已实施并通过定向/完整回归。独立审查确认原Spring支持环境值内嵌`${NAME:default}`，当前literal转换拒绝；此差异明确列入后续未完成范围，不把它当新入口排除，也不据本轮literal转换通过宣称完整Spring输入等价。全量目标仍进行中。
