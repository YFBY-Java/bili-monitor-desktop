import { randomBytes } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { BilibiliLiveRankRefreshInputSchema, type BilibiliLiveRankWorkerRequest } from "@bmd/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { liveLifecycleSource } from "./__fixtures__/live-lifecycle"
import { LocalCoreRuntime } from "./local-core-runtime"
import { LocalRequestRateLimiter } from "./local-request-rate-limiter"

describe("original rank collection configuration through Core and SQLite", () => {
  let directory: string | undefined
  let core: LocalCoreRuntime | undefined
  const calls: BilibiliLiveRankWorkerRequest[] = []
  afterEach(async () => {
    await core?.stop(); core = undefined
    vi.restoreAllMocks(); vi.unstubAllEnvs(); calls.length = 0
    if (directory) {
      const target = resolve(directory)
      if (!/^D:\\/iu.test(target) || dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("bmd-rank-config-")) {
        throw new Error("Unexpected rank configuration cleanup target")
      }
      await rm(target, { recursive: true, force: true }); directory = undefined
    }
  })
  async function start() {
    core = await LocalCoreRuntime.start({ dataDirectory: directory!, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32), liveSource: liveLifecycleSource().source,
      liveRankSource: { fetch: async request => {
        calls.push(request)
        return { rankFamily: request.family, rankType: request.type, pageNo: request.page, pageSize: request.pageSize,
          ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}), periodScope: request.periodScope!,
          totalCount: 0, sourceEndpoint: request.endpoint!, signedRequired: request.family === "AUDIENCE",
          capturedAt: "2026-10-11T04:00:00.000Z", entries: [], statusCode: 200, durationMs: 1,
          evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
            relativePath: "cas/synthetic-rank.json", sizeBytes: 2, mediaType: "application/json" } }
      } } })
    return core
  }
  async function configure(value: unknown) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-rank.json"), JSON.stringify(value))
  }

  it("uses configured defaults after request validation and preserves stored ranks across disabling", async () => {
    await configure({ pageSize: 7, guardPageSize: 9, maxPages: 2, requestMinIntervalMs: 0, webLocation: "155.7" })
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_RANK_PAGE_SIZE", "13")
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_RANK_PAGESIZE", "11")
    const acquire = vi.spyOn(LocalRequestRateLimiter.prototype, "acquire")
    const runtime = await start()
    const room = await runtime.addBilibiliLiveRoom({ uid: "9" })
    const result = await runtime.refreshBilibiliLiveRanksV2(BilibiliLiveRankRefreshInputSchema.parse({
      roomMonitorId: room.id, types: ["daily_rank", "guard_weekly"] }))
    expect(result).toMatchObject({ successCount: 4, errors: [] })
    expect(calls.map(({ family, page, pageSize, webLocation }) => ({ family, page, pageSize, webLocation })))
      .toEqual([
        { family: "AUDIENCE", page: 1, pageSize: 11, webLocation: "155.7" },
        { family: "AUDIENCE", page: 2, pageSize: 11, webLocation: "155.7" },
        { family: "GUARD", page: 1, pageSize: 9, webLocation: "155.7" },
        { family: "GUARD", page: 2, pageSize: 9, webLocation: "155.7" }
      ])
    expect(acquire.mock.calls.filter(([request]) => request.policyKey === "live-rank").map(([request]) => request.minIntervalMs))
      .toEqual([0, 0, 0, 0])
    expect((await runtime.refreshBilibiliLiveRanksV2({ roomMonitorId: room.id, types: ["daily_rank"], maxPages: 1 })).successCount).toBe(1)
    const saved = runtime.getBilibiliLiveRankSummaryV2(room.id)
    const configurationBytes = await readFile(resolve(directory!, "config", "bilibili-live-rank.json"))
    await runtime.stop(); core = undefined
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_RANK_ENABLED", "false")
    const disabled = await start()
    const operations: Array<() => unknown> = [() => disabled.getBilibiliLiveRankSummary(room.id), () => disabled.getBilibiliLiveRankSummaryV2(room.id),
      () => disabled.getLatestBilibiliLiveRank({ roomMonitorId: room.id }), () => disabled.getLatestBilibiliLiveRankV2({ roomMonitorId: room.id }),
      () => disabled.refreshBilibiliLiveRanks({ roomMonitorId: room.id }), () => disabled.refreshBilibiliLiveRanksV2({ roomMonitorId: room.id })]
    for (const operation of operations) {
      await expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code: "BILIBILI_LIVE_RANK_DISABLED" })
    }
    expect(disabled.listBilibiliLiveRooms().items.map(item => item.id)).toContain(room.id)
    await disabled.stop(); core = undefined
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_RANK_ENABLED", "true")
    expect((await start()).getBilibiliLiveRankSummaryV2(room.id)).toEqual(saved)
    expect(await readFile(resolve(directory!, "config", "bilibili-live-rank.json"))).toEqual(configurationBytes)
    await core!.stop(); core = undefined
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_RANK_PAGE_SIZE", undefined)
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_RANK_PAGESIZE", undefined)
    await writeFile(resolve(directory!, "config", "bilibili-live-rank.json"), JSON.stringify({
      pageSize: -1, guardPageSize: 100, maxPages: 0, requestMinIntervalMs: -1, webLocation: "x}y" }))
    calls.length = 0
    expect((await (await start()).refreshBilibiliLiveRanksV2({ roomMonitorId: room.id,
      types: ["daily_rank", "guard_weekly"] })).successCount).toBe(2)
    expect(calls.map(request => [request.page, request.pageSize, request.webLocation])).toEqual([[1, 1, "x}y"], [1, 30, "x}y"]])
  })

  it("rejects malformed rank configuration before opening the database", async () => {
    await configure({ pageSize: 1.5 })
    await expect(start()).rejects.toMatchObject({ code: "BILIBILI_LIVE_RANK_CONFIG_INVALID" })
    await expect(access(resolve(directory!, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
  })
})
