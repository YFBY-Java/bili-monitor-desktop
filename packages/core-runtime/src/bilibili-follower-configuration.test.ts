import { access, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { LocalCoreRuntime } from "./local-core-runtime"
import { followerConfigurationFixture, followerStoredRows } from "./__fixtures__/follower-configuration"

const id = "019a0100-0000-7000-8000-000000000001"
const operations: Array<[string, (core: LocalCoreRuntime) => unknown]> = [
  ["list", core => core.listBilibiliFollowerMonitors()],
  ["add", core => core.addBilibiliFollowerMonitor({ mid: "2" })],
  ["status", core => core.updateBilibiliFollowerMonitorStatus(id, false)],
  ["settings", core => core.updateBilibiliFollowerMonitorSettings(id, 600)],
  ["refresh", core => core.refreshBilibiliFollowerMonitor(id)],
  ["delete", core => core.deleteBilibiliFollowerMonitor(id)],
  ["trend", core => core.queryBilibiliFollowerTrend(id)],
  ["trends", core => core.queryBilibiliFollowerTrends()]
]

describe("original follower startup configuration through the real Core", () => {
  let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
  afterEach(async () => {
    await fixture?.close(); fixture = undefined
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
  })
  async function setup(configuration: unknown = {}, subject: unknown = {}) {
    fixture = await followerConfigurationFixture(configuration, subject)
    return fixture
  }

  it("rejects the mandatory follower/workbench dependency before opening SQLite", async () => {
    const f = await setup({ storageEnabled: false })
    const result = await f.start().then(() => undefined, (error: unknown) => error)
    expect(result).toMatchObject({ code: "BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID" })
    await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    expect(f.calls).toEqual([])
  })

  it.each(["file", "environment"])("disables all eight follower operations through %s without disabling live", async mode => {
    const f = await setup({ storageEnabled: mode !== "file" }, { enabled: false })
    if (mode === "environment") vi.stubEnv("SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED", "FALSE")
    const contents = await readFile(f.path, "utf8")
    const core = await f.start()
    for (const [name, invoke] of operations) {
      await expect(Promise.resolve().then(() => invoke(core)), name)
        .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_STORAGE_DISABLED", retryable: false })
    }
    expect(f.calls).toEqual([])
    expect((await core.addBilibiliLiveRoom({ uid: "2" })).uid).toBe("2")
    expect(await readFile(f.path, "utf8")).toBe(contents)
  })

  it.each([null, { enabled: "false" }, { schedulerDelayMs: 0 }, { extra: "synthetic-private-follower" }])(
    "does not ignore malformed startup configuration: %j", async configuration => {
      const f = await setup(configuration)
      const result = await f.start().then(() => undefined, (error: unknown) => error)
      expect(result).toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
      expect(String(result)).not.toMatch(/synthetic-private|\.mjs|D:\\/u)
      await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    })

  it("applies configured defaults without rewriting saved monitors when configuration changes", async () => {
    const f = await setup({ defaultIntervalSeconds: 420, requestMinIntervalMs: 0 })
    let core = await f.start()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    expect(user.intervalSeconds).toBe(420)
    await f.stop()
    await writeFile(f.path, '{"defaultIntervalSeconds":480,"requestMinIntervalMs":0}', "utf8")
    core = await f.start()
    expect(core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect((await core.addBilibiliFollowerMonitor({ mid: "3" })).intervalSeconds).toBe(480)
  })

  it.each([" false ", "off", "no", "0", ""])("keeps real follower operations and workbench for storage condition %j", async value => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED", value)
    const core = await f.start()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    expect(core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect(core.queryBilibiliFollowerTrend(user.id).points).toHaveLength(1)
    expect(core.listBilibiliSubjects()).toEqual([])
    expect(f.calls).toHaveLength(1)
  })

  it("consumes Spring-bound default interval in the actual stored monitor", async () => {
    const f = await setup({ requestMinIntervalMs: 0 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_DEFAULTINTERVALSECONDS", "0x1a4")
    const core = await f.start()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    expect(user.intervalSeconds).toBe(420)
    expect(core.listBilibiliFollowerMonitors().items[0]?.intervalSeconds).toBe(420)
  })

  it("uses enabled=yes and bound configuration in real automatic due collection", async () => {
    const f = await setup({ requestMinIntervalMs: 0, defaultIntervalSeconds: 1 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "yes")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "250")
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

  it.each(["false", "off"])("disabled automatic collection retains manual collection for enabled=%j", async value => {
    const f = await setup({ requestMinIntervalMs: 0 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", value)
    if (value === "false") vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "0")
    vi.useFakeTimers()
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    const core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scan).not.toHaveBeenCalled()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    f.state.count = 150
    expect(await core.refreshBilibiliFollowerMonitor(user.id)).toMatchObject({ followerCount: 150 })
    expect(core.queryBilibiliFollowerTrend(user.id).points).toHaveLength(1)
    expect(f.calls).toHaveLength(2)
  })

  it("fails raw scheduler validation before opening SQLite, then recovers without changing history", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    let core = await f.start()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
    await f.stop()
    const before = followerStoredRows(f.directory)
    f.calls.length = 0
    const open = vi.spyOn(ControlDatabase, "open")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "off")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "0x3")
    await expect(f.start()).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    expect(open).not.toHaveBeenCalled()
    expect(f.calls).toEqual([])
    expect(followerStoredRows(f.directory)).toEqual(before)
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "false")
    core = await f.start()
    expect(core.listBilibiliFollowerMonitors().items).toEqual([user])
    expect(followerStoredRows(f.directory)).toEqual(before)
  })

  it("allows valid typed delay fields to be superseded, but cannot mask malformed file types", async () => {
    const f = await setup({ schedulerDelayMs: 0, requestMinIntervalMs: 0 })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "false")
    const core = await f.start()
    expect((await core.addBilibiliFollowerMonitor({ mid: "2" })).mid).toBe("2")
    await f.stop()
    await writeFile(f.path, '{"schedulerDelayMs":"0"}', "utf8")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "1000")
    await expect(f.start()).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })

  it("disables only automatic scans while keeping manual follower collection and the workbench available", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    const core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scan).not.toHaveBeenCalled()
    const user = await core.addBilibiliFollowerMonitor({ mid: "2", intervalSeconds: 1 })
    f.state.count = 150
    expect(await core.refreshBilibiliFollowerMonitor(user.id)).toMatchObject({ followerCount: 150 })
    expect(core.listBilibiliSubjects()).toEqual([])
    expect(f.calls).toHaveLength(2)
  })

  it("resolves live masked names independently, without follower persistence or retries", async () => {
    const f = await setup({ storageEnabled: false, requestMinIntervalMs: 0 }, { enabled: false })
    const core = await f.start()
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const connection = await core.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const before = followerStoredRows(f.directory)
    const now = new Date().toISOString()
    f.realtime.listeners.get(connection.sessionId!)!({ type: "command", receivedAt: now,
      event: { command: "DANMU_MSG", kind: "DANMAKU", occurredAt: now, receivedAt: now,
        actor: { uid: "99", displayName: "合**" }, messageText: "合成独立昵称事件", giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
    await new Promise<void>(done => setImmediate(done))
    expect(core.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })[0]?.displayName).toBe("合成配置昵称99")
    expect(f.calls.map(call => call.request.mid)).toEqual(["99"])
    expect(followerStoredRows(f.directory)).toEqual(before)
  })

  it("retains follower history, status, schedule and workbench bindings across disable/re-enable", async () => {
    const f = await setup({ enabled: false, requestMinIntervalMs: 0 })
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    let core = await f.start()
    const subject = await core.createBilibiliSubject({ mid: "2", displayName: "合成保留对象", danmuEnabled: false })
    const user = core.listBilibiliFollowerMonitors().items[0]!
    await vi.advanceTimersByTimeAsync(2000)
    f.state.count = 150
    await core.refreshBilibiliFollowerMonitor(user.id)
    core.updateBilibiliFollowerMonitorSettings(user.id, 450)
    core.updateBilibiliFollowerMonitorStatus(user.id, false)
    const monitor = core.listBilibiliFollowerMonitors().items[0]!
    const trend = core.queryBilibiliFollowerTrend(user.id)
    expect(trend.points).toHaveLength(2)
    await f.stop()
    const before = followerStoredRows(f.directory)
    await writeFile(f.path, '{"storageEnabled":false}', "utf8")
    await writeFile(f.subjectPath, '{"enabled":false}', "utf8")
    f.calls.length = 0
    const scan = vi.spyOn(BilibiliFollowerMonitorService.prototype, "collectDueUsersV2")
    core = await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scan).not.toHaveBeenCalled()
    expect(f.calls).toEqual([])
    await f.stop()
    expect(followerStoredRows(f.directory)).toEqual(before)
    await writeFile(f.path, '{"enabled":false,"defaultIntervalSeconds":600}', "utf8")
    await writeFile(f.subjectPath, '{}', "utf8")
    core = await f.start()
    expect(core.listBilibiliFollowerMonitors().items).toEqual([monitor])
    expect(core.queryBilibiliFollowerTrend(user.id)).toEqual(trend)
    expect(core.getBilibiliSubject(subject.id).bilibiliBinding).toEqual(subject.bilibiliBinding)
    expect(followerStoredRows(f.directory)).toEqual(before)
  })

  it("does not create or stop the profile source when both stores are disabled", async () => {
    const f = await setup({ storageEnabled: false }, { enabled: false })
    await writeFile(resolve(f.directory, "config/bilibili-live-collection.json"), '{"storageEnabled":false}', "utf8")
    vi.useFakeTimers()
    await f.start(true)
    await vi.advanceTimersByTimeAsync(10_000)
    await f.stop()
    expect(f.calls).toEqual([])
    expect(f.state.stops).toBe(0)
    expect(f.live.state.stops).toBe(0)
    expect(f.realtime.starts).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("attempts a failed independent nickname once and caches the original masked name", async () => {
    const f = await setup({ storageEnabled: false, maxAttempts: 10 }, { enabled: false })
    const core = await f.start()
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const connection = await core.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const before = followerStoredRows(f.directory)
    f.state.failure = Object.assign(new Error("synthetic unavailable profile"), { code: "BILIBILI_NETWORK_ERROR" })
    const now = new Date().toISOString()
    for (let index = 0; index < 2; index++) {
      f.realtime.listeners.get(connection.sessionId!)!({ type: "command", receivedAt: now,
        event: { command: "DANMU_MSG", kind: "DANMAKU", occurredAt: now, receivedAt: now,
          actor: { uid: "99", displayName: "合**" }, messageText: `合成事件${index}`, giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
      await new Promise<void>(done => setImmediate(done))
    }
    expect(core.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id }).map(item => item.displayName)).toEqual(["合**", "合**"])
    expect(f.calls).toHaveLength(1)
    expect(followerStoredRows(f.directory)).toEqual(before)
    await f.stop()
    expect(f.state.stops).toBe(1)
  })

  it.each([false, true])("drops a late independent profile after Core closes SQLite (failure=%s)", async failure => {
    const f = await setup({ storageEnabled: false }, { enabled: false })
    const core = await f.start()
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const connection = await core.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    let release: () => void = () => {}
    f.state.before = () => new Promise<void>(done => { release = done })
    const now = new Date().toISOString()
    f.realtime.listeners.get(connection.sessionId!)!({ type: "command", receivedAt: now,
      event: { command: "DANMU_MSG", kind: "DANMAKU", occurredAt: now, receivedAt: now,
        actor: { uid: "99", displayName: "合**" }, messageText: "合成迟到昵称", giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
    await new Promise<void>(done => setImmediate(done))
    expect(f.calls).toHaveLength(1)
    await f.stop()
    const before = followerStoredRows(f.directory)
    const writes = vi.spyOn(ControlDatabase.prototype, "recordBilibiliLiveDanmakuEvent")
    if (failure) f.state.failure = new Error("synthetic late profile failure")
    release()
    await new Promise<void>(done => setImmediate(done))
    expect(followerStoredRows(f.directory)).toEqual(before)
    expect(writes).not.toHaveBeenCalled()
    expect(f.state.stops).toBe(1)
  })
})
