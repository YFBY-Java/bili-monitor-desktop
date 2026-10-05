import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getEventListeners } from "node:events"
import { LocalRequestRateLimiter, type RateLimitRequest } from "./local-request-rate-limiter"

describe("shared local equivalent of RateLimitService's acquisition lock", () => {
  let limiter: LocalRequestRateLimiter
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    limiter = new LocalRequestRateLimiter(() => new Date())
  })
  afterEach(() => { vi.useRealTimers() })
  function request(policyKey = "card", overrides: Partial<RateLimitRequest> = {}): RateLimitRequest {
    return { platformCode: "bilibili", policyKey, minIntervalMs: 100, signal: new AbortController().signal, ...overrides }
  }
  const flush = () => vi.advanceTimersByTimeAsync(0)

  it("holds one acquisition lock across platform/policy keys, but retains separate deadlines", async () => {
    await limiter.acquire(request())
    const granted: string[] = []
    const a = limiter.acquire(request()).then(() => granted.push("card"))
    const b = limiter.acquire(request("card", { platformCode: "bilibili-live" })).then(() => granted.push("live"))
    await flush(); expect(granted).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    await Promise.all([a, b]); expect(granted).toEqual(["card", "live"])
  })

  it("sets the next deadline from actual wake-up rather than previously reserved slots", async () => {
    await limiter.acquire(request())
    const granted: number[] = [], waits: number[] = []
    let release!: () => void
    const sleep = (ms: number) => { waits.push(ms); return new Promise<void>(resolve => { release = resolve }) }
    const a = limiter.acquire(request("card", { sleep })).then(() => granted.push(Date.now()))
    const b = limiter.acquire(request()).then(() => granted.push(Date.now()))
    vi.setSystemTime(500); release(); await flush()
    expect(granted).toEqual([500]); expect(waits).toEqual([100])
    await vi.advanceTimersByTimeAsync(99); expect(granted).toEqual([500])
    await vi.advanceTimersByTimeAsync(1); await Promise.all([a, b])
    expect(granted).toEqual([500, 600])
  })

  it.each([0, -1])("bypasses the acquisition lock for %s without changing an existing deadline", async minimum => {
    await limiter.acquire(request())
    const pending = limiter.acquire(request())
    await vi.advanceTimersByTimeAsync(50)
    await limiter.acquire(request("card", { minIntervalMs: minimum }))
    await vi.advanceTimersByTimeAsync(50); await pending
    const next = limiter.acquire(request())
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(100); await next
  })

  it("removes an aborted queued request without consuming its key's next permit", async () => {
    await limiter.acquire(request())
    const active = limiter.acquire(request())
    const controller = new AbortController()
    const queued = limiter.acquire(request("relation", { signal: controller.signal })).catch(error => error)
    controller.abort(); expect(await queued).toMatchObject({ code: "CORE_STOPPED" })
    const after = limiter.acquire(request("relation"))
    await vi.advanceTimersByTimeAsync(100); await Promise.all([active, after])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels the active wait immediately, releasing unrelated consumers without changing the deadline", async () => {
    await limiter.acquire(request())
    const controller = new AbortController()
    const active = limiter.acquire(request("card", { signal: controller.signal })).catch(error => error)
    const unrelated = limiter.acquire(request("rank"))
    controller.abort(); expect(await active).toMatchObject({ code: "CORE_STOPPED" }); await unrelated
    expect(vi.getTimerCount()).toBe(0)
    const next = limiter.acquire(request())
    await vi.advanceTimersByTimeAsync(100); await next
    expect(Date.now()).toBe(100)
  })

  it("ignores a canceled injected sleep's late completion", async () => {
    await limiter.acquire(request())
    let release!: () => void
    const controller = new AbortController()
    const pending = limiter.acquire(request("card", { signal: controller.signal,
      sleep: () => new Promise<void>(resolve => { release = resolve }) })).catch(error => error)
    controller.abort(); expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    vi.setSystemTime(500); release(); await flush()
    await limiter.acquire(request())
    expect(vi.getTimerCount()).toBe(0)
  })

  it("bounds active plus queued requests to 256 and recovers capacity after cancellation", async () => {
    await limiter.acquire(request())
    const controllers = Array.from({ length: 256 }, () => new AbortController())
    const pending = controllers.map(controller => limiter.acquire(request("card", { signal: controller.signal })).catch(error => error))
    await expect(limiter.acquire(request())).rejects.toMatchObject({ code: "LOCAL_RATE_LIMIT_BUSY", retryable: true })
    controllers[1]!.abort()
    const replacement = new AbortController()
    const accepted = limiter.acquire(request("card", { signal: replacement.signal })).catch(error => error)
    for (const controller of controllers) controller.abort()
    replacement.abort()
    expect(await Promise.all([...pending, accepted])).toEqual(Array.from({ length: 257 }, () => expect.objectContaining({ code: "CORE_STOPPED" })))
    expect(vi.getTimerCount()).toBe(0)
  })

  it("segments waits larger than Node's maximum timeout instead of firing at 1ms", async () => {
    const interval = 2_147_483_647 + 20
    await limiter.acquire(request("card", { minIntervalMs: interval }))
    let finished = false
    const pending = limiter.acquire(request()).then(() => { finished = true })
    await vi.advanceTimersByTimeAsync(2_147_483_647); expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(19); expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1); await pending; expect(finished).toBe(true)
  })

  it("rejects pre-aborted callers even when limiting is disabled", async () => {
    const controller = new AbortController(); controller.abort()
    await expect(limiter.acquire(request("card", { minIntervalMs: 0, signal: controller.signal })))
      .rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("shares and removes one abort listener per service instead of accumulating request listeners", async () => {
    await limiter.acquire(request())
    const controller = new AbortController()
    const pending = Array.from({ length: 8 }, () => limiter.acquire(request("card", { signal: controller.signal })).catch(error => error))
    try { expect(getEventListeners(controller.signal, "abort")).toHaveLength(1) }
    finally { controller.abort(); await Promise.all(pending) }
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  })

  it("does not grant or reserve another aborted permit during a service-wide abort", async () => {
    await limiter.acquire(request())
    const controller = new AbortController()
    const active = limiter.acquire(request("card", { signal: controller.signal })).catch(error => error)
    const queued = limiter.acquire(request("relation", { signal: controller.signal })).catch(error => error)
    controller.abort(); await Promise.all([active, queued])
    let granted = false
    const survivor = new AbortController()
    const next = limiter.acquire(request("relation", { signal: survivor.signal })).then(() => { granted = true }, () => {})
    try { await flush(); expect(granted).toBe(true) }
    finally { survivor.abort(); await next }
  })

  it("releases the lock after a wait failure without poisoning the next consumer", async () => {
    await limiter.acquire(request())
    const failed = limiter.acquire(request("card", { sleep: async () => { throw new Error("Synthetic wait failure") } }))
    const next = limiter.acquire(request("relation"))
    await expect(failed).rejects.toThrow("Synthetic wait failure"); await next
    expect(vi.getTimerCount()).toBe(0)
  })
})
