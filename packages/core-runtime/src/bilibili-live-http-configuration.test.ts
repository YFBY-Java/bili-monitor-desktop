import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"

describe("live HTTP configuration through actual Core and Python stdio", () => {
  let directory: string
  let core: LocalCoreRuntime | undefined
  afterEach(async () => { await core?.stop(); core = undefined; vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true }) })
  it.each([false, true])("applies custom HTTP settings from disk/environment (environment=%s)", async useEnvironment => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-http-config-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    const http = { connectTimeoutMs: 1200, readTimeoutMs: 0,
      userAgent: "Fixture local monitor/2", referer: "https://live.bilibili.com/2" }
    const original = JSON.stringify({ enabled: false, maxAttempts: 1, ...(!useEnvironment ? http : {}) })
    await writeFile(path, original, "utf8")
    for (const suffix of ["CONNECT_TIMEOUT_MS", "READ_TIMEOUT_MS", "USER_AGENT", "REFERER"]) {
      vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${suffix}`, undefined)
    }
    if (useEnvironment) {
      vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_CONNECT_TIMEOUT_MS", "1200")
      vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_READ_TIMEOUT_MS", "0")
      vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_USER_AGENT", http.userAgent)
      vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_REFERER", http.referer)
    }
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_http_configuration"))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    expect(room).toMatchObject({ uid: "2", roomId: "102", uname: "合成HTTP配置主播" })
    expect(core.listBilibiliLiveRooms().items).toEqual([room])
    expect(await readFile(path, "utf8")).toBe(original)
  }, 15000)
})
