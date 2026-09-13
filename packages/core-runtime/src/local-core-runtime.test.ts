import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { LocalCoreRuntime } from "./local-core-runtime"

describe("LocalCoreRuntime", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("bootstraps a ready local Core without opening a business server", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-"))
    directory = testDirectory
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T00:00:00.000Z")
    })

    expect(runtime.bootstrap()).toEqual({
      coreStatus: {
        state: "ready",
        version: "0.2.0",
        dataDirectory: testDirectory,
        databaseReady: true,
        schemaVersion: 13,
        startedAt: "2026-08-23T00:00:00.000Z"
      },
      workers: [],
      sequence: 1
    })

    await runtime.stop()
  })

  it("creates and lists platform accounts and bound subjects through the application service", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-business-"))
    directory = testDirectory
    const ids = [
      "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0185",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0186",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0187"
    ]
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T05:00:00.000Z"),
      idFactory: () => ids.shift() ?? "018f0f39-9b5e-7cc1-962d-9a208b3d0184"
    })
    const businessRuntime = runtime as unknown as {
      createPlatformAccount: (input: Record<string, unknown>) => Record<string, unknown>
      listPlatformAccounts: (input?: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
      createSubject: (input: Record<string, unknown>) => Record<string, unknown>
      listSubjects: (input?: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
    }

    try {
      expect(typeof businessRuntime.createPlatformAccount).toBe("function")
      expect(typeof businessRuntime.createSubject).toBe("function")

      const account = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神"
      })
      expect(account).toMatchObject({
        id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神",
        authState: "not_connected",
        version: 1
      })
      expect(businessRuntime.listPlatformAccounts()).toMatchObject({
        total: 1,
        items: [{ id: account.id, externalId: "3494364227449238" }]
      })
      expect(() => businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "重复账号"
      })).toThrowError(/PLATFORM_ACCOUNT_CONFLICT/)

      const subject = businessRuntime.createSubject({
        name: "原神官方账号",
        tags: ["游戏", "官方"],
        accountId: account.id,
        followerIntervalSeconds: 3600
      })
      expect(subject).toMatchObject({
        id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
        name: "原神官方账号",
        status: "active",
        accounts: [{ id: account.id }],
        monitorPolicies: [{
          capability: "follower.snapshot",
          state: "active",
          intervalSeconds: 3600
        }]
      })
      expect(businessRuntime.listSubjects()).toMatchObject({
        total: 1,
        items: [{ id: subject.id, name: "原神官方账号" }]
      })
    } finally {
      await runtime.stop()
    }
  })

  it("keeps an independent follower policy for every account binding", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-binding-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T06:00:00.000Z"),
      idFactory: () => `018f0f39-9b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`
    })
    const businessRuntime = runtime as unknown as {
      createPlatformAccount: (input: Record<string, unknown>) => Record<string, unknown>
      createSubject: (input: Record<string, unknown>) => Record<string, unknown>
      bindSubjectAccount: (input: Record<string, unknown>) => Record<string, unknown>
    }

    try {
      const firstAccount = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "672328094",
        displayName: "测试账号 A"
      })
      const secondAccount = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "672328095",
        displayName: "测试账号 B"
      })
      const subject = businessRuntime.createSubject({
        name: "多账号对象",
        tags: [],
        accountId: firstAccount.id,
        followerIntervalSeconds: 3600
      })

      expect(typeof businessRuntime.bindSubjectAccount).toBe("function")
      expect(businessRuntime.bindSubjectAccount({
        subjectId: subject.id,
        accountId: secondAccount.id,
        followerIntervalSeconds: 7200
      })).toMatchObject({
        id: subject.id,
        accounts: [{ id: firstAccount.id }, { id: secondAccount.id }],
        monitorPolicies: [
          { accountId: firstAccount.id, capability: "follower.snapshot", intervalSeconds: 3600 },
          { accountId: secondAccount.id, capability: "follower.snapshot", intervalSeconds: 7200 }
        ]
      })
    } finally {
      await runtime.stop()
    }
  })

  it("exposes the original Bilibili follower monitor workflow through the local Core", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-follower-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.3.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-ab5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      schedulerEnabled: false,
      followerSource: {
        fetchCard: async (request: { mid: string }) => ({
          mid: request.mid,
          nickname: "本地 Core 测试用户",
          profileUrl: `https://space.bilibili.com/${request.mid}`,
          followerCount: 100,
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "x/web-interface/card" as const,
          evidenceObject: {
            objectId: `sha256:${"f".repeat(64)}`,
            relativePath: "cas/f.json",
            sha256: "f".repeat(64),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    }) as LocalCoreRuntime & {
      addBilibiliFollowerMonitor: (input: { mid: string }) => Promise<Record<string, unknown>>
      listBilibiliFollowerMonitors: () => Record<string, unknown>
    }

    try {
      expect(typeof runtime.addBilibiliFollowerMonitor).toBe("function")
      expect(await runtime.addBilibiliFollowerMonitor({ mid: "123456" })).toMatchObject({
        mid: "123456",
        nickname: "本地 Core 测试用户",
        currentFollowerCount: 100
      })
      expect(runtime.listBilibiliFollowerMonitors()).toMatchObject({
        total: 1,
        items: [{ mid: "123456" }]
      })
    } finally {
      await runtime.stop()
    }
  })

  it("exposes the original Bilibili QR login lifecycle through the local Core", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-auth-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.4.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-bb5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
      schedulerEnabled: false,
      credentialKey: randomBytes(32),
      authSource: {
        generate: async () => ({
          qrUrl: "https://passport.bilibili.com/scan?qrcode_key=key",
          qrcodeKey: "key",
          cookies: []
        }),
        poll: async () => ({
          code: 0,
          message: "ok",
          refreshToken: "refresh",
          cookies: [
            { name: "SESSDATA", value: "session" },
            { name: "bili_jct", value: "csrf" },
            { name: "DedeUserID", value: "99" }
          ]
        }),
        validate: async () => ({
          account: { mid: "99", uname: "Alice" },
          rawPayload: { code: 0 }
        })
      }
    }) as LocalCoreRuntime & {
      startBilibiliQrLogin: () => Promise<Record<string, unknown>>
      pollBilibiliQrLogin: (loginId: string) => Promise<Record<string, unknown>>
      getBilibiliAuthStatus: () => Promise<Record<string, unknown>>
    }

    try {
      expect(typeof runtime.startBilibiliQrLogin).toBe("function")
      const start = await runtime.startBilibiliQrLogin()
      expect(start).toMatchObject({ pollIntervalMillis: 1_500 })
      expect(await runtime.pollBilibiliQrLogin(String(start.loginId))).toMatchObject({
        status: "SUCCESS",
        account: { mid: "99", uname: "Alice" }
      })
      expect(await runtime.getBilibiliAuthStatus()).toMatchObject({
        loggedIn: true,
        status: "ACTIVE"
      })
    } finally {
      await runtime.stop()
    }
  })

  it("exposes the original Bilibili live room monitor through the local Core", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-live-"))
    directory = testDirectory
    let sequence = 0
    const evidence = {
      objectId: `sha256:${"a".repeat(64)}`,
      relativePath: "cas/live.json",
      sha256: "a".repeat(64),
      sizeBytes: 100,
      mediaType: "application/json"
    }
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.5.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-cb5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
      schedulerEnabled: false,
      liveSource: {
        fetchStatusByUids: async () => ({
          snapshots: [{
            uid: "22",
            roomId: "33",
            uname: "anchor",
            liveStatus: 1,
            onlineCount: 100
          }],
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const,
          evidenceObject: evidence,
          statusCode: 200,
          durationMs: 10
        }),
        fetchRoomInfo: async () => ({
          uid: "22",
          roomId: "33",
          uname: "anchor",
          title: "直播标题",
          liveStatus: 1,
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_info" as const,
          evidenceObject: evidence,
          statusCode: 200,
          durationMs: 10
        }),
        fetchRoomInit: async () => { throw new Error("not used") },
        fetchRoomInfoOld: async () => { throw new Error("not used") }
      },
      liveRankSource: {
        fetch: async (request) => ({
          rankFamily: request.family,
          rankType: request.type,
          ...(request.rankSwitch ? { rankSwitch: request.rankSwitch } : {}),
          ...(request.periodScope ? { periodScope: request.periodScope } : {}),
          pageNo: request.page,
          pageSize: request.pageSize,
          totalCount: 1,
          sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank" as const,
          signedRequired: true,
          capturedAt: "2026-08-29T12:01:00.000Z",
          entries: [{ userUid: "99", rankNo: 1, entryKind: "LIST", displayName: "Alice" }],
          evidenceObject: evidence,
          statusCode: 200,
          durationMs: 10
        })
      }
    }) as LocalCoreRuntime & {
      addBilibiliLiveRoom: (input: { uid: string }) => Promise<Record<string, unknown>>
      listBilibiliLiveRooms: () => Record<string, unknown>
      getBilibiliLiveSummary: () => Record<string, unknown>
      refreshBilibiliLiveRanks: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      getBilibiliLiveRankSummary: (roomMonitorId: string) => Record<string, unknown>
    }

    try {
      expect(typeof runtime.addBilibiliLiveRoom).toBe("function")
      expect(await runtime.addBilibiliLiveRoom({ uid: "22" })).toMatchObject({
        uid: "22",
        roomId: "33",
        title: "直播标题",
        liveStatus: 1,
        onlineCount: 100
      })
      expect(runtime.listBilibiliLiveRooms()).toMatchObject({ total: 1 })
      expect(runtime.getBilibiliLiveSummary()).toMatchObject({ liveRooms: 1 })
      expect(await runtime.refreshBilibiliLiveRanks({
        roomMonitorId: String((runtime.listBilibiliLiveRooms() as { items: Array<{ id: string }> }).items[0]?.id),
        types: ["contribution_rank"]
      })).toMatchObject({ successCount: 1 })
      expect(runtime.getBilibiliLiveRankSummary(
        String((runtime.listBilibiliLiveRooms() as { items: Array<{ id: string }> }).items[0]?.id)
      )).toMatchObject({ audienceCount: 1 })
    } finally {
      await runtime.stop()
    }
  })
})
