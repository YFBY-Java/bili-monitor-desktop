import { describe, expect, it } from "vitest"

import {
  DouyinAuthStatusSchema,
  ExportDouyinCredentialInputSchema,
  ExportDouyinCredentialResultSchema,
  DouyinQrLoginStartSchema,
  DouyinQrLoginStatusSchema
} from "./douyin-auth"

describe("douyin auth contracts", () => {
  it("keeps the original visible Web QR state machine", () => {
    const started = DouyinQrLoginStartSchema.parse({
      loginId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c00",
      status: "STARTING",
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      expiresInSeconds: 180,
      pollIntervalMs: 2_000,
      expiresAt: "2026-08-30T01:03:00.000Z"
    })
    expect(started.status).toBe("STARTING")
    expect(DouyinQrLoginStatusSchema.parse({
      loginId: started.loginId,
      status: "USER_ACTION_REQUIRED",
      message: "请在可见浏览器中完成验证",
      expiresInSeconds: 120
    }).status).toBe("USER_ACTION_REQUIRED")
    expect(() => DouyinQrLoginStatusSchema.parse({
      loginId: started.loginId,
      status: "SUCCESS",
      message: "done",
      expiresInSeconds: 0,
      credential: {
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
        authType: "DOUYIN_WEB_SESSION",
        status: "ACTIVE",
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z",
        payload: { cookies: [{ value: "secret" }] }
      }
    })).toThrow()
  })

  it("rejects secrets from status-only credential summaries", () => {
    expect(() => DouyinAuthStatusSchema.parse({
      enabled: true,
      oauthMode: "live",
      workerAvailable: true,
      workerStatus: "UP",
      pollIntervalMs: 2_000,
      oauthCredential: {
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
        authType: "DOUYIN_OAUTH2",
        status: "ACTIVE",
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z",
        payload: { openId: "open-1", scope: ["user_info"], accessToken: "must-reject" }
      }
    })).toThrow()
  })

  it("keeps OAuth and Web credentials independent", () => {
    const status = DouyinAuthStatusSchema.parse({
      enabled: true,
      oauthMode: "disabled",
      workerAvailable: true,
      workerStatus: "UP",
      pollIntervalMs: 2_000,
      latestOAuthSession: {
        loginId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c10",
        state: "oauth-state-that-is-long-enough-for-validation",
        status: "FAILED",
        expiresAt: "2026-08-30T01:03:00.000Z",
        errorMessage: "用户拒绝授权"
      },
      webCredential: {
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
        authType: "DOUYIN_WEB_SESSION",
        status: "ACTIVE",
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z",
        payload: { account: {}, cookieCount: 0 }
      }
    })
    expect(status.oauthCredential).toBeUndefined()
    expect(status.webCredential?.authType).toBe("DOUYIN_WEB_SESSION")
    expect(status.latestOAuthSession?.status).toBe("FAILED")
  })

  it("keeps credential export behind the desktop save dialog", () => {
    expect(ExportDouyinCredentialInputSchema.parse({ kind: "web" })).toEqual({ kind: "web" })
    expect(ExportDouyinCredentialResultSchema.parse({
      kind: "web",
      canceled: false,
      savedPath: "D:\\BiliMonitorData\\exports\\douyin-web-credential.json"
    })).toMatchObject({ kind: "web", canceled: false })
    expect(ExportDouyinCredentialResultSchema.parse({ kind: "oauth", canceled: true }))
      .toEqual({ kind: "oauth", canceled: true })
  })
})
