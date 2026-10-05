import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { describe, expect, it } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"

const minimum = -9223372036854775808n
const maximum = 9223372036854775807n
const now = "2026-10-05T12:00:00.000Z"
const evidence = { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
  relativePath: "cas/synthetic-subject-long64.json", sizeBytes: 2, mediaType: "application/json" }

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-subject-long64-"))
  const database = await ControlDatabase.open(directory)
  const followers = new BilibiliFollowerMonitorService({ database, now: () => new Date(now),
    idFactory: randomUUID, requestMinIntervalMs: 0,
    source: { fetchCard: async ({ mid }) => ({ mid, nickname: "合成长整数用户",
      profileUrl: `https://space.bilibili.com/${mid}`, followerCount: maximum.toString(),
      followingCount: minimum.toString(), fetchedAt: now, sourceEndpoint: "x/web-interface/card",
      evidenceObject: evidence, statusCode: 200, durationMs: 1 }),
    fetchRelationStat: async () => { throw new Error("unexpected synthetic relation request") } } })
  const live = new BilibiliLiveMonitorService({ database, now: () => new Date(now),
    idFactory: randomUUID, requestMinIntervalMs: 0, source: {
      fetchStatusByUids: async () => ({ snapshots: [], fetchedAt: now,
        sourceEndpoint: "room/v1/Room/get_status_info_by_uids", evidenceObject: evidence, statusCode: 200, durationMs: 1 }),
      fetchRoomInfoOld: async () => ({ fetchedAt: now, sourceEndpoint: "room/v1/Room/getRoomInfoOld",
        evidenceObject: evidence, statusCode: 200, durationMs: 1 }),
      fetchRoomInfo: async () => { throw new Error("unexpected synthetic room request") },
      fetchRoomInit: async () => { throw new Error("unexpected synthetic room init") }
    } })
  const subjects = new BilibiliSubjectService({ database, followers, live, now: () => new Date(now),
    idFactory: randomUUID, liveDanmaku: { status: () => { throw new Error("disabled danmaku") }, recent: () => [] } })
  const monitorId = randomUUID()
  const subjectId = randomUUID()
  function seed(count: bigint, capturedAt: string, mode: "add" | "collect" = "collect") {
    database.upsertBilibiliFollowerMonitorSnapshot({ mode, monitor: { monitorId, mid: "22",
      nickname: "合成长整数用户", avatarUrl: null, profileUrl: "https://space.bilibili.com/22",
      followerCount: count, followingCount: minimum, intervalSeconds: 3600,
      nextCollectAt: "2026-10-05T13:00:00.000Z", capturedAt, sourceEndpoint: "x/web-interface/card" },
      snapshot: { snapshotId: randomUUID(), capturedBucket: capturedAt },
      artifact: { ...evidence, createdAt: capturedAt },
      outbox: { messageId: randomUUID(), topic: "fixture.seed", envelopeJson: "{}", createdAt: capturedAt } })
  }
  function bind() {
    database.createBilibiliSubject({ subject: { subjectId, displayName: "长整数工作台", avatarUrl: null,
      remark: null, tags: [], monitorStatus: "ACTIVE", healthScore: null, lastSuccessAt: null,
      lastEventAt: null, version: 1, createdAt: now, updatedAt: now },
      binding: { bindingId: randomUUID(), subjectId, bilibiliUserMonitorId: monitorId,
        bilibiliLiveRoomMonitorId: null, mid: "22", roomId: null, enabledCapabilities: ["follower"],
        danmuEnabled: false, createdAt: now, updatedAt: now }, layouts: [] },
    { messageId: randomUUID(), topic: "fixture.bind", envelopeJson: "{}", createdAt: now })
  }
  return { database, followers, subjects, seed, bind, monitorId, subjectId,
    close: async () => { await followers.stop(); await live.stop(); database.close();
      await rm(directory, { recursive: true, force: true }) } }
}

describe("Subject follower Long64 propagation", () => {
  it("uses the first of the latest 2000 in-window snapshots rather than the unbounded window baseline", async () => {
    const f = await fixture()
    try {
      const start = Date.parse("2026-10-05T11:00:00.000Z")
      f.seed(maximum, new Date(start).toISOString(), "add")
      for (let index = 1; index <= 2000; index++) {
        f.seed(minimum + BigInt(index), new Date(start + index * 1000).toISOString())
      }
      f.bind()
      expect(f.subjects.workbenchV2(f.subjectId).summary.followerDelta24h).toBe("1999")
      const points = f.database.findBilibiliFollowerSnapshots(f.monitorId, { limit: 2000 })
      expect(points).toHaveLength(2000)
      expect(points[0]?.followerCount).toBe(minimum + 1n)
    } finally { await f.close() }
  }, 20_000)
  it("uses the first in-window snapshot and Java wrapped delta in the v2 workbench", async () => {
    const f = await fixture()
    try {
      f.seed(99n, "2026-10-04T11:59:59.000Z", "add")
      f.seed(maximum, "2026-10-04T12:00:00.000Z")
      f.seed(minimum, "2026-10-05T12:00:00.000Z")
      f.bind()
      const view = f.subjects.workbenchV2(f.subjectId)
      expect(view.bilibiliUser).toMatchObject({ followerCount: minimum.toString(),
        followingCount: minimum.toString(), followerDelta24h: "1" })
      expect(view.summary).toMatchObject({ followerCount: minimum.toString(), followerDelta24h: "1" })
      expect(JSON.parse(JSON.stringify(view))).toEqual(view)
      expect(() => f.subjects.workbench(f.subjectId)).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    } finally { await f.close() }
  })

  it("keeps exact adjacent large counts and last-in-bucket semantics in v2 trends", async () => {
    const f = await fixture()
    try {
      f.seed(9007199254740992n, "2026-10-05T11:50:00.000Z", "add")
      f.seed(9007199254740993n, "2026-10-05T11:51:00.000Z")
      f.seed(maximum, "2026-10-05T12:00:00.000Z")
      f.bind()
      expect(f.subjects.trendsV2({ subjectId: f.subjectId, metrics: ["follower"], bucket: "5m" }).points)
        .toEqual([{ bucketAt: "2026-10-05T11:50:00.000Z", followerCount: "9007199254740993" },
          { bucketAt: now, followerCount: maximum.toString() }])
      expect(() => f.subjects.trends({ subjectId: f.subjectId })).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    } finally { await f.close() }
  })

  it("keeps null deltas and exact fallback counts when no snapshot falls in the requested window", async () => {
    const f = await fixture()
    try {
      f.seed(maximum, "2026-10-04T11:59:59.000Z", "add")
      f.bind()
      const view = f.subjects.workbenchV2(f.subjectId)
      expect(view.summary.followerCount).toBe(maximum.toString())
      expect(view.summary.followerDelta24h).toBeUndefined()
      expect(f.subjects.trendsV2({ subjectId: f.subjectId, metrics: ["follower"] }).points)
        .toEqual([{ bucketAt: now, followerCount: maximum.toString() }])
    } finally { await f.close() }
  })

  it("creates and rebinds a Subject through the precise follower path rather than v1 projection", async () => {
    const f = await fixture()
    try {
      const created = await f.subjects.create({ mid: maximum.toString(), danmuEnabled: false })
      expect(created.bilibiliBinding?.mid).toBe(maximum.toString())
      expect(f.subjects.workbenchV2(created.id).summary.followerCount).toBe(maximum.toString())
      expect(await f.subjects.bind({ subjectId: created.id, mid: maximum.toString(), danmuEnabled: false }))
        .toMatchObject({ mid: maximum.toString(), bilibiliUserMonitorId: created.bilibiliBinding?.bilibiliUserMonitorId })
      expect(f.database.listBilibiliFollowerMonitors()).toHaveLength(1)
    } finally { await f.close() }
  })
})
