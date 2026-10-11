import {
  BilibiliSubjectSchema,
  BilibiliSubjectTrendSchema,
  BilibiliSubjectWorkbenchSchema,
  BilibiliSubjectTrendV2Schema,
  BilibiliSubjectTrendV3Schema,
  BilibiliSubjectWorkbenchV3Schema,
  type BilibiliSubjectWorkbenchV3,
  type BilibiliSubjectTrendV3,
  BilibiliSubjectWorkbenchV2Schema,
  CreateBilibiliSubjectInputSchema,
  ListBilibiliSubjectsInputSchema,
  QueryBilibiliSubjectTrendsInputSchema,
  UpdateBilibiliSubjectBindingInputSchema,
  UpdateBilibiliSubjectInputSchema,
  UpdateBilibiliSubjectLayoutInputSchema,
  createRuntimeEnvelope,
  javaLongDelta,
  javaLongToLegacyNumber,
  type BilibiliLiveDanmakuRecent,
  type BilibiliLiveDanmakuStatus,
  type BilibiliSubject,
  type BilibiliSubjectBinding,
  type BilibiliSubjectTrend,
  type BilibiliSubjectTrendV2,
  type BilibiliSubjectWidgetLayout,
  type BilibiliSubjectWorkbench,
  type BilibiliSubjectWorkbenchV2,
  type CreateBilibiliSubjectInput,
  type QueryBilibiliSubjectTrendsInput,
  type UpdateBilibiliSubjectBindingInput,
  type UpdateBilibiliSubjectInput,
  type UpdateBilibiliSubjectLayoutInput
} from "@bmd/contracts"
import {
  ControlDatabase,
  compareLiveSnapshotTime,
  hasLiveSnapshotText,
  type NewStoredOutboxMessage,
  type StoredBilibiliFollowerMonitor,
  type StoredBilibiliLiveRoomMonitor,
  type StoredBilibiliSubject,
  type StoredBilibiliSubjectBinding,
  type StoredBilibiliSubjectWidgetLayout
} from "@bmd/storage"

import { safeLiveLegacyProjection } from "./live-long64-projection"
import { CoreApplicationError } from "./account-subject-service"
import type { BilibiliFollowerMonitorService, PreparedBilibiliFollowerMonitor } from "./bilibili-follower-service"
import type { BilibiliLiveMonitorService, PreparedBilibiliLiveMonitor } from "./bilibili-live-service"

interface BilibiliSubjectDanmakuReader {
  status: (roomMonitorId: string) => BilibiliLiveDanmakuStatus
  recent: (input: { roomMonitorId: string; limit?: number }) => BilibiliLiveDanmakuRecent[]
}

export interface BilibiliSubjectServiceOptions {
  database: ControlDatabase
  followers: BilibiliFollowerMonitorService
  live: BilibiliLiveMonitorService
  liveDanmaku: BilibiliSubjectDanmakuReader
  now: () => Date
  idFactory: () => string
}

interface BindingPayload {
  bilibiliUserMonitorId?: string | undefined
  bilibiliLiveRoomMonitorId?: string | undefined
  mid?: string | undefined
  roomId?: string | undefined
  enabledCapabilities?: BilibiliSubjectBinding["enabledCapabilities"] | undefined
  danmuEnabled?: boolean | undefined
}

interface ResolvedBinding {
  user: StoredBilibiliFollowerMonitor | undefined
  room: StoredBilibiliLiveRoomMonitor | undefined
  mid: string | undefined
  roomId: string | undefined
}

const DEFAULT_LAYOUTS = [
  ["bilibili-follower-live-heat", { x: 0, y: 0, w: 8, h: 3 }],
  ["bilibili-live-danmu", { x: 8, y: 0, w: 4, h: 3 }],
  ["subject-health-events", { x: 0, y: 3, w: 8, h: 2 }],
  ["widget-placeholder", { x: 8, y: 3, w: 4, h: 2 }]
] as const

export class BilibiliSubjectService {
  constructor(private readonly options: BilibiliSubjectServiceOptions) {}

  async create(input: CreateBilibiliSubjectInput): Promise<BilibiliSubject> {
    const parsed = CreateBilibiliSubjectInputSchema.parse(input)
    return this.options.database.runBilibiliPreparedTransaction(async () => {
      const commitBinding = this.hasBindingPayload(parsed)
        ? await this.prepareCreationBinding(parsed)
        : undefined
      return () => this.createResolvedSubject(parsed, commitBinding?.())
    })
  }

  private createResolvedSubject(
    parsed: ReturnType<typeof CreateBilibiliSubjectInputSchema.parse>,
    resolved: ResolvedBinding | undefined
  ): BilibiliSubject {
    const timestamp = this.options.now().toISOString()
    const subjectId = this.options.idFactory()
    const subject: StoredBilibiliSubject = {
      subjectId,
      displayName: this.resolveDisplayName(parsed.displayName, resolved),
      avatarUrl: this.resolveAvatarUrl(parsed.avatarUrl, resolved),
      remark: this.blankToNull(parsed.remark),
      tags: this.normalizeTags(parsed.tags),
      monitorStatus: "ACTIVE",
      healthScore: null,
      lastSuccessAt: null,
      lastEventAt: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    const binding = resolved
      ? this.storedBinding(subjectId, resolved, {
          enabledCapabilities: ["follower", "live_heat"],
          danmuEnabled: parsed.danmuEnabled
        }, timestamp)
      : undefined
    this.options.database.createBilibiliSubject({
      subject,
      ...(binding ? { binding } : {}),
      layouts: this.defaultLayouts(subjectId, timestamp)
    }, this.outbox("bilibili.subject.created", timestamp, {
      subjectId,
      mid: resolved?.mid ?? null,
      roomId: resolved?.roomId ?? null
    }))
    return this.get(subjectId)
  }

  list(limit?: number): BilibiliSubject[] {
    const query = ListBilibiliSubjectsInputSchema.parse(limit === undefined ? {} : { limit })
    return this.options.database.listBilibiliSubjects(query.limit)
      .map((subject) => {
        const binding = this.options.database.findBilibiliSubjectBinding(subject.subjectId)
        return this.toSubject(this.maybeBackfillProfile(subject, binding), binding)
      })
  }

  get(subjectId: string): BilibiliSubject {
    const subject = this.requireSubject(subjectId)
    const binding = this.options.database.findBilibiliSubjectBinding(subjectId)
    return this.toSubject(this.maybeBackfillProfile(subject, binding), binding)
  }

  update(input: UpdateBilibiliSubjectInput): BilibiliSubject {
    const parsed = UpdateBilibiliSubjectInputSchema.parse(input)
    this.requireSubject(parsed.subjectId)
    const updated = this.options.database.updateBilibiliSubject({
      subjectId: parsed.subjectId,
      ...(parsed.displayName !== undefined ? { displayName: this.normalizeDisplayName(parsed.displayName) } : {}),
      ...(parsed.avatarUrl !== undefined ? { avatarUrl: this.blankToNull(parsed.avatarUrl) } : {}),
      ...(parsed.remark !== undefined ? { remark: this.blankToNull(parsed.remark) } : {}),
      ...(parsed.tags !== undefined ? { tags: this.normalizeTags(parsed.tags) } : {}),
      ...(parsed.enabled !== undefined
        ? { monitorStatus: parsed.enabled ? "ACTIVE" : "PAUSED" }
        : {}),
      updatedAt: this.options.now().toISOString()
    })
    if (!updated) throw new CoreApplicationError("SUBJECT_NOT_FOUND", "用户监控对象不存在。")
    return this.toSubject(updated, this.options.database.findBilibiliSubjectBinding(parsed.subjectId))
  }

  remove(subjectId: string): void {
    this.requireSubject(subjectId)
    const timestamp = this.options.now().toISOString()
    this.options.database.deleteBilibiliSubject(
      subjectId,
      this.outbox("bilibili.subject.deleted", timestamp, { subjectId })
    )
  }

  async bind(input: UpdateBilibiliSubjectBindingInput): Promise<BilibiliSubjectBinding> {
    const parsed = UpdateBilibiliSubjectBindingInputSchema.parse(input)
    this.requireSubject(parsed.subjectId)
    const existing = this.options.database.findBilibiliSubjectBinding(parsed.subjectId)
    // Match SubjectService: resolve only this request. Old identities are merged
    // after resolution, like SubjectRepository's COALESCE, not used for lookups.
    const resolved = await this.resolveBinding(parsed)
    const timestamp = this.options.now().toISOString()
    const binding = this.storedBinding(parsed.subjectId, resolved, {
      enabledCapabilities: parsed.enabledCapabilities ?? existing?.enabledCapabilities,
      danmuEnabled: parsed.danmuEnabled ?? existing?.danmuEnabled
    }, timestamp, existing)
    this.options.database.upsertBilibiliSubjectBinding(binding)
    const persisted = this.options.database.findBilibiliSubjectBinding(parsed.subjectId)
    if (!persisted) throw new Error("Subject binding storage result missing.")
    return this.toBinding(persisted)
  }

  updateLayout(input: Omit<UpdateBilibiliSubjectLayoutInput, "items"> & {
    items: UpdateBilibiliSubjectLayoutInput["items"] | null
  }): BilibiliSubjectWidgetLayout[] {
    // The original service accepts an internal null list; IPC still validates
    // the required array before this method, matching the mandatory HTTP body.
    const parsed = UpdateBilibiliSubjectLayoutInputSchema.parse(
      input.items === null ? { ...input, items: [] } : input
    )
    this.requireSubject(parsed.subjectId)
    const timestamp = this.options.now().toISOString()
    const layouts = parsed.items.length === 0
      ? this.defaultLayouts(parsed.subjectId, timestamp)
      : parsed.items.map((item) => ({
          layoutId: this.options.idFactory(),
          subjectId: parsed.subjectId,
          widgetKey: item.widgetKey,
          enabled: item.enabled,
          position: item.position,
          settings: item.settings,
          createdAt: timestamp,
          updatedAt: timestamp
        }))
    this.options.database.replaceBilibiliSubjectLayouts(parsed.subjectId, layouts)
    return this.options.database.findBilibiliSubjectLayouts(parsed.subjectId, true)
      .map((layout) => this.toLayout(layout))
  }

  workbench(subjectId: string): BilibiliSubjectWorkbench {
    const view = this.workbenchV2(subjectId)
    return BilibiliSubjectWorkbenchSchema.parse({ ...view,
      ...(view.bilibiliUser ? { bilibiliUser: { ...view.bilibiliUser,
        ...legacyFollowerFields(view.bilibiliUser) } } : {}),
      summary: { ...view.summary, ...legacyFollowerFields(view.summary) } })
  }

  workbenchV2(subjectId: string): BilibiliSubjectWorkbenchV2 {
    const view = this.workbenchV3(subjectId)
    return BilibiliSubjectWorkbenchV2Schema.parse({ ...view,
      summary: safeLiveLegacyProjection(view.summary),
      ...(view.bilibiliLiveRoom ? { bilibiliLiveRoom: safeLiveLegacyProjection(view.bilibiliLiveRoom) } : {}) })
  }

  workbenchV3(subjectId: string): BilibiliSubjectWorkbenchV3 {
    let subject = this.requireSubject(subjectId)
    const binding = this.options.database.findBilibiliSubjectBinding(subjectId)
    const user = this.resolveStoredUser(binding)
    const room = this.resolveStoredRoom(binding, user)
    subject = this.maybeBackfillWorkbenchAvatar(subject, user, room)

    const now = this.options.now()
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString()
    const to = now.toISOString()
    const followerSnapshots = user
      ? this.options.database.findBilibiliFollowerSnapshots(user.monitorId, { from, to, limit: 2_000 })
      : []
    const liveSnapshots = room
      ? this.options.database.findBilibiliLiveRoomSnapshots(room.monitorId, { from, to, limit: 2_000 })
      : []
    const firstFollower = followerSnapshots.find((item) => item.followerCount !== null)?.followerCount
    const firstOnline = liveSnapshots.find((item) => item.onlineCount !== null)?.onlineCount
    const followerDelta24h = followerDelta(user?.currentFollowerCount, firstFollower)
    const onlineDelta24h = followerDelta(room?.onlineCount, firstOnline)
    const onlinePeak24h = liveSnapshots
      .map((item) => item.onlineCount)
      .filter((value): value is bigint => value !== null)
      .reduce<bigint | undefined>((peak, value) => peak === undefined || value > peak ? value : peak, undefined)
      ?? room?.onlineCount ?? undefined
    const danmu = this.danmuView(binding, room)
    const recentEvents = this.recentEvents(user, room)
    const healthScore = this.healthScore(subject, binding, user, room)
    const lastSuccessAt = maxIso(user?.lastSuccessAt, room?.lastSuccessAt)
    const lastEventAt = recentEvents[0]?.occurredAt ?? null
    this.options.database.updateBilibiliSubjectHealth({
      subjectId,
      healthScore,
      lastSuccessAt: lastSuccessAt ?? null,
      lastEventAt,
      updatedAt: to
    })
    subject = this.requireSubject(subjectId)

    let enabledModuleCount = 1
    if (user) enabledModuleCount += 1
    if (room) enabledModuleCount += 1
    if (binding?.danmuEnabled) enabledModuleCount += 1

    return BilibiliSubjectWorkbenchV3Schema.parse({
      subject: this.toSubject(subject, binding),
      ...(binding ? { bilibiliBinding: this.toBinding(binding) } : {}),
      ...(user ? { bilibiliUser: {
        monitorId: user.monitorId,
        mid: user.mid,
        nickname: user.nickname,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        ...(user.profileUrl ? { profileUrl: user.profileUrl } : {}),
        ...(user.currentFollowerCount !== null ? { followerCount: user.currentFollowerCount.toString() } : {}),
        ...(user.followingCount !== null ? { followingCount: user.followingCount.toString() } : {}),
        ...(followerDelta24h !== undefined ? { followerDelta24h } : {}),
        monitorStatus: user.monitorStatus,
        ...(user.lastSuccessAt ? { lastSuccessAt: user.lastSuccessAt } : {}),
        ...(user.nextCollectAt ? { nextCollectAt: user.nextCollectAt } : {}),
        ...(user.lastErrorType ? { lastErrorType: user.lastErrorType } : {}),
        ...(user.lastErrorMessage ? { lastErrorMessage: user.lastErrorMessage } : {})
      } } : {}),
      ...(room ? { bilibiliLiveRoom: {
        monitorId: room.monitorId,
        uid: room.uid,
        roomId: room.roomId,
        uname: room.uname,
        ...(room.faceUrl ? { faceUrl: room.faceUrl } : {}),
        ...(room.title ? { title: room.title } : {}),
        ...(room.coverUrl ? { coverUrl: room.coverUrl } : {}),
        ...(room.keyframeUrl ? { keyframeUrl: room.keyframeUrl } : {}),
        ...(room.areaName ? { areaName: room.areaName } : {}),
        ...(room.parentAreaName ? { parentAreaName: room.parentAreaName } : {}),
        liveStatus: room.liveStatus,
        ...(room.liveTime ? { liveTime: room.liveTime } : {}),
        ...(room.onlineCount !== null ? { onlineCount: room.onlineCount.toString() } : {}),
        ...(onlineDelta24h !== undefined ? { onlineDelta24h } : {}),
        ...(onlinePeak24h !== undefined ? { onlinePeak24h: onlinePeak24h.toString() } : {}),
        monitorStatus: room.monitorStatus,
        ...(room.lastSuccessAt ? { lastSuccessAt: room.lastSuccessAt } : {}),
        ...(room.nextCollectAt ? { nextCollectAt: room.nextCollectAt } : {}),
        ...(room.lastErrorType ? { lastErrorType: room.lastErrorType } : {}),
        ...(room.lastErrorMessage ? { lastErrorMessage: room.lastErrorMessage } : {})
      } } : {}),
      summary: {
        ...(user?.currentFollowerCount !== null && user?.currentFollowerCount !== undefined
          ? { followerCount: user.currentFollowerCount.toString() }
          : {}),
        ...(followerDelta24h !== undefined ? { followerDelta24h } : {}),
        ...(room ? { liveStatus: room.liveStatus } : {}),
        ...(room?.onlineCount !== null && room?.onlineCount !== undefined
          ? { onlineCount: room.onlineCount.toString() }
          : {}),
        ...(onlineDelta24h !== undefined ? { onlineDelta24h } : {}),
        ...(onlinePeak24h !== undefined ? { onlinePeak24h: onlinePeak24h.toString() } : {}),
        ...(danmu.ratePerMinute !== undefined ? { danmuPerMinute: danmu.ratePerMinute } : {}),
        ...(danmu.last5MinutesCount !== undefined
          ? { danmuLast5Minutes: danmu.last5MinutesCount }
          : {}),
        healthScore,
        enabledModuleCount,
        totalModuleCount: 4,
        ...(lastSuccessAt ? { lastSuccessAt } : {}),
        ...(minIso(user?.nextCollectAt, room?.nextCollectAt)
          ? { nextCollectAt: minIso(user?.nextCollectAt, room?.nextCollectAt) }
          : {})
      },
      danmu,
      layout: this.options.database.findBilibiliSubjectLayouts(subjectId)
        .map((layout) => this.toLayout(layout)),
      recentEvents
    })
  }

  trends(input: QueryBilibiliSubjectTrendsInput): BilibiliSubjectTrend {
    const view = this.trendsV2(input)
    return BilibiliSubjectTrendSchema.parse({ ...view, points: view.points.map(point => ({ ...point,
      ...(point.followerCount !== undefined ? { followerCount: javaLongToLegacyNumber(point.followerCount) } : {}) })) })
  }

  trendsV2(input: QueryBilibiliSubjectTrendsInput): BilibiliSubjectTrendV2 {
    const view = this.trendsV3(input)
    return BilibiliSubjectTrendV2Schema.parse({ ...view, points: safeLiveLegacyProjection(view.points) })
  }

  trendsV3(input: QueryBilibiliSubjectTrendsInput): BilibiliSubjectTrendV3 {
    const parsed = QueryBilibiliSubjectTrendsInputSchema.parse(input)
    this.requireSubject(parsed.subjectId)
    const binding = this.options.database.findBilibiliSubjectBinding(parsed.subjectId)
    const user = this.resolveStoredUser(binding)
    const room = this.resolveStoredRoom(binding, user)
    const to = this.options.now()
    const from = new Date(to.getTime() - parseDurationMs(parsed.range))
    const bucketMs = Math.max(60_000, parseDurationMs(parsed.bucket))
    const points = new Map<string, { bucketAt: string; followerCount?: string; liveOnlineCount?: string }>()
    const pointAt = (capturedAt: string) => {
      const bucketAt = new Date(Math.floor(new Date(capturedAt).getTime() / bucketMs) * bucketMs)
        .toISOString()
      const existing = points.get(bucketAt) ?? { bucketAt }
      points.set(bucketAt, existing)
      return existing
    }
    if (user && parsed.metrics.includes("follower")) {
      for (const snapshot of this.options.database.findBilibiliFollowerSnapshots(user.monitorId, {
        from: from.toISOString(), to: to.toISOString(), limit: 3_000
      })) pointAt(snapshot.capturedAt).followerCount = snapshot.followerCount.toString()
    }
    if (room && parsed.metrics.includes("live_online")) {
      for (const snapshot of this.options.database.findBilibiliLiveRoomSnapshots(room.monitorId, {
        from: from.toISOString(), to: to.toISOString(), limit: 3_000
      })) {
        if (snapshot.onlineCount !== null) pointAt(snapshot.capturedAt).liveOnlineCount = snapshot.onlineCount.toString()
      }
    }
    if (points.size === 0 && (user || room)) {
      const point = pointAt(to.toISOString())
      if (user?.currentFollowerCount !== null && user?.currentFollowerCount !== undefined) {
        point.followerCount = user.currentFollowerCount.toString()
      }
      if (room?.onlineCount !== null && room?.onlineCount !== undefined) {
        point.liveOnlineCount = room.onlineCount.toString()
      }
    }
    return BilibiliSubjectTrendV3Schema.parse({
      subjectId: parsed.subjectId,
      metrics: parsed.metrics,
      range: parsed.range,
      bucket: parsed.bucket,
      points: [...points.values()].sort((left, right) => left.bucketAt.localeCompare(right.bucketAt))
    })
  }

  private async prepareCreationBinding(payload: BindingPayload): Promise<() => ResolvedBinding> {
    let user = payload.bilibiliUserMonitorId
      ? this.options.database.findBilibiliFollowerMonitorById(payload.bilibiliUserMonitorId)
      : payload.mid ? this.options.database.findBilibiliFollowerMonitorByMid(payload.mid) : undefined
    if (payload.bilibiliUserMonitorId && !user) {
      throw new CoreApplicationError("BILIBILI_FOLLOWER_NOT_FOUND", "B站粉丝监控用户不存在。")
    }
    let preparedUser: PreparedBilibiliFollowerMonitor | undefined
    if (!user && payload.mid) preparedUser = await this.options.followers.prepareAddUserV2({ mid: payload.mid })
    let mid = user?.mid ?? preparedUser?.mid ?? payload.mid

    const room = payload.bilibiliLiveRoomMonitorId
      ? this.options.database.findBilibiliLiveRoomById(payload.bilibiliLiveRoomMonitorId)
      : payload.roomId ? this.options.database.findBilibiliLiveRoomByRoomId(payload.roomId)
        : mid ? this.options.database.findBilibiliLiveRoomByUid(mid) : undefined
    if (payload.bilibiliLiveRoomMonitorId && !room) {
      throw new CoreApplicationError("BILIBILI_LIVE_ROOM_NOT_FOUND", "B站直播间监控不存在。")
    }
    let preparedRoom: PreparedBilibiliLiveMonitor | undefined
    if (!room && payload.roomId) {
      preparedRoom = await this.options.live.prepareAddRoomV2({ roomId: payload.roomId })
    } else if (!room && mid) {
      try {
        preparedRoom = await this.options.live.prepareAddRoomV2({ uid: mid })
      } catch (error) {
        if (!(error instanceof CoreApplicationError)) throw error
      }
    }
    mid ??= room?.uid ?? preparedRoom?.uid
    if (!user && !preparedUser && mid) {
      user = this.options.database.findBilibiliFollowerMonitorByMid(mid)
      if (!user) preparedUser = await this.options.followers.prepareAddUserV2({ mid })
    }
    return () => {
      const userId = preparedUser?.commit().id ?? user?.monitorId
      const roomId = preparedRoom?.commit().id ?? room?.monitorId
      const committedUser = userId ? this.options.database.findBilibiliFollowerMonitorById(userId) : undefined
      const committedRoom = roomId ? this.options.database.findBilibiliLiveRoomById(roomId) : undefined
      if (userId && !committedUser) {
        throw new CoreApplicationError("BILIBILI_FOLLOWER_NOT_FOUND", "B站粉丝监控用户不存在。")
      }
      if (roomId && !committedRoom) {
        throw new CoreApplicationError("BILIBILI_LIVE_ROOM_NOT_FOUND", "B站直播间监控不存在。")
      }
      return {
        user: committedUser, room: committedRoom,
        mid: committedUser?.mid ?? mid,
        roomId: committedRoom?.roomId ?? payload.roomId
      }
    }
  }

  // Binding edits are intentionally not the original createSubject transaction.
  private async resolveBinding(payload: BindingPayload): Promise<ResolvedBinding> {
    let user = payload.bilibiliUserMonitorId
      ? this.options.database.findBilibiliFollowerMonitorById(payload.bilibiliUserMonitorId)
      : payload.mid
        ? this.options.database.findBilibiliFollowerMonitorByMid(payload.mid)
        : undefined
    if (payload.bilibiliUserMonitorId && !user) {
      throw new CoreApplicationError("BILIBILI_FOLLOWER_NOT_FOUND", "B站粉丝监控用户不存在。")
    }
    if (!user && payload.mid) {
      const created = await this.options.followers.addUserV2({ mid: payload.mid })
      user = this.options.database.findBilibiliFollowerMonitorById(created.id)
    }
    let mid = user?.mid ?? payload.mid

    let room = payload.bilibiliLiveRoomMonitorId
      ? this.options.database.findBilibiliLiveRoomById(payload.bilibiliLiveRoomMonitorId)
      : payload.roomId
        ? this.options.database.findBilibiliLiveRoomByRoomId(payload.roomId)
        : mid
          ? this.options.database.findBilibiliLiveRoomByUid(mid)
          : undefined
    if (payload.bilibiliLiveRoomMonitorId && !room) {
      throw new CoreApplicationError("BILIBILI_LIVE_ROOM_NOT_FOUND", "B站直播间监控不存在。")
    }
    if (!room && payload.roomId) {
      const created = await this.options.live.addRoomV2({ roomId: payload.roomId })
      room = this.options.database.findBilibiliLiveRoomById(created.id)
    } else if (!room && mid) {
      try {
        const created = await this.options.live.addRoomV2({ uid: mid })
        room = this.options.database.findBilibiliLiveRoomById(created.id)
      } catch (error) {
        if (!(error instanceof CoreApplicationError)) throw error
      }
    }
    if (room) {
      mid ??= room.uid
    }
    if (!user && mid) {
      const existing = this.options.database.findBilibiliFollowerMonitorByMid(mid)
      const created = existing ? undefined : await this.options.followers.addUserV2({ mid })
      user = existing ?? (created
        ? this.options.database.findBilibiliFollowerMonitorById(created.id)
        : undefined)
    }
    return { user, room, mid, roomId: room?.roomId ?? payload.roomId }
  }

  private danmuView(
    binding: StoredBilibiliSubjectBinding | undefined,
    room: StoredBilibiliLiveRoomMonitor | undefined
  ): BilibiliSubjectWorkbench["danmu"] {
    if (!binding?.danmuEnabled) return { enabled: false, status: "disabled", recentMessages: [] }
    if (!room) return { enabled: true, status: "missing_live_room", recentMessages: [] }
    try {
      const status = this.options.liveDanmaku.status(room.monitorId)
      const recent = this.options.liveDanmaku.recent({ roomMonitorId: room.monitorId, limit: 8 })
      return {
        enabled: true,
        status: normalizeDanmuStatus(status.status, status.running),
        ratePerMinute: status.ratePerMinute,
        last5MinutesCount: status.last5MinutesCount,
        likeIncrement: status.likeIncrement,
        ...(status.watchedCount !== undefined ? { watchedCount: status.watchedCount } : {}),
        ...(recent.length > 0 ? { lastMessageAt: recent.map((item) => item.sentAt).sort().at(-1) } : {}),
        recentMessages: recent.map((message) => ({
          ...(message.displayName ? { displayName: message.displayName } : {}),
          messageText: message.messageText,
          ...(message.medalName ? { medalName: message.medalName } : {}),
          sentAt: message.sentAt
        }))
      }
    } catch {
      return { enabled: true, status: "error", recentMessages: [] }
    }
  }

  private recentEvents(
    user: StoredBilibiliFollowerMonitor | undefined,
    room: StoredBilibiliLiveRoomMonitor | undefined
  ): BilibiliSubjectWorkbench["recentEvents"] {
    const events: BilibiliSubjectWorkbench["recentEvents"] = []
    if (room) {
      for (const event of this.options.database.listBilibiliLiveStatusEvents(6, room.monitorId)) {
        const title = event.eventType === "LIVE_STARTED"
          ? "直播间已开播"
          : event.eventType === "LIVE_ENDED"
            ? "直播间已下播"
            : event.eventType === "TITLE_CHANGED"
              ? "直播标题发生变化"
              : "直播间状态更新"
        events.push({
          eventType: event.eventType,
          title,
          description: hasLiveSnapshotText(event.titleAfter)
            ? event.titleAfter : `在线/热度 ${event.onlineCount}`,
          source: "bilibili-live",
          occurredAt: event.occurredAt,
          level: "info"
        })
      }
      if (room.lastErrorAt) events.push({
        eventType: "LIVE_COLLECT_ERROR", title: "直播间采集异常",
        ...(room.lastErrorMessage !== null ? { description: room.lastErrorMessage } : {}),
        source: "bilibili-live",
        occurredAt: room.lastErrorAt, level: "warning"
      })
      if (room.lastSuccessAt) events.push({
        eventType: "LIVE_COLLECT_OK", title: "直播间采集成功",
        ...(room.title !== null ? { description: room.title } : {}), source: "bilibili-live",
        occurredAt: room.lastSuccessAt, level: "success"
      })
    }
    if (user?.lastErrorAt) events.push({
      eventType: "FOLLOWER_COLLECT_ERROR", title: "粉丝数采集异常",
      ...(user.lastErrorMessage !== null ? { description: user.lastErrorMessage } : {}),
      source: "bilibili-follower",
      occurredAt: user.lastErrorAt, level: "warning"
    })
    if (user?.lastSuccessAt) events.push({
      eventType: "FOLLOWER_COLLECT_OK", title: "粉丝数采集成功",
      description: user.nickname, source: "bilibili-follower",
      occurredAt: user.lastSuccessAt, level: "success"
    })
    if (events.length === 0) events.push({
      eventType: "SUBJECT_CREATED", title: "工作台已创建",
      description: "绑定 B站粉丝监控或直播间监控后会显示采集事件。",
      source: "subject", occurredAt: this.options.now().toISOString(), level: "info"
    })
    return events.sort((left, right) => compareLiveSnapshotTime(right.occurredAt, left.occurredAt)).slice(0, 8)
  }

  private healthScore(
    subject: StoredBilibiliSubject,
    binding: StoredBilibiliSubjectBinding | undefined,
    user: StoredBilibiliFollowerMonitor | undefined,
    room: StoredBilibiliLiveRoomMonitor | undefined
  ): number {
    let score = 100
    if (subject.monitorStatus !== "ACTIVE") score -= 25
    if (!binding) score -= 30
    if (!user) score -= 18
    else if (user.lastErrorAt) score -= 12
    if (!room) score -= 18
    else if (room.lastErrorAt) score -= 12
    const lastSuccessAt = maxIso(user?.lastSuccessAt, room?.lastSuccessAt)
    if (!lastSuccessAt) score -= 12
    else if (this.options.now().getTime() - new Date(lastSuccessAt).getTime() >= 24 * 60 * 60 * 1_000) {
      score -= 8
    }
    return Math.max(0, Math.min(100, score))
  }

  private resolveStoredUser(
    binding: StoredBilibiliSubjectBinding | undefined
  ): StoredBilibiliFollowerMonitor | undefined {
    if (!binding) return undefined
    return binding.bilibiliUserMonitorId
      ? this.options.database.findBilibiliFollowerMonitorById(binding.bilibiliUserMonitorId)
      : binding.mid
        ? this.options.database.findBilibiliFollowerMonitorByMid(binding.mid)
        : undefined
  }

  private resolveStoredRoom(
    binding: StoredBilibiliSubjectBinding | undefined,
    user: StoredBilibiliFollowerMonitor | undefined
  ): StoredBilibiliLiveRoomMonitor | undefined {
    if (!binding) return undefined
    if (binding.bilibiliLiveRoomMonitorId) {
      return this.options.database.findBilibiliLiveRoomById(binding.bilibiliLiveRoomMonitorId)
    }
    if (binding.roomId) return this.options.database.findBilibiliLiveRoomByRoomId(binding.roomId)
    const uid = binding.mid ?? user?.mid
    return uid ? this.options.database.findBilibiliLiveRoomByUid(uid) : undefined
  }

  private maybeBackfillProfile(
    subject: StoredBilibiliSubject,
    binding: StoredBilibiliSubjectBinding | undefined
  ): StoredBilibiliSubject {
    if (!binding || hasLiveSnapshotText(subject.avatarUrl)) return subject
    // SubjectService uses bound monitor IDs only, unlike the workbench lookup.
    let avatarUrl: string | null = null
    let displayName = subject.displayName
    if (binding.bilibiliUserMonitorId) {
      const user = this.options.database.findBilibiliFollowerMonitorById(binding.bilibiliUserMonitorId)
      if (user) {
        avatarUrl = user.avatarUrl
        if (!hasLiveSnapshotText(displayName)) displayName = user.nickname
      }
    }
    // Source checks null here, not blank: even an empty user avatar wins.
    if (avatarUrl === null && binding.bilibiliLiveRoomMonitorId) {
      const room = this.options.database.findBilibiliLiveRoomById(binding.bilibiliLiveRoomMonitorId)
      if (room) {
        avatarUrl = room.faceUrl
        if (!hasLiveSnapshotText(displayName)) displayName = room.uname
      }
    }
    if (avatarUrl === null) return subject
    return this.options.database.updateBilibiliSubject({
      subjectId: subject.subjectId,
      displayName,
      avatarUrl,
      remark: subject.remark,
      tags: subject.tags,
      updatedAt: this.options.now().toISOString()
    }) ?? subject
  }

  private maybeBackfillWorkbenchAvatar(
    subject: StoredBilibiliSubject,
    user: StoredBilibiliFollowerMonitor | undefined,
    room: StoredBilibiliLiveRoomMonitor | undefined
  ): StoredBilibiliSubject {
    if (hasLiveSnapshotText(subject.avatarUrl)) return subject
    const avatarUrl = hasLiveSnapshotText(user?.avatarUrl)
      ? user.avatarUrl : hasLiveSnapshotText(room?.faceUrl) ? room.faceUrl : null
    if (avatarUrl === null) return subject
    // SubjectWorkbenchService only backfills the avatar, never the name.
    return this.options.database.updateBilibiliSubject({
      subjectId: subject.subjectId,
      avatarUrl,
      updatedAt: this.options.now().toISOString()
    }) ?? subject
  }

  private requireSubject(subjectId: string): StoredBilibiliSubject {
    const subject = this.options.database.findBilibiliSubjectById(subjectId)
    if (!subject) throw new CoreApplicationError("SUBJECT_NOT_FOUND", "用户监控对象不存在。")
    return subject
  }

  private toSubject(
    subject: StoredBilibiliSubject,
    binding: StoredBilibiliSubjectBinding | undefined
  ): BilibiliSubject {
    return BilibiliSubjectSchema.parse({
      id: subject.subjectId,
      displayName: subject.displayName,
      ...(subject.avatarUrl !== null ? { avatarUrl: subject.avatarUrl } : {}),
      ...(subject.remark ? { remark: subject.remark } : {}),
      tags: subject.tags,
      monitorStatus: subject.monitorStatus,
      ...(subject.healthScore !== null ? { healthScore: subject.healthScore } : {}),
      ...(subject.lastSuccessAt ? { lastSuccessAt: subject.lastSuccessAt } : {}),
      ...(subject.lastEventAt ? { lastEventAt: subject.lastEventAt } : {}),
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
      ...(binding ? { bilibiliBinding: this.toBinding(binding) } : {})
    })
  }

  private toBinding(binding: StoredBilibiliSubjectBinding): BilibiliSubjectBinding {
    return {
      id: binding.bindingId,
      subjectId: binding.subjectId,
      ...(binding.bilibiliUserMonitorId
        ? { bilibiliUserMonitorId: binding.bilibiliUserMonitorId }
        : {}),
      ...(binding.bilibiliLiveRoomMonitorId
        ? { bilibiliLiveRoomMonitorId: binding.bilibiliLiveRoomMonitorId }
        : {}),
      ...(binding.mid ? { mid: binding.mid } : {}),
      ...(binding.roomId ? { roomId: binding.roomId } : {}),
      enabledCapabilities: binding.enabledCapabilities,
      danmuEnabled: binding.danmuEnabled,
      createdAt: binding.createdAt,
      updatedAt: binding.updatedAt
    }
  }

  private toLayout(layout: StoredBilibiliSubjectWidgetLayout): BilibiliSubjectWidgetLayout {
    return {
      widgetKey: layout.widgetKey,
      enabled: layout.enabled,
      position: layout.position,
      settings: layout.settings
    }
  }

  private storedBinding(
    subjectId: string,
    resolved: ResolvedBinding,
    settings: {
      enabledCapabilities?: BilibiliSubjectBinding["enabledCapabilities"] | undefined
      danmuEnabled?: boolean | undefined
    },
    timestamp: string,
    existing?: StoredBilibiliSubjectBinding
  ): StoredBilibiliSubjectBinding {
    return {
      bindingId: existing?.bindingId ?? this.options.idFactory(),
      subjectId,
      bilibiliUserMonitorId: resolved.user?.monitorId ?? existing?.bilibiliUserMonitorId ?? null,
      bilibiliLiveRoomMonitorId: resolved.room?.monitorId ?? existing?.bilibiliLiveRoomMonitorId ?? null,
      mid: resolved.mid ?? existing?.mid ?? null,
      roomId: resolved.roomId ?? existing?.roomId ?? null,
      enabledCapabilities: settings.enabledCapabilities ?? ["follower", "live_heat"],
      danmuEnabled: settings.danmuEnabled ?? false,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
  }

  private defaultLayouts(subjectId: string, timestamp: string): StoredBilibiliSubjectWidgetLayout[] {
    return DEFAULT_LAYOUTS.map(([widgetKey, position]) => ({
      layoutId: this.options.idFactory(),
      subjectId,
      widgetKey,
      enabled: true,
      position: { ...position },
      settings: {},
      createdAt: timestamp,
      updatedAt: timestamp
    }))
  }

  private resolveDisplayName(
    requested: string | undefined,
    resolved: ResolvedBinding | undefined
  ): string {
    return this.blankToNull(requested)
      // The original checks presence but returns the raw stored profile text.
      ?? (this.blankToNull(resolved?.user?.nickname) !== null ? resolved?.user?.nickname : undefined)
      ?? (this.blankToNull(resolved?.room?.uname) !== null ? resolved?.room?.uname : undefined)
      ?? (resolved?.mid ? `Bilibili UID ${resolved.mid}` : undefined)
      ?? (() => { throw new CoreApplicationError("BAD_REQUEST", "用户监控名称不能为空。") })()
  }

  private resolveAvatarUrl(
    requested: string | undefined,
    resolved: ResolvedBinding | undefined
  ): string | null {
    const avatarUrl = this.blankToNull(requested)
    if (avatarUrl !== null || !resolved) return avatarUrl
    if (this.blankToNull(resolved.user?.avatarUrl) !== null) return resolved.user!.avatarUrl
    if (this.blankToNull(resolved.room?.faceUrl) !== null) return resolved.room!.faceUrl
    return null
  }

  private normalizeDisplayName(value: string): string {
    const normalized = this.blankToNull(value)
    if (normalized === null) throw new CoreApplicationError("BAD_REQUEST", "用户监控名称不能为空。")
    return normalized
  }

  private hasBindingPayload(payload: BindingPayload): boolean {
    return Boolean(
      payload.bilibiliUserMonitorId
      || payload.bilibiliLiveRoomMonitorId
      || payload.mid
      || payload.roomId
    ) || payload.danmuEnabled !== undefined
  }

  private normalizeTags(tags: Array<string | null>): string[] {
    return [...new Set(tags.map((tag) => this.blankToNull(tag))
      .filter((tag): tag is string => tag !== null))].slice(0, 12)
  }

  private blankToNull(value: string | null | undefined): string | null {
    // java.lang.String.trim removes code units U+0000..U+0020 only.
    const normalized = value?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, "")
    return normalized ? normalized : null
  }

  private outbox(
    type: string,
    timestamp: string,
    payload: Record<string, unknown>
  ): NewStoredOutboxMessage {
    const eventId = this.options.idFactory()
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

function followerDelta(current: bigint | null | undefined, previous: bigint | null | undefined): string | undefined {
  return current === null || current === undefined || previous === null || previous === undefined
    ? undefined
    : javaLongDelta(current, previous).toString()
}

// Only the explicit old wire exit performs this narrower safe-number projection.
function legacyFollowerFields(value: { followerCount?: string | undefined; followingCount?: string | undefined; followerDelta24h?: string | undefined }) {
  return {
    ...(value.followerCount !== undefined ? { followerCount: javaLongToLegacyNumber(value.followerCount) } : {}),
    ...(value.followingCount !== undefined ? { followingCount: javaLongToLegacyNumber(value.followingCount) } : {}),
    ...(value.followerDelta24h !== undefined ? { followerDelta24h: javaLongToLegacyNumber(value.followerDelta24h) } : {})
  }
}

function maxIso(left: string | null | undefined, right: string | null | undefined): string | undefined {
  if (!left) return right ?? undefined
  if (!right) return left
  return left > right ? left : right
}

function minIso(left: string | null | undefined, right: string | null | undefined): string | undefined {
  if (!left) return right ?? undefined
  if (!right) return left
  return left < right ? left : right
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([mhd])$/i.exec(value.trim())
  if (!match) return 24 * 60 * 60 * 1_000
  const amount = Math.max(1, Number(match[1]))
  const unit = match[2]?.toLowerCase()
  return amount * (unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000)
}

function normalizeDanmuStatus(status: string, running: boolean): string {
  if (running) return "connected"
  if (!status || status === "NOT_STARTED") return "waiting"
  if (status === "ERROR") return "error"
  if (status === "STOPPED" || status === "CLOSED") return "stopped"
  return status.toLowerCase()
}
