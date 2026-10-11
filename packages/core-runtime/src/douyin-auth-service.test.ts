import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CredentialCipher } from "./credential-cipher"
import { DouyinAuthService } from "./douyin-auth-service"
import type { DouyinWebWorkerStatus } from "./douyin-browser-worker-source"

describe("DouyinAuthService", () => {
  let directory: string | undefined
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

  it("captures, validates and encrypts the original complete Web session bundle with overlapping polls", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-core-"))
    const database = await ControlDatabase.open(directory)
    let consumed = false
    let workerSequence = 0
    let workerStatus: DouyinWebWorkerStatus["status"] = "SUCCESS"
    const browser = {
      start: vi.fn(async () => {
        consumed = false
        workerSequence += 1
        return { workerSessionId: `worker-${workerSequence}`, status: "STARTING" as const, expiresAt: "2026-08-30T01:03:00.000Z" }
      }),
      qr: vi.fn(async () => "data:image/png;base64,aW1hZ2U="),
      status: vi.fn(async () => ({ status: workerStatus, message: "done" })),
      consume: vi.fn(async () => {
        if (consumed) throw new Error("Worker session already consumed")
        consumed = true
        return { authType: "DOUYIN_WEB_SESSION", cookies: [{ name: "sessionid", value: "web-secret", expires: 1_900_000_000 }], storageState: { cookies: [], origins: [] } }
      }),
      validate: vi.fn(async (bundle: Record<string, unknown>) => ({ valid: true, message: "valid", details: {}, bundle })),
      health: vi.fn(async () => "UP"),
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }
    const ids = [
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c00",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c02",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c03",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c04",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c05",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0c06"
    ]
    const service = new DouyinAuthService({
      database,
      browser,
      cipher: new CredentialCipher(new Uint8Array(32).fill(7)),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
      idFactory: () => ids.shift()!,
      oauth: { mode: "disabled" }
    })
    try {
      const attach = vi.spyOn(database, "attachDouyinWorkerSession").mockImplementationOnce(() => {
        throw new Error("Worker attachment failed")
      })
      await expect(service.startWebQr()).rejects.toThrow(/Worker attachment failed/)
      attach.mockRestore()
      expect(browser.delete).toHaveBeenCalledTimes(1)

      const failedStart = await service.startWebQr()
      const updateSession = database.updateDouyinAuthSession.bind(database)
      const sessionWrites = vi.spyOn(database, "updateDouyinAuthSession").mockImplementation((input) => {
        if (input.status === "SUCCESS") {
          sessionWrites.mockRestore()
          throw new Error("Session write failed")
        }
        updateSession(input)
      })
      await expect(service.pollWebQr(failedStart.loginId)).rejects.toThrow(/Session write failed/)
      expect(database.findActiveDouyinCredential("DOUYIN_WEB_SESSION")).toBeUndefined()
      expect(database.findDouyinCredentialById("018f0f39-7b5e-4cc1-862d-9a208b3d0c02")).toBeUndefined()
      expect(database.findDouyinAuthSessionById(failedStart.loginId)).toMatchObject({
        status: "FAILED", errorCode: "WEB_SESSION_CAPTURE_FAILED"
      })
      await expect(service.pollWebQr(failedStart.loginId)).resolves.toMatchObject({ status: "FAILED" })
      expect(browser.delete).toHaveBeenCalledTimes(2)

      const started = await service.startWebQr()
      expect(started.imageDataUrl).toBe("data:image/png;base64,aW1hZ2U=")
      const [completed, overlapping] = await Promise.all([
        service.pollWebQr(started.loginId),
        service.pollWebQr(started.loginId)
      ])
      expect(completed.status).toBe("SUCCESS")
      expect(overlapping).toEqual(completed)
      expect(browser.consume).toHaveBeenCalledTimes(2)
      expect(database.findDouyinAuthSessionById(started.loginId)?.status).toBe("SUCCESS")
      expect("credential" in completed).toBe(false)
      expect(database.findActiveDouyinCredential("DOUYIN_WEB_SESSION")?.encryptedPayload).not.toContain("web-secret")
      const captured = service.credential("web")
      browser.validate.mockResolvedValueOnce({ valid: true, message: "valid", details: {}, bundle: {} })
      await expect(service.validateWeb()).rejects.toThrow(/完整|bundle/)
      expect(service.credential("web").credentialId).toBe(captured.credentialId)
      await expect(service.validateWeb()).resolves.toMatchObject({ valid: true })
      const status = await service.status()
      expect(status.webCredential?.payload).toMatchObject({ cookieCount: 1 })
      expect(status.webCredential?.payload).not.toHaveProperty("cookies")

      const expiredStart = await service.startWebQr()
      workerStatus = "EXPIRED"
      await expect(service.pollWebQr(expiredStart.loginId)).resolves.toMatchObject({ status: "EXPIRED" })
      expect(browser.delete).toHaveBeenCalledTimes(4)
      expect(service.credential("web").credentialId).toBe(status.webCredential?.credentialId)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("keeps official OAuth credentials independent from Web state and persists coalesced refresh atomically", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-oauth-core-"))
    const database = await ControlDatabase.open(directory)
    const cipher = new CredentialCipher(new Uint8Array(32).fill(8))
    const timestamp = "2026-08-30T01:00:00.000Z"
    database.saveActiveDouyinCredential({
      credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0d00",
      authType: "DOUYIN_WEB_SESSION",
      encryptedPayload: cipher.encrypt({ authType: "DOUYIN_WEB_SESSION", cookies: [{ name: "sessionid", value: "web-secret" }] }),
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const browser = {
      start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(), validate: vi.fn(),
      health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
    }
    const oauthSource = {
      exchangeCode: vi.fn(async () => ({ data: {
        error_code: 0,
        access_token: "oauth-access-1",
        refresh_token: "oauth-refresh-1",
        open_id: "open-1",
        scope: "user_info",
        expires_in: 7_200,
        refresh_expires_in: 86_400
      } })),
      refreshAccessToken: vi.fn(async () => ({ data: {
        error_code: 0,
        access_token: "oauth-access-2",
        refresh_token: "oauth-refresh-2",
        open_id: "open-1",
        scope: "user_info",
        expires_in: 7_200,
        refresh_expires_in: 86_400
      } })),
      fetchUserInfo: vi.fn(async () => ({ data: { nickname: "官方授权账号", avatar: "https://example.invalid/avatar.png" } })),
      stop: vi.fn(async () => undefined)
    }
    const ids = [
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d01",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d02",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d03",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d04",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d05",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d06",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d07",
      "018f0f39-7b5e-4cc1-862d-9a208b3d0d08"
    ]
    const service = new DouyinAuthService({
      database,
      browser,
      oauthSource,
      cipher,
      now: () => new Date(timestamp),
      idFactory: () => ids.shift()!,
      oauth: {
        mode: "live",
        clientKey: "client-key",
        clientSecret: "client-secret",
        redirectUri: "bilimonitor://douyin-oauth",
        scope: "user_info"
      }
    })
    try {
      const failedStart = service.startOAuth()
      const updateSession = database.updateDouyinAuthSession.bind(database)
      const failedAuthorization = vi.spyOn(database, "updateDouyinAuthSession").mockImplementation((input) => {
        if (input.status === "SUCCESS") {
          failedAuthorization.mockRestore()
          throw new Error("OAuth completion write failed")
        }
        updateSession(input)
      })
      await expect(service.completeOAuth({ state: failedStart.state, code: "failed-write-code" }))
        .rejects.toThrow(/OAuth completion write failed/)
      expect(database.findActiveDouyinCredential("DOUYIN_OAUTH2")).toBeUndefined()
      expect(database.findDouyinAuthSessionByState(failedStart.state)).toMatchObject({
        status: "FAILED", errorCode: "OAUTH_TOKEN_EXCHANGE_FAILED"
      })

      const started = service.startOAuth()
      expect(started.authorizationUrl).toContain("redirect_uri=bilimonitor%3A%2F%2Fdouyin-oauth")
      const authorized = await service.completeOAuth({ state: started.state, code: "authorization-code" })
      expect(authorized).toMatchObject({ authType: "DOUYIN_OAUTH2", status: "ACTIVE" })
      expect(authorized.payload).toMatchObject({ accessToken: "oauth-access-1", openId: "open-1" })
      const status = await service.status()
      expect(status.webCredential?.authType).toBe("DOUYIN_WEB_SESSION")
      expect(status.oauthCredential?.payload).toMatchObject({ openId: "open-1", scope: ["user_info"] })
      expect(status.oauthCredential?.payload).not.toHaveProperty("accessToken")
      expect(status.oauthCredential?.payload).not.toHaveProperty("refreshToken")

      const failedRefresh = vi.spyOn(database, "updateDouyinAuthSession").mockImplementation((input) => {
        if (input.status === "SUCCESS") {
          failedRefresh.mockRestore()
          throw new Error("OAuth refresh write failed")
        }
        updateSession(input)
      })
      await expect(service.refreshOAuth()).rejects.toThrow(/OAuth refresh write failed/)
      expect(service.credential("oauth").credentialId).toBe(authorized.credentialId)
      expect(database.findDouyinAuthSessionById("018f0f39-7b5e-4cc1-862d-9a208b3d0d05"))
        .toMatchObject({ flowType: "OAUTH_REFRESH", status: "FAILED" })

      const [refreshed, overlapping] = await Promise.all([service.refreshOAuth(), service.refreshOAuth()])
      expect(overlapping.credentialId).toBe(refreshed.credentialId)
      expect(oauthSource.refreshAccessToken).toHaveBeenCalledTimes(2)
      expect(refreshed.payload).toMatchObject({ accessToken: "oauth-access-2", refreshToken: "oauth-refresh-2" })
      expect(database.findActiveDouyinCredential("DOUYIN_OAUTH2")?.encryptedPayload).not.toContain("oauth-access-2")
      const refreshSession = database.findDouyinAuthSessionById("018f0f39-7b5e-4cc1-862d-9a208b3d0d07")
      expect(refreshSession).toMatchObject({ flowType: "OAUTH_REFRESH", status: "SUCCESS", completedAt: timestamp })
      expect(JSON.parse(refreshSession!.rawResultJson)).toMatchObject({
        credentialId: refreshed.credentialId, sourceCredentialId: authorized.credentialId
      })
      expect(refreshSession?.rawResultJson).not.toContain("oauth-access-2")
      expect(service.revoke("oauth")).toEqual({ kind: "oauth", revoked: true })
      expect((await service.status()).webCredential?.status).toBe("ACTIVE")
      expect((await service.status()).oauthCredential).toBeUndefined()
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("never copies OAuth tokens from a failed provider response into errors or session rows", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-oauth-error-"))
    const database = await ControlDatabase.open(directory)
    const browser = {
      start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(), validate: vi.fn(),
      health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
    }
    const service = new DouyinAuthService({
      database,
      browser,
      oauthSource: {
        exchangeCode: vi.fn(async () => ({ data: { error_code: 10008, description: "denied", access_token: "must-not-leak" } })),
        refreshAccessToken: vi.fn(),
        fetchUserInfo: vi.fn()
      },
      cipher: new CredentialCipher(new Uint8Array(32).fill(9)),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
      idFactory: () => "018f0f39-7b5e-4cc1-862d-9a208b3d0e00",
      oauth: {
        mode: "live",
        clientKey: "client-key",
        clientSecret: "client-secret",
        redirectUri: "bilimonitor://douyin-oauth"
      }
    })
    try {
      const started = service.startOAuth()
      await expect(service.completeOAuth({ state: started.state, code: "authorization-code" }))
        .rejects.not.toThrow(/must-not-leak/)
      const session = database.findDouyinAuthSessionByState(started.state)
      expect(session?.errorMessage).not.toContain("must-not-leak")
      expect(session?.rawResultJson).not.toContain("must-not-leak")
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("persists a provider callback denial and exposes its latest safe session projection after restart", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-oauth-denied-"))
    const database = await ControlDatabase.open(directory)
    const service = new DouyinAuthService({
      database,
      browser: {
        start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(), validate: vi.fn(),
        health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
      },
      cipher: new CredentialCipher(new Uint8Array(32).fill(13)),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
      idFactory: () => "018f0f39-7b5e-4cc1-862d-9a208b3d1020",
      oauth: {
        mode: "live",
        clientKey: "client-key",
        clientSecret: "client-secret",
        redirectUri: "bilimonitor://douyin-oauth"
      }
    })
    try {
      const started = service.startOAuth()
      expect(service.failOAuthCallback({ state: started.state, message: "用户拒绝授权" }))
        .toMatchObject({ status: "FAILED", errorMessage: "用户拒绝授权" })
      expect(database.findDouyinAuthSessionByState(started.state)).toMatchObject({
        status: "FAILED",
        errorCode: "OAUTH_PROVIDER_ERROR",
        errorMessage: "用户拒绝授权"
      })
      await expect(service.status()).resolves.toMatchObject({
        latestOAuthSession: {
          loginId: started.loginId,
          state: started.state,
          status: "FAILED",
          errorMessage: "用户拒绝授权"
        }
      })
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("does not overwrite a newer Web login that becomes active while validation is running", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-web-race-"))
    const database = await ControlDatabase.open(directory)
    const cipher = new CredentialCipher(new Uint8Array(32).fill(10))
    const timestamp = "2026-08-30T01:00:00.000Z"
    const oldId = "018f0f39-7b5e-4cc1-862d-9a208b3d0f00"
    const newerId = "018f0f39-7b5e-4cc1-862d-9a208b3d0f01"
    database.saveActiveDouyinCredential({
      credentialId: oldId,
      authType: "DOUYIN_WEB_SESSION",
      encryptedPayload: cipher.encrypt({ authType: "DOUYIN_WEB_SESSION", cookies: [{ name: "sessionid", value: "old" }] }),
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const browser = {
      start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(),
      validate: vi.fn(async (bundle: Record<string, unknown>) => {
        database.saveActiveDouyinCredential({
          credentialId: newerId,
          authType: "DOUYIN_WEB_SESSION",
          encryptedPayload: cipher.encrypt({ authType: "DOUYIN_WEB_SESSION", cookies: [{ name: "sessionid", value: "newer" }] }),
          expiresAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        return { valid: true, message: "valid", details: {}, bundle }
      }),
      health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
    }
    const service = new DouyinAuthService({
      database,
      browser,
      cipher,
      now: () => new Date(timestamp),
      idFactory: () => "018f0f39-7b5e-4cc1-862d-9a208b3d0f02",
      oauth: { mode: "disabled" }
    })
    try {
      await expect(service.validateWeb()).rejects.toThrow(/changed|变化|重试/i)
      expect(database.findActiveDouyinCredential("DOUYIN_WEB_SESSION")?.credentialId).toBe(newerId)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("does not overwrite a newer OAuth login that becomes active while refresh is running", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-oauth-refresh-race-"))
    const database = await ControlDatabase.open(directory)
    const cipher = new CredentialCipher(new Uint8Array(32).fill(11))
    const timestamp = "2026-08-30T01:00:00.000Z"
    const oldId = "018f0f39-7b5e-4cc1-862d-9a208b3d1000"
    const newerId = "018f0f39-7b5e-4cc1-862d-9a208b3d1001"
    database.saveActiveDouyinCredential({
      credentialId: oldId,
      authType: "DOUYIN_OAUTH2",
      encryptedPayload: cipher.encrypt({ accessToken: "old", refreshToken: "old-refresh", openId: "old-open" }),
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const oauthSource = {
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(async () => {
        database.saveActiveDouyinCredential({
          credentialId: newerId,
          authType: "DOUYIN_OAUTH2",
          encryptedPayload: cipher.encrypt({ accessToken: "new-login", refreshToken: "new-login-refresh", openId: "new-open" }),
          expiresAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        return { data: { error_code: 0, access_token: "stale-refresh", refresh_token: "stale-refresh-token" } }
      }),
      fetchUserInfo: vi.fn()
    }
    const service = new DouyinAuthService({
      database,
      browser: {
        start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(), validate: vi.fn(),
        health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
      },
      oauthSource,
      cipher,
      now: () => new Date(timestamp),
      idFactory: () => "018f0f39-7b5e-4cc1-862d-9a208b3d1002",
      oauth: {
        mode: "live",
        clientKey: "client-key",
        clientSecret: "client-secret",
        redirectUri: "bilimonitor://douyin-oauth"
      }
    })
    try {
      const refreshed = await service.refreshOAuth()
      expect(refreshed.credentialId).toBe(newerId)
      expect(refreshed.payload).toMatchObject({ accessToken: "new-login" })
      expect(database.findActiveDouyinCredential("DOUYIN_OAUTH2")?.credentialId).toBe(newerId)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("claims an OAuth callback once and treats later callbacks as idempotent", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-oauth-claim-"))
    const database = await ControlDatabase.open(directory)
    let releaseExchange!: (value: Record<string, unknown>) => void
    const exchangePending = new Promise<Record<string, unknown>>((resolveExchange) => {
      releaseExchange = resolveExchange
    })
    const oauthSource = {
      exchangeCode: vi.fn(() => exchangePending),
      refreshAccessToken: vi.fn(),
      fetchUserInfo: vi.fn(async () => ({}))
    }
    const ids = [
      "018f0f39-7b5e-4cc1-862d-9a208b3d1010",
      "018f0f39-7b5e-4cc1-862d-9a208b3d1011"
    ]
    const service = new DouyinAuthService({
      database,
      browser: {
        start: vi.fn(), qr: vi.fn(), status: vi.fn(), consume: vi.fn(), validate: vi.fn(),
        health: vi.fn(async () => "UP"), delete: vi.fn(), stop: vi.fn(async () => undefined)
      },
      oauthSource,
      cipher: new CredentialCipher(new Uint8Array(32).fill(12)),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
      idFactory: () => ids.shift()!,
      oauth: {
        mode: "live",
        clientKey: "client-key",
        clientSecret: "client-secret",
        redirectUri: "bilimonitor://douyin-oauth"
      }
    })
    try {
      const started = service.startOAuth()
      const first = service.completeOAuth({ state: started.state, code: "authorization-code" })
      await vi.waitFor(() => expect(oauthSource.exchangeCode).toHaveBeenCalledTimes(1))
      await expect(service.completeOAuth({ state: started.state, code: "authorization-code" }))
        .rejects.toThrow(/already|处理|完成/)
      releaseExchange({ data: { error_code: 0, access_token: "oauth-access", refresh_token: "oauth-refresh" } })
      const completed = await first
      await expect(service.completeOAuth({ state: started.state, code: "authorization-code" }))
        .resolves.toMatchObject({ credentialId: completed.credentialId })
      expect(oauthSource.exchangeCode).toHaveBeenCalledTimes(1)
      expect(database.findDouyinAuthSessionByState(started.state)?.status).toBe("SUCCESS")
    } finally {
      await service.stop()
      database.close()
    }
  })
})
