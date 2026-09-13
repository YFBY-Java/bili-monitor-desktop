import { randomUUID } from "node:crypto"
import { ControlDatabase } from "@bmd/storage"
import type { BilibiliLiveDanmakuSource, BilibiliLiveDanmakuSourceEvent, BilibiliLiveDanmakuSourceStartInput, BilibiliLiveDanmakuSourceStartResult } from "../bilibili-live-danmaku-service"

export class SyntheticRealtimeSource implements BilibiliLiveDanmakuSource {
  starts: BilibiliLiveDanmakuSourceStartInput[] = []
  stops: string[] = []
  stopAllCalls = 0
  listeners = new Map<string, (event: BilibiliLiveDanmakuSourceEvent) => void>()
  startWait = async (_input: BilibiliLiveDanmakuSourceStartInput): Promise<void> => {}
  stopWait = async (_connectionId: string): Promise<void> => {}
  failRoom: string | undefined
  forceAnonymous = false
  async start(input: BilibiliLiveDanmakuSourceStartInput, listener: (event: BilibiliLiveDanmakuSourceEvent) => void): Promise<BilibiliLiveDanmakuSourceStartResult> {
    this.starts.push(structuredClone(input))
    this.listeners.set(input.connectionId, listener)
    await this.startWait(input)
    if (input.roomId === this.failRoom) throw Object.assign(new Error("Synthetic room connection failed"), { code: "BILIBILI_DANMAKU_START_FAILED" })
    return { connectHost: "wss://example.test/login-link", protocolVersion: input.protocolVersion ?? 3,
      authMode: input.credential && !this.forceAnonymous ? "LOGIN" : "ANONYMOUS",
      ...(input.credential && !this.forceAnonymous ? { authUid: input.credential.authUid } : {}) }
  }
  async stop(connectionId: string) {
    this.stops.push(connectionId)
    await this.stopWait(connectionId)
    this.listeners.delete(connectionId)
  }
  async stopAll() { this.stopAllCalls++; this.listeners.clear() }
}

export function seedLoginRoom(database: ControlDatabase, roomId: string, liveStatus = 0): string {
  const monitorId = randomUUID(), now = new Date().toISOString()
  database.applyBilibiliLiveRoomSnapshot({
    monitor: { monitorId, uid: roomId, roomId, shortId: null, uname: "合成联动主播", faceUrl: null,
      title: "合成登录联动房间", coverUrl: null, keyframeUrl: null, areaId: null, areaName: null,
      parentAreaId: null, parentAreaName: null, liveStatus, liveTime: null, onlineCount: Number(roomId),
      attentionCount: 0, intervalSeconds: 300, nextCollectAt: now, capturedAt: now, sourceEndpoint: "room/v1/Room/get_info" },
    snapshot: { snapshotId: randomUUID(), capturedBucket: now },
    artifact: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), relativePath: "cas/synthetic-login-link.json", sizeBytes: 1, mediaType: "application/json", createdAt: now },
    outbox: { messageId: randomUUID(), topic: "seed", envelopeJson: "{}", createdAt: now }
  })
  return monitorId
}
