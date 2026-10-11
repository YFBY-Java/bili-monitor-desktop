import { randomBytes } from "node:crypto"

import {
  CompleteDouyinOAuthInputSchema,
  DouyinOAuthCallbackFailureSchema,
  DouyinAuthStatusSchema,
  DouyinCredentialSchema,
  DouyinCredentialSummarySchema,
  DouyinOAuthStartSchema,
  DouyinOAuthSessionSummarySchema,
  DouyinQrLoginStartSchema,
  DouyinQrLoginStatusSchema,
  DouyinValidationResultSchema,
  type DouyinAuthStatus,
  type DouyinCredential,
  type DouyinCredentialSummary,
  type DouyinCredentialKind,
  type DouyinOAuthStart,
  type DouyinOAuthSessionSummary,
  type DouyinQrLoginStart,
  type DouyinQrLoginStatus,
  type DouyinValidationResult
} from "@bmd/contracts"
import type {
  ControlDatabase,
  NewStoredDouyinAuthCredential,
  StoredDouyinAuthCredential,
  StoredDouyinAuthSession
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import type { CredentialCipher } from "./credential-cipher"
import type { DouyinBrowserWorkerSource, DouyinWebWorkerStatus } from "./douyin-browser-worker-source"

export interface DouyinOAuthSource {
  exchangeCode: (input: { clientKey: string; clientSecret: string; code: string }) => Promise<Record<string, unknown>>
  refreshAccessToken: (input: { clientKey: string; refreshToken: string }) => Promise<Record<string, unknown>>
  fetchUserInfo: (input: { accessToken: string; openId: string }) => Promise<Record<string, unknown>>
  stop?: () => Promise<void>
}

export interface DouyinAuthServiceOptions {
  database: ControlDatabase
  browser: Pick<DouyinBrowserWorkerSource, "start" | "qr" | "status" | "consume" | "validate" | "health" | "delete" | "stop">
  oauthSource?: DouyinOAuthSource
  cipher: CredentialCipher
  now: () => Date
  idFactory: () => string
  qrExpireSeconds?: number
  pollIntervalMs?: number
  oauth: {
    mode: "disabled" | "live"
    clientKey?: string
    clientSecret?: string
    redirectUri?: string
    scope?: string
  }
}

const WEB_AUTH = "DOUYIN_WEB_SESSION" as const
const OAUTH_AUTH = "DOUYIN_OAUTH2" as const
const TERMINAL = new Set(["SUCCESS", "EXPIRED", "FAILED"])

export class DouyinAuthService {
  private readonly qrExpireSeconds: number
  private readonly pollIntervalMs: number
  private readonly webPolls = new Map<string, Promise<DouyinQrLoginStatus>>()
  private readonly oauthRefreshes = new Map<string, Promise<DouyinCredential>>()

  constructor(private readonly options: DouyinAuthServiceOptions) {
    this.qrExpireSeconds = Math.min(1_800, Math.max(30, options.qrExpireSeconds ?? 180))
    this.pollIntervalMs = Math.min(30_000, Math.max(500, options.pollIntervalMs ?? 2_000))
  }

  async status(): Promise<DouyinAuthStatus> {
    let workerStatus = "DOWN"
    try { workerStatus = await this.options.browser.health() } catch { /* projected as unavailable */ }
    const oauthCredential = this.activeSummary(OAUTH_AUTH)
    const webCredential = this.activeSummary(WEB_AUTH)
    const latestOAuthSession = this.latestOAuthSession()
    return DouyinAuthStatusSchema.parse({
      enabled: true,
      oauthMode: this.options.oauth.mode,
      workerAvailable: workerStatus.toUpperCase() === "UP",
      workerStatus,
      pollIntervalMs: this.pollIntervalMs,
      ...(latestOAuthSession ? { latestOAuthSession } : {}),
      ...(oauthCredential ? { oauthCredential } : {}),
      ...(webCredential ? { webCredential } : {})
    })
  }

  async startWebQr(): Promise<DouyinQrLoginStart> {
    const now = this.options.now()
    const loginId = this.options.idFactory()
    const expiresAt = new Date(now.getTime() + this.qrExpireSeconds * 1_000).toISOString()
    this.options.database.createDouyinAuthSession({
      loginId,
      flowType: "WEB_QR",
      providerMode: "live",
      workerSessionId: null,
      state: null,
      status: "STARTING",
      expiresAt,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      rawResultJson: JSON.stringify({ requestedAt: now.toISOString() }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    let workerSessionId: string | null = null
    try {
      const started = await this.options.browser.start(this.qrExpireSeconds)
      workerSessionId = started.workerSessionId
      this.options.database.attachDouyinWorkerSession(
        loginId,
        started.workerSessionId,
        started.status,
        JSON.stringify(started),
        this.options.now().toISOString()
      )
      const imageDataUrl = await this.options.browser.qr(started.workerSessionId).catch(() => undefined)
      return DouyinQrLoginStartSchema.parse({
        loginId,
        status: started.status,
        ...(imageDataUrl ? { imageDataUrl } : {}),
        expiresInSeconds: this.remainingSeconds(expiresAt),
        pollIntervalMs: this.pollIntervalMs,
        expiresAt
      })
    } catch (error) {
      await this.safeDelete(workerSessionId)
      this.failSession(loginId, "WORKER_UNAVAILABLE", error)
      throw this.applicationError("DOUYIN_BROWSER_WORKER_UNAVAILABLE", error)
    }
  }

  async pollWebQr(loginId: string): Promise<DouyinQrLoginStatus> {
    const pending = this.webPolls.get(loginId)
    if (pending) return pending
    const operation = this.pollWebQrSession(loginId)
    this.webPolls.set(loginId, operation)
    try {
      return await operation
    } finally {
      this.webPolls.delete(loginId)
    }
  }

  private async pollWebQrSession(loginId: string): Promise<DouyinQrLoginStatus> {
    const session = this.requireSession(loginId, "WEB_QR")
    if (new Date(session.expiresAt).getTime() <= this.options.now().getTime() && session.status !== "SUCCESS") {
      this.updateSession(session, "EXPIRED", { expiredAt: this.options.now().toISOString() })
      await this.safeDelete(session.workerSessionId)
      return this.qrStatus(session, "EXPIRED", "抖音二维码已过期")
    }
    if (TERMINAL.has(session.status)) {
      return this.qrStatus(
        session,
        session.status as DouyinWebWorkerStatus["status"],
        session.errorMessage ?? this.defaultMessage(session.status)
      )
    }
    const workerSessionId = this.workerSessionId(session)
    let observed: DouyinWebWorkerStatus
    try {
      observed = await this.options.browser.status(workerSessionId)
    } catch (error) {
      this.failSession(loginId, "WORKER_UNAVAILABLE", error)
      throw this.applicationError("DOUYIN_BROWSER_WORKER_UNAVAILABLE", error)
    }
    if (observed.status !== "SUCCESS") {
      if (observed.status === "FAILED") {
        this.failSession(loginId, "WORKER_SESSION_FAILED", new Error(observed.message))
        await this.safeDelete(workerSessionId)
      } else {
        this.updateSession(session, observed.status, { observed })
        if (observed.status === "EXPIRED") await this.safeDelete(workerSessionId)
      }
      const imageDataUrl = ["STARTING", "WAITING", "SCANNED"].includes(observed.status)
        ? await this.options.browser.qr(workerSessionId).catch(() => undefined)
        : undefined
      return this.qrStatus(session, observed.status, observed.message, imageDataUrl)
    }
    try {
      const bundle = await this.options.browser.consume(workerSessionId)
      this.requireWebBundle(bundle)
      const timestamp = this.options.now().toISOString()
      const credential = this.options.database.completeDouyinWebLogin({
        loginId,
        credential: {
          credentialId: this.options.idFactory(),
          authType: WEB_AUTH,
          encryptedPayload: this.options.cipher.encrypt(bundle),
          expiresAt: webExpiration(bundle) ?? null,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        rawResult: { observed }
      })
      if (!credential) {
        throw new CoreApplicationError("DOUYIN_WEB_SESSION_NOT_COMPLETABLE", "当前抖音 Web 登录会话已不能完成。")
      }
      await this.safeDelete(workerSessionId)
      return this.qrStatus(session, "SUCCESS", observed.message || "抖音 Web 登录态已保存")
    } catch (error) {
      await this.safeDelete(workerSessionId)
      this.failSession(loginId, "WEB_SESSION_CAPTURE_FAILED", error)
      throw this.applicationError("DOUYIN_WEB_SESSION_CAPTURE_FAILED", error)
    }
  }

  async validateWeb(): Promise<DouyinValidationResult> {
    const stored = this.requireActiveStored(WEB_AUTH)
    const payload = this.decrypt(stored)
    const validation = await this.options.browser.validate(payload)
    if (!validation.valid) {
      this.options.database.markDouyinCredentialStatus(stored.credentialId, "INVALID", this.options.now().toISOString())
      return DouyinValidationResultSchema.parse({ valid: false, message: validation.message, details: validation.details })
    }
    const validatedPayload = validation.bundle
    this.requireWebBundle(validatedPayload)
    const credential = this.replaceCredentialIfCurrent(
      stored.credentialId,
      WEB_AUTH,
      validatedPayload,
      webExpiration(validatedPayload)
    )
    if (!credential) {
      throw new CoreApplicationError(
        "DOUYIN_WEB_CREDENTIAL_CHANGED",
        "当前抖音 Web 登录态已在校验期间变化，请基于最新登录态重试。"
      )
    }
    return DouyinValidationResultSchema.parse({
      valid: true,
      message: validation.message,
      details: validation.details
    })
  }

  startOAuth(): DouyinOAuthStart {
    const config = this.liveOAuthConfig()
    const now = this.options.now()
    const loginId = this.options.idFactory()
    const state = randomBytes(32).toString("base64url")
    const expiresAt = new Date(now.getTime() + this.qrExpireSeconds * 1_000).toISOString()
    this.options.database.createDouyinAuthSession({
      loginId,
      flowType: "OAUTH_LOGIN",
      providerMode: "live",
      workerSessionId: null,
      state,
      status: "WAITING",
      expiresAt,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      rawResultJson: "{}",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    const query = new URLSearchParams({
      client_key: config.clientKey,
      response_type: "code",
      scope: config.scope,
      redirect_uri: config.redirectUri,
      state
    })
    return DouyinOAuthStartSchema.parse({
      loginId,
      mode: "live",
      authorizationUrl: `https://open.douyin.com/platform/oauth/connect/?${query.toString()}`,
      state,
      expiresInSeconds: this.qrExpireSeconds
    })
  }

  failOAuthCallback(input: { state: string; message: string }): DouyinOAuthSessionSummary {
    const parsed = DouyinOAuthCallbackFailureSchema.parse(input)
    const session = this.options.database.findDouyinAuthSessionByState(parsed.state)
    if (!session || session.flowType !== "OAUTH_LOGIN") {
      throw new CoreApplicationError("DOUYIN_OAUTH_STATE_INVALID", "抖音 OAuth state 无效。")
    }
    if (session.status === "SUCCESS") return this.oauthSessionSummary(session)
    if (session.status !== "FAILED" && session.status !== "EXPIRED") {
      const timestamp = this.options.now().toISOString()
      this.options.database.updateDouyinAuthSession({
        loginId: session.loginId,
        status: "FAILED",
        rawResultJson: JSON.stringify({ providerCallback: "error" }),
        errorCode: "OAUTH_PROVIDER_ERROR",
        errorMessage: parsed.message.slice(0, 1_000),
        completedAt: timestamp,
        updatedAt: timestamp
      })
    }
    const stored = this.options.database.findDouyinAuthSessionById(session.loginId)
    if (!stored) throw new CoreApplicationError("DOUYIN_OAUTH_SESSION_MISSING", "抖音 OAuth 会话不存在。")
    return this.oauthSessionSummary(stored)
  }

  async completeOAuth(input: { state: string; code: string }): Promise<DouyinCredential> {
    const parsed = CompleteDouyinOAuthInputSchema.parse(input)
    const config = this.liveOAuthConfig()
    const session = this.options.database.findDouyinAuthSessionByState(parsed.state)
    if (!session || session.flowType !== "OAUTH_LOGIN") {
      throw new CoreApplicationError("DOUYIN_OAUTH_STATE_INVALID", "抖音 OAuth state 无效。")
    }
    if (session.status === "SUCCESS") return this.completedOAuthCredential(session)
    if (new Date(session.expiresAt).getTime() <= this.options.now().getTime()) {
      throw new CoreApplicationError("DOUYIN_OAUTH_SESSION_EXPIRED", "抖音 OAuth 会话已过期。")
    }
    const claimed = this.options.database.tryClaimDouyinOAuthSession(
      session.loginId,
      JSON.stringify({ callbackReceived: true }),
      this.options.now().toISOString()
    )
    if (!claimed) {
      const latest = this.options.database.findDouyinAuthSessionById(session.loginId)
      if (latest?.status === "SUCCESS") return this.completedOAuthCredential(latest)
      throw new CoreApplicationError(
        "DOUYIN_OAUTH_ALREADY_PROCESSING",
        "抖音 OAuth 会话正在处理，不能重复完成。"
      )
    }
    try {
      const source = this.requireOAuthSource()
      const response = await source.exchangeCode({ clientKey: config.clientKey, clientSecret: config.clientSecret, code: parsed.code })
      const token = successfulData(response, "抖音 OAuth 换取 token 失败")
      const accessToken = requiredText(token.access_token, "OAuth 响应缺少 access_token")
      const refreshToken = optionalText(token.refresh_token)
      const openId = optionalText(token.open_id)
      const scope = parseScope(token.scope)
      const userInfo = openId && scope.includes("user_info")
        ? await source.fetchUserInfo({ accessToken, openId })
        : {}
      const expiresAt = expiration(this.options.now(), token.expires_in)
      const payload: Record<string, unknown> = {
        version: 1,
        authType: OAUTH_AUTH,
        source: "OFFICIAL_WEB_OAUTH",
        providerMode: "live",
        authorizationCode: parsed.code,
        accessToken,
        refreshToken,
        openId,
        unionId: optionalText(token.union_id),
        scope,
        expiresAt,
        refreshExpiresAt: expiration(this.options.now(), token.refresh_expires_in),
        account: accountFromUserInfo(userInfo),
        rawTokenResponse: response,
        authorizedAt: this.options.now().toISOString(),
        lastRefreshedAt: null
      }
      const credential = this.options.database.completeDouyinOAuthLogin({
        loginId: session.loginId,
        credential: this.encryptedCredential(OAUTH_AUTH, payload, expiresAt),
        rawResult: {}
      })
      if (!credential) {
        throw new CoreApplicationError("DOUYIN_OAUTH_SESSION_NOT_COMPLETABLE", "当前抖音 OAuth 会话已不能完成。")
      }
      return this.toCredential(credential)
    } catch (error) {
      const latest = this.options.database.findDouyinAuthSessionById(session.loginId)
      if (latest?.status !== "SUCCESS") {
        this.failSession(session.loginId, "OAUTH_TOKEN_EXCHANGE_FAILED", error)
      }
      throw this.applicationError("DOUYIN_OAUTH_TOKEN_EXCHANGE_FAILED", error)
    }
  }

  async refreshOAuth(): Promise<DouyinCredential> {
    const config = this.liveOAuthConfig()
    const source = this.requireOAuthSource()
    const active = this.requireActiveStored(OAUTH_AUTH)
    const pending = this.oauthRefreshes.get(active.credentialId)
    if (pending) return pending
    const operation = this.refreshOAuthCredential(active, config.clientKey, source)
    this.oauthRefreshes.set(active.credentialId, operation)
    try {
      return await operation
    } finally {
      this.oauthRefreshes.delete(active.credentialId)
    }
  }

  private async refreshOAuthCredential(
    active: StoredDouyinAuthCredential,
    clientKey: string,
    source: DouyinOAuthSource
  ): Promise<DouyinCredential> {
    const now = this.options.now()
    const loginId = this.options.idFactory()
    this.options.database.createDouyinAuthSession({
      loginId,
      flowType: "OAUTH_REFRESH",
      providerMode: "live",
      workerSessionId: null,
      state: null,
      status: "VALIDATING",
      expiresAt: new Date(now.getTime() + this.qrExpireSeconds * 1_000).toISOString(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      rawResultJson: JSON.stringify({ sourceCredentialId: active.credentialId }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    try {
      const payload = this.decrypt(active)
      const refreshToken = requiredText(payload.refreshToken, "当前抖音 OAuth 凭据没有 refreshToken。")
      const response = await source.refreshAccessToken({ clientKey, refreshToken })
      const token = successfulData(response, "抖音 OAuth 刷新失败")
      const refreshedAt = this.options.now()
      const next = {
        ...payload,
        accessToken: requiredText(token.access_token, "OAuth 刷新响应缺少 access_token"),
        refreshToken: optionalText(token.refresh_token) ?? refreshToken,
        openId: optionalText(token.open_id) ?? payload.openId,
        scope: token.scope === undefined ? payload.scope : parseScope(token.scope),
        expiresAt: expiration(refreshedAt, token.expires_in),
        refreshExpiresAt: expiration(refreshedAt, token.refresh_expires_in),
        lastRefreshedAt: refreshedAt.toISOString(),
        refreshedFromCredentialId: active.credentialId,
        rawRefreshResponse: response
      }
      const stored = this.options.database.completeDouyinOAuthRefresh({
        loginId,
        expectedCredentialId: active.credentialId,
        credential: this.encryptedCredential(OAUTH_AUTH, next, optionalText(next.expiresAt))
      })
      if (stored) return this.toCredential(stored)
      throw new CoreApplicationError(
        "DOUYIN_OAUTH_CREDENTIAL_CHANGED",
        "抖音 OAuth 登录态在刷新期间变化，且当前已无可用凭据。"
      )
    } catch (error) {
      this.failSession(loginId, "OAUTH_TOKEN_EXCHANGE_FAILED", error)
      throw this.applicationError("DOUYIN_OAUTH_TOKEN_REFRESH_FAILED", error)
    }
  }

  credential(kind: DouyinCredentialKind): DouyinCredential {
    const stored = this.requireActiveStored(authType(kind))
    return this.toCredential(stored)
  }

  revoke(kind: DouyinCredentialKind): { kind: DouyinCredentialKind; revoked: true } {
    this.options.database.revokeActiveDouyinCredential(authType(kind), this.options.now().toISOString())
    return { kind, revoked: true }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([this.options.browser.stop(), this.options.oauthSource?.stop?.() ?? Promise.resolve()])
  }

  private active(authTypeValue: typeof WEB_AUTH | typeof OAUTH_AUTH): DouyinCredential | undefined {
    const stored = this.options.database.findActiveDouyinCredential(authTypeValue)
    return stored ? this.toCredential(stored) : undefined
  }

  private latestOAuthSession(): DouyinOAuthSessionSummary | undefined {
    let session = this.options.database.findLatestDouyinOAuthSession()
    if (!session) return undefined
    if (!["SUCCESS", "FAILED", "EXPIRED"].includes(session.status)
      && new Date(session.expiresAt).getTime() <= this.options.now().getTime()) {
      const timestamp = this.options.now().toISOString()
      this.options.database.updateDouyinAuthSession({
        loginId: session.loginId,
        status: "EXPIRED",
        rawResultJson: JSON.stringify({ expiredAt: timestamp }),
        errorCode: "OAUTH_SESSION_EXPIRED",
        errorMessage: "抖音 OAuth 授权会话已过期。",
        completedAt: timestamp,
        updatedAt: timestamp
      })
      session = this.options.database.findDouyinAuthSessionById(session.loginId) ?? session
    }
    return this.oauthSessionSummary(session)
  }

  private oauthSessionSummary(session: StoredDouyinAuthSession): DouyinOAuthSessionSummary {
    if (!session.state) throw new CoreApplicationError("DOUYIN_OAUTH_STATE_MISSING", "抖音 OAuth 会话缺少 state。")
    return DouyinOAuthSessionSummarySchema.parse({
      loginId: session.loginId,
      state: session.state,
      status: session.status,
      expiresAt: session.expiresAt,
      ...(session.errorMessage ? { errorMessage: session.errorMessage } : {})
    })
  }

  private activeSummary(authTypeValue: typeof WEB_AUTH | typeof OAUTH_AUTH): DouyinCredentialSummary | undefined {
    const credential = this.active(authTypeValue)
    if (!credential) return undefined
    const account = safeAccount(credential.payload.account)
    const payload = authTypeValue === WEB_AUTH
      ? {
          account,
          cookieCount: Array.isArray(credential.payload.cookies) ? credential.payload.cookies.length : 0,
          lastValidatedAt: optionalText(credential.payload.lastValidatedAt)
        }
      : {
          account,
          openId: optionalText(credential.payload.openId),
          scope: parseScope(credential.payload.scope)
        }
    return DouyinCredentialSummarySchema.parse({ ...credential, payload })
  }

  private requireActiveStored(authTypeValue: typeof WEB_AUTH | typeof OAUTH_AUTH): StoredDouyinAuthCredential {
    const stored = this.options.database.findActiveDouyinCredential(authTypeValue)
    if (!stored) throw new CoreApplicationError("DOUYIN_CREDENTIAL_NOT_FOUND", `没有可用的抖音凭据：${authTypeValue}`)
    return stored
  }

  private requireWebBundle(bundle: Record<string, unknown> | undefined): asserts bundle is Record<string, unknown> {
    if (!bundle || Object.keys(bundle).length === 0
      || (bundle.authType !== undefined && bundle.authType !== WEB_AUTH)) {
      throw new CoreApplicationError("DOUYIN_WEB_BUNDLE_INVALID", "抖音 Worker 未返回完整的 Web 登录态 bundle。")
    }
  }

  private encryptedCredential(
    authTypeValue: typeof WEB_AUTH | typeof OAUTH_AUTH,
    payload: Record<string, unknown>,
    expiresAt: string | undefined
  ): NewStoredDouyinAuthCredential {
    const timestamp = this.options.now().toISOString()
    return {
      credentialId: this.options.idFactory(),
      authType: authTypeValue,
      encryptedPayload: this.options.cipher.encrypt(payload),
      expiresAt: expiresAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }

  private replaceCredentialIfCurrent(
    expectedCredentialId: string,
    authTypeValue: typeof WEB_AUTH | typeof OAUTH_AUTH,
    payload: Record<string, unknown>,
    expiresAt: string | undefined
  ): DouyinCredential | undefined {
    const timestamp = this.options.now().toISOString()
    const stored = this.options.database.replaceActiveDouyinCredentialIfCurrent(
      expectedCredentialId,
      {
        credentialId: this.options.idFactory(),
        authType: authTypeValue,
        encryptedPayload: this.options.cipher.encrypt(payload),
        expiresAt: expiresAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    )
    return stored ? this.toCredential(stored) : undefined
  }

  private completedOAuthCredential(session: StoredDouyinAuthSession): DouyinCredential {
    try {
      const result = JSON.parse(session.rawResultJson) as Record<string, unknown>
      if (typeof result.credentialId === "string") {
        const stored = this.options.database.findDouyinCredentialById(result.credentialId)
        if (stored) return this.toCredential(stored)
      }
    } catch {
      // Fall back to the currently active OAuth credential for older local rows.
    }
    return this.credential("oauth")
  }

  private toCredential(stored: StoredDouyinAuthCredential): DouyinCredential {
    return DouyinCredentialSchema.parse({
      credentialId: stored.credentialId,
      authType: stored.authType,
      status: stored.status,
      ...(stored.expiresAt ? { expiresAt: stored.expiresAt } : {}),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      payload: this.decrypt(stored)
    })
  }

  private decrypt(stored: StoredDouyinAuthCredential): Record<string, unknown> {
    const value = this.options.cipher.decrypt(stored.encryptedPayload)
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Douyin credential payload is invalid.")
    return value as Record<string, unknown>
  }

  private requireSession(loginId: string, flowType: string): StoredDouyinAuthSession {
    const session = this.options.database.findDouyinAuthSessionById(loginId)
    if (!session) throw new CoreApplicationError("DOUYIN_AUTH_SESSION_NOT_FOUND", "抖音登录会话不存在。")
    if (session.flowType !== flowType) throw new CoreApplicationError("DOUYIN_AUTH_SESSION_TYPE_MISMATCH", "抖音登录会话类型不匹配。")
    return session
  }

  private workerSessionId(session: StoredDouyinAuthSession): string {
    if (!session.workerSessionId) throw new CoreApplicationError("DOUYIN_WORKER_SESSION_MISSING", "抖音浏览器会话尚未就绪。")
    return session.workerSessionId
  }

  private updateSession(session: StoredDouyinAuthSession, status: string, raw: Record<string, unknown>): void {
    this.options.database.updateDouyinAuthSession({
      loginId: session.loginId,
      status,
      rawResultJson: JSON.stringify(raw),
      updatedAt: this.options.now().toISOString()
    })
  }

  private failSession(loginId: string, code: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.options.database.updateDouyinAuthSession({
      loginId,
      status: "FAILED",
      rawResultJson: JSON.stringify({ errorCode: code, errorMessage: message }),
      completedAt: this.options.now().toISOString(),
      errorCode: code,
      errorMessage: message,
      updatedAt: this.options.now().toISOString()
    })
  }

  private qrStatus(
    session: StoredDouyinAuthSession,
    status: DouyinWebWorkerStatus["status"],
    message: string,
    imageDataUrl?: string
  ): DouyinQrLoginStatus {
    return DouyinQrLoginStatusSchema.parse({
      loginId: session.loginId,
      status,
      message,
      expiresInSeconds: status === "SUCCESS" ? 0 : this.remainingSeconds(session.expiresAt),
      ...(imageDataUrl ? { imageDataUrl } : {})
    })
  }

  private remainingSeconds(expiresAt: string): number {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - this.options.now().getTime()) / 1_000))
  }

  private defaultMessage(status: string): string {
    return status === "SUCCESS" ? "抖音 Web 登录态已保存" : status === "EXPIRED" ? "抖音二维码已过期" : "抖音 Web 登录失败"
  }

  private safeDelete(workerSessionId: string | null): Promise<void> {
    return workerSessionId ? this.options.browser.delete(workerSessionId).catch(() => undefined) : Promise.resolve()
  }

  private liveOAuthConfig(): { clientKey: string; clientSecret: string; redirectUri: string; scope: string } {
    const oauth = this.options.oauth
    if (oauth.mode !== "live" || !oauth.clientKey || !oauth.clientSecret || !oauth.redirectUri) {
      throw new CoreApplicationError("DOUYIN_OAUTH_DISABLED", "抖音 OAuth 未配置 live client key、secret 和 redirect URI。")
    }
    return { clientKey: oauth.clientKey, clientSecret: oauth.clientSecret, redirectUri: oauth.redirectUri, scope: oauth.scope ?? "user_info" }
  }

  private requireOAuthSource(): DouyinOAuthSource {
    if (!this.options.oauthSource) throw new CoreApplicationError("DOUYIN_OAUTH_WORKER_UNAVAILABLE", "抖音 OAuth Worker 不可用。")
    return this.options.oauthSource
  }

  private applicationError(code: string, error: unknown): CoreApplicationError {
    return new CoreApplicationError(code, error instanceof Error ? error.message : String(error))
  }
}

function authType(kind: DouyinCredentialKind): typeof WEB_AUTH | typeof OAUTH_AUTH {
  return kind === "web" ? WEB_AUTH : OAUTH_AUTH
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function requiredText(value: unknown, message: string): string {
  const text = optionalText(value)
  if (!text) throw new Error(message)
  return text
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value)
}

function expiration(now: Date, seconds: unknown): string | undefined {
  const value = number(seconds)
  return Number.isFinite(value) && value > 0 ? new Date(now.getTime() + value * 1_000).toISOString() : undefined
}

function parseScope(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : []
}

function successfulData(response: Record<string, unknown>, message: string): Record<string, unknown> {
  const data = typeof response.data === "object" && response.data !== null && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : response
  const code = number(data.error_code ?? response.err_no ?? 0)
  if (Number.isFinite(code) && code !== 0) throw new Error(`${message} (error_code=${code})`)
  return data
}

function accountFromUserInfo(response: Record<string, unknown>): Record<string, unknown> {
  const data = typeof response.data === "object" && response.data !== null && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {}
  return { nickname: data.nickname, avatarUrl: data.avatar, rawUserInfo: response }
}

function webExpiration(bundle: Record<string, unknown>): string | undefined {
  if (!Array.isArray(bundle.cookies)) return undefined
  const authNames = new Set(["sessionid", "sessionid_ss", "sid_guard"])
  const expirations = bundle.cookies.flatMap((cookie) => {
    if (typeof cookie !== "object" || cookie === null || Array.isArray(cookie)) return []
    const item = cookie as Record<string, unknown>
    if (!authNames.has(String(item.name).toLowerCase())) return []
    const value = number(item.expires)
    return Number.isFinite(value) && value > 0 ? [value] : []
  })
  return expirations.length > 0 ? new Date(Math.min(...expirations) * 1_000).toISOString() : undefined
}

function safeAccount(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const account = value as Record<string, unknown>
  return Object.fromEntries(["nickname", "name", "displayName", "avatar", "avatarUrl"]
    .flatMap((key) => typeof account[key] === "string" ? [[key, account[key]]] : []))
}
