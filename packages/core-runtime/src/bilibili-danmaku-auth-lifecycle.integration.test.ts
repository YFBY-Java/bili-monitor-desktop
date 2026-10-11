import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { openAuthHarness } from "./__fixtures__/auth-migration"
import { assertDanmakuTempPath } from "./__fixtures__/danmaku-configuration"
import { seedLoginRoom } from "./__fixtures__/login-connections"
import { BilibiliLiveDanmakuService, type BilibiliLiveDanmakuSourceEvent } from "./bilibili-live-danmaku-service"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"

it("persists separate candidate sessions while merging early authentication and preserving terminal state", async () => {
  assertDanmakuTempPath()
  const h = await openAuthHarness()
  let service: BilibiliLiveDanmakuService | undefined
  try {
  const roomMonitorId = seedLoginRoom(h.database, "501")
  const at = "2026-10-06T08:00:00.000Z", metadata = { connectHost: "wss://example.test/sub", protocolVersion: 2, authMode: "ANONYMOUS" as const }
  let listener: ((event: unknown) => void) | undefined
  let connectionId = "", firstSession = "", phase = 0
  const stops: string[] = []
  const source = new BilibiliLiveDanmakuWorkerSource({ subscribe: (_id, callback) => { listener = callback; return () => {} }, stop: async () => {},
    request: async (type, input) => {
      if (type === "stop") { stops.push(String(input.connectionId)); return { stopped: true } }
      connectionId = String(input.connectionId)
      const receivedAt = phase === 0 ? at : phase === 1 ? "2026-10-06T08:00:02.000Z" : "2026-10-06T08:00:03.000Z"
      listener!({ type: "connecting", attempt: 1, receivedAt, ...metadata })
      firstSession = h.database.findLatestBilibiliLiveDanmakuSession(roomMonitorId)!.sessionId
      if (phase === 0) {
        listener!({ type: "attempt-failed", attempt: 1, receivedAt: at, code: "HANDSHAKE_FAILED", message: "fixture handshake" })
        expect(service?.status(roomMonitorId)).toMatchObject({ status: "ERROR", running: false })
        listener!({ type: "connecting", attempt: 2, receivedAt: "2026-10-06T08:00:01.000Z", ...metadata, protocolVersion: 3 })
        listener!({ type: "connected", attempt: 2, receivedAt: at })
      } else if (phase === 1) listener!({ type: "error", attempt: 1, receivedAt, errorType: "BILIBILI_DANMAKU_AUTH_FAILED", message: "fixture rejection" })
      return { ...metadata, protocolVersion: phase === 0 ? 3 : 2, status: "AUTHENTICATING", attempt: phase === 0 ? 2 : 1 }
    } })
  service = new BilibiliLiveDanmakuService({ database: h.database, source, now: () => new Date(at), idFactory: randomUUID, credentialProvider: async () => undefined })
    const connected = await service.start({ roomMonitorId })
    expect(connected).toMatchObject({ status: "CONNECTED", running: true })
    expect(connected.sessionId).not.toBe(firstSession)
    const reader = new DatabaseSync(resolve(h.directory, "control.db"), { readOnly: true })
    try { expect(reader.prepare("SELECT status FROM bilibili_live_danmaku_session WHERE session_id = ?").get(firstSession)).toMatchObject({ status: "ERROR" }) }
    finally { reader.close() }
    const heartbeat: BilibiliLiveDanmakuSourceEvent = { type: "heartbeat-sent", attempt: 2, receivedAt: at }
    listener!(heartbeat)
    expect(service.status(roomMonitorId).lastHeartbeatAt).toBe(at)
    expect(h.database.getBilibiliLiveDanmakuStats(roomMonitorId, at).heartbeatPopularity).toBeNull()
    await service.stop(roomMonitorId)
    expect(stops).toEqual([connectionId])
    listener!({ type: "closed", attempt: 2, receivedAt: at, code: 1000, reason: "late close" })
    expect(service.status(roomMonitorId).status).toBe("STOPPED")
    phase = 1
    const rejected = await service.start({ roomMonitorId })
    expect(rejected).toMatchObject({ status: "ERROR", running: false, lastErrorType: "BILIBILI_DANMAKU_AUTH_FAILED" })
    expect(h.database.findLatestBilibiliLiveDanmakuSession(roomMonitorId)?.status).toBe("ERROR")
    phase = 2
    expect(await service.start({ roomMonitorId })).toMatchObject({ status: "AUTHENTICATING", running: true })
    const authenticatingListener = listener!
    await service.stop(roomMonitorId)
    expect(stops.at(-1)).toBe(connectionId)
    authenticatingListener({ type: "connected", attempt: 1, receivedAt: at })
    expect(service.status(roomMonitorId)).toMatchObject({ status: "STOPPED", running: false })
  } finally { try { await service?.stopAll() } finally { await h.close() } }
})
