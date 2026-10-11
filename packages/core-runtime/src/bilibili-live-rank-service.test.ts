import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  BilibiliLiveRankFetchedSnapshot,
  BilibiliLiveRankWorkerRequest
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it } from "vitest"

import {
  BilibiliLiveRankService,
  type BilibiliLiveRankSource
} from "./bilibili-live-rank-service"

describe("BilibiliLiveRankService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("refreshes the selected original rank kind and exposes summary/latest from SQLite", async () => {
    const database = await seededDatabase()
    const source = rankSource(async (request) => fetched(request, [{
      userUid: "99",
      rankNo: 1,
      entryKind: "LIST",
      displayName: "Alice",
      score: 120
    }], 1))
    const service = createService(database, source)
    try {
      const result = await service.refresh({
        roomMonitorId: MONITOR_ID,
        types: ["contribution_rank"]
      })

      expect(result).toMatchObject({
        roomMonitorId: MONITOR_ID,
        successCount: 1,
        errors: [],
        summary: {
          audienceCount: 1,
          snapshots: [{ rankType: "online_rank", rankSwitch: "contribution_rank" }]
        }
      })
      expect(service.latest({
        roomMonitorId: MONITOR_ID,
        family: "AUDIENCE",
        type: "online_rank",
        rankSwitch: "contribution_rank"
      })).toMatchObject({ entries: [{ userUid: "99", displayName: "Alice" }] })
      expect(source.calls).toHaveLength(1)
      // Published v16 accepted these safe integers without an int32 upper bound.
      // Upgrade must keep the row, old readers keep their values, v2 uses Java int semantics.
      const raw = new DatabaseSync(resolve(directory!, "control.db"))
      try {
        raw.exec(`UPDATE bilibili_live_rank_entry SET rank_no=4294967298,
          guard_level=4294967299, wealth_level=2147483648, medal_level=4294967301,
          accompany_days=4294967302;
          INSERT INTO bilibili_live_rank_entry(entry_id, snapshot_id, monitor_id, room_id, ruid,
            user_uid, rank_no, entry_kind, display_name, created_at)
          SELECT '00000000-0000-4000-8000-000000009999', snapshot_id, monitor_id, room_id, ruid,
            '100', 3, entry_kind, '历史第三名', created_at FROM bilibili_live_rank_entry WHERE user_uid='99';`)
      } finally { raw.close() }
      const latestInput = { roomMonitorId: MONITOR_ID, family: "AUDIENCE" as const }
      expect(service.latestV2(latestInput).entries[0]).toMatchObject({
        rankNo: 2, guardLevel: 3, wealthLevel: -2147483648, medalLevel: 5, accompanyDays: 6
      })
      expect(service.summaryV2(MONITOR_ID).snapshots[0]?.entries[0]?.rankNo).toBe(2)
      expect(service.latestV2({ ...latestInput, limit: 1 }).entries).toMatchObject([{ userUid: "99", rankNo: 2 }])
      expect(service.latest({ ...latestInput, limit: 1 }).entries).toMatchObject([{ userUid: "100", rankNo: 3 }])
      expect(service.latest(latestInput).entries.find(entry => entry.userUid === "99")).toMatchObject({
        rankNo: 4294967298, guardLevel: 4294967299, wealthLevel: 2147483648,
        medalLevel: 4294967301, accompanyDays: 4294967302
      })
      expect(service.summary(MONITOR_ID).snapshots[0]?.entries.find(entry => entry.userUid === "99")?.rankNo).toBe(4294967298)
      const refreshed = await service.refresh({ roomMonitorId: MONITOR_ID, families: ["GUARD"], types: ["guard_weekly"] })
      expect(refreshed.summary.snapshots.find(snapshot => snapshot.rankFamily === "AUDIENCE")?.entries.find(entry => entry.userUid === "99")?.rankNo).toBe(4294967298)
      expect(database.findLatestBilibiliLiveRankSnapshots(MONITOR_ID)
        .filter(snapshot => snapshot.rankFamily === "AUDIENCE")
        .flatMap(snapshot => database.findBilibiliLiveRankEntries(snapshot.snapshotId, 10)).find(entry => entry.userUid === "99")?.rankNo).toBe(4294967298)
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("retries WBI once on original risk-control semantics", async () => {
    const database = await seededDatabase()
    const source = rankSource(async (request, call) => {
      if (call === 1) throw Object.assign(sourceError("BILIBILI_RISK_CONTROL", "风控", true), { biliCode: -352 })
      return fetched(request, [], 0)
    })
    const service = createService(database, source)
    try {
      const result = await service.refresh({
        roomMonitorId: MONITOR_ID,
        types: ["entry_time_rank"]
      })
      expect(result.successCount).toBe(1)
      expect(source.calls.map((request) => request.forceRefreshWbi)).toEqual([false, true])
      expect(database.listBilibiliApiCalls(source.calls[0]!.taskId)).toMatchObject([
        { requestMeta: { roomId: "33", ruid: "22", type: "online_rank", switch: "entry_time_rank",
            page: 1, pageSize: 50 }, responseMeta: { success: false, message: "风控", biliCode: -352 } },
        { requestMeta: { roomId: "33", ruid: "22", type: "online_rank", switch: "entry_time_rank",
            page: 1, forceWbi: true }, responseMeta: { success: true } }
      ])
      expect(database.listBilibiliApiCalls(source.calls[0]!.taskId)[1]?.requestMeta).not.toHaveProperty("pageSize")
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("falls back to the original unsigned online contribution endpoint", async () => {
    const database = await seededDatabase()
    const source = rankSource(async (request, call) => {
      if (call === 1) throw sourceError("BILIBILI_API_ERROR", "主榜单不可用", false)
      return fetched({
        ...request,
        endpoint: "xlive/general-interface/v1/rank/getOnlineGoldRank"
      }, [], 0)
    })
    const service = createService(database, source)
    try {
      const result = await service.refresh({
        roomMonitorId: MONITOR_ID,
        types: ["contribution_rank"]
      })
      expect(result.successCount).toBe(1)
      expect(source.calls[1]?.endpoint).toBe("xlive/general-interface/v1/rank/getOnlineGoldRank")
      expect(result.summary.snapshots[0]).toMatchObject({ signedRequired: false })
    } finally {
      await service.stop()
      database.close()
    }
  })

  it.each([
    ["AUDIENCE", "today_rank", "daily_rank"],
    ["GUARD", "guard_accompany", "guard_accompany"]
  ] as const)("serves the shared widget's four-page %s/%s command from real SQLite", async (family, type, rankType) => {
    const database = await seededDatabase()
    let nextMinute = false
    const source = rankSource(async request => {
      if (nextMinute && request.page === 2) throw sourceError("BILIBILI_SERVER_ERROR", "合成第二页不可用", false)
      return { ...fetched(request, Array.from({ length: 30 }, (_, index) => {
        const rankNo = (request.page - 1) * 30 + index + 1
        return { userUid: String(rankNo + (nextMinute ? 100_000 : 1000)), rankNo, entryKind: "LIST", displayName: `合成排行${rankNo}`,
          score: 1000 - rankNo, ...(family === "GUARD" ? { accompanyDays: rankNo, guardLevel: 3 } : {}),
          ...(nextMinute && index < 2 ? { faceUrl: index === 0 ? "//avatars.example/one.png" : "avatars.example/two.png" } : {}) }
      }), nextMinute ? 30 : 120),
      capturedAt: family === "AUDIENCE" ? `2026-08-29T12:0${nextMinute ? 2 : 1}:0${request.page}.000Z` : "2026-08-29T12:01:00.000Z" }
    })
    const service = createService(database, source)
    try {
      const result = await service.refresh({ roomMonitorId: MONITOR_ID, families: [family], types: [type], maxPages: 4, force: true })
      expect(source.calls.map(request => request.page)).toEqual([1, 2, 3, 4])
      expect(source.calls.every(request => request.family === family && request.type === rankType)).toBe(true)
      expect(result.successCount).toBe(4)
      expect(result.errors).toEqual([])
      expect(result.summary.snapshots).toHaveLength(1)
      expect(service.summary(MONITOR_ID).snapshots[0]?.entries).toHaveLength(100)
      expect(service.summary(MONITOR_ID).snapshots[0]?.entries.at(-1)).toMatchObject({ userUid: "1100", rankNo: 100 })
      if (family === "GUARD") expect(result.summary.snapshots[0]?.entries[0]).toMatchObject({ accompanyDays: 1, guardLevel: 3 })
      if (family === "AUDIENCE") {
        const pages = database.findLatestBilibiliLiveRankSnapshots(MONITOR_ID)
        expect.soft(pages.map(page => page.capturedBucket)).toEqual(Array(4).fill("2026-08-29T12:01:00.000Z"))
        const latestInput = { roomMonitorId: MONITOR_ID, family, type: rankType, rankSwitch: "today_rank", limit: 2 }
        expect.soft(service.latest(latestInput)).toMatchObject({ pageNo: 4,
          capturedAt: "2026-08-29T12:01:04.000Z", entries: [{ rankNo: 91 }, { rankNo: 92 }] })

        const pageFour = pages.find(page => page.pageNo === 4)
        expect(pageFour).toBeDefined()
        if (!pageFour) throw new Error("Expected persisted fourth page")
        const legacyIds = ["00000000-0000-4000-8000-000000009001", "00000000-0000-4000-8000-000000009002"]
        // Old releases wrote seconds. Preserve both old rows; choose the later insertion for a tied page/time.
        for (const [index, snapshotId] of legacyIds.entries()) {
          database.upsertBilibiliLiveRankSnapshot({
            snapshot: { ...pageFour, snapshotId, capturedAt: "2026-08-29T12:01:20.000Z",
              capturedBucket: `2026-08-29T12:01:2${index}.000Z` },
            entries: database.findBilibiliLiveRankEntries(pageFour.snapshotId, 30).map((entry, position) => ({ ...entry,
              entryId: `00000000-0000-4000-8000-${String(10_000 + index * 100 + position).padStart(12, "0")}`,
              displayName: index === 0 ? "旧秒桶首行" : "旧秒桶后行" })),
            artifact: { ...fetched(source.calls[0]!, [], 0).evidenceObject, createdAt: "2026-08-29T12:01:20.000Z" }
          })
        }
        expect.soft(service.latest(latestInput)).toMatchObject({ id: legacyIds[1], pageNo: 4,
          capturedAt: "2026-08-29T12:01:20.000Z", entries: [{ displayName: "旧秒桶后行" }, { displayName: "旧秒桶后行" }] })
        expect.soft(service.summary(MONITOR_ID).snapshots[0]?.entries).toHaveLength(100)
        expect.soft(service.summary(MONITOR_ID).snapshots[0]?.entries.at(-1)?.displayName).toBe("旧秒桶后行")

        nextMinute = true
        const refreshed = await service.refresh({ roomMonitorId: MONITOR_ID, families: [family], types: [type], maxPages: 4, force: true })
        expect.soft(source.calls.slice(4).map(request => request.page)).toEqual([1, 2])
        expect.soft(refreshed.successCount).toBe(1)
        expect.soft(refreshed.errors).toEqual(["房间观众日榜：合成第二页不可用"])
        expect.soft(refreshed.summary.snapshots[0]?.entries).toHaveLength(30)
        expect.soft(refreshed.summary.snapshots[0]?.entries.slice(0, 2)).toMatchObject([
          { userUid: "100001", faceUrl: "//avatars.example/one.png" },
          { userUid: "100002", faceUrl: "avatars.example/two.png" }
        ])
        expect.soft(service.latest(latestInput)).toMatchObject({ pageNo: 1, capturedAt: "2026-08-29T12:02:01.000Z",
          entries: [{ userUid: "100001" }, { userUid: "100002" }] })
        const history = new DatabaseSync(resolve(directory!, "control.db"), { readOnly: true })
        try {
          expect(history.prepare("SELECT captured_bucket AS bucket FROM bilibili_live_rank_snapshot WHERE snapshot_id IN (?, ?) ORDER BY rowid")
            .all(...legacyIds)).toEqual([{ bucket: "2026-08-29T12:01:20.000Z" }, { bucket: "2026-08-29T12:01:21.000Z" }])
        } finally { history.close() }
      }
    } finally { await service.stop(); database.close() }
  })

  async function seededDatabase(): Promise<ControlDatabase> {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-rank-service-"))
    const database = await ControlDatabase.open(directory)
    database.applyBilibiliLiveRoomSnapshot({
      monitor: {
        monitorId: MONITOR_ID,
        uid: "22",
        roomId: "33",
        shortId: null,
        uname: "anchor",
        faceUrl: null,
        title: "title",
        coverUrl: null,
        keyframeUrl: null,
        areaId: null,
        areaName: null,
        parentAreaId: null,
        parentAreaName: null,
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        onlineCount: 100,
        attentionCount: 200,
        intervalSeconds: 300,
        nextCollectAt: "2026-08-29T12:05:00.000Z",
        capturedAt: "2026-08-29T12:00:00.000Z",
        sourceEndpoint: "room/v1/Room/get_info"
      },
      snapshot: {
        snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
        capturedBucket: "2026-08-29T12:00:00.000Z"
      },
      artifact: {
        objectId: `sha256:${"d".repeat(64)}`,
        sha256: "d".repeat(64),
        relativePath: `cas/sha256/dd/${"d".repeat(64)}.json`,
        sizeBytes: 100,
        mediaType: "application/json",
        createdAt: "2026-08-29T12:00:00.000Z"
      },
      outbox: {
        messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0902",
        topic: "seed",
        envelopeJson: "{}",
        createdAt: "2026-08-29T12:00:00.000Z"
      }
    })
    return database
  }
})

const MONITOR_ID = "018f0f39-7b5e-7cc1-962d-9a208b3d0900"

function createService(database: ControlDatabase, source: MutableRankSource): BilibiliLiveRankService {
  let id = 0
  return new BilibiliLiveRankService({
    database,
    source,
    now: () => new Date("2026-08-29T12:01:00.000Z"),
    idFactory: () => {
      id += 1
      return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`
    },
    requestMinIntervalMs: 0
  })
}

interface MutableRankSource extends BilibiliLiveRankSource {
  calls: BilibiliLiveRankWorkerRequest[]
}

function rankSource(
  result: (request: BilibiliLiveRankWorkerRequest, call: number) => Promise<BilibiliLiveRankFetchedSnapshot>
): MutableRankSource {
  const calls: BilibiliLiveRankWorkerRequest[] = []
  return {
    calls,
    fetch: async (request) => {
      calls.push(request)
      return result(request, calls.length)
    }
  }
}

function fetched(
  request: BilibiliLiveRankWorkerRequest,
  entries: BilibiliLiveRankFetchedSnapshot["entries"],
  totalCount: number
): BilibiliLiveRankFetchedSnapshot {
  const endpoint = request.endpoint
    ?? (request.family === "GUARD"
      ? "xlive/app-room/v2/guardTab/topListNew"
      : "xlive/general-interface/v1/rank/queryContributionRank")
  return {
    rankFamily: request.family,
    rankType: request.type,
    ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}),
    ...(request.periodScope ? { periodScope: request.periodScope } : {}),
    pageNo: request.page,
    pageSize: request.pageSize,
    totalCount,
    sourceEndpoint: endpoint,
    signedRequired: endpoint === "xlive/general-interface/v1/rank/queryContributionRank",
    capturedAt: "2026-08-29T12:01:00.000Z",
    entries,
    evidenceObject: {
      objectId: `sha256:${"e".repeat(64)}`,
      sha256: "e".repeat(64),
      relativePath: `cas/sha256/ee/${"e".repeat(64)}.json`,
      sizeBytes: 100,
      mediaType: "application/json"
    },
    statusCode: 200,
    durationMs: 10
  }
}

function sourceError(code: string, message: string, retryable: boolean): Error {
  return Object.assign(new Error(message), { code, retryable })
}
