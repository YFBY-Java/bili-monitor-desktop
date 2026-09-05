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

export class BilibiliLiveDanmakuService {
  private readonly connections = new Map<string, ConnectionHandle>()
  private readonly displayNameCache = new Map<string, { name: string; expiresAt: number }>()
  private readonly maxConnections: number
  private readonly bucketSeconds: number
  private readonly recentMessageLimit: number

  constructor(private readonly options: BilibiliLiveDanmakuServiceOptions) {
    this.maxConnections = Math.max(1, options.maxConnections ?? 10)
    this.bucketSeconds = Math.min(3_600, Math.max(10, options.bucketSeconds ?? 60))
    this.recentMessageLimit = Math.min(500, Math.max(1, options.recentMessageLimitPerRoom ?? 200))
    options.database.markOrphanedBilibiliLiveDanmakuSessions(options.now().toISOString())
  }

  start(input: StartBilibiliLiveDanmakuInput): Promise<BilibiliLiveDanmakuStatus> {
    return this.startInternal(StartBilibiliLiveDanmakuInputSchema.parse(input), false)
  }

  async stop(roomMonitorId: string): Promise<BilibiliLiveDanmakuStatus> {
    const handle = this.connections.get(roomMonitorId)
    if (!handle) return this.status(roomMonitorId)
    handle.status = "STOPPED"
    this.connections.delete(roomMonitorId)
    await this.options.source.stop(handle.sessionId)
    const timestamp = this.options.now().toISOString()
    this.options.database.markBilibiliLiveDanmakuSessionStatus(
      handle.sessionId,
      "STOPPED",
      timestamp
    )
    return this.toStatus(roomMonitorId, handle, false)
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

  async syncAutoConnections(): Promise<void> {
    const desired = this.options.database.listBilibiliLiveDanmakuAutoStartRoomIds(
      this.maxConnections
    )
    const manualCount = [...this.connections.values()].filter((handle) => !handle.autoManaged).length
    const autoCapacity = Math.max(0, this.maxConnections - manualCount)
    const targets = new Set(desired.slice(0, autoCapacity))
    for (const handle of [...this.connections.values()]) {
      if (handle.autoManaged && !targets.has(handle.monitorId)) await this.stop(handle.monitorId)
    }
    for (const roomMonitorId of targets) {
      if (this.connections.has(roomMonitorId)) continue
      try {
        await this.startInternal({ roomMonitorId, protocolVersion: -1 }, true)
      } catch {
        // The next scheduler pass retries original auto-managed rooms.
      }
    }
  }

  async reconnectAnonymousConnections(): Promise<void> {
    const anonymous = [...this.connections.values()]
      .filter((handle) => handle.authMode === "ANONYMOUS")
      .map((handle) => ({
        monitorId: handle.monitorId,
        protocolVersion: handle.protocolVersion,
        autoManaged: handle.autoManaged
      }))
    for (const candidate of anonymous) {
      await this.stop(candidate.monitorId)
      await this.startInternal({
        roomMonitorId: candidate.monitorId,
        ...(candidate.protocolVersion === undefined
          ? {}
          : { protocolVersion: candidate.protocolVersion })
      }, candidate.autoManaged)
    }
  }

  async stopAll(): Promise<void> {
    for (const monitorId of [...this.connections.keys()]) await this.stop(monitorId)
    await this.options.source.stopAll()
  }

  private async startInternal(
    input: StartBilibiliLiveDanmakuInput,
    autoManaged: boolean
  ): Promise<BilibiliLiveDanmakuStatus> {
    const existing = this.connections.get(input.roomMonitorId)
    if (existing && ACTIVE_STATUSES.has(existing.status)) {
      if (
        input.protocolVersion === undefined
        || input.protocolVersion === -1
        || input.protocolVersion === existing.protocolVersion
      ) return this.status(input.roomMonitorId)
      await this.stop(input.roomMonitorId)
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
      const result = await this.options.source.start({
        connectionId: sessionId,
        roomId: room.roomId,
        ...(input.protocolVersion === undefined || input.protocolVersion === -1
          ? {}
          : { protocolVersion: input.protocolVersion }),
        ...(credential ? { credential } : {})
      }, (event) => this.applySourceEvent(handle, event))
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
    if (this.connections.get(handle.monitorId) !== handle) return
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
    if (this.connections.get(handle.monitorId) !== handle) return
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
