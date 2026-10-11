import { describe, expect, it } from "vitest"

import { giftEnvelope, giftItem, giftReceivedAt } from "../../../workers/node-realtime/src/__fixtures__/gift-v2"
import { parseBilibiliDanmakuEvents } from "../../../workers/node-realtime/src/bilibili-danmaku-event"
import { createLiveSessionFixture } from "./__fixtures__/live-session"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"

describe("gift V2 parser to SQLite facts", () => {
  it("persists the complete batch, deduplicates V1/V2 transactions and preserves weak receipts", async () => {
    const fixture = await createLiveSessionFixture()
    const { service, room, transportId, start } = fixture
    let receive: ((event: unknown) => void) | undefined
    const source = new BilibiliLiveDanmakuWorkerSource({
      subscribe: (_id, listener) => { receive = listener; return () => { receive = undefined } },
      request: async () => ({ connectHost: "wss://example.test", protocolVersion: 3, authMode: "ANONYMOUS", status: "CONNECTED", attempt: 1 }),
      stop: async () => undefined
    })
    try {
      const session = service.reconcileRest(room, { liveStatus: 1, liveTime: start, title: room.title, fetchedAt: start })!
      let ordinal = 0
      const results: boolean[] = []
      await source.start({ connectionId: transportId, roomId: room.roomId }, message => {
        if (message.type === "command") results.push(service.ingest(room, transportId, ++ordinal, 3, message.event))
      })
      const ingest = (json: string) => {
        const offset = results.length
        for (const event of parseBilibiliDanmakuEvents(json, giftReceivedAt)) {
          receive?.(JSON.parse(JSON.stringify({ type: "command", receivedAt: giftReceivedAt, event })))
        }
        return results.slice(offset)
      }
      const batch = giftEnvelope([giftItem("a", 2, "gold", 200), giftItem("b", 3, "silver", 300)])
      expect(ingest(batch)).toEqual([true, true])
      expect(ingest(batch)).toEqual([false, false])
      expect(ingest('{"cmd":"SEND_GIFT","data":{"tid":"a","giftId":31036,"num":2,"timestamp":1789272900}}')).toEqual([false])
      expect(ingest(giftEnvelope([giftItem(""), giftItem("")]))).toEqual([true, true])
      expect(service.events({ sessionId: session.sessionId, kind: "GIFT" }).total).toBe(4)
      expect(service.get(session.sessionId)).toMatchObject({ giftCount: 7, paidAmountMilliYuan: 400, giftSenderCount: 1 })
      expect(service.users({ sessionId: session.sessionId })).toMatchObject([
        { userUid: "166415666", giftCount: 7, paidAmountMilliYuan: 400 }
      ])
      expect(fixture.database.findAllBilibiliLiveSessionEvents(session.sessionId).map(event => event.eventKey))
        .toEqual(expect.arrayContaining(["SEND_GIFT:a", "SEND_GIFT:b", `receipt:${transportId}:6`, `receipt:${transportId}:7`]))
    } finally { await source.stopAll(); await fixture.close() }
  })
})
