import { afterEach, describe, expect, it } from "vitest"
import { liveQueryFixture } from "./__fixtures__/live-query"

describe("original live room query semantics on actual SQLite", () => {
  let f: Awaited<ReturnType<typeof liveQueryFixture>>
  afterEach(async () => { await f?.close() })

  it("lists and summarizes all 505 rooms and queries all or explicitly ordered room IDs", async () => {
    f = await liveQueryFixture()
    const ids: string[] = []
    f.state.liveStatus = 1
    for (let uid = 1; uid <= 505; uid++) ids.push((await f.service.addRoom({ uid: String(uid) })).id)
    expect(f.service.listRooms().items).toHaveLength(505)
    expect(f.service.summary()).toMatchObject({ totalRooms: 505, activeRooms: 505, liveRooms: 505, totalOnlineCount: 50500 })
    expect(f.service.trends()).toHaveLength(505)
    expect(f.service.trends({ roomMonitorIds: ids.slice().reverse() }).map(value => value.room.id)).toEqual(ids.slice().reverse())
    expect(f.service.listRooms({ limit: 20 }).items).toHaveLength(20)
    await f.reopen()
    expect(f.service.listRooms().items.map(room => room.id)).toEqual(ids)
  }, 30_000)

  it("orders by active status, live status, heat (null last), then insertion instead of random UUID", async () => {
    f = await liveQueryFixture()
    const first = await f.service.addRoom({ uid: "1" }), second = await f.service.addRoom({ uid: "2" })
    f.state.onlineCount = undefined
    const missing = await f.service.addRoom({ uid: "3" })
    f.state.liveStatus = 2
    const round = await f.service.addRoom({ uid: "4" })
    f.state.liveStatus = 1; f.state.onlineCount = 200
    const live = await f.service.addRoom({ uid: "5" }), paused = await f.service.addRoom({ uid: "6" })
    f.service.updateStatus(paused.id, false)
    expect(f.service.listRooms().items.map(room => room.id)).toEqual([round.id, live.id, first.id, second.id, missing.id, paused.id])
    expect(f.service.summary()).toMatchObject({ totalRooms: 6, activeRooms: 5, liveRooms: 2, roundRooms: 1,
      offlineRooms: 3, totalOnlineCount: 400, errorRooms: 0 })
  })

  it("takes the latest normalized 500/2000 points and returns chronological points and matching room projection", async () => {
    f = await liveQueryFixture()
    const room = await f.service.addRoom({ uid: "1" })
    for (let index = 1; index <= 2004; index++) {
      f.state.fetchedAt = new Date(Date.parse(f.state.now) + index * 1000).toISOString()
      f.state.onlineCount = index + 100
      await f.service.refreshNow(room.id)
    }
    const trend = f.service.trend({ roomMonitorId: room.id, limit: -1 })
    expect(trend.points).toHaveLength(500)
    expect(trend.points[0]?.onlineCount).toBe(1605)
    expect(trend.points.at(-1)?.onlineCount).toBe(2104)
    expect(trend.room.recentTrend).toEqual(trend.points)
    expect(trend.room.onlineDelta).toBe(1)
    expect(f.service.trend({ roomMonitorId: room.id, limit: 5000 }).points).toHaveLength(2000)
    expect(f.service.trends({ roomMonitorIds: [room.id], limitPerRoom: 0 })[0]?.points).toHaveLength(500)
    expect(f.service.listRooms().items[0]?.recentTrend).toHaveLength(48)
  }, 30_000)

  it("includes equivalent UTC/offset boundaries regardless of fractional zero formatting", async () => {
    f = await liveQueryFixture()
    f.state.fetchedAt = "2026-09-13T04:00:00.000000Z"
    const room = await f.service.addRoom({ uid: "1" })
    f.state.fetchedAt = "2026-09-13T04:00:01Z"
    await f.service.refreshNow(room.id)
    expect(f.service.trend({ roomMonitorId: room.id, from: "2026-09-13T12:00:00+08:00", to: "2026-09-13T00:00:01.000-04:00" }).points).toHaveLength(2)
    expect(f.service.trend({ roomMonitorId: room.id, from: "2026-09-13T04:00:00.000Z", to: "2026-09-13T04:00:00Z" }).points).toHaveLength(1)
    expect(f.service.trend({ roomMonitorId: room.id, from: "2026-09-13T04:00:01.000000Z" }).points).toHaveLength(1)
    expect(f.service.trend({ roomMonitorId: room.id, from: "2026-09-13T04:00:02Z", to: "2026-09-13T04:00:01Z" }).points).toEqual([])
  })

  it("does not round Python microseconds into the wrong side of a history boundary", async () => {
    f = await liveQueryFixture()
    f.state.fetchedAt = "2026-09-13T04:00:00.000001Z"
    const room = await f.service.addRoom({ uid: "1" })
    expect(f.service.trend({ roomMonitorId: room.id, to: "2026-09-13T04:00:00Z" }).points).toEqual([])
    expect(f.service.trend({ roomMonitorId: room.id, from: "2026-09-13T12:00:00.000001+08:00", to: "2026-09-13T04:00:00.000001Z" }).points).toHaveLength(1)
  })

  it("preserves per-room isolation, duplicate selection order and same-second upsert", async () => {
    f = await liveQueryFixture()
    const first = await f.service.addRoom({ uid: "1" }), second = await f.service.addRoom({ uid: "2" })
    f.state.fetchedAt = "2026-09-13T04:00:01.123456Z"; f.state.onlineCount = 200
    await f.service.refreshNow(first.id)
    f.state.fetchedAt = "2026-09-13T04:00:01.987654Z"; f.state.onlineCount = 300
    await f.service.refreshNow(first.id)
    const trends = f.service.trends({ roomMonitorIds: [second.id, first.id, second.id] })
    expect(trends.map(trend => trend.points.map(point => point.onlineCount))).toEqual([[100], [100, 300], [100]])
    f.service.deleteRoom(second.id)
    expect(() => f.service.trends({ roomMonitorIds: [first.id, second.id] })).toThrow(/监控直播间不存在/)
  })

  it("normalizes recent events to 1..200 and keeps latest event and error summary consistent", async () => {
    f = await liveQueryFixture()
    const room = await f.service.addRoom({ uid: "1" })
    for (let index = 1; index <= 205; index++) {
      f.state.fetchedAt = new Date(Date.parse(f.state.now) + index * 1000).toISOString()
      f.state.liveStatus = index % 2 ? 1 : 0
      await f.service.refreshNow(room.id)
    }
    expect(f.service.events()).toHaveLength(20)
    expect(f.service.events({ limit: 999 })).toHaveLength(200)
    expect(f.service.events({ limit: 0 })).toEqual([f.service.events()[0]])
    expect(f.service.events({ limit: -1 })).toEqual([f.service.events()[0]])
    expect(f.service.summary()).toMatchObject({ todayLiveStarts: 103, latestEvent: f.service.events()[0] })
    f.state.now = "2026-09-13T05:00:00.000Z"; f.state.fail = true
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(f.service.summary()).toMatchObject({ errorRooms: 1, latestEvent: { eventType: "ERROR_OCCURRED" } })
    expect(f.service.events()[0]?.eventType).toBe("ERROR_OCCURRED")
  }, 15_000)
})
