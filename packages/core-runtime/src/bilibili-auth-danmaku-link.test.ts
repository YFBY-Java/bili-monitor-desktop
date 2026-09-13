import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authGate, SyntheticAuthSource } from "./__fixtures__/auth-migration"
import { seedLoginRoom, SyntheticRealtimeSource } from "./__fixtures__/login-connections"
import { LocalCoreRuntime } from "./local-core-runtime"

describe("actual Core auth-to-danmaku business linkage", () => {
  let directory: string, runtime: LocalCoreRuntime, source: SyntheticRealtimeSource, auth: SyntheticAuthSource, id: string
  beforeEach(async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-login-link-"))
    const database = await ControlDatabase.open(directory)
    id = seedLoginRoom(database, "901")
    database.close()
    source = new SyntheticRealtimeSource()
    auth = new SyntheticAuthSource()
    runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", credentialKey: randomBytes(32), schedulerEnabled: false, authSource: auth, liveDanmakuSource: source })
  })
  afterEach(async () => { await runtime?.stop(); if (directory) await rm(directory, { recursive: true, force: true }) })

  it("upgrades only on actual activation, not concurrent or cached SUCCESS replies even when fallback remains anonymous", async () => {
    source.forceAnonymous = true
    await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id, protocolVersion: 0 })
    const qr = await runtime.startBilibiliQrLogin()
    await Promise.all([runtime.pollBilibiliQrLogin(qr.loginId), runtime.pollBilibiliQrLogin(qr.loginId)])
    await vi.waitFor(() => expect(source.starts.length).toBeGreaterThanOrEqual(2))
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    await runtime.pollBilibiliQrLogin(qr.loginId)
    // Drain the already-resolved synthetic IO continuations, without racing them with stop.
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    expect(source.starts).toHaveLength(2)
    expect(source.starts[1]).toMatchObject({ credential: { authUid: "99", cookieHeader: expect.stringContaining("SYNTHETIC_SESSION") }, protocolVersion: 0 })
    expect(await runtime.getBilibiliAuthStatus()).toMatchObject({ loggedIn: true })
  })

  it("does not await a slow socket upgrade before reporting saved login success", async () => {
    await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })
    const gate = authGate()
    source.startWait = gate.wait
    try {
      const qr = await runtime.startBilibiliQrLogin()
      expect(await runtime.pollBilibiliQrLogin(qr.loginId)).toMatchObject({ status: "SUCCESS" })
      await gate.started
      expect(await runtime.getBilibiliAuthStatus()).toMatchObject({ loggedIn: true })
    } finally { gate.release() }
    await runtime.stopBilibiliLiveDanmaku(id)
  })

  it("revoke leaves an established LOGIN socket alone, and the next explicit connection is anonymous", async () => {
    const qr = await runtime.startBilibiliQrLogin()
    await runtime.pollBilibiliQrLogin(qr.loginId)
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })
    expect(connected.authMode).toBe("LOGIN")
    await runtime.revokeBilibiliAuth()
    expect(source.stops).toEqual([])
    expect(await runtime.getBilibiliAuthStatus()).toMatchObject({ loggedIn: false, status: "NONE" })
    await runtime.stopBilibiliLiveDanmaku(id)
    expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })).toMatchObject({ authMode: "ANONYMOUS" })
    expect(source.starts.at(-1)?.credential).toBeUndefined()
  })

  it("a failed login does not interrupt an anonymous connection", async () => {
    await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })
    auth.polled = { code: 0, message: "ok", cookies: [] }
    const qr = await runtime.startBilibiliQrLogin()
    expect(await runtime.pollBilibiliQrLogin(qr.loginId)).toMatchObject({ status: "FAILED" })
    expect(source.stops).toEqual([])
    expect(source.starts).toHaveLength(1)
  })

  it("Core cancels danmaku immediately while auth worker shutdown is still pending", async () => {
    const socket = authGate(), authStop = authGate()
    source.startWait = socket.wait
    auth.stop = authStop.wait
    const starting = runtime.startBilibiliLiveDanmaku({ roomMonitorId: id }).catch(error => error)
    await socket.started
    const stopping = runtime.stop()
    try {
      await authStop.started
      expect(source.stopAllCalls).toBe(1)
      socket.release()
      expect(await starting).toMatchObject({ code: "CORE_STOPPED" })
    } finally { socket.release(); authStop.release(); await starting; await stopping }
  })

  it("a queued upgrade reads revoked credentials as anonymous instead of reusing a stale login", async () => {
    await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })
    const stoppingOld = authGate()
    source.stopWait = stoppingOld.wait
    try {
      const qr = await runtime.startBilibiliQrLogin()
      await runtime.pollBilibiliQrLogin(qr.loginId)
      await stoppingOld.started
      await runtime.revokeBilibiliAuth()
    } finally { stoppingOld.release() }
    await vi.waitFor(() => expect(runtime.getBilibiliLiveDanmakuStatus(id)).toMatchObject({ running: true, authMode: "ANONYMOUS" }))
    expect(source.starts.at(-1)?.credential).toBeUndefined()
    expect(await runtime.getBilibiliAuthStatus()).toMatchObject({ status: "NONE" })
  })

  it("a new account activation does not replace an already LOGIN connection", async () => {
    let qr = await runtime.startBilibiliQrLogin()
    await runtime.pollBilibiliQrLogin(qr.loginId)
    const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id })
    auth.nav.account = { mid: "100", uname: "另一合成账号" }
    qr = await runtime.startBilibiliQrLogin()
    await runtime.pollBilibiliQrLogin(qr.loginId)
    await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
    expect(runtime.getBilibiliLiveDanmakuStatus(id)).toMatchObject({ sessionId: connected.sessionId, authUid: "99" })
    expect(await runtime.getBilibiliAuthStatus()).toMatchObject({ account: { mid: "100" } })
    expect(source.starts).toHaveLength(1)
  })

  it("serializes two real activations and retries a remaining anonymous socket with the newest account", async () => {
    source.forceAnonymous = true
    await runtime.startBilibiliLiveDanmaku({ roomMonitorId: id, protocolVersion: 0 })
    const gate = authGate()
    source.startWait = gate.wait
    try {
      let qr = await runtime.startBilibiliQrLogin()
      await runtime.pollBilibiliQrLogin(qr.loginId)
      await gate.started
      auth.nav.account = { mid: "100", uname: "后续激活合成账号" }
      qr = await runtime.startBilibiliQrLogin()
      await runtime.pollBilibiliQrLogin(qr.loginId)
      expect(source.starts).toHaveLength(2)
    } finally { gate.release() }
    await vi.waitFor(() => expect(source.starts).toHaveLength(3))
    expect(source.starts.slice(1).map(input => input.credential?.authUid)).toEqual(["99", "100"])
    expect(source.starts.map(input => input.protocolVersion)).toEqual([0, 0, 0])
  })

  it("handles cancellation of a real scheduled automatic upgrade without an unhandled rejection", async () => {
    await runtime.stop()
    const database = await ControlDatabase.open(directory)
    seedLoginRoom(database, "902", 1)
    database.close()
    const gate = authGate()
    source = new SyntheticRealtimeSource()
    source.startWait = gate.wait
    vi.useFakeTimers()
    try {
      runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", credentialKey: randomBytes(32), schedulerEnabled: true, schedulerDelayMs: 60_000, authSource: auth, liveDanmakuSource: source })
      await vi.advanceTimersByTimeAsync(5000)
      await gate.started
      await runtime.stop()
      gate.release()
      await vi.runAllTimersAsync()
      expect(source.stopAllCalls).toBe(1)
    } finally { gate.release(); await runtime.stop(); vi.useRealTimers() }
  })
})
