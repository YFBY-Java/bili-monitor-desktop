import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliLiveRankFetchedSnapshot, BilibiliLiveRankWorkerRequest } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { liveLifecycleSource } from "./__fixtures__/live-lifecycle"

function deferred<T>() {
  let resolveValue!: (value: T) => void
  let rejectValue!: (error: Error) => void
  const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject })
  return { promise, resolve: resolveValue, reject: rejectValue }
}
function snapshot(request: BilibiliLiveRankWorkerRequest): BilibiliLiveRankFetchedSnapshot {
  return { rankFamily: request.family, rankType: request.type, pageNo: request.page, pageSize: request.pageSize,
    ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}),
    ...(request.periodScope ? { periodScope: request.periodScope } : {}),
    sourceEndpoint: request.endpoint!, signedRequired: request.family === "AUDIENCE",
    capturedAt: new Date().toISOString(), entries: [], statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"d".repeat(64)}`, sha256: "d".repeat(64),
      relativePath: `cas/sha256/dd/${"d".repeat(64)}.json`, sizeBytes: 2, mediaType: "application/json" } }
}

describe("rank cancellation before Core closes SQLite", () => {
  let directory: string
  let core: LocalCoreRuntime | undefined
  afterEach(async () => {
    await core?.stop(); core = undefined; vi.useRealTimers()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  async function setup(fetch: (request: BilibiliLiveRankWorkerRequest) => Promise<BilibiliLiveRankFetchedSnapshot>,
    stop = vi.fn(async () => {}), liveStop = async () => {}) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-lifecycle-"))
    const fixture = liveLifecycleSource()
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32), liveSource: { ...fixture.source, stop: liveStop }, liveRankSource: { fetch, stop } })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    return { core, room }
  }
  it.each([false, true])("does not persist late result/error or continue fallback/next kind after stop (failure=%s)", async failure => {
    const pendingFetch = deferred<BilibiliLiveRankFetchedSnapshot>()
    const started = deferred<BilibiliLiveRankWorkerRequest>()
    const fetch = vi.fn((request: BilibiliLiveRankWorkerRequest) => { started.resolve(request); return pendingFetch.promise })
    const f = await setup(fetch)
    const pending = f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["contribution_rank", "guard_weekly"], maxPages: 2 })
      .catch((error: unknown) => error)
    const request = await started.promise
    await f.core.stop()
    if (failure) pendingFetch.reject(Object.assign(new Error("Synthetic network error"), { code: "BILIBILI_NETWORK_ERROR" }))
    else pendingFetch.resolve(snapshot(request))
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(fetch).toHaveBeenCalledTimes(1)
    const database = await ControlDatabase.open(directory)
    try {
      expect(database.findLatestBilibiliLiveRankSnapshots(f.room.id)).toEqual([])
      expect(database.listBilibiliApiCalls(request.taskId)).toEqual([])
    } finally { database.close() }
  })
  it("cancels an inter-page wait without starting another fetch", async () => {
    const fetch = vi.fn(async (request: BilibiliLiveRankWorkerRequest) => snapshot(request))
    const f = await setup(fetch)
    vi.useFakeTimers()
    const pending = f.core.refreshBilibiliLiveRanks({ roomMonitorId: f.room.id, types: ["guard_weekly"], maxPages: 2 })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await f.core.stop()
    await vi.advanceTimersByTimeAsync(1500)
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("starts rank cancellation immediately even when a different worker is slow to stop", async () => {
    const stopping = deferred<void>()
    const rankStop = vi.fn(async () => {})
    const f = await setup(async request => snapshot(request), rankStop, () => stopping.promise)
    const stopped = f.core.stop()
    try { expect(rankStop).toHaveBeenCalledOnce() }
    finally { stopping.resolve(); await stopped }
  })
})
