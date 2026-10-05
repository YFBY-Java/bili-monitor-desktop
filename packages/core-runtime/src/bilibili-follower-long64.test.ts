import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliFollowerFetchedSnapshot, BilibiliFollowerFetchedSnapshotV2 } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"

const minimum = "-9223372036854775808"
const maximum = "9223372036854775807"
const adjacent = "9007199254740993"

async function longFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-service-long64-"))
  const database = await ControlDatabase.open(directory)
  let sequence = 1
  const calls: string[] = []
  const state = { now: "2026-10-05T00:00:00.000Z", fetchedAt: "2026-10-05T00:00:00.000Z",
    responseMid: "22", count: maximum, following: minimum as string | undefined,
    cardError: undefined as Error | undefined, relationError: undefined as Error | undefined,
    unsafeNumeric: false }
  const snapshot = (endpoint: "x/web-interface/card" | "x/relation/stat"):
    BilibiliFollowerFetchedSnapshot | BilibiliFollowerFetchedSnapshotV2 => {
    const base = { mid: state.responseMid,
      ...(endpoint === "x/web-interface/card" ? { nickname: "合成长整数用户", avatarUrl: "https://example.com/synthetic.png" } : {}),
      profileUrl: `https://space.bilibili.com/${state.responseMid}`, fetchedAt: state.fetchedAt,
      sourceEndpoint: endpoint, statusCode: 200, durationMs: 1,
      evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
        relativePath: "objects/synthetic-follower-long64.json", sizeBytes: 2, mediaType: "application/json" } }
    if (state.unsafeNumeric) return { ...base, followerCount: 9007199254740992, followingCount: 1 }
    return { ...base, followerCount: state.count,
      ...(state.following === undefined ? {} : { followingCount: state.following }) }
  }
  const service = new BilibiliFollowerMonitorService({ database,
    now: () => new Date(state.now), idFactory: () => `018f0f39-7b5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
    requestMinIntervalMs: 0, maxAttempts: 1, sleep: async () => undefined,
    source: {
      fetchCard: async request => { calls.push(`card:${request.mid}`); if (state.cardError) throw state.cardError;
        return snapshot("x/web-interface/card") },
      fetchRelationStat: async request => { calls.push(`relation:${request.mid}`); if (state.relationError) throw state.relationError;
        return snapshot("x/relation/stat") }
    }
  })
  return { database, service, state, calls, close: async () => {
    await service.stop(); database.close(); await rm(directory, { recursive: true, force: true })
  } }
}

describe("precise follower v2 business service", () => {
  let fixture: Awaited<ReturnType<typeof longFixture>> | undefined
  afterEach(async () => { await fixture?.close() })

  it.each([
    [maximum, minimum, "-1", 1.0842021724855044e-19],
    [minimum, maximum, "1", 1.0842021724855044e-19],
    [maximum, "-1", minimum, 9.223372036854776e18],
    [minimum, "1", maximum, 9.223372036854776e18],
    ["0", minimum, minimum, 1],
    ["-1", "-1", "0", -0]
  ] as const)("matches original Java delta and growth for current %s previous %s", async (current, previous, delta, rate) => {
    fixture = await longFixture()
    fixture.state.count = previous
    fixture.state.following = undefined
    const user = await fixture.service.addUserV2({ mid: "22" })
    fixture.state.count = current
    fixture.state.fetchedAt = "2026-10-05T00:00:01.000Z"
    await fixture.service.refreshNowV2(user.id)
    const view = fixture.service.trendV2(user.id).user
    expect(view.deltaSincePrevious).toBe(delta)
    expect(Object.is(view.growthRateSincePrevious, rate)).toBe(true)
  })

  it("stores both Long boundaries and returns exact v2 strings and outbox payloads", async () => {
    fixture = await longFixture()
    const { service, database } = fixture
    const user = await service.addUserV2({ mid: maximum })
    expect(user).toMatchObject({ mid: "22", currentFollowerCount: maximum, followingCount: minimum,
      recentTrend: [{ followerCount: maximum, followingCount: minimum }] })
    expect(database.findBilibiliFollowerMonitorById(user.id))
      .toMatchObject({ currentFollowerCount: BigInt(maximum), followingCount: BigInt(minimum) })
    const event = database.listPendingOutbox().at(-1)!
    expect(event.topic).toBe("bilibili.follower.snapshot-collected.v2")
    expect(JSON.parse(event.envelopeJson)).toMatchObject({ type: event.topic,
      payload: { mid: "22", followerCount: maximum, followingCount: minimum } })
    expect(service.listUsersV2().items[0]).toMatchObject({ currentFollowerCount: maximum })
    expect(fixture.calls).toEqual([`card:${maximum}`])
  })

  it("reuses the actual response MID monitor identity when a different requested MID resolves to it", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    const first = await service.addUserV2({ mid: "22" })
    state.count = adjacent
    state.fetchedAt = "2026-10-05T00:00:01.000Z"
    const repeated = await service.addUserV2({ mid: "23", intervalSeconds: 120 })
    expect(repeated).toMatchObject({ id: first.id, mid: "22", currentFollowerCount: adjacent, intervalSeconds: 120 })
    expect(database.listBilibiliFollowerMonitors()).toHaveLength(1)
    expect(database.findBilibiliFollowerSnapshots(first.id, { limit: 30 })).toHaveLength(2)
  })

  it("refreshes signed response MIDs, preserves same-second snapshot identity and wraps Java long delta", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    state.count = minimum
    state.following = "0"
    const user = await service.addUserV2({ mid: "22" })
    state.count = maximum
    state.responseMid = "-1"
    state.fetchedAt = "2026-10-05T00:00:01.123456Z"
    expect(await service.refreshNowV2(user.id)).toMatchObject({ mid: "22", followerCount: maximum, success: true })
    const first = database.findBilibiliFollowerSnapshots(user.id, { limit: 30 }).at(-1)!
    expect(first.mid).toBe("-1")
    expect(service.trendV2(user.id).user).toMatchObject({ currentFollowerCount: maximum,
      deltaSincePrevious: "-1", growthRateSincePrevious: Number(-1n) / Number(BigInt(minimum)) })
    state.responseMid = "0"
    state.fetchedAt = "2026-10-05T00:00:01.987654Z"
    await service.refreshNowV2(user.id)
    expect(database.findBilibiliFollowerSnapshots(user.id, { limit: 30 }).at(-1))
      .toMatchObject({ snapshotId: first.snapshotId, mid: "-1", followerCount: BigInt(maximum) })
    expect(database.findBilibiliFollowerMonitorById(user.id)?.mid).toBe("22")
    expect(JSON.parse(database.listPendingOutbox().at(-1)!.envelopeJson).payload.mid).toBe("0")
    expect(service.trendsV2({ userIds: [user.id] })[0]?.points.map(point => point.followerCount))
      .toEqual([minimum, maximum])
  })

  it("keeps status, interval and due collection on the exact path and omits the rate for zero previous count", async () => {
    fixture = await longFixture()
    const { service, state } = fixture
    state.count = "0"
    state.following = undefined
    const user = await service.addUserV2({ mid: "22", intervalSeconds: 120 })
    expect(service.updateStatusV2(user.id, false).monitorStatus).toBe("PAUSED")
    expect(service.updateIntervalV2(user.id, 3600).intervalSeconds).toBe(3600)
    state.now = "2026-10-05T02:00:00.000Z"
    expect(await service.collectDueUsersV2()).toEqual([])
    service.updateStatusV2(user.id, true)
    state.count = adjacent
    state.fetchedAt = state.now
    expect(await service.collectDueUsersV2()).toMatchObject([{ mid: "22", followerCount: adjacent, success: true }])
    expect(service.trendV2(user.id).user).toMatchObject({ deltaSincePrevious: adjacent })
    expect(service.trendV2(user.id).user.growthRateSincePrevious).toBeUndefined()
  })

  it("uses relation fallback without retaining a missing following count or replacing profile", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    const user = await service.addUserV2({ mid: "22" })
    state.cardError = Object.assign(new Error("合成 card 解析失败"), { code: "BILIBILI_PARSE_ERROR", retryable: false })
    state.responseMid = minimum
    state.count = adjacent
    state.following = undefined
    state.fetchedAt = "2026-10-05T00:00:01.000Z"
    expect(await service.refreshNowV2(user.id)).toMatchObject({ mid: "22", followerCount: adjacent, sourceEndpoint: "x/relation/stat" })
    expect(database.findBilibiliFollowerMonitorById(user.id)).toMatchObject({ nickname: "合成长整数用户",
      avatarUrl: "https://example.com/synthetic.png", profileUrl: "https://space.bilibili.com/22", followingCount: null })
    expect(database.findBilibiliFollowerSnapshots(user.id, { limit: 30 }).at(-1)?.mid).toBe(minimum)
  })

  it("preserves exact history and count in a failed due result", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    const user = await service.addUserV2({ mid: "22" })
    state.now = "2026-10-05T02:00:00.000Z"
    state.cardError = Object.assign(new Error("合成风控"), { code: "BILIBILI_RISK_CONTROL", retryable: false })
    expect(await service.collectDueUsersV2()).toMatchObject([{ userId: user.id, mid: "22", success: false, followerCount: maximum }])
    expect(database.findBilibiliFollowerMonitorById(user.id))
      .toMatchObject({ currentFollowerCount: BigInt(maximum), lastErrorType: "BILIBILI_RISK_CONTROL" })
    expect(database.findBilibiliFollowerSnapshots(user.id, { limit: 30 })).toHaveLength(1)
  })

  it("rejects legacy projections explicitly after successful exact collection without marking platform failure", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    state.count = "100"
    state.following = "1"
    const user = await service.addUser({ mid: "22" })
    state.count = adjacent
    state.fetchedAt = "2026-10-05T00:00:01.000Z"
    await expect(service.refreshNow(user.id)).rejects.toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(database.findBilibiliFollowerMonitorById(user.id))
      .toMatchObject({ currentFollowerCount: BigInt(adjacent), lastErrorType: null, lastSuccessAt: state.fetchedAt })
    expect(() => service.listUsers()).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(() => service.trend(user.id)).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(() => service.trends()).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(() => service.updateStatus(user.id, false)).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(service.updateStatusV2(user.id, true).monitorStatus).toBe("ACTIVE")
    expect(() => service.updateInterval(user.id, 120)).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    await expect(service.addUser({ mid: "22" })).rejects.toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    state.now = "2026-10-05T02:00:00.000Z"
    state.fetchedAt = state.now
    await expect(service.collectDueUsers()).rejects.toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(database.findBilibiliFollowerMonitorById(user.id)?.lastErrorType).toBeNull()
    expect(service.listUsersV2().items[0]?.currentFollowerCount).toBe(adjacent)
    expect(database.listPendingOutbox().some(event => event.topic === "bilibili.follower.collection-failed")).toBe(false)
  })

  it("keeps zero or negative response MID add failures at persistence and rejects unsafe numeric source inputs", async () => {
    fixture = await longFixture()
    const { service, database, state } = fixture
    for (const mid of ["0", "-1", minimum]) {
      state.responseMid = mid
      await expect(service.addUserV2({ mid: "22" })).rejects.toThrow(/positive signed 64-bit/)
    }
    expect(database.listBilibiliFollowerMonitors()).toEqual([])
    expect(database.listPendingOutbox()).toEqual([])
    state.responseMid = "22"
    state.unsafeNumeric = true
    await expect(service.addUserV2({ mid: "22" })).rejects.toThrow(/exact safe integer/)
    expect(database.listBilibiliFollowerMonitors()).toEqual([])
  })

  it("uses the current exact monitor count with history[-2] from a bounded historical query", async () => {
    fixture = await longFixture()
    const { service, state } = fixture
    state.count = "100"
    state.following = "1"
    const user = await service.addUserV2({ mid: "22" })
    state.count = "200"
    state.fetchedAt = "2026-10-05T00:00:01.000Z"
    await service.refreshNowV2(user.id)
    state.count = adjacent
    state.fetchedAt = "2026-10-05T00:00:02.000Z"
    await service.refreshNowV2(user.id)
    expect(service.trendV2(user.id, { to: "2026-10-05T00:00:01.000Z", limit: 20 }))
      .toMatchObject({ user: { currentFollowerCount: adjacent, deltaSincePrevious: "9007199254740893" },
        points: [{ followerCount: "100" }, { followerCount: "200" }] })
  })
})
