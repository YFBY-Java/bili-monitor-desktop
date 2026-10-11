import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, parse, relative, resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SyntheticRealtimeSource } from "./__fixtures__/login-connections"
import { BilibiliLiveDanmakuService } from "./bilibili-live-danmaku-service"

function assertTemporaryRoot(path: string): void {
  if (!isAbsolute(path) || parse(resolve(path)).root.toLowerCase() !== "d:\\") throw new Error("Fixture TEMP must be absolute on D")
}
function assertTemporaryDescendant(root: string, directory: string): void {
  assertTemporaryRoot(root)
  const child = relative(resolve(root), resolve(directory))
  if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error("Fixture cleanup must stay below TEMP")
}

describe("automatic target fixture path guards", () => {
  it("rejects unsafe roots without filesystem operations", () => {
    for (const root of ["C:\\synthetic-temp", "relative-temp", "\\\\server\\share\\temp"]) {
      expect(() => assertTemporaryRoot(root)).toThrow()
    }
    expect(() => assertTemporaryRoot("D:\\synthetic-temp")).not.toThrow()
  })
  it("requires a strict descendant of the captured root without filesystem operations", () => {
    for (const directory of ["D:\\synthetic-temp", "D:\\sibling", "D:\\synthetic-temp-other", "D:\\synthetic-temp\\..\\escape", "C:\\synthetic-child"]) {
      expect(() => assertTemporaryDescendant("D:\\synthetic-temp", directory)).toThrow()
    }
    expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\synthetic-temp\\child")).not.toThrow()
  })
})

describe("original automatic danmaku targets with real SQLite", () => {
  let directory: string, database: ControlDatabase, source: SyntheticRealtimeSource, service: BilibiliLiveDanmakuService
  let createdDirectory: string | undefined, temporaryRoot: string | undefined
  let setupDatabase: ControlDatabase | undefined, setupService: BilibiliLiveDanmakuService | undefined
  const now = "2026-10-06T00:00:00.000Z"
  const outbox = () => ({ messageId: randomUUID(), topic: "synthetic.seed", envelopeJson: "{}", createdAt: now })
  function seed(index: number, liveStatus = 1, onlineCount = index) {
    const monitorId = `00000000-0000-4000-8000-${String(999999999999 - index).padStart(12, "0")}`
    database.applyBilibiliLiveRoomSnapshot({
      monitor: { monitorId, uid: String(index), roomId: String(index), shortId: null, uname: "合成主播", faceUrl: null,
        title: "合成房间", coverUrl: null, keyframeUrl: null, areaId: null, areaName: null, parentAreaId: null,
        parentAreaName: null, liveStatus, liveTime: null, onlineCount, attentionCount: 0, intervalSeconds: 300,
        nextCollectAt: now, capturedAt: now, sourceEndpoint: "synthetic" },
      snapshot: { snapshotId: randomUUID(), capturedBucket: now },
      artifact: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), relativePath: "cas/synthetic.json", sizeBytes: 1, mediaType: "application/json", createdAt: now },
      outbox: outbox()
    })
    return monitorId
  }
  function bind(monitorId: string, enabled = true) {
    const subjectId = monitorId
    const binding = { bindingId: monitorId, subjectId, bilibiliUserMonitorId: null, bilibiliLiveRoomMonitorId: monitorId,
      mid: null, roomId: null, enabledCapabilities: [], danmuEnabled: enabled, createdAt: now, updatedAt: now }
    if (!database.findBilibiliSubjectBinding(subjectId)) {
      database.createBilibiliSubject({ subject: { subjectId, displayName: "合成", avatarUrl: null, remark: null, tags: [],
        monitorStatus: "ACTIVE", healthScore: null, lastSuccessAt: null, lastEventAt: null, version: 1, createdAt: now, updatedAt: now },
      binding, layouts: [] }, outbox())
    } else database.upsertBilibiliSubjectBinding(binding)
  }
  function state(id: string, status: "CONNECTED" | "STOPPED" | "ERROR") {
    expect(service.status(id)).toMatchObject({ status, running: status === "CONNECTED" })
    expect(database.findLatestBilibiliLiveDanmakuSession(id)?.status).toBe(status)
  }
  beforeEach(async () => {
    createdDirectory = undefined; temporaryRoot = undefined; setupDatabase = undefined; setupService = undefined
    const rawTemporaryRoot = tmpdir()
    assertTemporaryRoot(rawTemporaryRoot)
    temporaryRoot = resolve(rawTemporaryRoot)
    directory = await mkdtemp(resolve(temporaryRoot, "bmd-danmaku-auto-"))
    createdDirectory = directory
    assertTemporaryDescendant(temporaryRoot, directory)
    database = await ControlDatabase.open(directory)
    setupDatabase = database
    source = new SyntheticRealtimeSource()
    service = new BilibiliLiveDanmakuService({ database, source, now: () => new Date(now), idFactory: randomUUID,
      credentialProvider: async () => undefined, maxConnections: 2 })
    setupService = service
  })
  afterEach(async () => {
    await setupService?.stopAll()
    if (setupDatabase) database.close()
    if (!createdDirectory || !temporaryRoot) return
    assertTemporaryDescendant(temporaryRoot, createdDirectory)
    await rm(createdDirectory, { recursive: true, force: true })
  })
  it("returns all qualified candidates in creation order regardless of UUID and heat", () => {
    const a = seed(1), b = seed(2), c = seed(3), offline = seed(4, 0), inactive = seed(5)
    bind(a); bind(offline); bind(inactive)
    database.updateBilibiliLiveRoomStatus(inactive, false, now, outbox())
    seed(6, 0)
    expect(database.listBilibiliLiveDanmakuAutoStartRoomIds()).toEqual([a, b, c, offline])
  })
  it("uses creation order for equal heat and returns the entire default candidate set", () => {
    const ids = Array.from({ length: 12 }, (_, index) => seed(index + 1, 1, 0))
    expect(database.listBilibiliLiveDanmakuAutoStartRoomIds()).toEqual(ids)
  })
  it("skips the first manual candidate before filling automatic capacity", async () => {
    const a = seed(1, 1, 999), b = seed(2)
    const manual = await service.start({ roomMonitorId: a, protocolVersion: 1 })
    await service.syncAutoConnections()
    state(a, "CONNECTED"); state(b, "CONNECTED")
    expect(service.status(a)).toMatchObject({ sessionId: manual.sessionId, protocolVersion: 1 })
    expect(source.listeners.size).toBe(2)
  })
  it("keeps an already selected auto session when an earlier candidate becomes manual", async () => {
    const a = seed(1, 0), b = seed(2)
    await service.syncAutoConnections()
    const session = service.status(b).sessionId
    seed(1, 1, 999)
    await service.start({ roomMonitorId: a, protocolVersion: 0 })
    await service.syncAutoConnections()
    state(a, "CONNECTED"); state(b, "CONNECTED")
    expect(service.status(b).sessionId).toBe(session)
  })
  it("counts ineligible manual connections and leaves all-manual sessions untouched", async () => {
    const a = seed(1, 0), b = seed(2, 0), c = seed(3)
    const first = await service.start({ roomMonitorId: a, protocolVersion: 0 })
    await service.syncAutoConnections(); state(c, "CONNECTED")
    await service.stop(c)
    const second = await service.start({ roomMonitorId: b, protocolVersion: 1 })
    await service.syncAutoConnections()
    state(a, "CONNECTED"); state(b, "CONNECTED"); state(c, "STOPPED")
    expect(service.status(a).sessionId).toBe(first.sessionId)
    expect(service.status(b).sessionId).toBe(second.sessionId)
    expect(source.listeners.size).toBe(2)
  })
  it("stops displaced offline auto before starting live and removes lost qualifications", async () => {
    const a = seed(1, 0), b = seed(2, 0)
    bind(a); bind(b)
    await service.syncAutoConnections()
    const bSession = service.status(b).sessionId
    const c = seed(3)
    source.startWait = async () => { state(b, "STOPPED"); expect(source.listeners.has(bSession!)).toBe(false) }
    await service.syncAutoConnections()
    state(a, "CONNECTED"); state(b, "STOPPED"); state(c, "CONNECTED")
    source.startWait = async () => {}
    bind(a, false)
    database.updateBilibiliLiveRoomStatus(c, false, now, outbox())
    await service.syncAutoConnections()
    state(a, "STOPPED"); state(c, "STOPPED"); state(b, "CONNECTED")
    expect(source.listeners.size).toBe(1)
  })
  it("does not create a session before info succeeds and retries selected target next round", async () => {
    const manual = seed(1, 0), a = seed(2), b = seed(3)
    await service.start({ roomMonitorId: manual })
    source.failRoom = "2"
    await service.syncAutoConnections()
    expect(service.status(a)).toMatchObject({ status: "NOT_STARTED", running: false })
    expect(database.findLatestBilibiliLiveDanmakuSession(a)).toBeUndefined()
    state(manual, "CONNECTED")
    expect(database.findLatestBilibiliLiveDanmakuSession(b)).toBeUndefined()
    source.failRoom = undefined
    await service.syncAutoConnections()
    state(a, "CONNECTED")
    expect(service.status(a).sessionId).toBeDefined()
    expect(database.findLatestBilibiliLiveDanmakuSession(b)).toBeUndefined()
    expect(source.starts.map(input => input.roomId)).toEqual(["1", "2", "2"])
  })
  it("reconnects an explicitly stopped eligible room on the next sync", async () => {
    const a = seed(1)
    await service.syncAutoConnections()
    const session = service.status(a).sessionId
    await service.stop(a); state(a, "STOPPED")
    await service.syncAutoConnections(); state(a, "CONNECTED")
    expect(service.status(a).sessionId).not.toBe(session)
    expect(source.listeners.size).toBe(1)
  })
  it("preserves creation order after update and reopen and puts re-added room last", async () => {
    const a = seed(1), b = seed(2), c = seed(3)
    seed(1, 1, 999)
    await service.stopAll(); database.close()
    database = await ControlDatabase.open(directory)
    expect(database.listBilibiliLiveDanmakuAutoStartRoomIds()).toEqual([a, b, c])
    database.deleteBilibiliLiveRoom(a, outbox()); seed(1)
    expect(database.listBilibiliLiveDanmakuAutoStartRoomIds()).toEqual([b, c, a])
  })
})
