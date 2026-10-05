import type { EventEmitter } from "node:events"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { giftEnvelope, giftItem } from "./__fixtures__/gift-v2"
import { syntheticHttps, danmakuHttpReply } from "./__fixtures__/synthetic-https"
import { startBilibiliDanmakuConnection, type BilibiliDanmakuConnectionEvent } from "./bilibili-danmaku-connection"

const transport = vi.hoisted(() => ({ sockets: [] as EventEmitter[], autoAuth: true, terminations: 0 }))
vi.mock("node:https", async () => ({ request: (await import("./__fixtures__/synthetic-https")).syntheticHttps.request }))

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
      if (transport.autoAuth && bytes.readUInt32BE(8) === 7) queueMicrotask(() => this.emit("message", packet(8, '{"code":0}')))
    }
    close(): void { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)) }
    terminate(): void { transport.terminations++; this.close() }
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
  beforeEach(() => {
    transport.autoAuth = true; transport.terminations = 0
    syntheticHttps.respond = async url => danmakuHttpReply(url); syntheticHttps.requests.length = 0
  })
  afterEach(() => { vi.unstubAllGlobals(); transport.sockets.length = 0 })

  it("does not start HTTP or a socket after cancellation", async () => {
    const input = { roomId: "33", signal: AbortSignal.abort() }
    let connection: Awaited<ReturnType<typeof startBilibiliDanmakuConnection>> | undefined
    const pending = startBilibiliDanmakuConnection(input, () => {}).then(value => { connection = value; return value }, error => error)
    try { expect(await pending).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" }) }
    finally { await connection?.stop() }
  })

  it("uses the configured User-Agent and the endpoint-specific Referer", async () => {
    const requests = syntheticHttps.requests
    const httpConfiguration = { connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture danmaku/2", referer: "https://live.bilibili.com/configured" }
    const input = { roomId: "33", httpConfiguration }
    const connection = await startBilibiliDanmakuConnection(input, () => {})
    try {
      expect(requests).toHaveLength(3)
      expect(requests.map(item => item.headers)).toEqual([
        expect.objectContaining({ "User-Agent": httpConfiguration.userAgent, Referer: "https://www.bilibili.com/" }),
        expect.objectContaining({ "User-Agent": httpConfiguration.userAgent, Referer: "https://www.bilibili.com/" }),
        expect.objectContaining({ "User-Agent": httpConfiguration.userAgent, Referer: httpConfiguration.referer })
      ])
    } finally { await connection.stop() }
  })

  it("dispatches all gifts through the actual socket consumer and survives a bad broadcast", async () => {
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

  it("cancels waiting getDanmuInfo without trying a WebSocket or anonymous fallback", async () => {
    const controller = new AbortController()
    syntheticHttps.respond = async () => new Promise(() => {})
    const pending = startBilibiliDanmakuConnection({ roomId: "33", signal: controller.signal,
      credential: { authUid: "7", cookieHeader: "SESSDATA=synthetic" } }, () => {}).catch(error => error)
    await vi.waitFor(() => expect(syntheticHttps.requests).toHaveLength(1))
    controller.abort()
    expect(await pending).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(syntheticHttps.requests[0]?.destroyed).toBe(true)
    expect(transport.sockets).toHaveLength(0)
  })

  it("cancels pending WebSocket authentication without trying the next protocol", async () => {
    transport.autoAuth = false
    const controller = new AbortController()
    const pending = startBilibiliDanmakuConnection({ roomId: "33", signal: controller.signal }, () => {}).catch(error => error)
    await vi.waitFor(() => expect(transport.sockets).toHaveLength(1))
    controller.abort()
    expect(await pending).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(transport.terminations).toBe(1)
    expect(transport.sockets).toHaveLength(1)
  })
})
