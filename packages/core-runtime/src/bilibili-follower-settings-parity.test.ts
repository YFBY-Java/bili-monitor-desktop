import { afterEach, describe, expect, it } from "vitest"

import { followerError, followerMigrationFixture } from "./__fixtures__/follower-migration"

// Coverage-only: service/storage settings semantics already match the original.
// The source is a fixture, persistence and V2 projections are real SQLite/Core.
describe("original follower settings persistence through V2", () => {
  let fixture: Awaited<ReturnType<typeof followerMigrationFixture>>
  afterEach(async () => { await fixture?.close() })

  it.each([true, false])("writes even the same interval with active=%s", async active => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 120 })
    if (!active) fixture.service.updateStatusV2(user.id, false)
    const before = fixture.database.findBilibiliFollowerMonitorById(user.id)!
    const beforeOutbox = fixture.database.listPendingOutbox()
    const beforeHistory = fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })
    const beforeCalls = fixture.calls.slice()
    fixture.state.now = "2026-09-13T04:10:00.000Z"

    const result = fixture.service.updateIntervalV2(user.id, 120)
    expect(result).toMatchObject({ intervalSeconds: 120, monitorStatus: active ? "ACTIVE" : "PAUSED",
      version: before.version + 1, currentFollowerCount: "100", followingCount: "10",
      nextCollectAt: active ? "2026-09-13T04:12:00.000Z" : before.nextCollectAt })
    expect(fixture.database.findBilibiliFollowerMonitorById(user.id)).toEqual({ ...before,
      nextCollectAt: active ? "2026-09-13T04:12:00.000Z" : before.nextCollectAt,
      updatedAt: fixture.state.now, version: before.version + 1 })
    const afterOutbox = fixture.database.listPendingOutbox()
    expect(afterOutbox).toHaveLength(beforeOutbox.length + 1)
    const settingsEvent = afterOutbox.find(message => message.topic === "bilibili.follower.monitor-settings-updated")!
    expect(settingsEvent.createdAt).toBe(fixture.state.now)
    expect(JSON.parse(settingsEvent.envelopeJson)).toMatchObject({ payload: { userId: user.id, intervalSeconds: 120 } })
    expect(fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })).toEqual(beforeHistory)
    expect(fixture.calls).toEqual(beforeCalls)
  })

  it.each([true, false])("keeps saved errors, counters, evidence and history while changing interval with active=%s", async active => {
    fixture = await followerMigrationFixture()
    const user = await fixture.service.addUserV2({ mid: "2", intervalSeconds: 120 })
    fixture.state.now = "2026-09-13T04:00:01.000Z"
    fixture.state.cardError = followerError("BILIBILI_RISK_CONTROL", false, "x/web-interface/card", "保留的采集错误")
    await expect(fixture.service.refreshNowV2(user.id)).rejects.toThrow("保留的采集错误")
    if (!active) fixture.service.updateStatusV2(user.id, false)
    const before = fixture.database.findBilibiliFollowerMonitorById(user.id)!
    const beforeHistory = fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })
    const beforeProjection = fixture.service.trendV2(user.id)
    const beforeCalls = fixture.calls.slice()
    const beforeApiCalls = beforeCalls.map(call => fixture.database.listBilibiliApiCalls(call.request.taskId))
    fixture.state.now = "2026-09-13T04:10:00.000Z"

    const result = fixture.service.updateIntervalV2(user.id, 600)
    const nextCollectAt = active ? "2026-09-13T04:20:00.000Z" : before.nextCollectAt
    expect(result).toEqual({ ...beforeProjection.user, intervalSeconds: 600, nextCollectAt, version: before.version + 1 })
    expect(fixture.database.findBilibiliFollowerMonitorById(user.id)).toEqual({ ...before,
      intervalSeconds: 600, nextCollectAt, updatedAt: fixture.state.now, version: before.version + 1 })
    expect(fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })).toEqual(beforeHistory)
    expect(fixture.service.trendV2(user.id).points).toEqual(beforeProjection.points)
    expect(fixture.calls).toEqual(beforeCalls)
    expect(beforeCalls.map(call => fixture.database.listBilibiliApiCalls(call.request.taskId))).toEqual(beforeApiCalls)
  })
})
