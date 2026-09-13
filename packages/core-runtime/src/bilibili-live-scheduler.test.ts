import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { liveLifecycleSource, liveResponseGate } from "./__fixtures__/live-lifecycle"

describe("original fixed-delay live scheduling owned by local Core", () => {
  const cleanups: Array<() => Promise<void>> = []
  const gates: ReturnType<typeof liveResponseGate>[] = []
  afterEach(async () => {
    for (const gate of gates.splice(0)) gate.resolve()
    for (const cleanup of cleanups.splice(0)) await cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  function gate() { const value = liveResponseGate(); gates.push(value); return value }
  async function setup(schedulerDelayMs?: number) {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-scheduler-"))
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
    const f = liveLifecycleSource()
    const options = { dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
      liveSource: f.source, ...(schedulerDelayMs === undefined ? {} : { schedulerDelayMs }) }
    let runtime = await LocalCoreRuntime.start(options)
    cleanups.push(async () => { await runtime.stop(); await vi.advanceTimersByTimeAsync(10_000)
      await rm(directory, { recursive: true, force: true }) })
    return { ...f, directory, options, get runtime() { return runtime },
      restart: async () => { await runtime.stop(); runtime = await LocalCoreRuntime.start(options); return runtime } }
  }
  it("checks one-second intervals without bypassing the original 1500ms endpoint throttle", async () => {
    const f = await setup()
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    expect(f.runtime.listBilibiliLiveRooms().items[0]?.onlineCount).toBe(102)
    f.runtime.updateBilibiliLiveRoomStatus(room.id, false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
  })

  it("waits a full fixed delay after a long batch and never overlaps batches", async () => {
    const f = await setup(1000)
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    const response = gate()
    f.state.beforeResponse = () => response.promise
    await vi.advanceTimersByTimeAsync(4500)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    response.resolve()
    await vi.advanceTimersByTimeAsync(0)
    // Make it due immediately to distinguish fixed-delay scheduling from fixed-rate ticks.
    f.runtime.updateBilibiliLiveRoomStatus(room.id, true)
    await vi.advanceTimersByTimeAsync(500)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(3)
  })

  it("scans overdue persisted rooms on restart before the first regular delay", async () => {
    const f = await setup()
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    await f.runtime.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    await f.restart()
    expect(f.runtime.listBilibiliLiveRooms().items).toEqual([room])
    await vi.advanceTimersByTimeAsync(0)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    expect(f.runtime.listBilibiliLiveRooms().items[0]).toMatchObject({ id: room.id, onlineCount: 102 })
  })

  it("preserves due state when stopped in throttle wait and resumes only after reopening", async () => {
    const f = await setup(1000)
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    await f.runtime.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(1)
    await f.restart()
    expect(f.runtime.listBilibiliLiveRooms().items).toEqual([room])
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    expect(f.runtime.listBilibiliLiveRooms().items[0]?.lastErrorType).toBeUndefined()
  })

  it("retains paused interval and backoff through resume and process restart", async () => {
    const f = await setup(1000)
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    f.runtime.updateBilibiliLiveRoomStatus(room.id, false)
    f.state.failure = Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL" })
    const failed = f.runtime.refreshBilibiliLiveRoom(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await failed).toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    const paused = f.runtime.listBilibiliLiveRooms().items[0]!
    f.runtime.updateBilibiliLiveRoomSettings(room.id, 120)
    expect(f.runtime.listBilibiliLiveRooms().items[0]).toMatchObject({ intervalSeconds: 120,
      nextCollectAt: paused.nextCollectAt, backoffUntil: paused.backoffUntil })
    f.state.failure = undefined
    await f.restart()
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    f.runtime.updateBilibiliLiveRoomStatus(room.id, true)
    const resumed = f.runtime.listBilibiliLiveRooms().items[0]!
    expect(resumed).toMatchObject({ monitorStatus: "ACTIVE", nextCollectAt: new Date().toISOString(), backoffUntil: paused.backoffUntil })
    await f.restart()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(Date.parse(paused.backoffUntil!) - Date.now() + 1000)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(3)
    expect(f.runtime.listBilibiliLiveRooms().items[0]).toMatchObject({ intervalSeconds: 120, onlineCount: 103 })
    expect(f.runtime.listBilibiliLiveRooms().items[0]?.backoffUntil).toBeUndefined()
  })

  it("reports storage failures safely and continues the next scheduled batch", async () => {
    const f = await setup(1000)
    const room = await f.runtime.addBilibiliLiveRoom({ uid: "2", intervalSeconds: 1 })
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fixtureDatabase = new DatabaseSync(resolve(f.directory, "control.db"))
    try {
      fixtureDatabase.exec(`CREATE TRIGGER synthetic_live_write_failure BEFORE INSERT ON bilibili_live_room_snapshot
        BEGIN SELECT RAISE(FAIL, 'synthetic-sensitive-storage-details'); END;`)
      await vi.advanceTimersByTimeAsync(1500)
      expect(warning.mock.calls).toEqual([[JSON.stringify({
        event: "bilibili.live.scheduler-failed", code: "BILIBILI_LIVE_SCHEDULER_FAILED"
      })]])
      expect(f.runtime.listBilibiliLiveRooms().items).toEqual([room])
      fixtureDatabase.exec("DROP TRIGGER synthetic_live_write_failure")
      await vi.advanceTimersByTimeAsync(1500)
      expect(f.runtime.listBilibiliLiveRooms().items[0]?.onlineCount).toBe(103)
      expect(f.runtime.listBilibiliLiveRooms().items[0]?.lastErrorType).toBeUndefined()
    } finally { fixtureDatabase.close() }
  })

  it("cancels live writes immediately while another worker is still stopping", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-core-stop-"))
    const f = liveLifecycleSource(), response = gate(), followerStop = gate()
    let runtime: LocalCoreRuntime | undefined
    let stopping: Promise<void> | undefined
    try {
      runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
        schedulerEnabled: false, liveSource: f.source,
        followerSource: { fetchCard: async () => { throw new Error("Unexpected follower request") },
          fetchRelationStat: async () => { throw new Error("Unexpected follower request") }, stop: () => followerStop.promise } })
      f.state.beforeResponse = () => response.promise
      const pending = runtime.addBilibiliLiveRoom({ uid: "2" }).catch((error: unknown) => error)
      await vi.waitFor(() => expect(f.calls).toHaveLength(1))
      stopping = runtime.stop()
      response.resolve()
      expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
      expect(f.state.stops).toBe(1)
      followerStop.resolve()
      await stopping
      const database = await ControlDatabase.open(directory)
      try { expect(database.listBilibiliLiveRooms()).toEqual([])
        expect(database.listBilibiliApiCalls(f.calls[0]!.taskId)).toEqual([]) } finally { database.close() }
    } finally {
      response.resolve(); followerStop.resolve()
      await stopping; await runtime?.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
