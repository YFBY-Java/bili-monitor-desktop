import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openAuthHarness, authGate } from "./__fixtures__/auth-migration"
import { seedLoginRoom, SyntheticRealtimeSource } from "./__fixtures__/login-connections"
import { BilibiliLiveDanmakuService } from "./bilibili-live-danmaku-service"

describe("local login upgrade transport lifecycle", () => {
  let h: Awaited<ReturnType<typeof openAuthHarness>>, source: SyntheticRealtimeSource, service: BilibiliLiveDanmakuService, id: string
  let credentialWait: () => Promise<void>
  let displayNameWait: () => Promise<void>
  beforeEach(async () => {
    h = await openAuthHarness()
    source = new SyntheticRealtimeSource()
    credentialWait = async () => {}
    displayNameWait = async () => {}
    id = seedLoginRoom(h.database, "501")
    service = new BilibiliLiveDanmakuService({ database: h.database, source, now: () => new Date(), idFactory: randomUUID,
      credentialProvider: async () => { await credentialWait(); return undefined },
      resolveDisplayName: async () => { await displayNameWait(); return "合成完整昵称" } })
  })
  afterEach(async () => { await service?.stopAll(); await h?.close() })

  it("stops a CONNECTING room without waiting behind its pending start", async () => {
    const gate = authGate()
    source.startWait = gate.wait
    const starting = service.start({ roomMonitorId: id }).catch(error => error)
    await gate.started
    let stopped = false
    const stopping = service.stop(id).then(result => { stopped = !result.running })
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    try { expect(stopped).toBe(true) }
    finally { gate.release(); await stopping; await starting }
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)).toBeUndefined()
  })

  it("stops a CONNECTED room while another room is waiting for HTTP", async () => {
    const connected = await service.start({ roomMonitorId: id })
    const other = seedLoginRoom(h.database, "502"), gate = authGate()
    source.startWait = gate.wait
    const starting = service.start({ roomMonitorId: other }).catch(error => error)
    await gate.started
    let stopped = false
    const stopping = service.stop(id).then(result => { stopped = !result.running })
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    try {
      expect(stopped).toBe(true)
      expect(source.stops).toContain(connected.sessionId)
    } finally { gate.release(); await starting; await stopping }
  })

  it("cancels a queued manual start before it registers a connection", async () => {
    const gate = authGate(), other = seedLoginRoom(h.database, "502")
    source.startWait = gate.wait
    const first = service.start({ roomMonitorId: other }).catch(error => error)
    await gate.started
    let queuedResult: unknown
    const queued = service.start({ roomMonitorId: id }).catch(error => { queuedResult = error; return error })
    let stopped = false
    const stopping = service.stop(id).then(result => { stopped = !result.running })
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    try {
      expect(stopped).toBe(true)
      expect(queuedResult).toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_ENDED" })
    }
    finally { gate.release(); await first; await stopping }
    expect(await queued).toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_ENDED" })
    expect(source.starts.map(input => input.roomId)).toEqual(["502"])
  })

  it("cancels same-turn start/stop without cancelling a subsequent new start", async () => {
    const cancelled = service.start({ roomMonitorId: id }).catch(error => error)
    await service.stop(id)
    const replacement = await service.start({ roomMonitorId: id })
    expect(await cancelled).toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_ENDED" })
    expect(replacement).toMatchObject({ running: true, status: "CONNECTED" })
    expect(source.starts).toHaveLength(1)
  })

  it.each(["credential", "start-success", "start-failure"])("ignores late %s completion after stop and database reopen", async stage => {
    const gate = authGate()
    if (stage === "credential") credentialWait = gate.wait
    else source.startWait = gate.wait
    if (stage === "start-failure") source.failRoom = "501"
    const starting = service.start({ roomMonitorId: id }).catch(error => error)
    await gate.started
    await service.stopAll()
    await h.reopen()
    gate.release()
    expect(await starting).toMatchObject({ code: "CORE_STOPPED" })
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)).toBeUndefined()
    expect(source.starts).toHaveLength(stage === "credential" ? 0 : 1)
    expect(source.stopAllCalls).toBe(1)
  })

  it("stops only once and refuses starts, upgrades or automatic scheduling after terminal shutdown", async () => {
    await service.start({ roomMonitorId: id })
    await Promise.all([service.stopAll(), service.stopAll()])
    await expect(service.start({ roomMonitorId: id })).rejects.toMatchObject({ code: "CORE_STOPPED" })
    await expect(service.reconnectAnonymousConnections()).rejects.toMatchObject({ code: "CORE_STOPPED" })
    await expect(service.syncAutoConnections()).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(source.stopAllCalls).toBe(1)
    expect(source.starts).toHaveLength(1)
  })

  it.each(["closed", "error"] as const)("does not mark CONNECTED after an early %s event", async type => {
    source.startWait = async input => {
      const receivedAt = new Date().toISOString()
      source.listeners.get(input.connectionId)?.(type === "closed"
        ? { type, receivedAt, code: 1006, reason: "synthetic close" }
        : { type, receivedAt, errorType: "SYNTHETIC_SOCKET_FAILURE", message: "synthetic failure" })
    }
    await expect(service.start({ roomMonitorId: id })).resolves.toMatchObject({ running: false, status: type === "closed" ? "CLOSED" : "ERROR" })
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)?.status).toBe(type === "closed" ? "CLOSED" : "ERROR")
  })

  it("bounds pending operations and releases the queue after a failed task", async () => {
    const gate = authGate()
    source.startWait = gate.wait
    source.failRoom = "501"
    const first = service.start({ roomMonitorId: id }).catch(error => error)
    await gate.started
    const requests = Array.from({ length: 100 }, () => service.start({ roomMonitorId: id }).catch(error => error))
    gate.release()
    const results = await Promise.all([first, ...requests])
    expect(results.some(value => value.code === "BILIBILI_DANMAKU_BUSY")).toBe(true)
    source.failRoom = undefined
    expect(await service.start({ roomMonitorId: id })).toMatchObject({ running: true })
  })

  it.each(["write", "projection"])("still closes the socket when stop's %s fails", async boundary => {
    const started = await service.start({ roomMonitorId: id })
    const method = boundary === "write" ? "markBilibiliLiveDanmakuSessionStatus" : "getBilibiliLiveDanmakuStats"
    const failure = vi.spyOn(h.database, method).mockImplementation(() => { throw new Error("Synthetic storage failure") })
    try {
      await expect(service.stop(id)).rejects.toThrow("Synthetic storage failure")
      expect(source.stops).toContain(started.sessionId)
      expect(source.listeners.has(started.sessionId!)).toBe(false)
    } finally { failure.mockRestore() }
  })

  it("coalesces automatic ticks and does not let another tick return before the pending start", async () => {
    seedLoginRoom(h.database, "502", 1)
    const gate = authGate()
    source.startWait = gate.wait
    const first = service.syncAutoConnections()
    await gate.started
    let secondFinished = false
    const second = service.syncAutoConnections().then(() => { secondFinished = true })
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    try { expect(secondFinished).toBe(false) } finally { gate.release(); await Promise.all([first, second]) }
    expect(source.starts).toHaveLength(1)
  })

  it.each(["heartbeat", "closed", "error"] as const)("drops a retained listener's late %s event after SQLite closes", async type => {
    const connected = await service.start({ roomMonitorId: id })
    const listener = source.listeners.get(connected.sessionId!)!
    await service.stopAll()
    await h.reopen()
    const receivedAt = new Date().toISOString()
    expect(() => listener(type === "heartbeat" ? { type, receivedAt, popularity: 100 }
      : type === "closed" ? { type, receivedAt, code: 1006, reason: "synthetic late close" }
        : { type, receivedAt, errorType: "SYNTHETIC_LATE_ERROR", message: "synthetic late failure" })).not.toThrow()
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)?.status).toBe("STOPPED")
    expect(h.database.getBilibiliLiveDanmakuStats(id, receivedAt).heartbeatPopularity).toBeNull()
  })

  it("drops a masked-name command whose profile lookup finishes after the database closes", async () => {
    const connected = await service.start({ roomMonitorId: id }), gate = authGate()
    displayNameWait = gate.wait
    const receivedAt = new Date().toISOString()
    source.listeners.get(connected.sessionId!)!({ type: "command", receivedAt,
      event: { command: "DANMU_MSG", kind: "DANMAKU", occurredAt: receivedAt, receivedAt, actor: { uid: "99", displayName: "合**" },
        messageText: "合成迟到弹幕", giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
    await gate.started
    await service.stopAll()
    await h.reopen()
    gate.release()
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    expect(h.database.findBilibiliLiveDanmakuRecent(id, 60)).toEqual([])
    expect(h.database.findLatestBilibiliLiveDanmakuSession(id)?.status).toBe("STOPPED")
  })
})
