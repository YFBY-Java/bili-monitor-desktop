import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliLiveSnapshotData } from "@bmd/contracts"
import { ControlDatabase, type StoredBilibiliLiveRoomMonitor } from "@bmd/storage"
import { BilibiliLiveMonitorService, type BilibiliLiveMonitorServiceOptions, type BilibiliLiveSource } from "../bilibili-live-service"
import { BilibiliLiveSessionService, type BilibiliLiveRestObservation } from "../bilibili-live-session-service"
import { BilibiliLiveWorkerSource } from "../bilibili-live-worker-source"
import { exactLiveFromLegacy } from "../live-long64-projection"

type SnapshotFields = Omit<BilibiliLiveSnapshotData, "uid" | "roomId">
export const liveStatusEndpoint = "room/v1/Room/get_status_info_by_uids"
export const liveInfoEndpoint = "room/v1/Room/get_info"

// Only the external API/NDJSON transport is synthetic. All business writes and boundaries are real.
export async function liveCollectionFixture(options: { maxAttempts?: number; retryBackoffMs?: number; workerBoundary?: boolean; dueBatchSize?: number; statusBatchSize?: number; enabled?: boolean } = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-collection-"))
  const database = await ControlDatabase.open(directory)
  const state = {
    now: "2026-09-13T03:00:00.000Z", fetchedAt: "2026-09-13T03:00:00.000Z", roomOffset: 100,
    data: { uname: "合成采集主播", title: "原直播标题", shortId: "3", faceUrl: "https://example.test/face.png",
      coverUrl: "https://example.test/cover.png", keyframeUrl: "https://example.test/key.png",
      areaId: "86", areaName: "游戏", parentAreaId: "2", parentAreaName: "网游",
      liveStatus: 0, liveTime: "2026-09-13T02:00:00.000Z", onlineCount: 100, attentionCount: 200 } as SnapshotFields,
    infoData: undefined as SnapshotFields | undefined,
    missingUids: [] as string[], oldRoomMissing: false,
    failure: undefined as { code: string; retryable: boolean; endpoint?: string } | undefined,
    failBoundary: false,
    idFactory: (): string => randomUUID(),
    beforeInfo: async (): Promise<void> => {},
    beforeStatus: async (): Promise<void> => {},
    inspectBoundary: (_room: StoredBilibiliLiveRoomMonitor, _observation: BilibiliLiveRestObservation): void => {}
  }
  const calls: Array<{ method: string; taskId: string; attempt: number; ids: string[] }> = []
  const waits: number[] = []
  const metadata = <T extends "room/v1/Room/get_status_info_by_uids" | "room/v1/Room/get_info" | "room/v1/Room/room_init" | "room/v1/Room/getRoomInfoOld">(sourceEndpoint: T) => ({
    sourceEndpoint, fetchedAt: state.fetchedAt, statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"f".repeat(64)}`, sha256: "f".repeat(64),
      relativePath: "cas/synthetic-live-collection.json", sizeBytes: 2, mediaType: "application/json" }
  })
  const snapshot = (uid: string, data = state.data): BilibiliLiveSnapshotData => ({
    ...data, uid, roomId: String(Number(uid) + state.roomOffset)
  })
  const source: BilibiliLiveSource = {
    fetchStatusByUids: async request => {
      calls.push({ method: "status", taskId: request.taskId, attempt: request.attempt, ids: request.uids })
      await state.beforeStatus()
      if (state.failure) throw Object.assign(new Error("合成直播平台失败"), { ...state.failure, statusCode: 200 })
      return { snapshots: request.uids.filter(uid => !state.missingUids.includes(uid)).map(uid => snapshot(uid)), ...metadata(liveStatusEndpoint) }
    },
    fetchRoomInfo: async request => {
      calls.push({ method: "info", taskId: request.taskId, attempt: request.attempt, ids: [request.roomId] })
      await state.beforeInfo()
      return { ...snapshot(String(Number(request.roomId) - state.roomOffset), state.infoData ?? state.data), ...metadata(liveInfoEndpoint) }
    },
    fetchRoomInit: async request => ({ ...snapshot(String(Number(request.roomId) - state.roomOffset)), ...metadata("room/v1/Room/room_init") }),
    fetchRoomInfoOld: async request => ({ ...(state.oldRoomMissing ? {} : { snapshot: snapshot(request.uid) }), ...metadata("room/v1/Room/getRoomInfoOld") })
  }
  const transportedSource = new BilibiliLiveWorkerSource({ request: async (type, payload) => {
    const exact = type.endsWith(".v2")
    if (exact) type = type.slice(0, -3)
    const value = JSON.parse(JSON.stringify(payload))
    const result = type === "bilibili.live.fetch-status-by-uids" ? await source.fetchStatusByUids(value)
      : type === "bilibili.live.fetch-room-info" ? await source.fetchRoomInfo(value)
        : type === "bilibili.live.fetch-room-init" ? await source.fetchRoomInit(value)
          : type === "bilibili.live.fetch-room-info-old" ? await source.fetchRoomInfoOld(value)
            : (() => { throw new Error("Unexpected synthetic collection method") })()
    return JSON.parse(JSON.stringify(exact ? exactLiveFromLegacy(result) : result))
  } })
  const sessions = new BilibiliLiveSessionService({ database, idFactory: randomUUID, now: () => new Date(state.now) })
  const settings: BilibiliLiveMonitorServiceOptions = {
    database, source: options.workerBoundary ? transportedSource : source, idFactory: () => state.idFactory(),
    now: () => new Date(state.now), requestMinIntervalMs: 0,
    maxAttempts: options.maxAttempts ?? 1, retryBackoffMs: options.retryBackoffMs ?? 0, jitter: () => 0,
    ...(options.dueBatchSize === undefined ? {} : { dueBatchSize: options.dueBatchSize }),
    ...(options.statusBatchSize === undefined ? {} : { statusBatchSize: options.statusBatchSize }),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    sleep: async ms => { waits.push(ms) },
    sessionObserver: { reconcileRest: (room, observation) => {
      state.inspectBoundary(room, observation)
      const result = sessions.reconcileRest(room, observation)
      if (state.failBoundary) throw new Error("Synthetic boundary persistence failure")
      return result
    } }
  }
  const service = new BilibiliLiveMonitorService(settings)
  return { directory, database, service, sessions, state, calls, waits,
    advance: (seconds = 300) => {
      state.now = new Date(Date.parse(state.now) + seconds * 1000).toISOString()
      state.fetchedAt = state.now
    },
    close: async () => { await service.stop(); database.close(); await rm(directory, { recursive: true, force: true }) }
  }
}
