import {
  BilibiliAuthAccountSchema,
  BilibiliAuthCookieSchema,
  BilibiliAuthRefreshResultSchema,
  BilibiliAuthStatusSchema,
  BilibiliAuthWorkerGenerateResultSchema,
  BilibiliAuthWorkerNavResultSchema,
  BilibiliAuthWorkerPollResultSchema,
  BilibiliCredentialSchema,
  BilibiliQrLoginStartSchema,
  BilibiliQrLoginStatusSchema,
  createRuntimeEnvelope,
  type BilibiliAuthAccount,
  type BilibiliAuthCookie,
  type BilibiliAuthRefreshResult,
  type BilibiliAuthStatus,
  type BilibiliAuthWorkerGenerateResult,
  type BilibiliAuthWorkerNavResult,
  type BilibiliAuthWorkerPollInput,
  type BilibiliAuthWorkerPollResult,
  type BilibiliAuthWorkerValidateInput,
  type BilibiliCredential,
  type BilibiliQrLoginStart,
  type BilibiliQrLoginStatus,
  type RevokeBilibiliAuthResult
} from "@bmd/contracts"
import {
  type ControlDatabase,
  type NewStoredOutboxMessage,
  type StoredBilibiliAuthCredential
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import type { CredentialCipher } from "./credential-cipher"

const COOKIE_ORDER = [
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "sid",
  "buvid3",
  "buvid4",
  "b_nut"
] as const

interface QrLoginSession {
  loginId: string
  qrcodeKey: string
  qrUrl: string
  cookies: BilibiliAuthCookie[]
  createdAt: string
  expiresAt: string
  completed?: BilibiliQrLoginStatus
}

interface PersistedCredentialPayload {
  version: 1
  authType: "WEB_COOKIE"
  source: "WEB_QRCODE"
  cookies: BilibiliAuthCookie[]
  refreshToken?: string
  account: BilibiliAuthAccount
  expiresAt?: string
  createdAt: string
  lastValidatedAt: string
  lastRefreshCheckedAt?: string
  lastNav: Record<string, unknown>
}

export interface BilibiliAuthSource {
  generate: () => Promise<BilibiliAuthWorkerGenerateResult>
  poll: (input: BilibiliAuthWorkerPollInput) => Promise<BilibiliAuthWorkerPollResult>
  validate: (input: BilibiliAuthWorkerValidateInput) => Promise<BilibiliAuthWorkerNavResult>
  stop?: () => Promise<void>
}

export interface BilibiliAuthServiceOptions {
  database: ControlDatabase
  source: BilibiliAuthSource
  cipher: CredentialCipher
  now: () => Date
  idFactory: () => string
  qrExpireSeconds?: number
  pollIntervalMillis?: number
}

export class BilibiliAuthService {
  private readonly sessions = new Map<string, QrLoginSession>()

  constructor(private readonly options: BilibiliAuthServiceOptions) {}

  async startQrLogin(): Promise<BilibiliQrLoginStart> {
    const generated = BilibiliAuthWorkerGenerateResultSchema.parse(
      await this.options.source.generate()
    )
    const loginId = this.options.idFactory()
    const createdAt = this.options.now()
    const expiresInSeconds = Math.max(1, this.options.qrExpireSeconds ?? 180)
    const pollIntervalMillis = Math.min(
      10_000,
      Math.max(1_000, this.options.pollIntervalMillis ?? 1_500)
    )
    this.sessions.set(loginId, {
      loginId,
      qrcodeKey: generated.qrcodeKey,
      qrUrl: generated.qrUrl,
      cookies: generated.cookies,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + expiresInSeconds * 1_000).toISOString()
    })
    return BilibiliQrLoginStartSchema.parse({
      loginId,
      qrUrl: generated.qrUrl,
      expiresInSeconds,
      pollIntervalMillis
    })
  }

  async pollQrLogin(loginId: string): Promise<BilibiliQrLoginStatus> {
    const session = this.sessions.get(loginId)
    if (!session) {
      throw new CoreApplicationError("BILIBILI_QR_SESSION_NOT_FOUND", "QR login session not found.")
    }
    if (session.completed) return session.completed
    const expiresInSeconds = this.expiresInSeconds(session)
    if (expiresInSeconds <= 0) return this.completeExpired(session)

    const result = BilibiliAuthWorkerPollResultSchema.parse(
      await this.options.source.poll({ qrcodeKey: session.qrcodeKey, cookies: session.cookies })
    )
    session.cookies = mergeCookies(session.cookies, result.cookies)
    if (result.code === 86101) {
      return BilibiliQrLoginStatusSchema.parse({
        status: "WAITING",
        message: "等待使用 Bilibili 手机客户端扫码",
        expiresInSeconds
      })
    }
    if (result.code === 86090) {
      return BilibiliQrLoginStatusSchema.parse({
        status: "SCANNED",
        message: "已扫码，请在手机端确认登录",
        expiresInSeconds
      })
    }
    if (result.code === 86038) return this.completeExpired(session)
    if (result.code === 0) return this.completeLogin(session, result)
    return BilibiliQrLoginStatusSchema.parse({
      status: "FAILED",
      message: `Bilibili 返回未知扫码状态: ${result.message || result.code}`,
      expiresInSeconds
    })
  }

  async currentStatus(): Promise<BilibiliAuthStatus> {
    const stored = this.options.database.findActiveBilibiliCredential()
    if (!stored) return BilibiliAuthStatusSchema.parse({ loggedIn: false, status: "NONE" })
    let previous: PersistedCredentialPayload | undefined
    try {
      previous = this.readPayload(stored)
      const validated = await this.validateAndPersist(stored, previous)
      return BilibiliAuthStatusSchema.parse({
        loggedIn: true,
        credentialId: stored.credentialId,
        account: validated.account,
        lastValidatedAt: validated.lastValidatedAt,
        ...(validated.lastRefreshCheckedAt
          ? { lastRefreshCheckedAt: validated.lastRefreshCheckedAt }
          : {}),
        ...(validated.expiresAt ? { expiresAt: validated.expiresAt } : {}),
        status: "ACTIVE"
      })
    } catch {
      const timestamp = this.options.now().toISOString()
      this.options.database.markBilibiliCredentialStatus(
        stored.credentialId,
        previous ? "EXPIRED" : "INVALID",
        timestamp,
        this.outbox(
          this.options.idFactory(),
          "bilibili.auth.credential-expired",
          timestamp,
          { credentialId: stored.credentialId }
        )
      )
      return BilibiliAuthStatusSchema.parse({
        loggedIn: false,
        credentialId: stored.credentialId,
        ...(previous ? { account: previous.account } : {}),
        ...(previous?.lastValidatedAt ? { lastValidatedAt: previous.lastValidatedAt } : {}),
        ...(previous?.lastRefreshCheckedAt
          ? { lastRefreshCheckedAt: previous.lastRefreshCheckedAt }
          : {}),
        ...(previous?.expiresAt ? { expiresAt: previous.expiresAt } : {}),
        status: previous ? "EXPIRED" : "INVALID"
      })
    }
  }

  async currentCredential(): Promise<BilibiliCredential> {
    const stored = this.requireActiveCredential()
    const validated = await this.validateAndPersist(stored, this.readPayload(stored))
    return this.toCredential(stored.credentialId, validated)
  }

  connectionCredential(): BilibiliCredential {
    const stored = this.requireActiveCredential()
    return this.toCredential(stored.credentialId, this.readPayload(stored))
  }

  async refreshCurrentCredential(): Promise<BilibiliAuthRefreshResult> {
    const stored = this.requireActiveCredential()
    const validated = await this.validateAndPersist(stored, this.readPayload(stored))
    return BilibiliAuthRefreshResultSchema.parse({
      refreshed: false,
      loggedIn: true,
      message: "登录态已重新校验；此操作不会刷新 Cookie。",
      account: validated.account
    })
  }

  async revokeCurrentCredential(): Promise<RevokeBilibiliAuthResult> {
    const timestamp = this.options.now().toISOString()
    this.options.database.revokeActiveBilibiliCredential(
      timestamp,
      this.outbox(
        this.options.idFactory(),
        "bilibili.auth.credential-revoked",
        timestamp,
        {}
      )
    )
    return { revoked: true }
  }

  async stop(): Promise<void> {
    await this.options.source.stop?.()
  }

  private async completeLogin(
    session: QrLoginSession,
    result: BilibiliAuthWorkerPollResult
  ): Promise<BilibiliQrLoginStatus> {
    const cookies = mergeCookies(session.cookies, result.cookies)
    requireMinimumCookies(cookies)
    const nav = BilibiliAuthWorkerNavResultSchema.parse(
      await this.options.source.validate({ cookies })
    )
    const timestamp = this.options.now().toISOString()
    const credentialId = this.options.idFactory()
    const accountId = this.options.database.findPlatformAccountByExternalId(
      "bilibili",
      nav.account.mid
    )?.accountId ?? this.options.idFactory()
    const expiresAt = earliestCookieExpiry(cookies)
    const payload: PersistedCredentialPayload = {
      version: 1,
      authType: "WEB_COOKIE",
      source: "WEB_QRCODE",
      cookies,
      ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
      account: nav.account,
      ...(expiresAt ? { expiresAt } : {}),
      createdAt: timestamp,
      lastValidatedAt: timestamp,
      lastNav: nav.rawPayload
    }
    this.options.database.saveActiveBilibiliCredential({
      credentialId,
      encryptedPayload: this.options.cipher.encrypt(payload),
      expiresAt: expiresAt ?? null,
      account: {
        accountId,
        mid: nav.account.mid,
        uname: nav.account.uname,
        face: nav.account.face ?? null
      },
      createdAt: timestamp,
      updatedAt: timestamp
    }, this.outbox(
      this.options.idFactory(),
      "bilibili.auth.credential-activated",
      timestamp,
      { credentialId, mid: nav.account.mid }
    ))
    const completed = BilibiliQrLoginStatusSchema.parse({
      status: "SUCCESS",
      message: "Bilibili 登录态已保存",
      expiresInSeconds: 0,
      account: nav.account
    })
    session.completed = completed
    return completed
  }

  private completeExpired(session: QrLoginSession): BilibiliQrLoginStatus {
    const completed = BilibiliQrLoginStatusSchema.parse({
      status: "EXPIRED",
      message: "二维码已过期，请重新扫码",
      expiresInSeconds: 0
    })
    session.completed = completed
    return completed
  }

  private async validateAndPersist(
    stored: StoredBilibiliAuthCredential,
    previous: PersistedCredentialPayload
  ): Promise<PersistedCredentialPayload> {
    const nav = BilibiliAuthWorkerNavResultSchema.parse(
      await this.options.source.validate({ cookies: previous.cookies })
    )
    const timestamp = this.options.now().toISOString()
    const validated: PersistedCredentialPayload = {
      ...previous,
      account: nav.account,
      lastValidatedAt: timestamp,
      lastNav: nav.rawPayload
    }
    const accountId = this.options.database.findPlatformAccountByExternalId(
      "bilibili",
      nav.account.mid
    )?.accountId ?? this.options.idFactory()
    this.options.database.updateBilibiliCredentialValidation({
      credentialId: stored.credentialId,
      encryptedPayload: this.options.cipher.encrypt(validated),
      expiresAt: validated.expiresAt ?? null,
      account: {
        accountId,
        mid: nav.account.mid,
        uname: nav.account.uname,
        face: nav.account.face ?? null
      },
      updatedAt: timestamp
    }, this.outbox(
      this.options.idFactory(),
      "bilibili.auth.credential-validated",
      timestamp,
      { credentialId: stored.credentialId, mid: nav.account.mid }
    ))
    return validated
  }

  private requireActiveCredential(): StoredBilibiliAuthCredential {
    const stored = this.options.database.findActiveBilibiliCredential()
    if (!stored) {
      throw new CoreApplicationError("BILIBILI_AUTH_NOT_FOUND", "No active Bilibili credential.")
    }
    return stored
  }

  private readPayload(stored: StoredBilibiliAuthCredential): PersistedCredentialPayload {
    const value = this.options.cipher.decrypt(stored.encryptedPayload)
    if (!isRecord(value) || value.version !== 1 || value.authType !== "WEB_COOKIE") {
      throw new CoreApplicationError("BILIBILI_AUTH_CREDENTIAL_INVALID", "Invalid credential payload.")
    }
    const cookies = BilibiliAuthCookieSchema.array().parse(value.cookies)
    const account = BilibiliAuthAccountSchema.parse(value.account)
    if (typeof value.createdAt !== "string" || typeof value.lastValidatedAt !== "string") {
      throw new CoreApplicationError("BILIBILI_AUTH_CREDENTIAL_INVALID", "Credential timestamps are missing.")
    }
    const lastNav = isRecord(value.lastNav) ? value.lastNav : {}
    return {
      version: 1,
      authType: "WEB_COOKIE",
      source: "WEB_QRCODE",
      cookies,
      ...(typeof value.refreshToken === "string" ? { refreshToken: value.refreshToken } : {}),
      account,
      ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}),
      createdAt: value.createdAt,
      lastValidatedAt: value.lastValidatedAt,
      ...(typeof value.lastRefreshCheckedAt === "string"
        ? { lastRefreshCheckedAt: value.lastRefreshCheckedAt }
        : {}),
      lastNav
    }
  }

  private toCredential(
    credentialId: string,
    payload: PersistedCredentialPayload
  ): BilibiliCredential {
    return BilibiliCredentialSchema.parse({
      credentialId,
      account: payload.account,
      cookieHeader: cookieHeader(payload.cookies),
      cookies: payload.cookies,
      ...(cookieValue(payload.cookies, "bili_jct")
        ? { csrf: cookieValue(payload.cookies, "bili_jct") }
        : {}),
      ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
      ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {}),
      rawPayload: { ...payload }
    })
  }

  private expiresInSeconds(session: QrLoginSession): number {
    return Math.max(
      0,
      Math.floor((new Date(session.expiresAt).getTime() - this.options.now().getTime()) / 1_000)
    )
  }

  private outbox(
    messageId: string,
    type: string,
    timestamp: string,
    payload: Record<string, unknown>
  ): NewStoredOutboxMessage {
    return {
      messageId,
      topic: type,
      envelopeJson: JSON.stringify(createRuntimeEnvelope({
        id: messageId,
        type,
        timestamp,
        correlationId: messageId,
        traceId: messageId,
        payload
      })),
      createdAt: timestamp
    }
  }
}

function mergeCookies(
  current: BilibiliAuthCookie[],
  incoming: BilibiliAuthCookie[]
): BilibiliAuthCookie[] {
  const merged = new Map<string, BilibiliAuthCookie>()
  for (const item of [...current, ...incoming]) {
    if (item.name && item.value) merged.set(item.name, item)
  }
  return [...merged.values()]
}

function cookieHeader(cookies: BilibiliAuthCookie[]): string {
  const order = new Map<string, number>(COOKIE_ORDER.map((name, index) => [name, index]))
  return [...cookies]
    .filter((item) => item.value)
    .sort((left, right) => (order.get(left.name) ?? 100) - (order.get(right.name) ?? 100))
    .map((item) => `${item.name}=${item.value}`)
    .join("; ")
}

function cookieValue(cookies: BilibiliAuthCookie[], name: string): string | undefined {
  return cookies.find((item) => item.name === name)?.value || undefined
}

function requireMinimumCookies(cookies: BilibiliAuthCookie[]): void {
  const missing = ["SESSDATA", "bili_jct", "DedeUserID"].filter(
    (name) => !cookieValue(cookies, name)
  )
  if (missing.length > 0) {
    throw new CoreApplicationError(
      "BILIBILI_AUTH_COOKIE_INCOMPLETE",
      `Bilibili login cookie is incomplete: ${missing.join(", ")}.`
    )
  }
}

function earliestCookieExpiry(cookies: BilibiliAuthCookie[]): string | undefined {
  return cookies
    .map((item) => item.expiresAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
