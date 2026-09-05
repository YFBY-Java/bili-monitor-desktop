import { describe, expect, it, vi } from "vitest"

import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"

describe("BilibiliLiveDanmakuWorkerSource", () => {
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
