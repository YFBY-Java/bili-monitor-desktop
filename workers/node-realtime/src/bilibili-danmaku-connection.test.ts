import type { EventEmitter } from "node:events"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BilibiliLiveHttpConfigurationSchema } from "@bmd/contracts"

import { giftEnvelope, giftItem } from "./__fixtures__/gift-v2"
import { syntheticHttps, danmakuHttpReply } from "./__fixtures__/synthetic-https"
import { startBilibiliDanmakuConnection, type BilibiliDanmakuConnectionEvent } from "./bilibili-danmaku-connection"

const transport = vi.hoisted(() => ({ sockets: [] as EventEmitter[], autoAuth: true, terminations: 0,
  authPackets: [] as Buffer[], rejectAuth: false, failHandshake: false, handshakeTimeouts: [] as number[] }))
vi.mock("node:https", async () => ({ request: (await import("./__fixtures__/synthetic-https")).syntheticHttps.request }))

// Only network I/O is replaced. Production authentication, packet decoding and dispatch run unchanged.
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events")
  return { default: class Socket extends EventEmitter {
    static OPEN = 1
    static CLOSED = 3
    readyState = 1
    constructor(_url: string, options: { handshakeTimeout: number }) {
      super()
      transport.handshakeTimeouts.push(options.handshakeTimeout)
      transport.sockets.push(this)
      queueMicrotask(() => transport.failHandshake ? this.emit("error", new Error("synthetic handshake failure")) : this.emit("open"))
    }
    send(bytes: Buffer, callback?: (error?: Error) => void): void {
      if (bytes.readUInt32BE(8) === 7) {
        transport.authPackets.push(bytes)
        if (transport.autoAuth) queueMicrotask(() => this.emit("message", packet(8, transport.rejectAuth ? '{"code":-1}' : '{"code":0}')))
      }
      callback?.()
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
    transport.autoAuth = true; transport.terminations = 0; transport.rejectAuth = false; transport.failHandshake = false; transport.authPackets.length = 0
    transport.handshakeTimeouts.length = 0
    syntheticHttps.respond = async url => danmakuHttpReply(url); syntheticHttps.requests.length = 0
  })
  afterEach(() => { vi.unstubAllGlobals(); transport.sockets.length = 0 })

  it("shares anonymous materials through serialized race, failure and individual force refresh", async () => {
    vi.resetModules()
    const { startBilibiliDanmakuConnection: start } = await import("./bilibili-danmaku-connection")
    let releaseSpi!: (response: Response) => void, releaseNav!: (response: Response) => void
    const spi = new Promise<Response>(resolve => { releaseSpi = resolve })
    const nav = new Promise<Response>(resolve => { releaseNav = resolve })
    const spiUrl = new URL("https://api.bilibili.com/x/frontend/finger/spi")
    const navUrl = new URL("https://api.bilibili.com/x/web-interface/nav")
    const paths = () => syntheticHttps.requests.map(request => request.url.pathname.split("/").at(-1))
    syntheticHttps.respond = async url => url.pathname.endsWith("/spi") ? spi : url.pathname.endsWith("/nav") ? nav : danmakuHttpReply(url)
    const pending = [start({ roomId: "33" }, () => {}), start({ roomId: "34" }, () => {})]
    const results = Promise.allSettled(pending)
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(paths()).toEqual(["spi"])
      releaseSpi(danmakuHttpReply(spiUrl))
      await vi.waitFor(() => expect(paths()).toEqual(["spi", "nav"]))
      releaseNav(danmakuHttpReply(navUrl))
      expect((await results).every(result => result.status === "fulfilled")).toBe(true)
      const { bilibiliAnonymousMaterialProvider: materials } = await import("./bilibili-anonymous-material-provider")
      const configuration = BilibiliLiveHttpConfigurationSchema.parse({ readTimeoutMs: 0 })
      expect(await materials.getWbiKeys(false, configuration, 300)).toEqual({ imgKey: "a".repeat(32), subKey: "b".repeat(32) })
      expect(paths()).toEqual(["spi", "nav", "getDanmuInfo", "getDanmuInfo"])

      materials.clear()
      syntheticHttps.requests.length = 0
      let releaseFailure!: (response: Response) => void
      const failure = new Promise<Response>(resolve => { releaseFailure = resolve })
      let navCalls = 0
      syntheticHttps.respond = async url => {
        if (!url.pathname.endsWith("/nav")) return danmakuHttpReply(url)
        if (++navCalls === 1) return failure
        return new Response(JSON.stringify({ code: -101, data: { wbi_img: {
          img_url: `https://example.test/${"c".repeat(32)}.png`, sub_url: `https://example.test/${"d".repeat(32)}.png`
        } } }))
      }
      const retried = Promise.allSettled([materials.getWbiKeys(false, configuration, 300), materials.getWbiKeys(false, configuration, 300)])
      await vi.waitFor(() => expect(navCalls).toBe(1))
      expect(await materials.getBuvid(configuration, 300)).toMatchObject({ buvid3: "test-buvid" })
      releaseFailure(new Response(JSON.stringify({ code: -352, data: { wbi_img: {
        img_url: `https://example.test/${"x".repeat(32)}.png`, sub_url: `https://example.test/${"y".repeat(32)}.png`
      } } })))
      expect(await retried).toMatchObject([
        { status: "rejected", reason: { code: "BILIBILI_UNKNOWN_ERROR", retryable: true,
          endpoint: "x/web-interface/nav", statusCode: 200, biliCode: -352,
          message: "Bilibili nav API returned code -352" } },
        { status: "fulfilled", value: { imgKey: "c".repeat(32), subKey: "d".repeat(32) } }
      ])
      expect(navCalls).toBe(2)

      let releaseForce!: (response: Response) => void
      const forceFailure = new Promise<Response>(resolve => { releaseForce = resolve })
      navCalls = 0
      syntheticHttps.respond = async url => {
        if (!url.pathname.endsWith("/nav")) return danmakuHttpReply(url)
        if (++navCalls === 1) return forceFailure
        return new Response(JSON.stringify({ code: 0, data: { wbi_img: {
          img_url: `https://example.test/${String(navCalls).repeat(32)}.png`, sub_url: `https://example.test/${"d".repeat(32)}.png`
        } } }))
      }
      const forced = Promise.allSettled([materials.getWbiKeys(true, configuration, 300),
        materials.getWbiKeys(true, configuration, 300), materials.getWbiKeys(true, configuration, 300)])
      await vi.waitFor(() => expect(navCalls).toBe(1))
      expect(await materials.getWbiKeys(false, configuration, 300)).toMatchObject({ imgKey: "c".repeat(32) })
      releaseForce(new Response("{}", { status: 503 }))
      expect(await forced).toMatchObject([
        { status: "rejected", reason: { code: "BILIBILI_UNKNOWN_ERROR", retryable: true, statusCode: 503,
          message: "Bilibili WBI key request failed with HTTP 503" } },
        { status: "fulfilled", value: { imgKey: "2".repeat(32) } },
        { status: "fulfilled", value: { imgKey: "3".repeat(32) } }
      ])
      expect(await materials.getWbiKeys(false, configuration, 300)).toMatchObject({ imgKey: "3".repeat(32) })
      expect(navCalls).toBe(3)
    } finally {
      releaseSpi(danmakuHttpReply(spiUrl)); releaseNav(danmakuHttpReply(navUrl))
      for (const result of await results) if (result.status === "fulfilled") await result.value.stop()
    }
  })

  it("keeps String materials through failures and actual AUTH without anonymous fallback", async () => {
    vi.resetModules()
    const { BilibiliAnonymousMaterialProvider } = await import("./bilibili-anonymous-material-provider")
    const { startBilibiliDanmakuConnection: start } = await import("./bilibili-danmaku-connection")
    const materials = new BilibiliAnonymousMaterialProvider()
    const configuration = BilibiliLiveHttpConfigurationSchema.parse({ readTimeoutMs: 0 })
    let spiReply = new Response("synthetic private body", { status: 503,
      headers: { "Content-Type": "application/json; charset=not-a-real-charset" } })
    let infoReply = new Response("synthetic private body", { status: 503,
      headers: { "Content-Type": "application/json; charset=not-a-real-charset" } })
    syntheticHttps.respond = async url => url.pathname.endsWith("/spi") ? spiReply
      : url.pathname.endsWith("getDanmuInfo") ? infoReply : danmakuHttpReply(url)
    await expect(materials.getBuvid(configuration, 300)).rejects.toMatchObject({
      code: "BILIBILI_RESPONSE_CONVERSION_ERROR", retryable: false,
      message: "Unable to convert Bilibili response content type or charset." })
    spiReply = new Response("{}", { status: 403 })
    await expect(materials.getBuvid(configuration, 300)).rejects.toMatchObject({
      code: "BILIBILI_UNKNOWN_ERROR", retryable: true, statusCode: 403,
      endpoint: "x/frontend/finger/spi", message: "Bilibili buvid request failed with HTTP 403" })
    spiReply = new Response(JSON.stringify({ code: "65530", message: "ignored original SPI message" }))
    await expect(materials.getBuvid(configuration, 300)).rejects.toMatchObject({
      code: "BILIBILI_UNKNOWN_ERROR", retryable: true, statusCode: 200, biliCode: 65530,
      endpoint: "x/frontend/finger/spi", message: "Bilibili buvid API returned code 65530" })
    spiReply = new Response(Uint8Array.from(Buffer.from(JSON.stringify({ code: "+0",
      data: { b_3: " café-device ", b_4: false } }), "latin1")))
    const buvid = await materials.getBuvid(configuration, 300)
    expect(buvid).toEqual({ buvid3: " café-device ", buvid4: "false" })

    const events: BilibiliDanmakuConnectionEvent[] = []
    const input = { roomId: "33", protocolVersion: 2,
      credential: { authUid: "7", cookieHeader: "SESSDATA=synthetic-login" } }
    const connect = () => start(input, event => events.push(event), { materials })
    await expect(connect()).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONNECT_FAILED",
      message: "Unable to convert Bilibili response content type or charset." })
    expect(transport.sockets).toHaveLength(0)
    infoReply = new Response("{}", { status: 403 })
    await expect(connect()).rejects.toMatchObject({ message: "Bilibili getDanmuInfo failed with HTTP 403" })
    infoReply = new Response("{}", { status: 429 })
    await expect(connect()).rejects.toMatchObject({ message: "Bilibili getDanmuInfo failed with HTTP 429" })
    expect(events.filter(event => event.type === "attempt-failed").map(event => event.code))
      .toEqual(["BILIBILI_RESPONSE_CONVERSION_ERROR", "BILIBILI_UNKNOWN_ERROR", "BILIBILI_RATE_LIMITED"])
    expect(await materials.getBuvid(configuration, 300)).toBe(buvid)
    infoReply = new Response(JSON.stringify({ code: "60009", message: " original info error " }))
    await expect(connect()).rejects.toMatchObject({ message: " original info error " })
    expect(events.at(-1)).toMatchObject({ type: "attempt-failed", code: "BILIBILI_UNKNOWN_ERROR" })
    infoReply = new Response(JSON.stringify({ code: "60009", message: "" }))
    await expect(connect()).rejects.toMatchObject({ message: "" })
    expect(events.at(-1)).toMatchObject({ type: "attempt-failed", code: "BILIBILI_UNKNOWN_ERROR", message: "" })
    infoReply = new Response(Uint8Array.from(Buffer.from(JSON.stringify({ code: false,
      data: { token: " café-token ", host_list: [{ host: "example.test" }] } }), "latin1")),
      { headers: { "Content-Type": "text/plain" } })
    const connection = await connect()
    try {
      expect(connection).toMatchObject({ status: "AUTHENTICATING", authMode: "LOGIN", authUid: "7" })
      expect(JSON.parse(transport.authPackets[0]!.subarray(16).toString()))
        .toMatchObject({ key: " café-token ", buvid: " café-device ", uid: 7, protover: 2 })
      const infoRequests = syntheticHttps.requests.filter(request => request.url.pathname.endsWith("getDanmuInfo"))
      expect(infoRequests).toHaveLength(6)
      expect(infoRequests.every(request => request.headers.Cookie ===
        "SESSDATA=synthetic-login; buvid3= café-device ; buvid4=false")).toBe(true)
      expect(syntheticHttps.requests.filter(request => request.url.pathname.endsWith("/spi"))).toHaveLength(4)
      expect(syntheticHttps.requests.filter(request => request.url.pathname.endsWith("/nav"))).toHaveLength(1)
      expect(syntheticHttps.requests.filter(request => !request.url.pathname.endsWith("getDanmuInfo"))
        .every(request => !request.headers.Cookie)).toBe(true)
    } finally { await connection.stop() }
    const retryMaterials = new BilibiliAnonymousMaterialProvider()
    let spiCalls = 0, navCalls = 0, credentialReads = 0
    syntheticHttps.requests.length = 0
    syntheticHttps.respond = async url => {
      if (url.pathname.endsWith("/spi") && ++spiCalls === 1) return new Response('{"code":65530}')
      if (url.pathname.endsWith("/nav") && ++navCalls === 1) return new Response('{"code":-352}')
      return danmakuHttpReply(url)
    }
    const retried = await start(input, () => {}, { materials: retryMaterials,
      credentialProvider: async () => { credentialReads++; return input.credential } })
    try {
      expect(retried).toMatchObject({ authMode: "LOGIN", authUid: "7", attempt: 1 })
      expect([spiCalls, navCalls, credentialReads]).toEqual([3, 2, 2])
      const infoRequests = syntheticHttps.requests.filter(request => request.url.pathname.endsWith("getDanmuInfo"))
      expect(infoRequests).toHaveLength(1)
      expect(infoRequests[0]?.headers.Cookie).toBe("SESSDATA=synthetic-login; buvid3=test-buvid; buvid4=test-buvid4")
    } finally { await retried.stop() }
  })

  it("rereads credentials for A login, anonymous risk, B login and the next protocol candidate", async () => {
    vi.resetModules()
    const { startBilibiliDanmakuConnection: start } = await import("./bilibili-danmaku-connection")
    const credentials = [
      { authUid: "7", cookieHeader: "SESSDATA=A; buvid3=login-a" },
      { authUid: "8", cookieHeader: "SESSDATA=B" },
      { authUid: "9", cookieHeader: "SESSDATA=C" }
    ]
    let credentialReads = 0, danmuCalls = 0
    transport.failHandshake = true
    syntheticHttps.respond = async url => {
      if (!url.pathname.endsWith("getDanmuInfo")) return danmakuHttpReply(url)
      const code = [-101, -352, -403, 0, 0][danmuCalls++]
      return code === 0 ? danmakuHttpReply(url) : new Response(JSON.stringify({ code, message: "synthetic fallback" }))
    }
    const events: BilibiliDanmakuConnectionEvent[] = []
    const connection = await start({ roomId: "33", preferredProtocolVersion: 2,
      credential: { authUid: "1", cookieHeader: "SESSDATA=old-snapshot" } }, event => events.push(event), {
      credentialProvider: async () => {
        const credential = credentials[credentialReads++]
        if (credentialReads === 3) transport.failHandshake = false
        return credential
      }
    })
    try {
      expect(credentialReads).toBe(3)
      expect(connection).toMatchObject({ protocolVersion: 3, authMode: "LOGIN", authUid: "9" })
      expect(events.filter(event => event.type === "connecting")).toMatchObject([
        { protocolVersion: 2, authMode: "ANONYMOUS" }, { protocolVersion: 3, authMode: "LOGIN", authUid: "9" }
      ])
      const requests = syntheticHttps.requests
      expect(requests.map(request => request.url.pathname.split("/").at(-1))).toEqual([
        "spi", "nav", "getDanmuInfo", "nav", "getDanmuInfo", "spi", "nav", "getDanmuInfo",
        "spi", "nav", "getDanmuInfo", "getDanmuInfo"
      ])
      expect(requests.filter(request => request.url.pathname.endsWith("getDanmuInfo")).map(request => request.headers.Cookie)).toEqual([
        "SESSDATA=A; buvid3=login-a; buvid3=test-buvid; buvid4=test-buvid4",
        "buvid3=test-buvid; buvid4=test-buvid4", "SESSDATA=B; buvid3=test-buvid; buvid4=test-buvid4",
        "buvid3=test-buvid; buvid4=test-buvid4", "SESSDATA=C; buvid3=test-buvid; buvid4=test-buvid4"
      ])
      expect(requests.filter(request => request.url.pathname.endsWith("/nav") || request.url.pathname.endsWith("/spi"))
        .every(request => !request.headers.Cookie && request.headers.Referer === "https://www.bilibili.com/")).toBe(true)
    } finally { await connection.stop() }
  })

  it("reuses shared cache across rooms with independent success-time TTL and the 300 second floor", async () => {
    vi.resetModules()
    const https = syntheticHttps
    const { startBilibiliDanmakuConnection: start } = await import("./bilibili-danmaku-connection")
    let now = 1_000_000
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now)
    https.requests.length = 0
    https.respond = async url => {
      if (https.requests.length <= 2) now += 5_000
      return danmakuHttpReply(url)
    }
    const input = { roomId: "33", cacheConfiguration: { wbiCacheSeconds: 350, buvidCacheSeconds: -8 } }
    const connect = async (roomId: string) => { const connection = await start({ ...input, roomId }, () => {}); await connection.stop() }
    const paths = () => https.requests.map(request => request.url.pathname.split("/").at(-1))
    try {
      await connect("33")
      expect(paths()).toEqual(["spi", "nav", "getDanmuInfo"])
      now = 1_304_999
      await connect("34")
      expect(paths()).toEqual(["spi", "nav", "getDanmuInfo", "getDanmuInfo"])
      now = 1_305_000
      await connect("35")
      expect(paths().slice(-2)).toEqual(["spi", "getDanmuInfo"])
      now = 1_359_999
      await connect("36")
      expect(paths().at(-2)).toBe("getDanmuInfo")
      now = 1_360_000
      await connect("37")
      expect(paths().slice(-2)).toEqual(["nav", "getDanmuInfo"])
    } finally { clock.mockRestore() }
  })

  it("keeps Buvid on AUTH_EXPIRED but clears both caches on risk and keeps nav anonymous", async () => {
    vi.resetModules()
    const https = syntheticHttps
    const { startBilibiliDanmakuConnection: start } = await import("./bilibili-danmaku-connection")
    https.requests.length = 0
    let failureCode = -101
    https.respond = async (url, headers) => {
      if (url.pathname.endsWith("getDanmuInfo") && headers.Cookie?.includes("SESSDATA")) {
        return new Response(JSON.stringify({ code: failureCode, message: "synthetic credential rejection" }))
      }
      return danmakuHttpReply(url)
    }
    const input = { roomId: "33", credential: { authUid: "7", cookieHeader: "SESSDATA=synthetic-cache" } }
    const connection = await start(input, () => {})
    try {
      expect(connection.authMode).toBe("ANONYMOUS")
      expect(https.requests.map(request => request.url.pathname.split("/").at(-1)))
        .toEqual(["spi", "nav", "getDanmuInfo", "nav", "getDanmuInfo"])
      expect(https.requests.filter(request => request.url.pathname.endsWith("/nav")).every(request => !request.headers.Cookie)).toBe(true)
      expect(https.requests[2]?.headers.Cookie).toContain("SESSDATA=synthetic-cache")
      expect(https.requests[4]?.headers.Cookie).not.toContain("SESSDATA")
    } finally { await connection.stop() }
    https.requests.length = 0
    failureCode = -352
    const retry = await start({ ...input, roomId: "34" }, () => {})
    try {
      expect(retry.authMode).toBe("ANONYMOUS")
      expect(https.requests.map(request => request.url.pathname.split("/").at(-1)))
        .toEqual(["getDanmuInfo", "spi", "nav", "getDanmuInfo"])
      expect(https.requests.find(request => request.url.pathname.endsWith("/nav"))?.headers.Cookie).toBeUndefined()
    } finally { await retry.stop() }
  })

  it("consumes connection policy in signed requests, AUTH and cancellable fixed-rate heartbeat", async () => {
    vi.useFakeTimers({ now: 0 })
    const timers = vi.spyOn(globalThis, "setTimeout")
    const controller = new AbortController(), events: BilibiliDanmakuConnectionEvent[] = []
    const input = { roomId: "33", protocolVersion: 2, signal: controller.signal,
      credential: { authUid: "7", cookieHeader: "SESSDATA=synthetic-policy" },
      httpConfiguration: { connectTimeoutMs: 1250, readTimeoutMs: 0,
        userAgent: "Fixture danmaku/2", referer: "https://live.bilibili.com/configured" },
      connectionConfiguration: { connectTimeoutMs: 1234, heartbeatSeconds: 7,
        useLoginCredential: false, webLocation: " location! ", clientVersion: " version " } }
    let connection: Awaited<ReturnType<typeof startBilibiliDanmakuConnection>> | undefined
    let pending = startBilibiliDanmakuConnection(input, event => events.push(event)).then(value => { connection = value; return value })
    try {
      await vi.advanceTimersByTimeAsync(0); await pending
      expect(transport.handshakeTimeouts).toEqual([1234])
      expect(timers.mock.calls.map(call => call[1])).toContain(1250)
      const request = syntheticHttps.requests.find(item => item.url.pathname.includes("getDanmuInfo"))!
      expect(request.url.searchParams.get("web_location")).toBe(" location! ")
      expect(request.url.searchParams.has("w_rid")).toBe(true)
      expect(syntheticHttps.requests.every(item => !item.headers.Cookie?.includes("synthetic-policy"))).toBe(true)
      expect(transport.authPackets[0]?.readUInt16BE(6)).toBe(1)
      expect(JSON.parse(transport.authPackets[0]!.subarray(16).toString())).toMatchObject({ uid: 0, protover: 2, clientver: " version ", buvid: "test-buvid" })
      vi.setSystemTime(-3_600_000) // Wall-clock adjustment must not postpone the relative first cycle.
      await vi.advanceTimersByTimeAsync(6999)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(1)
      vi.setSystemTime(3_600_000) // Nor may a forward adjustment trigger catch-up bursts.
      await vi.advanceTimersByTimeAsync(7000)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(2)
      await connection!.stop(); connection = undefined
      events.length = 0
      pending = startBilibiliDanmakuConnection({ ...input, connectionConfiguration: {
        ...input.connectionConfiguration, connectTimeoutMs: -1, heartbeatSeconds: 2147484 } }, event => events.push(event))
        .then(value => { connection = value; return value })
      await vi.advanceTimersByTimeAsync(0); await pending
      expect(transport.handshakeTimeouts).toEqual([1234, 1000])
      await vi.advanceTimersByTimeAsync(2147483647)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(352)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(events.filter(event => event.type === "heartbeat-sent")).toHaveLength(1)
      controller.abort()
      expect(vi.getTimerCount()).toBe(0)
    } finally { controller.abort(); await pending; await connection?.stop(); timers.mockRestore(); vi.useRealTimers() }
  })

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

  it("consumes preference order in actual auth packets and honors an explicit manual override", async () => {
    const input = { roomId: "33", preferredProtocolVersion: 2 }
    transport.failHandshake = true
    const events: BilibiliDanmakuConnectionEvent[] = []
    await expect(startBilibiliDanmakuConnection(input, event => events.push(event))).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONNECT_FAILED" })
    expect(events.filter(event => event.type === "connecting").map(event => event.protocolVersion)).toEqual([2, 3, 1, 0])
    expect(transport.sockets).toHaveLength(4)
    expect(syntheticHttps.requests.filter(request => request.url.pathname.includes("getDanmuInfo"))).toHaveLength(4)
    transport.failHandshake = false; transport.authPackets.length = 0
    const connection = await startBilibiliDanmakuConnection({ ...input, protocolVersion: 0 }, () => {})
    try {
      expect(connection.protocolVersion).toBe(0)
      expect(transport.authPackets.map(bytes => JSON.parse(bytes.subarray(16).toString()).protover)).toEqual([0])
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

  it("returns after AUTH, sends heartbeat before reply, and never falls back on asynchronous rejection", async () => {
    transport.autoAuth = false
    vi.useFakeTimers()
    const controller = new AbortController()
    const events: BilibiliDanmakuConnectionEvent[] = []
    let connection: Awaited<ReturnType<typeof startBilibiliDanmakuConnection>> | undefined
    const pending = startBilibiliDanmakuConnection({ roomId: "33", signal: controller.signal, heartbeatSeconds: -1 }, event => events.push(event))
      .then(value => { connection = value; return value }, error => error)
    try {
      await vi.waitFor(() => expect(connection).toBeDefined(), { timeout: 300 })
      expect(connection).toMatchObject({ status: "AUTHENTICATING" })
      await vi.advanceTimersByTimeAsync(5000)
      expect(events.some(event => event.type === "heartbeat-sent")).toBe(true)
      transport.sockets[0]!.emit("message", packet(8, '{"code":0}'))
      expect(events.some(event => event.type === "connected")).toBe(true)
      transport.sockets[0]!.emit("message", packet(8, '{"code":0.0}'))
      expect(events.filter(event => event.type === "error")).toMatchObject([{ errorType: "BILIBILI_DANMAKU_AUTH_FAILED" }])
      expect(transport.sockets).toHaveLength(1)
      expect(events.some(event => event.type === "closed")).toBe(false)
    } finally { controller.abort(); await pending; await connection?.stop(); vi.useRealTimers() }
  })
})
