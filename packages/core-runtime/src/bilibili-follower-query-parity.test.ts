import { afterEach, describe, expect, it } from "vitest"
import { followerMigrationFixture } from "./__fixtures__/follower-migration"

// Original FollowerMonitorService.trend(s) and Repository.findAll/findSnapshots.
describe("follower query parity with the original B/S service", () => {
  let fixture: Awaited<ReturnType<typeof followerMigrationFixture>>
  afterEach(async () => { await fixture?.close() })

  it("returns every user when neither list nor trends specify a subset", async () => {
    fixture = await followerMigrationFixture()
    const ids: string[] = []
    for (let mid = 1; mid <= 505; mid++) ids.push((await fixture.service.addUser({ mid: String(mid) })).id)
    expect(fixture.service.listUsers().items).toHaveLength(505)
    expect(fixture.service.trends()).toHaveLength(505)
    expect(fixture.service.trends({ userIds: ids.slice().reverse() }).map(item => item.user.id)).toEqual(ids.slice().reverse())
    expect(fixture.service.listUsers({ limit: 20 }).items).toHaveLength(20)
  }, 20_000)

  it("orders active users first, then follower counts, then original insertion order", async () => {
    fixture = await followerMigrationFixture()
    const first = await fixture.service.addUser({ mid: "1" })
    const second = await fixture.service.addUser({ mid: "2" })
    fixture.state.count = 200
    const third = await fixture.service.addUser({ mid: "3" })
    const paused = await fixture.service.addUser({ mid: "4" })
    fixture.service.updateStatus(paused.id, false)
    expect(fixture.service.listUsers().items.map(user => user.id)).toEqual([third.id, first.id, second.id, paused.id])
  })

  it("takes the newest normalized number of points and returns them chronologically", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    for (let index = 1; index <= 2004; index++) {
      fixture.state.fetchedAt = new Date(Date.parse(fixture.state.now) + index * 1000).toISOString()
      fixture.state.count = 100 + index
      await fixture.service.refreshNow(user.id)
    }
    const result = fixture.service.trend(user.id, { limit: -1 })
    expect(result.points).toHaveLength(500)
    expect(result.points[0]?.followerCount).toBe(1605)
    expect(result.points.at(-1)?.followerCount).toBe(2104)
    expect(fixture.service.trend(user.id, { limit: 5000 }).points).toHaveLength(2000)
    expect(fixture.service.trends({ userIds: [user.id], limitPerUser: 0 })[0]?.points).toHaveLength(500)
    expect(fixture.service.listUsers().items[0]?.recentTrend).toHaveLength(30)
  }, 30_000)

  it("includes from/to instants with offsets and different fractional precision", async () => {
    fixture = await followerMigrationFixture()
    fixture.state.fetchedAt = "2026-09-13T04:00:00.000000Z"
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.state.fetchedAt = "2026-09-13T04:00:01.000000Z"
    fixture.state.count = 101
    await fixture.service.refreshNow(user.id)
    expect(fixture.service.trend(user.id, { from: "2026-09-13T12:00:00+08:00", to: "2026-09-13T04:00:01Z" }).points)
      .toHaveLength(2)
    expect(fixture.service.trend(user.id, { from: "2026-09-13T04:00:00.000Z", to: "2026-09-13T04:00:00.000Z" }).points)
      .toHaveLength(1)
    expect(fixture.service.trend(user.id, { from: "2026-09-13T04:00:02Z", to: "2026-09-13T04:00:01Z" }).points).toEqual([])
  })

  it("does not round away Python microseconds at a history boundary", async () => {
    fixture = await followerMigrationFixture()
    fixture.state.fetchedAt = "2026-09-13T04:00:00.000001Z"
    const user = await fixture.service.addUser({ mid: "2" })
    expect(fixture.service.trend(user.id, { to: "2026-09-13T04:00:00Z" }).points).toEqual([])
    expect(fixture.service.trend(user.id, { from: "2026-09-13T12:00:00.000001+08:00", to: "2026-09-13T04:00:00.000001Z" }).points)
      .toHaveLength(1)
  })

  it("isolates users, preserves same-second upsert, and has no rate with a zero previous count", async () => {
    fixture = await followerMigrationFixture()
    fixture.state.count = 0
    const first = await fixture.service.addUser({ mid: "1" })
    const second = await fixture.service.addUser({ mid: "2" })
    fixture.state.fetchedAt = "2026-09-13T04:00:01.123456Z"
    fixture.state.count = 10
    await fixture.service.refreshNow(first.id)
    fixture.state.fetchedAt = "2026-09-13T04:00:01.987654Z"
    fixture.state.count = 20
    await fixture.service.refreshNow(first.id)
    const trend = fixture.service.trend(first.id)
    expect(trend.points.map(point => point.followerCount)).toEqual([0, 20])
    expect(trend.user.deltaSincePrevious).toBe(20)
    expect(trend.user.growthRateSincePrevious).toBeUndefined()
    expect(fixture.service.trend(second.id).points.map(point => point.followerCount)).toEqual([0])
    fixture.service.deleteUser(second.id)
    expect(() => fixture.service.trends({ userIds: [first.id, second.id] })).toThrow(/监控用户不存在/)
  })
})
