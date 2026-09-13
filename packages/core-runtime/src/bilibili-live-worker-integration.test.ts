import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliSubjectLiveRoomSchema, BilibiliSubjectSummarySchema, BilibiliSubjectTrendPointSchema } from "@bmd/contracts"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"
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
    if (directory) await rm(directory, { recursive: true, force: true })
    transport = undefined; database = undefined; directory = undefined })

  async function setup() {
    const pythonExecutable = process.env.BMD_PYTHON_EXE
    if (!pythonExecutable) throw new Error("Activate the D-drive project environment before testing")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-worker-wire-"))
    transport = new NdjsonPythonWorkerTransport({ pythonExecutable,
      pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/live_http"),
      dataDirectory: directory, role: "crawler", requestTimeoutMs: 8_000 })
    return { source: new BilibiliLiveWorkerSource(transport), wire: transport, directory }
  }

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
      title: " 中文直播标题 ", onlineCount: 0, liveTime: "2026-09-13T03:00:00Z" })
    expect(database.findBilibiliLiveRoomById(room.id)).toMatchObject({ uname: room.uname, areaId: "0" })
    const batch = await f.source.fetchStatusByUids({ ...request, uids: ["101"] })
    const raw = await readFile(resolve(f.directory, batch.evidenceObject.relativePath))
    expect(createHash("sha256").update(raw).digest("hex")).toBe(batch.evidenceObject.sha256)
    expect(raw.toString("utf8")).toContain("合成直播主播")
    await expect(service.addRoom({ uid: "109" })).rejects.toMatchObject({ code: "BILIBILI_UNKNOWN_ERROR" })
    await expect(service.addRoom({ uid: "111" })).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect(service.listRooms().total).toBe(1)
  }, 20_000)

  it("rejects bad output with typed errors without killing the Worker", async () => {
    const f = await setup()
    await expect(f.source.fetchRoomInfoOld({ ...request, uid: "901" })).rejects.toMatchObject({
      code: "BILIBILI_PARSE_ERROR", retryable: false, endpoint: endpoints.old, statusCode: 200 })
    await expect(f.source.fetchRoomInfoOld({ ...request, uid: "902" })).rejects.toMatchObject({
      code: "BILIBILI_PARSE_ERROR", retryable: false, endpoint: endpoints.old, statusCode: 200 })
    expect(await f.wire.request("worker.ping", {})).toMatchObject({ state: "ready" })
  }, 20_000)

  it("persists original signed counters without failing room, trend, summary or Subject projections", async () => {
    const f = await setup()
    database = await ControlDatabase.open(f.directory)
    const service = new BilibiliLiveMonitorService({ database, source: f.source, idFactory: randomUUID,
      now: () => new Date(), requestMinIntervalMs: 0, maxAttempts: 1 })
    const room = await service.addRoom({ uid: "118" })
    expect(room).toMatchObject({ onlineCount: -1, attentionCount: -2 })
    expect(database.findBilibiliLiveRoomById(room.id)).toMatchObject({ onlineCount: -1, attentionCount: -2 })
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
