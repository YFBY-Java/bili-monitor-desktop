import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import type {
  BilibiliAuthCookie,
  BilibiliAuthWorkerGenerateResult,
  BilibiliAuthWorkerNavResult,
  BilibiliAuthWorkerPollResult
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliAuthService, type BilibiliAuthSource } from "./bilibili-auth-service"
import { CredentialCipher } from "./credential-cipher"

const now = new Date("2026-08-29T12:00:00.000Z")

function cookie(name: string, value: string): BilibiliAuthCookie {
  return { name, value, domain: ".bilibili.com", path: "/", secure: true }
}

function idFactory(offset = 0): () => string {
  let value = offset
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`
}

class FakeAuthSource implements BilibiliAuthSource {
  generated: BilibiliAuthWorkerGenerateResult = {
    qrUrl: "https://passport.bilibili.com/h5-app/passport/login/scan?navhide=1&qrcode_key=key",
    qrcodeKey: "qr-key",
    cookies: []
  }
  polled: BilibiliAuthWorkerPollResult = { code: 86101, message: "waiting", cookies: [] }
  nav: BilibiliAuthWorkerNavResult = {
    account: { mid: "99", uname: "Alice", level: 6, vipStatus: 0 },
    rawPayload: { code: 0, data: { isLogin: true } }
  }
  generate = vi.fn(async () => this.generated)
  poll = vi.fn(async () => this.polled)
  validate = vi.fn(async () => this.nav)
  stop = vi.fn(async () => undefined)
}

describe("BilibiliAuthService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("maps and caches the original waiting, scanned and expired QR states", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-state-"))
    const database = await ControlDatabase.open(directory)
    const source = new FakeAuthSource()
    const service = new BilibiliAuthService({
      database,
      source,
      cipher: new CredentialCipher(randomBytes(32)),
      now: () => now,
      idFactory: idFactory(),
      qrExpireSeconds: 180,
      pollIntervalMillis: 1_500
    })
    try {
      const start = await service.startQrLogin()
      expect(start).toMatchObject({
        qrUrl: source.generated.qrUrl,
        expiresInSeconds: 180,
        pollIntervalMillis: 1_500
      })
      expect(source.generate).toHaveBeenCalledTimes(1)

      expect(await service.pollQrLogin(start.loginId)).toMatchObject({ status: "WAITING" })
      source.polled = { code: 86090, message: "scanned", cookies: [] }
      expect(await service.pollQrLogin(start.loginId)).toMatchObject({ status: "SCANNED" })
      source.polled = { code: 86038, message: "expired", cookies: [] }
      expect(await service.pollQrLogin(start.loginId)).toMatchObject({ status: "EXPIRED" })
      expect(await service.pollQrLogin(start.loginId)).toMatchObject({ status: "EXPIRED" })
      expect(source.poll).toHaveBeenCalledTimes(3)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("activates, restores, validates, exposes and revokes a complete QR credential", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-success-"))
    const database = await ControlDatabase.open(directory)
    const source = new FakeAuthSource()
    source.polled = {
      code: 0,
      message: "ok",
      refreshToken: "refresh-secret",
      cookies: [
        cookie("SESSDATA", "session-secret"),
        cookie("bili_jct", "csrf-secret"),
        cookie("DedeUserID", "99")
      ]
    }
    const cipher = new CredentialCipher(randomBytes(32))
    const service = new BilibiliAuthService({
      database,
      source,
      cipher,
      now: () => now,
      idFactory: idFactory()
    })
    try {
      const start = await service.startQrLogin()
      const success = await service.pollQrLogin(start.loginId)
      expect(success).toMatchObject({
        status: "SUCCESS",
        account: { mid: "99", uname: "Alice" }
      })
      expect(success.credential).toBeUndefined()
      expect(source.validate).toHaveBeenCalledTimes(1)
      const stored = database.findActiveBilibiliCredential()
      expect(stored?.encryptedPayload).not.toContain("session-secret")

      const restored = new BilibiliAuthService({
        database,
        source,
        cipher,
        now: () => now,
        idFactory: idFactory(100)
      })
      expect(await restored.currentStatus()).toMatchObject({
        loggedIn: true,
        status: "ACTIVE",
        account: { mid: "99", uname: "Alice" }
      })
      const validationsBeforeConnectionUse = source.validate.mock.calls.length
      expect(await restored.connectionCredential()).toMatchObject({ csrf: "csrf-secret" })
      expect(source.validate).toHaveBeenCalledTimes(validationsBeforeConnectionUse)
      expect(await restored.currentCredential()).toMatchObject({ csrf: "csrf-secret" })
      expect(await restored.refreshCurrentCredential()).toMatchObject({
        refreshed: false,
        loggedIn: true,
        account: { mid: "99" }
      })
      expect(await restored.revokeCurrentCredential()).toEqual({ revoked: true })
      expect(await restored.currentStatus()).toMatchObject({ loggedIn: false, status: "NONE" })
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("refuses to activate an incomplete Bilibili cookie set", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-incomplete-"))
    const database = await ControlDatabase.open(directory)
    const source = new FakeAuthSource()
    source.polled = {
      code: 0,
      message: "ok",
      cookies: [cookie("SESSDATA", "session-only")]
    }
    const service = new BilibiliAuthService({
      database,
      source,
      cipher: new CredentialCipher(randomBytes(32)),
      now: () => now,
      idFactory: idFactory()
    })
    try {
      const start = await service.startQrLogin()
      await expect(service.pollQrLogin(start.loginId)).rejects.toMatchObject({
        code: "BILIBILI_AUTH_COOKIE_INCOMPLETE"
      })
      expect(database.findActiveBilibiliCredential()).toBeUndefined()
      expect(source.validate).not.toHaveBeenCalled()
    } finally {
      await service.stop()
      database.close()
    }
  })
})
