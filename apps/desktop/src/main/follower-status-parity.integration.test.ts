import { BilibiliFollowerMonitorV2Schema, BilibiliFollowerTrendV2Schema } from "@bmd/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { followerActionsCoreFixture } from "./__fixtures__/follower-actions-core"

// GREEN audit: existing Core/storage status semantics, via the actual V2 router.
describe("original follower status through V2 Core and isolated SQLite", () => {
  let fixture: Awaited<ReturnType<typeof followerActionsCoreFixture>> | undefined
  beforeEach(async () => {
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_REQUESTMININTERVALMS", "0")
    fixture = await followerActionsCoreFixture()
  })
  afterEach(async () => { await fixture?.close(); fixture = undefined; vi.useRealTimers(); vi.unstubAllEnvs() })
  async function add() {
    return BilibiliFollowerMonitorV2Schema.parse((await fixture!.dispatch("bilibili-followers.add.v2", { mid: "9223372036854775807" })).payload)
  }
  async function status(userId: string, enabled: boolean) {
    const result = await fixture!.dispatch("bilibili-followers.update-status.v2", { userId, enabled })
    expect(result.responseType).toBe("bilibili-followers.update-status.v2.result")
    return BilibiliFollowerMonitorV2Schema.parse(result.payload)
  }
  function stored() {
    return fixture!.inspect(database => {
      const query = database.prepare("SELECT * FROM bilibili_follower_monitor")
      query.setReadBigInts(true)
      return query.get()!
    })
  }
  function outbox() {
    return fixture!.inspect(database => database.prepare("SELECT * FROM outbox ORDER BY rowid").all())
  }
  async function trend(userId: string) {
    return BilibiliFollowerTrendV2Schema.parse((await fixture!.dispatch("bilibili-followers.trend.v2", { userId })).payload)
  }

  it("preserves precise Long64, next due time, three errors, counters and history on repeated pauses", async () => {
    const user = await add()
    fixture!.state.now = "2026-10-06T04:00:01.000Z"
    fixture!.state.cardError = Object.assign(new Error("合成保留错误"), { code: "BILIBILI_RISK_CONTROL", retryable: false, endpoint: "x/web-interface/card", statusCode: 200 })
    await expect(fixture!.dispatch("bilibili-followers.refresh.v2", { userId: user.id })).rejects.toThrow("合成保留错误")
    const before = stored()
    const beforeTrend = await trend(user.id)
    const beforeCalls = fixture!.calls.slice()
    expect(before).toMatchObject({ last_error_at: fixture!.state.now, last_error_type: "BILIBILI_RISK_CONTROL", last_error_message: "合成保留错误" })
    for (const now of ["2026-10-06T04:10:00.000Z", "2026-10-06T04:11:00.000Z"]) {
      fixture!.state.now = now
      const prior = stored()
      const priorOutbox = outbox()
      const result = await status(user.id, false)
      expect(result).toEqual({ ...beforeTrend.user, monitorStatus: "PAUSED", version: Number(prior.version) + 1 })
      expect(stored()).toEqual({ ...prior, monitor_status: "PAUSED", updated_at: now, version: BigInt(Number(prior.version) + 1) })
      expect((await trend(user.id)).points).toEqual(beforeTrend.points)
      expect(outbox()).toHaveLength(priorOutbox.length + 1)
      expect(JSON.parse(String(outbox().at(-1)!.envelope_json))).toMatchObject({ payload: { userId: user.id, enabled: false } })
      expect(fixture!.calls).toEqual(beforeCalls)
      const due = fixture!.inspect(database => database.prepare("SELECT monitor_id FROM bilibili_follower_monitor WHERE monitor_status='ACTIVE' AND (next_collect_at IS NULL OR next_collect_at <= ?)").all(now))
      expect(due).toEqual([])
    }
    const paused = await trend(user.id)
    await fixture!.restart()
    expect(await trend(user.id)).toEqual(paused)
    expect(stored()).toMatchObject({ next_collect_at: before.next_collect_at, last_error_at: before.last_error_at,
      last_error_type: before.last_error_type, last_error_message: before.last_error_message })
  })

  it("resumes even an already active user at now, keeps history and collects only on the next Core scan", async () => {
    const user = await add()
    fixture!.state.now = "2026-10-06T04:00:01.000Z"
    fixture!.state.cardError = Object.assign(new Error("恢复前保留错误"), { code: "BILIBILI_RISK_CONTROL", retryable: false, endpoint: "x/web-interface/card", statusCode: 200 })
    await expect(fixture!.dispatch("bilibili-followers.refresh.v2", { userId: user.id })).rejects.toThrow("恢复前保留错误")
    await status(user.id, false)
    const before = await trend(user.id)
    const calls = fixture!.calls.slice()
    for (const now of ["2026-10-06T04:10:00.000Z", "2026-10-06T04:11:00.000Z"]) {
      fixture!.state.now = now
      const prior = stored()
      const priorOutbox = outbox()
      const result = await status(user.id, true)
      expect(result).toEqual({ ...before.user, monitorStatus: "ACTIVE", nextCollectAt: now, version: Number(prior.version) + 1 })
      expect(stored()).toEqual({ ...prior, monitor_status: "ACTIVE", next_collect_at: now, updated_at: now, version: BigInt(Number(prior.version) + 1) })
      expect((await trend(user.id)).points).toEqual(before.points)
      expect(outbox()).toHaveLength(priorOutbox.length + 1)
      expect(fixture!.calls).toEqual(calls)
    }
    vi.useFakeTimers()
    await fixture!.restart(true)
    expect(fixture!.calls).toEqual(calls)
    fixture!.state.cardError = undefined
    fixture!.state.count = "9007199254740993"
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fixture!.calls).toHaveLength(calls.length + 1)
    expect((await trend(user.id)).user.currentFollowerCount).toBe("9007199254740993")
    await status(user.id, false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fixture!.calls).toHaveLength(calls.length + 1)
  })

  it.each([undefined, null, 0, 1, "true", "false"])("rejects nonboolean enabled=%j with no data or success event mutation", async enabled => {
    const user = await add()
    const before = stored(), beforeTrend = await trend(user.id), beforeOutbox = outbox(), beforeCalls = fixture!.calls.slice()
    await expect(async () => await fixture!.dispatch("bilibili-followers.update-status.v2", { userId: user.id, ...(enabled === undefined ? {} : { enabled }) })).rejects.toThrow()
    expect(stored()).toEqual(before)
    expect(await trend(user.id)).toEqual(beforeTrend)
    expect(outbox()).toEqual(beforeOutbox)
    expect(fixture!.calls).toEqual(beforeCalls)
  })

  it("rejects a missing user with NOT_FOUND and preserves data/history/outbox", async () => {
    const user = await add()
    const before = stored(), beforeTrend = await trend(user.id), beforeOutbox = outbox(), beforeCalls = fixture!.calls.slice()
    await expect(async () => await fixture!.dispatch("bilibili-followers.update-status.v2", { userId: "018f0f39-7b5e-4cc1-862d-999999999999", enabled: false })).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(stored()).toEqual(before)
    expect(await trend(user.id)).toEqual(beforeTrend)
    expect(outbox()).toEqual(beforeOutbox)
    expect(fixture!.calls).toEqual(beforeCalls)
  })
})
