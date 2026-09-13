import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { liveLifecycleSource, liveResponseGate } from "./__fixtures__/live-lifecycle"

describe("local live collection stop boundary", () => {
  const cleanups: Array<() => Promise<void>> = []
  const gates: ReturnType<typeof liveResponseGate>[] = []
  afterEach(async () => {
    for (const gate of gates.splice(0)) gate.resolve()
    for (const cleanup of cleanups.splice(0)) await cleanup()
    vi.useRealTimers()
  })
  function gate() { const value = liveResponseGate(); gates.push(value); return value }
  async function setup(requestMinIntervalMs = 0, statusBatchSize = 30) {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-lifecycle-"))
    const database = await ControlDatabase.open(directory)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
    const f = liveLifecycleSource()
    const service = new BilibiliLiveMonitorService({ database, source: f.source, now: () => new Date(),
      idFactory: randomUUID, requestMinIntervalMs, statusBatchSize, jitter: () => 0 })
    cleanups.push(async () => {
      await service.stop()
      await vi.runAllTimersAsync()
      database.close()
      await rm(directory, { recursive: true, force: true })
    })
    return { ...f, database, service }
  }

  it("cancels a reserved endpoint slot immediately without changing the saved room", async () => {
    const f = await setup(1500)
    const room = await f.service.addRoom({ uid: "2" })
    const pending = f.service.refreshNow(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(f.calls.map(call => call.method)).toEqual(["status", "info"])
    expect(f.service.listRooms().items).toEqual([room])
  })

  it("cancels retry backoff without recording a monitor failure or issuing another attempt", async () => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "2" })
    f.state.failure = Object.assign(new Error("合成网络错误"), { code: "BILIBILI_NETWORK_ERROR", retryable: true })
    const pending = f.service.refreshNow(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(f.calls.map(call => call.method)).toEqual(["status", "info", "status"])
    expect(f.service.listRooms().items).toEqual([room])
    expect(f.service.events()).toEqual([])
    expect(f.database.listBilibiliApiCalls(f.calls[2]!.taskId)).toHaveLength(1)
  })

  it.each(["uid", "roomId"] as const)("discards late %s initialization before logs or follow-up requests", async identifier => {
    const f = await setup()
    const response = gate()
    f.state.beforeResponse = () => response.promise
    const pending = f.service.addRoom({ [identifier]: identifier === "uid" ? "2" : "102" }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    response.resolve()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(f.calls).toHaveLength(1)
    expect(f.service.listRooms().items).toEqual([])
    expect(f.database.listBilibiliApiCalls(f.calls[0]!.taskId)).toEqual([])
  })

  it.each([false, true])("ignores in-flight manual success/failure after stop (failure=%s)", async failure => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "2" })
    const before = f.database.findBilibiliLiveRoomById(room.id)
    const response = gate()
    f.state.beforeResponse = () => response.promise
    const pending = f.service.refreshNow(room.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    if (failure) f.state.failure = new Error("Synthetic worker stopped")
    response.resolve()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(f.database.findBilibiliLiveRoomById(room.id)).toEqual(before)
    expect(f.database.listBilibiliApiCalls(f.calls[2]!.taskId)).toEqual([])
    expect(f.service.events()).toEqual([])
    expect(f.service.trend({ roomMonitorId: room.id }).points).toHaveLength(1)
  })

  it.each(["success", "missing", "failure"])("stops an in-flight due batch and does not start the next batch (%s)", async result => {
    const f = await setup(0, 1)
    await f.service.addRoom({ uid: "2", intervalSeconds: 1 })
    await f.service.addRoom({ uid: "3", intervalSeconds: 1 })
    const before = f.service.listRooms().items
    await vi.advanceTimersByTimeAsync(2000)
    const response = gate()
    f.state.beforeResponse = () => response.promise
    const pending = f.service.collectDueRooms().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    f.state.missing = result === "missing"
    if (result === "failure") f.state.failure = Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL" })
    response.resolve()
    expect(await pending).toEqual([])
    expect(f.calls).toHaveLength(5)
    expect(f.service.listRooms().items).toEqual(before)
    expect(f.database.listBilibiliApiCalls(f.calls[4]!.taskId)).toEqual([])
    expect(f.service.events()).toEqual([])
  })

  it("stops its source exactly once and rejects new writes before accessing storage", async () => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "2" })
    await Promise.all([f.service.stop(), f.service.stop()])
    expect(f.state.stops).toBe(1)
    await expect(f.service.addRoom({ uid: "3" })).rejects.toMatchObject({ code: "CORE_STOPPED" })
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(() => f.service.updateStatus(room.id, false)).toThrow(/已停止/)
    expect(() => f.service.updateInterval(room.id, 60)).toThrow(/已停止/)
    expect(() => f.service.deleteRoom(room.id)).toThrow(/已停止/)
    expect(await f.service.collectDueRooms()).toEqual([])
    expect(f.service.listRooms().items).toEqual([room])
  })

  it("returns already committed batches while discarding the pending and following batches", async () => {
    const f = await setup(0, 1)
    const first = await f.service.addRoom({ uid: "2", intervalSeconds: 1 })
    const second = await f.service.addRoom({ uid: "3", intervalSeconds: 1 })
    const third = await f.service.addRoom({ uid: "4", intervalSeconds: 1 })
    await vi.advanceTimersByTimeAsync(2000)
    const response = gate()
    let dueCalls = 0
    f.state.beforeResponse = async () => { dueCalls++; if (dueCalls === 2) await response.promise }
    const pending = f.service.collectDueRooms()
    await vi.advanceTimersByTimeAsync(0)
    await f.service.stop()
    response.resolve()
    expect(await pending).toMatchObject([{ roomMonitorId: first.id, success: true, onlineCount: 104 }])
    expect(dueCalls).toBe(2)
    expect(f.service.trend({ roomMonitorId: first.id }).points).toHaveLength(2)
    expect(f.service.trend({ roomMonitorId: second.id }).room).toEqual(second)
    expect(f.service.trend({ roomMonitorId: third.id }).room).toEqual(third)
  })

  it("does not initialize a monitor if stop follows the final successful detail response", async () => {
    const f = await setup()
    f.state.beforeSuccess = method => {
      if (method === "info") queueMicrotask(() => queueMicrotask(() => { void f.service.stop() }))
    }
    await expect(f.service.addRoom({ uid: "2" })).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(f.calls.map(call => call.method)).toEqual(["status", "info"])
    expect(f.service.listRooms().items).toEqual([])
    expect(f.service.events()).toEqual([])
  })

  it.each(["add", "refresh"])("prioritizes stop while %s platform errors propagate through nested awaits", async operation => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "2" })
    f.state.failure = Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL" })
    f.state.beforeError = () => { queueMicrotask(() => queueMicrotask(() => { void f.service.stop() })) }
    const pending = operation === "add" ? f.service.addRoom({ uid: "3" }) : f.service.refreshNow(room.id)
    await expect(pending).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(f.service.listRooms().items).toEqual([room])
    expect(f.service.events()).toEqual([])
  })
})
