import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { liveLifecycleSource } from "./__fixtures__/live-lifecycle"

const policyEnvironment = {
  defaultIntervalSeconds: "INTERVAL_SECONDS", minIntervalSeconds: "MIN_INTERVAL_SECONDS",
  maxIntervalSeconds: "MAX_INTERVAL_SECONDS", shortIntervalWarningSeconds: "SHORT_INTERVAL_WARNING_SECONDS",
  failureBackoffSeconds: "FAILURE_BACKOFF_SECONDS", requestMinIntervalMs: "REQUEST_MIN_INTERVAL_MS",
  maxAttempts: "MAX_ATTEMPTS", retryBackoffMs: "RETRY_BACKOFF_MS"
} as const

describe("original live collection policy from persisted configuration", () => {
  let directory: string
  let core: LocalCoreRuntime | undefined
  afterEach(async () => {
    await core?.stop(); core = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  async function setup(configuration: Record<string, number> = {}, environment: NodeJS.ProcessEnv = {}) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-policy-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    const contents = JSON.stringify({ requestMinIntervalMs: 0, ...configuration })
    await writeFile(path, contents, "utf8")
    for (const suffix of ["MONITOR_ENABLED", "SCHEDULER_DELAY_MS", "DUE_BATCH_SIZE", "STATUS_BATCH_SIZE",
      ...Object.values(policyEnvironment)]) vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${suffix}`, undefined)
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T05:00:00Z"))
    vi.spyOn(Math, "random").mockReturnValue(0)
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
    const source = liveLifecycleSource()
    const times: Array<{ method: string; at: number }> = []
    source.state.beforeResponse = async method => { times.push({ method, at: Date.now() }) }
    const options = { dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32), liveSource: source.source }
    core = await LocalCoreRuntime.start(options)
    return { ...source, core, times, warnings, path, contents, options, backgroundTimers: vi.getTimerCount() }
  }
  const failure = (code = "BILIBILI_NETWORK_ERROR", retryable = true) =>
    Object.assign(new Error("合成采集失败"), { code, retryable })

  it("applies the configured default before collecting and preserves saved schedules across restart", async () => {
    const f = await setup({ defaultIntervalSeconds: 420, minIntervalSeconds: 120, maxIntervalSeconds: 600 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    expect(room.intervalSeconds).toBe(420)
    expect(room.nextCollectAt).toBe("2026-09-13T05:07:00.000Z")
    await f.core.stop()
    await writeFile(f.path, JSON.stringify({ defaultIntervalSeconds: 480, requestMinIntervalMs: 0 }), "utf8")
    core = await LocalCoreRuntime.start(f.options)
    expect(core.listBilibiliLiveRooms().items[0]).toEqual(room)
    expect((await core.addBilibiliLiveRoom({ uid: "3" })).intervalSeconds).toBe(480)
  })

  it.each([119, 601])("rejects manual add/update outside configured bounds without changing facts (%s)", async intervalSeconds => {
    const f = await setup({ minIntervalSeconds: 120, maxIntervalSeconds: 600 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    const calls = [...f.calls]
    await expect(f.core.addBilibiliLiveRoom({ uid: "3", intervalSeconds })).rejects.toMatchObject({ code: "BILIBILI_LIVE_INTERVAL_INVALID" })
    expect(() => f.core.updateBilibiliLiveRoomSettings(room.id, intervalSeconds)).toThrow(/采集间隔不能/)
    expect(f.core.listBilibiliLiveRooms().items).toEqual([room])
    expect(f.calls).toEqual(calls)
    expect(f.warnings).not.toHaveBeenCalled()
    expect(await readFile(f.path, "utf8")).toBe(f.contents)
  })

  it.each([
    { defaultIntervalSeconds: 119, minIntervalSeconds: 120 },
    { defaultIntervalSeconds: 601, maxIntervalSeconds: 600 }
  ])("does not silently clamp an invalid configured default: %j", async configuration => {
    const f = await setup(configuration)
    await expect(f.core.addBilibiliLiveRoom({ uid: "2" })).rejects.toMatchObject({ code: "BILIBILI_LIVE_INTERVAL_INVALID" })
    expect(f.calls).toEqual([])
    expect(f.core.listBilibiliLiveRooms().items).toEqual([])
  })

  it("normalizes configured minimum/maximum at the service but retains explicit DTO and database bounds", async () => {
    const f = await setup({ minIntervalSeconds: -9, maxIntervalSeconds: -1, defaultIntervalSeconds: 1 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    expect(room.intervalSeconds).toBe(1)
    await expect(f.core.addBilibiliLiveRoom({ uid: "3", intervalSeconds: 2 })).rejects.toMatchObject({ code: "BILIBILI_LIVE_INTERVAL_INVALID" })
    await expect(f.core.addBilibiliLiveRoom({ uid: "3", intervalSeconds: 0 })).rejects.toBeDefined()
    expect(f.calls).toHaveLength(2)
  })

  it("does not widen the original 30-day DTO or database range when the configured maximum is larger", async () => {
    const f = await setup({ defaultIntervalSeconds: 2592001, maxIntervalSeconds: 2592001 })
    await expect(f.core.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 2592001 })).rejects.toBeDefined()
    expect(f.calls).toEqual([])
    await expect(f.core.addBilibiliLiveRoom({ uid: "2" })).rejects.toThrow(/CHECK constraint/)
    expect(f.calls).toHaveLength(2)
    expect(f.core.listBilibiliLiveRooms().items).toEqual([])
  })

  it("logs only accepted intervals below the configured warning threshold", async () => {
    const f = await setup({ shortIntervalWarningSeconds: 450 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 449 })
    expect(f.warnings).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(f.warnings.mock.calls[0]?.[0]))).toMatchObject({
      event: "bilibili.live.short-interval", intervalSeconds: 449, requestMinIntervalMs: 0
    })
    f.core.updateBilibiliLiveRoomSettings(room.id, 450)
    expect(f.warnings).toHaveBeenCalledTimes(1)
    f.core.updateBilibiliLiveRoomSettings(room.id, 300)
    expect(f.warnings).toHaveBeenCalledTimes(2)
  })

  it("normalizes a negative warning threshold to one without rejecting a one-second interval", async () => {
    const f = await setup({ shortIntervalWarningSeconds: -1 })
    expect((await f.core.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })).intervalSeconds).toBe(1)
    expect(f.warnings).not.toHaveBeenCalled()
  })

  it.each([[75, 75], [0, 60], [-100, 60], [600, 300]])(
    "persists failure backoff %s as %s seconds without changing the interval", async (configured, expected) => {
      const f = await setup({ failureBackoffSeconds: configured, maxAttempts: 1 })
      const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
      f.state.failure = failure()
      await expect(f.core.refreshBilibiliLiveRoom(room.id)).rejects.toMatchObject({ code: "BILIBILI_NETWORK_ERROR" })
      expect(f.core.listBilibiliLiveRooms().items[0]).toMatchObject({ intervalSeconds: 300,
        nextCollectAt: new Date(Date.now() + expected * 1000).toISOString(), lastErrorType: "BILIBILI_NETWORK_ERROR" })
    })

  it("uses configured endpoint spacing without globally delaying unrelated endpoints", async () => {
    const f = await setup({ requestMinIntervalMs: 400 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    const started = Date.now()
    const pending = f.core.refreshBilibiliLiveRoom(room.id)
    await vi.advanceTimersByTimeAsync(399)
    expect(f.times.map(call => call.method)).toEqual(["status", "info"])
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ success: true })
    expect(f.times).toEqual([{ method: "status", at: started }, { method: "info", at: started },
      { method: "status", at: started + 400 }, { method: "info", at: started + 400 }])
  })

  it("treats a negative request minimum as no spacing", async () => {
    const f = await setup({ requestMinIntervalMs: -100 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    await expect(f.core.refreshBilibiliLiveRoom(room.id)).resolves.toMatchObject({ success: true })
    expect(new Set(f.times.map(call => call.at)).size).toBe(1)
    expect(vi.getTimerCount()).toBe(f.backgroundTimers)
  })

  it.each([[0, 1], [1, 1], [2, 2], [10, 4]])("maxAttempts=%s yields %s actual attempts", async (maxAttempts, expected) => {
    const f = await setup({ maxAttempts, retryBackoffMs: 250 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    f.calls.length = 0; f.times.length = 0; f.state.failure = failure("BILIBILI_NETWORK_ERROR", false)
    const pending = f.core.refreshBilibiliLiveRoom(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({ code: "BILIBILI_NETWORK_ERROR" })
    expect(f.calls).toHaveLength(expected)
    const started = f.times[0]!.at
    expect(f.times.map(call => call.at - started)).toEqual([0, 250, 750, 1750].slice(0, expected))
  })

  it("keeps the 100ms retry floor and integer jitter on every retry", async () => {
    const f = await setup({ maxAttempts: 3, retryBackoffMs: -10 })
    vi.mocked(Math.random).mockReturnValue(0.999)
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    f.times.length = 0; f.state.failure = failure()
    const pending = f.core.refreshBilibiliLiveRoom(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toMatchObject({ code: "BILIBILI_NETWORK_ERROR" })
    const started = f.times[0]!.at
    expect(f.times.map(call => call.at - started)).toEqual([0, 399, 898])
  })

  it.each(["BILIBILI_RISK_CONTROL", "BILIBILI_AUTH_EXPIRED", "BILIBILI_PARSE_ERROR"])(
    "does not retry %s even if its metadata says retryable", async code => {
      const f = await setup({ maxAttempts: 10, retryBackoffMs: 250 })
      const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
      f.calls.length = 0; f.state.failure = failure(code)
      await expect(f.core.refreshBilibiliLiveRoom(room.id)).rejects.toMatchObject({ code })
      expect(f.calls).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(f.backgroundTimers)
    })

  it("cancels configured retry waiting on Core stop without changing saved failure state", async () => {
    const f = await setup({ maxAttempts: 4, retryBackoffMs: 5000 })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    f.state.failure = failure()
    const pending = f.core.refreshBilibiliLiveRoom(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(4999)
    expect(f.calls).toHaveLength(3)
    await f.core.stop()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(vi.getTimerCount()).toBe(0)
    core = await LocalCoreRuntime.start(f.options)
    expect(core.listBilibiliLiveRooms().items).toEqual([room])
  })

  it("carries all eight original environment overrides through Core into actual collection behavior", async () => {
    const f = await setup({ defaultIntervalSeconds: 300, minIntervalSeconds: 1, maxIntervalSeconds: 2592000,
      shortIntervalWarningSeconds: 120, failureBackoffSeconds: 900, requestMinIntervalMs: 0,
      maxAttempts: 3, retryBackoffMs: 1500 }, {
      SOCIAL_MONITOR_BILIBILI_LIVE_INTERVAL_SECONDS: "420",
      SOCIAL_MONITOR_BILIBILI_LIVE_MIN_INTERVAL_SECONDS: "120",
      SOCIAL_MONITOR_BILIBILI_LIVE_MAX_INTERVAL_SECONDS: "600",
      SOCIAL_MONITOR_BILIBILI_LIVE_SHORT_INTERVAL_WARNING_SECONDS: "500",
      SOCIAL_MONITOR_BILIBILI_LIVE_FAILURE_BACKOFF_SECONDS: "75",
      SOCIAL_MONITOR_BILIBILI_LIVE_REQUEST_MIN_INTERVAL_MS: "400",
      SOCIAL_MONITOR_BILIBILI_LIVE_MAX_ATTEMPTS: "2",
      SOCIAL_MONITOR_BILIBILI_LIVE_RETRY_BACKOFF_MS: "250"
    })
    const room = await f.core.addBilibiliLiveRoom({ uid: "2" })
    expect(room.intervalSeconds).toBe(420)
    expect(f.warnings).toHaveBeenCalledTimes(1)
    expect(() => f.core.updateBilibiliLiveRoomSettings(room.id, 119)).toThrow(/低于 120 秒/)
    expect(() => f.core.updateBilibiliLiveRoomSettings(room.id, 601)).toThrow(/超过 600 秒/)
    const start = Date.now()
    f.state.failure = failure("BILIBILI_SERVER_ERROR", false)
    const pending = f.core.refreshBilibiliLiveRoom(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(800)
    expect(await pending).toMatchObject({ code: "BILIBILI_SERVER_ERROR" })
    expect(f.times.map(call => call.at - start)).toEqual([0, 0, 400, 800])
    expect(f.core.listBilibiliLiveRooms().items[0]?.nextCollectAt).toBe(new Date(start + 800 + 75_000).toISOString())
    expect(await readFile(f.path, "utf8")).toBe(f.contents)
  })
})
