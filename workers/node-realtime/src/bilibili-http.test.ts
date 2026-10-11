import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib"
import { BilibiliLiveHttpConfigurationSchema } from "@bmd/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getBilibiliJson } from "./bilibili-http"

const network = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("node:https", () => ({ request: network.request }))

describe("Bilibili HTTPS phase deadlines", () => {
  const configuration = BilibiliLiveHttpConfigurationSchema.parse({ connectTimeoutMs: 100, readTimeoutMs: 150 })
  const url = "https://api.bilibili.com/x/frontend/finger/spi"
  let socket: EventEmitter, response: PassThrough & { statusCode: number; headers: Record<string, string> }
  let request: EventEmitter & { end: () => void; destroy: ReturnType<typeof vi.fn> }
  let reply: () => void
  beforeEach(() => {
    vi.useFakeTimers()
    socket = new EventEmitter()
    response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
    request = Object.assign(new EventEmitter(), { end: () => { request.emit("socket", socket) },
      destroy: vi.fn(() => { response.destroy(); return request }) })
    network.request.mockImplementation((_url, _options, callback) => { reply = () => callback(response); return request })
  })
  afterEach(() => { vi.useRealTimers(); network.request.mockReset(); response.destroy() })
  function begin(overrides = {}, signal?: AbortSignal) {
    return getBilibiliJson(url, { configuration: { ...configuration, ...overrides },
      headers: { Cookie: "synthetic-cookie" }, ...(signal ? { signal } : {}) })
  }
  it("destroys a stalled connection at the configured connect deadline", async () => {
    const pending = begin().catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_CONNECT_TIMEOUT" })
    expect(request.destroy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("does not count connect time against the first read deadline", async () => {
    let settled = false
    const pending = begin().finally(() => { settled = true })
    await vi.advanceTimersByTimeAsync(90)
    socket.emit("secureConnect")
    await vi.advanceTimersByTimeAsync(140)
    expect(settled).toBe(false)
    reply(); response.end('{"code":0}')
    expect(await (await pending).json()).toEqual({ code: 0 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it("times out a connected peer which sends no headers", async () => {
    const pending = begin().catch(error => error)
    socket.emit("secureConnect")
    await vi.advanceTimersByTimeAsync(150)
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_READ_TIMEOUT" })
    expect(request.destroy).toHaveBeenCalled()
  })
  it("renews the read idle window on incoming data instead of imposing a total duration", async () => {
    const pending = begin()
    socket.emit("secureConnect"); reply()
    for (const piece of ['{"code":', '0, "data":', '{}', '}']) {
      await vi.advanceTimersByTimeAsync(140)
      socket.emit("data", Buffer.from(piece)); response.write(piece)
    }
    response.end()
    expect(await (await pending).json()).toEqual({ code: 0, data: {} })
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([false, true])("allows zero timeout but remains cancellable (connected=%s)", async connected => {
    const controller = new AbortController()
    let settled = false
    const pending = begin({ connectTimeoutMs: 0, readTimeoutMs: 0 }, controller.signal)
      .then(value => { settled = true; return value }, error => { settled = true; return error })
    if (connected) { socket.emit("secureConnect"); reply(); response.write('{"data":') }
    await vi.advanceTimersByTimeAsync(300_000)
    expect(settled).toBe(false)
    controller.abort()
    expect(await pending).toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(request.destroy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("rejects an already aborted operation before opening a socket", async () => {
    await expect(begin({}, AbortSignal.abort())).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CANCELLED" })
    expect(network.request).not.toHaveBeenCalled()
  })
  it.each(["gzip", "deflate", "br"] as const)("decodes %s JSON", async encoding => {
    const pending = begin(); socket.emit("secureConnect")
    response.headers["content-encoding"] = encoding
    const compress = encoding === "gzip" ? gzipSync : encoding === "deflate" ? deflateSync : brotliCompressSync
    reply(); response.end(compress('{"data":"合成数据"}'))
    expect(await (await pending).json()).toEqual({ data: "合成数据" })
  })
  it("bounds decompressed bodies and sanitizes compression errors", async () => {
    const pending = begin().catch(error => error); socket.emit("secureConnect")
    response.headers["content-encoding"] = "gzip"
    reply(); response.end(gzipSync(Buffer.alloc(8 * 1024 * 1024 + 1)))
    expect(await pending).toMatchObject({ code: "BILIBILI_PARSE_ERROR", message: "Bilibili HTTP response could not be decoded." })
  })
  it.each([false, true])("follows bounded API redirects with origin-scoped cookies (cross-origin=%s)", async crossOrigin => {
    const outgoing: Array<Record<string, string>> = []
    network.request.mockImplementation((_url, options, callback) => {
      outgoing.push(options.headers)
      const nextSocket = new EventEmitter()
      const incoming = Object.assign(new PassThrough(), { statusCode: outgoing.length === 1 ? 302 : 200,
        headers: outgoing.length === 1 ? { location: crossOrigin ? "https://api.live.bilibili.com/fixture" : "/fixture" } : {} })
      const nextRequest = Object.assign(new EventEmitter(), { destroy: () => nextRequest,
        end: () => {
          nextRequest.emit("socket", nextSocket); nextSocket.emit("secureConnect")
          callback(incoming); incoming.end(outgoing.length === 1 ? "" : '{"code":0}')
        } })
      return nextRequest
    })
    expect(await (await begin()).json()).toEqual({ code: 0 })
    expect(outgoing).toHaveLength(2)
    expect(outgoing[1]?.Cookie).toBe(crossOrigin ? undefined : "synthetic-cookie")
    expect(vi.getTimerCount()).toBe(0)
  })
  it("does not expose URLs or credentials in network errors", async () => {
    const pending = begin().catch(error => error)
    request.emit("error", new Error("synthetic-cookie https://private.test/token"))
    expect(await pending).toMatchObject({ code: "BILIBILI_NETWORK_ERROR", message: "Bilibili HTTP request failed." })
  })
  it("times out partial response bodies and releases the body stream", async () => {
    const pending = begin().catch(error => error)
    socket.emit("secureConnect"); reply(); response.write('{"data":')
    await vi.advanceTimersByTimeAsync(150)
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_READ_TIMEOUT" })
    expect(response.destroyed).toBe(true)
  })
  it("bounds response memory", async () => {
    const pending = begin().catch(error => error)
    socket.emit("secureConnect"); reply(); response.end(Buffer.alloc(8 * 1024 * 1024 + 1))
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_RESPONSE_TOO_LARGE" })
  })
  it("does not include malformed JSON bodies in parse errors", async () => {
    const pending = begin(); socket.emit("secureConnect"); reply(); response.end("synthetic-secret-not-json")
    await expect((await pending).json()).rejects.toMatchObject({ code: "BILIBILI_PARSE_ERROR",
      message: "Bilibili HTTP response is not valid JSON." })
  })
  it("keeps balanced hexadecimal quality on original String responses", async () => {
    const pending = getBilibiliJson(url, { configuration, headers: {}, responseText: "spring-string" })
    socket.emit("secureConnect")
    response.headers["content-type"] = `text/plain;q="0x1${"0".repeat(256)}p-1024"`
    reply(); response.end(Buffer.from('{"data":"café"}', "latin1"))
    expect(await (await pending).json()).toEqual({ data: "café" })
  })
  it("keeps fetch-compatible UTF-8 BOM handling", async () => {
    const pending = begin(); socket.emit("secureConnect"); reply(); response.end('\uFEFF{"code":0}')
    expect(await (await pending).json()).toEqual({ code: 0 })
  })
  it("sanitizes invalid redirect addresses", async () => {
    const pending = begin().catch(error => error); socket.emit("secureConnect")
    response.statusCode = 302; response.headers.location = "https://[synthetic-secret"
    reply(); response.end()
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_REDIRECT_REJECTED", message: "Bilibili HTTP destination rejected." })
  })
  it("rejects a redirect outside the fixed API hosts without forwarding credentials", async () => {
    const pending = begin().catch(error => error); socket.emit("secureConnect")
    response.statusCode = 302; response.headers.location = "https://private.test/"
    reply(); response.end()
    expect(await pending).toMatchObject({ code: "BILIBILI_HTTP_REDIRECT_REJECTED" })
    expect(network.request).toHaveBeenCalledTimes(1)
  })
})
