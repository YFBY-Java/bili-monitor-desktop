import { EventEmitter } from "node:events"
import { appendFileSync } from "node:fs"
import { resolve } from "node:path"
import { syntheticHttps, danmakuHttpReply } from "../../../../../workers/node-realtime/src/__fixtures__/synthetic-https"

// This module is injected only by the integration-test build, never the production build.
const directory = process.env.BMD_DATA_DIR!
syntheticHttps.respond = async (url, headers) => {
  appendFileSync(resolve(directory, "fixture-http.jsonl"), JSON.stringify({ path: url.pathname,
    userAgent: headers["User-Agent"], referer: headers.Referer }) + "\n")
  if (headers["User-Agent"] === "Fixture wait") return new Promise(() => {})
  return danmakuHttpReply(url)
}
export const request: typeof syntheticHttps.request = (url, options, callback) => {
  const req = syntheticHttps.request(url, options, callback), destroy = req.destroy
  req.destroy = () => {
    appendFileSync(resolve(directory, "fixture-cancelled.txt"), "cancelled\n")
    return destroy()
  }
  return req
}
export default class Socket extends EventEmitter {
  static OPEN = 1
  static CLOSED = 3
  readyState = 1
  constructor() { super(); queueMicrotask(() => this.emit("open")) }
  send(bytes: Buffer): void {
    if (bytes.readUInt32BE(8) !== 7) return
    const body = Buffer.from('{"code":0}'), packet = Buffer.alloc(16 + body.length)
    packet.writeUInt32BE(packet.length, 0); packet.writeUInt16BE(16, 4); packet.writeUInt16BE(1, 6)
    packet.writeUInt32BE(8, 8); packet.writeUInt32BE(1, 12); body.copy(packet, 16)
    queueMicrotask(() => this.emit("message", packet))
  }
  close(): void { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)) }
  terminate(): void { this.close() }
}
