import { brotliCompressSync, deflateSync } from "node:zlib"

import { describe, expect, it } from "vitest"

import {
  BILIBILI_DANMAKU_OPERATION,
  buildBilibiliDanmakuAuthPacket,
  parseBilibiliDanmakuPackets
} from "./bilibili-danmaku-packet"

function packet(operation: number, protocolVersion: number, body: Buffer): Buffer {
  const result = Buffer.alloc(16 + body.length)
  result.writeUInt32BE(result.length, 0)
  result.writeUInt16BE(16, 4)
  result.writeUInt16BE(protocolVersion, 6)
  result.writeUInt32BE(operation, 8)
  result.writeUInt32BE(1, 12)
  body.copy(result, 16)
  return result
}

describe("Bilibili danmaku packet codec", () => {
  it("builds the original authenticated WebSocket body", () => {
    const auth = buildBilibiliDanmakuAuthPacket({
      roomId: "7734200",
      uid: "123456789",
      token: "token-value",
      buvid: "buvid-value",
      clientVersion: " version ",
      protocolVersion: 3
    })
    expect(auth.readUInt16BE(4)).toBe(16)
    expect(auth.readUInt16BE(6)).toBe(1)
    expect(auth.readUInt32BE(8)).toBe(BILIBILI_DANMAKU_OPERATION.AUTH)
    expect(JSON.parse(auth.subarray(16).toString("utf8"))).toMatchObject({
      uid: 123456789,
      roomid: 7734200,
      protover: 3,
      key: "token-value",
      buvid: "buvid-value",
      clientver: " version "
    })
    const body = (clientVersion: string | null) => JSON.parse(buildBilibiliDanmakuAuthPacket({
      roomId: "33", token: "synthetic", protocolVersion: 2, clientVersion }).subarray(16).toString())
    expect(body("\u001c\u3000").clientver).toBe("1.14.3")
    expect(body("").clientver).toBe("1.14.3")
    expect(body(null).clientver).toBe("1.14.3")
    expect(body("\u00a0\ufeff").clientver).toBe("\u00a0\ufeff")
  })

  it.each([
    [2, (body: Buffer) => deflateSync(body)],
    [3, (body: Buffer) => brotliCompressSync(body)]
  ])("parses nested protocol %i command packets", (protocolVersion, compress) => {
    const inner = packet(5, 0, Buffer.from('{"cmd":"WATCHED_CHANGE","data":{"num":12}}'))
    const outer = packet(5, protocolVersion, compress(inner))
    expect(parseBilibiliDanmakuPackets(outer)).toMatchObject([{
      operation: 5,
      bodyText: '{"cmd":"WATCHED_CHANGE","data":{"num":12}}'
    }])
  })

  it("parses heartbeat popularity as an unsigned integer", () => {
    const popularity = Buffer.alloc(4)
    popularity.writeUInt32BE(4_000_000_000)
    expect(parseBilibiliDanmakuPackets(packet(3, 1, popularity))).toMatchObject([{
      operation: 3,
      popularity: 4_000_000_000
    }])
  })
})
