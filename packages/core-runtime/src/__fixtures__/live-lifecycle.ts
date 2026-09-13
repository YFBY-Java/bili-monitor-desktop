import type { BilibiliLiveSnapshotData } from "@bmd/contracts"
import type { BilibiliLiveSource } from "../bilibili-live-service"

export type LiveMethod = "status" | "info" | "init" | "old"

export function liveResponseGate() {
  let release = () => {}
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, resolve: () => release() }
}

// Only the external platform boundary is controlled; callers use real services and SQLite.
export function liveLifecycleSource() {
  const calls: Array<{ method: LiveMethod; taskId: string; ids: string[] }> = []
  const state = {
    beforeResponse: async (_method: LiveMethod): Promise<void> => {},
    beforeError: () => {},
    beforeSuccess: (_method: LiveMethod) => {},
    stop: async (): Promise<void> => {},
    failure: undefined as Error | undefined,
    missing: false,
    stops: 0
  }
  const metadata = <T extends "room/v1/Room/get_status_info_by_uids" | "room/v1/Room/get_info" | "room/v1/Room/room_init" | "room/v1/Room/getRoomInfoOld">(sourceEndpoint: T) => ({
    sourceEndpoint, fetchedAt: new Date().toISOString(), statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"c".repeat(64)}`, sha256: "c".repeat(64),
      relativePath: "cas/synthetic-live-lifecycle.json", sizeBytes: 2, mediaType: "application/json" }
  })
  const snapshot = (uid: string): BilibiliLiveSnapshotData => ({ uid, roomId: String(Number(uid) + 100),
    uname: `生命周期合成主播${uid}`, liveStatus: 0,
    onlineCount: 100 + calls.filter(call => call.method === "status").length })
  async function before(method: LiveMethod, ids: string[], taskId: string) {
    calls.push({ method, ids, taskId })
    await state.beforeResponse(method)
    if (state.failure) { state.beforeError(); throw state.failure }
    state.beforeSuccess(method)
  }
  const source: BilibiliLiveSource = {
    fetchStatusByUids: async request => {
      await before("status", request.uids, request.taskId)
      return { snapshots: state.missing ? [] : request.uids.map(snapshot), ...metadata("room/v1/Room/get_status_info_by_uids") }
    },
    fetchRoomInfo: async request => {
      await before("info", [request.roomId], request.taskId)
      return { ...snapshot(String(Number(request.roomId) - 100)), ...metadata("room/v1/Room/get_info") }
    },
    fetchRoomInit: async request => {
      await before("init", [request.roomId], request.taskId)
      return { ...snapshot(String(Number(request.roomId) - 100)), ...metadata("room/v1/Room/room_init") }
    },
    fetchRoomInfoOld: async request => {
      await before("old", [request.uid], request.taskId)
      return { snapshot: snapshot(request.uid), ...metadata("room/v1/Room/getRoomInfoOld") }
    },
    stop: async () => { state.stops++; await state.stop() }
  }
  return { source, state, calls }
}
