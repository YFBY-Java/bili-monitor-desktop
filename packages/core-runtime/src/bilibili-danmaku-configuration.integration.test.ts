import { access, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import { BilibiliLiveDanmakuService, type BilibiliLiveDanmakuServiceOptions } from "./bilibili-live-danmaku-service"
import { BilibiliAuthService } from "./bilibili-auth-service"

describe("danmaku startup controls in real Core and SQLite", () => {
  let f: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  afterEach(async () => { await f?.close(); f = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
  it("keeps configured anonymous reconnects free of credential reads and enables LOGIN after restart", async () => {
    const connectionConfiguration = { heartbeatSeconds: 7, connectTimeoutMs: 1234,
      useLoginCredential: false, webLocation: " location! ", clientVersion: " version " }
    const cacheConfiguration = { wbiCacheSeconds: 350, buvidCacheSeconds: -8 }
    f = await danmakuConfigurationFixture()
    for (const [key, value] of Object.entries({ ...connectionConfiguration, ...cacheConfiguration })) vi.stubEnv(
      `APP_BILIBILI_LIVEMONITOR_DANMAKU_${key.toUpperCase()}`, String(value))
    const room = await f.seedRoom({ liveStatus: 0 })
    let runtime = await f.start()
    const credential = vi.spyOn(BilibiliAuthService.prototype, "connectionCredential")
    const initial = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const qr = await runtime.startBilibiliQrLogin()
    expect(await runtime.pollBilibiliQrLogin(qr.loginId)).toMatchObject({ status: "SUCCESS" })
    await vi.waitFor(() => expect(f!.realtime.starts).toHaveLength(2))
    expect(f.realtime.stops).toContain(initial.sessionId)
    expect(f.realtime.starts.map(input => input.credential)).toEqual([undefined, undefined])
    expect(f.realtime.starts.map(input => input.connectionConfiguration)).toEqual([connectionConfiguration, connectionConfiguration])
    expect(f.realtime.starts.map(input => input.cacheConfiguration)).toEqual([cacheConfiguration, cacheConfiguration])
    expect(credential).not.toHaveBeenCalled()
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id)).toMatchObject({ authMode: "ANONYMOUS" })
    await f.stop()
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_USELOGINCREDENTIAL", undefined)
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_WBICACHESECONDS", undefined)
    vi.stubEnv("APP_BILIBILI_LIVEMONITOR_DANMAKU_BUVIDCACHESECONDS", undefined)
    const restartedCacheConfiguration = { wbiCacheSeconds: 900, buvidCacheSeconds: 600 }
    await writeFile(f.path, JSON.stringify({ ...connectionConfiguration, ...restartedCacheConfiguration, useLoginCredential: true }), "utf8")
    runtime = await f.start()
    expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })).toMatchObject({ authMode: "LOGIN", authUid: "99" })
    expect(credential).toHaveBeenCalledOnce()
    expect(f.realtime.starts.at(-1)?.cacheConfiguration).toEqual(restartedCacheConfiguration)
  })
  it("passes configured protocol preference, treats raw requests as auto and replaces only differing explicit versions", async () => {
    f = await danmakuConfigurationFixture({ protocolVersion: 2 })
    const room = await f.seedRoom({ liveStatus: 0 }), runtime = await f.start()
    const first = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id, protocolVersion: 4 })
    expect(f.realtime.starts[0]).toMatchObject({ preferredProtocolVersion: 2 })
    expect(f.realtime.starts[0]).not.toHaveProperty("protocolVersion")
    for (const protocolVersion of [-2, 4, -2147483648, 2147483647]) {
      expect((await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id, protocolVersion })).sessionId).toBe(first.sessionId)
    }
    expect(f.realtime.starts).toHaveLength(1)
    const manual = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id, protocolVersion: 0 })
    expect(manual.sessionId).not.toBe(first.sessionId)
    expect(f.realtime.starts[1]).toMatchObject({ protocolVersion: 0, preferredProtocolVersion: 2 })
    expect(f.realtime.stops).toEqual([first.sessionId])
  })
  it("rejects disabled manual starts before any session or source work", async () => {
    f = await danmakuConfigurationFixture({ enabled: false })
    const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start()
    await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_DISABLED" })
    expect(f.realtime.starts).toHaveLength(0)
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id)).toMatchObject({ running: false, status: "NOT_STARTED" })
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })).toEqual([])
    expect(runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" })).toEqual([])
    expect(await runtime.stopBilibiliLiveDanmaku(room.id)).toMatchObject({ running: false })
  })
  it("disables automatic starts while preserving manual sessions", async () => {
    f = await danmakuConfigurationFixture({ autoStartEnabled: false })
    const a = await f.seedRoom({ liveStatus: 1 }), b = await f.seedRoom({ liveStatus: 1 })
    vi.useFakeTimers()
    const runtime = await f.start({ schedulerEnabled: true })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runtime.getBilibiliLiveDanmakuStatus(a.id).status).toBe("NOT_STARTED")
    expect(runtime.getBilibiliLiveDanmakuStatus(b.id).status).toBe("NOT_STARTED")
    expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId: a.id })).toMatchObject({ running: true, status: "CONNECTED" })
    await vi.advanceTimersByTimeAsync(5000)
    expect(runtime.getBilibiliLiveDanmakuStatus(a.id).running).toBe(true)
    expect(f.realtime.starts).toHaveLength(1)
  })
  it.each([1, 0, -5])("consumes maxConnections %i as at least one", async maxConnections => {
    f = await danmakuConfigurationFixture({ maxConnections })
    const a = await f.seedRoom({ liveStatus: 0 }), b = await f.seedRoom({ liveStatus: 0 }), runtime = await f.start()
    expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId: a.id })).toMatchObject({ status: "CONNECTED" })
    await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: b.id })).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_LIMIT" })
    expect(runtime.getBilibiliLiveDanmakuStatus(b.id).status).toBe("NOT_STARTED")
    expect(f.realtime.starts).toHaveLength(1)
  })
  it("passes an upper limit of two into real connections and keeps capacity errors separate", async () => {
    f = await danmakuConfigurationFixture({ maxConnections: 2 })
    const rooms = await Promise.all([f.seedRoom({ liveStatus: 0 }), f.seedRoom({ liveStatus: 0 }), f.seedRoom({ liveStatus: 0 })])
    const runtime = await f.start()
    for (const room of rooms.slice(0, 2)) expect((await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })).status).toBe("CONNECTED")
    await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: rooms[2]!.id })).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_LIMIT" })
    expect(runtime.getBilibiliLiveDanmakuStatus(rooms[2]!.id).status).toBe("NOT_STARTED")
    expect(f.realtime.starts).toHaveLength(2)
  })
  it("keeps existing manual and automatic sessions when the same service options close either switch", async () => {
    f = await danmakuConfigurationFixture()
    const a = await f.seedRoom({ liveStatus: 0 }), b = await f.seedRoom({ liveStatus: 1 })
    const db = await ControlDatabase.open(f.directory)
    const options: BilibiliLiveDanmakuServiceOptions = { database: db, source: f.realtime,
      now: () => new Date(), idFactory: randomUUID, credentialProvider: async () => undefined }
    const service = new BilibiliLiveDanmakuService(options)
    try {
      const manual = await service.start({ roomMonitorId: a.id })
      await service.syncAutoConnections()
      const automatic = service.status(b.id)
      expect(automatic.status).toBe("CONNECTED")
      db.updateBilibiliLiveRoomStatus(b.id, false, new Date().toISOString(), {
        messageId: randomUUID(), topic: "synthetic", envelopeJson: "{}", createdAt: new Date().toISOString()
      })
      for (const switchName of ["autoStartEnabled", "enabled"] as const) {
        options[switchName] = false
        await service.syncAutoConnections()
        expect(service.status(a.id)).toMatchObject({ sessionId: manual.sessionId, running: true })
        expect(service.status(b.id)).toMatchObject({ sessionId: automatic.sessionId, running: true })
        expect(db.findLatestBilibiliLiveDanmakuSession(b.id)?.status).toBe("CONNECTED")
        options[switchName] = true
      }
      options.enabled = false
      // Guard precedes existing, capacity and room lookup, including an already connected target.
      for (const roomMonitorId of [a.id, randomUUID()]) await expect(service.start({ roomMonitorId }))
        .rejects.toMatchObject({ code: "BILIBILI_DANMAKU_DISABLED" })
      expect(f.realtime.stops).toEqual([])
      expect(await service.stop(b.id)).toMatchObject({ status: "STOPPED" })
    } finally { await service.stopAll(); db.close() }
  })
  it("storage=false skips scheduled raw consumption but leaves the storage-disabled entry and no scheduler", async () => {
    f = await danmakuConfigurationFixture({ schedulerDelayMs: 0 })
    await writeFile(resolve(f.directory, "config/bilibili-live-collection.json"), '{"storageEnabled":false}', "utf8")
    vi.useFakeTimers()
    const scan = vi.spyOn(ControlDatabase.prototype, "listBilibiliLiveDanmakuAutoStartRoomIds")
    const runtime = await f.start({ schedulerEnabled: true })
    expect(() => runtime.startBilibiliLiveDanmaku({ roomMonitorId: randomUUID() })).toThrow(expect.objectContaining({ code: "BILIBILI_LIVE_STORAGE_DISABLED" }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.realtime.starts).toEqual([])
    expect(scan).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1) // Existing auth session-cleanup interval remains enabled.
    await f.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("storage=false still validates primitive properties before opening SQLite", async () => {
    f = await danmakuConfigurationFixture({ autoStartEnabled: "false" })
    await writeFile(resolve(f.directory, "config/bilibili-live-collection.json"), '{"storageEnabled":false}', "utf8")
    await expect(f.start()).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
    await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it.each([{ enabled: "false" }, { schedulerDelayMs: 0 }, { secret: "synthetic-private" }])("validates before SQLite even with host scheduler disabled: %j", async configuration => {
    f = await danmakuConfigurationFixture(configuration)
    const error = await f.start().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
    expect(String(error)).not.toContain("synthetic-private")
    await expect(access(resolve(f.directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("preserves history across disabling and re-enabling startup configuration", async () => {
    f = await danmakuConfigurationFixture()
    const room = await f.seedRoom({ liveStatus: 0 })
    let runtime = await f.start()
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const timestamp = new Date().toISOString()
    f.realtime.listeners.get(connected.sessionId!)?.({ type: "command", receivedAt: timestamp, event: {
      command: "DANMU_MSG", kind: "DANMAKU", occurredAt: timestamp, receivedAt: timestamp,
      actor: { uid: "123", displayName: "合成历史昵称" }, messageText: "合成历史弹幕",
      giftDelta: 0, superChatDelta: 0, rawJson: "{}"
    } })
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })).toMatchObject([{ messageText: "合成历史弹幕" }])
    await f.stop(); await writeFile(f.path, '{"enabled":false}', "utf8")
    runtime = await f.start()
    expect(runtime.getBilibiliLiveDanmakuStatus(room.id)).toMatchObject({ sessionId: connected.sessionId, status: "STOPPED" })
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })).toMatchObject([{ messageText: "合成历史弹幕" }])
    expect(runtime.getBilibiliLiveDanmakuMetrics({ roomMonitorId: room.id, range: "5m" })).toMatchObject([{ danmuCount: 1 }])
    await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_DISABLED" })
    await f.stop(); await writeFile(f.path, '{}', "utf8")
    runtime = await f.start()
    expect(runtime.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })).toMatchObject([{ messageText: "合成历史弹幕" }])
    expect((await runtime.startBilibiliLiveDanmaku({ roomMonitorId: room.id })).sessionId).not.toBe(connected.sessionId)
    await f.stop()
    const db = await ControlDatabase.open(f.directory)
    try { expect(db.findLatestBilibiliLiveDanmakuSession(room.id)?.status).toBe("STOPPED") } finally { db.close() }
  })
})
