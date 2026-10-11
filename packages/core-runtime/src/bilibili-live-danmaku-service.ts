import {
  BilibiliLiveDanmakuMetricBucketListSchema,
  BilibiliLiveDanmakuRecentListSchema,
  BilibiliLiveDanmakuStatusSchema,
  QueryBilibiliLiveDanmakuMetricsInputSchema,
  QueryBilibiliLiveDanmakuRecentInputSchema,
  StartBilibiliLiveDanmakuInputSchema,
  type BilibiliCredential,
  type BilibiliDanmakuWorkerLifecycleEvent,
  type BilibiliDanmakuWorkerStartResult,
  type BilibiliLiveDanmakuMetricBucket,
  type BilibiliLiveDanmakuRecent,
  type BilibiliLiveDanmakuStatus,
  type BilibiliLiveDanmakuConnectionConfiguration,
  type BilibiliLiveDanmakuCacheConfiguration,
  type QueryBilibiliLiveDanmakuMetricsInput,
  type QueryBilibiliLiveDanmakuRecentInput,
  type StartBilibiliLiveDanmakuInput
} from "@bmd/contracts"
import type {
  ControlDatabase,
  StoredBilibiliLiveDanmakuSession,
  StoredBilibiliLiveRoomMonitor
} from "@bmd/storage"
import { hasLiveSnapshotText } from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import { parseJavaDecimalLong } from "./follower-configuration-values"

export interface NormalizedBilibiliDanmakuEvent {
  command: string
  kind:
    | "DANMAKU"
    | "GIFT"
    | "SUPER_CHAT"
    | "GUARD_BUY"
    | "LIVE"
    | "PREPARING"
    | "METRICS"
    | "NOTIFICATION"
    | "UNKNOWN"
  occurredAt: string
  receivedAt: string
  actor?: {
    uid?: string
    displayName?: string
    medalName?: string
  }
  messageText?: string
  eventKey?: string
  sourceEventId?: string
  liveStartedAt?: string
  liveKey?: string
  gift?: {
    giftId?: string
    giftName?: string
    quantity: number
    coinType?: string
    price?: number
    totalCoin?: number
    paid: boolean
    amountMilliYuan: number
  }
  amountMilliYuan?: number
  guardLevel?: number
  quantity?: number
  likeCount?: number
  likeIncrement?: number
  watchedCount?: number
  giftDelta: number
  superChatDelta: number
  rawJson: string
}

export type BilibiliLiveDanmakuSourceEvent =
  | BilibiliDanmakuWorkerLifecycleEvent
  | { type: "command"; attempt?: number; receivedAt: string; event: NormalizedBilibiliDanmakuEvent }
  | { type: "heartbeat"; attempt?: number; popularity: number; receivedAt: string }
  | { type: "closed"; attempt?: number; receivedAt: string; code: number; reason: string }
  | { type: "error"; attempt?: number; receivedAt: string; errorType: string; message: string }

export interface BilibiliLiveDanmakuSourceStartInput {
  connectionId: string
  roomId: string
  protocolVersion?: number
  preferredProtocolVersion?: number
  connectionConfiguration?: BilibiliLiveDanmakuConnectionConfiguration
  cacheConfiguration?: BilibiliLiveDanmakuCacheConfiguration
  credential?: {
    cookieHeader: string
    authUid: string
  }
}

export type BilibiliLiveDanmakuSourceStartResult = Omit<BilibiliDanmakuWorkerStartResult, "status" | "attempt"> & {
  status?: BilibiliDanmakuWorkerStartResult["status"]
  attempt?: number
}

export interface BilibiliLiveDanmakuSource {
  start: (
    input: BilibiliLiveDanmakuSourceStartInput,
    onEvent: (event: BilibiliLiveDanmakuSourceEvent) => void
  ) => Promise<BilibiliLiveDanmakuSourceStartResult>
  stop: (connectionId: string) => Promise<void>
  stopAll: () => Promise<void>
}

export interface BilibiliLiveDanmakuServiceOptions {
  database: ControlDatabase
  source: BilibiliLiveDanmakuSource
  now: () => Date
  idFactory: () => string
  credentialProvider: () => Promise<BilibiliCredential | undefined>
  resolveDisplayName?: (uid: string) => Promise<string | null | undefined>
  enabled?: boolean
  autoStartEnabled?: boolean
  maxConnections?: number
  protocolVersion?: number
  bucketSeconds?: number
  recentMessageLimitPerRoom?: number
  connectionConfiguration?: BilibiliLiveDanmakuConnectionConfiguration
  cacheConfiguration?: BilibiliLiveDanmakuCacheConfiguration
  sessionSink?: {
    ingest: (
      room: StoredBilibiliLiveRoomMonitor,
      transportSessionId: string,
      receiptOrdinal: number,
      protocolVersion: number | undefined,
      event: NormalizedBilibiliDanmakuEvent,
      writtenAt?: string
    ) => boolean
  }
}

interface ConnectionHandle {
  monitorId: string
  roomId: string
  sessionId: string
  connectionId: string
  attempt: number
  persisted: boolean
  cancelled: boolean
  autoManaged: boolean
  status: "CONNECTING" | "AUTHENTICATING" | "CONNECTED" | "CLOSED" | "STOPPED" | "ERROR"
  connectHost?: string | undefined
  protocolVersion?: number | undefined
  authMode?: "ANONYMOUS" | "LOGIN" | undefined
  authUid?: string | undefined
  startedAt: string
  lastHeartbeatAt?: string | undefined
  lastErrorAt?: string | undefined
  lastErrorType?: string | undefined
  lastErrorMessage?: string | undefined
  receiptOrdinal: number
}

const ACTIVE_STATUSES = new Set(["CONNECTING", "AUTHENTICATING", "CONNECTED"])
interface PendingStart { cancelled: boolean; cancel: () => void }

export class BilibiliLiveDanmakuService {
  private readonly connections = new Map<string, ConnectionHandle>()
  private readonly displayNameCache = new Map<string, { name: string; expiresAt: number }>()
  private readonly maxConnections: number
  private readonly bucketSeconds: number
  private readonly recentMessageLimit: number
  private stopped = false
  private stopPromise: Promise<void> | undefined
  private operationTail: Promise<void> = Promise.resolve()
  private pendingOperations = 0
  private autoSync: Promise<void> | undefined
  private readonly pendingStarts = new Map<string, Set<PendingStart>>()

  constructor(private readonly options: BilibiliLiveDanmakuServiceOptions) {
    this.maxConnections = Math.max(1, options.maxConnections ?? 10)
    this.bucketSeconds = options.bucketSeconds ?? 60
    this.recentMessageLimit = Math.max(20, options.recentMessageLimitPerRoom ?? 200)
    options.database.markOrphanedBilibiliLiveDanmakuSessions(options.now().toISOString())
  }

  start(input: StartBilibiliLiveDanmakuInput): Promise<BilibiliLiveDanmakuStatus> {
    const parsed = StartBilibiliLiveDanmakuInputSchema.parse(input)
    let rejectCancellation: (reason: Error) => void = () => {}
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject })
    const token: PendingStart = { cancelled: false, cancel: () => {
      token.cancelled = true
      rejectCancellation(new CoreApplicationError("BILIBILI_DANMAKU_CONNECTION_ENDED", "弹幕连接已取消。", false))
    } }
    const requests = this.pendingStarts.get(parsed.roomMonitorId) ?? new Set<PendingStart>()
    requests.add(token)
    this.pendingStarts.set(parsed.roomMonitorId, requests)
    const operation = this.enqueue(() => {
      if (token.cancelled) throw new CoreApplicationError("BILIBILI_DANMAKU_CONNECTION_ENDED", "弹幕连接已取消。", false)
      return this.startInternal(parsed, false)
    })
    return Promise.race([operation, cancellation]).finally(() => {
      requests.delete(token)
      if (requests.size === 0) this.pendingStarts.delete(parsed.roomMonitorId)
    })
  }

  stop(roomMonitorId: string): Promise<BilibiliLiveDanmakuStatus> {
    if (this.stopped) return Promise.reject(new CoreApplicationError("CORE_STOPPED", "本地弹幕服务已停止。", false))
    // Stop must not wait behind this room's or another room's unlimited HTTP request.
    for (const token of this.pendingStarts.get(roomMonitorId) ?? []) token.cancel()
    return this.stopInternal(roomMonitorId)
  }

  private async stopInternal(roomMonitorId: string): Promise<BilibiliLiveDanmakuStatus> {
    const handle = this.connections.get(roomMonitorId)
    if (!handle) return this.status(roomMonitorId)
    const activeAttempt = ACTIVE_STATUSES.has(handle.status)
    handle.status = "STOPPED"
    handle.cancelled = true
    this.connections.delete(roomMonitorId)
    try {
      const timestamp = this.options.now().toISOString()
      if (handle.persisted && activeAttempt) this.options.database.markBilibiliLiveDanmakuSessionStatus(handle.sessionId, "STOPPED", timestamp)
      return this.toStatus(roomMonitorId, handle, false)
    } finally {
      // A persistence/projection failure must not leave an untracked socket running.
      await this.options.source.stop(handle.connectionId)
      this.ensureRunning()
    }
  }

  status(roomMonitorId: string): BilibiliLiveDanmakuStatus {
    const room = this.options.database.findBilibiliLiveRoomById(roomMonitorId)
    const handle = this.connections.get(roomMonitorId)
    const latest = this.options.database.findLatestBilibiliLiveDanmakuSession(roomMonitorId)
    const stats = this.options.database.getBilibiliLiveDanmakuStats(
      roomMonitorId,
      this.options.now().toISOString()
    )
    if (handle) return this.toStatus(roomMonitorId, handle, ACTIVE_STATUSES.has(handle.status), stats)
    const orphaned = latest ? ACTIVE_STATUSES.has(latest.status) : false
    return BilibiliLiveDanmakuStatusSchema.parse({
      liveRoomMonitorId: roomMonitorId,
      ...(room?.roomId ?? latest?.roomId ? { roomId: room?.roomId ?? latest?.roomId } : {}),
      running: false,
      status: orphaned ? "ERROR" : latest?.status ?? "NOT_STARTED",
      ...(latest?.connectHost ? { connectHost: latest.connectHost } : {}),
      ...(latest?.sessionId ? { sessionId: latest.sessionId } : {}),
      ...statusStats(stats),
      ...(latest?.startedAt ? { startedAt: latest.startedAt } : {}),
      ...(latest?.lastHeartbeatAt ? { lastHeartbeatAt: latest.lastHeartbeatAt } : {}),
      ...(orphaned || latest?.lastErrorAt
        ? { lastErrorAt: latest?.lastErrorAt ?? this.options.now().toISOString() }
        : {}),
      ...(orphaned || latest?.lastErrorType
        ? { lastErrorType: orphaned ? "PROCESS_RESTART" : latest?.lastErrorType }
        : {}),
      ...(orphaned || latest?.lastErrorMessage
        ? {
            lastErrorMessage: orphaned
              ? "Persisted transport has no active in-process WebSocket."
              : latest?.lastErrorMessage
          }
        : {})
    })
  }

  recent(input: QueryBilibiliLiveDanmakuRecentInput): BilibiliLiveDanmakuRecent[] {
    const parsed = QueryBilibiliLiveDanmakuRecentInputSchema.parse(input)
    return BilibiliLiveDanmakuRecentListSchema.parse(
      this.options.database.findBilibiliLiveDanmakuRecent(parsed.roomMonitorId, parsed.limit)
        .map((item) => ({
          messageText: item.messageText,
          ...(item.senderUid ? { senderUid: item.senderUid } : {}),
          ...(item.displayName ? { displayName: item.displayName } : {}),
          ...(item.medalName ? { medalName: item.medalName } : {}),
          sentAt: item.sentAt
        }))
    )
  }

  metrics(input: QueryBilibiliLiveDanmakuMetricsInput): BilibiliLiveDanmakuMetricBucket[] {
    const parsed = QueryBilibiliLiveDanmakuMetricsInputSchema.parse(input)
    const to = this.options.now()
    const fromMillis = BigInt(to.getTime()) - parseRangeMillis(parsed.range)
    // Original DISPLAY_OFFSET=+08. LocalDate.MIN epoch day (-365243219162)
    // times 86400000 minus the offset, not the narrower JavaScript Date limit.
    if (fromMillis < -31_557_014_135_625_600_000n) {
      throw new RangeError("Danmaku metrics window exceeds the original date range")
    }
    // All persisted bucket instants are Date-representable. Below Date.min the
    // true lower predicate is always satisfied: omit it, without clipping time.
    const from = fromMillis < -8_640_000_000_000_000n
      ? null : new Date(Number(fromMillis)).toISOString()
    return BilibiliLiveDanmakuMetricBucketListSchema.parse(
      this.options.database.findBilibiliLiveDanmakuMetricBuckets(
        parsed.roomMonitorId,
        from,
        to.toISOString(),
        2_000
      ).map((item) => ({
        bucketStart: item.bucketStart,
        bucketSeconds: item.bucketSeconds,
        danmuCount: item.danmuCount,
        ...(item.likeCount === null ? {} : { likeCount: item.likeCount }),
        likeIncrement: item.likeIncrement,
        ...(item.watchedCount === null ? {} : { watchedCount: item.watchedCount }),
        ...(item.heartbeatPopularity === null
          ? {}
          : { heartbeatPopularity: item.heartbeatPopularity }),
        rawEventCount: item.rawEventCount
      }))
    )
  }

  syncAutoConnections(): Promise<void> {
    if (this.autoSync) return this.autoSync
    const pending = this.enqueue(() => this.syncAutoConnectionsInternal())
    this.autoSync = pending
    void pending.then(() => { this.autoSync = undefined }, () => { this.autoSync = undefined })
    return pending
  }

  private async syncAutoConnectionsInternal(): Promise<void> {
    if (this.options.enabled === false || this.options.autoStartEnabled === false) return
    const desired = this.options.database.listBilibiliLiveDanmakuAutoStartRoomIds()
    const manualCount = [...this.connections.values()].filter((handle) => !handle.autoManaged).length
    const autoCapacity = Math.max(0, this.maxConnections - manualCount)
    const targets = new Set<string>()
    for (const roomMonitorId of desired) {
      const existing = this.connections.get(roomMonitorId)
      if (existing && !existing.autoManaged) continue
      if (targets.size >= autoCapacity) break
      targets.add(roomMonitorId)
    }
    for (const handle of [...this.connections.values()]) {
      if (handle.autoManaged && !targets.has(handle.monitorId)) await this.stopInternal(handle.monitorId)
    }
    for (const roomMonitorId of targets) {
      if (this.connections.has(roomMonitorId)) continue
      try {
        await this.startInternal({ roomMonitorId, protocolVersion: -1 }, true)
      } catch {
        this.ensureRunning()
        this.reportConnectionFailure("auto-start", roomMonitorId)
        // The next scheduler pass retries original auto-managed rooms.
      }
    }
  }

  reconnectAnonymousConnectionsAsync(): void {
    if (this.stopped) return
    void this.reconnectAnonymousConnections().catch(() => {
      if (!this.stopped) this.reportConnectionFailure("login-upgrade")
    })
  }

  reconnectAnonymousConnections(): Promise<void> {
    return this.enqueue(() => this.reconnectAnonymousConnectionsInternal())
  }

  private async reconnectAnonymousConnectionsInternal(): Promise<void> {
    const anonymous = [...this.connections.values()]
      .filter((handle) => ACTIVE_STATUSES.has(handle.status) && handle.authMode === "ANONYMOUS")
    for (const candidate of anonymous) {
      this.ensureRunning()
      if (this.connections.get(candidate.monitorId) !== candidate) continue
      try {
        await this.stopInternal(candidate.monitorId)
        await this.startInternal({
          roomMonitorId: candidate.monitorId,
          ...(candidate.protocolVersion === undefined ? {} : { protocolVersion: candidate.protocolVersion })
        }, candidate.autoManaged)
      } catch {
        this.ensureRunning()
        this.reportConnectionFailure("login-upgrade", candidate.monitorId)
      }
    }
  }

  stopAll(): Promise<void> {
    if (!this.stopPromise) {
      this.stopped = true
      const handles = [...this.connections.values()]
      this.connections.clear()
      this.displayNameCache.clear()
      this.stopPromise = (async () => {
        try {
          const now = this.options.now().toISOString()
          for (const handle of handles) {
            const activeAttempt = ACTIVE_STATUSES.has(handle.status)
            handle.status = "STOPPED"
            handle.cancelled = true
            if (handle.persisted && activeAttempt) this.options.database.markBilibiliLiveDanmakuSessionStatus(handle.sessionId, "STOPPED", now)
          }
        } finally {
          await this.options.source.stopAll()
        }
      })()
    }
    return this.stopPromise
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new CoreApplicationError("CORE_STOPPED", "本地弹幕服务已停止。", false))
    if (this.pendingOperations >= 100) return Promise.reject(new CoreApplicationError(
      "BILIBILI_DANMAKU_BUSY", "弹幕操作繁忙，请稍后重试。", true
    ))
    this.pendingOperations++
    const pending = this.operationTail.then(() => { this.ensureRunning(); return operation() })
    this.operationTail = pending.then(() => { this.pendingOperations-- }, () => { this.pendingOperations-- })
    return pending
  }

  private ensureRunning(): void {
    if (this.stopped) throw new CoreApplicationError("CORE_STOPPED", "本地弹幕服务已停止。", false)
  }

  private ensureCurrent(handle: ConnectionHandle): void {
    this.ensureRunning()
    if (this.connections.get(handle.monitorId) !== handle) {
      throw new CoreApplicationError("BILIBILI_DANMAKU_CONNECTION_ENDED", "弹幕连接已结束，请重新连接。", true)
    }
  }

  private reportConnectionFailure(operation: string, monitorId?: string): void {
    console.warn(JSON.stringify({ event: "bilibili.danmaku.background-failed", operation,
      code: "BILIBILI_DANMAKU_BACKGROUND_FAILED", ...(monitorId ? { monitorId } : {}) }))
  }

  private async startInternal(
    input: StartBilibiliLiveDanmakuInput,
    autoManaged: boolean
  ): Promise<BilibiliLiveDanmakuStatus> {
    this.ensureRunning()
    if (this.options.enabled === false) {
      throw new CoreApplicationError("BILIBILI_DANMAKU_DISABLED", "弹幕监听已由启动配置关闭。启用 enabled 后重启客户端可恢复，已有数据不会删除。")
    }
    const requestedProtocolVersion = input.protocolVersion !== undefined
      && input.protocolVersion >= 0 && input.protocolVersion <= 3 ? input.protocolVersion : undefined
    const existing = this.connections.get(input.roomMonitorId)
    if (existing && ACTIVE_STATUSES.has(existing.status)) {
      if (
        requestedProtocolVersion === undefined
        || requestedProtocolVersion === existing.protocolVersion
      ) return this.status(input.roomMonitorId)
      await this.stopInternal(input.roomMonitorId)
    }
    if (this.connections.size >= this.maxConnections) {
      throw new CoreApplicationError(
        "BILIBILI_DANMAKU_CONNECTION_LIMIT",
        "Danmaku connection limit reached."
      )
    }
    const room = this.options.database.findBilibiliLiveRoomById(input.roomMonitorId)
    if (!room) {
      throw new CoreApplicationError(
        "BILIBILI_LIVE_ROOM_NOT_FOUND",
        `Bilibili live room monitor not found: ${input.roomMonitorId}`
      )
    }
    const sessionId = this.options.idFactory()
    const startedAt = this.options.now().toISOString()
    const handle: ConnectionHandle = {
      monitorId: input.roomMonitorId,
      roomId: room.roomId,
      sessionId,
      connectionId: sessionId,
      attempt: 0,
      persisted: false,
      cancelled: false,
      autoManaged,
      status: "CONNECTING",
      startedAt,
      receiptOrdinal: 0
    }
    this.connections.set(input.roomMonitorId, handle)
    try {
      const credential = await this.credential()
      this.ensureCurrent(handle)
      const result = await this.options.source.start({
        connectionId: sessionId,
        roomId: room.roomId,
        preferredProtocolVersion: this.options.protocolVersion ?? 3,
        ...(this.options.connectionConfiguration ? { connectionConfiguration: this.options.connectionConfiguration } : {}),
        ...(this.options.cacheConfiguration ? { cacheConfiguration: this.options.cacheConfiguration } : {}),
        ...(requestedProtocolVersion === undefined
          ? {}
          : { protocolVersion: requestedProtocolVersion }),
        ...(credential ? { credential } : {})
      }, (event) => this.applySourceEvent(handle, event))
      this.ensureRunning()
      if (handle.cancelled) this.ensureCurrent(handle)
      if (!ACTIVE_STATUSES.has(handle.status)) return this.toStatus(input.roomMonitorId, handle, false)
      this.ensureCurrent(handle)
      if (!handle.persisted) this.createAttemptSession(handle, result.attempt ?? 1, startedAt)
      handle.connectHost = result.connectHost
      handle.protocolVersion = result.protocolVersion
      handle.authMode = result.authMode
      handle.authUid = result.authUid
      const connectedAt = this.options.now().toISOString()
      if (handle.status === "CONNECTING") {
        this.options.database.updateBilibiliLiveDanmakuSessionTransport(handle.sessionId, result.connectHost, connectedAt)
        handle.status = result.status ?? "CONNECTED"
        if (handle.status === "CONNECTED") this.options.database.markBilibiliLiveDanmakuSessionConnected(handle.sessionId, connectedAt)
      }
      return this.status(input.roomMonitorId)
    } catch (error) {
      this.ensureRunning()
      if (handle.cancelled) this.ensureCurrent(handle)
      this.connections.delete(input.roomMonitorId)
      const timestamp = this.options.now().toISOString()
      const normalized = normalizeError(error)
      if (handle.persisted && handle.status !== "ERROR" && handle.status !== "CLOSED") {
        this.options.database.markBilibiliLiveDanmakuSessionError(handle.sessionId, timestamp, normalized.code, normalized.message)
      }
      throw new CoreApplicationError(normalized.code, normalized.message)
    }
  }

  private applySourceEvent(handle: ConnectionHandle, event: BilibiliLiveDanmakuSourceEvent): void {
    if (this.stopped || this.connections.get(handle.monitorId) !== handle) return
    if (event.type === "connecting") {
      if (event.attempt <= handle.attempt) return
      this.createAttemptSession(handle, event.attempt, event.receivedAt, event.connectHost)
      handle.connectHost = event.connectHost
      handle.protocolVersion = event.protocolVersion
      handle.authMode = event.authMode
      handle.authUid = event.authUid
      return
    }
    if (event.attempt !== undefined && event.attempt !== handle.attempt) return
    if (event.type === "attempt-failed") {
      if (handle.persisted) {
        handle.status = "ERROR"
        handle.lastErrorAt = event.receivedAt
        handle.lastErrorType = event.code
        handle.lastErrorMessage = event.message
        this.options.database.markBilibiliLiveDanmakuSessionError(handle.sessionId, event.receivedAt, event.code, event.message)
      }
      return
    }
    if (!ACTIVE_STATUSES.has(handle.status)) return
    if (!handle.persisted) this.createAttemptSession(handle, 1, handle.startedAt)
    if (event.type === "connected") {
      handle.status = "CONNECTED"
      this.options.database.markBilibiliLiveDanmakuSessionConnected(handle.sessionId, event.receivedAt)
      return
    }
    if (event.type === "heartbeat" || event.type === "heartbeat-sent") {
      handle.lastHeartbeatAt = event.receivedAt
      this.options.database.markBilibiliLiveDanmakuSessionHeartbeat(
        handle.sessionId,
        event.receivedAt
      )
      if (event.type === "heartbeat") this.recordMetric(handle, event.receivedAt, {
        heartbeatPopularity: event.popularity,
        rawEventDelta: 0
      })
      return
    }
    if (event.type === "command") {
      const uid = event.event.actor?.uid
      const currentName = event.event.actor?.displayName
      if (
        event.event.kind === "DANMAKU"
        && uid
        && /^[1-9]\d*$/.test(uid)
        && currentName?.includes("*")
        && this.options.resolveDisplayName
      ) {
        const attempt = handle.attempt
        void this.resolveMaskedDisplayName(uid, currentName).then((displayName) => {
          if (handle.attempt !== attempt) return
          this.applyCommandEvent(handle, {
            ...event.event,
            actor: { ...event.event.actor, displayName }
          })
        })
      } else {
        this.applyCommandEvent(handle, event.event)
      }
      return
    }
    this.connections.delete(handle.monitorId)
    if (event.type === "error") {
      handle.status = "ERROR"
      handle.lastErrorAt = event.receivedAt
      handle.lastErrorType = event.errorType
      handle.lastErrorMessage = event.message
      this.options.database.markBilibiliLiveDanmakuSessionError(
        handle.sessionId,
        event.receivedAt,
        event.errorType,
        event.message
      )
      return
    }
    handle.status = "CLOSED"
    this.options.database.markBilibiliLiveDanmakuSessionStatus(
      handle.sessionId,
      "CLOSED",
      event.receivedAt
    )
  }

  private createAttemptSession(handle: ConnectionHandle, attempt: number, startedAt: string, connectHost?: string): void {
    const sessionId = handle.persisted ? this.options.idFactory() : handle.sessionId
    this.options.database.createBilibiliLiveDanmakuSession({ sessionId,
      monitorId: handle.monitorId, roomId: handle.roomId, connectHost: connectHost ?? null, startedAt })
    handle.sessionId = sessionId
    handle.attempt = attempt
    handle.persisted = true
    handle.status = "CONNECTING"
    handle.startedAt = startedAt
    handle.receiptOrdinal = 0
    handle.lastHeartbeatAt = undefined
    handle.lastErrorAt = undefined
    handle.lastErrorType = undefined
    handle.lastErrorMessage = undefined
  }

  private applyCommandEvent(handle: ConnectionHandle, parsed: NormalizedBilibiliDanmakuEvent): void {
    if (this.stopped || this.connections.get(handle.monitorId) !== handle || !ACTIVE_STATUSES.has(handle.status)) return
    handle.receiptOrdinal += 1
    const room = this.options.database.findBilibiliLiveRoomById(handle.monitorId)
    try {
      this.options.database.runInTransaction(() => {
        // Original SQL now() is shared by the ingestion transaction, including
        // facts and legacy projections, after any display-name lookup completes.
        const writtenAt = this.options.now().toISOString()
        if (room && parsed.kind !== "UNKNOWN") this.options.sessionSink?.ingest(
          room,
          handle.sessionId,
          handle.receiptOrdinal,
          handle.protocolVersion,
          parsed,
          writtenAt
        )
        this.options.database.recordBilibiliLiveDanmakuEvent({
          monitorId: handle.monitorId,
          sessionId: handle.sessionId,
          roomId: handle.roomId,
          occurredAt: parsed.occurredAt,
          writtenAt,
          bucketSeconds: this.bucketSeconds,
          danmuDelta: parsed.kind === "DANMAKU" ? 1 : 0,
          likeCount: parsed.likeCount ?? null,
          likeIncrement: Math.max(0, parsed.likeIncrement ?? 0),
          watchedCount: parsed.watchedCount ?? null,
          heartbeatPopularity: null,
          giftDelta: Math.max(0, parsed.giftDelta),
          superChatDelta: Math.max(0, parsed.superChatDelta),
          rawEventDelta: 1,
          recent: parsed.kind === "DANMAKU" && hasLiveSnapshotText(parsed.messageText)
            ? {
                senderUid: parsed.actor?.uid && /^[1-9]\d*$/.test(parsed.actor.uid)
                  ? parsed.actor.uid
                  : null,
                messageText: parsed.messageText ?? "",
                displayName: parsed.actor?.displayName ?? null,
                medalName: parsed.actor?.medalName ?? null,
                sentAt: parsed.occurredAt
              }
            : null,
          recentLimit: this.recentMessageLimit
        })
      })
    } catch {
      // Original transport continues even when one complete event transaction fails.
    }
  }

  private async resolveMaskedDisplayName(uid: string, currentName: string): Promise<string> {
    const now = this.options.now().getTime()
    const cached = this.displayNameCache.get(uid)
    if (cached && cached.expiresAt > now) return cached.name
    try {
      const resolved = (await this.options.resolveDisplayName?.(uid))?.trim()
      if (resolved) {
        this.displayNameCache.set(uid, {
          name: resolved,
          expiresAt: now + 12 * 60 * 60 * 1_000
        })
        return resolved
      }
    } catch {
      // Matching the original service, sender-card failure must not break danmaku ingestion.
    }
    this.displayNameCache.set(uid, {
      name: currentName,
      expiresAt: now + 10 * 60 * 1_000
    })
    return currentName
  }

  private recordMetric(
    handle: ConnectionHandle,
    occurredAt: string,
    values: { heartbeatPopularity: number | null; rawEventDelta: number }
  ): void {
    this.options.database.recordBilibiliLiveDanmakuEvent({
      monitorId: handle.monitorId,
      sessionId: handle.sessionId,
      roomId: handle.roomId,
      occurredAt,
      writtenAt: this.options.now().toISOString(),
      bucketSeconds: this.bucketSeconds,
      danmuDelta: 0,
      likeCount: null,
      likeIncrement: 0,
      watchedCount: null,
      heartbeatPopularity: values.heartbeatPopularity,
      giftDelta: 0,
      superChatDelta: 0,
      rawEventDelta: values.rawEventDelta,
      recent: null,
      recentLimit: this.recentMessageLimit
    })
  }

  private async credential(): Promise<
    { cookieHeader: string; authUid: string } | undefined
  > {
    if (this.options.connectionConfiguration?.useLoginCredential === false) return undefined
    try {
      const credential = await this.options.credentialProvider()
      const authUid = credential?.account?.mid
      if (!credential?.cookieHeader || !authUid || !/^[1-9]\d*$/.test(authUid)) return undefined
      return { cookieHeader: credential.cookieHeader, authUid }
    } catch {
      return undefined
    }
  }

  private toStatus(
    roomMonitorId: string,
    handle: ConnectionHandle,
    running: boolean,
    stats = this.options.database.getBilibiliLiveDanmakuStats(
      roomMonitorId,
      this.options.now().toISOString()
    )
  ): BilibiliLiveDanmakuStatus {
    return BilibiliLiveDanmakuStatusSchema.parse({
      liveRoomMonitorId: roomMonitorId,
      roomId: handle.roomId,
      running,
      status: handle.status,
      ...(handle.connectHost ? { connectHost: handle.connectHost } : {}),
      sessionId: handle.sessionId,
      ...statusStats(stats),
      ...(handle.protocolVersion === undefined
        ? {}
        : { protocolVersion: handle.protocolVersion }),
      ...(handle.authMode ? { authMode: handle.authMode } : {}),
      ...(handle.authUid ? { authUid: handle.authUid } : {}),
      startedAt: handle.startedAt,
      ...(handle.lastHeartbeatAt ? { lastHeartbeatAt: handle.lastHeartbeatAt } : {}),
      ...(handle.lastErrorAt ? { lastErrorAt: handle.lastErrorAt } : {}),
      ...(handle.lastErrorType ? { lastErrorType: handle.lastErrorType } : {}),
      ...(handle.lastErrorMessage ? { lastErrorMessage: handle.lastErrorMessage } : {})
    })
  }
}

function statusStats(stats: ReturnType<ControlDatabase["getBilibiliLiveDanmakuStats"]>): {
  ratePerMinute: number
  last5MinutesCount: number
  likeIncrement: number
  likeCount?: number
  watchedCount?: number
  heartbeatPopularity?: number
} {
  return {
    ratePerMinute: stats.ratePerMinute,
    last5MinutesCount: stats.last5MinutesCount,
    likeIncrement: stats.likeIncrement,
    ...(stats.likeCount === null ? {} : { likeCount: stats.likeCount }),
    ...(stats.watchedCount === null ? {} : { watchedCount: stats.watchedCount }),
    ...(stats.heartbeatPopularity === null
      ? {}
      : { heartbeatPopularity: stats.heartbeatPopularity })
  }
}

function parseRangeMillis(range: string): bigint {
  // Java String.trim removes U+0000..U+0020 only, unlike JavaScript trim.
  const value = range.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, "").toLowerCase()
  try {
    const raw = parseJavaDecimalLong(value.slice(0, -1))
    const amount = raw < 1n ? 1n : raw
    const unit = value.slice(-1)
    const secondsPerUnit = unit === "m" ? 60n : unit === "h" ? 3_600n : unit === "d" ? 86_400n : null
    if (secondsPerUnit !== null) {
      const seconds = amount * secondsPerUnit
      // Duration.ofMinutes/Hours/Days uses signed-long exact multiplication.
      if (seconds <= (1n << 63n) - 1n) return seconds * 1_000n
    }
  } catch {
    // The original parser catches malformed/overflowed Long input, not minus().
  }
  return 3_600_000n
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error && typeof error.code === "string"
      ? error.code
      : "BILIBILI_DANMAKU_START_FAILED"
    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : String(error)
    return { code, message }
  }
  return { code: "BILIBILI_DANMAKU_START_FAILED", message: String(error) }
}
