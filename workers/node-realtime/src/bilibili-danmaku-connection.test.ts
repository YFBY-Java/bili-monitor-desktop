import type { EventEmitter } from "node:events"

import { afterEach, describe, expect, it, vi } from "vitest"

import { giftEnvelope, giftItem } from "./__fixtures__/gift-v2"
import { startBilibiliDanmakuConnection, type BilibiliDanmakuConnectionEvent } from "./bilibili-danmaku-connection"

const transport = vi.hoisted(() => ({ sockets: [] as EventEmitter[] }))

// Only network I/O is replaced. Production authentication, packet decoding and dispatch run unchanged.
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events")
  return { default: class Socket extends EventEmitter {
    static OPEN = 1
    static CLOSED = 3
    readyState = 1
    constructor() {
      super()
      transport.sockets.push(this)
      queueMicrotask(() => this.emit("open"))
    }
    send(bytes: Buffer): void {
      if (bytes.readUInt32BE(8) === 7) queueMicrotask(() => this.emit("message", packet(8, '{"code":0}')))
    }
    close(): void { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)) }
  } }
})

function packet(operation: number, json: string): Buffer {
  const body = Buffer.from(json)
  const bytes = Buffer.alloc(16 + body.length)
  bytes.writeUInt32BE(bytes.length, 0)
  bytes.writeUInt16BE(16, 4)
  bytes.writeUInt16BE(1, 6)
  bytes.writeUInt32BE(operation, 8)
  bytes.writeUInt32BE(1, 12)
  body.copy(bytes, 16)
  return bytes
}

describe("gift batch transport", () => {
  afterEach(() => { vi.unstubAllGlobals(); transport.sockets.length = 0 })

  it("dispatches all gifts through the actual socket consumer and survives a bad broadcast", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      const address = String(url)
      const data = address.includes("/spi") ? { b_3: "test-buvid" }
        : address.includes("/nav") ? { wbi_img: {
          img_url: `https://example.test/${"a".repeat(32)}.png`,
          sub_url: `https://example.test/${"b".repeat(32)}.png`
        } } : { token: "test-token", host_list: [{ host: "example.test" }] }
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))
    const events: BilibiliDanmakuConnectionEvent[] = []
    const connection = await startBilibiliDanmakuConnection({ roomId: "33" }, event => events.push(event))
    try {
      const socket = transport.sockets[0]!
      socket.emit("message", packet(5, giftEnvelope([giftItem("a"), giftItem("b")])))
      socket.emit("message", packet(5, '{"cmd":"SEND_GIFT_V2","data":{"pb":"AA=="}}'))
      socket.emit("message", packet(5, giftEnvelope([giftItem("c")])))
      socket.emit("message", Buffer.from(giftEnvelope([giftItem("text-a"), giftItem("text-b")])), false)
      expect(events.filter(event => event.type === "command").map(event => event.event.sourceEventId))
        .toEqual(["a", "b", "c", "text-a", "text-b"])
    } finally { await connection.stop() }
  })
})
