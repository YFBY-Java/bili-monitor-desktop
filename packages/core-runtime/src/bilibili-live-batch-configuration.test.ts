import { afterEach, describe, expect, it } from "vitest"
import { liveCollectionFixture } from "./__fixtures__/live-collection"

describe("original configurable live collection batches", () => {
  let f: Awaited<ReturnType<typeof liveCollectionFixture>>
  afterEach(async () => { await f?.close() })

  it("also enforces the automatic switch when the service is invoked without a scheduler", async () => {
    f = await liveCollectionFixture({ enabled: false, workerBoundary: true })
    const room = await f.service.addRoom({ uid: "1" })
    f.advance(); f.calls.length = 0
    expect(await f.service.collectDueRooms()).toEqual([])
    expect(f.calls).toEqual([])
    expect(f.service.listRooms().items[0]?.nextCollectAt).toBe(room.nextCollectAt)
    expect(await f.service.refreshNow(room.id)).toMatchObject({ success: true })
    expect(f.calls.map(call => call.method)).toEqual(["status", "info"])
  })

  it.each([false, true])("uses configured 64/11 batches through the typed Worker boundary; first batch failure=%s", async failFirst => {
    f = await liveCollectionFixture({ dueBatchSize: 75, statusBatchSize: 64, workerBoundary: true })
    for (let uid = 1; uid <= 75; uid++) await f.service.addRoom({ uid: String(uid) })
    f.advance()
    f.calls.length = 0
    let batches = 0
    f.state.beforeStatus = async () => {
      f.state.failure = failFirst && batches++ === 0 ? { code: "BILIBILI_RISK_CONTROL", retryable: false } : undefined
    }
    const results = await f.service.collectDueRooms()
    expect(f.calls.map(call => call.ids.length)).toEqual([64, 11])
    expect(f.calls.flatMap(call => call.ids)).toEqual(Array.from({ length: 75 }, (_, i) => String(i + 1)))
    expect(results).toHaveLength(75)
    expect(results.filter(result => result.success)).toHaveLength(failFirst ? 11 : 75)
    expect(f.service.listRooms().items.filter(room => room.lastErrorType)).toHaveLength(failFirst ? 64 : 0)
    for (const result of results) expect(f.service.trend({ roomMonitorId: result.roomMonitorId }).points)
      .toHaveLength(result.success ? 2 : 1)
  })

  it.each([0, -12])("clamps nonpositive batch sizes (%s) to one without unlimited scans", async size => {
    f = await liveCollectionFixture({ dueBatchSize: size, statusBatchSize: size, workerBoundary: true })
    for (let uid = 1; uid <= 3; uid++) await f.service.addRoom({ uid: String(uid) })
    f.advance(); f.calls.length = 0
    expect(await f.service.collectDueRooms()).toHaveLength(1)
    expect(f.calls.map(call => call.ids)).toEqual([["1"]])
    expect(f.database.findDueBilibiliLiveRooms(f.state.now, 10)).toHaveLength(2)
  })

  it("limits due rooms first and excludes paused, future and backoff rooms", async () => {
    f = await liveCollectionFixture({ dueBatchSize: 3, statusBatchSize: 2, workerBoundary: true })
    const rooms = []
    for (let uid = 1; uid <= 7; uid++) rooms.push(await f.service.addRoom({ uid: String(uid) }))
    f.service.updateStatus(rooms[0]!.id, false)
    f.service.updateInterval(rooms[1]!.id, 600)
    f.advance()
    f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    await expect(f.service.refreshNow(rooms[2]!.id)).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    f.state.failure = undefined; f.calls.length = 0
    expect(await f.service.collectDueRooms()).toHaveLength(3)
    expect(f.calls.map(call => call.ids)).toEqual([["4", "5"], ["6"]])
    expect(f.database.findDueBilibiliLiveRooms(f.state.now, 10).map(room => room.uid)).toEqual(["7"])
  })
})
