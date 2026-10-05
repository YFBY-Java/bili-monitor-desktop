import { CoreApplicationError } from "./account-subject-service"

export interface RateLimitRequest {
  platformCode: string
  policyKey: string
  minIntervalMs: number
  signal: AbortSignal
  sleep?: (milliseconds: number) => Promise<void>
}

interface PendingPermit {
  request: RateLimitRequest
  key: string
  resolve: () => void
  reject: (error: unknown) => void
  cancelTimer?: () => void
}

export class LocalRateLimitBusyError extends CoreApplicationError {
  constructor() { super("LOCAL_RATE_LIMIT_BUSY", "本地采集等待队列已满，请稍后重试。", true) }
}

/** Shared acquisition lock; the caller's HTTP operation never runs inside this lock. */
export class LocalRequestRateLimiter {
  private readonly nextAllowedAt = new Map<string, number>()
  private readonly pending = new Set<PendingPermit>()
  private readonly abortListeners = new Map<AbortSignal, () => void>()
  private active: PendingPermit | undefined

  constructor(private readonly now: () => Date) {}

  acquire(request: RateLimitRequest): Promise<void> {
    if (request.signal.aborted) return Promise.reject(this.stopped())
    // Match the original early return: no lock and no deadline update.
    if (request.minIntervalMs <= 0) return Promise.resolve()
    if (this.pending.size >= 256) return Promise.reject(new LocalRateLimitBusyError())
    return new Promise<void>((resolve, reject) => {
      const permit: PendingPermit = { request, key: `${request.platformCode}:${request.policyKey}`,
        resolve, reject }
      this.pending.add(permit)
      if (!this.abortListeners.has(request.signal)) {
        const onAbort = () => {
          for (const item of [...this.pending]) {
            if (item.request.signal === request.signal) this.finish(item, this.stopped())
          }
        }
        this.abortListeners.set(request.signal, onAbort)
        request.signal.addEventListener("abort", onAbort, { once: true })
      }
      this.drain()
    })
  }

  private drain(): void {
    if (this.active) return
    const permit = this.pending.values().next().value
    if (!permit) return
    this.active = permit
    if (permit.request.signal.aborted) { this.finish(permit, this.stopped()); return }
    const now = this.now().getTime()
    const milliseconds = Math.max(0, (this.nextAllowedAt.get(permit.key) ?? now) - now)
    if (milliseconds === 0) this.grant(permit)
    else void this.wait(permit, milliseconds).then(() => this.grant(permit), error => this.finish(permit, error))
  }

  private grant(permit: PendingPermit): void {
    // A canceled injected sleep may settle after another consumer already owns the lock.
    if (this.active !== permit) return
    this.nextAllowedAt.set(permit.key, this.now().getTime() + permit.request.minIntervalMs)
    this.finish(permit)
  }

  private finish(permit: PendingPermit, error?: unknown): void {
    if (!this.pending.delete(permit)) return
    const signal = permit.request.signal
    if (![...this.pending].some(item => item.request.signal === signal)) {
      const listener = this.abortListeners.get(signal)
      if (listener) signal.removeEventListener("abort", listener)
      this.abortListeners.delete(signal)
    }
    permit.cancelTimer?.()
    if (this.active === permit) this.active = undefined
    if (error === undefined) permit.resolve()
    else permit.reject(error)
    this.drain()
  }

  private async wait(permit: PendingPermit, milliseconds: number): Promise<void> {
    if (permit.request.sleep) return permit.request.sleep(milliseconds)
    let remaining = milliseconds
    while (remaining > 0 && this.active === permit) {
      const segment = Math.min(remaining, 2_147_483_647)
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, segment)
        permit.cancelTimer = () => { clearTimeout(timer); resolve() }
      })
      delete permit.cancelTimer
      remaining -= segment
    }
  }

  private stopped(): CoreApplicationError {
    return new CoreApplicationError("CORE_STOPPED", "本地采集已停止。", false)
  }
}
