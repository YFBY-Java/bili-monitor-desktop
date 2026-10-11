import { randomUUID } from "node:crypto"

const SESSION_CLEANUP_DELAY_MS = 60_000
const TERMINAL_STATUSES = new Set(["SUCCESS", "EXPIRED", "FAILED"])

export interface DouyinBrowserBundle extends Record<string, unknown> {
  authType: "DOUYIN_WEB_SESSION"
}

export interface DouyinBrowserStatus {
  status: "STARTING" | "WAITING" | "SCANNED" | "VALIDATING" | "SUCCESS" | "EXPIRED" | "USER_ACTION_REQUIRED" | "FAILED"
  message: string
  bundle?: DouyinBrowserBundle
  details?: Record<string, unknown>
}

export interface DouyinLoginHandle {
  qr: () => Promise<Buffer>
  status: () => Promise<DouyinBrowserStatus>
  close: () => Promise<void>
}

export interface DouyinDriver {
  createSession: (input: { workerSessionId: string }) => Promise<DouyinLoginHandle>
  validateBundle: (bundle: Record<string, unknown>) => Promise<{
    valid: boolean
    message?: string
    details?: Record<string, unknown>
    bundle?: DouyinBrowserBundle
  }>
  close?: () => Promise<void>
}

interface ManagedSession {
  handle?: DouyinLoginHandle
  status: DouyinBrowserStatus
  bundle?: DouyinBrowserBundle
  expiresAt: number
  closed: boolean
  expiryTimer?: NodeJS.Timeout
  cleanupTimer?: NodeJS.Timeout
  closePromise?: Promise<void>
}

export class DouyinWorkerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export class DouyinSessionManager {
  private readonly sessions = new Map<string, ManagedSession>()

  constructor(
    private readonly driver: DouyinDriver,
    private readonly options: {
      ttlSeconds: number
      now?: () => number
      idFactory?: () => string
    }
  ) {}

  async create(expiresInSeconds?: number): Promise<{ workerSessionId: string; status: "STARTING"; expiresAt: string }> {
    const now = (this.options.now ?? Date.now)()
    const ttl = Math.min(this.options.ttlSeconds, Math.max(1, expiresInSeconds ?? this.options.ttlSeconds))
    const workerSessionId = (this.options.idFactory ?? randomUUID)()
    const session: ManagedSession = {
      status: { status: "STARTING", message: "Browser session is starting" },
      expiresAt: now + ttl * 1_000,
      closed: false
    }
    this.sessions.set(workerSessionId, session)
    session.expiryTimer = setTimeout(() => {
      if (session.closed || session.status.status === "SUCCESS") return
      session.status = { status: "EXPIRED", message: "Login session has expired" }
      this.closeAfterTimeout(workerSessionId, session)
    }, ttl * 1_000)
    session.expiryTimer.unref()
    session.cleanupTimer = setTimeout(() => {
      this.forgetSession(workerSessionId, session)
      this.closeAfterTimeout(workerSessionId, session)
    }, ttl * 1_000 + SESSION_CLEANUP_DELAY_MS)
    session.cleanupTimer.unref()
    void this.driver.createSession({ workerSessionId }).then(async (handle) => {
      if (session.closed) return handle.close()
      session.handle = handle
    }).catch((error: unknown) => {
      if (!session.closed) session.status = {
        status: "FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    })
    return { workerSessionId, status: "STARTING", expiresAt: new Date(session.expiresAt).toISOString() }
  }

  async qr(workerSessionId: string): Promise<Buffer> {
    const session = await this.active(workerSessionId)
    if (!session.handle) throw new DouyinWorkerError("SESSION_NOT_READY", "Browser session is still initializing")
    return session.handle.qr()
  }

  async status(workerSessionId: string): Promise<DouyinBrowserStatus> {
    const session = this.require(workerSessionId)
    await this.expire(session)
    const settled = this.settledStatus(workerSessionId, session)
    if (settled) return settled
    if (!session.handle) return session.status
    const observed = await session.handle.status()
    await this.expire(session)
    const settledAfterObservation = this.settledStatus(workerSessionId, session)
    if (settledAfterObservation) return settledAfterObservation
    if (observed.status !== "SUCCESS") {
      session.status = observed
      if (observed.status === "EXPIRED" || observed.status === "FAILED") await this.closeSession(session)
      return session.status
    }
    if (!observed.bundle) {
      session.status = { status: "FAILED", message: "Login completed without a credential bundle" }
      await this.closeSession(session)
      return session.status
    }
    const validation = await this.driver.validateBundle(observed.bundle)
    await this.expire(session)
    const settledAfterValidation = this.settledStatus(workerSessionId, session)
    if (settledAfterValidation) return settledAfterValidation
    if (!validation.valid) {
      session.status = { status: "FAILED", message: validation.message ?? "Captured login state is invalid" }
      await this.closeSession(session)
      return session.status
    }
    session.bundle = validation.bundle ?? observed.bundle
    session.status = {
      status: "SUCCESS",
      message: observed.message,
      ...(validation.details ? { details: validation.details } : {})
    }
    await this.closeSession(session)
    return session.status
  }

  async consume(workerSessionId: string): Promise<DouyinBrowserBundle> {
    const session = this.require(workerSessionId)
    if (session.status.status !== "SUCCESS" || !session.bundle) {
      throw new DouyinWorkerError("SESSION_NOT_READY", "Login has not produced a validated credential")
    }
    return session.bundle
  }

  validate(bundle: Record<string, unknown>) {
    return this.driver.validateBundle(bundle)
  }

  async remove(workerSessionId: string): Promise<void> {
    const session = this.require(workerSessionId)
    this.forgetSession(workerSessionId, session)
    await this.closeSession(session)
  }

  async closeAll(): Promise<void> {
    const sessions = [...this.sessions.entries()]
    for (const [workerSessionId, session] of sessions) this.forgetSession(workerSessionId, session)
    await Promise.allSettled(sessions.map(([, session]) => this.closeSession(session)))
    await this.driver.close?.()
  }

  private require(id: string): ManagedSession {
    const session = this.sessions.get(id)
    if (!session) throw new DouyinWorkerError("SESSION_NOT_FOUND", "Login session does not exist")
    return session
  }

  private async active(id: string): Promise<ManagedSession> {
    const session = this.require(id)
    if (await this.expire(session)) throw new DouyinWorkerError("SESSION_EXPIRED", "Login session has expired")
    return session
  }

  private async expire(session: ManagedSession): Promise<boolean> {
    if ((this.options.now ?? Date.now)() <= session.expiresAt || session.status.status === "SUCCESS") return false
    session.status = { status: "EXPIRED", message: "Login session has expired" }
    await this.closeSession(session)
    return true
  }

  private settledStatus(id: string, session: ManagedSession): DouyinBrowserStatus | undefined {
    if (this.sessions.get(id) !== session) {
      throw new DouyinWorkerError("SESSION_NOT_FOUND", "Login session does not exist")
    }
    if (TERMINAL_STATUSES.has(session.status.status)) return session.status
    return undefined
  }

  private forgetSession(id: string, session: ManagedSession): void {
    if (this.sessions.get(id) === session) this.sessions.delete(id)
    if (session.cleanupTimer) clearTimeout(session.cleanupTimer)
    delete session.cleanupTimer
    delete session.bundle
  }

  private closeAfterTimeout(id: string, session: ManagedSession): void {
    void this.closeSession(session).catch(() => {
      process.stderr.write(`${JSON.stringify({
        event: "douyin.session.cleanup.failed",
        correlationId: id,
        code: "BROWSER_CONTEXT_CLOSE_FAILED"
      })}\n`)
    })
  }

  private async closeSession(session: ManagedSession): Promise<void> {
    if (session.closePromise) return session.closePromise
    session.closed = true
    if (session.expiryTimer) clearTimeout(session.expiryTimer)
    delete session.expiryTimer
    session.closePromise = Promise.resolve().then(() => session.handle?.close())
    return session.closePromise
  }
}
