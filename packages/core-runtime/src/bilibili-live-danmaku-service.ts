import {
  BilibiliLiveDanmakuMetricBucketListSchema,
  BilibiliLiveDanmakuRecentListSchema,
  BilibiliLiveDanmakuStatusSchema,
  QueryBilibiliLiveDanmakuMetricsInputSchema,
  QueryBilibiliLiveDanmakuRecentInputSchema,
  StartBilibiliLiveDanmakuInputSchema,
  type BilibiliCredential,
  type BilibiliLiveDanmakuMetricBucket,
  type BilibiliLiveDanmakuRecent,
  type BilibiliLiveDanmakuStatus,
  type QueryBilibiliLiveDanmakuMetricsInput,
  type QueryBilibiliLiveDanmakuRecentInput,
  type StartBilibiliLiveDanmakuInput
} from "@bmd/contracts"
import type {
  ControlDatabase,
  StoredBilibiliLiveDanmakuSession,
  StoredBilibiliLiveRoomMonitor
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"

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
  | { type: "command"; receivedAt: string; event: NormalizedBilibiliDanmakuEvent }
  | { type: "heartbeat"; popularity: number; receivedAt: string }
  | { type: "closed"; receivedAt: string; code: number; reason: string }
  | { type: "error"; receivedAt: string; errorType: string; message: string }

export interface BilibiliLiveDanmakuSourceStartInput {
  connectionId: string
  roomId: string
  protocolVersion?: number
  credential?: {
    cookieHeader: string
    authUid: string
  }
}

export interface BilibiliLiveDanmakuSourceStartResult {
  connectHost: string
  protocolVersion: number
  authMode: "ANONYMOUS" | "LOGIN"
  authUid?: string
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
  maxConnections?: number
  bucketSeconds?: number
  recentMessageLimitPerRoom?: number
  sessionSink?: {
    ingest: (
      room: StoredBilibiliLiveRoomMonitor,
      transportSessionId: string,
      receiptOrdinal: number,
      protocolVersion: number | undefined,
      event: NormalizedBilibiliDanmakuEvent
    ) => boolean
  }
}

interface ConnectionHandle {
  monitorId: string
  roomId: string
  sessionId: string
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
    this.bucketSeconds = Math.min(3_600, Math.max(10, options.bucketSeconds ?? 60))
    this.recentMessageLimit = Math.min(500, Math.max(1, options.recentMessageLimitPerRoom ?? 200))
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
    handle.status = "STOPPED"
    this.connections.delete(roomMonitorId)
    try {
      const timestamp = this.options.now().toISOString()
      this.options.database.markBilibiliLiveDanmakuSessionStatus(handle.sessionId, "STOPPED", timestamp)
      return this.toStatus(roomMonitorId, handle, false)
    } finally {
      // A persistence/projection failure must not leave an untracked socket running.
      await this.options.source.stop(handle.sessionId)
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
    if (handle) return this.toStatus(roomMonitorId, handle, true, stats)
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
    const from = new Date(to.getTime() - parseRangeMillis(parsed.range))
    return BilibiliLiveDanmakuMetricBucketListSchema.parse(
      this.options.database.findBilibiliLiveDanmakuMetricBuckets(
        parsed.roomMonitorId,
        from.toISOString(),
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
    const desired = this.options.database.listBilibiliLiveDanmakuAutoStartRoomIds(
      this.maxConnections
    )
    const manualCount = [...this.connections.values()].filter((handle) => !handle.autoManaged).length
    const autoCapacity = Math.max(0, this.maxConnections - manualCount)
    const targets = new Set(desired.slice(0, autoCapacity))
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
            handle.status = "STOPPED"
            this.options.database.markBilibiliLiveDanmakuSessionStatus(handle.sessionId, "STOPPED", now)
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
    const existing = this.connections.get(input.roomMonitorId)
    if (existing && ACTIVE_STATUSES.has(existing.status)) {
      if (
        input.protocolVersion === undefined
        || input.protocolVersion === -1
        || input.protocolVersion === existing.protocolVersion
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
      autoManaged,
      status: "CONNECTING",
      startedAt,
      receiptOrdinal: 0
    }
    this.options.database.createBilibiliLiveDanmakuSession({
      sessionId,
      monitorId: input.roomMonitorId,
      roomId: room.roomId,
      connectHost: null,
      startedAt
    })
    this.connections.set(input.roomMonitorId, handle)
    try {
      const credential = await this.credential()
      this.ensureCurrent(handle)
      const result = await this.options.source.start({
        connectionId: sessionId,
        roomId: room.roomId,
        ...(input.protocolVersion === undefined || input.protocolVersion === -1
          ? {}
          : { protocolVersion: input.protocolVersion }),
        ...(credential ? { credential } : {})
      }, (event) => this.applySourceEvent(handle, event))
      this.ensureCurrent(handle)
      handle.connectHost = result.connectHost
      handle.protocolVersion = result.protocolVersion
      handle.authMode = result.authMode
      handle.authUid = result.authUid
      handle.status = "CONNECTED"
      const connectedAt = this.options.now().toISOString()
      this.options.database.updateBilibiliLiveDanmakuSessionTransport(
        sessionId,
        result.connectHost,
        connectedAt
      )
      this.options.database.markBilibiliLiveDanmakuSessionConnected(sessionId, connectedAt)
      return this.status(input.roomMonitorId)
    } catch (error) {
      this.ensureCurrent(handle)
      this.connections.delete(input.roomMonitorId)
      const timestamp = this.options.now().toISOString()
      const normalized = normalizeError(error)
      this.options.database.markBilibiliLiveDanmakuSessionError(
        sessionId,
        timestamp,
        normalized.code,
        normalized.message
      )
      throw new CoreApplicationError(normalized.code, normalized.message)
    }
  }

  private applySourceEvent(handle: ConnectionHandle, event: BilibiliLiveDanmakuSourceEvent): void {
    if (this.stopped || this.connections.get(handle.monitorId) !== handle) return
    if (event.type === "heartbeat") {
      handle.lastHeartbeatAt = event.receivedAt
      this.options.database.markBilibiliLiveDanmakuSessionHeartbeat(
        handle.sessionId,
        event.receivedAt
      )
      this.recordMetric(handle, event.receivedAt, {
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
        void this.resolveMaskedDisplayName(uid, currentName).then((displayName) => {
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

  private applyCommandEvent(handle: ConnectionHandle, parsed: NormalizedBilibiliDanmakuEvent): void {
    if (this.stopped || this.connections.get(handle.monitorId) !== handle) return
    handle.receiptOrdinal += 1
    const room = this.options.database.findBilibiliLiveRoomById(handle.monitorId)
    try {
      this.options.database.runInTransaction(() => {
        if (room && parsed.kind !== "UNKNOWN") this.options.sessionSink?.ingest(
          room,
          handle.sessionId,
          handle.receiptOrdinal,
          handle.protocolVersion,
          parsed
        )
        this.options.database.recordBilibiliLiveDanmakuEvent({
          monitorId: handle.monitorId,
          sessionId: handle.sessionId,
          roomId: handle.roomId,
          occurredAt: parsed.occurredAt,
          bucketSeconds: this.bucketSeconds,
          danmuDelta: parsed.kind === "DANMAKU" ? 1 : 0,
          likeCount: parsed.likeCount ?? null,
          likeIncrement: Math.max(0, parsed.likeIncrement ?? 0),
          watchedCount: parsed.watchedCount ?? null,
          heartbeatPopularity: null,
          giftDelta: Math.max(0, parsed.giftDelta),
          superChatDelta: Math.max(0, parsed.superChatDelta),
          rawEventDelta: 1,
          recent: parsed.kind === "DANMAKU"
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

function parseRangeMillis(range: string): number {
  const amount = Math.max(1, Number.parseInt(range.slice(0, -1), 10))
  const unit = range.slice(-1).toLowerCase()
  if (unit === "m") return amount * 60_000
  if (unit === "d") return amount * 86_400_000
  return amount * 3_600_000
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
