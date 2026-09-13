import { afterEach, describe, expect, it } from "vitest"
import { followerError, followerMigrationFixture } from "./__fixtures__/follower-migration"

describe("original follower retry and persistence rules", () => {
  let fixture: Awaited<ReturnType<typeof followerMigrationFixture>>
  afterEach(async () => { await fixture?.close() })

  it("does not retry an API business error even when its raw retryable flag is true", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.calls.length = 0
    fixture.state.cardError = followerError("BILIBILI_API_ERROR", true)
    await expect(fixture.service.refreshNow(user.id)).rejects.toMatchObject({ code: "BILIBILI_API_ERROR" })
    expect(fixture.calls).toHaveLength(1)
    expect(fixture.waits).toEqual([])
  })

  it("honors RetryPolicy's maximum of three retries and 100ms minimum backoff", async () => {
    fixture = await followerMigrationFixture(10)
    fixture.state.cardError = followerError("BILIBILI_RATE_LIMITED", true)
    await expect(fixture.service.addUser({ mid: "2" })).rejects.toMatchObject({ code: "BILIBILI_RATE_LIMITED" })
    expect(fixture.calls.map(call => call.request.attempt)).toEqual([1, 2, 3, 4])
    expect(fixture.waits).toEqual([100, 200, 400])
  })

  it.each(["BILIBILI_NETWORK_ERROR", "BILIBILI_SERVER_ERROR"])("retries %s three times before relation fallback", async code => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.calls.length = 0
    fixture.state.cardError = followerError(code, true)
    fixture.state.fetchedAt = "2026-09-13T04:00:01.000Z"
    fixture.state.count = 120
    const result = await fixture.service.refreshNow(user.id)
    expect(result).toMatchObject({ success: true, sourceEndpoint: "x/relation/stat", followerCount: 120 })
    expect(fixture.calls.map(call => call.endpoint)).toEqual(["x/web-interface/card", "x/web-interface/card", "x/web-interface/card", "x/relation/stat"])
    expect(fixture.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname, avatarUrl: user.avatarUrl, profileUrl: user.profileUrl })
  })

  it.each(["BILIBILI_AUTH_EXPIRED", "BILIBILI_RISK_CONTROL", "BILIBILI_RATE_LIMITED"])("never falls back after %s", async code => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.calls.length = 0
    fixture.state.cardError = followerError(code, code === "BILIBILI_RATE_LIMITED")
    await expect(fixture.service.refreshNow(user.id)).rejects.toMatchObject({ code })
    expect(fixture.calls.every(call => call.endpoint === "x/web-interface/card")).toBe(true)
    expect(fixture.service.trend(user.id).points.map(point => point.followerCount)).toEqual([100])
  })

  it("clears an obsolete avatar on successful card refresh, and on explicit add of an existing UID", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.state.avatar = undefined
    await fixture.service.refreshNow(user.id)
    expect(fixture.service.listUsers().items[0]?.avatarUrl).toBeUndefined()
    fixture.state.avatar = "https://example.com/synthetic-new.png"
    await fixture.service.refreshNow(user.id)
    fixture.state.avatar = undefined
    expect((await fixture.service.addUser({ mid: "2" })).avatarUrl).toBeUndefined()
  })

  it("returns the failed endpoint in a due result without erasing saved measurements", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2", intervalSeconds: 1 })
    fixture.state.now = "2026-09-13T04:00:02.000Z"
    fixture.state.cardError = followerError("BILIBILI_PARSE_ERROR", false)
    fixture.state.relationError = followerError("BILIBILI_RISK_CONTROL", false, "x/relation/stat")
    expect(await fixture.service.collectDueUsers()).toMatchObject([{
      userId: user.id, success: false, followerCount: 100, sourceEndpoint: "x/relation/stat"
    }])
    expect(fixture.service.listUsers().items[0]).toMatchObject({
      currentFollowerCount: 100, lastSuccessAt: user.lastSuccessAt, nextCollectAt: "2026-09-13T04:05:02.000Z"
    })
  })

  it("does not create users or snapshots when the required initial card fails", async () => {
    fixture = await followerMigrationFixture()
    fixture.state.cardError = followerError("BILIBILI_PARSE_ERROR", false)
    await expect(fixture.service.addUser({ mid: "2" })).rejects.toMatchObject({ code: "BILIBILI_PARSE_ERROR" })
    expect(fixture.service.listUsers().items).toEqual([])
    expect(fixture.calls.map(call => call.endpoint)).toEqual(["x/web-interface/card"])
    expect(fixture.database.listBilibiliApiCalls(fixture.calls[0]!.request.taskId)).toMatchObject([{ errorType: "BILIBILI_PARSE_ERROR" }])
  })

  it.each([[1, 300], [600, 600], [3600, 900]])("backs off interval %i by %i seconds then clears errors on success", async (interval, backoff) => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2", intervalSeconds: interval })
    fixture.state.cardError = followerError("BILIBILI_RISK_CONTROL", false, "x/web-interface/card", "错".repeat(1000))
    await expect(fixture.service.refreshNow(user.id)).rejects.toThrow()
    const failed = fixture.service.listUsers().items[0]!
    expect(Date.parse(failed.nextCollectAt!) - Date.parse(fixture.state.now)).toBe(backoff * 1000)
    expect(failed.lastErrorMessage).toHaveLength(900)
    fixture.state.cardError = undefined
    fixture.state.fetchedAt = "2026-09-13T04:00:01.000Z"
    await fixture.service.refreshNow(user.id)
    expect(fixture.service.listUsers().items[0]?.lastErrorType).toBeUndefined()
    expect(fixture.service.trend(user.id).points).toHaveLength(2)
  })

  it("collects ten earliest due active users, leaving the rest and paused users untouched", async () => {
    fixture = await followerMigrationFixture()
    const users = []
    for (let mid = 1; mid <= 12; mid++) users.push(await fixture.service.addUser({ mid: String(mid), intervalSeconds: mid }))
    fixture.service.updateStatus(users[0]!.id, false)
    fixture.state.now = "2026-09-13T04:00:30.000Z"
    fixture.state.fetchedAt = fixture.state.now
    const result = await fixture.service.collectDueUsers()
    expect(result.map(item => item.userId)).toEqual(users.slice(1, 11).map(item => item.id))
    expect(fixture.service.trend(users[11]!.id).points).toHaveLength(1)
    expect(fixture.service.trend(users[0]!.id).points).toHaveLength(1)
  })

  it("keeps a paused schedule when editing its interval and resumes immediately", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.service.updateStatus(user.id, false)
    fixture.state.now = "2026-09-13T04:10:00.000Z"
    expect(fixture.service.updateInterval(user.id, 1).nextCollectAt).toBe(user.nextCollectAt)
    expect(fixture.service.updateStatus(user.id, true).nextCollectAt).toBe(fixture.state.now)
  })
})
