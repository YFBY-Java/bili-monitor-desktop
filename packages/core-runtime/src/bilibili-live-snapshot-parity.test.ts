import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import type { BilibiliLiveSnapshotData } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"

// Reference: original BilibiliLiveSnapshotApplicationService and its transaction boundaries.
describe("original live snapshot application semantics", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    vi.useRealTimers()
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })
  async function setup(requestMinIntervalMs = 0) {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-parity-"))
    const database = await ControlDatabase.open(directory)
    cleanups.push(async () => { database.close(); await rm(directory, { recursive: true, force: true }) })
    const sessions = new BilibiliLiveSessionService({ database, idFactory: randomUUID })
    let fetchedAt = "2026-09-05T02:00:00.000Z"
    let status: 0 | 1 = 0
    let beforeInfo = async (): Promise<void> => undefined
    let failSession = false
    const statusCalls: number[] = []
    const observation = (uid: string): BilibiliLiveSnapshotData => ({
      uid, roomId: String(Number(uid) + 100), uname: `主播${uid}`, title: "直播间测试",
      liveStatus: status, ...(status === 1 ? { liveTime: "2026-09-05T02:00:00.000Z" } : {}), onlineCount: 100
    })
    const metadata = () => ({ fetchedAt, statusCode: 200, durationMs: 1,
      evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
        relativePath: "cas/live.json", sizeBytes: 100, mediaType: "application/json" } })
    const service = new BilibiliLiveMonitorService({
      database, idFactory: randomUUID, now: () => new Date(), requestMinIntervalMs,
      sessionObserver: { reconcileRest: (room, value) => {
        sessions.reconcileRest(room, value)
        if (failSession) throw new Error("session transaction failed")
      } },
      source: {
        fetchStatusByUids: async ({ uids }) => {
          statusCalls.push(Date.now())
          return { snapshots: uids.map(observation), ...metadata(), sourceEndpoint: "room/v1/Room/get_status_info_by_uids" }
        },
        fetchRoomInfo: async ({ roomId }) => {
          await beforeInfo()
          return { ...observation(String(Number(roomId) - 100)), ...metadata(), sourceEndpoint: "room/v1/Room/get_info" }
        },
        fetchRoomInit: async () => { throw new Error("Unexpected room-init") },
        fetchRoomInfoOld: async () => { throw new Error("Unexpected old-info") }
      }
    })
    return { database, sessions, service, statusCalls,
      setObservation: (time: string, liveStatus: 0 | 1) => { fetchedAt = time; status = liveStatus },
      beforeInfo: (action: () => Promise<void>) => { beforeInfo = action },
      failSession: () => { failSession = true }
    }
  }

  it("retains an interval and pause edited while a room refresh is in flight", async () => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "22", intervalSeconds: 60 })
    f.setObservation("2026-09-05T02:01:00.000Z", 1)
    f.beforeInfo(async () => { f.service.updateStatus(room.id, false); f.service.updateInterval(room.id, 7200) })
    await f.service.refreshNow(room.id)
    expect(f.service.listRooms().items[0]).toMatchObject({ monitorStatus: "PAUSED", intervalSeconds: 7200,
      nextCollectAt: "2026-09-05T04:01:00.000Z" })
  })

  it("does not recreate a room deleted during a refresh", async () => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "22" })
    f.beforeInfo(async () => { f.service.deleteRoom(room.id) })
    await expect(f.service.refreshNow(room.id)).rejects.toMatchObject({ code: "BILIBILI_LIVE_MONITOR_NOT_FOUND" })
    expect(f.service.listRooms().items).toEqual([])
    expect(f.database.findBilibiliLiveRoomSnapshots(room.id, { limit: 10 })).toEqual([])
  })

  it("reactivates an explicitly re-added room even if the returned platform snapshot is old", async () => {
    const f = await setup()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-05T02:20:00.000Z"))
    f.setObservation("2026-09-05T02:10:00.000Z", 1)
    const room = await f.service.addRoom({ uid: "22" })
    f.service.updateStatus(room.id, false)
    f.setObservation("2026-09-05T02:05:00.000Z", 0)
    expect(await f.service.addRoom({ uid: "22", intervalSeconds: 120 })).toMatchObject({
      id: room.id, monitorStatus: "ACTIVE", intervalSeconds: 120, liveStatus: 1,
      lastSnapshotAt: "2026-09-05T02:10:00.000Z", nextCollectAt: "2026-09-05T02:20:00.000Z"
    })
  })

  it("rejects a REST snapshot older than a pending WebSocket end signal for the whole room projection", async () => {
    const f = await setup()
    f.setObservation("2026-09-05T02:00:00.000Z", 1)
    const room = await f.service.addRoom({ uid: "22" })
    const active = f.database.findActiveBilibiliLiveSession(room.id)!
    f.database.updateBilibiliLiveSession({ ...active, state: "END_PENDING", endSignalAt: "2026-09-05T02:10:00.000Z" })
    f.setObservation("2026-09-05T02:09:00.000Z", 0)
    expect(await f.service.refreshNow(room.id)).toMatchObject({ success: true, message: "ignored-stale" })
    expect(f.service.listRooms().items[0]).toMatchObject({ liveStatus: 1, lastSnapshotAt: room.lastSnapshotAt })
    expect(f.database.findActiveBilibiliLiveSession(room.id)?.state).toBe("END_PENDING")
  })

  it("rolls back room snapshots and session changes together when reconciliation fails", async () => {
    const f = await setup()
    const room = await f.service.addRoom({ uid: "22" })
    f.setObservation("2026-09-05T02:01:00.000Z", 1)
    f.failSession()
    await expect(f.service.refreshNow(room.id)).rejects.toThrow("session transaction failed")
    expect(f.service.listRooms().items[0]).toMatchObject({ liveStatus: 0, lastSnapshotAt: room.lastSnapshotAt })
    expect(f.database.findBilibiliLiveRoomSnapshots(room.id, { limit: 10 })).toHaveLength(1)
    expect(f.database.findActiveBilibiliLiveSession(room.id)).toBeUndefined()
    expect(f.service.events().map((event) => event.eventType)).not.toContain("LIVE_STARTED")
  })

  it("preserves global endpoint spacing across concurrent room operations", async () => {
    const f = await setup(1500)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"))
    const requests = ["22", "23", "24"].map((uid) => f.service.addRoom({ uid }))
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all(requests)
    expect(f.statusCalls.map((time) => time - f.statusCalls[0]!)).toEqual([0, 1500, 3000])
  })
})
