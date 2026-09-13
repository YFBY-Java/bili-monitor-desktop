import { randomBytes, randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliLiveDanmakuService } from "./bilibili-live-danmaku-service"
import { liveLifecycleSource, liveResponseGate } from "./__fixtures__/live-lifecycle"

describe("persisted live collection configuration in real local Core", () => {
  let directory: string
  let runtime: LocalCoreRuntime | undefined
  const gates: ReturnType<typeof liveResponseGate>[] = []
  afterEach(async () => {
    for (const gate of gates.splice(0)) gate.resolve()
    await runtime?.stop(); runtime = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  async function prepare(configuration?: unknown, seed = 0) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-config-"))
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T04:00:00Z"))
    for (const key of ["MONITOR_ENABLED", "SCHEDULER_DELAY_MS", "DUE_BATCH_SIZE", "STATUS_BATCH_SIZE"]) {
      vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${key}`, undefined)
    }
    const configPath = resolve(directory, "config", "bilibili-live-collection.json")
    if (configuration !== undefined) {
      await mkdir(resolve(directory, "config"))
      await writeFile(configPath, JSON.stringify(configuration), "utf8")
    }
    const f = liveLifecycleSource()
    if (seed) {
      const database = await ControlDatabase.open(directory)
      const service = new BilibiliLiveMonitorService({ database, source: f.source,
        idFactory: randomUUID, now: () => new Date(), requestMinIntervalMs: 0 })
      try {
        for (let uid = 1; uid <= seed; uid++) {
          const room = await service.addRoom({ uid: String(uid), intervalSeconds: 1 })
          service.updateStatus(room.id, true)
        }
      } finally { await service.stop(); database.close() }
      f.calls.length = 0
    }
    const options = { dataDirectory: directory, version: "test", credentialKey: randomBytes(32), liveSource: f.source }
    return { ...f, configPath, options, start: async () => { runtime = await LocalCoreRuntime.start(options); return runtime } }
  }

  it("disables only automatic REST collection, preserves manual work and rereads configuration on restart", async () => {
    const f = await prepare({ enabled: false }, 1)
    const followerScan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsers")
    const danmakuScan = vi.spyOn(BilibiliLiveDanmakuService.prototype, "syncAutoConnections")
    let core = await f.start()
    const room = core.listBilibiliLiveRooms().items[0]!
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.calls).toEqual([])
    expect(followerScan).toHaveBeenCalledTimes(5)
    expect(danmakuScan).toHaveBeenCalledTimes(1)
    expect(await core.refreshBilibiliLiveRoom(room.id)).toMatchObject({ success: true })
    core.updateBilibiliLiveRoomSettings(room.id, 120)
    expect(core.listBilibiliLiveRooms().items[0]?.intervalSeconds).toBe(120)
    await core.stop()
    await writeFile(f.configPath, JSON.stringify({ enabled: true }), "utf8")
    core = await f.start()
    core.updateBilibiliLiveRoomStatus(room.id, true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.calls.filter(call => call.method === "status")).toHaveLength(2)
    expect(core.listBilibiliLiveRooms().items[0]?.id).toBe(room.id)
  })

  it("uses configured sub-second fixed delay after completing a held batch, with no overlap", async () => {
    const f = await prepare({ schedulerDelayMs: 250 }, 1)
    const gate = liveResponseGate(); gates.push(gate)
    f.state.beforeResponse = () => gate.promise
    const scan = vi.spyOn(ControlDatabase.prototype, "findDueBilibiliLiveRooms")
    await f.start()
    await vi.advanceTimersByTimeAsync(750)
    expect(scan).toHaveBeenCalledTimes(1)
    expect(f.calls).toHaveLength(1)
    gate.resolve(); await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(249)
    expect(scan).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it("passes both configured batch sizes from disk into actual persisted room collection", async () => {
    const configuration = { dueBatchSize: 75, statusBatchSize: 64, schedulerDelayMs: 5000 }
    const f = await prepare(configuration, 76)
    // Seed and collection must be in different seconds: original snapshots upsert within a second.
    vi.setSystemTime(new Date(Date.now() + 1000))
    const core = await f.start()
    await vi.advanceTimersByTimeAsync(1500)
    expect(f.calls.map(call => call.ids.length)).toEqual([64, 11])
    const items = core.listBilibiliLiveRooms().items
    expect(items.filter(room => room.recentTrend.length === 2)).toHaveLength(75)
    expect(items).toHaveLength(76)
    expect(JSON.parse(await readFile(f.configPath, "utf8"))).toEqual(configuration)
  })

  it("keeps original batch clamping and lets original environment variables override disk", async () => {
    const f = await prepare({ enabled: false, dueBatchSize: 20, statusBatchSize: 30 }, 3)
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED", "true")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE", "0")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_STATUS_BATCH_SIZE", "-9")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_SCHEDULER_DELAY_MS", "250")
    const scan = vi.spyOn(ControlDatabase.prototype, "findDueBilibiliLiveRooms")
    await f.start(); await vi.advanceTimersByTimeAsync(0)
    expect(f.calls.map(call => call.ids)).toEqual([["1"]])
    await vi.advanceTimersByTimeAsync(250)
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it("keeps the explicit host scheduler opt-out above file configuration", async () => {
    const f = await prepare({ enabled: true, schedulerDelayMs: 250 }, 1)
    runtime = await LocalCoreRuntime.start({ ...f.options, schedulerEnabled: false })
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.calls).toEqual([])
  })

  it.each([{ enabled: "false" }, { enabled: null }, { schedulerDelayMs: 0 }, { dueBatchSize: 1.5 },
    { statusBatchSize: 2147483648 }, { secret: "synthetic-private-setting" }])(
    "rejects invalid configuration before opening a database: %j", async configuration => {
      const f = await prepare(configuration)
      const error = await f.start().then(() => undefined, (caught: unknown) => caught)
      expect(error).toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
      expect(String(error)).not.toContain("synthetic-private-setting")
      await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    })

  it("rejects malformed JSON and malformed original environment values without exposing their contents", async () => {
    const f = await prepare({})
    await writeFile(f.configPath, "synthetic-private-json{", "utf8")
    const invalidJson = await f.start().then(() => undefined, (error: unknown) => error)
    expect(invalidJson).toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
    expect(String(invalidJson)).not.toContain("synthetic-private-json")
    await writeFile(f.configPath, "{}", "utf8")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE", "synthetic-private-env")
    const invalidEnv = await f.start().then(() => undefined, (error: unknown) => error)
    expect(invalidEnv).toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
    expect(String(invalidEnv)).not.toContain("synthetic-private-env")
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
  })
})
