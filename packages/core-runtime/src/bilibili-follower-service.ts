import {
  AddBilibiliFollowerMonitorInputSchema,
  AddBilibiliFollowerMonitorInputV2Schema,
  BilibiliFollowerCollectResultV2Schema,
  BilibiliFollowerFetchedSnapshotV2Schema,
  BilibiliFollowerMonitorListV2Schema,
  BilibiliFollowerMonitorV2Schema,
  BilibiliFollowerTrendV2Schema,
  PositiveJavaLongStringSchema,
  ListBilibiliFollowerMonitorsInputSchema,
  QueryBilibiliFollowerTrendInputSchema,
  QueryBilibiliFollowerTrendsInputSchema,
  UpdateBilibiliFollowerMonitorSettingsInputSchema,
  UpdateBilibiliFollowerMonitorStatusInputSchema,
  createRuntimeEnvelope,
  followerCollectResultToV1,
  followerMonitorListToV1,
  followerMonitorToV1,
  followerTrendToV1,
  javaLongDelta,
  javaLongToBigInt,
  type AddBilibiliFollowerMonitorInput,
  type AddBilibiliFollowerMonitorInputV2,
  type BilibiliFollowerFetchRequest,
  type BilibiliFollowerFetchRequestV2,
  type BilibiliFollowerFetchedSnapshot,
  type BilibiliFollowerFetchedSnapshotV2,
  type BilibiliFollowerCollectResult,
  type BilibiliFollowerCollectResultV2,
  type BilibiliFollowerMonitor,
  type BilibiliFollowerMonitorV2,
  type BilibiliFollowerMonitorList,
  type BilibiliFollowerMonitorListV2,
  type BilibiliFollowerProfile,
  type BilibiliFollowerTrend,
  type BilibiliFollowerTrendV2
} from "@bmd/contracts"
import {
  ControlDatabase,
  type NewStoredOutboxMessage,
  type StoredBilibiliFollowerMonitor,
  type StoredBilibiliFollowerSnapshot
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import { LocalRequestRateLimiter } from "./local-request-rate-limiter"

export interface BilibiliFollowerSource {
  /** Optional read-only profile capability; must not persist evidence or monitoring state. */
  fetchProfile?: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerProfile>
  /** Explicit platform purpose uses its signed request; monitoring stays positive-only. */
  fetchCard: (request: BilibiliFollowerFetchRequestV2, purpose?: "platform-account") => Promise<BilibiliFollowerFetchedSnapshot | BilibiliFollowerFetchedSnapshotV2>
  fetchRelationStat: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerFetchedSnapshot | BilibiliFollowerFetchedSnapshotV2>
  stop?: () => Promise<void>
}

export interface BilibiliFollowerMonitorServiceOptions {
  database: ControlDatabase
  source: BilibiliFollowerSource
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  rateLimiter?: LocalRequestRateLimiter
  requestMinIntervalMs?: number
  maxAttempts?: number
  retryBackoffMs?: number
  jitter?: () => number
  dueBatchSize?: number
  enabled?: boolean
  defaultIntervalSeconds?: number
  minIntervalSeconds?: number
  maxIntervalSeconds?: number
  shortIntervalWarningSeconds?: number
  failureBackoffSeconds?: number
}

export interface PreparedBilibiliFollowerMonitor {
  mid: string
  commit: () => BilibiliFollowerMonitorV2
}

// Only errors crossing the Source boundary are platform collection failures.
class FollowerFetchFailure extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean,
    readonly endpoint: string) { super(message) }
}

export class BilibiliFollowerMonitorService {
  private readonly rateLimiter: LocalRequestRateLimiter
  private readonly lifetime = new AbortController()
  private stopPromise: Promise<void> | undefined

  constructor(private readonly options: BilibiliFollowerMonitorServiceOptions) {
    this.rateLimiter = options.rateLimiter ?? new LocalRequestRateLimiter(options.now)
  }

  // Legacy numeric projections happen after exact business operations finish.
  // Projection errors must never become platform collection failures.
  async addUser(input: AddBilibiliFollowerMonitorInput): Promise<BilibiliFollowerMonitor> {
    return followerMonitorToV1(await this.addUserV2(AddBilibiliFollowerMonitorInputSchema.parse(input)))
  }

  listUsers(input?: { limit?: number }): BilibiliFollowerMonitorList {
    return followerMonitorListToV1(this.listUsersV2(input))
  }

  updateStatus(userId: string, enabled: boolean): BilibiliFollowerMonitor {
    return followerMonitorToV1(this.updateStatusV2(userId, enabled))
  }

  updateInterval(userId: string, intervalSeconds: number): BilibiliFollowerMonitor {
    return followerMonitorToV1(this.updateIntervalV2(userId, intervalSeconds))
  }

  async refreshNow(userId: string): Promise<BilibiliFollowerCollectResult> {
    return followerCollectResultToV1(await this.refreshNowV2(userId))
  }

  async collectDueUsers(): Promise<BilibiliFollowerCollectResult[]> {
    return (await this.collectDueUsersV2()).map(followerCollectResultToV1)
  }

  trend(userId: string, input: { from?: string; to?: string; limit?: number } = {}): BilibiliFollowerTrend {
    return followerTrendToV1(this.trendV2(userId, input))
  }

  trends(input: { userIds?: string[]; from?: string; to?: string; limitPerUser?: number } = {}): BilibiliFollowerTrend[] {
    return this.trendsV2(input).map(followerTrendToV1)
  }

  async resolveDisplayName(mid: string): Promise<string | undefined> {
    this.ensureRunning()
    if (!PositiveJavaLongStringSchema.safeParse(mid).success) return undefined
    let snapshot: BilibiliFollowerFetchedSnapshotV2
    try {
      snapshot = await this.fetchCardWithRetry(mid, this.options.idFactory())
    } catch (error) {
      this.ensureRunning()
      throw error
    }
    this.ensureRunning()
    return snapshot.nickname
  }

  async addUserV2(input: AddBilibiliFollowerMonitorInputV2): Promise<BilibiliFollowerMonitorV2> {
    return (await this.prepareAddUserV2(input)).commit()
  }

  /** Fetch outside SQLite; the caller can commit this together with a subject. */
  async prepareAddUserV2(input: AddBilibiliFollowerMonitorInputV2): Promise<PreparedBilibiliFollowerMonitor> {
    this.ensureRunning()
    const parsed = AddBilibiliFollowerMonitorInputV2Schema.parse(input)
    const intervalSeconds = this.resolveInterval(parsed.intervalSeconds)
    const proposedMonitorId = this.options.idFactory()
    const taskId = this.options.idFactory()
    let snapshot: BilibiliFollowerFetchedSnapshotV2
    try {
      snapshot = await this.fetchCardWithRetry(parsed.mid, taskId)
    } catch (error) {
      this.ensureRunning()
      if (!(error instanceof FollowerFetchFailure)) throw error
      throw this.applicationError(error)
    }
    this.ensureRunning()
    return {
      mid: snapshot.mid,
      commit: () => this.addFetchedUser(snapshot, intervalSeconds, proposedMonitorId)
    }
  }

  private addFetchedUser(
    snapshot: BilibiliFollowerFetchedSnapshotV2,
    intervalSeconds: number,
    proposedMonitorId: string
  ): BilibiliFollowerMonitorV2 {
    this.ensureRunning()
    // Another add may have completed while the remote card was being fetched.
    const existing = this.options.database.findBilibiliFollowerMonitorByMid(snapshot.mid)
    const monitorId = existing?.monitorId ?? proposedMonitorId
    const snapshotId = this.options.idFactory()
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(snapshot.fetchedAt).getTime() + intervalSeconds * 1_000
    ).toISOString()

    this.options.database.upsertBilibiliFollowerMonitorSnapshotInOriginalOrder({
      monitor: {
        monitorId,
        mid: snapshot.mid,
        nickname: snapshot.nickname ?? existing?.nickname ?? `Bilibili UID ${snapshot.mid}`,
        avatarUrl: snapshot.avatarUrl ?? null,
        profileUrl: snapshot.profileUrl,
        followerCount: javaLongToBigInt(snapshot.followerCount),
        followingCount: snapshot.followingCount === undefined ? null : javaLongToBigInt(snapshot.followingCount),
        intervalSeconds,
        nextCollectAt,
        capturedAt: snapshot.fetchedAt,
        sourceEndpoint: snapshot.sourceEndpoint
      },
      snapshot: {
        snapshotId,
        capturedBucket: this.capturedBucket(snapshot.fetchedAt),
        ...(snapshot.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: snapshot.rawPayloadStorageStatus } : {})
      },
      artifact: {
        ...snapshot.evidenceObject,
        createdAt: snapshot.fetchedAt
      },
      outbox: this.outbox(eventId, "bilibili.follower.snapshot-collected.v2", snapshot.fetchedAt, {
        monitorId,
        mid: snapshot.mid,
        followerCount: snapshot.followerCount,
        ...(snapshot.followingCount !== undefined ? { followingCount: snapshot.followingCount } : {}),
        sourceEndpoint: snapshot.sourceEndpoint
      })
    }, this.outbox(this.options.idFactory(), "bilibili.follower.monitor-refreshed.v2", snapshot.fetchedAt, {
      monitorId, mid: snapshot.mid, followerCount: snapshot.followerCount,
      sourceEndpoint: snapshot.sourceEndpoint
    }))
    return this.requireUserV2(monitorId)
  }

  listUsersV2(input?: { limit?: number }): BilibiliFollowerMonitorListV2 {
    const query = ListBilibiliFollowerMonitorsInputSchema.parse(input ?? {})
    const items = this.options.database
      .listBilibiliFollowerMonitors(query.limit)
      .map((monitor) => this.toUserViewV2(
        monitor,
        this.options.database.findBilibiliFollowerSnapshots(monitor.monitorId, { limit: 30 })
      ))
    return BilibiliFollowerMonitorListV2Schema.parse({
      items,
      total: items.length,
      snapshotAt: this.options.now().toISOString()
    })
  }

  updateStatusV2(userId: string, enabled: boolean): BilibiliFollowerMonitorV2 {
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
    return this.requireUserV2(parsed.userId)
  }

  updateIntervalV2(userId: string, intervalSeconds: number): BilibiliFollowerMonitorV2 {
    const parsed = UpdateBilibiliFollowerMonitorSettingsInputSchema.parse({ userId, intervalSeconds })
    this.requireStoredUser(parsed.userId)
    const resolvedInterval = this.resolveInterval(parsed.intervalSeconds)
    const timestamp = this.options.now().toISOString()
    const nextCollectAt = new Date(
      this.options.now().getTime() + resolvedInterval * 1_000
    ).toISOString()
    const eventId = this.options.idFactory()
    this.options.database.updateBilibiliFollowerMonitorInterval(
      parsed.userId,
      resolvedInterval,
      nextCollectAt,
      timestamp,
      this.outbox(eventId, "bilibili.follower.monitor-settings-updated", timestamp, {
        userId: parsed.userId,
        intervalSeconds: resolvedInterval
      })
    )
    return this.requireUserV2(parsed.userId)
  }

  async refreshNowV2(userId: string): Promise<BilibiliFollowerCollectResultV2> {
    this.ensureRunning()
    const user = this.requireStoredUser(userId)
    const taskId = this.options.idFactory()
    let snapshot: BilibiliFollowerFetchedSnapshotV2
    try {
      snapshot = await this.fetchForExistingUser(user, taskId)
    } catch (error) {
      this.ensureRunning()
      if (!(error instanceof FollowerFetchFailure)) throw error
      this.markFailure(user, error)
      throw this.applicationError(error)
    }
    this.ensureRunning()
    this.persistSnapshot(user, snapshot, taskId)
    return BilibiliFollowerCollectResultV2Schema.parse({
      userId: user.monitorId,
      mid: user.mid,
      success: true,
      followerCount: snapshot.followerCount,
      capturedAt: snapshot.fetchedAt,
      sourceEndpoint: snapshot.sourceEndpoint,
      message: "ok"
    })
  }

  async collectDueUsersV2(): Promise<BilibiliFollowerCollectResultV2[]> {
    if (this.lifetime.signal.aborted || this.options.enabled === false) return []
    const users = this.options.database.findDueBilibiliFollowerMonitors(
      this.options.now().toISOString(),
      Math.max(1, this.options.dueBatchSize ?? 10)
    )
    const results: BilibiliFollowerCollectResultV2[] = []
    for (const user of users) {
      if (this.lifetime.signal.aborted) break
      const taskId = this.options.idFactory()
      try {
        const snapshot = await this.fetchForExistingUser(user, taskId)
        this.ensureRunning()
        this.persistSnapshot(user, snapshot, taskId)
        results.push(BilibiliFollowerCollectResultV2Schema.parse({
          userId: user.monitorId,
          mid: user.mid,
          success: true,
          followerCount: snapshot.followerCount,
          capturedAt: snapshot.fetchedAt,
          sourceEndpoint: snapshot.sourceEndpoint,
          message: "ok"
        }))
      } catch (error) {
        // Local shutdown is not a platform failure and must not alter the next due time.
        if (this.lifetime.signal.aborted) break
        if (!(error instanceof FollowerFetchFailure)) throw error
        this.markFailure(user, error)
        const details = this.sourceError(error)
        results.push(BilibiliFollowerCollectResultV2Schema.parse({
          userId: user.monitorId,
          mid: user.mid,
          success: false,
          ...(user.currentFollowerCount !== null ? { followerCount: user.currentFollowerCount.toString() } : {}),
          capturedAt: this.options.now().toISOString(),
          ...(typeof error === "object" && error !== null && "endpoint" in error && typeof error.endpoint === "string"
            ? { sourceEndpoint: error.endpoint } : {}),
          message: details.message
        }))
      }
    }
    return results
  }

  stop(): Promise<void> {
    if (!this.stopPromise) {
      this.lifetime.abort()
      this.stopPromise = Promise.resolve().then(() => this.options.source.stop?.())
    }
    return this.stopPromise
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

  trendV2(
    userId: string,
    input: { from?: string; to?: string; limit?: number } = {}
  ): BilibiliFollowerTrendV2 {
    const query = QueryBilibiliFollowerTrendInputSchema.parse({ userId, ...input })
    const user = this.requireStoredUser(query.userId)
    const snapshots = this.options.database.findBilibiliFollowerSnapshots(user.monitorId, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limit
    })
    return BilibiliFollowerTrendV2Schema.parse({
      user: this.toUserViewV2(user, snapshots),
      points: snapshots.map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        followerCount: snapshot.followerCount.toString(),
        ...(snapshot.followingCount !== null ? { followingCount: snapshot.followingCount.toString() } : {}),
        sourceEndpoint: snapshot.sourceEndpoint
      }))
    })
  }

  trendsV2(input: {
    userIds?: string[]
    from?: string
    to?: string
    limitPerUser?: number
  } = {}): BilibiliFollowerTrendV2[] {
    const query = QueryBilibiliFollowerTrendsInputSchema.parse(input)
    const users = query.userIds.length === 0
      ? this.options.database.listBilibiliFollowerMonitors()
      : query.userIds.map((userId) => this.requireStoredUser(userId))
    return users.map((user) => this.trendV2(user.monitorId, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limitPerUser
    }))
  }

  private requireUserV2(monitorId: string): BilibiliFollowerMonitorV2 {
    const monitor = this.requireStoredUser(monitorId)
    return this.toUserViewV2(
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
    snapshot: BilibiliFollowerFetchedSnapshotV2,
    taskId: string
  ): void {
    // Original collectUser uses its request-start user for timing and fallback profile.
    // The collect-only SQL keeps later settings/status and rejects a deleted row.
    const snapshotId = this.options.idFactory()
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(snapshot.fetchedAt).getTime() + user.intervalSeconds * 1_000
    ).toISOString()
    this.options.database.upsertBilibiliFollowerMonitorSnapshotInOriginalOrder({
      mode: "collect",
      monitor: {
        monitorId: user.monitorId,
        mid: snapshot.mid,
        nickname: snapshot.sourceEndpoint === "x/relation/stat" ? user.nickname : snapshot.nickname ?? user.nickname,
        avatarUrl: snapshot.sourceEndpoint === "x/relation/stat" ? user.avatarUrl : snapshot.avatarUrl ?? null,
        profileUrl: snapshot.sourceEndpoint === "x/relation/stat" ? user.profileUrl : snapshot.profileUrl,
        followerCount: javaLongToBigInt(snapshot.followerCount),
        followingCount: snapshot.followingCount === undefined ? null : javaLongToBigInt(snapshot.followingCount),
        intervalSeconds: user.intervalSeconds,
        nextCollectAt,
        capturedAt: snapshot.fetchedAt,
        sourceEndpoint: snapshot.sourceEndpoint
      },
      snapshot: {
        snapshotId,
        capturedBucket: this.capturedBucket(snapshot.fetchedAt),
        ...(snapshot.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: snapshot.rawPayloadStorageStatus } : {})
      },
      artifact: {
        ...snapshot.evidenceObject,
        createdAt: snapshot.fetchedAt
      },
      outbox: this.outbox(eventId, "bilibili.follower.snapshot-collected.v2", snapshot.fetchedAt, {
        monitorId: user.monitorId,
        taskId,
        mid: snapshot.mid,
        followerCount: snapshot.followerCount,
        ...(snapshot.followingCount !== undefined ? { followingCount: snapshot.followingCount } : {}),
        sourceEndpoint: snapshot.sourceEndpoint
      })
    }, this.outbox(this.options.idFactory(), "bilibili.follower.monitor-refreshed.v2", snapshot.fetchedAt, {
      monitorId: user.monitorId, mid: user.mid, followerCount: snapshot.followerCount,
      sourceEndpoint: snapshot.sourceEndpoint
    }))
  }

  private async fetchForExistingUser(
    user: StoredBilibiliFollowerMonitor,
    taskId: string
  ): Promise<BilibiliFollowerFetchedSnapshotV2> {
    try {
      return await this.fetchCardWithRetry(user.mid, taskId)
    } catch (error) {
      this.ensureRunning()
      if (!(error instanceof FollowerFetchFailure)) throw error
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

  private fetchCardWithRetry(mid: string, taskId: string): Promise<BilibiliFollowerFetchedSnapshotV2> {
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
    operation: (request: BilibiliFollowerFetchRequest) => Promise<BilibiliFollowerFetchedSnapshot | BilibiliFollowerFetchedSnapshotV2>
  ): Promise<BilibiliFollowerFetchedSnapshotV2> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
    let lastError: FollowerFetchFailure | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.ensureRunning()
      const startedAt = performance.now()
      await this.acquireRateLimit(endpoint)
      this.ensureRunning()
      let parsed: BilibiliFollowerFetchedSnapshotV2
      try {
        const snapshot = await operation({
          taskId,
          attempt,
          leaseId: this.options.idFactory(),
          mid
        })
        this.ensureRunning()
        parsed = BilibiliFollowerFetchedSnapshotV2Schema.parse({
          ...snapshot,
          mid: javaLongToBigInt(snapshot.mid).toString(),
          followerCount: javaLongToBigInt(snapshot.followerCount).toString(),
          ...(snapshot.followingCount !== undefined ? { followingCount: javaLongToBigInt(snapshot.followingCount).toString() } : {})
        })
      } catch (error) {
        this.ensureRunning()
        const details = this.sourceError(error)
        // Original InvalidMediaTypeException escapes all fetch-error handlers:
        // no API failure log, fallback, backoff or monitor/history mutation.
        if (details.code === "BILIBILI_RESPONSE_CONVERSION_ERROR") {
          throw new CoreApplicationError("INTERNAL_ERROR", details.message, false)
        }
        lastError = new FollowerFetchFailure(details.code, details.message, details.retryable,
          typeof error === "object" && error !== null && "endpoint" in error && typeof error.endpoint === "string"
            ? error.endpoint : endpoint)
        const biliCode = this.errorNumber(error, "biliCode")
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: lastError.endpoint,
          mid,
          statusCode: this.errorNumber(error, "statusCode"),
          durationMs: Math.max(0, Math.floor(performance.now() - startedAt)),
          errorType: details.code,
          retryable: details.retryable,
          evidenceObjectId: null,
          requestMeta: { mid },
          responseMeta: { success: false, message: details.message,
            ...(biliCode === null ? {} : { biliCode }) },
          createdAt: this.options.now().toISOString()
        })
        // Original RetryPolicy uses the error category, not the API's raw retryable flag.
        const canRetry = ["BILIBILI_RATE_LIMITED", "BILIBILI_NETWORK_ERROR", "BILIBILI_SERVER_ERROR"].includes(details.code)
        if (!canRetry || attempt >= maxAttempts || attempt > 3) break
        const backoff = Math.max(100, this.options.retryBackoffMs ?? 1_500)
          * (2 ** Math.min(attempt - 1, 4))
        const jitter = Math.floor((this.options.jitter?.() ?? Math.random()) * 300)
        await this.wait(backoff + jitter)
        continue
      }
      this.options.database.insertBilibiliApiCall({
        callId: this.options.idFactory(), taskId, attempt, endpointKey: endpoint, mid,
        statusCode: parsed.statusCode, durationMs: Math.max(0, Math.floor(performance.now() - startedAt)),
        errorType: null, retryable: false, evidenceObjectId: parsed.evidenceObject.objectId,
        requestMeta: { mid }, responseMeta: { success: true, sourceEndpoint: parsed.sourceEndpoint },
        createdAt: parsed.fetchedAt
      }, { ...parsed.evidenceObject, createdAt: parsed.fetchedAt })
      return parsed
    }
    throw lastError ?? new FollowerFetchFailure("BILIBILI_UNKNOWN_ERROR", "Unknown Bilibili fetch failure.", false, endpoint)
  }

  private async acquireRateLimit(endpoint: string): Promise<void> {
    await this.rateLimiter.acquire({ platformCode: "bilibili", policyKey: endpoint,
      minIntervalMs: Math.max(0, this.options.requestMinIntervalMs ?? 1_500), signal: this.lifetime.signal,
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}) })
  }

  private ensureRunning(): void {
    if (this.lifetime.signal.aborted) {
      throw new CoreApplicationError("CORE_STOPPED", "本地粉丝采集已停止。", false)
    }
  }

  private async wait(milliseconds: number): Promise<void> {
    this.ensureRunning()
    if (this.options.sleep) {
      await this.options.sleep(milliseconds)
    } else {
      // Exponential backoff can exceed Node's timer range, which would otherwise become 1ms.
      let remaining = milliseconds
      while (remaining > 0) {
        const delay = Math.min(remaining, 2_147_483_647)
        await new Promise<void>(resolveWait => {
          const finish = () => {
            clearTimeout(timer)
            this.lifetime.signal.removeEventListener("abort", finish)
            resolveWait()
          }
          const timer = setTimeout(finish, delay)
          this.lifetime.signal.addEventListener("abort", finish, { once: true })
        })
        this.ensureRunning()
        remaining -= delay
      }
    }
    this.ensureRunning()
  }

  private markFailure(user: StoredBilibiliFollowerMonitor, error: unknown): void {
    const details = this.sourceError(error)
    const errorAt = this.options.now().toISOString()
    const backoffSeconds = Math.max(300, Math.min(user.intervalSeconds, this.options.failureBackoffSeconds ?? 900))
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

  private resolveInterval(requested?: number): number {
    const interval = requested ?? this.options.defaultIntervalSeconds ?? 3600
    const minimum = Math.max(1, this.options.minIntervalSeconds ?? 1)
    const maximum = Math.max(minimum, this.options.maxIntervalSeconds ?? 2_592_000)
    if (interval < minimum) throw new CoreApplicationError("BILIBILI_FOLLOWER_INTERVAL_INVALID",
      `采集间隔不能低于 ${minimum} 秒，避免过于频繁请求 B站接口。`)
    if (interval > maximum) throw new CoreApplicationError("BILIBILI_FOLLOWER_INTERVAL_INVALID",
      `采集间隔不能超过 ${maximum} 秒。`)
    if (interval < Math.max(1, this.options.shortIntervalWarningSeconds ?? 60)) {
      console.warn(JSON.stringify({ event: "bilibili.follower.short-interval", intervalSeconds: interval,
        requestMinIntervalMs: this.options.requestMinIntervalMs ?? 1500 }))
    }
    return interval
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

  private toUserViewV2(
    monitor: StoredBilibiliFollowerMonitor,
    snapshots: StoredBilibiliFollowerSnapshot[]
  ): BilibiliFollowerMonitorV2 {
    const previous = snapshots.length < 2 ? undefined : snapshots.at(-2)?.followerCount
    const current = monitor.currentFollowerCount ?? undefined
    const delta = previous === undefined || current === undefined ? undefined : javaLongDelta(current, previous)
    const growthRate = previous === undefined || previous === 0n || delta === undefined
      ? undefined
      : Number(delta) / Number(previous)
    return BilibiliFollowerMonitorV2Schema.parse({
      id: monitor.monitorId,
      mid: monitor.mid,
      nickname: monitor.nickname,
      ...(monitor.avatarUrl ? { avatarUrl: monitor.avatarUrl } : {}),
      profileUrl: monitor.profileUrl,
      ...(current !== undefined ? { currentFollowerCount: current.toString() } : {}),
      ...(monitor.followingCount !== null ? { followingCount: monitor.followingCount.toString() } : {}),
      ...(delta !== undefined ? { deltaSincePrevious: delta.toString() } : {}),
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
        followerCount: snapshot.followerCount.toString(),
        ...(snapshot.followingCount !== null ? { followingCount: snapshot.followingCount.toString() } : {}),
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
