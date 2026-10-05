import { afterEach, describe, expect, it, vi } from "vitest"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { followerConfigurationFixture } from "./__fixtures__/follower-configuration"
import { liveResponseGate } from "./__fixtures__/live-lifecycle"

describe("original follower collection policy and fixed-delay scheduling", () => {
  let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
  afterEach(async () => {
    await fixture?.close(); fixture = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
  })
  async function setup(configuration: Record<string, number | boolean> = {}) {
    fixture = await followerConfigurationFixture({ requestMinIntervalMs: 0, ...configuration })
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    vi.spyOn(Math, "random").mockReturnValue(0)
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
    const core = await fixture.start()
    return { ...fixture, core, warnings }
  }
  const failure = (code = "BILIBILI_RISK_CONTROL") => Object.assign(new Error("Synthetic follower failure"), {
    code, retryable: false, endpoint: "x/web-interface/card", statusCode: 200
  })

  it.each([119, 601])("rejects add/update outside configured interval bounds (%s) before requesting or changing facts", async interval => {
    const f = await setup({ minIntervalSeconds: 120, maxIntervalSeconds: 600, defaultIntervalSeconds: 420 })
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    await expect(f.core.addBilibiliFollowerMonitor({ mid: "3", intervalSeconds: interval }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_INTERVAL_INVALID" })
    expect(() => f.core.updateBilibiliFollowerMonitorSettings(user.id, interval)).toThrow(/采集间隔不能/u)
    expect(f.calls).toHaveLength(1)
    expect(f.core.listBilibiliFollowerMonitors().items).toEqual([user])
  })
  it.each([{ minIntervalSeconds: 120, defaultIntervalSeconds: 119 },
    { maxIntervalSeconds: 600, defaultIntervalSeconds: 601 }])("does not silently clamp invalid defaults: %j", async configuration => {
    const f = await setup(configuration)
    await expect(f.core.addBilibiliFollowerMonitor({ mid: "2" }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_INTERVAL_INVALID" })
    expect(f.calls).toEqual([])
  })
  it("normalizes configured bounds and warning thresholds at the service", async () => {
    const f = await setup({ minIntervalSeconds: -2, maxIntervalSeconds: -1, defaultIntervalSeconds: 1, shortIntervalWarningSeconds: -9 })
    expect((await f.core.addBilibiliFollowerMonitor({ mid: "2" })).intervalSeconds).toBe(1)
    await expect(f.core.addBilibiliFollowerMonitor({ mid: "3", intervalSeconds: 2 }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_INTERVAL_INVALID" })
    expect(f.warnings).not.toHaveBeenCalled()
  })
  it("warns only about accepted intervals below the configured short-interval threshold", async () => {
    const f = await setup({ shortIntervalWarningSeconds: 450 })
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2", intervalSeconds: 449 })
    expect(f.warnings).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(f.warnings.mock.calls[0]?.[0]))).toMatchObject({
      event: "bilibili.follower.short-interval", intervalSeconds: 449, requestMinIntervalMs: 0
    })
    f.core.updateBilibiliFollowerMonitorSettings(user.id, 450)
    expect(f.warnings).toHaveBeenCalledTimes(1)
    f.core.updateBilibiliFollowerMonitorSettings(user.id, 300)
    expect(f.warnings).toHaveBeenCalledTimes(2)
  })
  it.each([[75, 300], [-100, 300], [1200, 1200], [5000, 3600]])("failureBackoffSeconds=%s produces %s seconds", async (configured, expected) => {
    const f = await setup({ failureBackoffSeconds: configured })
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    f.state.failure = failure()
    await expect(f.core.refreshBilibiliFollowerMonitor(user.id)).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(f.core.listBilibiliFollowerMonitors().items[0]).toMatchObject({
      intervalSeconds: 3600, nextCollectAt: new Date(Date.now() + expected * 1000).toISOString()
    })
  })
  it.each([[0, 1], [2, 2], [10, 4]])("maxAttempts=%s follows the original RetryPolicy cap (%s attempts per endpoint)", async (maxAttempts, expected) => {
    const f = await setup({ maxAttempts, retryBackoffMs: 250 })
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    f.calls.length = 0
    f.state.failure = failure("BILIBILI_NETWORK_ERROR")
    const result = f.core.refreshBilibiliFollowerMonitor(user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await result).toMatchObject({ code: "BILIBILI_NETWORK_ERROR" })
    for (const endpoint of ["x/web-interface/card", "x/relation/stat"]) {
      const calls = f.calls.filter(call => call.endpoint === endpoint)
      expect(calls).toHaveLength(expected)
      if (expected > 1) expect(calls[1]!.at - calls[0]!.at).toBe(250)
    }
  })
  it("honors the configured batch size and scheduler delay independently of saved user intervals", async () => {
    const f = await setup({ dueBatchSize: 1, schedulerDelayMs: 2000 })
    for (const mid of ["2", "3", "4"]) await f.core.addBilibiliFollowerMonitor({ mid, intervalSeconds: 1 })
    await f.stop()
    vi.setSystemTime(new Date("2026-09-26T00:00:01Z"))
    f.calls.length = 0
    const core = await f.start(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls).toHaveLength(1)
    expect(core.listBilibiliFollowerMonitors().items).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls).toHaveLength(2)
  })
  it("waits a complete delay after a slow batch finishes instead of using an interval grid", async () => {
    const f = await setup({ schedulerDelayMs: 1000 })
    await f.core.addBilibiliFollowerMonitor({ mid: "2", intervalSeconds: 1 })
    await f.stop()
    vi.setSystemTime(new Date("2026-09-26T00:00:01Z"))
    const gate = liveResponseGate()
    f.state.before = () => gate.promise
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    await f.start(true)
    try {
      await vi.advanceTimersByTimeAsync(1000)
      expect(scan).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1250)
      gate.resolve()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(999)
      expect(scan).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(scan).toHaveBeenCalledTimes(2)
      await f.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(scan).toHaveBeenCalledTimes(2)
    } finally { gate.resolve() }
  })
  it("logs an internal scan failure safely and schedules the next batch after a full delay", async () => {
    const f = await setup({ schedulerDelayMs: 1250 })
    await f.stop()
    const scans = vi.spyOn(ControlDatabase.prototype, "findDueBilibiliFollowerMonitors")
      .mockImplementationOnce(() => { throw new Error("synthetic-private-db-failure") })
    await f.start(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(scans).toHaveBeenCalledTimes(1)
    expect(f.warnings).toHaveBeenCalledWith(JSON.stringify({ event: "bilibili.follower.scheduler-failed",
      code: "BILIBILI_FOLLOWER_SCHEDULER_FAILED" }))
    expect(JSON.stringify(f.warnings.mock.calls)).not.toContain("synthetic-private")
    await vi.advanceTimersByTimeAsync(1249)
    expect(scans).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(scans).toHaveBeenCalledTimes(2)
    await f.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(scans).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
