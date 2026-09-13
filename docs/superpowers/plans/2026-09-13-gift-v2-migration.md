# M01 Gift V2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or the applicable inline test-driven-development workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本任务按用户要求逐功能串行完成，不委派并行开发。

**Goal:** 原 `1101952` 的单包多礼物、金额、身份、去重和容错完整接入本地事件链路。

**Architecture:** Node Realtime Worker 将 V2 protobuf 解成与旧 SEND_GIFT 等价的规范事件，原始 JSON 保留 V2 内容。每个礼物独立发送至现有 NDJSON/Core/SQLite 通道，不新增 IPC 或服务端。

**Tech Stack:** TypeScript、Node Buffer/BigInt、Vitest、现有 SQLite Core。

**Readability:** 无 C/C++/Rust；独立 TypeScript decoder，字段表和边界校验明确。

## Global Constraints

- 原 B/S 仓库只读，基线 `fa2faa6`。
- 所有运行命令先 `. .\scripts\activate-environment.ps1`；临时数据位于 D 盘。
- 不丢批内礼物，不用昵称造 UID，不把银瓜子算付费；损坏包不产生假礼物。
- 全量业务目标见 `docs/implementation/2026-09-13-full-migration-tracker.md`，完成本项不等于完成全量迁移。

## Task 1: V2 解码、事件批量化、传输与入库回归

**Files:**
- Create: `workers/node-realtime/src/bilibili-gift-v2.ts`
- Create/Test: `workers/node-realtime/src/bilibili-gift-v2.test.ts`
- Modify: `workers/node-realtime/src/bilibili-danmaku-event.ts`
- Modify: `workers/node-realtime/src/bilibili-danmaku-connection.ts`
- Create/Test: `workers/node-realtime/src/bilibili-danmaku-connection.test.ts`
- Create/Test: `packages/core-runtime/src/bilibili-gift-v2-ingestion.test.ts`
- Create test helpers: `workers/node-realtime/src/__fixtures__/gift-v2.ts`、`packages/core-runtime/src/__fixtures__/live-session.ts`，仅测试导入，不进入生产入口。

**Interfaces:**
- Consumes: 原 `ParsedBilibiliDanmakuEvent`、`BilibiliLiveSessionService.ingest(room, transportId, receiptOrdinal, protocolVersion, event)`。
- Produces: `decodeBilibiliGiftV2(encoded: string): Record<string, unknown>[]` 和 `parseBilibiliDanmakuEvents(rawJson: string, receivedAt: string): ParsedBilibiliDanmakuEvent[]`。
- Compatibility: 保留 `parseBilibiliDanmakuEvent` 返回批首项，所有传输消费者改用复数接口。

- [ ] Step 1：添加失败测试。按原测试合成 protobuf（非真实用户交易），断言批大小 2，gold 为 200 milli-yuan、silver 为 0，UID/礼物名称/粉丝牌/时间不丢。测试显式 total=0 不回退，缺 total 才 price×num；old/new 同 tid 的 eventKey 相等；没有 tid/rnd 无强 key；坏 base64/截断/溢出/空列表/无效数量不返回事件，下一条正常消息仍可解析。长 UID 以字符串验证不失真。

```ts
const events = parseBilibiliDanmakuEvents(envelope(gift("a", 2, "gold", 200), gift("b", 3, "silver", 300)), now)
expect(events.map(event => event.amountMilliYuan)).toEqual([200, 0])
expect(events.map(event => event.sourceEventId)).toEqual(["a", "b"])
```

- [ ] Step 2：运行 `pnpm --filter @bmd/realtime-worker exec vitest run src/bilibili-gift-v2.test.ts`，记录未实现时失败；不把测试入口或环境错误算作业务复现。
- [ ] Step 3：解码字段与实现规则：顶层 1 uid、2 uname、8(6 medal_name)、10 repeated gift；gift 1 giftId、2 giftName、3 num、5 price、7 total_coin、8 coin_type、9 tid、10 timestamp、12 rnd。tag 号 1..0x1fffffff，varint 最多 10 字节，wire 0/2 读取，wire 1/5 跳过固定 8/4 字节，其余拒绝；base64 上限 2,000,000 字符；所有长度先检查。ID 保留十进制字符串，计数/金额限定安全整数；数量 1..2147483647。全包解析成功才返回批，不部分写坏包。复用旧 gift 金额规则，强 key 使用 `SEND_GIFT:${sourceEventId}`。

```ts
for (const event of parseBilibiliDanmakuEvents(packet.bodyText, receivedAt)) {
  input.onEvent({ type: "command", event, receivedAt })
}
```

- [ ] Step 4：使用假的网络边界但真实 WebSocket 消费处理函数验证一个二进制 command 包送出两个事件、坏包后下个包仍正常。真实临时 SQLite 测试：先 REST 确认开场，批内逐条 ingest；V1/V2 相同 tid 只一条事实；无 tid 两礼物分别保留；用户聚合/金额/礼物数正确。断言不是检查源码字符串。
- [ ] Step 5：执行 `pnpm --filter @bmd/realtime-worker test`、`pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-gift-v2-ingestion.test.ts`；随后 `check.cmd`。把准确测试证据写入台账，核对原仓库干净。提交/推送仅在用户请求时执行。

## 执行结果

- [x] Step 1–2：7 项解析测试先失败；错误输出为 UNKNOWN、无金额/身份/交易 key，及缺批量入口。
- [x] Step 3：独立 decoder、批量规范事件、旧协议兼容及跨协议交易 key 完成。
- [x] Step 4：socket 测试先复现 `[a,c]` 缺 b，再复现文本消息缺失，修复后二进制/文本均完整；真实 SQLite 集成验证通过（身份/金额/用户聚合/强弱去重）。测试使用实际 WorkerSource 校验，无类型强转跳过边界。
- [x] Step 5：`check.cmd` 退出 0，Node 228/Python 23；连同 M02 已实现部分再次全量验证 Node 237/Python 23。原项目未改动；未做真实平台送礼或发布安装包。
