import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliFollowerFetchedSnapshot } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"

function responseGate() {
  let release: () => void = () => {}
  const promise = new Promise<void>(resolveGate => { release = resolveGate })
  return { promise, resolve: () => release() }
}

describe("local follower collection shutdown", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
    vi.useRealTimers()
  })

  async function setup(requestMinIntervalMs = 0) {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-lifecycle-"))
    const database = await ControlDatabase.open(directory)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
    const calls: string[] = []
    const taskIds: string[] = []
    const state = { beforeResponse: async (): Promise<void> => {}, beforeError: () => {}, error: undefined as Error | undefined, stops: 0 }
    const service = new BilibiliFollowerMonitorService({
      database, now: () => new Date(), idFactory: randomUUID, requestMinIntervalMs, jitter: () => 0,
      source: {
        fetchCard: async ({ mid, taskId }): Promise<BilibiliFollowerFetchedSnapshot> => {
          calls.push(mid)
          taskIds.push(taskId)
          await state.beforeResponse()
          if (state.error) { state.beforeError(); throw state.error }
          return { mid, nickname: `生命周期合成用户${mid}`, profileUrl: `https://space.bilibili.com/${mid}`,
            followerCount: 100 + calls.length, fetchedAt: new Date().toISOString(),
            sourceEndpoint: "x/web-interface/card", statusCode: 200, durationMs: 1,
            evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
              relativePath: "cas/synthetic-lifecycle.json", sizeBytes: 2, mediaType: "application/json" } }
        },
        fetchRelationStat: async () => { calls.push("relation"); throw new Error("Unexpected fallback") },
        stop: async () => { state.stops++ }
      }
    })
    cleanups.push(async () => { await service.stop(); database.close(); await rm(directory, { recursive: true, force: true }) })
    return { service, database, state, calls, taskIds }
  }

  it("cancels a reserved throttle slot without issuing a request or changing the monitor", async () => {
    const { service, calls } = await setup(1500)
    const user = await service.addUser({ mid: "2" })
    const pending = service.refreshNow(user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await service.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toEqual(["2"])
    expect(service.listUsers().items[0]).toEqual(user)
  })

  it("cancels retry backoff without another attempt or a fallback", async () => {
    const { service, calls, state } = await setup()
    const user = await service.addUser({ mid: "2" })
    state.error = Object.assign(new Error("合成网络错误"), { code: "BILIBILI_NETWORK_ERROR", retryable: true })
    const pending = service.refreshNow(user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(["2", "2"])
    await service.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toEqual(["2", "2"])
    expect(service.listUsers().items[0]).toEqual(user)
  })

  it.each([false, true])("discards a late initial card after shutdown (failure=%s)", async failure => {
    const { service, calls, state, database, taskIds } = await setup()
    const gate = responseGate()
    state.beforeResponse = () => gate.promise
    const pending = service.addUser({ mid: "2" }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await service.stop()
    if (failure) state.error = Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL" })
    gate.resolve()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(service.listUsers().items).toEqual([])
    expect(database.listBilibiliApiCalls(taskIds[0]!)).toEqual([])
    expect(calls).toEqual(["2"])
  })

  it("does not persist late batch results, mark cancellation as failure, or start the next user", async () => {
    const { service, calls, state, database, taskIds } = await setup()
    await service.addUser({ mid: "2", intervalSeconds: 1 })
    await service.addUser({ mid: "3", intervalSeconds: 1 })
    const before = service.listUsers().items
    await vi.advanceTimersByTimeAsync(2000)
    const gate = responseGate()
    state.beforeResponse = () => gate.promise
    const pending = service.collectDueUsers()
    await vi.advanceTimersByTimeAsync(0)
    await service.stop()
    gate.resolve()
    expect(await pending).toEqual([])
    expect(service.listUsers().items).toEqual(before)
    expect(database.listBilibiliApiCalls(taskIds[2]!)).toEqual([])
    expect(calls).toEqual(["2", "3", "2"])
  })

  it("does not record an in-flight manual request rejection as a platform failure after stop", async () => {
    const { service, state, database, taskIds } = await setup()
    const user = await service.addUser({ mid: "2" })
    const gate = responseGate()
    state.beforeResponse = () => gate.promise
    const pending = service.refreshNow(user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await service.stop()
    state.error = new Error("Synthetic worker stopped")
    gate.resolve()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(service.listUsers().items[0]).toEqual(user)
    expect(database.listBilibiliApiCalls(taskIds[1]!)).toEqual([])
  })

  it("stops the source once and rejects new collection requests without touching it", async () => {
    const { service, state, calls } = await setup()
    await Promise.all([service.stop(), service.stop()])
    await expect(service.addUser({ mid: "2" })).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(await service.collectDueUsers()).toEqual([])
    expect(state.stops).toBe(1)
    expect(calls).toEqual([])
  })

  it.each(["add", "display-name"])("reports shutdown if it happens while a %s failure propagates", async operation => {
    const { service, state } = await setup()
    state.error = Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL" })
    // The fetch layer handles the platform error first; shutdown precedes the caller's catch.
    state.beforeError = () => { queueMicrotask(() => queueMicrotask(() => { void service.stop() })) }
    const pending = operation === "add" ? service.addUser({ mid: "2" }) : service.resolveDisplayName("2")
    await expect(pending).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(service.listUsers().items).toEqual([])
  })
})
