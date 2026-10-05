import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import * as coreRuntime from "./index"

describe("BilibiliFollowerMonitorService", () => {
  let directory: string | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("fetches the real Bilibili card before creating the monitor and first snapshot", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-service-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    let elapsed = 0
    vi.spyOn(performance, "now").mockImplementation(() => elapsed)
    try {
      const exported = coreRuntime as unknown as Record<string, unknown>
      expect(typeof exported.BilibiliFollowerMonitorService).toBe("function")
      const Service = exported.BilibiliFollowerMonitorService as new (options: Record<string, unknown>) => {
        addUser: (input: { mid: string; intervalSeconds?: number }) => Promise<Record<string, unknown>>
        listUsers: () => Record<string, unknown>
      }
      const ids = [
      "018f0f39-7b5e-7cc1-962d-9a208b3d0300",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0301",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0302",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0303",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0304"
    ]
      const calls: string[] = []
      const service = new Service({
      database,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => ids.shift() ?? "018f0f39-7b5e-7cc1-962d-9a208b3d0399",
      sleep: async () => undefined,
      requestMinIntervalMs: 0,
      source: {
        fetchCard: async (request: { mid: string }) => {
          calls.push(`card:${request.mid}`)
          elapsed += 40
          return {
            mid: "2",
            nickname: "碧诗",
            avatarUrl: "https://i2.hdslb.com/bfs/face/example.jpg",
            profileUrl: "https://space.bilibili.com/2",
            followerCount: 1_395_836,
            followingCount: 423,
            fetchedAt: "2026-08-29T12:00:00.123Z",
            sourceEndpoint: "x/web-interface/card",
            evidenceObject: {
              objectId: `sha256:${"a".repeat(64)}`,
              relativePath: `cas/sha256/aa/${"a".repeat(64)}.json`,
              sha256: "a".repeat(64),
              sizeBytes: 284,
              mediaType: "application/json"
            },
            statusCode: 200,
            durationMs: 28
          }
        },
        fetchRelationStat: async () => { throw new Error("not used") }
      }
      })

      expect(await service.addUser({ mid: "2", intervalSeconds: 3600 })).toMatchObject({
        id: "018f0f39-7b5e-7cc1-962d-9a208b3d0300",
        mid: "2",
        nickname: "碧诗",
        currentFollowerCount: 1_395_836,
        followingCount: 423,
        monitorStatus: "ACTIVE",
        intervalSeconds: 3600,
        lastSnapshotAt: "2026-08-29T12:00:00.123Z",
        nextCollectAt: "2026-08-29T13:00:00.123Z",
        recentTrend: [{ followerCount: 1_395_836 }]
      })
      expect(calls).toEqual(["card:2"])
      expect(service.listUsers()).toMatchObject({
        total: 1,
        items: [{ mid: "2", nickname: "碧诗" }]
      })
      expect(database.listBilibiliApiCalls("018f0f39-7b5e-7cc1-962d-9a208b3d0301")).toMatchObject([{
        attempt: 1,
        endpointKey: "x/web-interface/card",
        mid: "2",
        statusCode: 200,
        durationMs: 40,
        errorType: null,
        retryable: false,
        evidenceObjectId: `sha256:${"a".repeat(64)}`
      }])
    } finally {
      database.close()
    }
  })

  it("matches the original status, interval, refresh, trend and cascade-delete workflow", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-actions-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    let now = new Date("2026-08-29T12:00:00.000Z")
    let fetchedAt = "2026-08-29T12:00:00.000Z"
    let followerCount = 100
    let sequence = 0
    const service = new BilibiliFollowerMonitorService({
      database,
      now: () => now,
      idFactory: () => `018f0f39-7b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      sleep: async () => undefined,
      requestMinIntervalMs: 0,
      source: {
        fetchCard: async (request) => ({
          mid: request.mid,
          nickname: "测试用户",
          profileUrl: `https://space.bilibili.com/${request.mid}`,
          followerCount,
          followingCount: 10,
          fetchedAt,
          sourceEndpoint: "x/web-interface/card",
          evidenceObject: {
            objectId: `sha256:${String(followerCount).padStart(64, "0")}`,
            relativePath: `cas/${followerCount}.json`,
            sha256: String(followerCount).padStart(64, "0"),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })

    try {
      const created = await service.addUser({ mid: "123456", intervalSeconds: 120 })
      const userId = created.id
      expect(service.updateStatus(userId, false)).toMatchObject({
        monitorStatus: "PAUSED",
        nextCollectAt: "2026-08-29T12:02:00.000Z"
      })

      now = new Date("2026-08-29T12:03:00.000Z")
      expect(service.updateStatus(userId, true)).toMatchObject({
        monitorStatus: "ACTIVE",
        nextCollectAt: "2026-08-29T12:03:00.000Z"
      })
      expect(service.updateInterval(userId, 3600)).toMatchObject({
        intervalSeconds: 3600,
        nextCollectAt: "2026-08-29T13:03:00.000Z"
      })

      followerCount = 130
      fetchedAt = "2026-08-29T12:04:00.000Z"
      expect(await service.refreshNow(userId)).toMatchObject({
        userId,
        mid: "123456",
        success: true,
        followerCount: 130,
        sourceEndpoint: "x/web-interface/card",
        message: "ok"
      })
      expect(service.trend(userId, { limit: 500 })).toMatchObject({
        user: {
          currentFollowerCount: 130,
          deltaSincePrevious: 30,
          growthRateSincePrevious: 0.3
        },
        points: [{ followerCount: 100 }, { followerCount: 130 }]
      })
      expect(service.trends({ userIds: [userId], limitPerUser: 500 })).toHaveLength(1)

      service.deleteUser(userId)
      expect(service.listUsers()).toMatchObject({ total: 0, items: [] })
    } finally {
      database.close()
    }
  })

  it("retries retryable card failures and falls back to relation-stat only for the original eligible errors", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-fallback-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    let sequence = 0
    let cardCalls = 0
    let mode: "create" | "fallback" = "create"
    const evidence = (character: string) => ({
      objectId: `sha256:${character.repeat(64)}`,
      relativePath: `cas/${character}.json`,
      sha256: character.repeat(64),
      sizeBytes: 100,
      mediaType: "application/json"
    })
    const service = new BilibiliFollowerMonitorService({
      database,
      now: () => new Date("2026-08-29T12:10:00.000Z"),
      idFactory: () => `018f0f39-7b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      sleep: async () => undefined,
      requestMinIntervalMs: 0,
      maxAttempts: 3,
      retryBackoffMs: 0,
      source: {
        fetchCard: async (request) => {
          cardCalls += 1
          if (mode === "fallback") {
            throw Object.assign(new Error("card response changed"), {
              code: "BILIBILI_PARSE_ERROR",
              retryable: false,
              endpoint: "x/web-interface/card",
              durationMs: 10
            })
          }
          if (cardCalls < 3) {
            throw Object.assign(new Error("temporary network failure"), {
              code: "BILIBILI_NETWORK_ERROR",
              retryable: true,
              endpoint: "x/web-interface/card",
              durationMs: 10
            })
          }
          return {
            mid: request.mid,
            nickname: "保留资料的用户",
            avatarUrl: "https://i2.hdslb.com/avatar.jpg",
            profileUrl: `https://space.bilibili.com/${request.mid}`,
            followerCount: 100,
            followingCount: 10,
            fetchedAt: "2026-08-29T12:00:00.000Z",
            sourceEndpoint: "x/web-interface/card",
            evidenceObject: evidence("c"),
            statusCode: 200,
            durationMs: 10
          }
        },
        fetchRelationStat: async (request) => ({
          mid: request.mid,
          profileUrl: `https://space.bilibili.com/${request.mid}`,
          followerCount: 120,
          followingCount: 11,
          fetchedAt: "2026-08-29T12:10:00.000Z",
          sourceEndpoint: "x/relation/stat",
          evidenceObject: evidence("d"),
          statusCode: 200,
          durationMs: 8
        })
      }
    })

    try {
      const user = await service.addUser({ mid: "123456", intervalSeconds: 3600 })
      expect(cardCalls).toBe(3)
      mode = "fallback"

      expect(await service.refreshNow(user.id)).toMatchObject({
        success: true,
        followerCount: 120,
        sourceEndpoint: "x/relation/stat"
      })
      expect(service.listUsers().items[0]).toMatchObject({
        nickname: "保留资料的用户",
        avatarUrl: "https://i2.hdslb.com/avatar.jpg",
        currentFollowerCount: 120,
        sourceEndpoint: "x/relation/stat"
      })
    } finally {
      database.close()
    }
  })

  it("records risk-control failure and applies the original backoff without unsafe fallback", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-failure-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    let sequence = 0
    let fail = false
    let relationCalls = 0
    const service = new BilibiliFollowerMonitorService({
      database,
      now: () => new Date("2026-08-29T12:10:00.000Z"),
      idFactory: () => `018f0f39-7b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      sleep: async () => undefined,
      requestMinIntervalMs: 0,
      source: {
        fetchCard: async (request) => {
          if (fail) {
            throw Object.assign(new Error("B站触发风控"), {
              code: "BILIBILI_RISK_CONTROL",
              retryable: false,
              endpoint: "x/web-interface/card"
            })
          }
          return {
            mid: request.mid,
            nickname: "风控测试用户",
            profileUrl: `https://space.bilibili.com/${request.mid}`,
            followerCount: 100,
            fetchedAt: "2026-08-29T12:00:00.000Z",
            sourceEndpoint: "x/web-interface/card",
            evidenceObject: {
              objectId: `sha256:${"e".repeat(64)}`,
              relativePath: "cas/e.json",
              sha256: "e".repeat(64),
              sizeBytes: 100,
              mediaType: "application/json"
            },
            statusCode: 200,
            durationMs: 10
          }
        },
        fetchRelationStat: async () => {
          relationCalls += 1
          throw new Error("must not fall back for risk control")
        }
      }
    })

    try {
      const user = await service.addUser({ mid: "123456", intervalSeconds: 120 })
      fail = true

      await expect(service.refreshNow(user.id)).rejects.toMatchObject({
        code: "BILIBILI_RISK_CONTROL",
        retryable: false
      })
      expect(relationCalls).toBe(0)
      expect(service.listUsers().items[0]).toMatchObject({
        lastErrorType: "BILIBILI_RISK_CONTROL",
        lastErrorMessage: "B站触发风控",
        lastErrorAt: "2026-08-29T12:10:00.000Z",
        nextCollectAt: "2026-08-29T12:15:00.000Z"
      })
    } finally {
      database.close()
    }
  })

  it("collects only active due users in the same bounded batches as the original scheduler", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-due-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    let sequence = 0
    let now = new Date("2026-08-29T12:00:00.000Z")
    let followerCount = 100
    const service = new BilibiliFollowerMonitorService({
      database,
      now: () => now,
      idFactory: () => `018f0f39-7b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      sleep: async () => undefined,
      requestMinIntervalMs: 0,
      dueBatchSize: 10,
      source: {
        fetchCard: async (request) => ({
          mid: request.mid,
          nickname: "定时采集用户",
          profileUrl: `https://space.bilibili.com/${request.mid}`,
          followerCount,
          fetchedAt: now.toISOString(),
          sourceEndpoint: "x/web-interface/card",
          evidenceObject: {
            objectId: `sha256:${String(followerCount).padStart(64, "0")}`,
            relativePath: `cas/${followerCount}.json`,
            sha256: String(followerCount).padStart(64, "0"),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })

    try {
      const user = await service.addUser({ mid: "123456", intervalSeconds: 1 })
      now = new Date("2026-08-29T12:00:02.000Z")
      followerCount = 101
      expect(await service.collectDueUsers()).toMatchObject([{
        userId: user.id,
        success: true,
        followerCount: 101
      }])

      service.updateStatus(user.id, false)
      now = new Date("2026-08-29T13:00:00.000Z")
      expect(await service.collectDueUsers()).toEqual([])
    } finally {
      database.close()
    }
  })
})
