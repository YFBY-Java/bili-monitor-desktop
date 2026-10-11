import { BilibiliFollowerMonitorV2Schema, BilibiliFollowerTrendV2Schema, BilibiliSubjectSchema, BilibiliLiveRoomSchema } from "@bmd/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { followerActionsCoreFixture } from "./__fixtures__/follower-actions-core"

// GREEN audit of existing backend behavior, real V2 router/Core/SQLite.
describe("original follower delete through V2 Core", () => {
  let fixture: Awaited<ReturnType<typeof followerActionsCoreFixture>>
  beforeEach(async () => {
    vi.stubEnv("APP_BILIBILI_FOLLOWERMONITOR_REQUESTMININTERVALMS", "0")
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_REQUEST_MIN_INTERVAL_MS", "0")
    fixture = await followerActionsCoreFixture()
  })
  afterEach(async () => { await fixture?.close(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })
  async function add(mid = "9223372036854775807") {
    return BilibiliFollowerMonitorV2Schema.parse((await fixture.dispatch("bilibili-followers.add.v2", { mid })).payload)
  }
  function rows(table: string) { return fixture.inspect(db => { const query = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`); query.setReadBigInts(true); return query.all() }) }
  async function remove(userId: string) { return fixture.dispatch("bilibili-followers.delete.v2", { userId }) }
  it("deletes monitor/history, nulls only its Subject reference, preserves MID/resources and does not relink readded UID", async () => {
    const user = await add(), other = await add("3")
    fixture.state.liveRoomEnabled = true
    const room = BilibiliLiveRoomSchema.parse((await fixture.dispatch("bilibili-live.rooms.add", { uid: "2" })).payload)
    const subject = BilibiliSubjectSchema.parse((await fixture.dispatch("bilibili-subjects.create", {
      displayName: "保留主体", bilibiliUserMonitorId: user.id, mid: user.mid, bilibiliLiveRoomMonitorId: room.id, roomId: room.roomId, danmuEnabled: false })).payload)
    const otherSubject = BilibiliSubjectSchema.parse((await fixture.dispatch("bilibili-subjects.create", {
      displayName: "另一主体", bilibiliUserMonitorId: other.id, mid: other.mid, danmuEnabled: false })).payload)
    const otherRows = rows("bilibili_follower_monitor"), otherHistory = rows("bilibili_follower_snapshot")
    const beforeBinding = rows("bilibili_subject_binding").find(row => row.subject_id === subject.id)!
    const beforeSubject = rows("bilibili_monitored_subject")
    const beforeLive = rows("bilibili_live_room_monitor")
    const priorCalls = fixture.calls.slice(), priorOutbox = rows("outbox").length
    expect(await remove(user.id)).toEqual({ responseType: "bilibili-followers.delete.v2.result", payload: { deleted: true } })
    expect(rows("bilibili_follower_monitor").map(row => row.monitor_id)).toEqual([other.id])
    expect(rows("bilibili_follower_snapshot").map(row => row.monitor_id)).toEqual([other.id])
    const binding = rows("bilibili_subject_binding").find(row => row.subject_id === subject.id)!
    expect(binding).toMatchObject({ bilibili_user_monitor_id: null, mid: user.mid })
    expect(binding).toEqual({ ...beforeBinding, bilibili_user_monitor_id: null })
    expect(rows("bilibili_monitored_subject")).toEqual(beforeSubject)
    expect(rows("bilibili_live_room_monitor")).toEqual(beforeLive)
    expect(rows("bilibili_follower_monitor")).toEqual(otherRows.filter(row => row.monitor_id === other.id))
    expect(rows("bilibili_follower_snapshot")).toEqual(otherHistory.filter(row => row.monitor_id === other.id))
    expect(rows("bilibili_subject_binding").find(row => row.subject_id === otherSubject.id)).toMatchObject({ bilibili_user_monitor_id: other.id, mid: other.mid })
    expect(rows("bilibili_monitored_subject")).toHaveLength(2)
    expect(fixture.calls).toEqual(priorCalls)
    expect(rows("outbox")).toHaveLength(priorOutbox + 1)
    await expect(remove(user.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(rows("outbox")).toHaveLength(priorOutbox + 1)
    const replacement = await add()
    expect(replacement.id).not.toBe(user.id)
    expect(rows("bilibili_subject_binding").find(row => row.subject_id === subject.id)).toEqual(binding)
    await fixture.restart()
    expect(rows("bilibili_subject_binding").find(row => row.subject_id === subject.id)).toEqual(binding)
    expect(BilibiliFollowerTrendV2Schema.parse((await fixture.dispatch("bilibili-followers.trend.v2", { userId: replacement.id })).payload).points).toHaveLength(1)
    expect(rows("bilibili_follower_snapshot")).toHaveLength(2)
  })
  it.each(["pause-success", "pause-failure", "delete-success", "delete-failure"])("audits automatic due collection in flight: %s", async mode => {
    const user = await add()
    fixture.state.now = "2026-10-06T05:00:00.000Z"
    await fixture.dispatch("bilibili-followers.update-status.v2", { userId: user.id, enabled: true })
    let release = () => {}
    fixture.state.beforeCard = () => new Promise<void>(resolve => { release = resolve })
    vi.useFakeTimers()
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    await fixture.restart(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fixture.calls).toHaveLength(2)
    const beforeHistory = rows("bilibili_follower_snapshot")
    if (mode.startsWith("pause")) await fixture.dispatch("bilibili-followers.update-status.v2", { userId: user.id, enabled: false })
    else await remove(user.id)
    const beforeEvents = rows("outbox").length
    if (mode.endsWith("failure")) fixture.state.cardError = Object.assign(new Error("合成风控失败"), { code: "BILIBILI_RISK_CONTROL", retryable: false, endpoint: "x/web-interface/card" })
    fixture.state.count = "9007199254740993"
    release()
    await vi.advanceTimersByTimeAsync(0)
    if (mode.startsWith("pause")) {
      const stored = rows("bilibili_follower_monitor")[0]!
      expect(stored.monitor_status).toBe("PAUSED")
      expect(stored.last_error_type).toBe(mode.endsWith("failure") ? "BILIBILI_RISK_CONTROL" : null)
      expect(stored.next_collect_at).toBe(mode.endsWith("failure") ? "2026-10-06T05:15:00.000Z" : "2026-10-06T06:00:00.000Z")
      expect(stored.current_follower_count).toBe(mode.endsWith("failure") ? 9223372036854775807n : 9007199254740993n)
      if (mode.endsWith("failure")) {
        expect(stored).toMatchObject({ last_error_at: fixture.state.now, last_error_message: "合成风控失败" })
        expect(rows("bilibili_follower_snapshot")).toEqual(beforeHistory)
      }
      expect(rows("bilibili_follower_snapshot")).toHaveLength(mode.endsWith("failure") ? 1 : 2)
    } else {
      expect(rows("bilibili_follower_monitor")).toEqual([])
      expect(rows("bilibili_follower_snapshot")).toEqual([])
      expect(warning.mock.calls.length).toBe(mode.endsWith("success") ? 1 : 0)
      const events = rows("outbox").slice(beforeEvents).map(row => JSON.parse(String(row.envelope_json)))
      if (mode.endsWith("success")) {
        expect(events).toEqual([])
        expect(warning.mock.calls).toEqual([[JSON.stringify({ event: "bilibili.follower.scheduler-failed", code: "BILIBILI_FOLLOWER_SCHEDULER_FAILED" })]])
      } else expect(events).toEqual([expect.objectContaining({ type: "bilibili.follower.collection-failed", payload: expect.objectContaining({
        userId: user.id, mid: user.mid, errorType: "BILIBILI_RISK_CONTROL", retryable: false, nextCollectAt: "2026-10-06T05:15:00.000Z" }) })])
    }
    warning.mockRestore()
    fixture.state.beforeCard = async () => {}
  })
})
