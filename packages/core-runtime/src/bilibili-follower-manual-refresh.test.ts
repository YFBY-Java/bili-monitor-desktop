import { afterEach, describe, expect, it } from "vitest"

import { followerError, followerMigrationFixture } from "./__fixtures__/follower-migration"

// Narrow synthetic Source; real V2 public methods, SQLite and history projections.
describe("original follower manual refresh persistence", () => {
  let fixture: Awaited<ReturnType<typeof followerMigrationFixture>>
  afterEach(async () => { await fixture?.close() })

  function holdCard() {
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    fixture.state.beforeCard = async () => { entered(); await gate }
    return { started, release }
  }

  it.each([true, false])("uses the request-start interval without overwriting later settings, active=%s", async active => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 60 })
    fixture.state.now = fixture.state.fetchedAt = "2026-09-13T04:01:00.000Z"
    const gate = holdCard()
    const pending = fixture.service.refreshNowV2(user.id)
    await gate.started
    fixture.service.updateIntervalV2(user.id, 7200)
    if (!active) fixture.service.updateStatusV2(user.id, false)
    gate.release()
    await expect(pending).resolves.toMatchObject({ userId: user.id, success: true, followerCount: "100" })
    expect(fixture.service.listUsersV2().items[0]).toMatchObject({ intervalSeconds: 7200,
      monitorStatus: active ? "ACTIVE" : "PAUSED", nextCollectAt: "2026-09-13T04:02:00.000Z" })
    expect(fixture.service.trendV2(user.id).points.map(point => point.capturedAt)).toEqual([
      "2026-09-13T04:00:00.000Z", "2026-09-13T04:01:00.000Z"
    ])
  })

  it("stores manual failure with start-interval backoff and retains measurements/history", async () => {
    fixture = await followerMigrationFixture(1)
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 7200 })
    const history = fixture.service.trendV2(user.id).points
    const gate = holdCard()
    const result = fixture.service.refreshNowV2(user.id).catch(error => error as Error)
    await gate.started
    fixture.state.now = "2026-09-13T04:10:00.000Z"
    fixture.service.updateIntervalV2(user.id, 60)
    fixture.service.updateStatusV2(user.id, false)
    fixture.state.cardError = followerError("BILIBILI_RISK_CONTROL", false, "x/web-interface/card", "手动采集失败")
    gate.release()
    expect(await result).toMatchObject({ code: "BILIBILI_RISK_CONTROL", message: "BILIBILI_RISK_CONTROL: 手动采集失败", retryable: false })
    expect(fixture.service.listUsersV2().items[0]).toMatchObject({ currentFollowerCount: "100", followingCount: "10",
      lastSnapshotAt: user.lastSnapshotAt, lastSuccessAt: user.lastSuccessAt, intervalSeconds: 60, monitorStatus: "PAUSED",
      nextCollectAt: "2026-09-13T04:25:00.000Z", lastErrorAt: fixture.state.now,
      lastErrorType: "BILIBILI_RISK_CONTROL", lastErrorMessage: "手动采集失败" })
    expect(fixture.service.trendV2(user.id).points).toEqual(history)
    expect(fixture.calls.map(call => call.endpoint)).toEqual(["x/web-interface/card", "x/web-interface/card"])
    const log = fixture.database.listBilibiliApiCalls(fixture.calls[1]!.request.taskId)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ errorType: "BILIBILI_RISK_CONTROL", retryable: false })
  })

  it("clears all three persisted errors only after successful recovery", async () => {
    fixture = await followerMigrationFixture(1)
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 120 })
    fixture.state.cardError = followerError("BILIBILI_RISK_CONTROL", false)
    await expect(fixture.service.refreshNowV2(user.id)).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(fixture.service.listUsersV2().items[0]).toMatchObject({ lastErrorType: "BILIBILI_RISK_CONTROL",
      lastErrorAt: fixture.state.now, lastErrorMessage: "合成采集失败" })
    fixture.state.cardError = undefined
    fixture.state.now = fixture.state.fetchedAt = "2026-09-13T04:10:00.000Z"
    fixture.state.count = 130
    await expect(fixture.service.refreshNowV2(user.id)).resolves.toMatchObject({ success: true, followerCount: "130" })
    const updated = fixture.service.listUsersV2().items[0]!
    expect(updated).toMatchObject({ currentFollowerCount: "130", lastSuccessAt: fixture.state.now,
      nextCollectAt: "2026-09-13T04:12:00.000Z" })
    expect(updated).not.toHaveProperty("lastErrorAt")
    expect(updated).not.toHaveProperty("lastErrorType")
    expect(updated).not.toHaveProperty("lastErrorMessage")
    expect(fixture.service.trendV2(user.id).points.map(point => point.followerCount)).toEqual(["100", "130"])
  })

  it("uses the request-start profile for relation fallback even after another add updates it", async () => {
    fixture = await followerMigrationFixture(1)
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 60 })
    let task: string | undefined
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    fixture.state.beforeCard = async request => {
      if (task) return
      task = request.taskId
      entered()
      await gate
      throw followerError("BILIBILI_PARSE_ERROR", false)
    }
    const pending = fixture.service.refreshNowV2(user.id)
    await started
    fixture.state.avatar = "https://example.com/newer-synthetic-avatar.png"
    await expect(fixture.service.addUserV2({ mid: "2", intervalSeconds: 7200 })).resolves.toMatchObject({ avatarUrl: fixture.state.avatar })
    fixture.state.fetchedAt = "2026-09-13T04:01:00.000Z"
    release()
    await expect(pending).resolves.toMatchObject({ sourceEndpoint: "x/relation/stat", success: true })
    expect(fixture.service.listUsersV2().items[0]).toMatchObject({ avatarUrl: user.avatarUrl,
      nickname: user.nickname, profileUrl: user.profileUrl, intervalSeconds: 7200, nextCollectAt: "2026-09-13T04:02:00.000Z" })
  })

  it("allows overlapping manual calls for the same UID and retains both snapshots", async () => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUserV2({ mid: "2" })
    const releases: Array<() => void> = []
    const starts: Array<() => void> = []
    const started = [0, 1].map(() => new Promise<void>(resolve => starts.push(resolve)))
    fixture.state.beforeCard = async () => {
      const index = releases.length
      await new Promise<void>(resolve => { releases.push(resolve); starts[index]!() })
    }
    const first = fixture.service.refreshNowV2(user.id)
    await started[0]
    const second = fixture.service.refreshNowV2(user.id)
    await started[1]
    fixture.state.count = 200
    fixture.state.fetchedAt = "2026-09-13T04:01:00.000Z"
    releases[1]!()
    await expect(second).resolves.toMatchObject({ followerCount: "200" })
    fixture.state.count = 150
    fixture.state.fetchedAt = "2026-09-13T04:02:00.000Z"
    releases[0]!()
    await expect(first).resolves.toMatchObject({ followerCount: "150" })
    expect(fixture.service.listUsersV2().items[0]).toMatchObject({ currentFollowerCount: "150" })
    expect(fixture.service.trendV2(user.id).points.map(point => point.followerCount)).toEqual(["100", "200", "150"])
  })

  it.each([false, true])("does not recreate a monitor deleted during refresh, platformFailure=%s", async platformFailure => {
    fixture = await followerMigrationFixture(1)
    const user = await fixture.service.addUserV2({ mid: "2" })
    const gate = holdCard()
    const result = fixture.service.refreshNowV2(user.id).catch(error => error as Error)
    await gate.started
    fixture.service.deleteUser(user.id)
    if (platformFailure) fixture.state.cardError = followerError("BILIBILI_RISK_CONTROL", false)
    gate.release()
    const error = await result
    if (platformFailure) expect(error).toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    else {
      // Original: UPDATE zero rows, history FK fails -> internal, not missing-at-start.
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({ name: "Error", message: "Cannot collect a deleted follower monitor" })
      expect(error).not.toHaveProperty("code")
      expect(error).not.toHaveProperty("success")
    }
    expect(fixture.service.listUsersV2().items).toEqual([])
    expect(fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })).toEqual([])
  })

  it("rejects missing-at-start without making a Source request", async () => {
    fixture = await followerMigrationFixture()
    await expect(fixture.service.refreshNowV2("018f0f39-7b5e-4cc1-862d-999999999999"))
      .rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(fixture.calls).toEqual([])
  })
})
