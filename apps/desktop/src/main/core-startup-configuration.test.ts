import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { build } from "vite"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { LocalCoreController } from "./core-client"

const shell = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: shell.fork } }))

class IsolatedCoreProcess extends EventEmitter {
  pid: number | undefined
  stderr = new EventEmitter()
  constructor(readonly worker: Worker) {
    super()
    worker.on("online", () => { this.pid = worker.threadId; this.emit("spawn") })
    worker.on("message", message => this.emit("message", message))
    worker.stderr.on("data", chunk => this.stderr.emit("data", chunk))
    worker.on("error", error => this.stderr.emit("data", error instanceof Error ? error.stack ?? error.message : String(error)))
    worker.on("exit", code => { this.pid = undefined; this.emit("exit", code) })
  }
  postMessage(value: unknown) { this.worker.postMessage(value) }
  kill() { void this.worker.terminate() }
}

describe("collection configuration across Core entry and desktop host", () => {
  let buildDirectory: string
  let directory: string
  let core: LocalCoreController | undefined
  const workers: Worker[] = []
  const messages: Array<{ type: string; id: string; payload: unknown }> = []
  beforeAll(async () => {
    buildDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-config-entry-"))
    await build({ configFile: false, logLevel: "silent", ssr: { noExternal: true }, build: {
      ssr: fileURLToPath(new URL("./__fixtures__/core-process-worker.ts", import.meta.url)),
      outDir: buildDirectory, emptyOutDir: false, target: "node24",
      rollupOptions: { output: { entryFileNames: "core-worker.mjs", chunkFileNames: "[name]-[hash].mjs" } }
    } })
    shell.fork.mockImplementation((_entry: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
      const worker = new Worker(resolve(buildDirectory, "core-worker.mjs"), { env: options.env, stderr: true })
      workers.push(worker)
      worker.on("message", message => messages.push(message))
      return new IsolatedCoreProcess(worker)
    })
  }, 30_000)
  afterEach(async () => {
    messages.length = 0
    vi.unstubAllEnvs()
    await core?.stop(); core = undefined
    for (const worker of workers.splice(0)) await worker.terminate()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  afterAll(async () => { if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true }) })

  async function setup(contents: string) {
    for (const name of Object.keys(process.env)) {
      if (name.startsWith("APP_BILIBILI_FOLLOWERMONITOR_") || name.startsWith("SOCIAL_MONITOR_BILIBILI_FOLLOWER_")
        || name === "SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS") vi.stubEnv(name, undefined)
    }
    vi.stubEnv("APP_SUBJECTMONITOR_ENABLED", undefined)
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED", undefined)
    directory = await mkdtemp(resolve(tmpdir(), "bmd-core-config-host-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    await writeFile(path, contents, "utf8")
    core = new LocalCoreController({ entryPath: "test-only-worker-entry", dataDirectory: directory,
      credentialKeyBase64: randomBytes(32).toString("base64"), douyinOAuth: { mode: "disabled" },
      startupTimeoutMs: 10_000, requestTimeoutMs: 10_000 })
    return { controller: core, path }
  }
  it.each([
    { configuration: { unknown: "synthetic-private-follower" }, code: "BILIBILI_FOLLOWER_CONFIG_INVALID" },
    { configuration: { storageEnabled: false }, code: "BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID" }
  ])("returns safe $code before opening SQLite and recovers after correction", async sample => {
    const f = await setup('{"enabled":false}')
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    await writeFile(path, JSON.stringify(sample.configuration), "utf8")
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(new RegExp(`^${sample.code}: `))
    expect((error as Error).message).not.toMatch(/synthetic-private|core-process|\.mjs|\n|D:\\/u)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    await writeFile(path, '{"storageEnabled":false}', "utf8")
    await writeFile(resolve(directory, "config/subject-monitor.json"), '{"enabled":false}', "utf8")
    expect((await f.controller.start()).coreStatus.state).toBe("ready")
    await expect(f.controller.listBilibiliFollowerMonitors({})).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_STORAGE_DISABLED" })
    await expect(f.controller.listBilibiliSubjects({})).rejects.toMatchObject({ code: "SUBJECT_MONITOR_DISABLED" })
    expect((await f.controller.listBilibiliLiveRooms({})).total).toBe(0)
  }, 30_000)

  it("passes follower environment switches through the actual host without changing files", async () => {
    const f = await setup('{"enabled":false}')
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    await writeFile(path, '{"storageEnabled":true}', "utf8")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED", "true")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "false")
    vi.stubEnv("APP_SUBJECTMONITOR_ENABLED", "false")
    await f.controller.start()
    await expect(f.controller.addBilibiliFollowerMonitor({ mid: "2" })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_STORAGE_DISABLED" })
    expect(await readFile(path, "utf8")).toBe('{"storageEnabled":true}')
  }, 30_000)

  it("preserves raw follower scheduler errors through the actual host and recovers after condition changes", async () => {
    const f = await setup('{"enabled":false}')
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    await writeFile(path, '{"storageEnabled":true}', "utf8")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "off")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "0x3")
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^BILIBILI_FOLLOWER_CONFIG_INVALID: /)
    expect((error as Error).message).not.toMatch(/core-process|\.mjs|\n|D:\\/u)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "false")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", " false ")
    expect((await f.controller.start()).coreStatus.state).toBe("ready")
    expect(await f.controller.listBilibiliFollowerMonitors({})).toMatchObject({ total: 0 })
    expect(await readFile(path, "utf8")).toBe('{"storageEnabled":true}')
  }, 30_000)

  it("carries follower HTTP configuration through the host, actual Core and Python fallback", async () => {
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_http_configuration"))
    const f = await setup('{"enabled":false}')
    await writeFile(resolve(directory, "config/bilibili-follower-collection.json"), JSON.stringify({
      enabled: false, maxAttempts: 1, requestMinIntervalMs: 0, connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture follower/2", referer: "https://www.bilibili.com/configured-follower"
    }), "utf8")
    await f.controller.start()
    const user = await f.controller.addBilibiliFollowerMonitor({ mid: "2" })
    expect(user).toMatchObject({ nickname: "合成HTTP粉丝", currentFollowerCount: 20 })
    const result = await f.controller.refreshBilibiliFollowerMonitor({ userId: user.id })
    expect(result).toMatchObject({ success: true, followerCount: 30, sourceEndpoint: "x/relation/stat" })
    expect((await f.controller.listBilibiliFollowerMonitors({})).items[0]?.currentFollowerCount).toBe(30)
    for (const type of ["bilibili-followers.add", "bilibili-followers.refresh"]) {
      const alive = messages.find(message => message.type === "core.request-alive"
        && (message.payload as { requestType: string }).requestType === type)
      expect(alive).toBeDefined()
      expect(messages.find(message => message.type === `${type}.result`)?.id).toBe(alive?.id)
    }
  }, 30_000)
  it("preserves strict placeholder failures before SQLite and recovers through the actual host", async () => {
    const f = await setup('{"enabled":false}')
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    await writeFile(path, '{}', "utf8")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_ENABLED", "${BMD_SYNTHETIC_ENABLED:false}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "${BMD_SYNTHETIC_PRIVATE}")
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^BILIBILI_FOLLOWER_CONFIG_INVALID: /)
    expect((error as Error).message).not.toMatch(/BMD_SYNTHETIC_PRIVATE|core-process|\.mjs|\n|D:\\/u)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED", "${BMD_SYNTHETIC_STORAGE:true}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS", "${BMD_SYNTHETIC_DELAY:0}")
    expect((await f.controller.start()).coreStatus.state).toBe("ready")
    expect(await f.controller.listBilibiliFollowerMonitors({})).toMatchObject({ total: 0 })
    expect(await readFile(path, "utf8")).toBe('{}')
  }, 30_000)
  it("sends resolved follower settings from Host through actual Core to Python without Worker expansion", async () => {
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_http_configuration"))
    const f = await setup('{"enabled":false}')
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    const contents = JSON.stringify({ enabled: false, maxAttempts: 1, requestMinIntervalMs: 0,
      userAgent: "${BMD_SYNTHETIC_AGENT:Fixture follower/2}",
      referer: "${BMD_SYNTHETIC_REFERER:https://www.bilibili.com/configured-follower}" })
    await writeFile(path, contents, "utf8")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_CONNECTTIMEOUTMS", "${BMD_SYNTHETIC_CONNECT:1250}")
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_READTIMEOUTMS", "${BMD_SYNTHETIC_READ:0}")
    await f.controller.start()
    const user = await f.controller.addBilibiliFollowerMonitor({ mid: "2" })
    expect(user).toMatchObject({ nickname: "合成HTTP粉丝", currentFollowerCount: 20 })
    expect(await f.controller.refreshBilibiliFollowerMonitor({ userId: user.id }))
      .toMatchObject({ success: true, followerCount: 30, sourceEndpoint: "x/relation/stat" })
    expect(await readFile(path, "utf8")).toBe(contents)
  }, 30_000)
  it("returns only a stable actionable config error and can recover after correcting the file", async () => {
    const f = await setup('{"unknown":"synthetic-private-configuration"}')
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^BILIBILI_LIVE_CONFIG_INVALID: /)
    expect((error as Error).message).not.toMatch(/synthetic-private|core-process|\.mjs|\n|D:\\/u)
    expect(f.controller.isRunning()).toBe(false)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    await writeFile(f.path, '{"enabled":false}', "utf8")
    const recovered = await f.controller.start()
    expect(recovered.coreStatus).toMatchObject({ state: "ready", databaseReady: true })
  }, 30_000)
  it.each([
    { live: { storageEnabled: false }, subject: undefined, code: "BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID" },
    { live: {}, subject: '{"enabled":"synthetic-private"}', code: "SUBJECT_MONITOR_CONFIG_INVALID" }
  ])("preserves $code through the actual entry and host, then recovers after correction", async sample => {
    const f = await setup(JSON.stringify(sample.live))
    const subjectPath = resolve(directory, "config", "subject-monitor.json")
    if (sample.subject !== undefined) await writeFile(subjectPath, sample.subject, "utf8")
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(new RegExp(`^${sample.code}: `))
    expect((error as Error).message).not.toMatch(/synthetic-private|core-process|\.mjs|\n|D:\\/u)
    expect(f.controller.isRunning()).toBe(false)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    await writeFile(subjectPath, '{"enabled":false}', "utf8")
    expect((await f.controller.start()).coreStatus.state).toBe("ready")
    await expect(f.controller.listBilibiliSubjects({})).rejects.toMatchObject({ code: "SUBJECT_MONITOR_DISABLED" })
    if (sample.live.storageEnabled === false) {
      const roomMonitorId = "019a0100-0000-7000-8000-000000000001"
      const sessionId = "019a0100-0000-7000-8000-000000000002"
      const operations: Array<() => Promise<unknown>> = [
        () => f.controller.listBilibiliLiveRooms({}),
        () => f.controller.addBilibiliLiveRoom({ uid: "9" }),
        () => f.controller.getBilibiliLiveSummary(),
        () => f.controller.queryBilibiliLiveTrends({}),
        () => f.controller.listBilibiliLiveEvents({}),
        () => f.controller.getBilibiliLiveRankSummary({ roomMonitorId }),
        () => f.controller.refreshBilibiliLiveRanks({ roomMonitorId, types: ["contribution_rank"] }),
        () => f.controller.startBilibiliLiveDanmaku({ roomMonitorId }),
        () => f.controller.stopBilibiliLiveDanmaku({ roomMonitorId }),
        () => f.controller.getBilibiliLiveDanmakuRecent({ roomMonitorId }),
        () => f.controller.listBilibiliLiveSessions({ roomMonitorId }),
        () => f.controller.queryBilibiliLiveSessionEvents({ sessionId }),
        () => f.controller.getBilibiliLiveSessionInsight({ sessionId }),
        () => f.controller.prepareBilibiliLiveSessionExport({ sessionId, category: "all" })
      ]
      for (const invoke of operations) {
        await expect(invoke()).rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DISABLED" })
      }
      expect(f.controller.isRunning()).toBe(true)
      expect(await f.controller.listBilibiliFollowerMonitors({})).toMatchObject({ total: 0 })
    }
  }, 30_000)
  it("passes both environment switches through the actual host without changing the configuration files", async () => {
    const f = await setup('{"storageEnabled":true}')
    const subjectPath = resolve(directory, "config", "subject-monitor.json")
    await writeFile(subjectPath, '{"enabled":true}', "utf8")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED", "false")
    vi.stubEnv("APP_SUBJECTMONITOR_ENABLED", "false")
    expect((await f.controller.start()).coreStatus.state).toBe("ready")
    await expect(f.controller.listBilibiliLiveRooms({})).rejects.toMatchObject({ code: "BILIBILI_LIVE_STORAGE_DISABLED" })
    await expect(f.controller.listBilibiliSubjects({})).rejects.toMatchObject({ code: "SUBJECT_MONITOR_DISABLED" })
    expect(await readFile(f.path, "utf8")).toBe('{"storageEnabled":true}')
    expect(await readFile(subjectPath, "utf8")).toBe('{"enabled":true}')
  }, 30_000)
  it("emits opt-in liveness from the actual Core entry before returning the actual Python collection result", async () => {
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_http_configuration"))
    const f = await setup(JSON.stringify({ enabled: false, maxAttempts: 1, connectTimeoutMs: 1200, readTimeoutMs: 0,
      userAgent: "Fixture local monitor/2", referer: "https://live.bilibili.com/2" }))
    await f.controller.start()
    expect(await f.controller.addBilibiliLiveRoom({ uid: "2" })).toMatchObject({ uname: "合成HTTP配置主播" })
    const alive = messages.find(message => message.type === "core.request-alive")
    expect(alive?.payload).toEqual({ requestType: "bilibili-live.rooms.add" })
    expect(messages.find(message => message.type === "bilibili-live.rooms.add.result")?.id).toBe(alive?.id)
  }, 30_000)
  it("emits rank liveness from the actual Core entry and persists the configured Python result", async () => {
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    const f = await setup(JSON.stringify({ enabled: false, maxAttempts: 1, connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture rank configuration/2", referer: "https://live.bilibili.com/configured-rank" }))
    await f.controller.start()
    const room = await f.controller.addBilibiliLiveRoom({ uid: "2" })
    messages.length = 0
    const result = await f.controller.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(result).toMatchObject({ successCount: 1, errors: [] })
    expect(result.summary.snapshots[0]?.entries[0]?.displayName).toBe("合成配置榜单观众")
    const alive = messages.find(message => message.type === "core.request-alive")
    expect(alive?.payload).toEqual({ requestType: "bilibili-live.ranks.refresh" })
    expect(messages.find(message => message.type === "bilibili-live.ranks.refresh.result")?.id).toBe(alive?.id)
  }, 30_000)
})
