import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import type {
  BilibiliLiveFetchedOptionalSnapshot,
  BilibiliLiveFetchedSnapshot,
  BilibiliLiveFetchedStatusBatch,
  BilibiliLiveRoomRequest,
  BilibiliLiveStatusByUidsRequest,
  BilibiliLiveUidRequest
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it } from "vitest"

import { BilibiliLiveMonitorService, type BilibiliLiveSource } from "./bilibili-live-service"

describe("BilibiliLiveMonitorService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("resolves a short room id and persists the merged original room projection", async () => {
    const database = await openDatabase()
    const source = liveSource({
      roomInit: fetched("room/v1/Room/room_init", {
        uid: "22",
        roomId: "330033",
        shortId: "33",
        uname: "UID 22",
        liveStatus: 0
      }),
      roomInfo: fetched("room/v1/Room/get_info", {
        uid: "22",
        roomId: "330033",
        uname: "UID 22",
        title: "直播标题",
        areaId: "86",
        areaName: "单机游戏",
        liveStatus: 0,
        attentionCount: 5678
      }),
      status: batch([{
        uid: "22",
        roomId: "330033",
        shortId: "33",
        uname: "anchor",
        faceUrl: "https://i0.hdslb.com/bfs/face/anchor.jpg",
        title: "直播标题",
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        onlineCount: 1234,
        attentionCount: 5678
      }])
    })
    const service = createService(database, source)
    try {
      const room = await service.addRoom({ roomId: "33", intervalSeconds: 300 })

      expect(room).toMatchObject({
        uid: "22",
        roomId: "330033",
        shortId: "33",
        uname: "anchor",
        title: "直播标题",
        areaName: "单机游戏",
        liveStatus: 1,
        onlineCount: 1234,
        attentionCount: 5678,
        monitorStatus: "ACTIVE",
        intervalSeconds: 300
      })
      expect(source.calls).toEqual([
        ["room-init", "33"],
        ["room-info", "330033"],
        ["status", "22"]
      ])
      expect(service.listRooms()).toMatchObject({ total: 1, items: [{ roomId: "330033" }] })
      expect(database.listBilibiliApiCalls("00000000-0000-4000-8000-000000000001"))
        .toHaveLength(3)
      expect(database.listBilibiliApiCalls("00000000-0000-4000-8000-000000000001"))
        .toMatchObject([
          { requestMeta: { roomId: "33" }, responseMeta: { success: true } },
          { requestMeta: { roomId: "330033" }, responseMeta: { success: true } },
          { requestMeta: { uids: ["22"] }, responseMeta: { success: true } }
        ])
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("falls back to the original old-room lookup when status-by-uid has no room", async () => {
    const database = await openDatabase()
    const source = liveSource({
      status: batch([]),
      old: optionalFetched({ uid: "22", roomId: "330033", title: "旧接口标题", liveStatus: 0 }),
      roomInit: fetched("room/v1/Room/room_init", {
        uid: "22", roomId: "330033", uname: "UID 22", liveStatus: 0
      }),
      roomInfo: fetched("room/v1/Room/get_info", {
        uid: "22", roomId: "330033", uname: "UID 22", title: "详情标题", liveStatus: 0
      })
    })
    const service = createService(database, source)
    try {
      const room = await service.addRoom({ uid: "22" })
      expect(room).toMatchObject({ uid: "22", roomId: "330033", title: "详情标题" })
      expect(source.calls).toEqual([
        ["status", "22"],
        ["room-info-old", "22"],
        ["room-init", "330033"],
        ["room-info", "330033"]
      ])
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("records live-start/title events and exposes summary and trends from SQLite", async () => {
    const database = await openDatabase()
    const source = liveSource({
      status: batch([{ uid: "22", roomId: "33", uname: "anchor", title: "old", liveStatus: 0 }]),
      roomInfo: fetched("room/v1/Room/get_info", {
        uid: "22", roomId: "33", uname: "anchor", title: "old", liveStatus: 0
      })
    })
    const service = createService(database, source)
    try {
      const room = await service.addRoom({ uid: "22" })
      source.setStatus(batch([{
        uid: "22",
        roomId: "33",
        uname: "anchor",
        title: "new",
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        onlineCount: 200
      }], "2026-08-29T12:01:00.000Z"))
      source.setRoomInfo(fetched("room/v1/Room/get_info", {
        uid: "22", roomId: "33", uname: "anchor", title: "new", liveStatus: 1
      }, "2026-08-29T12:01:00.000Z"))

      const result = await service.refreshNow(room.id)
      const summary = service.summary()
      const events = service.events({ limit: 20 })
      const trend = service.trend({ roomMonitorId: room.id, limit: 500 })

      expect(result).toMatchObject({ success: true, liveStatus: 1, onlineCount: 200 })
      expect(summary).toMatchObject({
        totalRooms: 1,
        activeRooms: 1,
        liveRooms: 1,
        offlineRooms: 0,
        totalOnlineCount: 200,
        todayLiveStarts: 1
      })
      expect(events.map((event) => event.eventType)).toEqual(["TITLE_CHANGED", "LIVE_STARTED"])
      expect(trend.points).toHaveLength(2)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("reactivates an existing paused room with the newly requested interval", async () => {
    const database = await openDatabase()
    const source = liveSource({
      status: batch([{ uid: "22", roomId: "33", uname: "anchor", liveStatus: 0 }]),
      roomInfo: fetched("room/v1/Room/get_info", {
        uid: "22", roomId: "33", uname: "anchor", liveStatus: 0
      })
    })
    const service = createService(database, source)
    try {
      const created = await service.addRoom({ uid: "22", intervalSeconds: 300 })
      service.updateStatus(created.id, false)
      source.setStatus(batch(
        [{ uid: "22", roomId: "33", uname: "anchor", liveStatus: 0 }],
        "2026-08-29T12:01:00.000Z"
      ))
      source.setRoomInfo(fetched("room/v1/Room/get_info", {
        uid: "22", roomId: "33", uname: "anchor", liveStatus: 0
      }, "2026-08-29T12:01:00.000Z"))

      const reactivated = await service.addRoom({ uid: "22", intervalSeconds: 600 })

      expect(reactivated).toMatchObject({
        id: created.id,
        monitorStatus: "ACTIVE",
        intervalSeconds: 600,
        nextCollectAt: "2026-08-29T12:11:00.000Z"
      })
    } finally {
      await service.stop()
      database.close()
    }
  })

  async function openDatabase(): Promise<ControlDatabase> {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-service-"))
    return ControlDatabase.open(directory)
  }
})

function createService(database: ControlDatabase, source: MutableLiveSource): BilibiliLiveMonitorService {
  let id = 0
  return new BilibiliLiveMonitorService({
    database,
    source,
    now: () => new Date("2026-08-29T12:00:00.000Z"),
    idFactory: () => {
      id += 1
      return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`
    },
    requestMinIntervalMs: 0,
    maxAttempts: 1
  })
}

type SnapshotData = Omit<
  BilibiliLiveFetchedSnapshot,
  "fetchedAt" | "sourceEndpoint" | "evidenceObject" | "statusCode" | "durationMs"
>

function artifact(seed: string) {
  return {
    objectId: `sha256:${seed.repeat(64)}`,
    relativePath: `cas/sha256/${seed}${seed}/${seed.repeat(64)}.json`,
    sha256: seed.repeat(64),
    sizeBytes: 100,
    mediaType: "application/json"
  }
}

function fetched(
  endpoint: BilibiliLiveFetchedSnapshot["sourceEndpoint"],
  data: SnapshotData,
  fetchedAt = "2026-08-29T12:00:00.000Z"
): BilibiliLiveFetchedSnapshot {
  return {
    ...data,
    fetchedAt,
    sourceEndpoint: endpoint,
    evidenceObject: artifact(endpoint.includes("status") ? "c" : endpoint.includes("init") ? "a" : "b"),
    statusCode: 200,
    durationMs: 10
  }
}

function batch(
  snapshots: BilibiliLiveFetchedStatusBatch["snapshots"],
  fetchedAt = "2026-08-29T12:00:00.000Z"
): BilibiliLiveFetchedStatusBatch {
  return {
    snapshots,
    fetchedAt,
    sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
    evidenceObject: artifact("c"),
    statusCode: 200,
    durationMs: 10
  }
}

function optionalFetched(snapshot: SnapshotData | undefined): BilibiliLiveFetchedOptionalSnapshot {
  return {
    ...(snapshot ? { snapshot } : {}),
    fetchedAt: "2026-08-29T12:00:00.000Z",
    sourceEndpoint: "room/v1/Room/getRoomInfoOld",
    evidenceObject: artifact("d"),
    statusCode: 200,
    durationMs: 10
  }
}

interface MutableLiveSource extends BilibiliLiveSource {
  calls: string[][]
  setStatus: (value: BilibiliLiveFetchedStatusBatch) => void
  setRoomInfo: (value: BilibiliLiveFetchedSnapshot) => void
}

function liveSource(initial: {
  roomInit?: BilibiliLiveFetchedSnapshot
  roomInfo?: BilibiliLiveFetchedSnapshot
  old?: BilibiliLiveFetchedOptionalSnapshot
  status?: BilibiliLiveFetchedStatusBatch
}): MutableLiveSource {
  let roomInfo = initial.roomInfo
  let status = initial.status
  const calls: string[][] = []
  return {
    calls,
    setStatus: (value) => { status = value },
    setRoomInfo: (value) => { roomInfo = value },
    fetchRoomInit: async (request: BilibiliLiveRoomRequest) => {
      calls.push(["room-init", request.roomId])
      if (!initial.roomInit) throw new Error("room init missing")
      return initial.roomInit
    },
    fetchRoomInfo: async (request: BilibiliLiveRoomRequest) => {
      calls.push(["room-info", request.roomId])
      if (!roomInfo) throw new Error("room info missing")
      return roomInfo
    },
    fetchRoomInfoOld: async (request: BilibiliLiveUidRequest) => {
      calls.push(["room-info-old", request.uid])
      if (!initial.old) return optionalFetched(undefined)
      return initial.old
    },
    fetchStatusByUids: async (request: BilibiliLiveStatusByUidsRequest) => {
      calls.push(["status", request.uids.join(",")])
      if (!status) throw new Error("status missing")
      return status
    }
  }
}
