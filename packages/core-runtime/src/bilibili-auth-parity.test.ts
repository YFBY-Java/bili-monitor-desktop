import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authGate, openAuthHarness } from "./__fixtures__/auth-migration"

describe("original Bilibili QR session and credential semantics", () => {
  let h: Awaited<ReturnType<typeof openAuthHarness>>
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
    h = await openAuthHarness()
  })
  afterEach(async () => { await h?.close(); vi.useRealTimers() })

  it("starts the lifetime before the platform generates the QR", async () => {
    const gate = authGate()
    h.source.generateWait = gate.wait
    const pending = h.service.startQrLogin()
    await gate.started
    await vi.advanceTimersByTimeAsync(170_000)
    gate.release()
    const start = await pending
    h.source.polled = { code: 86101, message: "waiting", cookies: [] }
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "WAITING", expiresInSeconds: 10 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "EXPIRED", expiresInSeconds: 0 })
    expect(h.source.calls.poll).toBe(1)
  })

  it("reports successful polling with empty cookies as FAILED, without caching the failure", async () => {
    h.source.polled = { code: 0, message: "ok", cookies: [] }
    const start = await h.service.startQrLogin()
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "FAILED", message: "登录成功但未收到 Bilibili Cookie，请重试" })
    expect(h.source.calls.validate).toBe(0)
    expect(h.database.findActiveBilibiliCredential()).toBeUndefined()
    h.source.polled = { code: 86090, message: "scanned", cookies: [] }
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "SCANNED" })
  })

  it("uses the complete worker cookie snapshot without resurrecting expired session cookies", async () => {
    h.source.generated.cookies = [{ name: "SESSDATA", value: "SYNTHETIC_OLD", expiresAt: "2000-01-01T00:00:00Z" }]
    h.source.polled = { code: 0, message: "ok", cookies: [] }
    const start = await h.service.startQrLogin()
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "FAILED", message: "登录成功但未收到 Bilibili Cookie，请重试" })
    expect(h.source.calls.validate).toBe(0)
  })

  it("keeps the effective HTTP jar separate from display cookies, including an empty jar", async () => {
    const jar = [{ name: "SESSDATA", value: "SYNTHETIC_HTTP", domain: "passport.bilibili.com", path: "/x/passport-login/web/qrcode" }]
    h.source.polled = { code: 86101, message: "waiting", cookies: [{ name: "SESSDATA", value: "SYNTHETIC_DISPLAY" }], jarCookies: jar }
    const start = await h.service.startQrLogin()
    await h.service.pollQrLogin(start.loginId)
    h.source.polled = { code: 86101, message: "waiting", cookies: [{ name: "SESSDATA", value: "SYNTHETIC_EXPIRED" }], jarCookies: [] }
    await h.service.pollQrLogin(start.loginId)
    await h.service.pollQrLogin(start.loginId)
    expect(h.source.pollInputs[1]?.cookies).toEqual(jar)
    expect(h.source.pollInputs[2]?.cookies).toEqual([])
  })

  it("shares an in-flight poll and caches one activation without exposing credentials", async () => {
    const start = await h.service.startQrLogin(), gate = authGate()
    h.source.pollWait = gate.wait
    const first = h.service.pollQrLogin(start.loginId)
    await gate.started
    const second = h.service.pollQrLogin(start.loginId)
    gate.release()
    expect(await first).toEqual(await second)
    expect(h.source.calls.poll).toBe(1)
    expect(h.source.calls.validate).toBe(1)
    expect(h.database.listPendingOutbox().filter(event => event.topic === "bilibili.auth.credential-activated")).toHaveLength(1)
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "SUCCESS" })
    expect(h.source.calls.poll).toBe(1)
    expect(JSON.stringify(await h.service.currentStatus())).not.toContain("SYNTHETIC_SESSION")
    expect((await first).credential).toBeUndefined()
    expect(JSON.stringify(h.database.listPendingOutbox())).not.toContain("SYNTHETIC_SESSION")
  })

  it("retains terminal sessions through the grace window then removes them on cleanup", async () => {
    h.source.polled = { code: 86038, message: "expired", cookies: [] }
    const start = await h.service.startQrLogin()
    await h.service.pollQrLogin(start.loginId)
    await vi.advanceTimersByTimeAsync(360_000)
    expect(await h.service.pollQrLogin(start.loginId)).toMatchObject({ status: "EXPIRED" })
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(h.service.pollQrLogin(start.loginId)).rejects.toMatchObject({ code: "BILIBILI_QR_SESSION_NOT_FOUND" })
    await h.service.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("chooses the earliest cookie expiry chronologically, not by ISO text precision", async () => {
    h.source.polled.cookies[0]!.expiresAt = "2027-01-01T00:00:00Z"
    h.source.polled.cookies[1]!.expiresAt = "2027-01-01T00:00:00.100Z"
    const { stored } = await h.login()
    expect(stored.expiresAt).toBe("2027-01-01T00:00:00Z")
  })

  it("restores the encrypted credential after reopening SQLite and retains original payload fields", async () => {
    const { stored } = await h.login()
    const initial = await h.service.currentCredential()
    expect(stored.encryptedPayload).not.toContain("SYNTHETIC_SESSION")
    await h.reopen()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await h.service.currentStatus()).toMatchObject({ loggedIn: true, credentialId: stored.credentialId })
    const restored = await h.service.currentCredential()
    expect(restored).toMatchObject({ credentialId: stored.credentialId, refreshToken: "SYNTHETIC_REFRESH", csrf: "SYNTHETIC_CSRF" })
    expect(restored.rawPayload.createdAt).toBe(initial.rawPayload.createdAt)
    expect(await h.service.refreshCurrentCredential()).toMatchObject({ refreshed: false, loggedIn: true })
    await h.service.revokeCurrentCredential()
    await h.reopen()
    expect(await h.service.currentStatus()).toEqual({ loggedIn: false, status: "NONE" })
    expect(h.database.findPlatformAccountByExternalId("bilibili", "99")?.authState).toBe("revoked")
  })
})
