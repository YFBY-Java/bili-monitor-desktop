import {
  AddBilibiliFollowerMonitorInputSchema,
  BilibiliFollowerCollectResultSchema,
  BilibiliFollowerFetchedSnapshotSchema,
  BilibiliFollowerMonitorListSchema,
  BilibiliFollowerMonitorSchema,
  ListBilibiliFollowerMonitorsInputSchema,
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  UpdateBilibiliFollowerMonitorSettingsInputSchema,
  UpdateBilibiliFollowerMonitorStatusInputSchema,
  createRuntimeEnvelope,
  type AddBilibiliFollowerMonitorInput,
  type BilibiliFollowerFetchRequest,
  type BilibiliFollowerFetchedSnapshot,
  type BilibiliFollowerCollectResult,
  type BilibiliFollowerMonitor,
  type BilibiliFollowerMonitorList,
  type BilibiliFollowerTrend
} from "@bmd/contracts"
import {
  ControlDatabase,
  type NewStoredOutboxMessage,
  type StoredBilibiliFollowerMonitor,
  type StoredBilibiliFollowerSnapshot
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"

export interface BilibiliFollowerSource {
  fetchCard: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerFetchedSnapshot>
  fetchRelationStat: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerFetchedSnapshot>
  stop?: () => Promise<void>
}

export interface BilibiliFollowerMonitorServiceOptions {
  database: ControlDatabase
  source: BilibiliFollowerSource
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  requestMinIntervalMs?: number
  maxAttempts?: number
  retryBackoffMs?: number
  jitter?: () => number
  dueBatchSize?: number
}

export class BilibiliFollowerMonitorService {
  private readonly nextRequestAt = new Map<string, number>()

  constructor(private readonly options: BilibiliFollowerMonitorServiceOptions) {}

  async resolveDisplayName(mid: string): Promise<string | undefined> {
    if (!/^[1-9]\d*$/.test(mid)) return undefined
    const snapshot = await this.fetchCardWithRetry(mid, this.options.idFactory())
    const nickname = snapshot.nickname?.trim()
    return nickname || undefined
  }

  async addUser(input: AddBilibiliFollowerMonitorInput): Promise<BilibiliFollowerMonitor> {
    const parsed = AddBilibiliFollowerMonitorInputSchema.parse(input)
    const intervalSeconds = parsed.intervalSeconds ?? 3600
    const proposedMonitorId = this.options.idFactory()
    const taskId = this.options.idFactory()
    let snapshot: BilibiliFollowerFetchedSnapshot
    try {
      snapshot = await this.fetchCardWithRetry(parsed.mid, taskId)
    } catch (error) {
      throw this.applicationError(error)
    }
    // Another add may have completed while the remote card was being fetched.
    const existing = this.options.database.findBilibiliFollowerMonitorByMid(parsed.mid)
    const monitorId = existing?.monitorId ?? proposedMonitorId
    const snapshotId = this.options.idFactory()
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(snapshot.fetchedAt).getTime() + intervalSeconds * 1_000
    ).toISOString()

    this.options.database.upsertBilibiliFollowerMonitorSnapshot({
      monitor: {
        monitorId,
        mid: snapshot.mid,
        nickname: snapshot.nickname ?? existing?.nickname ?? `Bilibili UID ${snapshot.mid}`,
        avatarUrl: snapshot.avatarUrl ?? existing?.avatarUrl ?? null,
        profileUrl: snapshot.profileUrl,
        followerCount: snapshot.followerCount,
        followingCount: snapshot.followingCount ?? null,
        intervalSeconds,
        nextCollectAt,
        capturedAt: snapshot.fetchedAt,
        sourceEndpoint: snapshot.sourceEndpoint
      },
      snapshot: {
        snapshotId,
        capturedBucket: this.capturedBucket(snapshot.fetchedAt)
      },
      artifact: {
        ...snapshot.evidenceObject,
        createdAt: snapshot.fetchedAt
      },
      outbox: this.outbox(eventId, "bilibili.follower.snapshot-collected", snapshot.fetchedAt, {
        monitorId,
        mid: snapshot.mid,
        followerCount: snapshot.followerCount,
        sourceEndpoint: snapshot.sourceEndpoint
      })
    })
    return this.requireUser(monitorId)
  }

  listUsers(input?: { limit?: number }): BilibiliFollowerMonitorList {
    const query = ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {})
    const items = this.options.database
      .listBilibiliFollowerMonitors(query.limit)
      .map((monitor) => this.toUserView(
        monitor,
        this.options.database.findBilibiliFollowerSnapshots(monitor.monitorId, { limit: 30 })
      ))
    return BilibiliFollowerMonitorListSchema.parse({
      items,
      total: items.length,
      snapshotAt: this.options.now().toISOString()
    })
  }

  updateStatus(userId: string, enabled: boolean): BilibiliFollowerMonitor {
    const parsed = UpdateBilibiliFollowerMonitorStatusInputSchema.parse({ userId, enabled })
    this.requireStoredUser(parsed.userId)
    const timestamp = this.options.now().toISOString()
    const eventId = this.options.idFactory()
    this.options.database.updateBilibiliFollowerMonitorStatus(
      parsed.userId,
      parsed.enabled,
      timestamp,
      this.outbox(eventId, "bilibili.follower.monitor-status-updated", timestamp, {
        userId: parsed.userId,
        enabled: parsed.enabled
      })
    )
    return this.requireUser(parsed.userId)
  }

  updateInterval(userId: string, intervalSeconds: number): BilibiliFollowerMonitor {
    const parsed = UpdateBilibiliFollowerMonitorSettingsInputSchema.parse({ userId, intervalSeconds })
    this.requireStoredUser(parsed.userId)
    const timestamp = this.options.now().toISOString()
    const nextCollectAt = new Date(
      this.options.now().getTime() + parsed.intervalSeconds * 1_000
    ).toISOString()
    const eventId = this.options.idFactory()
    this.options.database.updateBilibiliFollowerMonitorInterval(
      parsed.userId,
      parsed.intervalSeconds,
      nextCollectAt,
      timestamp,
      this.outbox(eventId, "bilibili.follower.monitor-settings-updated", timestamp, {
        userId: parsed.userId,
        intervalSeconds: parsed.intervalSeconds
      })
    )
    return this.requireUser(parsed.userId)
  }

  async refreshNow(userId: string): Promise<BilibiliFollowerCollectResult> {
    const user = this.requireStoredUser(userId)
    const taskId = this.options.idFactory()
    let snapshot: BilibiliFollowerFetchedSnapshot
    try {
      snapshot = await this.fetchForExistingUser(user, taskId)
    } catch (error) {
      this.markFailure(user, error)
      throw this.applicationError(error)
    }
    this.persistSnapshot(user, snapshot, taskId)
    return BilibiliFollowerCollectResultSchema.parse({
      userId: user.monitorId,
      mid: user.mid,
      success: true,
      followerCount: snapshot.followerCount,
      capturedAt: snapshot.fetchedAt,
      sourceEndpoint: snapshot.sourceEndpoint,
      message: "ok"
    })
  }

  async collectDueUsers(): Promise<BilibiliFollowerCollectResult[]> {
    const users = this.options.database.findDueBilibiliFollowerMonitors(
      this.options.now().toISOString(),
      Math.max(1, this.options.dueBatchSize ?? 10)
    )
    const results: BilibiliFollowerCollectResult[] = []
    for (const user of users) {
      const taskId = this.options.idFactory()
      try {
        const snapshot = await this.fetchForExistingUser(user, taskId)
        this.persistSnapshot(user, snapshot, taskId)
        results.push(BilibiliFollowerCollectResultSchema.parse({
          userId: user.monitorId,
          mid: user.mid,
          success: true,
          followerCount: snapshot.followerCount,
          capturedAt: snapshot.fetchedAt,
          sourceEndpoint: snapshot.sourceEndpoint,
          message: "ok"
        }))
      } catch (error) {
        this.markFailure(user, error)
        const details = this.sourceError(error)
        results.push(BilibiliFollowerCollectResultSchema.parse({
          userId: user.monitorId,
          mid: user.mid,
          success: false,
          ...(user.currentFollowerCount !== null ? { followerCount: user.currentFollowerCount } : {}),
          capturedAt: this.options.now().toISOString(),
          message: details.message
        }))
      }
    }
    return results
  }

  async stop(): Promise<void> {
    await this.options.source.stop?.()
  }

  deleteUser(userId: string): void {
    const user = this.requireStoredUser(userId)
    const timestamp = this.options.now().toISOString()
    const eventId = this.options.idFactory()
    this.options.database.deleteBilibiliFollowerMonitor(
      user.monitorId,
      this.outbox(eventId, "bilibili.follower.monitor-deleted", timestamp, {
        userId: user.monitorId,
        mid: user.mid,
        cascades: ["bilibili_follower_snapshot"]
      })
    )
  }

  trend(
    userId: string,
    input: { from?: string; to?: string; limit?: number } = {}
  ): BilibiliFollowerTrend {
    const query = QueryBilibiliFollowerTrendInputSchema.parse({ userId, ...input })
    const user = this.requireStoredUser(query.userId)
    const snapshots = this.options.database.findBilibiliFollowerSnapshots(user.monitorId, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limit
    })
    return {
      user: this.toUserView(user, snapshots),
      points: snapshots.map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        followerCount: snapshot.followerCount,
        ...(snapshot.followingCount !== null ? { followingCount: snapshot.followingCount } : {}),
        sourceEndpoint: snapshot.sourceEndpoint
      }))
    }
  }

  trends(input: {
    userIds?: string[]
    from?: string
    to?: string
    limitPerUser?: number
  } = {}): BilibiliFollowerTrend[] {
    const query = QueryBilibiliFollowerTrendsInputSchema.parse(input)
    const users = query.userIds.length === 0
      ? this.options.database.listBilibiliFollowerMonitors(100)
      : query.userIds.map((userId) => this.requireStoredUser(userId))
    return users.map((user) => this.trend(user.monitorId, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limitPerUser
    }))
  }

  private requireUser(monitorId: string): BilibiliFollowerMonitor {
    const monitor = this.requireStoredUser(monitorId)
    return this.toUserView(
      monitor,
      this.options.database.findBilibiliFollowerSnapshots(monitor.monitorId, { limit: 30 })
    )
  }

  private requireStoredUser(monitorId: string): StoredBilibiliFollowerMonitor {
    const monitor = this.options.database.findBilibiliFollowerMonitorById(monitorId)
    if (!monitor) throw new CoreApplicationError("NOT_FOUND", `监控用户不存在：${monitorId}`, false)
    return monitor
  }

  private persistSnapshot(
    user: StoredBilibiliFollowerMonitor,
    snapshot: BilibiliFollowerFetchedSnapshot,
    taskId: string
  ): void {
    // Honor pause/interval/delete operations that occurred during the network request.
    const current = this.requireStoredUser(user.monitorId)
    const snapshotId = this.options.idFactory()
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(snapshot.fetchedAt).getTime() + current.intervalSeconds * 1_000
    ).toISOString()
    this.options.database.upsertBilibiliFollowerMonitorSnapshot({
      mode: "collect",
      monitor: {
        monitorId: user.monitorId,
        mid: snapshot.mid,
        nickname: snapshot.nickname ?? current.nickname,
        avatarUrl: snapshot.avatarUrl ?? current.avatarUrl,
        profileUrl: snapshot.profileUrl,
        followerCount: snapshot.followerCount,
        followingCount: snapshot.followingCount ?? null,
        intervalSeconds: current.intervalSeconds,
        nextCollectAt,
        capturedAt: snapshot.fetchedAt,
        sourceEndpoint: snapshot.sourceEndpoint
      },
      snapshot: {
        snapshotId,
        capturedBucket: this.capturedBucket(snapshot.fetchedAt)
      },
      artifact: {
        ...snapshot.evidenceObject,
        createdAt: snapshot.fetchedAt
      },
      outbox: this.outbox(eventId, "bilibili.follower.snapshot-collected", snapshot.fetchedAt, {
        monitorId: user.monitorId,
        taskId,
        mid: snapshot.mid,
        followerCount: snapshot.followerCount,
        sourceEndpoint: snapshot.sourceEndpoint
      })
    })
  }

  private async fetchForExistingUser(
    user: StoredBilibiliFollowerMonitor,
    taskId: string
  ): Promise<BilibiliFollowerFetchedSnapshot> {
    try {
      return await this.fetchCardWithRetry(user.mid, taskId)
    } catch (error) {
      const details = this.sourceError(error)
      if (!["BILIBILI_PARSE_ERROR", "BILIBILI_NETWORK_ERROR", "BILIBILI_SERVER_ERROR"].includes(details.code)) {
        throw error
      }
      return this.fetchWithRetry(
        "x/relation/stat",
        user.mid,
        taskId,
        (request) => this.options.source.fetchRelationStat(request)
      )
    }
  }

  private fetchCardWithRetry(mid: string, taskId: string): Promise<BilibiliFollowerFetchedSnapshot> {
    return this.fetchWithRetry(
      "x/web-interface/card",
      mid,
      taskId,
      (request) => this.options.source.fetchCard(request)
    )
  }

  private async fetchWithRetry(
    endpoint: string,
    mid: string,
    taskId: string,
    operation: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerFetchedSnapshot>
  ): Promise<BilibiliFollowerFetchedSnapshot> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.acquireRateLimit(endpoint)
      const startedAt = performance.now()
      try {
        const snapshot = await operation({
          taskId,
          attempt,
          leaseId: this.options.idFactory(),
          mid
        })
        const parsed = BilibiliFollowerFetchedSnapshotSchema.parse(snapshot)
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: endpoint,
          mid,
          statusCode: parsed.statusCode,
          durationMs: parsed.durationMs,
          errorType: null,
          retryable: false,
          evidenceObjectId: parsed.evidenceObject.objectId,
          createdAt: parsed.fetchedAt
        }, {
          ...parsed.evidenceObject,
          createdAt: parsed.fetchedAt
        })
        return parsed
      } catch (error) {
        lastError = error
        const details = this.sourceError(error)
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: endpoint,
          mid,
          statusCode: this.errorNumber(error, "statusCode"),
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          errorType: details.code,
          retryable: details.retryable,
          evidenceObjectId: null,
          createdAt: this.options.now().toISOString()
        })
        if (!details.retryable || attempt >= maxAttempts) break
        const backoff = Math.max(0, this.options.retryBackoffMs ?? 1_500)
          * (2 ** Math.min(attempt - 1, 4))
        const jitter = Math.floor((this.options.jitter?.() ?? Math.random()) * 300)
        await (this.options.sleep ?? delay)(backoff + jitter)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private async acquireRateLimit(endpoint: string): Promise<void> {
    const minimum = Math.max(0, this.options.requestMinIntervalMs ?? 1_500)
    const now = this.options.now().getTime()
    const allowedAt = Math.max(now, this.nextRequestAt.get(endpoint) ?? now)
    // Reserve before awaiting, so simultaneous callers cannot share the same slot.
    this.nextRequestAt.set(endpoint, allowedAt + minimum)
    if (allowedAt > now) {
      await (this.options.sleep ?? delay)(allowedAt - now)
    }
  }

  private markFailure(user: StoredBilibiliFollowerMonitor, error: unknown): void {
    const details = this.sourceError(error)
    const errorAt = this.options.now().toISOString()
    const backoffSeconds = Math.max(300, Math.min(user.intervalSeconds, 900))
    const nextCollectAt = new Date(
      this.options.now().getTime() + backoffSeconds * 1_000
    ).toISOString()
    const eventId = this.options.idFactory()
    this.options.database.markBilibiliFollowerMonitorFailure({
      monitorId: user.monitorId,
      nextCollectAt,
      errorAt,
      errorType: details.code,
      errorMessage: details.message,
      outbox: this.outbox(eventId, "bilibili.follower.collection-failed", errorAt, {
        userId: user.monitorId,
        mid: user.mid,
        errorType: details.code,
        retryable: details.retryable,
        nextCollectAt
      })
    })
  }

  private applicationError(error: unknown): CoreApplicationError {
    const details = this.sourceError(error)
    return new CoreApplicationError(details.code, details.message, details.retryable)
  }

  private sourceError(error: unknown): { code: string; message: string; retryable: boolean } {
    if (typeof error !== "object" || error === null) {
      return { code: "BILIBILI_UNKNOWN_ERROR", message: String(error), retryable: false }
    }
    const code = "code" in error && typeof error.code === "string"
      ? error.code
      : "BILIBILI_UNKNOWN_ERROR"
    const retryable = "retryable" in error && typeof error.retryable === "boolean"
      ? error.retryable
      : false
    const message = error instanceof Error ? error.message : String(error)
    return { code, message, retryable }
  }

  private errorNumber(error: unknown, property: string): number | null {
    if (typeof error !== "object" || error === null || !(property in error)) return null
    const value = (error as Record<string, unknown>)[property]
    return typeof value === "number" && Number.isFinite(value) ? value : null
  }

  private toUserView(
    monitor: StoredBilibiliFollowerMonitor,
    snapshots: StoredBilibiliFollowerSnapshot[]
  ): BilibiliFollowerMonitor {
    const previous = snapshots.length < 2 ? undefined : snapshots.at(-2)?.followerCount
    const current = monitor.currentFollowerCount ?? undefined
    const delta = previous === undefined || current === undefined ? undefined : current - previous
    const growthRate = previous === undefined || previous === 0 || delta === undefined
      ? undefined
      : delta / previous
    return BilibiliFollowerMonitorSchema.parse({
      id: monitor.monitorId,
      mid: monitor.mid,
      nickname: monitor.nickname,
      ...(monitor.avatarUrl ? { avatarUrl: monitor.avatarUrl } : {}),
      profileUrl: monitor.profileUrl,
      ...(current !== undefined ? { currentFollowerCount: current } : {}),
      ...(monitor.followingCount !== null ? { followingCount: monitor.followingCount } : {}),
      ...(delta !== undefined ? { deltaSincePrevious: delta } : {}),
      ...(growthRate !== undefined ? { growthRateSincePrevious: growthRate } : {}),
      ...(monitor.lastSnapshotAt ? { lastSnapshotAt: monitor.lastSnapshotAt } : {}),
      ...(monitor.lastSuccessAt ? { lastSuccessAt: monitor.lastSuccessAt } : {}),
      ...(monitor.nextCollectAt ? { nextCollectAt: monitor.nextCollectAt } : {}),
      monitorStatus: monitor.monitorStatus,
      intervalSeconds: monitor.intervalSeconds,
      ...(monitor.lastErrorType ? { lastErrorType: monitor.lastErrorType } : {}),
      ...(monitor.lastErrorMessage ? { lastErrorMessage: monitor.lastErrorMessage } : {}),
      ...(monitor.lastErrorAt ? { lastErrorAt: monitor.lastErrorAt } : {}),
      ...(monitor.sourceEndpoint ? { sourceEndpoint: monitor.sourceEndpoint } : {}),
      recentTrend: snapshots.map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        followerCount: snapshot.followerCount,
        ...(snapshot.followingCount !== null ? { followingCount: snapshot.followingCount } : {}),
        sourceEndpoint: snapshot.sourceEndpoint
      })),
      version: monitor.version
    })
  }

  private capturedBucket(value: string): string {
    const timestamp = new Date(value)
    timestamp.setUTCMilliseconds(0)
    return timestamp.toISOString()
  }

  private outbox(
    eventId: string,
    type: string,
    timestamp: string,
    payload: Record<string, unknown>
  ): NewStoredOutboxMessage {
    return {
      messageId: eventId,
      topic: type,
      envelopeJson: JSON.stringify(createRuntimeEnvelope({
        id: eventId,
        type,
        timestamp,
        correlationId: eventId,
        traceId: eventId,
        payload
      })),
      createdAt: timestamp
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
