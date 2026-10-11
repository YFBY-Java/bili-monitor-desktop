import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  BilibiliLiveRankFetchedSnapshotSchema,
  BilibiliLiveRankRefreshInputSchema,
  BilibiliLiveRankSnapshotSchema
} from "./bilibili-live-rank"
import { BilibiliLiveRankFetchedSnapshotV2Schema } from "./bilibili-live-rank-v2"
import { BilibiliLiveRankConfigurationSchema } from "./bilibili-live-rank-configuration"
import { JAVA_LONG_STRING_PATTERN } from "./java-long"

const evidenceObject = {
  objectId: `sha256:${"a".repeat(64)}`,
  relativePath: `cas/sha256/aa/${"a".repeat(64)}.json`,
  sha256: "a".repeat(64),
  sizeBytes: 128,
  mediaType: "application/json"
}

describe("Bilibili live rank contracts", () => {
  it("validates the shared rank configuration examples", () => {
    const fixtures: Array<{ input: unknown; valid: boolean }> = JSON.parse(readFileSync(
      new URL("../fixtures/live-rank-configuration.json", import.meta.url), "utf8"))
    for (const fixture of fixtures) {
      expect(BilibiliLiveRankConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
    }
    expect(BilibiliLiveRankConfigurationSchema.parse({})).toEqual({ enabled: true, pageSize: 50,
      guardPageSize: 30, maxPages: 1, requestMinIntervalMs: 1500, webLocation: "444.8" })
  })
  it("preserves the original default refresh selection and page boundary", () => {
    expect(BilibiliLiveRankRefreshInputSchema.parse({
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf"
    })).toEqual({
      roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      families: [],
      types: [],
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
    const result = {
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
    }
    expect(BilibiliLiveRankFetchedSnapshotSchema.parse(result)).toMatchObject({ rankFamily: "GUARD", totalCount: 1 })
    const precise = JSON.parse(readFileSync(new URL("../fixtures/rank-long64.json", import.meta.url), "utf8"))
    const portable = JSON.parse(readFileSync(new URL("../schemas/bilibili-live-rank-worker.v2.schema.json", import.meta.url), "utf8"))
    expect(portable.$defs.JavaLongString.pattern).toBe(JAVA_LONG_STRING_PATTERN)
    for (const sample of [precise.guard, precise.audience]) {
      const payload = { ...result, ...sample.expected }
      expect(BilibiliLiveRankFetchedSnapshotV2Schema.parse(payload)).toMatchObject(sample.expected)
      expect(BilibiliLiveRankFetchedSnapshotSchema.safeParse(payload).success).toBe(false)
    }
    expect(BilibiliLiveRankFetchedSnapshotV2Schema.safeParse({ ...result, totalCount: "9223372036854775808" }).success).toBe(false)
    const entryFacts = JSON.parse(readFileSync(new URL("../fixtures/rank-entry-facts.json", import.meta.url), "utf8"))
    for (const sample of [entryFacts.guard, entryFacts.audience]) {
      const entries = sample.facts.map((fact: Record<string, unknown>) => ({ entryKind: "LIST", ...fact }))
      expect(BilibiliLiveRankFetchedSnapshotV2Schema.parse({ ...result, totalCount: "1", entries }).entries).toEqual(entries)
    }
    const sample = JSON.parse(readFileSync(new URL("../fixtures/rank-storage-text.json", import.meta.url), "utf8"))
    const item = sample.guard.body.data.list[0].uinfo
    expect(BilibiliLiveRankFetchedSnapshotSchema.parse({ ...result,
      countText: sample.guard.body.data.info.num_text, remindMsg: sample.guard.body.data.remind_msg,
      entries: [{ entryKind: "LIST", displayName: item.base.name, medalName: item.medal.name,
        guardExpiredText: item.guard.expired_str }] })).toMatchObject({ countText: sample.guard.body.data.info.num_text })
    expect(BilibiliLiveRankSnapshotSchema.parse({
      id: "81814b69-d0e0-49c2-a6cc-3803b169a7c0", roomMonitorId: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      roomId: "33", ruid: "22", rankFamily: result.rankFamily, rankType: result.rankType,
      periodScope: result.periodScope, pageNo: result.pageNo, pageSize: result.pageSize,
      sourceEndpoint: result.sourceEndpoint, signedRequired: result.signedRequired, capturedAt: result.capturedAt,
      ...sample.guard.stored })).toMatchObject(sample.guard.stored)
    const cases: Array<{ status: string }> = JSON.parse(
      readFileSync(new URL("../fixtures/follower-raw-payload-storage.json", import.meta.url), "utf8"))
    for (const { status } of cases) {
      expect(BilibiliLiveRankFetchedSnapshotSchema.parse({ ...result, rawPayloadStorageStatus: status }).rawPayloadStorageStatus).toBe(status)
    }
    for (const status of [null, "unknown"]) {
      expect(BilibiliLiveRankFetchedSnapshotSchema.safeParse({ ...result, rawPayloadStorageStatus: status }).success).toBe(false)
    }
  })
})
