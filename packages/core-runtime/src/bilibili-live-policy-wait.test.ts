import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { liveLifecycleSource } from "./__fixtures__/live-lifecycle"

describe("original int retry policy above a single Node timer range", () => {
  const maximumTimer = 2_147_483_647
  let directory: string
  let database: ControlDatabase | undefined
  let service: BilibiliLiveMonitorService | undefined
  afterEach(async () => {
    await service?.stop(); service = undefined
    database?.close(); database = undefined
    vi.useRealTimers()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  async function setup() {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-policy-wait-"))
    database = await ControlDatabase.open(directory)
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T05:00:00Z"))
    const f = liveLifecycleSource()
    service = new BilibiliLiveMonitorService({ database, source: f.source,
      now: () => new Date(), idFactory: randomUUID, requestMinIntervalMs: 0,
      maxAttempts: 3, retryBackoffMs: maximumTimer, jitter: () => 0.5 })
    const room = await service.addRoom({ uid: "2" })
    f.calls.length = 0
    f.state.failure = Object.assign(new Error("合成长退避网络失败"), { code: "BILIBILI_NETWORK_ERROR", retryable: true })
    return { ...f, service, database, room }
  }

  it("waits the complete backoff plus jitter before each retry, including multi-segment doubling", async () => {
    const f = await setup()
    const pending = f.service.refreshNow(f.room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(maximumTimer + 148)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(maximumTimer * 2 + 149)
    expect(f.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ code: "BILIBILI_NETWORK_ERROR" })
    expect(f.calls).toHaveLength(3)
    expect(f.database.listBilibiliApiCalls(f.calls[0]!.taskId).map(call => call.attempt)).toEqual([1, 2, 3])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels during a later long-wait segment without writing a terminal monitor failure", async () => {
    const f = await setup()
    const pending = f.service.refreshNow(f.room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(maximumTimer)
    expect(f.calls).toHaveLength(1)
    await f.service.stop()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(vi.getTimerCount()).toBe(0)
    expect(f.service.listRooms().items).toEqual([f.room])
    expect(f.service.events()).toEqual([])
  })
})
