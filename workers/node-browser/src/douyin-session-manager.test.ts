import { describe, expect, it, vi } from "vitest"

import { DouyinSessionManager, type DouyinBrowserBundle, type DouyinLoginHandle } from "./douyin-session-manager"

describe("DouyinSessionManager", () => {
  it("keeps manual action recoverable and validated credentials until TTL cleanup rejects late validation", async () => {
    vi.useFakeTimers()
    let resolveHandle: ((value: DouyinLoginHandle) => void) | undefined
    const handlePromise = new Promise<DouyinLoginHandle>((resolve) => { resolveHandle = resolve })
    const capturedBundle: DouyinBrowserBundle = {
      authType: "DOUYIN_WEB_SESSION",
      cookies: [{ name: "sessionid", value: "captured-test-value" }],
      rawWorkerResult: { futureField: "preserved" }
    }
    const validatedBundle: DouyinBrowserBundle = {
      ...capturedBundle,
      cookies: [{ name: "sessionid", value: "rotated-test-value" }],
      lastValidatedAt: "2026-10-06T00:00:00.000Z"
    }
    let resolveLateValidation: ((value: { valid: boolean; bundle: DouyinBrowserBundle }) => void) | undefined
    const lateValidation = new Promise<{ valid: boolean; bundle: DouyinBrowserBundle }>((resolve) => {
      resolveLateValidation = resolve
    })
    const validateBundle = vi.fn()
      .mockImplementationOnce(() => lateValidation)
      .mockResolvedValue({ valid: true, bundle: validatedBundle, details: { status: "SUCCESS" } })
    const close = vi.fn(async () => undefined)
    const manager = new DouyinSessionManager({
      createSession: () => handlePromise,
      validateBundle
    }, { ttlSeconds: 180, idFactory: () => "worker-session" })

    try {
      const started = await manager.create(180)
      expect(started.status).toBe("STARTING")
      expect((await manager.status(started.workerSessionId)).status).toBe("STARTING")

      const stages = ["USER_ACTION_REQUIRED", "WAITING", "SCANNED", "VALIDATING"] as const
      let checks = 0
      resolveHandle?.({
        qr: async () => Buffer.from("png"),
        status: async () => {
          const status = stages[checks++]
          return status
            ? { status, message: "visible" }
            : { status: "SUCCESS", message: "captured", bundle: capturedBundle }
        },
        close
      })
      await Promise.resolve()
      for (const stage of stages) expect((await manager.status(started.workerSessionId)).status).toBe(stage)
      expect(await manager.qr(started.workerSessionId)).toEqual(Buffer.from("png"))

      const latePoll = manager.status(started.workerSessionId)
      await Promise.resolve()
      expect(await manager.status(started.workerSessionId)).toMatchObject({ status: "SUCCESS", details: { status: "SUCCESS" } })
      expect(await manager.consume(started.workerSessionId)).toEqual(validatedBundle)
      expect(close).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(179_999)
      expect(await manager.consume(started.workerSessionId)).toEqual(validatedBundle)
      await vi.advanceTimersByTimeAsync(60_002)
      await expect(manager.consume(started.workerSessionId)).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" })

      resolveLateValidation?.({ valid: true, bundle: capturedBundle })
      await expect(latePoll).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" })
      await expect(manager.status(started.workerSessionId)).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" })
      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      await manager.closeAll()
      vi.useRealTimers()
    }
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
