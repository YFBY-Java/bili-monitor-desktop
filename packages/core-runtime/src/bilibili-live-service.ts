import {
  AddBilibiliLiveRoomInputSchema,
  BilibiliLiveCollectResultSchema,
  BilibiliLiveFetchedOptionalSnapshotSchema,
  BilibiliLiveFetchedSnapshotSchema,
  BilibiliLiveFetchedStatusBatchSchema,
  BilibiliLiveRoomListSchema,
  BilibiliLiveRoomSchema,
  BilibiliLiveStatusEventSchema,
  BilibiliLiveSummarySchema,
  ListBilibiliLiveRoomsInputSchema,
  QueryBilibiliLiveEventsInputSchema,
  QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInputSchema,
  UpdateBilibiliLiveRoomSettingsInputSchema,
  UpdateBilibiliLiveRoomStatusInputSchema,
  createRuntimeEnvelope,
  type AddBilibiliLiveRoomInput,
  type BilibiliLiveCollectResult,
  type BilibiliLiveFetchedOptionalSnapshot,
  type BilibiliLiveFetchedSnapshot,
  type BilibiliLiveFetchedStatusBatch,
  type BilibiliLiveRoom,
  type BilibiliLiveRoomList,
  type BilibiliLiveRoomRequest,
  type BilibiliLiveRoomTrend,
  type BilibiliLiveSnapshotData,
  type BilibiliLiveStatusByUidsRequest,
  type BilibiliLiveStatusEvent,
  type BilibiliLiveSummary,
  type BilibiliLiveUidRequest,
  type ObjectRef
} from "@bmd/contracts"
import {
  ControlDatabase,
  type NewStoredOutboxMessage,
  type StoredBilibiliLiveRoomMonitor,
  type StoredBilibiliLiveRoomSnapshot
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"

const STATUS_ENDPOINT = "room/v1/Room/get_status_info_by_uids" as const
const INIT_ENDPOINT = "room/v1/Room/room_init" as const
const INFO_ENDPOINT = "room/v1/Room/get_info" as const
const OLD_INFO_ENDPOINT = "room/v1/Room/getRoomInfoOld" as const

export interface BilibiliLiveSource {
  fetchRoomInit: (request: BilibiliLiveRoomRequest) => Promise<BilibiliLiveFetchedSnapshot>
  fetchRoomInfo: (request: BilibiliLiveRoomRequest) => Promise<BilibiliLiveFetchedSnapshot>
  fetchRoomInfoOld: (request: BilibiliLiveUidRequest) => Promise<BilibiliLiveFetchedOptionalSnapshot>
  fetchStatusByUids: (request: BilibiliLiveStatusByUidsRequest) => Promise<BilibiliLiveFetchedStatusBatch>
  stop?: () => Promise<void>
}

export interface BilibiliLiveMonitorServiceOptions {
  database: ControlDatabase
  source: BilibiliLiveSource
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  requestMinIntervalMs?: number
  maxAttempts?: number
  retryBackoffMs?: number
  jitter?: () => number
  dueBatchSize?: number
  statusBatchSize?: number
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
}

interface SourceErrorDetails {
  code: string
  message: string
  retryable: boolean
}

export class BilibiliLiveMonitorService {
  private readonly nextRequestAt = new Map<string, number>()

  constructor(private readonly options: BilibiliLiveMonitorServiceOptions) {}

  async addRoom(input: AddBilibiliLiveRoomInput): Promise<BilibiliLiveRoom> {
    const parsed = AddBilibiliLiveRoomInputSchema.parse(input)
    const intervalSeconds = parsed.intervalSeconds ?? 300
    const taskId = this.options.idFactory()
    let snapshot: ResolvedLiveSnapshot
    try {
      snapshot = parsed.roomId
        ? await this.fetchByRoomIdWithDetails(parsed.roomId, taskId)
        : await this.fetchByUidWithDetails(parsed.uid as string, taskId)
    } catch (error) {
      if (error instanceof CoreApplicationError) throw error
      throw this.applicationError(error)
    }
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

  listRooms(input?: { limit?: number }): BilibiliLiveRoomList {
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

  updateStatus(roomMonitorId: string, enabled: boolean): BilibiliLiveRoom {
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

  updateInterval(roomMonitorId: string, intervalSeconds: number): BilibiliLiveRoom {
    const input = UpdateBilibiliLiveRoomSettingsInputSchema.parse({ roomMonitorId, intervalSeconds })
    this.requireStoredRoom(input.roomMonitorId)
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

  async refreshNow(roomMonitorId: string): Promise<BilibiliLiveCollectResult> {
    const room = this.requireStoredRoom(roomMonitorId)
    const taskId = this.options.idFactory()
    try {
      const snapshot = await this.fetchByUidWithDetails(room.uid, taskId)
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
      this.markFailure(room, error)
      throw this.applicationError(error)
    }
  }

  async collectDueRooms(): Promise<BilibiliLiveCollectResult[]> {
    const rooms = this.options.database.findDueBilibiliLiveRooms(
      this.options.now().toISOString(),
      Math.max(1, this.options.dueBatchSize ?? 20)
    )
    const results: BilibiliLiveCollectResult[] = []
    const batchSize = Math.min(30, Math.max(1, this.options.statusBatchSize ?? 30))
    for (let start = 0; start < rooms.length; start += batchSize) {
      const batchRooms = rooms.slice(start, start + batchSize)
      const taskId = this.options.idFactory()
      try {
        const batch = await this.fetchStatusBatch(batchRooms.map((room) => room.uid), taskId)
        for (const room of batchRooms) {
          const found = batch.snapshots.find((snapshot) => snapshot.uid === room.uid)
          if (!found) {
            const error = Object.assign(
              new Error(`Bilibili live status response missing uid=${room.uid}`),
              { code: "BILIBILI_PARSE_ERROR", retryable: false }
            )
            this.markFailure(room, error)
            results.push(this.failedCollectResult(room, error))
            continue
          }
          const snapshot = this.enrichStatusSnapshot(found, batch)
          const merged = this.withExistingProfile(snapshot, room)
          const applied = this.persistSnapshot(
            room,
            room.monitorId,
            merged,
            room.intervalSeconds,
            taskId,
            "bilibili.live.snapshot-collected"
          )
          results.push(this.collectResult(
            room.monitorId,
            merged,
            true,
            applied ? "ok" : "ignored-stale"
          ))
        }
      } catch (error) {
        for (const room of batchRooms) {
          this.markFailure(room, error)
          results.push(this.failedCollectResult(room, error))
        }
      }
    }
    return results
  }

  summary(): BilibiliLiveSummary {
    const rooms = this.options.database.listBilibiliLiveRooms(500)
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
      totalOnlineCount: liveRooms.reduce((sum, room) => sum + (room.onlineCount ?? 0), 0),
      todayLiveStarts: this.options.database.countTodayBilibiliLiveStarts(startOfDay),
      ...(events[0] ? { latestEvent: this.toEventView(events[0]) } : {})
    })
  }

  events(input: { limit?: number } = {}): BilibiliLiveStatusEvent[] {
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
        ...(event.onlineCount !== null ? { onlineCount: event.onlineCount } : {}),
        occurredAt: event.occurredAt
      })
    )
  }

  trend(input: {
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

  trends(input: {
    roomMonitorIds?: string[]
    from?: string
    to?: string
    limitPerRoom?: number
  } = {}): BilibiliLiveRoomTrend[] {
    const query = QueryBilibiliLiveTrendsInputSchema.parse(input)
    const rooms = query.roomMonitorIds.length === 0
      ? this.options.database.listBilibiliLiveRooms(100)
      : query.roomMonitorIds.map((id) => this.requireStoredRoom(id))
    return rooms.map((room) => this.trend({
      roomMonitorId: room.monitorId,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limitPerRoom
    }))
  }

  deleteRoom(roomMonitorId: string): void {
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

  async stop(): Promise<void> {
    await this.options.source.stop?.()
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
      throw new CoreApplicationError(
        "BILIBILI_LIVE_ROOM_NOT_FOUND",
        `该 UID 暂无公开直播间或接口未返回房间信息：${uid}`
      )
    }
    const oldSnapshot: ResolvedLiveSnapshot = {
      ...old.snapshot,
      fetchedAt: old.fetchedAt,
      sourceEndpoint: old.sourceEndpoint,
      evidenceObject: old.evidenceObject
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
      (request) => this.options.source.fetchRoomInit({ ...request, roomId }),
      BilibiliLiveFetchedSnapshotSchema.parse
    )
  }

  private fetchRoomInfo(roomId: string, taskId: string): Promise<BilibiliLiveFetchedSnapshot> {
    return this.fetchWithRetry(
      INFO_ENDPOINT,
      roomId,
      taskId,
      (request) => this.options.source.fetchRoomInfo({ ...request, roomId }),
      BilibiliLiveFetchedSnapshotSchema.parse
    )
  }

  private fetchRoomInfoOld(uid: string, taskId: string): Promise<BilibiliLiveFetchedOptionalSnapshot> {
    return this.fetchWithRetry(
      OLD_INFO_ENDPOINT,
      uid,
      taskId,
      (request) => this.options.source.fetchRoomInfoOld({ ...request, uid }),
      BilibiliLiveFetchedOptionalSnapshotSchema.parse
    )
  }

  private fetchStatusBatch(uids: string[], taskId: string): Promise<BilibiliLiveFetchedStatusBatch> {
    return this.fetchWithRetry(
      STATUS_ENDPOINT,
      uids.join(","),
      taskId,
      (request) => this.options.source.fetchStatusByUids({ ...request, uids }),
      BilibiliLiveFetchedStatusBatchSchema.parse
    )
  }

  private async fetchWithRetry<T extends FetchMetadata>(
    endpoint: string,
    identifier: string,
    taskId: string,
    operation: (request: { taskId: string; attempt: number; leaseId: string }) => Promise<T>,
    validate: (value: unknown) => T
  ): Promise<T> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.acquireRateLimit(endpoint)
      const startedAt = performance.now()
      try {
        const result = validate(await operation({
          taskId,
          attempt,
          leaseId: this.options.idFactory()
        }))
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: endpoint,
          mid: identifier,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          errorType: null,
          retryable: false,
          evidenceObjectId: result.evidenceObject.objectId,
          createdAt: result.fetchedAt
        }, {
          ...result.evidenceObject,
          createdAt: result.fetchedAt
        })
        return result
      } catch (error) {
        lastError = error
        const details = this.sourceError(error)
        this.options.database.insertBilibiliApiCall({
          callId: this.options.idFactory(),
          taskId,
          attempt,
          endpointKey: endpoint,
          mid: identifier,
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
    this.nextRequestAt.set(endpoint, allowedAt + minimum)
    if (allowedAt > now) await (this.options.sleep ?? delay)(allowedAt - now)
  }

  private enrichStatusSnapshot(
    snapshot: BilibiliLiveSnapshotData,
    batch: BilibiliLiveFetchedStatusBatch
  ): ResolvedLiveSnapshot {
    return {
      ...snapshot,
      fetchedAt: batch.fetchedAt,
      sourceEndpoint: batch.sourceEndpoint,
      evidenceObject: batch.evidenceObject
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
      ...(room.liveTime ? { liveTime: room.liveTime } : {}),
      ...(room.onlineCount !== null ? { onlineCount: room.onlineCount } : {}),
      ...(room.attentionCount !== null ? { attentionCount: room.attentionCount } : {}),
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
    // Match the original snapshot application transaction: room, events, snapshot and session.
    return this.options.database.runInTransaction(() => {
      const initializing = topic === "bilibili.live.monitor-added"
      const current = initializing ? previous : this.requireStoredRoom(monitorId)
      const pending = this.options.database.findActiveBilibiliLiveSession(monitorId)
      const snapshotTime = Date.parse(snapshot.fetchedAt)
      const stale = [current?.lastSnapshotAt, current?.lastSuccessAt]
        .some((value) => value && Date.parse(value) > snapshotTime)
      const olderThanPending = pending?.state === "END_PENDING" && pending.endSignalAt
        && Date.parse(pending.endSignalAt) > snapshotTime
      if (stale || olderThanPending) {
        // Explicit re-add still applies settings, but cannot roll back observed platform state.
        if (initializing && current) {
          const timestamp = this.options.now().toISOString()
          this.updateStatus(current.monitorId, true)
          this.options.database.updateBilibiliLiveRoomInterval(
            current.monitorId, intervalSeconds,
            new Date(snapshotTime + intervalSeconds * 1000).toISOString(), timestamp,
            this.outbox(this.options.idFactory(), "bilibili.live.monitor-settings-updated", timestamp, {
              roomMonitorId: current.monitorId, intervalSeconds
            })
          )
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
    const resolved = previous ? this.withExistingProfile(snapshot, previous) : snapshot
    const eventId = this.options.idFactory()
    const nextCollectAt = new Date(
      new Date(resolved.fetchedAt).getTime() + intervalSeconds * 1_000
    ).toISOString()
    const applied = this.options.database.applyBilibiliLiveRoomSnapshot({
      reactivate: topic === "bilibili.live.monitor-added",
      monitor: {
        monitorId,
        uid: resolved.uid,
        roomId: resolved.roomId,
        shortId: resolved.shortId ?? null,
        uname: resolved.uname ?? previous?.uname ?? `UID ${resolved.uid}`,
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
        onlineCount: resolved.onlineCount ?? null,
        attentionCount: resolved.attentionCount ?? null,
        intervalSeconds,
        nextCollectAt,
        capturedAt: resolved.fetchedAt,
        sourceEndpoint: resolved.sourceEndpoint
      },
      snapshot: {
        snapshotId: this.options.idFactory(),
        capturedBucket: capturedBucket(resolved.fetchedAt)
      },
      artifact: {
        ...resolved.evidenceObject,
        createdAt: resolved.fetchedAt
      },
      outbox: this.outbox(eventId, topic, resolved.fetchedAt, {
        roomMonitorId: previous?.monitorId ?? monitorId,
        taskId,
        uid: resolved.uid,
        roomId: resolved.roomId,
        liveStatus: resolved.liveStatus,
        onlineCount: resolved.onlineCount,
        sourceEndpoint: resolved.sourceEndpoint
      })
    })
    if (applied && this.options.sessionObserver) {
      const room = this.options.database.findBilibiliLiveRoomById(previous?.monitorId ?? monitorId)
      if (room) this.options.sessionObserver.reconcileRest(room, {
        liveStatus: resolved.liveStatus,
        liveTime: resolved.liveTime ?? null,
        title: resolved.title ?? null,
        fetchedAt: resolved.fetchedAt
      })
    }
    return applied
  }

  private markFailure(room: StoredBilibiliLiveRoomMonitor, error: unknown): void {
    const details = this.sourceError(error)
    const errorAt = this.options.now().toISOString()
    const backoffSeconds = Math.max(60, Math.min(room.intervalSeconds, 900))
    const nextCollectAt = new Date(this.options.now().getTime() + backoffSeconds * 1_000)
      .toISOString()
    this.options.database.markBilibiliLiveRoomFailure({
      monitorId: room.monitorId,
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
      : room.onlineCount - previous
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
      ...(room.onlineCount !== null ? { onlineCount: room.onlineCount } : {}),
      ...(room.attentionCount !== null ? { attentionCount: room.attentionCount } : {}),
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
      ...(event.onlineCount !== null ? { onlineCount: event.onlineCount } : {}),
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
      ...(snapshot.onlineCount !== undefined ? { onlineCount: snapshot.onlineCount } : {}),
      capturedAt: snapshot.fetchedAt,
      sourceEndpoint: snapshot.sourceEndpoint,
      message
    })
  }

  private failedCollectResult(
    room: StoredBilibiliLiveRoomMonitor,
    error: unknown
  ): BilibiliLiveCollectResult {
    return BilibiliLiveCollectResultSchema.parse({
      roomMonitorId: room.monitorId,
      uid: room.uid,
      roomId: room.roomId,
      success: false,
      liveStatus: room.liveStatus,
      ...(room.onlineCount !== null ? { onlineCount: room.onlineCount } : {}),
      capturedAt: this.options.now().toISOString(),
      message: this.sourceError(error).message
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
    ...(primary.uname ?? fallback.uname ? { uname: primary.uname ?? fallback.uname } : {}),
    ...(primary.faceUrl ?? fallback.faceUrl ? { faceUrl: primary.faceUrl ?? fallback.faceUrl } : {}),
    ...(hasText(primary.title) || hasText(fallback.title) ? { title: hasText(primary.title) ? primary.title : fallback.title } : {}),
    ...(primary.coverUrl ?? fallback.coverUrl ? { coverUrl: primary.coverUrl ?? fallback.coverUrl } : {}),
    ...(primary.keyframeUrl ?? fallback.keyframeUrl ? { keyframeUrl: primary.keyframeUrl ?? fallback.keyframeUrl } : {}),
    ...(primary.areaId ?? fallback.areaId ? { areaId: primary.areaId ?? fallback.areaId } : {}),
    ...(primary.areaName ?? fallback.areaName ? { areaName: primary.areaName ?? fallback.areaName } : {}),
    ...(primary.parentAreaId ?? fallback.parentAreaId ? { parentAreaId: primary.parentAreaId ?? fallback.parentAreaId } : {}),
    ...(primary.parentAreaName ?? fallback.parentAreaName ? { parentAreaName: primary.parentAreaName ?? fallback.parentAreaName } : {}),
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
    evidenceObject: primary.evidenceObject
  } as ResolvedLiveSnapshot
}

function toTrendPoint(snapshot: StoredBilibiliLiveRoomSnapshot) {
  return {
    roomId: snapshot.roomId,
    uid: snapshot.uid,
    capturedAt: snapshot.capturedAt,
    liveStatus: snapshot.liveStatus as 0 | 1 | 2,
    ...(snapshot.onlineCount !== null ? { onlineCount: snapshot.onlineCount } : {}),
    ...(snapshot.attentionCount !== null ? { attentionCount: snapshot.attentionCount } : {}),
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

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
