import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliLiveSnapshotData } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliLiveMonitorService } from "../bilibili-live-service"

// External platform responses only: writes, projections and queries use the actual service/SQLite.
export async function liveQueryFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-query-"))
  let database = await ControlDatabase.open(directory)
  let sequence = 999999
  const state = { now: "2026-09-13T04:00:00.000Z", fetchedAt: "2026-09-13T04:00:00.000Z",
    liveStatus: 0 as 0 | 1 | 2, onlineCount: 100 as number | undefined, fail: false }
  const metadata = () => ({ fetchedAt: state.fetchedAt, statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"e".repeat(64)}`, sha256: "e".repeat(64),
      relativePath: "cas/synthetic-live-query.json", sizeBytes: 2, mediaType: "application/json" } })
  const snapshot = (uid: string): BilibiliLiveSnapshotData => ({ uid, roomId: String(Number(uid) + 1000),
    uname: `合成直播查询主播${uid}`, title: "合成直播查询标题", liveStatus: state.liveStatus,
    ...(state.onlineCount === undefined ? {} : { onlineCount: state.onlineCount }), attentionCount: 10 })
  const source = {
    fetchRoomInit: async () => { throw new Error("Unexpected room-init in query fixture") },
    fetchRoomInfoOld: async () => { throw new Error("Unexpected old-room in query fixture") },
    fetchStatusByUids: async ({ uids }: { uids: string[] }) => {
      if (state.fail) throw Object.assign(new Error("合成直播查询采集失败"), { code: "BILIBILI_RISK_CONTROL", retryable: false })
      return { snapshots: uids.map(snapshot), ...metadata(), sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const }
    },
    fetchRoomInfo: async ({ roomId }: { roomId: string }) => ({ ...snapshot(String(Number(roomId) - 1000)),
      ...metadata(), sourceEndpoint: "room/v1/Room/get_info" as const })
  }
  const openService = () => new BilibiliLiveMonitorService({ database, source, now: () => new Date(state.now),
    idFactory: () => `018f0f39-7b5e-4cc1-862d-${String(sequence--).padStart(12, "0")}`,
    requestMinIntervalMs: 0, maxAttempts: 1 })
  let service = openService()
  return { state, directory,
    get database() { return database },
    get service() { return service },
    reopen: async () => { await service.stop(); database.close(); database = await ControlDatabase.open(directory); service = openService() },
    close: async () => { await service.stop(); database.close(); await rm(directory, { recursive: true, force: true }) }
  }
}
