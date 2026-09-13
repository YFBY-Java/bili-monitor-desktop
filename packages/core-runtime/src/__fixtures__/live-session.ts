import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"

import { BilibiliLiveSessionService } from "../bilibili-live-session-service"

export async function createLiveSessionFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-parity-"))
  const database = await ControlDatabase.open(directory)
  const monitorId = randomUUID()
  const start = "2026-09-13T04:00:00.000Z"
  database.applyBilibiliLiveRoomSnapshot({
    monitor: {
      monitorId, uid: "22", roomId: "33", shortId: null, uname: "测试主播", faceUrl: null,
      title: "测试场次", coverUrl: null, keyframeUrl: null, areaId: null, areaName: null,
      parentAreaId: null, parentAreaName: null, liveStatus: 1, liveTime: start,
      onlineCount: 1, attentionCount: 2, intervalSeconds: 300, nextCollectAt: start,
      capturedAt: start, sourceEndpoint: "room/v1/Room/get_info"
    },
    snapshot: { snapshotId: randomUUID(), capturedBucket: start },
    artifact: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), relativePath: "cas/b.json",
      sizeBytes: 1, mediaType: "application/json", createdAt: start },
    outbox: { messageId: randomUUID(), topic: "seed", envelopeJson: "{}", createdAt: start }
  })
  const room = database.findBilibiliLiveRoomById(monitorId)!
  const transportId = randomUUID()
  database.createBilibiliLiveDanmakuSession({ sessionId: transportId, monitorId, roomId: room.roomId,
    connectHost: "wss://example.test/sub", startedAt: start })
  database.markBilibiliLiveDanmakuSessionConnected(transportId, start)
  const service = new BilibiliLiveSessionService({ database, idFactory: randomUUID,
    now: () => new Date("2026-09-13T05:00:00.000Z") })
  return { database, service, room, transportId, start,
    async close() { database.close(); await rm(directory, { recursive: true, force: true }) } }
}
