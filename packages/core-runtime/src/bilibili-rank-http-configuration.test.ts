import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"

describe("original rank HTTP settings through actual Core and Python", () => {
  let directory: string
  let core: LocalCoreRuntime | undefined
  afterEach(async () => {
    await core?.stop(); core = undefined; vi.unstubAllEnvs()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  it.each([false, true])("applies disk/environment settings to audience, WBI, guard and fallback (env=%s)", async useEnvironment => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    const http = { connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture rank configuration/2", referer: "https://live.bilibili.com/configured-rank" }
    const original = JSON.stringify({ enabled: false, maxAttempts: 1, ...(!useEnvironment ? http : {}) })
    await writeFile(path, original, "utf8")
    const variables = { CONNECT_TIMEOUT_MS: "1250", READ_TIMEOUT_MS: "0", USER_AGENT: http.userAgent, REFERER: http.referer }
    for (const [key, value] of Object.entries(variables)) {
      vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${key}`, useEnvironment ? value : undefined)
    }
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["contribution_rank", "guard_weekly"] })
    expect(result).toMatchObject({ successCount: 2, errors: [] })
    expect(result.summary.snapshots.map(item => item.entries[0]?.displayName))
      .toEqual(["合成配置榜单观众", "合成配置榜单观众"])
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(result.summary)
    const fallbackRoom = await core.addBilibiliLiveRoom({ uid: "3" })
    const fallback = await core.refreshBilibiliLiveRanks({ roomMonitorId: fallbackRoom.id, types: ["contribution_rank"] })
    expect(fallback).toMatchObject({ successCount: 1, errors: [] })
    expect(fallback.summary.snapshots[0]?.sourceEndpoint).toBe("xlive/general-interface/v1/rank/getOnlineGoldRank")
    expect(await readFile(path, "utf8")).toBe(original)
  }, 20_000)
})
