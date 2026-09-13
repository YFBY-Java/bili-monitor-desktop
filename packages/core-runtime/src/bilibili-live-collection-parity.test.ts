import { afterEach, describe, expect, it } from "vitest"
import { liveCollectionFixture, liveInfoEndpoint, liveStatusEndpoint } from "./__fixtures__/live-collection"

describe("original live snapshot and collection business on actual SQLite", () => {
  let f: Awaited<ReturnType<typeof liveCollectionFixture>>
  afterEach(async () => { await f?.close() })

  it.each(["manual", "due"])("%s collection keeps profiles but does not turn old heat/time into current facts", async mode => {
    f = await liveCollectionFixture()
    f.state.data.liveStatus = 1
    const room = await f.service.addRoom({ uid: "22" })
    f.advance(); f.state.data = { liveStatus: 0 }
    const result = mode === "manual" ? await f.service.refreshNow(room.id) : (await f.service.collectDueRooms())[0]!
    expect(f.database.findBilibiliLiveRoomById(room.id)).toMatchObject({ liveStatus: 0, liveTime: null,
      onlineCount: null, attentionCount: 200, title: "原直播标题", faceUrl: "https://example.test/face.png", areaName: "游戏" })
    expect(result.onlineCount).toBeUndefined()
    expect(f.service.trend({ roomMonitorId: room.id }).points.at(-1)?.onlineCount).toBeUndefined()
  })

  it("re-add replaces missing profile/metrics and clears errors without success status events", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    f.service.updateStatus(room.id, false)
    const events = f.service.events()
    f.advance(); f.state.failure = undefined; f.state.data = { uname: "UID 22", title: "新标题", liveStatus: 1 }
    const result = await f.service.addRoom({ uid: "22", intervalSeconds: 120 })
    expect(f.database.findBilibiliLiveRoomById(room.id)).toMatchObject({ faceUrl: null, coverUrl: null,
      shortId: null, areaId: null, liveTime: null, onlineCount: null, attentionCount: null, lastErrorType: null, backoffUntil: null })
    expect(result).toMatchObject({ id: room.id, uname: "UID 22", title: "新标题", liveStatus: 1, monitorStatus: "ACTIVE", intervalSeconds: 120 })
    expect(f.service.events()).toEqual(events)
  })

  it("stale re-add is immediately due but preserves observations, errors and backoff", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    f.service.updateStatus(room.id, false)
    const before = f.database.findBilibiliLiveRoomById(room.id)!, events = f.service.events()
    f.advance(600); f.state.fetchedAt = "2026-09-13T02:59:00Z"; f.state.failure = undefined; f.state.data.liveStatus = 1
    const result = await f.service.addRoom({ uid: "22", intervalSeconds: 120 })
    expect(result).toMatchObject({ id: room.id, monitorStatus: "ACTIVE", intervalSeconds: 120,
      nextCollectAt: f.state.now, liveStatus: 0, lastSnapshotAt: before.lastSnapshotAt,
      lastErrorType: before.lastErrorType, backoffUntil: before.backoffUntil })
    expect(f.service.events()).toEqual(events)
    expect(f.service.trend({ roomMonitorId: room.id }).points).toHaveLength(1)
  })

  it.each([
    ["2026-09-13T03:00:00Z", "2026-09-13T03:00:00.000000Z"],
    ["2026-09-13T03:00:00.000Z", "2026-09-13T03:00:00Z"]
  ])("accepts equal instants independent of fractional formatting (%s)", async (first, next) => {
    f = await liveCollectionFixture(); f.state.fetchedAt = first
    const room = await f.service.addRoom({ uid: "22" })
    f.state.fetchedAt = next; f.state.data.onlineCount = 300
    expect(await f.service.refreshNow(room.id)).toMatchObject({ message: "ok" })
    expect(f.service.trend({ roomMonitorId: room.id }).points).toMatchObject([{ onlineCount: 300 }])
  })

  it("rejects older microseconds before any boundary or settings write", async () => {
    f = await liveCollectionFixture(); f.state.fetchedAt = "2026-09-13T03:00:00.000009Z"
    const room = await f.service.addRoom({ uid: "22" })
    const before = f.database.findBilibiliLiveRoomById(room.id)
    f.state.fetchedAt = "2026-09-13T03:00:00.000001Z"; f.state.data.liveStatus = 1
    let boundaryCalls = 0; f.state.inspectBoundary = () => { boundaryCalls++ }
    expect(await f.service.refreshNow(room.id)).toMatchObject({ message: "ignored-stale" })
    expect(boundaryCalls).toBe(0)
    expect(f.database.findBilibiliLiveRoomById(room.id)).toEqual(before)
  })

  it("same-second history upsert retains its original room identity while current monitor follows the response", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.state.roomOffset = 200; f.state.data.onlineCount = 300
    await f.service.refreshNow(room.id)
    expect(f.database.findBilibiliLiveRoomById(room.id)?.roomId).toBe("222")
    expect(f.service.trend({ roomMonitorId: room.id }).points).toMatchObject([{ roomId: "122", onlineCount: 300 }])
  })

  it("rejects REST older than a pending end signal by microseconds", async () => {
    f = await liveCollectionFixture(); f.state.data.liveStatus = 1
    const room = await f.service.addRoom({ uid: "22" })
    const active = f.database.findActiveBilibiliLiveSession(room.id)!
    f.database.updateBilibiliLiveSession({ ...active, state: "END_PENDING", endSignalAt: "2026-09-13T03:01:00.000009Z" })
    f.state.fetchedAt = "2026-09-13T03:01:00.000001Z"; f.state.data.liveStatus = 0
    expect(await f.service.refreshNow(room.id)).toMatchObject({ message: "ignored-stale" })
    expect(f.database.findBilibiliLiveRoomById(room.id)?.lastSnapshotAt).toBe(room.lastSnapshotAt)
    expect(f.database.findActiveBilibiliLiveSession(room.id)?.state).toBe("END_PENDING")
  })

  it("initialization makes the monitor available to real session reconciliation before its first snapshot", async () => {
    f = await liveCollectionFixture(); f.state.data.liveStatus = 1
    const observed: number[] = []
    f.state.inspectBoundary = room => {
      expect(f.database.findBilibiliLiveRoomById(room.monitorId)?.liveStatus).toBe(1)
      observed.push(f.database.findBilibiliLiveRoomSnapshots(room.monitorId, { limit: 10 }).length)
    }
    const room = await f.service.addRoom({ uid: "22" })
    expect(observed).toEqual([0])
    expect(f.database.findActiveBilibiliLiveSession(room.id)?.state).toBe("OPEN")
  })

  it("applies a REST close at the same instant as a pending end signal despite different ISO spellings", async () => {
    f = await liveCollectionFixture(); f.state.data.liveStatus = 1
    const room = await f.service.addRoom({ uid: "22" })
    const active = f.database.findActiveBilibiliLiveSession(room.id)!
    f.database.updateBilibiliLiveSession({ ...active, state: "END_PENDING", endSignalAt: "2026-09-13T03:01:00Z" })
    f.state.fetchedAt = "2026-09-13T03:01:00.000000Z"; f.state.data.liveStatus = 0
    expect(await f.service.refreshNow(room.id)).toMatchObject({ message: "ok" })
    expect(f.database.findActiveBilibiliLiveSession(room.id)).toBeUndefined()
    expect(f.database.findBilibiliLiveRoomById(room.id)?.liveStatus).toBe(0)
  })

  it("re-add passes previous metadata to the boundary while the monitor is already initialized", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.advance(); f.state.data.liveStatus = 1
    const observed: Array<{ passed: number; stored: number; snapshots: number }> = []
    f.state.inspectBoundary = previous => observed.push({ passed: previous.liveStatus,
      stored: f.database.findBilibiliLiveRoomById(room.id)!.liveStatus,
      snapshots: f.database.findBilibiliLiveRoomSnapshots(room.id, { limit: 10 }).length })
    await f.service.addRoom({ uid: "22" })
    expect(observed).toEqual([{ passed: 0, stored: 1, snapshots: 1 }])
  })

  it("collection records events then reconciles using current metadata before updating monitor/history", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.advance(); f.state.data.liveStatus = 1; f.state.data.title = "新标题"
    const observed: Array<{ passed: number; stored: number; snapshots: number; events: string[] }> = []
    f.state.inspectBoundary = previous => observed.push({ passed: previous.liveStatus,
      stored: f.database.findBilibiliLiveRoomById(room.id)!.liveStatus,
      snapshots: f.database.findBilibiliLiveRoomSnapshots(room.id, { limit: 10 }).length,
      events: f.service.events().map(event => event.eventType) })
    await f.service.refreshNow(room.id)
    expect(observed).toEqual([{ passed: 0, stored: 0, snapshots: 1, events: ["TITLE_CHANGED", "LIVE_STARTED"] }])
    expect(f.database.findActiveBilibiliLiveSession(room.id)?.state).toBe("OPEN")
  })

  it.each(["manual", "due"])("%s internal boundary failure rolls back without recording a platform error", async mode => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    const before = f.database.findBilibiliLiveRoomById(room.id), outbox = f.database.listPendingOutbox()
    f.advance(); f.state.data.liveStatus = 1; f.state.failBoundary = true
    await expect(mode === "manual" ? f.service.refreshNow(room.id) : f.service.collectDueRooms()).rejects.toThrow("Synthetic boundary persistence failure")
    expect(f.database.findBilibiliLiveRoomById(room.id)).toEqual(before)
    expect(f.service.events()).toEqual([])
    expect(f.database.listPendingOutbox()).toEqual(outbox)
    expect(f.database.findActiveBilibiliLiveSession(room.id)).toBeUndefined()
  })

  it("uses application time for status events and fetched time for snapshots across the Shanghai day boundary", async () => {
    f = await liveCollectionFixture(); f.state.fetchedAt = "2026-09-12T15:59:00Z"
    const room = await f.service.addRoom({ uid: "22" })
    f.state.now = "2026-09-12T16:00:05.000Z"; f.state.fetchedAt = "2026-09-12T15:59:30Z"
    f.state.data.liveStatus = 1; f.state.data.title = "新标题"
    await f.service.refreshNow(room.id)
    expect(f.service.events().map(event => event.occurredAt)).toEqual([f.state.now, f.state.now])
    expect(f.service.summary().todayLiveStarts).toBe(1)
    expect(f.service.trend({ roomMonitorId: room.id }).points.at(-1)?.capturedAt).toBe(f.state.fetchedAt)
  })

  it("a real API-log uniqueness failure is not retried or recorded as a platform failure", async () => {
    f = await liveCollectionFixture({ maxAttempts: 3 })
    const room = await f.service.addRoom({ uid: "22" })
    const before = f.database.findBilibiliLiveRoomById(room.id), outbox = f.database.listPendingOutbox()
    f.advance(); f.calls.length = 0
    // The second successful endpoint attempts the same call ID: real SQLite constraint failure.
    f.state.idFactory = () => "018f0f39-7b5e-4cc1-862d-000000000888"
    await expect(f.service.refreshNow(room.id)).rejects.toThrow(/UNIQUE constraint failed: bilibili_api_call.call_id/)
    expect(f.calls.map(call => call.method)).toEqual(["status", "info"])
    expect(f.waits).toEqual([])
    expect(f.database.findBilibiliLiveRoomById(room.id)).toEqual(before)
    expect(f.service.events()).toEqual([])
    expect(f.database.listPendingOutbox()).toEqual(outbox)
    expect(f.database.listBilibiliApiCalls(f.calls[0]!.taskId)).toMatchObject([{ errorType: null }])
  })

  it("a later room's internal failure does not relabel an already applied batch result as platform failure", async () => {
    f = await liveCollectionFixture()
    const first = await f.service.addRoom({ uid: "22", intervalSeconds: 1 })
    const second = await f.service.addRoom({ uid: "23", intervalSeconds: 2 })
    f.advance(10); f.state.data.liveStatus = 1
    f.state.inspectBoundary = room => { if (room.uid === "23") throw new Error("Synthetic second-room boundary failure") }
    await expect(f.service.collectDueRooms()).rejects.toThrow("Synthetic second-room boundary failure")
    expect(f.database.findBilibiliLiveRoomById(first.id)).toMatchObject({ liveStatus: 1, lastSuccessAt: f.state.fetchedAt, lastErrorType: null })
    expect(f.database.findBilibiliLiveRoomById(second.id)).toMatchObject({ liveStatus: 0, lastSnapshotAt: second.lastSnapshotAt, lastErrorType: null })
    expect(f.service.events()).toMatchObject([{ monitorId: first.id, eventType: "LIVE_STARTED" }])
  })

  it("first-add boundary failure leaves no monitor, snapshot, status event or session", async () => {
    f = await liveCollectionFixture(); f.state.data.liveStatus = 1; f.state.failBoundary = true
    let monitorId = ""
    f.state.inspectBoundary = room => { monitorId = room.monitorId }
    await expect(f.service.addRoom({ uid: "22" })).rejects.toThrow("Synthetic boundary persistence failure")
    expect(monitorId).not.toBe("")
    expect(f.service.listRooms().items).toEqual([])
    expect(f.database.findBilibiliLiveRoomSnapshots(monitorId, { limit: 10 })).toEqual([])
    expect(f.database.findActiveBilibiliLiveSession(monitorId)).toBeUndefined()
    expect(f.service.events()).toEqual([])
    expect(f.database.listPendingOutbox()).toEqual([])
  })

  it.each([
    { value: "\u001c", expected: "详情分区" },
    { value: "\u00a0", expected: "\u00a0" }
  ])("uses original blank-text semantics in same-request profile fallback ($value)", async ({ value, expected }) => {
    f = await liveCollectionFixture(); f.state.data.areaName = value
    f.state.infoData = { ...f.state.data, areaName: "详情分区" }
    expect(await f.service.addRoom({ uid: "22" })).toMatchObject({ areaName: expected })
  })

  it("ERROR_RECOVERED retains previous room identity while status events use the new snapshot identity", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    f.advance(); f.state.failure = undefined; f.state.roomOffset = 200; f.state.data.liveStatus = 1
    await f.service.refreshNow(room.id)
    expect(f.service.events().find(event => event.eventType === "ERROR_RECOVERED")?.roomId).toBe("122")
    expect(f.service.events().find(event => event.eventType === "LIVE_STARTED")?.roomId).toBe("222")
  })

  it("a late failed request uses its original event context without rolling back newer live observations", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.advance()
    f.state.beforeStatus = async () => {
      f.state.beforeStatus = async () => {}
      f.state.data.liveStatus = 1; f.state.data.title = "并发新标题"; f.state.data.onlineCount = 300
      await f.service.refreshNow(room.id)
      f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    }
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(f.database.findBilibiliLiveRoomById(room.id)).toMatchObject({ liveStatus: 1, title: "并发新标题", onlineCount: 300 })
    expect(f.service.events()[0]).toMatchObject({ eventType: "ERROR_OCCURRED", fromLiveStatus: 0, toLiveStatus: 0,
      titleBefore: "原直播标题", titleAfter: "原直播标题", onlineCount: 100 })
  })

  it.each([
    { code: "BILIBILI_RATE_LIMITED", retryable: false, attempts: 3 },
    { code: "BILIBILI_NETWORK_ERROR", retryable: false, attempts: 3 },
    { code: "BILIBILI_SERVER_ERROR", retryable: false, attempts: 3 },
    { code: "BILIBILI_RISK_CONTROL", retryable: true, attempts: 1 },
    { code: "BILIBILI_UNKNOWN_ERROR", retryable: true, attempts: 1 }
  ])("retries $code by the original category while logs retain retryable=$retryable", async ({ code, retryable, attempts }) => {
    f = await liveCollectionFixture({ maxAttempts: 3 })
    const room = await f.service.addRoom({ uid: "22" })
    f.calls.length = 0; f.state.failure = { code, retryable }
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code })
    expect(f.calls).toHaveLength(attempts)
    expect(f.waits).toEqual(attempts === 3 ? [100, 200] : [])
    expect(f.database.listBilibiliApiCalls(f.calls[0]!.taskId).map(call => call.retryable)).toEqual(Array(attempts).fill(retryable))
  })

  it("caps retries at four total attempts even when configured higher", async () => {
    f = await liveCollectionFixture({ maxAttempts: 10, retryBackoffMs: 1500 })
    const room = await f.service.addRoom({ uid: "22" })
    f.calls.length = 0; f.state.failure = { code: "BILIBILI_NETWORK_ERROR", retryable: true }
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    expect(f.calls).toHaveLength(4)
    expect(f.waits).toEqual([1500, 3000, 6000])
  })

  it("reports a missing batch UID as UNKNOWN at the status endpoint without failing another room", async () => {
    f = await liveCollectionFixture({ workerBoundary: true })
    const first = await f.service.addRoom({ uid: "22", intervalSeconds: 10 }), second = await f.service.addRoom({ uid: "23", intervalSeconds: 10 })
    f.advance(); f.calls.length = 0; f.state.missingUids = ["22"]
    const results = await f.service.collectDueRooms()
    expect(results.find(value => value.roomMonitorId === first.id)).toMatchObject({ success: false, sourceEndpoint: liveStatusEndpoint })
    expect(results.find(value => value.roomMonitorId === second.id)).toMatchObject({ success: true, message: "ok" })
    expect(f.database.findBilibiliLiveRoomById(first.id)).toMatchObject({ lastErrorType: "BILIBILI_UNKNOWN_ERROR",
      nextCollectAt: "2026-09-13T03:06:00.000Z" })
    const failure = f.database.listPendingOutbox().filter(message => message.topic === "bilibili.live.collection-failed").at(-1)!
    expect(JSON.parse(failure.envelopeJson).payload.retryable).toBe(true)
    expect(f.calls.map(call => call.method)).toEqual(["status"])
  })

  it("keeps the source endpoint and 900-second backoff when a batch request fails", async () => {
    f = await liveCollectionFixture({ workerBoundary: true })
    const room = await f.service.addRoom({ uid: "22", intervalSeconds: 2000 })
    f.advance(3000); f.state.failure = { code: "BILIBILI_UNKNOWN_ERROR", retryable: true, endpoint: liveInfoEndpoint }
    const results = await f.service.collectDueRooms()
    expect(results).toMatchObject([{ success: false, sourceEndpoint: liveInfoEndpoint }])
    expect(f.database.findBilibiliLiveRoomById(room.id)?.backoffUntil).toBe("2026-09-13T04:05:00.000Z")
    expect(f.database.listBilibiliApiCalls(f.calls.at(-1)!.taskId)[0]?.endpointKey).toBe(liveInfoEndpoint)
  })

  it("records old-room lookup absence at the original endpoint for a manual collection failure", async () => {
    f = await liveCollectionFixture({ workerBoundary: true })
    const room = await f.service.addRoom({ uid: "22" })
    f.advance(); f.state.missingUids = ["22"]; f.state.oldRoomMissing = true
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code: "BILIBILI_UNKNOWN_ERROR" })
    expect(f.database.findBilibiliLiveRoomById(room.id)?.lastErrorType).toBe("BILIBILI_UNKNOWN_ERROR")
    expect(f.service.events().map(event => event.eventType)).toEqual(["ERROR_OCCURRED"])
  })

  it("records repeated explicit collection failures separately without replacing the last successful snapshot", async () => {
    f = await liveCollectionFixture()
    const room = await f.service.addRoom({ uid: "22" })
    f.state.failure = { code: "BILIBILI_RISK_CONTROL", retryable: false }
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    await expect(f.service.refreshNow(room.id)).rejects.toThrow()
    expect(f.service.events().map(event => event.eventType)).toEqual(["ERROR_OCCURRED", "ERROR_OCCURRED"])
    expect(f.database.findBilibiliLiveRoomById(room.id)?.lastSuccessAt).toBe(room.lastSuccessAt)
    expect(f.service.trend({ roomMonitorId: room.id }).points).toHaveLength(1)
    expect(f.database.listPendingOutbox().filter(message => message.topic === "bilibili.live.collection-failed")).toHaveLength(2)
  })
})
