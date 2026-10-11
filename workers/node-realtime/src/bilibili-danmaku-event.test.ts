import { describe, expect, it } from "vitest"

import { parseBilibiliDanmakuEvent } from "./bilibili-danmaku-event"

describe("Bilibili danmaku event parser", () => {
  it.each([
    ['"  正文 \\t "', "  正文 \t "], ['""', ""], ['"\\u001c\\u2000"', "\u001c\u2000"],
    ['"\\u00a0\\u2007\\u202f\\ufeff"', "\u00a0\u2007\u202f\ufeff"],
    ["true", "true"], ["false", "false"], ["null", ""], ["[]", ""], ['{"1":123}', ""],
    ["1", "1"], ["-0", "0"], ["9007199254740991", "9007199254740991"],
    ["9007199254740993", "9007199254740993"], ["-9007199254740993", "-9007199254740993"],
    ["9223372036854775807", "9223372036854775807"], ["-9223372036854775808", "-9223372036854775808"],
    ["9223372036854775808", "9223372036854775808"], ["-9223372036854775809", "-9223372036854775809"],
    ["1234567890123456789012345678901234567890", "1234567890123456789012345678901234567890"],
    ["1.0", "1.0"], ["1e0", "1.0"], ["-0.0", "-0.0"], ["-0e12", "-0.0"],
    ["1e7", "1.0E7"], ["9999999.0", "9999999.0"], ["1e-3", "0.001"], ["1e-4", "1.0E-4"],
    ["1e23", "1.0E23"], ["1.2345678901234567", "1.2345678901234567"],
    ["1000000000000000100.0", "1.0000000000000001E18"],
    ["5e-324", "4.9E-324"], ["1e-323", "9.9E-324"], ["-1e-323", "-9.9E-324"],
    ["1.5e-323", "1.5E-323"], ["2e-323", "2.0E-323"], ["1e-322", "9.9E-323"],
    ["2.2250738585072014e-308", "2.2250738585072014E-308"],
    ["2.225073858507201e-308", "2.225073858507201E-308"],
    ["1.7976931348623157e308", "1.7976931348623157E308"],
    ["1e309", "Infinity"], ["-1e309", "-Infinity"], ["1e-400", "0.0"], ["-1e-400", "-0.0"]
  ])("preserves Jackson scalar body %s as %s from raw JSON", (token, expected) => {
    const raw = `{"cmd":"DANMU_MSG:4","info":[[0,0,0,0,1776312000123],${token},[1001," 名称 "],[0," 勋章 "]]}`
    const event = parseBilibiliDanmakuEvent(raw, "2026-08-29T12:10:00.000Z")
    expect(event).toMatchObject({ command: "DANMU_MSG:4", kind: "DANMAKU", messageText: expected,
      actor: { uid: "1001", displayName: "名称", medalName: "勋章" },
      occurredAt: "2026-04-16T04:00:00.123Z", receivedAt: "2026-08-29T12:10:00.000Z", rawJson: raw })
  })

  it.each([
    '{"cmd":"DANMU_MSG"}', '{"cmd":"DANMU_MSG","info":[]}',
    '{"cmd":"DANMU_MSG","info":{"1":123}}', '{"cmd":"DANMU_MSG","info":true}'
  ])("uses missing array path semantics: %s", raw => {
    expect(parseBilibiliDanmakuEvent(raw, "2026-08-29T12:00:00.000Z")?.messageText).toBe("")
  })

  it.each([
    ['"info":[[],1.0],"info":[[],9223372036854775807]', "9223372036854775807"],
    ['"info":[[],9223372036854775807],"info":[[],1.0]', "1.0"],
    ['"info":[[],9223372036854775807],"info":[[],"  final  "]', "  final  "],
    ['"info":[[],1.0],"info":{"1":9223372036854775807}', ""],
    ['"decoy":{"info":[[],123]},"in\\u0066o":[[],9223372036854775807],"nested":{"1":1.0}', "9223372036854775807"]
  ])("takes scalar lexeme only from the final root info array: %s", (properties, expected) => {
    expect(parseBilibiliDanmakuEvent(`{"cmd":"DANMU_MSG",${properties}}`, "2026-08-29T12:00:00.000Z")?.messageText).toBe(expected)
  })

  it("keeps ignored numeric info, scalar names and metrics unchanged on unrelated commands", () => {
    const raw = '{"cmd":"WATCHED_CHANGE","info":[[],9223372036854775807],"data":{"num":12.7}}'
    expect(parseBilibiliDanmakuEvent(raw, "2026-08-29T12:00:00.000Z"))
      .toMatchObject({ kind: "METRICS", watchedCount: 13, rawJson: raw })
    expect(parseBilibiliDanmakuEvent(raw, "2026-08-29T12:00:00.000Z")?.messageText).toBeUndefined()
    expect(parseBilibiliDanmakuEvent('{"cmd":"SUPER_CHAT_MESSAGE","info":[[],1e-323],"data":{"message":"  SC  ","price":1.4}}',
      "2026-08-29T12:00:00.000Z")).toMatchObject({ messageText: "SC", amountMilliYuan: 1000 })
  })

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
