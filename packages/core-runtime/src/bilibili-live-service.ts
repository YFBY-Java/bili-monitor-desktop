import {
  AddBilibiliLiveRoomInputSchema,
  BilibiliLiveCollectResultV2Schema as BilibiliLiveCollectResultSchema,
  BilibiliLiveEndpointSchema,
  BilibiliLiveFetchedOptionalSnapshotV2Schema as BilibiliLiveFetchedOptionalSnapshotSchema,
  BilibiliLiveFetchedSnapshotV2Schema as BilibiliLiveFetchedSnapshotSchema,
  BilibiliLiveFetchedStatusBatchV2Schema as BilibiliLiveFetchedStatusBatchSchema,
  BilibiliLiveRoomListV2Schema as BilibiliLiveRoomListSchema,
  BilibiliLiveRoomV2Schema as BilibiliLiveRoomSchema,
  BilibiliLiveStatusEventV2Schema as BilibiliLiveStatusEventSchema,
  BilibiliLiveSummaryV2Schema as BilibiliLiveSummarySchema,
  ListBilibiliLiveRoomsInputSchema,
  QueryBilibiliLiveEventsInputSchema,
  QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInputSchema,
  UpdateBilibiliLiveRoomSettingsInputSchema,
  UpdateBilibiliLiveRoomStatusInputSchema,
  createRuntimeEnvelope,
  type AddBilibiliLiveRoomInput,
  type BilibiliLiveCollectResultV2 as BilibiliLiveCollectResult,
  type BilibiliLiveFetchedOptionalSnapshotV2 as BilibiliLiveFetchedOptionalSnapshot,
  type BilibiliLiveFetchedSnapshotV2 as BilibiliLiveFetchedSnapshot,
  type BilibiliLiveFetchedStatusBatchV2 as BilibiliLiveFetchedStatusBatch,
  type BilibiliLiveRoomV2 as BilibiliLiveRoom,
  type BilibiliLiveRoomListV2 as BilibiliLiveRoomList,
  type BilibiliLiveRoomRequest,
  type BilibiliLiveRoomTrendV2 as BilibiliLiveRoomTrend,
  type BilibiliLiveSnapshotDataV2 as BilibiliLiveSnapshotData,
  type BilibiliLiveStatusByUidsRequest,
  type BilibiliLiveStatusEventV2 as BilibiliLiveStatusEvent,
  type BilibiliLiveSummaryV2 as BilibiliLiveSummary,
  type BilibiliLiveUidRequest,
  type ObjectRef
} from "@bmd/contracts"
import {
  ControlDatabase,
  compareLiveSnapshotTime,
  hasLiveSnapshotText,
  type BilibiliApiRequestMeta,
  type NewStoredOutboxMessage,
  type StoredBilibiliLiveRoomMonitor,
  type StoredBilibiliLiveRoomSnapshot
} from "@bmd/storage"

import * as legacyLive from "@bmd/contracts"
import { javaLongDelta, javaLongToBigInt } from "@bmd/contracts"
import { exactLiveFromLegacy, safeLiveLegacyProjection } from "./live-long64-projection"
import type { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"

import { CoreApplicationError } from "./account-subject-service"
import { LocalRequestRateLimiter } from "./local-request-rate-limiter"

const STATUS_ENDPOINT = "room/v1/Room/get_status_info_by_uids" as const
const INIT_ENDPOINT = "room/v1/Room/room_init" as const
const INFO_ENDPOINT = "room/v1/Room/get_info" as const
const OLD_INFO_ENDPOINT = "room/v1/Room/getRoomInfoOld" as const

export interface BilibiliLiveSource {
  fetchRoomInit: (request: BilibiliLiveRoomRequest) => Promise<legacyLive.BilibiliLiveFetchedSnapshot>
  fetchRoomInfo: (request: BilibiliLiveRoomRequest) => Promise<legacyLive.BilibiliLiveFetchedSnapshot>
  fetchRoomInfoOld: (request: BilibiliLiveUidRequest) => Promise<legacyLive.BilibiliLiveFetchedOptionalSnapshot>
  fetchStatusByUids: (request: BilibiliLiveStatusByUidsRequest) => Promise<legacyLive.BilibiliLiveFetchedStatusBatch>
  stop?: () => Promise<void>
}

export interface BilibiliLiveMonitorServiceOptions {
  database: ControlDatabase
  source: BilibiliLiveSource | Pick<BilibiliLiveWorkerSource, "fetchRoomInitV2" | "fetchRoomInfoV2" | "fetchRoomInfoOldV2" | "fetchStatusByUidsV2" | "stop">
  enabled?: boolean
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  rateLimiter?: LocalRequestRateLimiter
  requestMinIntervalMs?: number
  maxAttempts?: number
  retryBackoffMs?: number
  jitter?: () => number
  dueBatchSize?: number
  statusBatchSize?: number
  defaultIntervalSeconds?: number
  minIntervalSeconds?: number
  maxIntervalSeconds?: number
  shortIntervalWarningSeconds?: number
  failureBackoffSeconds?: number
  sessionObserver?: {
    reconcileRest: (
      room: StoredBilibiliLiveRoomMonitor,
      observation: {
        liveStatus: number
        liveTime: string | null
        title: string | null
        fetchedAt: string
      }
    ) => unknown
  }
}

interface ResolvedLiveSnapshot extends BilibiliLiveSnapshotData {
  fetchedAt: string
  sourceEndpoint: BilibiliLiveFetchedSnapshot["sourceEndpoint"]
  evidenceObject: ObjectRef
  rawPayloadStorageStatus?: BilibiliLiveFetchedSnapshot["rawPayloadStorageStatus"]
}

export interface PreparedBilibiliLiveMonitor {
  uid: string
  roomId: string
  commit: () => BilibiliLiveRoom
}

interface SourceErrorDetails {
  code: string
  message: string
  retryable: boolean
}

// Only failures from the platform/source boundary use the collection-failure workflow.
// SQLite or session transaction errors must not be mislabeled as platform errors.
class LiveFetchFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly endpoint: BilibiliLiveFetchedSnapshot["sourceEndpoint"]
  ) { super(message) }
}

export class BilibiliLiveMonitorService {
  private readonly rateLimiter: LocalRequestRateLimiter
  private readonly lifetime = new AbortController()
  private stopPromise: Promise<void> | undefined

  constructor(private readonly options: BilibiliLiveMonitorServiceOptions) {
    this.rateLimiter = options.rateLimiter ?? new LocalRequestRateLimiter(options.now)
  }


  async addRoom(input: AddBilibiliLiveRoomInput) {
    return legacyLive.BilibiliLiveRoomSchema.parse(safeLiveLegacyProjection(await this.addRoomV2(input)))
  }
  listRooms(input?: { limit?: number }) {
    return legacyLive.BilibiliLiveRoomListSchema.parse(safeLiveLegacyProjection(this.listRoomsV2(input)))
  }
  updateStatus(roomMonitorId: string, enabled: boolean) {
    return legacyLive.BilibiliLiveRoomSchema.parse(safeLiveLegacyProjection(this.updateStatusV2(roomMonitorId, enabled)))
  }
  updateInterval(roomMonitorId: string, intervalSeconds: number) {
    return legacyLive.BilibiliLiveRoomSchema.parse(safeLiveLegacyProjection(this.updateIntervalV2(roomMonitorId, intervalSeconds)))
  }
  async refreshNow(roomMonitorId: string) {
    return legacyLive.BilibiliLiveCollectResultSchema.parse(safeLiveLegacyProjection(await this.refreshNowV2(roomMonitorId)))
  }
  async collectDueRooms() {
    return legacyLive.BilibiliLiveCollectResultSchema.array().parse(safeLiveLegacyProjection(await this.collectDueRoomsV2()))
  }
  summary() { return legacyLive.BilibiliLiveSummarySchema.parse(safeLiveLegacyProjection(this.summaryV2())) }
  events(input: { limit?: number } = {}) {
    return legacyLive.BilibiliLiveStatusEventListSchema.parse(safeLiveLegacyProjection(this.eventsV2(input)))
  }
  trend(input: { roomMonitorId: string; from?: string; to?: string; limit?: number }) {
    return legacyLive.BilibiliLiveRoomTrendSchema.parse(safeLiveLegacyProjection(this.trendV2(input)))
  }
  trends(input: { roomMonitorIds?: string[]; from?: string; to?: string; limitPerRoom?: number } = {}) {
    return legacyLive.BilibiliLiveRoomTrendListSchema.parse(safeLiveLegacyProjection(this.trendsV2(input)))
  }

  async addRoomV2(input: AddBilibiliLiveRoomInput): Promise<BilibiliLiveRoom> {
    return (await this.prepareAddRoomV2(input)).commit()
  }

  /** Preserve normal resolution/retries, but postpone monitor/session writes. */
  async prepareAddRoomV2(input: AddBilibiliLiveRoomInput): Promise<PreparedBilibiliLiveMonitor> {
    this.ensureRunning()
    const parsed = AddBilibiliLiveRoomInputSchema.parse(input)
    const intervalSeconds = this.resolveInterval(parsed.intervalSeconds)
    const taskId = this.options.idFactory()
    let snapshot: ResolvedLiveSnapshot
    try {
      snapshot = parsed.roomId
        ? await this.fetchByRoomIdWithDetails(parsed.roomId, taskId)
        : await this.fetchByUidWithDetails(parsed.uid as string, taskId)
    } catch (error) {
      this.ensureRunning()
      if (error instanceof LiveFetchFailure) throw this.applicationError(error)
      throw error
    }
    this.ensureRunning()
    return {
      uid: snapshot.uid,
      roomId: snapshot.roomId,
      commit: () => this.addFetchedRoom(snapshot, intervalSeconds, taskId)
    }
  }

  private addFetchedRoom(
    snapshot: ResolvedLiveSnapshot,
    intervalSeconds: number,
    taskId: string
  ): BilibiliLiveRoom {
    this.ensureRunning()
    const existing = this.options.database.findBilibiliLiveRoomByUid(snapshot.uid)
      ?? this.options.database.findBilibiliLiveRoomByRoomId(snapshot.roomId)
    const monitorId = existing?.monitorId ?? this.options.idFactory()
    this.persistSnapshot(
      existing,
      monitorId,
      snapshot,
      intervalSeconds,
      taskId,
      "bilibili.live.monitor-added"
    )
    return this.requireRoom(existing?.monitorId ?? monitorId)
  }

  listRoomsV2(input?: { limit?: number }): BilibiliLiveRoomList {
    const query = ListBilibiliLiveRoomsInputSchema.parse(input ?? {})
    const items = this.options.database.listBilibiliLiveRooms(query.limit)
      .map((room) => this.toRoomView(
        room,
        this.options.database.findBilibiliLiveRoomSnapshots(room.monitorId, { limit: 48 })
      ))
    return BilibiliLiveRoomListSchema.parse({
      items,
      total: items.length,
      snapshotAt: this.options.now().toISOString()
    })
  }

  updateStatusV2(roomMonitorId: string, enabled: boolean): BilibiliLiveRoom {
    this.ensureRunning()
    const input = UpdateBilibiliLiveRoomStatusInputSchema.parse({ roomMonitorId, enabled })
    this.requireStoredRoom(input.roomMonitorId)
    const timestamp = this.options.now().toISOString()
    this.options.database.updateBilibiliLiveRoomStatus(
      input.roomMonitorId,
      input.enabled,
      timestamp,
      this.outbox(this.options.idFactory(), "bilibili.live.monitor-status-updated", timestamp, input)
    )
    return this.requireRoom(input.roomMonitorId)
  }

  updateIntervalV2(roomMonitorId: string, intervalSeconds: number): BilibiliLiveRoom {
    this.ensureRunning()
    const input = UpdateBilibiliLiveRoomSettingsInputSchema.parse({ roomMonitorId, intervalSeconds })
    this.requireStoredRoom(input.roomMonitorId)
    this.resolveInterval(input.intervalSeconds)
    const timestamp = this.options.now().toISOString()
    const nextCollectAt = new Date(this.options.now().getTime() + input.intervalSeconds * 1_000)
      .toISOString()
    this.options.database.updateBilibiliLiveRoomInterval(
      input.roomMonitorId,
      input.intervalSeconds,
      nextCollectAt,
      timestamp,
      this.outbox(this.options.idFactory(), "bilibili.live.monitor-settings-updated", timestamp, input)
    )
    return this.requireRoom(input.roomMonitorId)
  }

  async refreshNowV2(roomMonitorId: string): Promise<BilibiliLiveCollectResult> {
    this.ensureRunning()
    const room = this.requireStoredRoom(roomMonitorId)
    const taskId = this.options.idFactory()
    try {
      const snapshot = this.withExistingProfile(await this.fetchByUidWithDetails(room.uid, taskId), room)
      const applied = this.persistSnapshot(
        room,
        room.monitorId,
        snapshot,
        room.intervalSeconds,
        taskId,
        "bilibili.live.snapshot-collected"
      )
      return this.collectResult(room.monitorId, snapshot, true, applied ? "ok" : "ignored-stale")
    } catch (error) {
      this.ensureRunning()
      if (!(error instanceof LiveFetchFailure)) throw error
      this.markFailure(room, error)
      throw this.applicationError(error)
    }
  }

  async collectDueRoomsV2(): Promise<BilibiliLiveCollectResult[]> {
    if (this.lifetime.signal.aborted || this.options.enabled === false) return []
    const rooms = this.options.database.findDueBilibiliLiveRooms(
      this.options.now().toISOString(),
      Math.max(1, this.options.dueBatchSize ?? 20)
    )
    const results: BilibiliLiveCollectResult[] = []
    const batchSize = Math.max(1, this.options.statusBatchSize ?? 30)
    for (let start = 0; start < rooms.length; start += batchSize) {
      if (this.lifetime.signal.aborted) break
      const batchRooms = rooms.slice(start, start + batchSize)
      const taskId = this.options.idFactory()
      let batch: BilibiliLiveFetchedStatusBatch
      try {
        batch = await this.fetchStatusBatch(batchRooms.map((room) => room.uid), taskId)
      } catch (error) {
        // Local cancellation is not a platform failure and must preserve the saved due time.
        if (this.lifetime.signal.aborted) break
        if (!(error instanceof LiveFetchFailure)) throw error
        for (const room of batchRooms) {
          this.markFailure(room, error)
          results.push(this.failedCollectResult(room, error))
        }
        continue
      }
      for (const room of batchRooms) {
        if (this.lifetime.signal.aborted) break
        const found = batch.snapshots.find((snapshot) => snapshot.uid === room.uid)
        if (!found) {
          const error = new LiveFetchFailure("BILIBILI_UNKNOWN_ERROR",
            `Bilibili live status response missing uid=${room.uid}`, true, STATUS_ENDPOINT)
          this.markFailure(room, error)
          results.push(this.failedCollectResult(room, error))
          continue
        }
        const snapshot = this.withExistingProfile(this.enrichStatusSnapshot(found, batch), room)
        const applied = this.persistSnapshot(room, room.monitorId, snapshot, room.intervalSeconds,
          taskId, "bilibili.live.snapshot-collected")
        results.push(this.collectResult(room.monitorId, snapshot, true, applied ? "ok" : "ignored-stale"))
      }
    }
    return results
  }

  summaryV2(): BilibiliLiveSummary {
    const rooms = this.options.database.listBilibiliLiveRooms()
    const events = this.options.database.listBilibiliLiveStatusEvents(1)
    const liveRooms = rooms.filter((room) => room.liveStatus === 1)
    const roundRooms = rooms.filter((room) => room.liveStatus === 2)
    const startOfDay = chinaStartOfDay(this.options.now()).toISOString()
    return BilibiliLiveSummarySchema.parse({
      totalRooms: rooms.length,
      activeRooms: rooms.filter((room) => room.monitorStatus === "ACTIVE").length,
      liveRooms: liveRooms.length,
      roundRooms: roundRooms.length,
      offlineRooms: Math.max(0, rooms.length - liveRooms.length - roundRooms.length),
      errorRooms: rooms.filter((room) => room.lastErrorType !== null).length,
      totalOnlineCount: BigInt.asIntN(64, liveRooms.reduce((sum, room) => sum + (room.onlineCount ?? 0n), 0n)).toString(),
      todayLiveStarts: this.options.database.countTodayBilibiliLiveStarts(startOfDay),
      ...(events[0] ? { latestEvent: this.toEventView(events[0]) } : {})
    })
  }

  eventsV2(input: { limit?: number } = {}): BilibiliLiveStatusEvent[] {
    const query = QueryBilibiliLiveEventsInputSchema.parse(input)
    return this.options.database.listBilibiliLiveStatusEvents(query.limit).map((event) =>
      BilibiliLiveStatusEventSchema.parse({
        id: event.eventId,
        monitorId: event.monitorId,
        uid: event.uid,
        roomId: event.roomId,
        eventType: event.eventType,
        ...(event.fromLiveStatus !== null ? { fromLiveStatus: event.fromLiveStatus } : {}),
        ...(event.toLiveStatus !== null ? { toLiveStatus: event.toLiveStatus } : {}),
        ...(event.titleBefore ? { titleBefore: event.titleBefore } : {}),
        ...(event.titleAfter ? { titleAfter: event.titleAfter } : {}),
        ...(event.onlineCount !== null ? { onlineCount: event.onlineCount.toString() } : {}),
        occurredAt: event.occurredAt
      })
    )
  }

  trendV2(input: {
    roomMonitorId: string
    from?: string
    to?: string
    limit?: number
  }): BilibiliLiveRoomTrend {
    const query = QueryBilibiliLiveTrendInputSchema.parse(input)
    const room = this.requireStoredRoom(query.roomMonitorId)
    const snapshots = this.options.database.findBilibiliLiveRoomSnapshots(room.monitorId, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limit
    })
    return {
      room: this.toRoomView(room, snapshots),
      points: snapshots.map(toTrendPoint)
    }
  }

  trendsV2(input: {
    roomMonitorIds?: string[]
    from?: string
    to?: string
    limitPerRoom?: number
  } = {}): BilibiliLiveRoomTrend[] {
    const query = QueryBilibiliLiveTrendsInputSchema.parse(input)
    const rooms = query.roomMonitorIds.length === 0
      ? this.options.database.listBilibiliLiveRooms()
      : query.roomMonitorIds.map((id) => this.requireStoredRoom(id))
    return rooms.map((room) => this.trendV2({
      roomMonitorId: room.monitorId,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limitPerRoom
    }))
  }

  deleteRoom(roomMonitorId: string): void {
    this.ensureRunning()
    const room = this.requireStoredRoom(roomMonitorId)
    const timestamp = this.options.now().toISOString()
    this.options.database.deleteBilibiliLiveRoom(
      room.monitorId,
      this.outbox(this.options.idFactory(), "bilibili.live.monitor-deleted", timestamp, {
        roomMonitorId: room.monitorId,
        uid: room.uid,
        roomId: room.roomId,
        cascades: ["bilibili_live_room_snapshot", "bilibili_live_status_event"]
      })
    )
  }

  stop(): Promise<void> {
    if (!this.stopPromise) {
      this.lifetime.abort()
      this.stopPromise = Promise.resolve().then(() => this.options.source.stop?.())
    }
    return this.stopPromise
  }

  private async fetchByRoomIdWithDetails(roomId: string, taskId: string): Promise<ResolvedLiveSnapshot> {
    const init = await this.fetchRoomInit(roomId, taskId)
    const info = await this.fetchRoomInfo(init.roomId, taskId)
    const batch = await this.fetchStatusBatch([init.uid], taskId)
    const statusData = batch.snapshots.find((snapshot) => snapshot.uid === init.uid)
    const status = statusData ? this.enrichStatusSnapshot(statusData, batch) : undefined
    return mergeSnapshot(mergeSnapshot(status ?? info, info), init)
  }

  private async fetchByUidWithDetails(uid: string, taskId: string): Promise<ResolvedLiveSnapshot> {
    const batch = await this.fetchStatusBatch([uid], taskId)
    const statusData = batch.snapshots.find((snapshot) => snapshot.uid === uid)
    if (statusData) {
      const status = this.enrichStatusSnapshot(statusData, batch)
      const info = await this.fetchRoomInfo(status.roomId, taskId)
      return mergeSnapshot(status, info)
    }

    const old = await this.fetchRoomInfoOld(uid, taskId)
    if (!old.snapshot) {
      throw new LiveFetchFailure(
        "BILIBILI_UNKNOWN_ERROR",
        `该 UID 暂无公开直播间或接口未返回房间信息：${uid}`,
        false,
        OLD_INFO_ENDPOINT
      )
    }
    const oldSnapshot: ResolvedLiveSnapshot = {
      ...old.snapshot,
      fetchedAt: old.fetchedAt,
      sourceEndpoint: old.sourceEndpoint,
      evidenceObject: old.evidenceObject,
      ...(old.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: old.rawPayloadStorageStatus } : {})
    }
    const init = await this.fetchRoomInit(old.snapshot.roomId, taskId)
    const info = await this.fetchRoomInfo(init.roomId, taskId)
    return mergeSnapshot(mergeSnapshot(info, init), oldSnapshot)
  }

  private fetchRoomInit(roomId: string, taskId: string): Promise<BilibiliLiveFetchedSnapshot> {
    return this.fetchWithRetry(
      INIT_ENDPOINT,
      roomId,
      taskId,
      (request) => "fetchRoomInitV2" in this.options.source
        ? this.options.source.fetchRoomInitV2({ ...request, roomId })
        : this.options.source.fetchRoomInit({ ...request, roomId }).then(exactLiveFromLegacy).then(BilibiliLiveFetchedSnapshotSchema.parse),
      BilibiliLiveFetchedSnapshotSchema.parse,
      { roomId }
    )
  }

  private fetchRoomInfo(roomId: string, taskId: string): Promise<BilibiliLiveFetchedSnapshot> {
    return this.fetchWithRetry(
      INFO_ENDPOINT,
      roomId,
      taskId,
      (request) => "fetchRoomInfoV2" in this.options.source
        ? this.options.source.fetchRoomInfoV2({ ...request, roomId })
        : this.options.source.fetchRoomInfo({ ...request, roomId }).then(exactLiveFromLegacy).then(BilibiliLiveFetchedSnapshotSchema.parse),
      BilibiliLiveFetchedSnapshotSchema.parse,
      { roomId }
    )
  }

  private fetchRoomInfoOld(uid: string, taskId: string): Promise<BilibiliLiveFetchedOptionalSnapshot> {
    return this.fetchWithRetry(
      OLD_INFO_ENDPOINT,
      uid,
      taskId,
      (request) => "fetchRoomInfoOldV2" in this.options.source
        ? this.options.source.fetchRoomInfoOldV2({ ...request, uid })
        : this.options.source.fetchRoomInfoOld({ ...request, uid }).then(exactLiveFromLegacy).then(BilibiliLiveFetchedOptionalSnapshotSchema.parse),
      BilibiliLiveFetchedOptionalSnapshotSchema.parse,
      { uid }
    )
  }

  private fetchStatusBatch(uids: string[], taskId: string): Promise<BilibiliLiveFetchedStatusBatch> {
    return this.fetchWithRetry(
      STATUS_ENDPOINT,
      uids.join(","),
      taskId,
      (request) => "fetchStatusByUidsV2" in this.options.source
        ? this.options.source.fetchStatusByUidsV2({ ...request, uids })
        : this.options.source.fetchStatusByUids({ ...request, uids }).then(exactLiveFromLegacy).then(BilibiliLiveFetchedStatusBatchSchema.parse),
      BilibiliLiveFetchedStatusBatchSchema.parse,
      { uids }
    )
  }

  private async fetchWithRetry<T extends FetchMetadata>(
    endpoint: BilibiliLiveFetchedSnapshot["sourceEndpoint"],
    identifier: string,
    taskId: string,
    operation: (request: { taskId: string; attempt: number; leaseId: string }) => Promise<T>,
    validate: (value: unknown) => T,
    requestMeta: BilibiliApiRequestMeta
  ): Promise<T> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.ensureRunning()
      const startedAt = performance.now()
      await this.acquireRateLimit(endpoint)
      this.ensureRunning()
      let result: T
      try {
        const response = await operation({
          taskId,
          attempt,
          leaseId: this.options.idFactory()
        })
        this.ensureRunning()
        result = validate(response)
      } catch (error) {
        this.ensureRunning()
        const details = this.sourceError(error)
        // Original MediaType/charset conversion failures bypass fetch handlers:
        // no platform failure log, retry, backoff or monitor mutation.
        if (details.code === "BILIBILI_RESPONSE_CONVERSION_ERROR") {
          throw new CoreApplicationError("INTERNAL_ERROR", details.message, false)
        }
        const sourceEndpoint = BilibiliLiveEndpointSchema.safeParse(
          typeof error === "object" && error !== null && "endpoint" in error ? error.endpoint : undefined
        )
        const failure = new LiveFetchFailure(details.code, details.message, details.retryable,
          sourceEndpoint.success ? sourceEndpoint.data : endpoint)
        const biliCode = this.errorNumber(error, "biliCode")
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: failure.endpoint,
          mid: identifier,
          statusCode: this.errorNumber(error, "statusCode"),
          durationMs: Math.max(0, Math.floor(performance.now() - startedAt)),
          errorType: details.code,
          retryable: details.retryable,
          evidenceObjectId: null,
          requestMeta,
          responseMeta: { success: false, message: details.message,
            ...(biliCode === null ? {} : { biliCode }) },
          createdAt: this.options.now().toISOString()
        })
        const canRetry = ["BILIBILI_RATE_LIMITED", "BILIBILI_NETWORK_ERROR", "BILIBILI_SERVER_ERROR"].includes(details.code)
        if (!canRetry || attempt >= maxAttempts || attempt > 3) throw failure
        const backoff = Math.max(100, this.options.retryBackoffMs ?? 1_500)
          * (2 ** Math.min(attempt - 1, 4))
        const jitter = Math.floor((this.options.jitter?.() ?? Math.random()) * 300)
        await this.wait(backoff + jitter)
        continue
      }
      this.options.database.insertBilibiliApiCall({
        callId: this.options.idFactory(), taskId, attempt, endpointKey: endpoint, mid: identifier,
        statusCode: result.statusCode, durationMs: Math.max(0, Math.floor(performance.now() - startedAt)), errorType: null, retryable: false,
        evidenceObjectId: result.evidenceObject.objectId, createdAt: result.fetchedAt,
        requestMeta, responseMeta: { success: true }
      }, { ...result.evidenceObject, createdAt: result.fetchedAt })
      return result
    }
    throw new LiveFetchFailure("BILIBILI_UNKNOWN_ERROR", "Unknown Bilibili live fetch failure.", false, endpoint)
  }

  private async acquireRateLimit(endpoint: string): Promise<void> {
    await this.rateLimiter.acquire({ platformCode: "bilibili-live", policyKey: endpoint,
      minIntervalMs: Math.max(0, this.options.requestMinIntervalMs ?? 1_500), signal: this.lifetime.signal,
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}) })
  }

  private ensureRunning(): void {
    if (this.lifetime.signal.aborted) {
      throw new CoreApplicationError("CORE_STOPPED", "本地直播采集已停止。", false)
    }
  }

  private async wait(milliseconds: number): Promise<void> {
    this.ensureRunning()
    if (this.options.sleep) {
      await this.options.sleep(milliseconds)
    } else {
      // Original int backoff multiplied by exponential retry/jitter can exceed a Node timer.
      // Node would otherwise reduce an overflowing timeout to 1ms.
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

  private enrichStatusSnapshot(
    snapshot: BilibiliLiveSnapshotData,
    batch: BilibiliLiveFetchedStatusBatch
  ): ResolvedLiveSnapshot {
    return {
      ...snapshot,
      fetchedAt: batch.fetchedAt,
      sourceEndpoint: batch.sourceEndpoint,
      evidenceObject: batch.evidenceObject,
      ...(batch.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: batch.rawPayloadStorageStatus } : {})
    }
  }

  private withExistingProfile(
    snapshot: ResolvedLiveSnapshot,
    room: StoredBilibiliLiveRoomMonitor
  ): ResolvedLiveSnapshot {
    return mergeSnapshot(snapshot, {
      uid: room.uid,
      roomId: room.roomId,
      ...(room.shortId ? { shortId: room.shortId } : {}),
      uname: room.uname,
      ...(room.faceUrl ? { faceUrl: room.faceUrl } : {}),
      ...(room.title ? { title: room.title } : {}),
      ...(room.coverUrl ? { coverUrl: room.coverUrl } : {}),
      ...(room.keyframeUrl ? { keyframeUrl: room.keyframeUrl } : {}),
      ...(room.areaId ? { areaId: room.areaId } : {}),
      ...(room.areaName ? { areaName: room.areaName } : {}),
      ...(room.parentAreaId ? { parentAreaId: room.parentAreaId } : {}),
      ...(room.parentAreaName ? { parentAreaName: room.parentAreaName } : {}),
      liveStatus: room.liveStatus as 0 | 1 | 2,
      ...(room.attentionCount !== null ? { attentionCount: room.attentionCount.toString() } : {}),
      fetchedAt: snapshot.fetchedAt,
      sourceEndpoint: snapshot.sourceEndpoint,
      evidenceObject: snapshot.evidenceObject
    })
  }

  private persistSnapshot(
    previous: StoredBilibiliLiveRoomMonitor | undefined,
    monitorId: string,
    snapshot: ResolvedLiveSnapshot,
    intervalSeconds: number,
    taskId: string,
    topic: string
  ): boolean {
    this.ensureRunning()
    // Match the original snapshot application transaction: room, events, snapshot and session.
    return this.options.database.runInTransaction(() => {
      const initializing = topic === "bilibili.live.monitor-added"
      const current = initializing ? previous : this.requireStoredRoom(monitorId)
      const pending = this.options.database.findActiveBilibiliLiveSession(monitorId)
      const stale = [current?.lastSnapshotAt, current?.lastSuccessAt]
        .some((value) => value && compareLiveSnapshotTime(value, snapshot.fetchedAt) > 0)
      const olderThanPending = pending?.state === "END_PENDING" && pending.endSignalAt
        && compareLiveSnapshotTime(pending.endSignalAt, snapshot.fetchedAt) > 0
      if (stale || olderThanPending) {
        // Explicit re-add still applies settings, but cannot roll back observed platform state.
        if (initializing && current) {
          const timestamp = this.options.now().toISOString()
          this.options.database.updateBilibiliLiveRoomInterval(
            current.monitorId, intervalSeconds,
            timestamp, timestamp,
            this.outbox(this.options.idFactory(), "bilibili.live.monitor-settings-updated", timestamp, {
              roomMonitorId: current.monitorId, intervalSeconds
            })
          )
          this.updateStatusV2(current.monitorId, true)
        }
        return false
      }
      return this.applySnapshot(
        current, monitorId, snapshot,
        initializing ? intervalSeconds : current!.intervalSeconds, taskId, topic
      )
    })
  }

  private applySnapshot(
    previous: StoredBilibiliLiveRoomMonitor | undefined,
    monitorId: string,
    snapshot: ResolvedLiveSnapshot,
    intervalSeconds: number,
    taskId: string,
    topic: string
  ): boolean {
    const resolved = snapshot
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(resolved.fetchedAt).getTime() + intervalSeconds * 1_000
    ).toISOString()
    const applied = this.options.database.applyBilibiliLiveRoomSnapshot({
      reactivate: topic === "bilibili.live.monitor-added",
      appliedAt: this.options.now().toISOString(),
      monitor: {
        monitorId,
        uid: resolved.uid,
        roomId: resolved.roomId,
        shortId: resolved.shortId ?? null,
        uname: resolved.uname ?? `UID ${resolved.uid}`,
        faceUrl: resolved.faceUrl ?? null,
        title: resolved.title ?? null,
        coverUrl: resolved.coverUrl ?? null,
        keyframeUrl: resolved.keyframeUrl ?? null,
        areaId: resolved.areaId ?? null,
        areaName: resolved.areaName ?? null,
        parentAreaId: resolved.parentAreaId ?? null,
        parentAreaName: resolved.parentAreaName ?? null,
        liveStatus: resolved.liveStatus,
        liveTime: resolved.liveTime ?? null,
        onlineCount: resolved.onlineCount === undefined ? null : javaLongToBigInt(resolved.onlineCount),
        attentionCount: resolved.attentionCount === undefined ? null : javaLongToBigInt(resolved.attentionCount),
        intervalSeconds,
        nextCollectAt,
        capturedAt: resolved.fetchedAt,
        sourceEndpoint: resolved.sourceEndpoint
      },
      snapshot: {
        snapshotId: this.options.idFactory(),
        capturedBucket: capturedBucket(resolved.fetchedAt),
        ...(resolved.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: resolved.rawPayloadStorageStatus } : {})
      },
      artifact: {
        ...resolved.evidenceObject,
        createdAt: resolved.fetchedAt
      },
      outbox: this.outbox(eventId, `${topic}.v2`, resolved.fetchedAt, {
        roomMonitorId: previous?.monitorId ?? monitorId,
        taskId,
        uid: resolved.uid,
        roomId: resolved.roomId,
        liveStatus: resolved.liveStatus,
        onlineCount: resolved.onlineCount,
        sourceEndpoint: resolved.sourceEndpoint
      })
    }, (room) => {
      this.options.sessionObserver?.reconcileRest(room, {
        liveStatus: resolved.liveStatus,
        liveTime: resolved.liveTime ?? null,
        title: resolved.title ?? null,
        fetchedAt: resolved.fetchedAt
      })
    })
    return applied
  }

  private resolveInterval(requested?: number): number {
    const interval = requested ?? this.options.defaultIntervalSeconds ?? 300
    const minimum = Math.max(1, this.options.minIntervalSeconds ?? 1)
    const maximum = Math.max(minimum, this.options.maxIntervalSeconds ?? 2_592_000)
    if (interval < minimum) throw new CoreApplicationError("BILIBILI_LIVE_INTERVAL_INVALID",
      `采集间隔不能低于 ${minimum} 秒，避免过于频繁请求 B站直播接口。`)
    if (interval > maximum) throw new CoreApplicationError("BILIBILI_LIVE_INTERVAL_INVALID",
      `采集间隔不能超过 ${maximum} 秒。`)
    if (interval < Math.max(1, this.options.shortIntervalWarningSeconds ?? 120)) {
      console.warn(JSON.stringify({ event: "bilibili.live.short-interval", timestamp: this.options.now().toISOString(),
        intervalSeconds: interval, requestMinIntervalMs: this.options.requestMinIntervalMs ?? 1500 }))
    }
    return interval
  }

  private markFailure(room: StoredBilibiliLiveRoomMonitor, error: unknown): void {
    this.ensureRunning()
    const details = this.sourceError(error)
    const errorAt = this.options.now().toISOString()
    const backoffSeconds = Math.max(60, Math.min(room.intervalSeconds, this.options.failureBackoffSeconds ?? 900))
    const nextCollectAt = new Date(this.options.now().getTime() + backoffSeconds * 1_000)
      .toISOString()
    this.options.database.markBilibiliLiveRoomFailure({
      monitorId: room.monitorId,
      eventContext: room,
      nextCollectAt,
      errorAt,
      errorType: details.code,
      errorMessage: details.message,
      eventId: this.options.idFactory(),
      outbox: this.outbox(this.options.idFactory(), "bilibili.live.collection-failed", errorAt, {
        roomMonitorId: room.monitorId,
        uid: room.uid,
        roomId: room.roomId,
        errorType: details.code,
        retryable: details.retryable,
        nextCollectAt
      })
    })
  }

  private requireStoredRoom(roomMonitorId: string): StoredBilibiliLiveRoomMonitor {
    const room = this.options.database.findBilibiliLiveRoomById(roomMonitorId)
    if (!room) throw new CoreApplicationError(
      "BILIBILI_LIVE_MONITOR_NOT_FOUND",
      `监控直播间不存在：${roomMonitorId}`
    )
    return room
  }

  private requireRoom(roomMonitorId: string): BilibiliLiveRoom {
    const room = this.requireStoredRoom(roomMonitorId)
    return this.toRoomView(
      room,
      this.options.database.findBilibiliLiveRoomSnapshots(room.monitorId, { limit: 48 })
    )
  }

  private toRoomView(
    room: StoredBilibiliLiveRoomMonitor,
    snapshots: StoredBilibiliLiveRoomSnapshot[]
  ): BilibiliLiveRoom {
    const previous = snapshots.length < 2 ? undefined : snapshots.at(-2)?.onlineCount
    const delta = previous === undefined || previous === null || room.onlineCount === null
      ? undefined
      : javaLongDelta(room.onlineCount, previous).toString()
    return BilibiliLiveRoomSchema.parse({
      id: room.monitorId,
      uid: room.uid,
      roomId: room.roomId,
      ...(room.shortId ? { shortId: room.shortId } : {}),
      uname: room.uname,
      ...(room.faceUrl ? { faceUrl: room.faceUrl } : {}),
      ...(room.title ? { title: room.title } : {}),
      ...(room.coverUrl ? { coverUrl: room.coverUrl } : {}),
      ...(room.keyframeUrl ? { keyframeUrl: room.keyframeUrl } : {}),
      ...(room.areaId ? { areaId: room.areaId } : {}),
      ...(room.areaName ? { areaName: room.areaName } : {}),
      ...(room.parentAreaId ? { parentAreaId: room.parentAreaId } : {}),
      ...(room.parentAreaName ? { parentAreaName: room.parentAreaName } : {}),
      liveStatus: room.liveStatus,
      ...(room.liveTime ? { liveTime: room.liveTime } : {}),
      ...(room.onlineCount !== null ? { onlineCount: room.onlineCount.toString() } : {}),
      ...(room.attentionCount !== null ? { attentionCount: room.attentionCount.toString() } : {}),
      ...(delta !== undefined ? { onlineDelta: delta } : {}),
      monitorStatus: room.monitorStatus,
      intervalSeconds: room.intervalSeconds,
      ...(room.nextCollectAt ? { nextCollectAt: room.nextCollectAt } : {}),
      ...(room.lastSnapshotAt ? { lastSnapshotAt: room.lastSnapshotAt } : {}),
      ...(room.lastSuccessAt ? { lastSuccessAt: room.lastSuccessAt } : {}),
      ...(room.lastErrorAt ? { lastErrorAt: room.lastErrorAt } : {}),
      ...(room.lastErrorType ? { lastErrorType: room.lastErrorType } : {}),
      ...(room.lastErrorMessage ? { lastErrorMessage: room.lastErrorMessage } : {}),
      ...(room.backoffUntil ? { backoffUntil: room.backoffUntil } : {}),
      ...(room.sourceEndpoint ? { sourceEndpoint: room.sourceEndpoint } : {}),
      recentTrend: snapshots.map(toTrendPoint),
      version: room.version
    })
  }

  private toEventView(event: ReturnType<ControlDatabase["listBilibiliLiveStatusEvents"]>[number]): BilibiliLiveStatusEvent {
    return BilibiliLiveStatusEventSchema.parse({
      id: event.eventId,
      monitorId: event.monitorId,
      uid: event.uid,
      roomId: event.roomId,
      eventType: event.eventType,
      ...(event.fromLiveStatus !== null ? { fromLiveStatus: event.fromLiveStatus } : {}),
      ...(event.toLiveStatus !== null ? { toLiveStatus: event.toLiveStatus } : {}),
      ...(event.titleBefore ? { titleBefore: event.titleBefore } : {}),
      ...(event.titleAfter ? { titleAfter: event.titleAfter } : {}),
      ...(event.onlineCount !== null ? { onlineCount: event.onlineCount.toString() } : {}),
      occurredAt: event.occurredAt
    })
  }

  private collectResult(
    roomMonitorId: string,
    snapshot: ResolvedLiveSnapshot,
    success: boolean,
    message: string
  ): BilibiliLiveCollectResult {
    return BilibiliLiveCollectResultSchema.parse({
      roomMonitorId,
      uid: snapshot.uid,
      roomId: snapshot.roomId,
      success,
      liveStatus: snapshot.liveStatus,
      ...(snapshot.onlineCount !== undefined ? { onlineCount: snapshot.onlineCount.toString() } : {}),
      capturedAt: snapshot.fetchedAt,
      sourceEndpoint: snapshot.sourceEndpoint,
      message
    })
  }

  private failedCollectResult(
    room: StoredBilibiliLiveRoomMonitor,
    error: LiveFetchFailure
  ): BilibiliLiveCollectResult {
    return BilibiliLiveCollectResultSchema.parse({
      roomMonitorId: room.monitorId,
      uid: room.uid,
      roomId: room.roomId,
      success: false,
      liveStatus: room.liveStatus,
      ...(room.onlineCount !== null ? { onlineCount: room.onlineCount.toString() } : {}),
      capturedAt: this.options.now().toISOString(),
      sourceEndpoint: error.endpoint,
      message: error.message
    })
  }

  private applicationError(error: unknown): CoreApplicationError {
    const details = this.sourceError(error)
    return new CoreApplicationError(details.code, details.message, details.retryable)
  }

  private sourceError(error: unknown): SourceErrorDetails {
    if (typeof error !== "object" || error === null) {
      return { code: "BILIBILI_UNKNOWN_ERROR", message: String(error), retryable: false }
    }
    const code = "code" in error && typeof error.code === "string"
      ? error.code
      : "BILIBILI_UNKNOWN_ERROR"
    const retryable = "retryable" in error && typeof error.retryable === "boolean"
      ? error.retryable
      : false
    return {
      code,
      message: error instanceof Error ? error.message : String(error),
      retryable
    }
  }

  private errorNumber(error: unknown, property: string): number | null {
    if (typeof error !== "object" || error === null || !(property in error)) return null
    const value = (error as Record<string, unknown>)[property]
    return typeof value === "number" && Number.isFinite(value) ? value : null
  }

  private outbox(
    messageId: string,
    topic: string,
    timestamp: string,
    payload: Record<string, unknown>
  ): NewStoredOutboxMessage {
    return {
      messageId,
      topic,
      envelopeJson: JSON.stringify(createRuntimeEnvelope({
        id: messageId,
        type: topic,
        timestamp,
        correlationId: messageId,
        traceId: messageId,
        payload
      })),
      createdAt: timestamp
    }
  }
}

interface FetchMetadata {
  fetchedAt: string
  evidenceObject: ObjectRef
  statusCode: number
  durationMs: number
}

function mergeSnapshot(primary: ResolvedLiveSnapshot, fallback: ResolvedLiveSnapshot): ResolvedLiveSnapshot {
  return {
    uid: primary.uid ?? fallback.uid,
    roomId: primary.roomId ?? fallback.roomId,
    ...(primary.shortId ?? fallback.shortId ? { shortId: primary.shortId ?? fallback.shortId } : {}),
    ...(firstText(primary.uname, fallback.uname) !== undefined ? { uname: firstText(primary.uname, fallback.uname) } : {}),
    ...(firstText(primary.faceUrl, fallback.faceUrl) !== undefined ? { faceUrl: firstText(primary.faceUrl, fallback.faceUrl) } : {}),
    ...(firstText(primary.title, fallback.title) !== undefined ? { title: firstText(primary.title, fallback.title) } : {}),
    ...(firstText(primary.coverUrl, fallback.coverUrl) !== undefined ? { coverUrl: firstText(primary.coverUrl, fallback.coverUrl) } : {}),
    ...(firstText(primary.keyframeUrl, fallback.keyframeUrl) !== undefined ? { keyframeUrl: firstText(primary.keyframeUrl, fallback.keyframeUrl) } : {}),
    ...(primary.areaId ?? fallback.areaId ? { areaId: primary.areaId ?? fallback.areaId } : {}),
    ...(firstText(primary.areaName, fallback.areaName) !== undefined ? { areaName: firstText(primary.areaName, fallback.areaName) } : {}),
    ...(primary.parentAreaId ?? fallback.parentAreaId ? { parentAreaId: primary.parentAreaId ?? fallback.parentAreaId } : {}),
    ...(firstText(primary.parentAreaName, fallback.parentAreaName) !== undefined ? { parentAreaName: firstText(primary.parentAreaName, fallback.parentAreaName) } : {}),
    liveStatus: primary.liveStatus ?? fallback.liveStatus,
    ...(primary.liveTime ?? fallback.liveTime ? { liveTime: primary.liveTime ?? fallback.liveTime } : {}),
    ...(primary.onlineCount ?? fallback.onlineCount ?? undefined) !== undefined
      ? { onlineCount: primary.onlineCount ?? fallback.onlineCount }
      : {},
    ...(primary.attentionCount ?? fallback.attentionCount ?? undefined) !== undefined
      ? { attentionCount: primary.attentionCount ?? fallback.attentionCount }
      : {},
    fetchedAt: primary.fetchedAt,
    sourceEndpoint: primary.sourceEndpoint,
    evidenceObject: primary.evidenceObject,
    ...(primary.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: primary.rawPayloadStorageStatus } : {})
  } as ResolvedLiveSnapshot
}

function toTrendPoint(snapshot: StoredBilibiliLiveRoomSnapshot) {
  return {
    roomId: snapshot.roomId,
    uid: snapshot.uid,
    capturedAt: snapshot.capturedAt,
    liveStatus: snapshot.liveStatus as 0 | 1 | 2,
    ...(snapshot.onlineCount !== null ? { onlineCount: snapshot.onlineCount.toString() } : {}),
    ...(snapshot.attentionCount !== null ? { attentionCount: snapshot.attentionCount.toString() } : {}),
    sourceEndpoint: snapshot.sourceEndpoint as BilibiliLiveFetchedSnapshot["sourceEndpoint"]
  }
}

function capturedBucket(value: string): string {
  const timestamp = new Date(value)
  timestamp.setUTCMilliseconds(0)
  return timestamp.toISOString()
}

function chinaStartOfDay(now: Date): Date {
  const china = new Date(now.getTime() + 8 * 60 * 60 * 1_000)
  return new Date(Date.UTC(china.getUTCFullYear(), china.getUTCMonth(), china.getUTCDate()) - 8 * 60 * 60 * 1_000)
}

function firstText(primary: string | undefined, fallback: string | undefined): string | undefined {
  return hasLiveSnapshotText(primary) ? primary : fallback
}
