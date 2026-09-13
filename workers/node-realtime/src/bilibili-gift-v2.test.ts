import { describe, expect, it } from "vitest"

import { bytesField, giftEnvelope, giftItem, giftReceivedAt, integerField, varint } from "./__fixtures__/gift-v2"
import { parseBilibiliDanmakuEvent, parseBilibiliDanmakuEvents } from "./bilibili-danmaku-event"

describe("original SEND_GIFT_V2 parity", () => {
  it("expands every batch gift with separate identity and payment", () => {
    const raw = giftEnvelope([giftItem("a", 2, "gold", 200), giftItem("b", 3, "silver", 300)])
    const events = parseBilibiliDanmakuEvents(raw, giftReceivedAt)
    expect(events.map(event => event.sourceEventId)).toEqual(["a", "b"])
    expect(events.map(event => event.amountMilliYuan)).toEqual([200, 0])
    expect(events.map(event => event.quantity)).toEqual([2, 3])
    expect(events.every(event => event.rawJson === raw)).toBe(true)
    expect(parseBilibiliDanmakuEvents(giftEnvelope([giftItem("ok"), giftItem("bad", 0)]), giftReceivedAt)).toEqual([])
  })

  it("decodes identity, gift, payment, source timestamp and retains original evidence", () => {
    const raw = giftEnvelope()
    expect(parseBilibiliDanmakuEvent(raw, giftReceivedAt)).toMatchObject({
      command: "SEND_GIFT_V2", kind: "GIFT", sourceEventId: "gift-1", eventKey: "SEND_GIFT:gift-1",
      actor: { uid: "166415666", displayName: "测试用户", medalName: "粉丝牌" },
      occurredAt: "2026-09-13T04:15:00.000Z", receivedAt: giftReceivedAt, rawJson: raw,
      gift: { giftId: "31036", giftName: "粉丝团灯牌", quantity: 1, paid: true, amountMilliYuan: 100 },
      amountMilliYuan: 100, giftDelta: 1
    })
  })

  it("preserves zero total and falls back to price only for a missing total", () => {
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem("zero", 2, "gold", 0)]), giftReceivedAt)?.amountMilliYuan).toBe(0)
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem("missing", 3, "gold", null)]), giftReceivedAt)?.amountMilliYuan).toBe(300)
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem("free", 3, "silver", 300)]), giftReceivedAt)?.amountMilliYuan).toBe(0)
  })

  it("uses the same transaction key as V1 and no strong key without transaction ids", () => {
    const legacy = parseBilibiliDanmakuEvent('{"cmd":"SEND_GIFT","data":{"tid":"gift-1","giftId":31036,"num":1}}', giftReceivedAt)
    const current = parseBilibiliDanmakuEvent(giftEnvelope(), giftReceivedAt)
    expect(current?.eventKey).toBe(legacy?.eventKey)
    const weak = parseBilibiliDanmakuEvent(giftEnvelope([giftItem("")]), giftReceivedAt)
    expect(weak?.kind).toBe("GIFT")
    expect(weak?.eventKey).toBeUndefined()
  })

  it("keeps long UID strings exact", () => {
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem()], 9007199254740993n), giftReceivedAt)?.actor?.uid).toBe("9007199254740993")
  })

  it("skips unknown protobuf fields and accepts command suffixes", () => {
    const item = Buffer.concat([giftItem(), integerField(123, 8), bytesField(124, "future"),
      varint(BigInt(125 * 8 + 1)), Buffer.alloc(8), varint(BigInt(126 * 8 + 5)), Buffer.alloc(4)])
    expect(parseBilibiliDanmakuEvent(giftEnvelope([item]).replace("SEND_GIFT_V2", "SEND_GIFT_V2:1"), giftReceivedAt))
      .toMatchObject({ command: "SEND_GIFT_V2:1", kind: "GIFT", eventKey: "SEND_GIFT:gift-1" })
  })

  it("rejects bad packets without inventing events and recovers on the next valid message", () => {
    for (const pb of ["?not-base64", "UgU=", "gICAgICAgICAgIA=", "AA==", "", "A".repeat(2_000_001)]) {
      expect(parseBilibiliDanmakuEvent(JSON.stringify({ cmd: "SEND_GIFT_V2", data: { pb } }), giftReceivedAt)).toBeUndefined()
    }
    expect(parseBilibiliDanmakuEvent(giftEnvelope([]), giftReceivedAt)).toBeUndefined()
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem("bad", 0)]), giftReceivedAt)).toBeUndefined()
    expect(parseBilibiliDanmakuEvent(giftEnvelope([giftItem("bad", 2147483648)]), giftReceivedAt)).toBeUndefined()
    expect(parseBilibiliDanmakuEvent(giftEnvelope([Buffer.concat([giftItem(), integerField(5, 9007199254740993n)])]), giftReceivedAt)).toBeUndefined()
    expect(parseBilibiliDanmakuEvent(giftEnvelope(), giftReceivedAt)?.kind).toBe("GIFT")
  })
})
