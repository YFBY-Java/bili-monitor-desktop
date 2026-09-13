import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openAuthHarness, authGate } from "./__fixtures__/auth-migration"
import { seedLoginRoom, SyntheticRealtimeSource } from "./__fixtures__/login-connections"
import { BilibiliLiveDanmakuService } from "./bilibili-live-danmaku-service"

describe("original login-triggered danmaku upgrades", () => {
  let h: Awaited<ReturnType<typeof openAuthHarness>>, source: SyntheticRealtimeSource, service: BilibiliLiveDanmakuService
  beforeEach(async () => {
    h = await openAuthHarness()
    source = new SyntheticRealtimeSource()
    service = new BilibiliLiveDanmakuService({ database: h.database, source, now: () => new Date(), idFactory: randomUUID,
      credentialProvider: async () => h.database.findActiveBilibiliCredential() ? h.service.connectionCredential() : undefined })
  })
  afterEach(async () => { await service?.stopAll(); await h?.close() })

  it("continues upgrading other anonymous rooms after one failure, preserving LOGIN sessions and protocol", async () => {
    const first = seedLoginRoom(h.database, "101"), next = seedLoginRoom(h.database, "102"), logged = seedLoginRoom(h.database, "103")
    const initial = await service.start({ roomMonitorId: first, protocolVersion: 0 })
    await service.start({ roomMonitorId: next, protocolVersion: 2 })
    await h.login()
    const login = await service.start({ roomMonitorId: logged, protocolVersion: 1 })
    source.failRoom = "101"
    await service.reconnectAnonymousConnections()
    expect(service.status(first)).toMatchObject({ running: false, status: "ERROR" })
    expect(service.status(next)).toMatchObject({ running: true, authMode: "LOGIN", authUid: "99", protocolVersion: 2 })
    expect(service.status(logged).sessionId).toBe(login.sessionId)
    expect(source.starts.slice(3).map(value => [value.roomId, value.protocolVersion])).toEqual([["101", 0], ["102", 2]])
    expect(source.stops).toContain(initial.sessionId)
    expect(h.database.findActiveBilibiliCredential()).toBeDefined()
  })

  it("keeps automatic ownership across login while manual rooms remain manual", async () => {
    const manual = seedLoginRoom(h.database, "201"), automatic = seedLoginRoom(h.database, "202", 1)
    await service.start({ roomMonitorId: manual, protocolVersion: 1 })
    await service.syncAutoConnections()
    await h.login()
    await service.reconnectAnonymousConnections()
    expect(service.status(automatic).authMode).toBe("LOGIN")
    const now = new Date().toISOString()
    h.database.updateBilibiliLiveRoomStatus(automatic, false, now, { messageId: randomUUID(), topic: "seed.pause", envelopeJson: "{}", createdAt: now })
    await service.syncAutoConnections()
    expect(service.status(automatic)).toMatchObject({ running: false, status: "STOPPED" })
    expect(service.status(manual)).toMatchObject({ running: true, authMode: "LOGIN", protocolVersion: 1 })
  })

  it("serializes a user stop behind a running upgrade, without resurrecting it afterwards", async () => {
    const id = seedLoginRoom(h.database, "301"), gate = authGate()
    await service.start({ roomMonitorId: id })
    await h.login()
    source.startWait = gate.wait
    const upgrade = service.reconnectAnonymousConnections()
    await gate.started
    const stopping = service.stop(id)
    gate.release()
    await upgrade
    await stopping
    expect(service.status(id)).toMatchObject({ running: false, status: "STOPPED" })
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)?.status).toBe("STOPPED")
  })

  it("serializes another protocol start after an upgrade instead of leaking an obsolete connection", async () => {
    const id = seedLoginRoom(h.database, "401"), gate = authGate()
    await service.start({ roomMonitorId: id, protocolVersion: 0 })
    await h.login()
    source.startWait = gate.wait
    const upgrade = service.reconnectAnonymousConnections()
    await gate.started
    const replacement = service.start({ roomMonitorId: id, protocolVersion: 2 })
    gate.release()
    await upgrade
    expect(await replacement).toMatchObject({ running: true, authMode: "LOGIN", protocolVersion: 2 })
    expect(source.starts.map(value => value.protocolVersion)).toEqual([0, 0, 2])
    expect(source.stops).toContain(source.starts[1]!.connectionId)
    expect(source.listeners.size).toBe(1)
  })
})
