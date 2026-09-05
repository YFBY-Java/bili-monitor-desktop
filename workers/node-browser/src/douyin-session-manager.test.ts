import { describe, expect, it, vi } from "vitest"

import { DouyinSessionManager } from "./douyin-session-manager"

describe("DouyinSessionManager", () => {
  it("returns STARTING before browser initialization and keeps manual action non-terminal", async () => {
    let resolveHandle: ((value: {
      qr: () => Promise<Buffer>
      status: () => Promise<{ status: "USER_ACTION_REQUIRED" | "WAITING"; message: string }>
      close: () => Promise<void>
    }) => void) | undefined
    const handlePromise = new Promise<Parameters<NonNullable<typeof resolveHandle>>[0]>((resolve) => { resolveHandle = resolve })
    const manager = new DouyinSessionManager({
      createSession: () => handlePromise,
      validateBundle: vi.fn()
    }, { ttlSeconds: 180, now: () => 1_000, idFactory: () => "worker-session" })

    const started = await manager.create(180)
    expect(started.status).toBe("STARTING")
    expect((await manager.status(started.workerSessionId)).status).toBe("STARTING")

    let checks = 0
    resolveHandle?.({
      qr: async () => Buffer.from("png"),
      status: async () => ({ status: ++checks === 1 ? "USER_ACTION_REQUIRED" : "WAITING", message: "visible" }),
      close: async () => undefined
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect((await manager.status(started.workerSessionId)).status).toBe("USER_ACTION_REQUIRED")
    expect((await manager.status(started.workerSessionId)).status).toBe("WAITING")
  })

  it("closes an expired browser context even when the renderer stopped polling", async () => {
    vi.useFakeTimers()
    const close = vi.fn(async () => undefined)
    const manager = new DouyinSessionManager({
      createSession: vi.fn(async () => ({
        qr: async () => Buffer.from("png"),
        status: async () => ({ status: "WAITING" as const, message: "waiting" }),
        close
      })),
      validateBundle: vi.fn()
    }, { ttlSeconds: 1, idFactory: () => "expiring-session" })
    try {
      const started = await manager.create(1)
      await vi.advanceTimersByTimeAsync(1_001)
      expect(close).toHaveBeenCalledTimes(1)
      expect(await manager.status(started.workerSessionId)).toMatchObject({ status: "EXPIRED" })
    } finally {
      await manager.closeAll()
      vi.useRealTimers()
    }
  })
})
