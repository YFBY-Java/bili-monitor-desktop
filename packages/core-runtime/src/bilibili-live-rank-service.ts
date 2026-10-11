import {
  BilibiliLiveRankFetchedSnapshotV2Schema,
  BilibiliLiveRankRefreshResultV2Schema,
  BilibiliLiveRankSnapshotV2Schema,
  BilibiliLiveRankSummaryV2Schema,
  type BilibiliLiveRankFetchedSnapshotV2,
  type BilibiliLiveRankRefreshResultV2,
  type BilibiliLiveRankSnapshotV2,
  type BilibiliLiveRankSummaryV2,
  BilibiliLiveRankLatestInputSchema,
  BilibiliLiveRankRefreshInputSchema,
  BilibiliLiveRankRefreshResultSchema,
  BilibiliLiveRankSnapshotSchema,
  BilibiliLiveRankSummarySchema,
  type BilibiliLiveRankFetchedSnapshot,
  type BilibiliLiveRankLatestInput,
  type BilibiliLiveRankRefreshInput,
  type BilibiliLiveRankRefreshResult,
  type BilibiliLiveRankSnapshot,
  type BilibiliLiveRankSummary,
  type BilibiliLiveRankWorkerRequest
} from "@bmd/contracts"
import {
  ControlDatabase,
  type BilibiliApiRequestMeta,
  type StoredBilibiliLiveRankEntry,
  type StoredBilibiliLiveRankSnapshot,
  type StoredBilibiliLiveRoomMonitor
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import { LocalRequestRateLimiter } from "./local-request-rate-limiter"
import { exactRankFromLegacy, safeRankLegacyProjection } from "./rank-long64-projection"

const AUDIENCE_ENDPOINT = "xlive/general-interface/v1/rank/queryContributionRank" as const
const AUDIENCE_FALLBACK_ENDPOINT = "xlive/general-interface/v1/rank/getOnlineGoldRank" as const
const GUARD_ENDPOINT = "xlive/app-room/v2/guardTab/topListNew" as const
const SUMMARY_ENTRY_LIMIT = 100

interface RankKind {
  family: "AUDIENCE" | "GUARD"
  type: string
  rankSwitch?: string
  periodScope: string
  guardTyp?: number
  label: string
}

const DEFAULT_KINDS: RankKind[] = [
  { family: "AUDIENCE", type: "online_rank", rankSwitch: "contribution_rank", periodScope: "REALTIME", label: "房间观众在线贡献榜" },
  { family: "AUDIENCE", type: "online_rank", rankSwitch: "entry_time_rank", periodScope: "REALTIME", label: "房间观众进房时间榜" },
  { family: "AUDIENCE", type: "daily_rank", rankSwitch: "today_rank", periodScope: "CURRENT", label: "房间观众日榜" },
  { family: "AUDIENCE", type: "weekly_rank", rankSwitch: "current_week_rank", periodScope: "CURRENT", label: "房间观众周榜" },
  { family: "AUDIENCE", type: "monthly_rank", rankSwitch: "current_month_rank", periodScope: "CURRENT", label: "房间观众月榜" },
  { family: "GUARD", type: "guard_weekly", periodScope: "CURRENT", guardTyp: 4, label: "大航海周榜" },
  { family: "GUARD", type: "guard_monthly", periodScope: "CURRENT", guardTyp: 3, label: "大航海月榜" },
  { family: "GUARD", type: "guard_accompany", periodScope: "CURRENT", guardTyp: 1, label: "大航海陪伴榜" }
]

export interface BilibiliLiveRankSource {
  fetch: (request: BilibiliLiveRankWorkerRequest) => Promise<BilibiliLiveRankFetchedSnapshot | BilibiliLiveRankFetchedSnapshotV2>
  stop?: () => Promise<void>
}

export interface BilibiliLiveRankServiceOptions {
  database: ControlDatabase
  source: BilibiliLiveRankSource
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  rateLimiter?: LocalRequestRateLimiter
  requestMinIntervalMs?: number
  pageSize?: number
  guardPageSize?: number
  maxPages?: number
  webLocation?: string
}

class RankFetchFailure extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export class BilibiliLiveRankService {
  private readonly rateLimiter: LocalRequestRateLimiter
  private readonly lifetime = new AbortController()

  constructor(private readonly options: BilibiliLiveRankServiceOptions) {
    this.rateLimiter = options.rateLimiter ?? new LocalRequestRateLimiter(options.now)
  }

  summary(roomMonitorId: string): BilibiliLiveRankSummary {
    return this.toSummary(this.requireRoom(roomMonitorId), true)
  }

  summaryV2(roomMonitorId: string): BilibiliLiveRankSummaryV2 {
    return this.toSummary(this.requireRoom(roomMonitorId))
  }

  latest(input: BilibiliLiveRankLatestInput): BilibiliLiveRankSnapshot {
    const { snapshot, limit } = this.latestSnapshot(input)
    return this.toSnapshot([snapshot], limit, true)
  }

  latestV2(input: BilibiliLiveRankLatestInput): BilibiliLiveRankSnapshotV2 {
    const { snapshot, limit } = this.latestSnapshot(input)
    return this.toSnapshot([snapshot], limit)
  }

  private latestSnapshot(input: BilibiliLiveRankLatestInput): { snapshot: StoredBilibiliLiveRankSnapshot, limit: number } {
    const query = BilibiliLiveRankLatestInputSchema.parse(input)
    this.requireRoom(query.roomMonitorId)
    const snapshot = this.options.database.findLatestBilibiliLiveRankSnapshot(
      query.roomMonitorId,
      {
        ...(query.family ? { family: query.family } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.rankSwitch ? { rankSwitch: query.rankSwitch } : {})
      }
    )
    if (!snapshot) {
      throw new CoreApplicationError("BILIBILI_LIVE_RANK_NOT_FOUND", "暂无直播间榜单数据，请先刷新榜单。")
    }
    return { snapshot, limit: query.limit }
  }

  async refresh(input: BilibiliLiveRankRefreshInput): Promise<BilibiliLiveRankRefreshResult> {
    const { room, successCount, errors } = await this.collectRanks(input)
    return BilibiliLiveRankRefreshResultSchema.parse({ roomMonitorId: room.monitorId,
      successCount, errors, summary: this.toSummary(room, true) })
  }

  async refreshV2(input: BilibiliLiveRankRefreshInput): Promise<BilibiliLiveRankRefreshResultV2> {
    const { room, successCount, errors } = await this.collectRanks(input)
    return BilibiliLiveRankRefreshResultV2Schema.parse({ roomMonitorId: room.monitorId,
      successCount, errors, summary: this.toSummary(room) })
  }

  private async collectRanks(input: BilibiliLiveRankRefreshInput): Promise<{
    room: StoredBilibiliLiveRoomMonitor, successCount: number, errors: string[]
  }> {
    this.ensureRunning()
    const command = BilibiliLiveRankRefreshInputSchema.parse(input)
    const room = this.requireRoom(command.roomMonitorId)
    const kinds = this.selectedKinds(command.families, command.types)
    if (kinds.length === 0) {
      throw new CoreApplicationError("BILIBILI_LIVE_RANK_KIND_NOT_FOUND", "没有匹配的榜单类型。")
    }
    let successCount = 0
    const errors: string[] = []
    const taskId = this.options.idFactory()
    const maxPages = command.maxPages ?? Math.min(Math.max(this.options.maxPages ?? 1, 1), 5)
    for (const kind of kinds) {
      for (let page = 1; page <= maxPages; page += 1) {
        try {
          this.ensureRunning()
          const fetched = await this.fetchKind(room, kind, page, command.force, taskId)
          this.ensureRunning()
          this.persist(room, fetched)
          successCount += 1
        } catch (error) {
          this.ensureRunning()
          if (!(error instanceof RankFetchFailure)) throw error
          errors.push(`${kind.label}：${errorMessage(error)}`)
          break
        }
      }
    }
    return { room, successCount, errors }
  }

  async stop(): Promise<void> {
    if (this.lifetime.signal.aborted) return
    this.lifetime.abort()
    await this.options.source.stop?.()
  }

  private async fetchKind(
    room: StoredBilibiliLiveRoomMonitor,
    kind: RankKind,
    page: number,
    force: boolean,
    taskId: string
  ): Promise<BilibiliLiveRankFetchedSnapshotV2> {
    const pageSize = kind.family === "GUARD"
      ? Math.max(1, Math.min(this.options.guardPageSize ?? 30, 30))
      : Math.max(1, Math.min(this.options.pageSize ?? 50, 100))
    const base = {
      taskId,
      roomId: room.roomId,
      ruid: room.uid,
      family: kind.family,
      type: kind.type,
      ...(kind.rankSwitch ? { rankSwitch: kind.rankSwitch } : {}),
      periodScope: kind.periodScope,
      ...(kind.guardTyp ? { guardTyp: kind.guardTyp } : {}),
      page,
      pageSize,
      webLocation: this.options.webLocation ?? "444.8"
    }
    if (kind.family === "GUARD") {
      return this.fetchWithLog({
        ...base,
        attempt: 1,
        leaseId: this.options.idFactory(),
        endpoint: GUARD_ENDPOINT,
        forceRefreshWbi: false
      })
    }
    try {
      return await this.fetchWithLog({
        ...base,
        attempt: 1,
        leaseId: this.options.idFactory(),
        endpoint: AUDIENCE_ENDPOINT,
        forceRefreshWbi: force
      })
    } catch (error) {
      this.ensureRunning()
      if (!(error instanceof RankFetchFailure)) throw error
      if (!force && errorCode(error) === "BILIBILI_RISK_CONTROL") {
        return this.fetchWithLog({
          ...base,
          attempt: 2,
          leaseId: this.options.idFactory(),
          endpoint: AUDIENCE_ENDPOINT,
          forceRefreshWbi: true
        })
      }
      if (kind.type === "online_rank" && kind.rankSwitch === "contribution_rank") {
        return this.fetchWithLog({
          ...base,
          attempt: 2,
          leaseId: this.options.idFactory(),
          endpoint: AUDIENCE_FALLBACK_ENDPOINT,
          pageSize: Math.min(pageSize, 50),
          forceRefreshWbi: false
        })
      }
      throw error
    }
  }

  private async fetchWithLog(
    request: BilibiliLiveRankWorkerRequest
  ): Promise<BilibiliLiveRankFetchedSnapshotV2> {
    this.ensureRunning()
    const started = performance.now()
    // Match the original logging shapes, without serializing signing keys or
    // any other transport-only material from the Worker request.
    const requestMeta: BilibiliApiRequestMeta = request.endpoint === AUDIENCE_FALLBACK_ENDPOINT
      ? { roomId: request.roomId, ruid: request.ruid, page: request.page, fallback: true }
      : request.family === "GUARD"
        ? { roomId: request.roomId, ruid: request.ruid, type: request.type,
            page: request.page, pageSize: request.pageSize }
        : request.attempt > 1 && request.forceRefreshWbi
          ? { roomId: request.roomId, ruid: request.ruid, type: request.type,
              switch: request.rankSwitch!, page: request.page, forceWbi: true }
          : { roomId: request.roomId, ruid: request.ruid, type: request.type,
              switch: request.rankSwitch!, page: request.page, pageSize: request.pageSize }
    await this.acquireRateLimit()
    this.ensureRunning()
    let result: BilibiliLiveRankFetchedSnapshotV2
    try {
      result = BilibiliLiveRankFetchedSnapshotV2Schema.parse(
        exactRankFromLegacy(await this.options.source.fetch(request))
      )
      this.ensureRunning()
    } catch (error) {
      this.ensureRunning()
      // Original conversion exceptions bypass BilibiliFetchException-only
      // API logging, forced WBI refresh and online-rank fallback.
      if (errorCode(error) === "BILIBILI_RESPONSE_CONVERSION_ERROR") {
        throw new CoreApplicationError("INTERNAL_ERROR", errorMessage(error), false)
      }
      const biliCode = errorNumber(error, "biliCode")
      this.options.database.insertBilibiliApiCall({
        callId: this.options.idFactory(),
        taskId: request.taskId,
        attempt: request.attempt,
        endpointKey: error && typeof error === "object" && "endpoint" in error
          && error.endpoint === "x/web-interface/nav"
          ? error.endpoint
          : request.endpoint ?? (request.family === "GUARD" ? GUARD_ENDPOINT : AUDIENCE_ENDPOINT),
        mid: request.ruid,
        statusCode: errorNumber(error, "statusCode"),
        durationMs: Math.max(0, Math.floor(performance.now() - started)),
        errorType: errorCode(error),
        retryable: errorBoolean(error, "retryable"),
        evidenceObjectId: null,
        requestMeta,
        responseMeta: { success: false, message: errorMessage(error),
          ...(biliCode === null ? {} : { biliCode }) },
        createdAt: this.options.now().toISOString()
      })
      throw new RankFetchFailure(errorCode(error), errorMessage(error))
    }
    this.options.database.insertBilibiliApiCall({
      callId: this.options.idFactory(), taskId: request.taskId, attempt: request.attempt,
      endpointKey: result.sourceEndpoint, mid: request.ruid, statusCode: result.statusCode,
      durationMs: Math.max(0, Math.floor(performance.now() - started)),
      errorType: null, retryable: false, evidenceObjectId: result.evidenceObject.objectId,
      requestMeta, responseMeta: { success: true },
      createdAt: result.capturedAt
    }, { ...result.evidenceObject, createdAt: result.capturedAt })
    return result
  }

  private persist(
    room: StoredBilibiliLiveRoomMonitor,
    fetched: BilibiliLiveRankFetchedSnapshotV2
  ): void {
    this.options.database.upsertBilibiliLiveRankSnapshot({
      ...(fetched.rawPayloadStorageStatus !== undefined ? { rawPayloadStorageStatus: fetched.rawPayloadStorageStatus } : {}),
      snapshot: {
        snapshotId: this.options.idFactory(),
        monitorId: room.monitorId,
        roomId: room.roomId,
        ruid: room.uid,
        rankFamily: fetched.rankFamily,
        rankType: fetched.rankType,
        rankSwitch: fetched.rankSwitch ?? null,
        periodScope: fetched.periodScope ?? null,
        pageNo: fetched.pageNo,
        pageSize: fetched.pageSize,
        totalCount: fetched.totalCount ?? null,
        countText: fetched.countText ?? null,
        valueText: fetched.valueText ?? null,
        remindMsg: fetched.remindMsg ?? null,
        sourceEndpoint: fetched.sourceEndpoint,
        signedRequired: fetched.signedRequired,
        capturedAt: fetched.capturedAt,
        capturedBucket: capturedBucket(fetched.capturedAt)
      },
      entries: fetched.entries.map((entry) => ({
        entryId: this.options.idFactory(),
        userUid: entry.userUid ?? null,
        rankNo: entry.rankNo ?? null,
        entryKind: entry.entryKind,
        displayName: entry.displayName ?? null,
        faceUrl: entry.faceUrl ?? null,
        score: entry.score ?? null,
        guardLevel: entry.guardLevel ?? null,
        wealthLevel: entry.wealthLevel ?? null,
        medalName: entry.medalName ?? null,
        medalLevel: entry.medalLevel ?? null,
        medalRuid: entry.medalRuid ?? null,
        medalIsLight: entry.medalIsLight ?? null,
        rawEntryJson: entry.rawEntryJson ?? null,
        ...(entry.rawEntryStorageStatus !== undefined ? { rawEntryStorageStatus: entry.rawEntryStorageStatus } : {}),
        guardExpiredText: entry.guardExpiredText ?? null,
        accompanyDays: entry.accompanyDays ?? null
      })),
      artifact: { ...fetched.evidenceObject, createdAt: fetched.capturedAt }
    })
  }

  private toSummary(room: StoredBilibiliLiveRoomMonitor): BilibiliLiveRankSummaryV2
  private toSummary(room: StoredBilibiliLiveRoomMonitor, legacy: true): BilibiliLiveRankSummary
  private toSummary(room: StoredBilibiliLiveRoomMonitor, legacy = false): BilibiliLiveRankSummaryV2 | BilibiliLiveRankSummary {
    const groups = groupSnapshots(
      this.options.database.findLatestBilibiliLiveRankSnapshots(room.monitorId)
    )
    const snapshots = [...groups.values()].map((pages) =>
      legacy ? this.toSnapshot(pages, SUMMARY_ENTRY_LIMIT, true) : this.toSnapshot(pages, SUMMARY_ENTRY_LIMIT)
    )
    const audience = snapshots.find((snapshot) =>
      snapshot.rankFamily === "AUDIENCE"
      && snapshot.rankType === "online_rank"
      && snapshot.rankSwitch === "contribution_rank"
    ) ?? snapshots.find((snapshot) => snapshot.rankFamily === "AUDIENCE")
    const guard = snapshots.find((snapshot) => snapshot.rankFamily === "GUARD")
    const updatedAt = snapshots.map((snapshot) => snapshot.capturedAt).sort().at(-1)
    const result = {
      roomMonitorId: room.monitorId,
      roomId: room.roomId,
      ruid: room.uid,
      ...(audience?.totalCount !== undefined ? { audienceCount: audience.totalCount } : {}),
      ...(audience?.countText ? { audienceCountText: audience.countText } : {}),
      ...(guard?.totalCount !== undefined ? { guardCount: guard.totalCount } : {}),
      ...(guard?.countText ? { guardCountText: guard.countText } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      snapshots
    }
    return legacy ? BilibiliLiveRankSummarySchema.parse(safeRankLegacyProjection(result))
      : BilibiliLiveRankSummaryV2Schema.parse(result)
  }

  private toSnapshot(pages: StoredBilibiliLiveRankSnapshot[], entryLimit: number): BilibiliLiveRankSnapshotV2
  private toSnapshot(pages: StoredBilibiliLiveRankSnapshot[], entryLimit: number, legacy: true): BilibiliLiveRankSnapshot
  private toSnapshot(
    pages: StoredBilibiliLiveRankSnapshot[],
    entryLimit: number,
    legacy = false
  ): BilibiliLiveRankSnapshotV2 | BilibiliLiveRankSnapshot {
    const ordered = [...pages].sort((left, right) => left.pageNo - right.pageNo)
    const snapshot = ordered[0]
    if (!snapshot) throw new Error("Rank snapshot group cannot be empty.")
    const byKey = new Map<string, StoredBilibiliLiveRankEntry>()
    for (const page of ordered) {
      for (const entry of this.options.database.findBilibiliLiveRankEntries(page.snapshotId, entryLimit, !legacy)) {
        const key = entry.userUid
          ? `uid:${entry.userUid}`
          : entry.rankNo !== null
            ? `rank:${entry.rankNo}`
            : `name:${entry.displayName ?? ""}`
        if (!byKey.has(key)) byKey.set(key, entry)
      }
    }
    const entries = [...byKey.values()]
      .sort((left, right) => (left.rankNo ?? Number.MAX_SAFE_INTEGER) - (right.rankNo ?? Number.MAX_SAFE_INTEGER))
      .slice(0, entryLimit)
      .map((entry) => ({
        ...(entry.userUid ? { userUid: entry.userUid } : {}),
        ...(entry.rankNo !== null ? { rankNo: entry.rankNo } : {}),
        entryKind: entry.entryKind,
        ...(entry.displayName ? { displayName: entry.displayName } : {}),
        ...(entry.faceUrl ? { faceUrl: entry.faceUrl } : {}),
        ...(entry.score !== null ? { score: String(entry.score) } : {}),
        ...(entry.guardLevel !== null ? { guardLevel: entry.guardLevel } : {}),
        ...(entry.wealthLevel !== null ? { wealthLevel: entry.wealthLevel } : {}),
        ...(entry.medalName ? { medalName: entry.medalName } : {}),
        ...(entry.medalLevel !== null ? { medalLevel: entry.medalLevel } : {}),
        ...(entry.guardExpiredText ? { guardExpiredText: entry.guardExpiredText } : {}),
        ...(entry.accompanyDays !== null ? { accompanyDays: entry.accompanyDays } : {})
      }))
    const result = {
      id: snapshot.snapshotId,
      roomMonitorId: snapshot.monitorId,
      roomId: snapshot.roomId,
      ruid: snapshot.ruid,
      rankFamily: snapshot.rankFamily,
      rankType: snapshot.rankType,
      ...(snapshot.rankSwitch ? { rankSwitch: snapshot.rankSwitch } : {}),
      ...(snapshot.periodScope ? { periodScope: snapshot.periodScope } : {}),
      pageNo: snapshot.pageNo,
      pageSize: snapshot.pageSize,
      ...(snapshot.totalCount !== null ? { totalCount: String(snapshot.totalCount) } : {}),
      ...(snapshot.countText ? { countText: snapshot.countText } : {}),
      ...(snapshot.valueText ? { valueText: snapshot.valueText } : {}),
      ...(snapshot.remindMsg ? { remindMsg: snapshot.remindMsg } : {}),
      sourceEndpoint: snapshot.sourceEndpoint,
      signedRequired: snapshot.signedRequired,
      capturedAt: newestCapturedAt(ordered),
      entries
    }
    return legacy ? BilibiliLiveRankSnapshotSchema.parse(safeRankLegacyProjection(result))
      : BilibiliLiveRankSnapshotV2Schema.parse(result)
  }

  private selectedKinds(families: string[], types: string[]): RankKind[] {
    const familySet = new Set(families.map((value) => value.toUpperCase()))
    const typeSet = new Set(types.map((value) => value.toLowerCase()))
    return DEFAULT_KINDS.filter((kind) =>
      (familySet.size === 0 || familySet.has(kind.family))
      && (typeSet.size === 0 || typeSet.has(kind.type.toLowerCase())
        || (kind.rankSwitch !== undefined && typeSet.has(kind.rankSwitch.toLowerCase())))
    )
  }

  private requireRoom(roomMonitorId: string): StoredBilibiliLiveRoomMonitor {
    const room = this.options.database.findBilibiliLiveRoomById(roomMonitorId)
    if (!room) throw new CoreApplicationError("BILIBILI_LIVE_ROOM_NOT_FOUND", `监控直播间不存在：${roomMonitorId}`)
    return room
  }

  private async acquireRateLimit(): Promise<void> {
    await this.rateLimiter.acquire({ platformCode: "bilibili-live", policyKey: "live-rank",
      minIntervalMs: Math.max(0, this.options.requestMinIntervalMs ?? 1_500), signal: this.lifetime.signal,
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}) })
  }

  private ensureRunning(): void {
    if (this.lifetime.signal.aborted) {
      throw new CoreApplicationError("CORE_STOPPED", "本地榜单采集已停止。", false)
    }
  }
}

function groupSnapshots(
  snapshots: StoredBilibiliLiveRankSnapshot[]
): Map<string, StoredBilibiliLiveRankSnapshot[]> {
  const groups = new Map<string, StoredBilibiliLiveRankSnapshot[]>()
  for (const snapshot of snapshots) {
    const key = [
      snapshot.rankFamily,
      snapshot.rankType,
      snapshot.rankSwitch ?? "",
      snapshot.periodScope ?? ""
    ].join(":")
    const pages = groups.get(key) ?? []
    pages.push(snapshot)
    groups.set(key, pages)
  }
  return groups
}

function newestCapturedAt(snapshots: StoredBilibiliLiveRankSnapshot[]): string {
  return snapshots.map((snapshot) => snapshot.capturedAt).sort().at(-1) ?? ""
}

function capturedBucket(value: string): string {
  const timestamp = new Date(value)
  timestamp.setUTCSeconds(0, 0)
  return timestamp.toISOString()
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code
  }
  return "BILIBILI_LIVE_RANK_ERROR"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorBoolean(error: unknown, key: string): boolean {
  return Boolean(error && typeof error === "object" && key in error && error[key as keyof typeof error])
}

function errorNumber(error: unknown, key: string): number | null {
  if (!error || typeof error !== "object" || !(key in error)) return null
  const value = error[key as keyof typeof error]
  return typeof value === "number" ? value : null
}
