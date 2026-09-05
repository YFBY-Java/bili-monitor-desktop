import { describe, expect, it } from "vitest"

import {
  BilibiliLiveRankFetchedSnapshotSchema,
  BilibiliLiveRankRefreshInputSchema,
  BilibiliLiveRankSnapshotSchema
} from "./bilibili-live-rank"

const evidenceObject = {
  objectId: `sha256:${"a".repeat(64)}`,
  relativePath: `cas/sha256/aa/${"a".repeat(64)}.json`,
  sha256: "a".repeat(64),
  sizeBytes: 128,
  mediaType: "application/json"
}

describe("Bilibili live rank contracts", () => {
  it("preserves the original default refresh selection and page boundary", () => {
    expect(BilibiliLiveRankRefreshInputSchema.parse({
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf"
    })).toEqual({
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      families: [],
      types: [],
      maxPages: 1,
      force: false
    })
    expect(() => BilibiliLiveRankRefreshInputSchema.parse({
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      maxPages: 6
    })).toThrow()
  })

  it("validates audience and guard projections without inventing user ids", () => {
    const snapshot = BilibiliLiveRankSnapshotSchema.parse({
      id: "81814b69-d0e0-49c2-a6cc-3803b169a7c0",
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      roomId: "33",
      ruid: "22",
      rankFamily: "AUDIENCE",
      rankType: "online_rank",
      rankSwitch: "contribution_rank",
      periodScope: "REALTIME",
      pageNo: 1,
      pageSize: 50,
      sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank",
      signedRequired: true,
      capturedAt: "2026-08-29T12:00:00.000Z",
      entries: [{ rankNo: 1, entryKind: "LIST", displayName: "匿名观众" }]
    })
    expect(snapshot.entries[0]?.userUid).toBeUndefined()
  })

  it("requires real fetch metadata and evidence for worker results", () => {
    expect(BilibiliLiveRankFetchedSnapshotSchema.parse({
      rankFamily: "GUARD",
      rankType: "guard_weekly",
      periodScope: "CURRENT",
      pageNo: 1,
      pageSize: 30,
      totalCount: 1,
      sourceEndpoint: "xlive/app-room/v2/guardTab/topListNew",
      signedRequired: false,
      capturedAt: "2026-08-29T12:00:00.000Z",
      entries: [{ userUid: "99", rankNo: 1, entryKind: "TOP3", guardLevel: 3 }],
      evidenceObject,
      statusCode: 200,
      durationMs: 42
    })).toMatchObject({ rankFamily: "GUARD", totalCount: 1 })
  })
})
