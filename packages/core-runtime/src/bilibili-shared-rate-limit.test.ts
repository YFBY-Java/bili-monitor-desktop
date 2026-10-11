import { writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { BilibiliLiveRankFetchedSnapshot, BilibiliLiveRankWorkerRequest } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { followerConfigurationFixture } from "./__fixtures__/follower-configuration"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"

function rankSnapshot(request: BilibiliLiveRankWorkerRequest): BilibiliLiveRankFetchedSnapshot {
  return { rankFamily: request.family, rankType: request.type, pageNo: request.page, pageSize: request.pageSize,
    ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}),
    ...(request.periodScope ? { periodScope: request.periodScope } : {}),
    sourceEndpoint: request.endpoint!, signedRequired: request.family === "AUDIENCE",
    capturedAt: new Date().toISOString(), entries: [], statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"d".repeat(64)}`, sha256: "d".repeat(64),
      relativePath: "cas/synthetic-shared-rate-limit.json", sizeBytes: 2, mediaType: "application/json" } }
}

describe("original shared RateLimitService through real Core and SQLite", () => {
  let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
  let core: LocalCoreRuntime | undefined
  afterEach(async () => {
    await core?.stop(); core = undefined
    await fixture?.close(); fixture = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
  })
  async function setup(maxAttempts = 1) {
    fixture = await followerConfigurationFixture({ enabled: false, requestMinIntervalMs: 100, maxAttempts })
    await writeFile(resolve(fixture.directory, "config/bilibili-live-collection.json"),
      JSON.stringify({ enabled: false, requestMinIntervalMs: 100, maxAttempts }), "utf8")
    const rankCalls: Array<{ request: BilibiliLiveRankWorkerRequest; at: number }> = []
    const state = { beforeRank: async (): Promise<void> => {}, rankError: undefined as Error | undefined }
    core = await LocalCoreRuntime.start({ ...fixture.options, schedulerEnabled: false,
      liveRankSource: { fetch: async request => {
        rankCalls.push({ request, at: Date.now() })
        await state.beforeRank()
        if (state.rankError) throw state.rankError
        return rankSnapshot(request)
      } } })
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] })
    vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    fixture.live.calls.length = 0
    return { ...fixture, core, room, rankCalls, rankState: state }
  }
  function apiCalls(taskId: string) {
    const db = new DatabaseSync(resolve(fixture!.directory, "control.db"), { readOnly: true })
    try { return db.prepare("SELECT * FROM bilibili_api_call WHERE task_id = ? ORDER BY rowid").all(taskId) }
    finally { db.close() }
  }

  it("queues live REST and rank behind an active follower permit wait", async () => {
    const f = await setup()
    await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    const follower = f.core.addBilibiliFollowerMonitor({ mid: "3" }).catch(error => error)
    const live = f.core.addBilibiliLiveRoom({ uid: "3" }).catch(error => error)
    const rank = f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["guard_weekly"] }).catch(error => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.rankCalls).toHaveLength(0)
    expect(f.live.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(await follower).toMatchObject({ mid: "3" })
    expect(await live).toMatchObject({ uid: "3" })
    expect(await rank).toMatchObject({ successCount: 1 })
    expect(apiCalls(f.rankCalls[0]!.request.taskId)[0]).toMatchObject({ duration_ms: 100 })
  })

  it("serializes concurrent rank permits across different rank endpoints, not their HTTP operations", async () => {
    const f = await setup()
    let release!: () => void
    const gate = new Promise<void>(resolveGate => { release = resolveGate })
    f.rankState.beforeRank = () => f.rankCalls.length === 1 ? gate : Promise.resolve()
    const operations = ["guard_weekly", "entry_time_rank", "guard_monthly"].map(type =>
      f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: [type] }).catch(error => error))
    try {
      await vi.advanceTimersByTimeAsync(1500)
      expect(f.rankCalls).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(1500)
      expect(f.rankCalls.map(call => call.at - f.rankCalls[0]!.at)).toEqual([0, 1500, 3000])
    } finally { release(); await Promise.all(operations) }
  })

  it.each(["follower", "live", "rank"] as const)("records %s successful and failed attempt time including rate waiting", async family => {
    const f = await setup()
    await vi.advanceTimersByTimeAsync(200)
    const delay = () => new Promise<void>(resolveDelay => setTimeout(resolveDelay, 5))
    let run: () => Promise<unknown>
    let taskId: () => string
    let fail: () => void
    const failure = Object.assign(new Error("Synthetic non-retryable rate-limit timing"), { code: "BILIBILI_RISK_CONTROL", retryable: false })
    if (family === "follower") {
      f.state.before = delay
      run = () => f.core.addBilibiliFollowerMonitor({ mid: "4" })
      taskId = () => f.calls.at(-1)!.request.taskId
      fail = () => { f.state.failure = failure }
    } else if (family === "live") {
      f.live.state.beforeResponse = delay
      run = () => f.core.addBilibiliLiveRoom({ uid: "4" })
      taskId = () => f.live.calls.at(-1)!.taskId
      fail = () => { f.live.state.failure = failure }
    } else {
      f.rankState.beforeRank = delay
      run = () => f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["guard_weekly"] })
      taskId = () => f.rankCalls.at(-1)!.request.taskId
      fail = () => { f.rankState.rankError = failure }
    }
    let pending = run().catch(error => error)
    await vi.advanceTimersByTimeAsync(5)
    // UID live addition has a second detail operation, on an independent endpoint.
    if (family === "live") await vi.advanceTimersByTimeAsync(5)
    await pending
    expect(apiCalls(taskId()).map(call => call.duration_ms)).toEqual(family === "live" ? [5, 5] : [5])
    pending = run().catch(error => error)
    await vi.advanceTimersByTimeAsync(family === "rank" ? 1500 : 100)
    await pending
    expect(apiCalls(taskId())[0]).toMatchObject({ duration_ms: family === "live" ? 95 : family === "rank" ? 1500 : 100 })
    fail()
    pending = run().catch(error => error)
    await vi.advanceTimersByTimeAsync(family === "rank" ? 1500 : 100)
    await pending
    expect(apiCalls(taskId())[0]).toMatchObject({ duration_ms: family === "live" ? 95 : family === "rank" ? 1500 : 100, error_type: "BILIBILI_RISK_CONTROL" })
  })

  it("rejects excess local work without platform requests, API failure rows, or monitor failure state", async () => {
    const f = await setup()
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    const read = () => {
      const db = new DatabaseSync(resolve(f.directory, "control.db"), { readOnly: true })
      try { return db.prepare("SELECT * FROM bilibili_api_call ORDER BY rowid").all() }
      finally { db.close() }
    }
    const before = read()
    const queued = Array.from({ length: 256 }, (_, index) => f.core.addBilibiliFollowerMonitor({ mid: String(1000 + index) }).catch(error => error))
    const busy = await f.core.refreshBilibiliFollowerMonitor(user.id).catch(error => error)
    expect(busy).toMatchObject({ code: "LOCAL_RATE_LIMIT_BUSY", retryable: true })
    const liveBusy = await f.core.refreshBilibiliLiveRoom(f.room.id).catch(error => error)
    expect(liveBusy).toMatchObject({ code: "LOCAL_RATE_LIMIT_BUSY" })
    await expect(f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["contribution_rank"] }))
      .rejects.toMatchObject({ code: "LOCAL_RATE_LIMIT_BUSY", retryable: true })
    expect(f.core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect(f.calls).toHaveLength(1); expect(f.live.calls).toHaveLength(0); expect(f.rankCalls).toHaveLength(0)
    expect(read()).toEqual(before)
    await f.core.stop()
    expect(await Promise.all(queued)).toEqual(Array.from({ length: 256 }, () => expect.objectContaining({ code: "CORE_STOPPED" })))
    expect(read()).toEqual(before)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])("uses truncated monotonic elapsed time despite wall-clock jumps (failure=%s)", async failure => {
    const f = await setup()
    let monotonic = 0.25
    vi.spyOn(performance, "now").mockImplementation(() => monotonic)
    f.state.before = async () => { monotonic = 6.99; vi.setSystemTime(new Date("2020-01-01T00:00:00Z")) }
    if (failure) f.state.failure = Object.assign(new Error("Synthetic timing failure"), { code: "BILIBILI_RISK_CONTROL" })
    await f.core.addBilibiliFollowerMonitor({ mid: "2" }).catch(error => error)
    expect(apiCalls(f.calls[0]!.request.taskId)[0]).toMatchObject({ duration_ms: 6 })
  })

  it.each(["follower", "live"] as const)("does not include %s retry backoff in either attempt's duration", async family => {
    const f = await setup(2)
    await vi.advanceTimersByTimeAsync(200)
    vi.spyOn(Math, "random").mockReturnValue(0)
    let attempts = 0
    const before = async () => {
      await new Promise<void>(resolveDelay => setTimeout(resolveDelay, 5))
      if (++attempts === 1) throw Object.assign(new Error("Synthetic retry timing"), { code: "BILIBILI_RATE_LIMITED", retryable: true })
    }
    f.state.before = before; f.live.state.beforeResponse = before
    const pending = family === "follower" ? f.core.addBilibiliFollowerMonitor({ mid: "2" }) : f.core.addBilibiliLiveRoom({ uid: "3" })
    await vi.advanceTimersByTimeAsync(2000); await pending
    const taskId = family === "follower" ? f.calls[0]!.request.taskId : f.live.calls[0]!.taskId
    const logs = apiCalls(taskId)
    expect(logs.map(call => call.duration_ms)).toEqual(family === "follower" ? [5, 5] : [5, 5, 5])
    expect(logs.slice(0, 2).map(call => call.attempt)).toEqual([1, 2])
  })

  it("measures before SQLite logging and does not reclassify a success-log failure as a platform failure", async () => {
    const f = await setup()
    const originalInsert = ControlDatabase.prototype.insertBilibiliApiCall
    let monotonic = 0
    vi.spyOn(performance, "now").mockImplementation(() => monotonic)
    f.state.before = async () => { monotonic += 5 }
    const insert = vi.spyOn(ControlDatabase.prototype, "insertBilibiliApiCall").mockImplementation(function (this: ControlDatabase, ...args) {
      const result = originalInsert.apply(this, args)
      monotonic += 50
      return result
    })
    await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    expect(apiCalls(f.calls[0]!.request.taskId)[0]).toMatchObject({ duration_ms: 5 })
    insert.mockImplementation(() => { throw new Error("Synthetic success-log storage failure") })
    const pending = f.core.addBilibiliFollowerMonitor({ mid: "3" }).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(insert).toHaveBeenCalledTimes(2)
    expect(f.calls).toHaveLength(2)
  })

  it.each([false, true])("does not refetch a fallback rank when API logging fails (source failure=%s)", async sourceFailure => {
    const f = await setup()
    if (sourceFailure) f.rankState.rankError = Object.assign(new Error("Synthetic source failure"), { code: "BILIBILI_NETWORK_ERROR" })
    const insert = vi.spyOn(ControlDatabase.prototype, "insertBilibiliApiCall").mockImplementation(() => {
      throw new Error("Synthetic log storage failure")
    })
    // Observe the rejection before advancing timers; original refresh only aggregates platform failures.
    const pending = expect(f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["contribution_rank"] }))
      .rejects.toThrow("Synthetic log storage failure")
    await vi.advanceTimersByTimeAsync(1500)
    await pending
    expect(f.rankCalls).toHaveLength(1)
    expect(insert).toHaveBeenCalledOnce()
  })

  it("does not mark a follower failed when API logging, rather than the source, fails", async () => {
    const f = await setup()
    const user = await f.core.addBilibiliFollowerMonitor({ mid: "2" })
    vi.spyOn(ControlDatabase.prototype, "insertBilibiliApiCall").mockImplementation(() => { throw new Error("Synthetic log storage failure") })
    const pending = f.core.refreshBilibiliFollowerMonitor(user.id).catch(error => error)
    await vi.advanceTimersByTimeAsync(100); await pending
    expect(f.core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect(f.calls).toHaveLength(2)
  })

  it.each([false, true])("preserves due follower state when API logging fails (source failure=%s)", async sourceFailure => {
    fixture = await followerConfigurationFixture()
    const db = await ControlDatabase.open(fixture.directory)
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    const service = new BilibiliFollowerMonitorService({ database: db, source: fixture.options.followerSource,
      now: () => new Date(), idFactory: randomUUID, requestMinIntervalMs: 0, maxAttempts: 1 })
    try {
      const user = await service.addUser({ mid: "2", intervalSeconds: 60 })
      vi.setSystemTime(new Date("2026-09-26T00:01:00Z"))
      if (sourceFailure) fixture.state.failure = Object.assign(new Error("Synthetic due source failure"), { code: "BILIBILI_NETWORK_ERROR" })
      vi.spyOn(ControlDatabase.prototype, "insertBilibiliApiCall").mockImplementation(() => { throw new Error("Synthetic due log storage failure") })
      await expect(service.collectDueUsers()).rejects.toThrow("Synthetic due log storage failure")
      expect(service.listUsers().items).toEqual([user])
      expect(fixture.calls).toHaveLength(2)
    } finally { await service.stop(); db.close() }
  })
})
