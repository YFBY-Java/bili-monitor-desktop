import {
  BilibiliLiveRankFetchedSnapshotSchema,
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
  type StoredBilibiliLiveRankEntry,
  type StoredBilibiliLiveRankSnapshot,
  type StoredBilibiliLiveRoomMonitor
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"

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
  fetch: (request: BilibiliLiveRankWorkerRequest) => Promise<BilibiliLiveRankFetchedSnapshot>
  stop?: () => Promise<void>
}

export interface BilibiliLiveRankServiceOptions {
  database: ControlDatabase
  source: BilibiliLiveRankSource
  now: () => Date
  idFactory: () => string
  sleep?: (milliseconds: number) => Promise<void>
  requestMinIntervalMs?: number
}

export class BilibiliLiveRankService {
  private lastRequestAt: number | undefined

  constructor(private readonly options: BilibiliLiveRankServiceOptions) {}

  summary(roomMonitorId: string): BilibiliLiveRankSummary {
    return this.toSummary(this.requireRoom(roomMonitorId))
  }

  latest(input: BilibiliLiveRankLatestInput): BilibiliLiveRankSnapshot {
    const query = BilibiliLiveRankLatestInputSchema.parse(input)
    this.requireRoom(query.roomMonitorId)
    const snapshots = this.options.database.findLatestBilibiliLiveRankSnapshots(
      query.roomMonitorId,
      {
        ...(query.family ? { family: query.family } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.rankSwitch ? { rankSwitch: query.rankSwitch } : {})
      }
    )
    const groups = groupSnapshots(snapshots)
    const selected = [...groups.values()].sort((left, right) =>
      newestCapturedAt(right).localeCompare(newestCapturedAt(left))
    )[0]
    if (!selected) {
      throw new CoreApplicationError("BILIBILI_LIVE_RANK_NOT_FOUND", "暂无直播间榜单数据，请先刷新榜单。")
    }
    return this.toSnapshot(selected, query.limit)
  }

  async refresh(input: BilibiliLiveRankRefreshInput): Promise<BilibiliLiveRankRefreshResult> {
    const command = BilibiliLiveRankRefreshInputSchema.parse(input)
    const room = this.requireRoom(command.roomMonitorId)
    const kinds = this.selectedKinds(command.families, command.types)
    if (kinds.length === 0) {
      throw new CoreApplicationError("BILIBILI_LIVE_RANK_KIND_NOT_FOUND", "没有匹配的榜单类型。")
    }
    let successCount = 0
    const errors: string[] = []
    const taskId = this.options.idFactory()
    for (const kind of kinds) {
      for (let page = 1; page <= command.maxPages; page += 1) {
        try {
          const fetched = await this.fetchKind(room, kind, page, command.force, taskId)
          this.persist(room, fetched)
          successCount += 1
        } catch (error) {
          errors.push(`${kind.label}：${errorMessage(error)}`)
          break
        }
      }
    }
    return BilibiliLiveRankRefreshResultSchema.parse({
      roomMonitorId: room.monitorId,
      successCount,
      errors,
      summary: this.toSummary(room)
    })
  }

  async stop(): Promise<void> {
    await this.options.source.stop?.()
  }

  private async fetchKind(
    room: StoredBilibiliLiveRoomMonitor,
    kind: RankKind,
    page: number,
    force: boolean,
    taskId: string
  ): Promise<BilibiliLiveRankFetchedSnapshot> {
    const pageSize = kind.family === "GUARD" ? 30 : 50
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
      pageSize
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
  ): Promise<BilibiliLiveRankFetchedSnapshot> {
    await this.acquireRateLimit()
    const started = performance.now()
    try {
      const result = BilibiliLiveRankFetchedSnapshotSchema.parse(
        await this.options.source.fetch(request)
      )
      this.options.database.insertBilibiliApiCall({
        callId: this.options.idFactory(),
        taskId: request.taskId,
        attempt: request.attempt,
        endpointKey: result.sourceEndpoint,
        mid: request.ruid,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        errorType: null,
        retryable: false,
        evidenceObjectId: result.evidenceObject.objectId,
        createdAt: result.capturedAt
      }, { ...result.evidenceObject, createdAt: result.capturedAt })
      return result
    } catch (error) {
      this.options.database.insertBilibiliApiCall({
        callId: this.options.idFactory(),
        taskId: request.taskId,
        attempt: request.attempt,
        endpointKey: request.endpoint ?? (request.family === "GUARD" ? GUARD_ENDPOINT : AUDIENCE_ENDPOINT),
        mid: request.ruid,
        statusCode: errorNumber(error, "statusCode"),
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        errorType: errorCode(error),
        retryable: errorBoolean(error, "retryable"),
        evidenceObjectId: null,
        createdAt: this.options.now().toISOString()
      })
      throw error
    }
  }

  private persist(
    room: StoredBilibiliLiveRoomMonitor,
    fetched: BilibiliLiveRankFetchedSnapshot
  ): void {
    this.options.database.upsertBilibiliLiveRankSnapshot({
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
        guardExpiredText: entry.guardExpiredText ?? null,
        accompanyDays: entry.accompanyDays ?? null
      })),
      artifact: { ...fetched.evidenceObject, createdAt: fetched.capturedAt }
    })
  }

  private toSummary(room: StoredBilibiliLiveRoomMonitor): BilibiliLiveRankSummary {
    const groups = groupSnapshots(
      this.options.database.findLatestBilibiliLiveRankSnapshots(room.monitorId)
    )
    const snapshots = [...groups.values()].map((pages) =>
      this.toSnapshot(pages, SUMMARY_ENTRY_LIMIT)
    )
    const audience = snapshots.find((snapshot) =>
      snapshot.rankFamily === "AUDIENCE"
      && snapshot.rankType === "online_rank"
      && snapshot.rankSwitch === "contribution_rank"
    ) ?? snapshots.find((snapshot) => snapshot.rankFamily === "AUDIENCE")
    const guard = snapshots.find((snapshot) => snapshot.rankFamily === "GUARD")
    const updatedAt = snapshots.map((snapshot) => snapshot.capturedAt).sort().at(-1)
    return BilibiliLiveRankSummarySchema.parse({
      roomMonitorId: room.monitorId,
      roomId: room.roomId,
      ruid: room.uid,
      ...(audience?.totalCount !== undefined ? { audienceCount: audience.totalCount } : {}),
      ...(audience?.countText ? { audienceCountText: audience.countText } : {}),
      ...(guard?.totalCount !== undefined ? { guardCount: guard.totalCount } : {}),
      ...(guard?.countText ? { guardCountText: guard.countText } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      snapshots
    })
  }

  private toSnapshot(
    pages: StoredBilibiliLiveRankSnapshot[],
    entryLimit: number
  ): BilibiliLiveRankSnapshot {
    const ordered = [...pages].sort((left, right) => left.pageNo - right.pageNo)
    const snapshot = ordered[0]
    if (!snapshot) throw new Error("Rank snapshot group cannot be empty.")
    const byKey = new Map<string, StoredBilibiliLiveRankEntry>()
    for (const page of ordered) {
      for (const entry of this.options.database.findBilibiliLiveRankEntries(page.snapshotId, entryLimit)) {
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
        ...(entry.score !== null ? { score: entry.score } : {}),
        ...(entry.guardLevel !== null ? { guardLevel: entry.guardLevel } : {}),
        ...(entry.wealthLevel !== null ? { wealthLevel: entry.wealthLevel } : {}),
        ...(entry.medalName ? { medalName: entry.medalName } : {}),
        ...(entry.medalLevel !== null ? { medalLevel: entry.medalLevel } : {}),
        ...(entry.guardExpiredText ? { guardExpiredText: entry.guardExpiredText } : {}),
        ...(entry.accompanyDays !== null ? { accompanyDays: entry.accompanyDays } : {})
      }))
    return BilibiliLiveRankSnapshotSchema.parse({
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
      ...(snapshot.totalCount !== null ? { totalCount: snapshot.totalCount } : {}),
      ...(snapshot.countText ? { countText: snapshot.countText } : {}),
      ...(snapshot.valueText ? { valueText: snapshot.valueText } : {}),
      ...(snapshot.remindMsg ? { remindMsg: snapshot.remindMsg } : {}),
      sourceEndpoint: snapshot.sourceEndpoint,
      signedRequired: snapshot.signedRequired,
      capturedAt: newestCapturedAt(ordered),
      entries
    })
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
    const minimum = Math.max(0, this.options.requestMinIntervalMs ?? 1_500)
    const now = this.options.now().getTime()
    if (this.lastRequestAt !== undefined && now - this.lastRequestAt < minimum) {
      await (this.options.sleep ?? delay)(minimum - (now - this.lastRequestAt))
    }
    this.lastRequestAt = this.options.now().getTime()
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
  timestamp.setUTCMilliseconds(0)
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
