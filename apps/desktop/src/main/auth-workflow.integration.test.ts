import { randomBytes, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createRuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime, type BilibiliAuthSource } from "@bmd/core-runtime"
import { expect, it } from "vitest"
import { createDesktopBridge } from "../preload/bridge"
import { dispatchBusinessRequest } from "./core-request-router"

function authGate() {
  let release = () => {}, entered = () => {}
  const pending = new Promise<void>(resolveGate => { release = resolveGate })
  const started = new Promise<void>(resolveGate => { entered = resolveGate })
  return { started, release, wait: () => { entered(); return pending } }
}

function syntheticAuthSource() {
  const source: BilibiliAuthSource & { calls: { poll: number }; navWait: () => Promise<void> } = {
    calls: { poll: 0 }, navWait: async () => {},
    generate: async () => ({ qrUrl: "https://example.test/synthetic-auth", qrcodeKey: "SYNTHETIC_QR_KEY", cookies: [] }),
    poll: async () => {
      source.calls.poll++
      return { code: 0, message: "ok", cookies: [
        { name: "SESSDATA", value: "SYNTHETIC_SESSION" }, { name: "bili_jct", value: "SYNTHETIC_CSRF" }, { name: "DedeUserID", value: "99" }
      ] }
    },
    validate: async () => { await source.navWait(); return { account: { mid: "99", uname: "登录链路合成用户" }, rawPayload: { code: 0 } } }
  }
  return source
}

it("executes the six original auth actions through preload, Core and reopened SQLite", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-workflow-"))
  const source = syntheticAuthSource()
  const options = { dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32), authSource: source }
  let runtime: LocalCoreRuntime | undefined
  const methods = new Set<string>()
  const bridge = createDesktopBridge(async (channel, payload) => {
    if (!runtime || !channel.startsWith("bilibili-auth:")) throw new Error("Unexpected auth transport")
    const type = channel.replace(":", ".").replace("qr-", "qr.")
    methods.add(type)
    const id = randomUUID()
    const result = await dispatchBusinessRequest(runtime, createRuntimeEnvelope({ id, type,
      timestamp: new Date().toISOString(), correlationId: id, traceId: id, payload: payload ?? {} }))
    expect(result.responseType).toBe(`${type}.result`)
    return structuredClone(result.payload)
  }).bilibiliAuth
  try {
    runtime = await LocalCoreRuntime.start(options)
    expect(await bridge.status()).toEqual({ loggedIn: false, status: "NONE" })
    await expect(bridge.pollQrLogin({ loginId: "invalid" })).rejects.toThrow()
    expect(source.calls.poll).toBe(0)
    const start = await bridge.startQrLogin()
    const polled = await bridge.pollQrLogin({ loginId: start.loginId })
    expect(polled).toMatchObject({ status: "SUCCESS", account: { mid: "99" } })
    expect(polled.credential).toBeUndefined()
    expect((await bridge.status()).credential).toBeUndefined()
    const credential = await bridge.credential()
    expect(credential.csrf).toBe("SYNTHETIC_CSRF")
    expect(await bridge.refresh()).toMatchObject({ loggedIn: true, refreshed: false })
    await runtime.stop()
    runtime = await LocalCoreRuntime.start(options)
    expect(await bridge.status()).toMatchObject({ loggedIn: true, credentialId: credential.credentialId })
    expect((await bridge.credential()).cookieHeader).toBe(credential.cookieHeader)
    expect(await bridge.revoke()).toEqual({ revoked: true })
    await runtime.stop()
    runtime = await LocalCoreRuntime.start(options)
    expect(await bridge.status()).toEqual({ loggedIn: false, status: "NONE" })
    await expect(bridge.credential()).rejects.toMatchObject({ code: "BILIBILI_AUTH_NOT_FOUND" })
    expect([...methods].sort()).toEqual(["credential", "qr.poll", "qr.start", "refresh", "revoke", "status"].map(value => `bilibili-auth.${value}`).sort())
  } finally { await runtime?.stop(); await rm(directory, { recursive: true, force: true }) }
})

it("stops auth immediately even while a different Core worker is still shutting down", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-core-stop-"))
  const source = syntheticAuthSource(), nav = authGate(), followerStop = authGate()
  const runtime = await LocalCoreRuntime.start({
    dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32), authSource: source,
    followerSource: {
      fetchCard: async () => { throw new Error("Unexpected follower request") },
      fetchRelationStat: async () => { throw new Error("Unexpected follower request") },
      stop: followerStop.wait
    }
  })
  let stopping: Promise<void> | undefined
  try {
    const start = await runtime.startBilibiliQrLogin()
    source.navWait = nav.wait
    const pending = runtime.pollBilibiliQrLogin(start.loginId).catch(error => error)
    await nav.started
    stopping = runtime.stop()
    await followerStop.started
    nav.release()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
  } finally {
    nav.release()
    followerStop.release()
    await stopping
    await runtime.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
