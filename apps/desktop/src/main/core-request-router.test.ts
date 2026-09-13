import { randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { createRuntimeEnvelope } from "@bmd/contracts"
import {
  LocalCoreRuntime,
  type BilibiliLiveDanmakuSourceEvent
} from "@bmd/core-runtime"
import { afterEach, describe, expect, it } from "vitest"

import { dispatchBusinessRequest } from "./core-request-router"

describe("dispatchBusinessRequest", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("routes typed account commands and queries to the real local Core", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-router-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T07:00:00.000Z"),
      idFactory: () => `018f0f39-ab5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`
    })

    try {
      const createRequest = createRuntimeEnvelope({
        id: "request-create",
        type: "platform-accounts.create",
        timestamp: "2026-08-23T07:00:00.000Z",
        correlationId: "correlation-create",
        traceId: "trace-create",
        payload: {
          platform: "bilibili",
          externalId: "672328094",
          displayName: "测试账号"
        }
      })
      expect(await dispatchBusinessRequest(runtime, createRequest)).toMatchObject({
        responseType: "platform-accounts.create.result",
        payload: { platform: "bilibili", externalId: "672328094" }
      })

      const listRequest = createRuntimeEnvelope({
        id: "request-list",
        type: "platform-accounts.list",
        timestamp: "2026-08-23T07:00:00.000Z",
        correlationId: "correlation-list",
        traceId: "trace-list",
        payload: {}
      })
      expect(await dispatchBusinessRequest(runtime, listRequest)).toMatchObject({
        responseType: "platform-accounts.list.result",
        payload: { total: 1, items: [{ externalId: "672328094" }] }
      })
    } finally {
      await runtime.stop()
    }
  })

  it("routes the original Bilibili follower add and list workflow", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-router-follower-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.3.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-ab5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`,
      schedulerEnabled: false,
      followerSource: {
        fetchCard: async (request) => ({
          mid: request.mid,
          nickname: "路由测试用户",
          profileUrl: `https://space.bilibili.com/${request.mid}`,
          followerCount: 100,
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "x/web-interface/card" as const,
          evidenceObject: {
            objectId: `sha256:${"a".repeat(64)}`,
            relativePath: "cas/a.json",
            sha256: "a".repeat(64),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      },
      liveSource: {
        fetchStatusByUids: async () => ({
          snapshots: [],
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const,
          evidenceObject: {
            objectId: `sha256:${"b".repeat(64)}`,
            relativePath: "cas/b.json",
            sha256: "b".repeat(64),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRoomInfoOld: async () => ({
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/getRoomInfoOld" as const,
          evidenceObject: {
            objectId: `sha256:${"c".repeat(64)}`,
            relativePath: "cas/c.json",
            sha256: "c".repeat(64),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }),
        fetchRoomInfo: async () => { throw new Error("not used") },
        fetchRoomInit: async () => { throw new Error("not used") }
      }
    })

    try {
      const addRequest = createRuntimeEnvelope({
        id: "follower-add",
        type: "bilibili-followers.add",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "follower-add",
        traceId: "follower-add",
        payload: { mid: "123456", intervalSeconds: 3600 }
      })
      expect(await dispatchBusinessRequest(runtime, addRequest)).toMatchObject({
        responseType: "bilibili-followers.add.result",
        payload: { mid: "123456", nickname: "路由测试用户" }
      })

      const listRequest = createRuntimeEnvelope({
        id: "follower-list",
        type: "bilibili-followers.list",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "follower-list",
        traceId: "follower-list",
        payload: {}
      })
      expect(await dispatchBusinessRequest(runtime, listRequest)).toMatchObject({
        responseType: "bilibili-followers.list.result",
        payload: { total: 1, items: [{ mid: "123456" }] }
      })

      const createSubjectRequest = createRuntimeEnvelope({
        id: "subject-create",
        type: "bilibili-subjects.create",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "subject-create",
        traceId: "subject-create",
        payload: { mid: "123456", danmuEnabled: true }
      })
      const createdSubject = await dispatchBusinessRequest(runtime, createSubjectRequest)
      expect(createdSubject).toMatchObject({
        responseType: "bilibili-subjects.create.result",
        payload: {
          displayName: "路由测试用户",
          bilibiliBinding: { mid: "123456", danmuEnabled: true }
        }
      })
      const subjectId = String((createdSubject.payload as Record<string, unknown>).id)
      const workbenchRequest = createRuntimeEnvelope({
        id: "subject-workbench",
        type: "bilibili-subjects.workbench",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "subject-workbench",
        traceId: "subject-workbench",
        payload: { subjectId }
      })
      expect(await dispatchBusinessRequest(runtime, workbenchRequest)).toMatchObject({
        responseType: "bilibili-subjects.workbench.result",
        payload: {
          bilibiliUser: { mid: "123456", followerCount: 100 },
          summary: { enabledModuleCount: 3, totalModuleCount: 4 },
          danmu: { status: "missing_live_room" }
        }
      })
    } finally {
      await runtime.stop()
    }
  })

  it("routes the original Bilibili QR login, status and revoke workflow", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-router-auth-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.4.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-cb5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
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
    })

    try {
      const startRequest = createRuntimeEnvelope({
        id: "auth-start",
        type: "bilibili-auth.qr.start",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "auth-start",
        traceId: "auth-start",
        payload: {}
      })
      const started = await dispatchBusinessRequest(runtime, startRequest)
      expect(started).toMatchObject({
        responseType: "bilibili-auth.qr.start.result",
        payload: { pollIntervalMillis: 1_500 }
      })
      const loginId = String((started.payload as Record<string, unknown>).loginId)

      const pollRequest = createRuntimeEnvelope({
        id: "auth-poll",
        type: "bilibili-auth.qr.poll",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "auth-poll",
        traceId: "auth-poll",
        payload: { loginId }
      })
      expect(await dispatchBusinessRequest(runtime, pollRequest)).toMatchObject({
        responseType: "bilibili-auth.qr.poll.result",
        payload: { status: "SUCCESS", account: { mid: "99" } }
      })

      const statusRequest = createRuntimeEnvelope({
        id: "auth-status",
        type: "bilibili-auth.status",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "auth-status",
        traceId: "auth-status",
        payload: {}
      })
      expect(await dispatchBusinessRequest(runtime, statusRequest)).toMatchObject({
        responseType: "bilibili-auth.status.result",
        payload: { loggedIn: true, status: "ACTIVE" }
      })

      const revokeRequest = createRuntimeEnvelope({
        id: "auth-revoke",
        type: "bilibili-auth.revoke",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "auth-revoke",
        traceId: "auth-revoke",
        payload: {}
      })
      expect(await dispatchBusinessRequest(runtime, revokeRequest)).toEqual({
        responseType: "bilibili-auth.revoke.result",
        payload: { revoked: true }
      })
    } finally {
      await runtime.stop()
    }
  })

  it("routes the original Bilibili live room workflow", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-router-live-"))
    directory = testDirectory
    let sequence = 0
    const evidence = {
      objectId: `sha256:${"d".repeat(64)}`,
      relativePath: "cas/live.json",
      sha256: "d".repeat(64),
      sizeBytes: 100,
      mediaType: "application/json"
    }
    let emitDanmaku: ((event: BilibiliLiveDanmakuSourceEvent) => void) | undefined
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.5.0",
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: () => `018f0f39-db5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
      schedulerEnabled: false,
      liveSource: {
        fetchStatusByUids: async () => ({
          snapshots: [{ uid: "22", roomId: "33", uname: "anchor", liveStatus: 1 }],
          fetchedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const,
          evidenceObject: evidence,
          statusCode: 200,
          durationMs: 10
        }),
        fetchRoomInfo: async () => ({
          uid: "22", roomId: "33", uname: "anchor", title: "直播标题", liveStatus: 1,
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
          entries: [],
          evidenceObject: evidence,
          statusCode: 200,
          durationMs: 10
        })
      },
      liveDanmakuSource: {
        start: async (_input, onEvent) => {
          emitDanmaku = onEvent
          return {
            connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
            protocolVersion: 3,
            authMode: "ANONYMOUS" as const
          }
        },
        stop: async () => undefined,
        stopAll: async () => undefined
      }
    })

    try {
      const addRequest = createRuntimeEnvelope({
        id: "live-add",
        type: "bilibili-live.rooms.add",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "live-add",
        traceId: "live-add",
        payload: { uid: "22", intervalSeconds: 300 }
      })
      expect(await dispatchBusinessRequest(runtime, addRequest)).toMatchObject({
        responseType: "bilibili-live.rooms.add.result",
        payload: { uid: "22", roomId: "33", title: "直播标题" }
      })

      const summaryRequest = createRuntimeEnvelope({
        id: "live-summary",
        type: "bilibili-live.summary",
        timestamp: "2026-08-29T12:00:00.000Z",
        correlationId: "live-summary",
        traceId: "live-summary",
        payload: {}
      })
      expect(await dispatchBusinessRequest(runtime, summaryRequest)).toMatchObject({
        responseType: "bilibili-live.summary.result",
        payload: { totalRooms: 1, liveRooms: 1 }
      })

      const roomMonitorId = String((runtime.listBilibiliLiveRooms().items[0]?.id))
      const rankRequest = createRuntimeEnvelope({
        id: "live-rank-refresh",
        type: "bilibili-live.ranks.refresh",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-rank-refresh",
        traceId: "live-rank-refresh",
        payload: { roomMonitorId, types: ["contribution_rank"] }
      })
      expect(await dispatchBusinessRequest(runtime, rankRequest)).toMatchObject({
        responseType: "bilibili-live.ranks.refresh.result",
        payload: { successCount: 1, summary: { audienceCount: 1 } }
      })

      const danmakuStartRequest = createRuntimeEnvelope({
        id: "live-danmaku-start",
        type: "bilibili-live.danmaku.start",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-danmaku-start",
        traceId: "live-danmaku-start",
        payload: { roomMonitorId, protocolVersion: 3 }
      })
      expect(await dispatchBusinessRequest(runtime, danmakuStartRequest)).toMatchObject({
        responseType: "bilibili-live.danmaku.start.result",
        payload: { running: true, status: "CONNECTED", roomId: "33", protocolVersion: 3 }
      })
      emitDanmaku?.({
        type: "command",
        receivedAt: "2026-08-29T12:00:00.000Z",
        event: {
          command: "DANMU_MSG",
          kind: "DANMAKU",
          occurredAt: "2026-08-29T12:00:00.000Z",
          receivedAt: "2026-08-29T12:00:00.000Z",
          actor: { uid: "99", displayName: "Alice", medalName: "测试牌" },
          messageText: "真实持久化弹幕",
          giftDelta: 0,
          superChatDelta: 0,
          rawJson: "{}"
        }
      })
      const danmakuRecentRequest = createRuntimeEnvelope({
        id: "live-danmaku-recent",
        type: "bilibili-live.danmaku.recent",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-danmaku-recent",
        traceId: "live-danmaku-recent",
        payload: { roomMonitorId, limit: 30 }
      })
      expect(await dispatchBusinessRequest(runtime, danmakuRecentRequest)).toMatchObject({
        responseType: "bilibili-live.danmaku.recent.result",
        payload: [{ senderUid: "99", displayName: "Alice", messageText: "真实持久化弹幕" }]
      })
      const danmakuMetricsRequest = createRuntimeEnvelope({
        id: "live-danmaku-metrics",
        type: "bilibili-live.danmaku.metrics",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-danmaku-metrics",
        traceId: "live-danmaku-metrics",
        payload: { roomMonitorId, range: "1h" }
      })
      expect(await dispatchBusinessRequest(runtime, danmakuMetricsRequest)).toMatchObject({
        responseType: "bilibili-live.danmaku.metrics.result",
        payload: [{ danmuCount: 1, rawEventCount: 1 }]
      })
      const sessionsRequest = createRuntimeEnvelope({
        id: "live-sessions",
        type: "bilibili-live.sessions",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-sessions",
        traceId: "live-sessions",
        payload: { roomMonitorId, limit: 200 }
      })
      const sessions = await dispatchBusinessRequest(runtime, sessionsRequest)
      expect(sessions).toMatchObject({
        responseType: "bilibili-live.sessions.result",
        payload: [{ state: "OPEN", danmakuCount: 1, interactingUserCount: 1 }]
      })
      const liveSessionId = String((sessions.payload as Array<Record<string, unknown>>)[0]?.id)
      const sessionEventsRequest = createRuntimeEnvelope({
        id: "live-session-events",
        type: "bilibili-live.session.events",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-session-events",
        traceId: "live-session-events",
        payload: { sessionId: liveSessionId, kind: "DANMAKU", page: 1, size: 50 }
      })
      expect(await dispatchBusinessRequest(runtime, sessionEventsRequest)).toMatchObject({
        responseType: "bilibili-live.session.events.result",
        payload: { total: 1, items: [{ senderUid: "99", messageText: "真实持久化弹幕" }] }
      })
      const insightRequest = createRuntimeEnvelope({
        id: "live-session-insight",
        type: "bilibili-live.session.insight",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-session-insight",
        traceId: "live-session-insight",
        payload: { sessionId: liveSessionId, bucketSeconds: 300 }
      })
      expect(await dispatchBusinessRequest(runtime, insightRequest)).toMatchObject({
        responseType: "bilibili-live.session.insight.result",
        payload: { quality: { supportedEventCount: 1 } }
      })
      const exportRequest = createRuntimeEnvelope({
        id: "live-session-export",
        type: "bilibili-live.session.export",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-session-export",
        traceId: "live-session-export",
        payload: { sessionId: liveSessionId, category: "danmaku" }
      })
      const preparedExport = await dispatchBusinessRequest(runtime, exportRequest)
      expect(preparedExport).toMatchObject({
        responseType: "bilibili-live.session.export.result",
        payload: { category: "danmaku", schemaVersion: "2" }
      })
      const temporaryPath = String(
        (preparedExport.payload as Record<string, unknown>).temporaryPath
      )
      expect((await readFile(temporaryPath)).subarray(0, 3)).toEqual(
        Buffer.from([0xef, 0xbb, 0xbf])
      )
      const danmakuStopRequest = createRuntimeEnvelope({
        id: "live-danmaku-stop",
        type: "bilibili-live.danmaku.stop",
        timestamp: "2026-08-29T12:01:00.000Z",
        correlationId: "live-danmaku-stop",
        traceId: "live-danmaku-stop",
        payload: { roomMonitorId }
      })
      expect(await dispatchBusinessRequest(runtime, danmakuStopRequest)).toMatchObject({
        responseType: "bilibili-live.danmaku.stop.result",
        payload: { running: false, status: "STOPPED" }
      })
    } finally {
      await runtime.stop()
    }
  })
})
