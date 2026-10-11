import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliSubjectLiveRoomSchema, BilibiliSubjectSummarySchema, BilibiliSubjectTrendPointSchema } from "@bmd/contracts"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

const endpoints = { status: "room/v1/Room/get_status_info_by_uids", init: "room/v1/Room/room_init",
  info: "room/v1/Room/get_info", old: "room/v1/Room/getRoomInfoOld" }
const messages = { status: "bilibili.live.fetch-status-by-uids", init: "bilibili.live.fetch-room-init",
  info: "bilibili.live.fetch-room-info", old: "bilibili.live.fetch-room-info-old" }
const request = { taskId: "synthetic-live-worker", attempt: 1, leaseId: "synthetic-live-lease" }

describe("real Python live HTTP replay through NDJSON, WorkerSource and SQLite", () => {
  let directory: string | undefined
  let transport: NdjsonPythonWorkerTransport | undefined
  let database: ControlDatabase | undefined
  afterEach(async () => { await transport?.stop(); database?.close();
    if (directory) {
      const target = resolve(directory)
      if (!/^D:\\/i.test(target) || dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("bmd-live-worker-wire-")) {
        throw new Error("Unexpected live Worker fixture cleanup path.")
      }
      await rm(target, { recursive: true, force: true })
    }
    transport = undefined; database = undefined; directory = undefined })

  async function setup() {
    const pythonExecutable = process.env.BMD_PYTHON_EXE
    if (!pythonExecutable) throw new Error("Activate the D-drive project environment before testing")
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Live Worker fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-worker-wire-"))
    transport = new NdjsonPythonWorkerTransport({ pythonExecutable,
      pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/live_http"),
      dataDirectory: directory, role: "crawler", requestTimeoutMs: 8_000 })
    return { source: new BilibiliLiveWorkerSource(transport), wire: transport, directory }
  }

  it("rolls back rejected primary raw snapshots without retrying or rejecting unused detail evidence", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const sessions = new BilibiliLiveSessionService({ database, idFactory: randomUUID })
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 3, sessionObserver: sessions })
    const businessTables = ["bilibili_live_room_monitor", "bilibili_live_room_snapshot",
      "bilibili_live_status_event", "bilibili_live_session", "outbox"]
    const rows = (tables: string[]) => {
      const reader = new DatabaseSync(resolve(f.directory, "control.db"), { readOnly: true })
      try { return Object.fromEntries(tables.map(table => {
        const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true)
        return [table, query.all()]
      })) } finally { reader.close() }
    }
    try {
      const room = await service.addRoomV2({ uid: "122" })
      expect(room).toMatchObject({ onlineCount: "10", liveStatus: 0 })
      const before = rows(businessTables)
      const apiBefore = rows(["bilibili_api_call"]).bilibili_api_call!
      await expect(service.refreshNowV2(room.id)).rejects.toThrow(/snapshot JSONB input rejected: NUL/)
      expect(rows(businessTables)).toEqual(before)
      const afterRefresh = rows(["bilibili_api_call"]).bilibili_api_call!
      expect(afterRefresh.slice(apiBefore.length)).toMatchObject([
        { endpoint_key: endpoints.status, error_type: null, status_code: 200n, attempt: 1n },
        { endpoint_key: endpoints.info, error_type: null, status_code: 200n, attempt: 1n }
      ])
      expect(afterRefresh).toHaveLength(apiBefore.length + 2)
      // Successful API logs own their CAS references before the snapshot transaction.
      const loggedObjects = rows(["object_artifact"]).object_artifact!
      for (const call of afterRefresh.slice(apiBefore.length)) {
        expect(loggedObjects.some(object => object.object_id === call.evidence_object_id)).toBe(true)
      }
      await expect(service.addRoomV2({ uid: "123" })).rejects.toThrow(/snapshot JSONB input rejected: NUL/)
      expect(database.findBilibiliLiveRoomByUid("123")).toBeUndefined()
      expect(rows(businessTables)).toEqual(before)
      const apiAfter = rows(["bilibili_api_call"]).bilibili_api_call!
      expect(apiAfter).toHaveLength(afterRefresh.length + 2)
      expect(apiAfter.slice(afterRefresh.length)).toMatchObject([{ error_type: null }, { error_type: null }])
      expect(await service.refreshNowV2(room.id)).toMatchObject({ success: true, onlineCount: "30" })
      expect(database.findActiveBilibiliLiveSession(room.id)?.state).toBe("OPEN")
      const recovered = rows(businessTables)
      const writer = new DatabaseSync(resolve(f.directory, "control.db"))
      try {
        writer.exec("CREATE TRIGGER synthetic_snapshot_failure BEFORE INSERT ON bilibili_live_room_snapshot BEGIN SELECT RAISE(ABORT, 'synthetic snapshot failure'); END")
        await expect(service.refreshNowV2(room.id)).rejects.toThrow(/synthetic snapshot failure/)
        expect(rows(businessTables)).toEqual(recovered)
      } finally { writer.exec("DROP TRIGGER synthetic_snapshot_failure"); writer.close() }
      const finalApi = rows(["bilibili_api_call"]).bilibili_api_call!
      expect(finalApi).toHaveLength(apiAfter.length + 4)
      expect(finalApi.slice(apiAfter.length)).toMatchObject(Array.from({ length: 4 }, () => ({ error_type: null, attempt: 1n })))
      const batch = await f.source.fetchStatusByUidsV2({ ...request, uids: ["123"] })
      const raw = await readFile(resolve(f.directory, batch.evidenceObject.relativePath))
      expect(raw.toString("utf8")).toContain('"old":"\\u0000","old":"valid"')
      expect(createHash("sha256").update(raw).digest("hex")).toBe(batch.evidenceObject.sha256)
      await service.stop()
      database.close()
      database = undefined
      database = await ControlDatabase.open(f.directory)
      expect(rows(businessTables)).toEqual(recovered)
      expect(rows(["bilibili_api_call"]).bilibili_api_call).toEqual(finalApi)
      expect(database.findBilibiliLiveRoomByUid("123")).toBeUndefined()
    } finally { await service.stop() }
  }, 20_000)

  it("keeps explicit charset data and rejects invalid headers without platform failure writes", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 3 })
    const rows = (tables: string[]) => {
      const reader = new DatabaseSync(resolve(f.directory, "control.db"), { readOnly: true })
      try { return Object.fromEntries(tables.map(table => {
        const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true)
        return [table, query.all()]
      })) } finally { reader.close() }
    }
    try {
      const room = await service.addRoomV2({ uid: "121" })
      expect(room).toMatchObject({ uname: " caféhost ", title: " café live ", onlineCount: "12" })
      const businessTables = ["bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event", "outbox"]
      const before = rows(businessTables)
      const apiBefore = rows(["bilibili_api_call"]).bilibili_api_call!
      const artifacts = rows(["object_artifact"]).object_artifact!
      const rawObjects = await Promise.all(artifacts.map(row => readFile(resolve(f.directory, String(row.relative_path)))))
      expect(rawObjects.some(raw => raw.includes(Buffer.from(" café live ", "latin1")))).toBe(true)
      await expect(service.refreshNowV2(room.id)).rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false,
        message: "INTERNAL_ERROR: Unable to convert Bilibili response content type or charset." })
      expect(rows(businessTables)).toEqual(before)
      const apiAfter = rows(["bilibili_api_call"]).bilibili_api_call!
      expect(apiAfter.slice(0, apiBefore.length)).toEqual(apiBefore)
      expect(apiAfter.slice(apiBefore.length)).toMatchObject([{ endpoint_key: endpoints.status, error_type: null,
        retryable: 0n, status_code: 200n, attempt: 1n }])
      expect(rows(["object_artifact"]).object_artifact).toEqual(artifacts)
      expect(await f.wire.request("worker.ping", {})).toMatchObject({ state: "ready" })
      await service.stop()
      database.close()
      database = await ControlDatabase.open(f.directory)
      expect(rows(businessTables)).toEqual(before)
      expect(rows(["bilibili_api_call"]).bilibili_api_call).toEqual(apiAfter)
      expect(await Promise.all(artifacts.map(row => readFile(resolve(f.directory, String(row.relative_path)))))).toEqual(rawObjects)
    } finally { await service.stop() }
  }, 20_000)

  it("replays the shared original HTTP fixtures over the actual Python byte boundary", async () => {
    const f = await setup()
    const fixtures: Array<{ method: keyof typeof endpoints; request: object; result?: unknown;
      error?: { code: string; message: string; retryable: boolean; statusCode: number; biliCode: number } }> = JSON.parse(
        await readFile(new URL("../../contracts/fixtures/live-worker-responses.json", import.meta.url), "utf8"))
    for (const fixture of fixtures) {
      const pending = f.wire.request(messages[fixture.method], { ...request, ...fixture.request })
      if (fixture.error) {
        await expect(pending).rejects.toMatchObject({ ...fixture.error, endpoint: endpoints[fixture.method] })
      } else {
        const payload = await pending
        expect(payload).toMatchObject({ sourceEndpoint: endpoints[fixture.method], statusCode: 200 })
        expect(payload).toMatchObject(fixture.method === "status" ? { snapshots: fixture.result }
          : fixture.method === "old" && fixture.result !== null ? { snapshot: fixture.result } : fixture.result ?? {})
        if (fixture.result === null) expect(payload).not.toHaveProperty("snapshot")
      }
    }
    expect(await f.wire.request("worker.ping", {})).toEqual({ role: "crawler", state: "ready" })
  }, 20_000)

  it("keeps Chinese and zero areas through real Core writes and verifies the CAS bytes", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 1 })
    const room = await service.addRoom({ uid: "101" })
    expect(room).toMatchObject({ uname: " 合成直播主播 ", shortId: "0", areaId: "0", parentAreaId: "0",
      title: " 中文直播标题 ", onlineCount: 0, liveTime: "2026-09-13T03:00:00Z",
      faceUrl: " //example.test/avatar.png ", coverUrl: " relative/cover.png ", keyframeUrl: "not-a-url" })
    expect(database.findBilibiliLiveRoomById(room.id)).toMatchObject({ uname: room.uname, areaId: "0" })
    const batch = await f.source.fetchStatusByUids({ ...request, uids: ["101"] })
    const raw = await readFile(resolve(f.directory, batch.evidenceObject.relativePath))
    expect(createHash("sha256").update(raw).digest("hex")).toBe(batch.evidenceObject.sha256)
    expect(raw.toString("utf8")).toContain("合成直播主播")
    await expect(service.addRoom({ uid: "109" })).rejects.toMatchObject({ code: "BILIBILI_UNKNOWN_ERROR" })
    await expect(service.addRoom({ uid: "111" })).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(service.listRooms().total).toBe(1)
    database.close()
    database = await ControlDatabase.open(f.directory)
    expect(database.findBilibiliLiveRoomById(room.id)).toMatchObject({
      faceUrl: room.faceUrl, coverUrl: room.coverUrl, keyframeUrl: room.keyframeUrl })
  }, 20_000)

  it("preserves replacement decoding and rejects invalid output without killing the Worker", async () => {
    const f = await setup()
    // Original String conversion replaces malformed UTF-8; a scalar data node has no public room.
    const noRoom = await f.source.fetchRoomInfoOld({ ...request, uid: "901" })
    expect(noRoom.snapshot).toBeUndefined()
    expect(noRoom).toMatchObject({ sourceEndpoint: endpoints.old, statusCode: 200 })
    expect(await readFile(resolve(f.directory, noRoom.evidenceObject.relativePath)))
      .toEqual(Buffer.from('{"code":0,"data":"\xff"}', "latin1"))
    expect((await f.source.fetchRoomInfoOld({ ...request, uid: "902" })).snapshot)
      .toMatchObject({ roomId: "902", coverUrl: "not-a-url" })
    await expect(f.source.fetchRoomInfoOld({ ...request, uid: "903" })).rejects.toMatchObject({
      code: "BILIBILI_PARSE_ERROR", retryable: false, endpoint: endpoints.old, statusCode: 200 })
    expect(await f.wire.request("worker.ping", {})).toMatchObject({ state: "ready" })
  }, 20_000)

  it("preserves adjacent unsafe online counts through the real Worker and SQLite", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 1 })
    const room = await service.addRoomV2({ uid: "119" })
    expect(room.onlineCount).toBe("9007199254740992")
    expect(room.attentionCount).toBe("-9223372036854775808")
    const first = database.findBilibiliLiveRoomById(room.id)!
    const firstHash = database.findBilibiliLiveRoomSnapshots(room.id, { limit: 2 })[0]!.evidenceObjectId.slice(7)
    const firstRaw = await readFile(resolve(f.directory, "cas", "sha256", firstHash.slice(0, 2), `${firstHash}.json`))
    expect(createHash("sha256").update(firstRaw).digest("hex")).toBe(firstHash)
    expect(firstRaw.toString("utf8")).toContain('"online": 9007199254740992')
    expect(first.onlineCount).toBe(9007199254740992n)
    // Real Python wall time must cross the existing second bucket.
    await new Promise(resolveWait => setTimeout(resolveWait, 1_050))
    await expect(service.refreshNow(room.id)).rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false })
    expect(service.listRoomsV2().items[0]).toMatchObject({ onlineCount: "9007199254740993", onlineDelta: "1" })
    expect(service.trendV2({ roomMonitorId: room.id }).points.map(point => point.onlineCount))
      .toEqual(["9007199254740992", "9007199254740993"])
    expect(service.eventsV2()[0]).toMatchObject({ eventType: "TITLE_CHANGED", onlineCount: "9007199254740993" })
    expect(service.summaryV2().totalOnlineCount).toBe("9007199254740993")
    expect(() => service.listRooms()).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    const batch = await f.source.fetchStatusByUidsV2({ ...request, uids: ["119"] })
    const raw = await readFile(resolve(f.directory, batch.evidenceObject.relativePath))
    expect(createHash("sha256").update(raw).digest("hex")).toBe(batch.evidenceObject.sha256)
    expect(raw.toString("utf8")).toContain('"online": 9007199254740993')
    expect(raw.toString("utf8")).toContain('"attention": 9223372036854775808')
    expect(firstRaw).toBeTruthy()
    database.close()
    database = await ControlDatabase.open(f.directory)
    const reopened = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 1 })
    expect(reopened.listRoomsV2().items[0]?.onlineDelta).toBe("1")
    const followers = new BilibiliFollowerMonitorService({ database, now: () => new Date(), idFactory: randomUUID,
      source: { fetchCard: async ({ mid }) => ({ mid, nickname: "合成主体",
          profileUrl: `https://space.bilibili.com/${mid}`, followerCount: "1",
          fetchedAt: new Date().toISOString(), sourceEndpoint: "x/web-interface/card",
          evidenceObject: batch.evidenceObject, statusCode: 200, durationMs: 1 }),
        fetchRelationStat: async () => { throw new Error("unexpected follower fetch") } } })
    const subjects = new BilibiliSubjectService({ database, followers, live: reopened, now: () => new Date(),
      idFactory: randomUUID, liveDanmaku: { status: () => { throw new Error("disabled danmaku") }, recent: () => [] } })
    const subject = await subjects.create({ bilibiliLiveRoomMonitorId: room.id, danmuEnabled: false })
    expect(subjects.workbenchV3(subject.id).summary).toMatchObject({
      onlineCount: "9007199254740993", onlineDelta24h: "1", onlinePeak24h: "9007199254740993" })
    expect(subjects.trendsV3({ subjectId: subject.id }).points.at(-1)?.liveOnlineCount).toBe("9007199254740993")
    expect(JSON.parse(JSON.stringify(subjects.workbenchV3(subject.id)))).toMatchObject({ summary: { onlineDelta24h: "1" } })
  }, 20_000)

  it("persists original signed counters without failing room, trend, summary or Subject projections", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 1 })
    const room = await service.addRoom({ uid: "118" })
    expect(room).toMatchObject({ onlineCount: -1, attentionCount: -2 })
    expect(database.findBilibiliLiveRoomById(room.id)).toMatchObject({ onlineCount: -1n, attentionCount: -2n })
    expect(service.trend({ roomMonitorId: room.id }).points[0]).toMatchObject({ onlineCount: -1, attentionCount: -2 })
    expect(service.summary().totalOnlineCount).toBe(-1)
    expect(await service.refreshNow(room.id)).toMatchObject({ success: true, onlineCount: -1 })
    database.markBilibiliLiveRoomFailure({ monitorId: room.id, nextCollectAt: new Date().toISOString(),
      errorAt: new Date().toISOString(), errorType: "BILIBILI_NETWORK_ERROR", errorMessage: "synthetic", eventId: randomUUID(),
      outbox: { messageId: randomUUID(), topic: "synthetic-test", envelopeJson: "{}", createdAt: new Date().toISOString() } })
    expect(service.events()[0]?.onlineCount).toBe(-1)
    expect(BilibiliSubjectLiveRoomSchema.parse({ monitorId: room.id, uid: room.uid, roomId: room.roomId,
      uname: room.uname, liveStatus: room.liveStatus, monitorStatus: room.monitorStatus,
      onlineCount: -1, onlinePeak24h: -1 }).onlineCount).toBe(-1)
    expect(BilibiliSubjectSummarySchema.parse({ onlineCount: -1, onlinePeak24h: -1,
      healthScore: 100, enabledModuleCount: 1, totalModuleCount: 4 }).onlineCount).toBe(-1)
    expect(BilibiliSubjectTrendPointSchema.parse({ bucketAt: new Date().toISOString(), liveOnlineCount: -1 }).liveOnlineCount).toBe(-1)
  }, 20_000)

  it("rejects invalid input before HTTP without killing the Worker", async () => {
    const f = await setup()
    await expect(f.wire.request(messages.status, { ...request, uids: ["bad-uid"] })).rejects.toMatchObject({
      code: "BILIBILI_INPUT_INVALID", retryable: false, endpoint: endpoints.status })
    expect(await f.wire.request("worker.ping", {})).toMatchObject({ state: "ready" })
  }, 20_000)

  it("carries 75 configured UIDs in one real Worker request and preserves every result", async () => {
    const f = await setup()
    const uids = Array.from({ length: 75 }, (_, i) => String(2000 + i))
    const result = await f.source.fetchStatusByUids({ ...request, uids })
    expect(result.snapshots.map(snapshot => snapshot.uid)).toEqual(uids)
    expect(result.snapshots.map(snapshot => snapshot.onlineCount)).toEqual(uids.map((_, i) => i))
    const evidence = JSON.parse(await readFile(resolve(f.directory, result.evidenceObject.relativePath), "utf8"))
    expect(Object.keys(evidence.data)).toEqual(uids)
    expect(await f.wire.request("worker.ping", {})).toMatchObject({ state: "ready" })
  }, 20_000)
})
