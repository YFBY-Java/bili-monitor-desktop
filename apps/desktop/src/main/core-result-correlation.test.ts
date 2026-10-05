import { EventEmitter } from "node:events"
import { createRuntimeEnvelope, type RuntimeEnvelope } from "@bmd/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreController } from "./core-client"

const adapter = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: adapter.fork } }))

const timestamp = "2026-10-05T00:00:00Z"
const userId = "11111111-1111-4111-8111-111111111111"
const bootstrap = { coreStatus: { state: "ready", version: "fixture", dataDirectory: "D:/fixture",
  databaseReady: true, schemaVersion: 14, startedAt: timestamp }, workers: [], sequence: 0 }
const cases = ["v1", "v2"].flatMap(version => ["result", "error"].flatMap(kind =>
  ["type", "trace", "correlation"].map(mismatch => ({ version, kind, mismatch }))))
const invalidErrors = [
  { name: "missing code", payload: { message: "missing code fixture", retryable: false } },
  { name: "nonboolean retryable", payload: { code: "INVALID_FRAME", message: "invalid retryable fixture", retryable: "false" } }
]

describe("Local Core final response correlation", () => {
  let controller: LocalCoreController | undefined
  afterEach(async () => { await controller?.stop(); controller = undefined; vi.useRealTimers() })

  async function setup() {
    vi.useFakeTimers()
    const requests: RuntimeEnvelope[] = []
    const child = Object.assign(new EventEmitter(), {
      pid: 123 as number | undefined, stderr: new EventEmitter(),
      kill: vi.fn(() => { child.pid = undefined; child.emit("exit", 0) }),
      postMessage: (request: RuntimeEnvelope) => {
        requests.push(request)
        if (request.type === "core.bootstrap") respond(request, "core.bootstrap.result", bootstrap)
        if (request.type === "core.shutdown") {
          respond(request, "core.shutdown.result", { accepted: true })
          child.kill()
        }
      }
    })
    function respond(request: RuntimeEnvelope, type: string, payload: unknown, overrides: Partial<RuntimeEnvelope> = {}) {
      child.emit("message", createRuntimeEnvelope({ ...request, type, payload, ...overrides }))
    }
    adapter.fork.mockReturnValue(child)
    const host = new LocalCoreController({ entryPath: "D:/fixture/core.js", dataDirectory: "D:/fixture",
      douyinOAuth: { mode: "disabled" }, requestTimeoutMs: 5_000 })
    controller = host
    await host.start()
    return { host, child, requests, respond }
  }

  function collectResult(version: string) {
    return { userId, mid: "2", success: true,
      followerCount: version === "v2" ? "9223372036854775807" : 20, capturedAt: timestamp, message: "ok" }
  }

  it.each(cases)("ignores $version $kind with wrong $mismatch and still accepts its legitimate final frame", async ({ version, kind, mismatch }) => {
    const f = await setup()
    let settled = false
    const operation = version === "v2" ? f.host.refreshBilibiliFollowerMonitorV2({ userId })
      : f.host.refreshBilibiliFollowerMonitor({ userId })
    const pending = operation.then(value => { settled = true; return value },
      (error: unknown) => { settled = true; return error })
    const request = f.requests.at(-1)!
    const type = kind === "error" ? "core.error" : `${request.type}.result`
    const payload = kind === "error" ? { code: "UNASSOCIATED_FAILURE", message: "ignored fixture", retryable: false }
      : collectResult(version)
    f.respond(request, mismatch === "type" ? "unrelated.final" : type, payload,
      mismatch === "trace" ? { traceId: "wrong-trace" }
        : mismatch === "correlation" ? { correlationId: "wrong-correlation" } : {})
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    expect(f.child.kill).not.toHaveBeenCalled()

    f.respond(request, type, kind === "error"
      ? { code: "ASSOCIATED_FAILURE", message: "legitimate fixture", retryable: false }
      : collectResult(version))
    expect(await pending).toMatchObject(kind === "error" ? { code: "ASSOCIATED_FAILURE" }
      : { followerCount: version === "v2" ? "9223372036854775807" : 20 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(cases)("does not renew the watchdog for $version $kind with wrong $mismatch", async ({ version, kind, mismatch }) => {
    const f = await setup()
    const operation = version === "v2" ? f.host.refreshBilibiliFollowerMonitorV2({ userId })
      : f.host.refreshBilibiliFollowerMonitor({ userId })
    const pending = operation.catch((error: unknown) => error)
    const request = f.requests.at(-1)!
    await vi.advanceTimersByTimeAsync(60_000)
    const type = kind === "error" ? "core.error" : `${request.type}.result`
    f.respond(request, mismatch === "type" ? "unrelated.final" : type,
      kind === "error" ? { code: "UNASSOCIATED_FAILURE", message: "ignored fixture", retryable: false } : collectResult(version),
      mismatch === "trace" ? { traceId: "wrong-trace" }
        : mismatch === "correlation" ? { correlationId: "wrong-correlation" } : {})
    await vi.advanceTimersByTimeAsync(29_999)
    expect(f.child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const failure = await pending
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error("Expected the original watchdog failure")
    expect(failure.message).toContain("timed out after 90000 ms")
    expect(f.child.kill).toHaveBeenCalledOnce()
    expect(f.host.isRunning()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(invalidErrors.flatMap(sample => ["result", "error"].map(kind => ({ ...sample, kind }))))(
    "ignores a correlated core.error with $name and still accepts its legitimate $kind", async ({ payload, kind }) => {
      const f = await setup()
      let settled = false
      const pending = f.host.refreshBilibiliFollowerMonitorV2({ userId }).then(value => { settled = true; return value },
        (error: unknown) => { settled = true; return error })
      const request = f.requests.at(-1)!
      expect(() => f.respond(request, "core.error", payload)).not.toThrow()
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      f.respond(request, kind === "error" ? "core.error" : `${request.type}.result`, kind === "error"
        ? { code: "ASSOCIATED_FAILURE", message: "legitimate fixture", retryable: false }
        : collectResult("v2"))
      expect(await pending).toMatchObject(kind === "error" ? { code: "ASSOCIATED_FAILURE" }
        : { followerCount: "9223372036854775807" })
      expect(vi.getTimerCount()).toBe(0)
    })

  it.each(invalidErrors)("does not renew the watchdog for correlated core.error with $name", async ({ payload }) => {
    const f = await setup()
    const pending = f.host.refreshBilibiliFollowerMonitorV2({ userId }).catch((error: unknown) => error)
    const request = f.requests.at(-1)!
    await vi.advanceTimersByTimeAsync(60_000)
    expect(() => f.respond(request, "core.error", payload)).not.toThrow()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(f.child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const failure = await pending
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error("Expected the original watchdog failure")
    expect(failure.message).toContain("timed out after 90000 ms")
    expect(f.child.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("continues to accept associated bootstrap and shutdown result frames", async () => {
    const f = await setup()
    expect(await f.host.bootstrap()).toEqual(bootstrap)
    await f.host.stop()
    expect(f.requests.map(request => request.type)).toEqual(["core.bootstrap", "core.bootstrap", "core.shutdown"])
    expect(f.host.isRunning()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
