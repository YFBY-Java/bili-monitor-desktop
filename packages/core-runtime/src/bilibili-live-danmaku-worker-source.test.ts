import { describe, expect, it, vi } from "vitest"

import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"
import { parseBilibiliDanmakuEvent } from "../../../workers/node-realtime/src/bilibili-danmaku-event"

describe("BilibiliLiveDanmakuWorkerSource", () => {
  it.each(['"  正文 \\t "', '"\\u001c\\u3000"', "true", "9223372036854775807", "1e-323"])
    ("forwards raw parsed body through subscription without text coercion: %s", async token => {
      let subscription: ((event: unknown) => void) | undefined
      const transport = { subscribe: (_id: string, listener: (event: unknown) => void) => {
        subscription = listener
        return () => { subscription = undefined }
      }, request: async () => ({ connectHost: "wss://example.test/sub", protocolVersion: 3, authMode: "ANONYMOUS", status: "AUTHENTICATING", attempt: 1 }), stop: async () => {} }
      const source = new BilibiliLiveDanmakuWorkerSource(transport), listener = vi.fn()
      try {
        await source.start({ connectionId: "raw-body", roomId: "33" }, listener)
        const receivedAt = "2026-08-29T12:00:00.000Z", rawJson = `{"cmd":"DANMU_MSG","info":[[],${token}]}`
        const parsed = parseBilibiliDanmakuEvent(rawJson, receivedAt)
        subscription?.({ type: "command", receivedAt, event: parsed })
        const expected = token === "true" ? "true" : token === "1e-323" ? "9.9E-324"
          : token === "9223372036854775807" ? token : JSON.parse(token)
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "command", event: expect.objectContaining({ messageText: expected, rawJson }) }))
      } finally { await source.stopAll() }
    })

  it("passes configured live HTTP settings unchanged to the isolated realtime process", async () => {
    const configuration = { connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture danmaku/2", referer: "https://live.bilibili.com/configured" }
    const connectionConfiguration = { heartbeatSeconds: 7, connectTimeoutMs: 1234,
      useLoginCredential: false, webLocation: " location! ", clientVersion: " version " }
    const cacheConfiguration = { wbiCacheSeconds: 350, buvidCacheSeconds: -8 }
    let subscription: ((event: unknown) => void) | undefined
    const transport = { subscribe: (_id: string, callback: (event: unknown) => void) => { subscription = callback; return () => {} }, stop: async () => {},
      request: vi.fn(async () => ({ connectHost: "wss://example.test/sub", protocolVersion: 3, authMode: "ANONYMOUS", status: "AUTHENTICATING", attempt: 1 })) }
    const source = new BilibiliLiveDanmakuWorkerSource(transport, configuration)
    try {
      await source.start({ connectionId: "configured-start", roomId: "33", preferredProtocolVersion: 2, connectionConfiguration, cacheConfiguration }, () => {})
      expect(transport.request).toHaveBeenCalledWith("start", expect.objectContaining({ httpConfiguration: configuration, preferredProtocolVersion: 2, connectionConfiguration, cacheConfiguration }))
      const consumerFailure = new Error("Fixture consumer failed")
      const failingConsumer = new BilibiliLiveDanmakuWorkerSource(transport)
      try {
        await expect(failingConsumer.start({ connectionId: "failed-consumer", roomId: "33" }, () => { throw consumerFailure })).resolves.toMatchObject({ status: "AUTHENTICATING" })
        // This callback runs directly on the protocol reader stack.
        const logged = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
          expect(() => subscription?.({ type: "connected", attempt: 1, receivedAt: "2026-10-06T08:00:00.000Z" })).not.toThrow()
          await Promise.resolve()
          expect(transport.request).toHaveBeenCalledWith("stop", { connectionId: "failed-consumer" })
          expect(logged).toHaveBeenCalledWith("Realtime terminal event could not be persisted.")
        } finally { logged.mockRestore() }
      } finally { await failingConsumer.stopAll() }
    } finally { await source.stopAll() }
  })

  it("routes independent-process start results and live events by connection id", async () => {
    let eventListener: ((event: unknown) => void) | undefined
    const transport = {
      subscribe: vi.fn((_connectionId: string, listener: (event: unknown) => void) => {
        eventListener = listener
        return () => undefined
      }),
      request: vi.fn(async (type: string) => {
        if (type === "start") {
          return {
            status: "AUTHENTICATING", attempt: 1,
            connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
            protocolVersion: 3,
            authMode: "ANONYMOUS"
          }
        }
        return { stopped: true }
      }),
      stop: vi.fn(async () => undefined)
    }
    const source = new BilibiliLiveDanmakuWorkerSource(transport)
    const listener = vi.fn()

    await expect(source.start({
      connectionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
      roomId: "7734200",
      protocolVersion: 3
    }, listener)).resolves.toMatchObject({ protocolVersion: 3, authMode: "ANONYMOUS" })
    eventListener?.({ type: "attempt-failed", attempt: 1, receivedAt: "2026-08-29T12:00:00.000Z",
      code: "BILIBILI_UNKNOWN_ERROR", message: "" })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "attempt-failed", message: "" }))
    expect(transport.request).toHaveBeenCalledTimes(1)
    eventListener?.({
      type: "heartbeat",
      popularity: 42,
      receivedAt: "2026-08-29T12:00:30.000Z"
    })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "heartbeat", popularity: 42 }))

    await source.stop("018f0f39-7b5e-7cc1-962d-9a208b3d0901")
    expect(transport.request).toHaveBeenLastCalledWith("stop", {
      connectionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901"
    })
  })
})
