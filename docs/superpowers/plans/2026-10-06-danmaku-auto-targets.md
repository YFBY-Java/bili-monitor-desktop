# M09 自动弹幕候选与容量仲裁迁移计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整对齐原自动监听的候选资格、创建顺序、手动占位、自动淘汰和下一轮重试，而不是扩大成M09全部完成。

**Architecture:** 保持现有Local Core/SQLite/Realtime Worker；Storage返回完整候选，Service选择目标并执行停止/启动。外部连接用合成Source隔离，资格、会话和状态均验证真实实现。

**Tech Stack:** TypeScript、node:sqlite、Vitest；不新增依赖、服务端或数据库migration。

**Readability:** 新实现仅TypeScript和Markdown，不新增C/C++/Rust。

## Global Constraints

- 原项目`D:\codex_work\BiliMonitor`、`fa2faa6`只读且不启动；客户端`D:\codex_work\bili_reptile\bili-monitor-desktop`、HEAD `4c94959`、分支`codex/follower-monitor-actions`，保留此前全部18项未提交增量。不得自动提交/推送/合并。
- 所有临时数据库、日志、缓存和工具产物必须在D盘；命令先加载`scripts/activate-environment.ps1`。不访问用户库、凭据或真实平台，不更新安装应用。
- 自动资格为ACTIVE且满足绑定danmuEnabled或正在直播之一；直播无需绑定，绑定离线也可。UNION去重、直播优先，同类按原递增房间ID顺序，不按热度或UUID词法。
- 原V4 BIGSERIAL与原insert/upsert保留ID；客户端普通rowid表及既有房间UPDATE保留插入序，因此用`room.rowid`映射原ID顺序。不得改schema或将更新/热度/UUID重新解释为创建优先级。
- 原Repository返回完整候选，不在查询阶段裁剪为最大连接数。Service先扣全部现有手动连接容量，再遍历候选跳过现有手动，填满自动目标。
- 总容量`max(0,max(1,maxConnections)-manualCount)`；只停止不入选的自动连接，停止先于新启动。手动连接不被自动淘汰、转成自动或改变协议。
- 启动失败不递补下个候选；下轮重试仍入选者。显式stop无永久禁自动含义，仍合资格者下轮重启；暂停/失去资格自动停止。保留已有退出取消、登录升级归属与错误安全日志。
- 不放宽旧测试预算或并发，不删旧测试、不换浏览器操作或为旧suite预热。新回归先确认真实差异RED再最小修复；合成Source的调用记录仅辅助顺序，必须断言真实Service状态/SQLite会话。
- fixedDelay/开关及配置完整接入、其他M09协议/解析、M06共享recycler及全量M01–M18/真人/原生验收仍保留，不能因本项通过标完成。

## 原依据与基线

- 原`social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/danmaku/repository/BilibiliLiveDanmakuRepository.java:113–134`：资格、UNION、完整序列；`service/BilibiliLiveDanmakuService.java:240–276`：手动容量、跳过顺序、自动淘汰、失败和下轮重试。
- 原`db/migration/V4__bilibili_live_monitor.sql:1–2`及`live/repository/BilibiliLiveMonitorRepository.java:95–107`：递增ID、更新保留；客户端`control-database.ts:2510–2575,2654–2656`及既有live-query审计为rowid映射依据。
- 已亲读本机历史API`docs/live/message_stream.md`认证接口说明；本项不改协议/端点、不把归档参考当实网证据。
- 一次DEBUG基线已执行且退出1：Node2077/2080、Desktop627/630，另Subject afterAll hook失败。12个Vite server命中缓存，原8导航失败本次未复现；UID输入/2000点测试体5s超时、MainLong64等待HTTP标记15s ENOENT，清理hook10s超时。不能称旧冷启动已修复，日志`.tmp/2026-10-06-vite-loading-debug-check.log`。

### Task 1: 原自动候选与容量仲裁

**Files:**
- Modify: `packages/storage/src/control-database.ts`（仅自动候选query）
- Modify: `packages/core-runtime/src/bilibili-live-danmaku-service.ts`（仅syncAutoConnectionsInternal目标集合）
- Create: `packages/core-runtime/src/bilibili-danmaku-auto-targets.integration.test.ts`
- Create if helper setup needs separation: `packages/core-runtime/src/__fixtures__/danmaku-auto-targets.ts`（仅测试，真实临时SQLite和合成Source，不新生产test-only API）

**Interfaces:** 保留`service.start/stop/status/syncAutoConnections`、`ControlDatabase.open(directory)`及现有`SyntheticRealtimeSource`。Storage的`listBilibiliLiveDanmakuAutoStartRoomIds(): string[]`改为无limit的完整内部查询，已核对唯一生产调用在本Service；既有mock的方法名不变。测试只用公开Storage API seed、更新/绑定/删除，不直接修改真实用户库。

- [x] 建立真实临时SQLite测试；cleanup前验证绝对路径落在当前D盘TEMP下，先停止Service再关库，重开也只用同一隔离目录。复用合成Realtime Source；不启动auth/login或其他平台Source。
- [x] 先写并运行RED：反向UUID、反向热度仍按创建序；ACTIVE直播/绑定离线/重复绑定与非ACTIVE排除；完整候选超过max=2不裁剪；A手动+B自动的原目标保留、A手动占首位后启动B而不是空槽。

关键行为断言（测试中A/B/C依创建顺序seed，均直播，maxConnections=2）：

```ts
const manual = await service.start({ roomMonitorId: first, protocolVersion: 1 })
await service.syncAutoConnections()
expect(service.status(first)).toMatchObject({ running: true, sessionId: manual.sessionId, protocolVersion: 1 })
expect(service.status(second)).toMatchObject({ running: true, status: "CONNECTED" })
expect(service.status(third).running).toBe(false)
expect(database.findLatestBilibiliLiveDanmakuSession(second)?.status).toBe("CONNECTED")
```

新完整query接口会去掉旧limit参数；RED可以先使用当前接口并在变更后仅同步调用签名，保留同一个全量数量/顺序断言。测试自身错误单列，不能充作业务RED。

- [x] 最小Storage实现：两路UNION均选择`room.rowid AS insertionOrder`，去掉onlineCount及LIMIT，以`livePriority ASC, insertionOrder ASC`排序，返回monitorId；不改普通房间列表或存储写入。
- [x] 最小Service实现（已有stop/start/catch保持）：

```ts
const desired = this.options.database.listBilibiliLiveDanmakuAutoStartRoomIds()
const manualCount = [...this.connections.values()].filter(handle => !handle.autoManaged).length
const autoCapacity = Math.max(0, this.maxConnections - manualCount)
const targets = new Set<string>()
for (const monitorId of desired) {
  const existing = this.connections.get(monitorId)
  if (existing && !existing.autoManaged) continue
  if (targets.size >= autoCapacity) break
  targets.add(monitorId)
}
```

- [x] GREEN并补原已正确行为覆盖：手动不入候选仍占位、全手动不被挤走；直播替换离线自动且先stop后start；资格移除、绑定开关/暂停；失败只留下ERROR会话，下轮同目标重试而不递补；显式stop后合资格自动重启；已选自动会话不重复建立；快照更新/关闭重开仍保持顺序，重加是新创建顺序。每例断言实际status/SQLite session，顺序记录只辅助。
- [x] 定向命令（先加载环境）：`& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-danmaku-auto-targets.integration.test.ts`；相关旧回归加`src/bilibili-live-danmaku-service.test.ts src/bilibili-danmaku-lifecycle.test.ts src/bilibili-danmaku-upgrade.test.ts src/bilibili-auth-danmaku-link.test.ts`。所有日志`.tmp/2026-10-06-danmaku-auto-*.log`。
- [x] task spec+quality独立复审，修正Important后复审；记录准确RED/GREEN及未执行的真人/完整Realtime协议边界。整轮主代理跑`check.cmd`，保留实际失败，不反复跑求绿。
- [x] 更新审计/台账/交接与独立最终复审，保留全量目标进行中和旧基线风险，不自动提交。切片quality Approved；merge With fixes（删除初始化/9跳过Important），D盘创建前预检Minor未实现；详见审计，不称完整验收通过。
