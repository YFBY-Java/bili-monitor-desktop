import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

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
    } finally {
      await service.stop()
      database.close()
    }
  })

  it("retries WBI once on original risk-control semantics", async () => {
    const database = await seededDatabase()
    const source = rankSource(async (request, call) => {
      if (call === 1) throw sourceError("BILIBILI_RISK_CONTROL", "风控", true)
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
    const source = rankSource(async request => fetched(request, Array.from({ length: 30 }, (_, index) => {
      const rankNo = (request.page - 1) * 30 + index + 1
      return { userUid: String(rankNo + 1000), rankNo, entryKind: "LIST", displayName: `合成排行${rankNo}`,
        score: 1000 - rankNo, ...(family === "GUARD" ? { accompanyDays: rankNo, guardLevel: 3 } : {}) }
    }), 120))
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
