import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { LocalCoreRuntime } from "./local-core-runtime"
import { followerConfigurationFixture, followerStoredRows } from "./__fixtures__/follower-configuration"

describe("follower placeholders consumed by the actual Core", () => {
  let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
  let pythonRuntime: LocalCoreRuntime | undefined
  afterEach(async () => {
    await pythonRuntime?.stop(); pythonRuntime = undefined
    await fixture?.close(); fixture = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
  })
  async function setup(configuration: unknown = {}, subject: unknown = {}) {
    fixture = await followerConfigurationFixture(configuration, subject)
    return fixture
  }

  it("stores the resolved default interval and consumes resolved HTTP through actual Python collection", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0,
      userAgent: "${BMD_SYNTHETIC_AGENT:Fixture follower/2}",
      referer: "${BMD_SYNTHETIC_REFERER:https://www.bilibili.com/configured-follower}" })
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_http_configuration"))
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_DEFAULTINTERVALSECONDS", "${BMD_SYNTHETIC_INTERVAL:0x1a4}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_CONNECTTIMEOUTMS", "${BMD_SYNTHETIC_TIMEOUT:1250}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_READTIMEOUTMS", "${BMD_SYNTHETIC_TIMEOUT:0}")
    const contents = await readFile(f.path, "utf8")
    const { followerSource: _followerSource, ...options } = f.options
    const core = pythonRuntime = await LocalCoreRuntime.start({ ...options, schedulerEnabled: false })
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    expect(user.intervalSeconds).toBe(420)
    expect(core.listBilibiliFollowerMonitors().items[0]?.intervalSeconds).toBe(420)
    // The fixed HTTP fixture asserts all four settings inside actual httpx.
    expect(user).toMatchObject({ nickname: "合成HTTP粉丝", currentFollowerCount: 20 })
    expect(core.queryBilibiliFollowerTrend(user.id).points).toHaveLength(1)
    expect(await core.refreshBilibiliFollowerMonitor(user.id))
      .toMatchObject({ success: true, followerCount: 30, sourceEndpoint: "x/relation/stat" })
    expect(core.queryBilibiliFollowerTrend(user.id).points.at(-1)?.followerCount).toBe(30)
    expect(await readFile(f.path, "utf8")).toBe(contents)
  }, 20_000)

  it("uses resolved enabled/delay in automatic collection and respects pause", async () => {
    const f = await setup({ requestMinIntervalMs: 0, defaultIntervalSeconds: 1 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "${BMD_SYNTHETIC_ENABLED:yes}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "${BMD_SYNTHETIC_DELAY:250}")
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"))
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    const core = await f.start(true)
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    f.state.count = 150
    await vi.advanceTimersByTimeAsync(1200)
    expect(scan.mock.calls.length).toBeGreaterThan(1)
    expect(core.listBilibiliFollowerMonitors().items[0]?.currentFollowerCount).toBe(150)
    expect(core.queryBilibiliFollowerTrend(user.id).points).toHaveLength(2)
    core.updateBilibiliFollowerMonitorStatus(user.id, false)
    const calls = f.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.calls).toHaveLength(calls)
  })

  it("resolved false condition accepts zero delay while retaining manual collection", async () => {
    const f = await setup({ requestMinIntervalMs: 0 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "${BMD_SYNTHETIC_ENABLED:false}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "${BMD_SYNTHETIC_DELAY:0}")
    vi.useFakeTimers()
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    const core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scan).not.toHaveBeenCalled()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    f.state.count = 150
    expect(await core.refreshBilibiliFollowerMonitor(user.id)).toMatchObject({ followerCount: 150 })
    expect(f.calls).toHaveLength(2)
    expect(core.listBilibiliFollowerMonitors().items[0]?.currentFollowerCount).toBe(150)
  })

  it("resolved storage false disables all eight operations without disabling live", async () => {
    const f = await setup({}, { enabled: false })
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED", "${BMD_SYNTHETIC_STORAGE:false}")
    const core = await f.start()
    const id = "019a0100-0000-7000-8000-000000000001"
    const operations = [
      () => core.listBilibiliFollowerMonitors(), () => core.addBilibiliFollowerMonitor({ mid: "2" }),
      () => core.updateBilibiliFollowerMonitorStatus(id, false),
      () => core.updateBilibiliFollowerMonitorSettings(id, 600),
      () => core.refreshBilibiliFollowerMonitor(id), () => core.deleteBilibiliFollowerMonitor(id),
      () => core.queryBilibiliFollowerTrend(id), () => core.queryBilibiliFollowerTrends()
    ]
    for (const invoke of operations) await expect(Promise.resolve().then(invoke))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_STORAGE_DISABLED" })
    expect(f.calls).toEqual([])
    expect((await core.addBilibiliLiveRoom({ uid: "2" })).uid).toBe("2")
  })

  it("does not skip strict storage resolution when enabled has resolved to false", async () => {
    const f = await setup()
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "${BMD_SYNTHETIC_ENABLED:false}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "${BMD_SYNTHETIC_UNRESOLVED}")
    const open = vi.spyOn(ControlDatabase, "open")
    await expect(f.start()).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    expect(open).not.toHaveBeenCalled()
    await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    expect(f.calls).toEqual([])
  })

  it("rejects a cyclic startup before SQLite and recovers without rewriting history", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    let core = await f.start()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    await f.stop()
    const before = followerStoredRows(f.directory), contents = await readFile(f.path, "utf8")
    f.calls.length = 0
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "${BMD_SYNTHETIC_CYCLE}")
    vi.stubEnv("BMD_SYNTHETIC_CYCLE", "${BMD_SYNTHETIC_CYCLE}")
    const open = vi.spyOn(ControlDatabase, "open")
    await expect(f.start()).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    expect(open).not.toHaveBeenCalled()
    expect(f.calls).toEqual([])
    expect(followerStoredRows(f.directory)).toEqual(before)
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "${BMD_SYNTHETIC_STORAGE:true}")
    core = await f.start()
    expect(core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect(followerStoredRows(f.directory)).toEqual(before)
    expect(await readFile(f.path, "utf8")).toBe(contents)
  })
})
