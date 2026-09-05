import { describe, expect, it } from "vitest"

import { parseBilibiliDanmakuEvent } from "./bilibili-danmaku-event"

describe("Bilibili danmaku event parser", () => {
  it("keeps the original detailed DANMU_MSG identity and timestamp", () => {
    const event = parseBilibiliDanmakuEvent(JSON.stringify({
      cmd: "DANMU_MSG:4:0:2:2:2:0",
      info: [[0, 0, 0, 0, 1_776_312_000_123, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {
        user: {
          base: { name: "完整昵称" },
          medal: { name: "详细粉丝牌" }
        },
        extra: { id_str: "dm-123" }
      }], "hello danmaku", [1001, "遮***称"], [0, "数组粉丝牌"]]
    }), "2026-08-29T12:10:00.000Z")
    expect(event).toMatchObject({
      command: "DANMU_MSG:4:0:2:2:2:0",
      kind: "DANMAKU",
      sourceEventId: "dm-123",
      eventKey: "DANMU_MSG:dm-123",
      occurredAt: "2026-04-16T04:00:00.123Z",
      actor: { uid: "1001", displayName: "完整昵称", medalName: "详细粉丝牌" },
      messageText: "hello danmaku"
    })
  })

  it("parses localized watched counts and like deltas", () => {
    expect(parseBilibiliDanmakuEvent(
      '{"cmd":"WATCHED_CHANGE","data":{"text_large":"1.2万"}}',
      "2026-08-29T12:00:00.000Z"
    )).toMatchObject({ kind: "METRICS", watchedCount: 12_000 })
    expect(parseBilibiliDanmakuEvent(
      '{"cmd":"LIKE_INFO_V3_UPDATE","data":{"click_count":120,"increment":7}}',
      "2026-08-29T12:00:00.000Z"
    )).toMatchObject({ kind: "METRICS", likeCount: 120, likeIncrement: 7 })
  })

  it("preserves the original gift and super chat metric semantics", () => {
    expect(parseBilibiliDanmakuEvent(JSON.stringify({
      cmd: "SEND_GIFT",
      data: {
        uid: 2001,
        uname: "送礼用户",
        giftId: 31036,
        giftName: "小花花",
        num: 3,
        coin_type: "gold",
        price: 1000,
        total_coin: 3000,
        tid: "gift-1"
      }
    }), "2026-08-29T12:00:00.000Z")).toMatchObject({
      kind: "GIFT",
      sourceEventId: "gift-1",
      actor: { uid: "2001", displayName: "送礼用户" },
      gift: {
        giftId: "31036",
        giftName: "小花花",
        quantity: 3,
        coinType: "gold",
        price: 1000,
        totalCoin: 3000,
        paid: true,
        amountMilliYuan: 3000
      },
      giftDelta: 1,
      amountMilliYuan: 3000
    })
    expect(parseBilibiliDanmakuEvent(JSON.stringify({
      cmd: "SUPER_CHAT_MESSAGE",
      data: { uid: 3001, message: "醒目留言内容", price: 30, user_info: { uname: "SC 用户" } }
    }), "2026-08-29T12:00:00.000Z")).toMatchObject({
      kind: "SUPER_CHAT",
      actor: { uid: "3001", displayName: "SC 用户" },
      superChatDelta: 1,
      amountMilliYuan: 30_000
    })
  })

  it("preserves original live boundaries and creates only a semantic weak guard id", () => {
    expect(parseBilibiliDanmakuEvent(JSON.stringify({
      cmd: "LIVE",
      live_key: "live-key-1",
      live_time: 1_776_312_000
    }), "2026-08-29T12:00:00.000Z")).toMatchObject({
      kind: "LIVE",
      sourceEventId: "live-key-1",
      liveKey: "live-key-1",
      liveStartedAt: "2026-04-16T04:00:00.000Z"
    })
    const guard = parseBilibiliDanmakuEvent(JSON.stringify({
      cmd: "GUARD_BUY",
      data: { uid: 3001, guard_level: 3, num: 1, price: 198000, start_time: 1_776_312_000 }
    }), "2026-08-29T12:00:00.000Z")
    expect(guard).toMatchObject({ kind: "GUARD_BUY", amountMilliYuan: 198000 })
    expect(guard?.sourceEventId).toMatch(/^semantic:[a-f0-9]{64}$/)
  })

  it("does not invent a sender UID from a nickname", () => {
    expect(parseBilibiliDanmakuEvent(
      '{"cmd":"DANMU_MSG","info":[[],"hello",[0,"游客"],[]]}',
      "2026-08-29T12:00:00.000Z"
    )).toMatchObject({ actor: { displayName: "游客" } })
    expect(parseBilibiliDanmakuEvent(
      '{"cmd":"DANMU_MSG","info":[[],"hello",[0,"游客"],[]]}',
      "2026-08-29T12:00:00.000Z"
    )?.actor?.uid).toBeUndefined()
  })
})
