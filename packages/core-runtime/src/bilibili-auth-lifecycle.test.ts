import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authGate, openAuthHarness } from "./__fixtures__/auth-migration"

describe("local Bilibili auth lifecycle", () => {
  let h: Awaited<ReturnType<typeof openAuthHarness>>
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
    h = await openAuthHarness()
  })
  afterEach(async () => { await h?.close(); vi.useRealTimers() })

  it("rejects a late generation after stop and does not restart the source", async () => {
    const gate = authGate()
    h.source.generateWait = gate.wait
    const pending = h.service.startQrLogin().catch(error => error)
    await gate.started
    await Promise.all([h.service.stop(), h.service.stop()])
    gate.release()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    await expect(h.service.startQrLogin()).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(h.source.calls.generate).toBe(1)
    expect(h.source.calls.stop).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["poll", "nav"])("cannot activate a late %s response after stop", async stage => {
    const start = await h.service.startQrLogin(), gate = authGate()
    if (stage === "poll") h.source.pollWait = gate.wait
    else h.source.navWait = gate.wait
    const pending = h.service.pollQrLogin(start.loginId).catch(error => error)
    await gate.started
    await h.service.stop()
    gate.release()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(h.database.findActiveBilibiliCredential()).toBeUndefined()
    expect(h.database.listPendingOutbox()).toEqual([])
  })

  it.each([false, true])("does not validate or expire a credential after stop (platform failure=%s)", async failure => {
    const { stored } = await h.login(), gate = authGate()
    h.source.navWait = gate.wait
    if (failure) h.source.navError = new Error("Synthetic source stopped")
    const pending = h.service.currentStatus().catch(error => error)
    await gate.started
    const events = h.database.listPendingOutbox()
    await h.service.stop()
    gate.release()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(h.database.findBilibiliCredentialById(stored.credentialId)).toEqual(stored)
    expect(h.database.listPendingOutbox()).toEqual(events)
  })

  it.each(["status", "credential", "refresh"])("does not resurrect a revoked credential from a late %s validation", async operation => {
    const { stored } = await h.login(), gate = authGate()
    h.source.navWait = gate.wait
    const pending = (operation === "status" ? h.service.currentStatus() : operation === "credential" ? h.service.currentCredential() : h.service.refreshCurrentCredential()).catch(error => error)
    await gate.started
    await h.service.revokeCurrentCredential()
    const events = h.database.listPendingOutbox()
    gate.release()
    expect(await pending).toMatchObject({ code: "BILIBILI_AUTH_CHANGED" })
    expect(h.database.findActiveBilibiliCredential()).toBeUndefined()
    expect(h.database.findBilibiliCredentialById(stored.credentialId)?.status).toBe("REVOKED")
    expect(h.database.listPendingOutbox()).toEqual(events)
  })

  it("does not mark a revoked credential expired when its previous validation fails", async () => {
    const { stored } = await h.login(), gate = authGate()
    h.source.navWait = gate.wait
    h.source.navError = Object.assign(new Error("Synthetic expired"), { code: "BILIBILI_AUTH_EXPIRED" })
    const pending = h.service.currentStatus().catch(error => error)
    await gate.started
    await h.service.revokeCurrentCredential()
    gate.release()
    expect(await pending).toMatchObject({ code: "BILIBILI_AUTH_CHANGED" })
    expect(h.database.findBilibiliCredentialById(stored.credentialId)?.status).toBe("REVOKED")
  })

  it("does not let old validation replace a newly activated account", async () => {
    const { stored } = await h.login(), gate = authGate()
    h.source.navWait = gate.wait
    const pending = h.service.currentStatus().catch(error => error)
    await gate.started
    h.source.navWait = async () => {}
    h.source.nav.account = { mid: "100", uname: "第二位合成用户" }
    const next = await h.login()
    gate.release()
    expect(await pending).toMatchObject({ code: "BILIBILI_AUTH_CHANGED" })
    expect(h.database.findActiveBilibiliCredential()?.credentialId).toBe(next.stored.credentialId)
    expect(h.database.findBilibiliCredentialById(stored.credentialId)?.status).toBe("REVOKED")
  })

  it.each(["source", "storage"])("does not expire credentials on an unknown %s failure", async boundary => {
    const { stored } = await h.login()
    const events = h.database.listPendingOutbox()
    if (boundary === "source") h.source.navError = new TypeError("SYNTHETIC_PRIVATE_INTERNAL_FAILURE")
    else vi.spyOn(h.database, "updateBilibiliCredentialValidation").mockImplementation(() => { throw new Error("SYNTHETIC_PRIVATE_STORAGE_FAILURE") })
    const error: unknown = await h.service.currentStatus().catch(value => value)
    expect(error).toMatchObject({ code: "BILIBILI_AUTH_VALIDATION_FAILED" })
    expect(String(error)).not.toContain("SYNTHETIC_PRIVATE")
    expect(h.database.findBilibiliCredentialById(stored.credentialId)).toEqual(stored)
    expect(h.database.listPendingOutbox()).toEqual(events)
  })

  it.each(["BILIBILI_AUTH_EXPIRED", "BILIBILI_AUTH_NETWORK_ERROR"])("retains the original expired projection for known %s failures", async code => {
    const { stored } = await h.login()
    h.source.navError = Object.assign(new Error("Synthetic platform failure"), { code })
    const result = await h.service.currentStatus()
    expect(result).toMatchObject({ loggedIn: false, status: "EXPIRED", credentialId: stored.credentialId })
    expect(result.credential).toBeUndefined()
    expect(h.database.findActiveBilibiliCredential()).toBeUndefined()
    expect(h.database.findBilibiliCredentialById(stored.credentialId)?.status).toBe("EXPIRED")
  })

  it.each(["generate", "poll", "nav"])("invalidates outstanding %s login work on explicit revoke", async stage => {
    const gate = authGate()
    let pending: Promise<unknown>
    if (stage === "generate") {
      h.source.generateWait = gate.wait
      pending = h.service.startQrLogin().catch(error => error)
    } else {
      const start = await h.service.startQrLogin()
      if (stage === "poll") h.source.pollWait = gate.wait
      else h.source.navWait = gate.wait
      pending = h.service.pollQrLogin(start.loginId).catch(error => error)
    }
    await gate.started
    await h.service.revokeCurrentCredential()
    gate.release()
    expect(await pending).toMatchObject({ code: "BILIBILI_AUTH_CHANGED" })
    expect(h.database.findActiveBilibiliCredential()).toBeUndefined()
  })
})
