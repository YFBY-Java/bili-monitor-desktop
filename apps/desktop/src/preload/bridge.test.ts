import { describe, expect, it, vi } from "vitest"

import { createDesktopBridge } from "./bridge"

describe("createDesktopBridge", () => {
  it("keeps complete follower lists and normalizes history counts at the IPC boundary", async () => {
    const invoke = vi.fn(async (channel: string) => channel === "bilibili-followers:list"
      ? { items: [], total: 0, snapshotAt: "2026-09-13T04:00:00.000Z" } : [])
    const bridge = createDesktopBridge(invoke)
    await bridge.bilibiliFollowers.list()
    await bridge.bilibiliFollowers.trends({ limitPerUser: 0, from: "2026-09-13T12:00:00+08:00" })
    await bridge.bilibiliFollowers.trends({ limitPerUser: 2001 })
    expect(invoke.mock.calls).toEqual([
      ["bilibili-followers:list", {}],
      ["bilibili-followers:trends", { userIds: [], limitPerUser: 500, from: "2026-09-13T12:00:00+08:00" }],
      ["bilibili-followers:trends", { userIds: [], limitPerUser: 2000 }]
    ])
  })

  it("normalizes recent-session limits before sending the narrow IPC request", async () => {
    const invoke = vi.fn(async () => [])
    const bridge = createDesktopBridge(invoke)
    const roomMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0801"
    for (const limit of [undefined, 0, 200, 201]) {
      expect(await bridge.bilibiliLive.sessions({ roomMonitorId, ...(limit === undefined ? {} : { limit }) })).toEqual([])
    }
    expect(invoke.mock.calls).toEqual([20, 20, 200, 200].map(limit => ["bilibili-live:sessions", { roomMonitorId, limit }]))
  })

  it("exposes only typed account, subject and platform collection channels", async () => {
    const timestamp = "2026-08-23T07:00:00.000Z"
    const account = {
      id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      platform: "bilibili" as const,
      externalId: "672328094",
      displayName: "测试账号",
      authState: "not_connected" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    }
    const subject = {
      id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      name: "测试对象",
      status: "active" as const,
      tags: [],
      accounts: [account],
      monitorPolicies: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    }
    const adapters = [{
      platformCode: "bilibili",
      capabilities: ["ACCOUNT_PROFILE"],
      implementedDataTypes: ["account"]
    }]
    const unsupported = {
      status: "MANUAL_REVIEW", platformCode: "bilibili", dataType: "contents",
      fetchResult: {
        success: false, data: null, rawPayload: null, rawPayloadObject: null, nextCursor: null,
        rateLimitInfo: { limited: false, remaining: null, resetAt: null, policyKey: "unsupported" },
        errorType: "UNSUPPORTED", retryable: false, riskLevel: "LOW", message: "Not implemented in the original adapter"
      }
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "platform-collection:adapters-list") return adapters
      if (channel === "platform-collection:run-once") return unsupported
      if (channel === "platform-accounts:list") return { items: [account], total: 1, snapshotAt: timestamp }
      if (channel === "platform-accounts:create") return account
      if (channel === "subjects:list") return { items: [subject], total: 1, snapshotAt: timestamp }
      return subject
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.platformAccounts.list({ platform: "bilibili", limit: 20 })
    await bridge.platformAccounts.create({
      platform: "bilibili",
      externalId: "672328094",
      displayName: "测试账号"
    })
    await bridge.subjects.list({ status: "active", limit: 20 })
    await bridge.subjects.create({ name: "测试对象", tags: [] })
    await bridge.subjects.bindAccount({
      subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      followerIntervalSeconds: 3600
    })
    expect(bridge).toHaveProperty("platformCollection")
    expect(await bridge.platformCollection.listAdapters()).toEqual(adapters)
    expect(await bridge.platformCollection.runOnce({ platformCode: "bilibili", dataType: "contents", externalId: "2" })).toEqual(unsupported)
    await expect(bridge.platformCollection.runOnce({ platformCode: "", dataType: "account", externalId: "2" })).rejects.toThrow()

    expect(invoke.mock.calls).toEqual([
      ["platform-accounts:list", { platform: "bilibili", limit: 20 }],
      ["platform-accounts:create", {
        platform: "bilibili",
        externalId: "672328094",
        displayName: "测试账号"
      }],
      ["subjects:list", { status: "active", limit: 20 }],
      ["subjects:create", { name: "测试对象", tags: [] }],
      ["subjects:bind-account", {
        subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
        accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        followerIntervalSeconds: 3600
      }],
      ["platform-collection:adapters-list"],
      ["platform-collection:run-once", { platformCode: "bilibili", dataType: "contents", externalId: "2" }]
    ])
  })

  it("exposes the complete original Bilibili follower monitor command surface", async () => {
    const timestamp = "2026-08-29T12:00:00.000Z"
    const userId = "018f0f39-7b5e-7cc1-962d-9a208b3d0500"
    const user = {
      id: userId,
      mid: "2",
      nickname: "碧诗",
      profileUrl: "https://space.bilibili.com/2",
      currentFollowerCount: 100,
      monitorStatus: "ACTIVE" as const,
      intervalSeconds: 3600,
      lastSnapshotAt: timestamp,
      lastSuccessAt: timestamp,
      nextCollectAt: "2026-08-29T13:00:00.000Z",
      sourceEndpoint: "x/web-interface/card",
      recentTrend: [{
        capturedAt: timestamp,
        followerCount: 100,
        sourceEndpoint: "x/web-interface/card"
      }],
      version: 1
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "bilibili-followers:list") return { items: [user], total: 1, snapshotAt: timestamp }
      if (channel === "bilibili-followers:refresh") return {
        userId,
        mid: "2",
        success: true,
        followerCount: 100,
        capturedAt: timestamp,
        sourceEndpoint: "x/web-interface/card",
        message: "ok"
      }
      if (channel === "bilibili-followers:trend") return { user, points: user.recentTrend }
      if (channel === "bilibili-followers:trends") return [{ user, points: user.recentTrend }]
      if (channel === "bilibili-followers:delete") return { deleted: true }
      return user
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.bilibiliFollowers.list({ limit: 100 })
    await bridge.bilibiliFollowers.add({ mid: "2", intervalSeconds: 3600 })
    await bridge.bilibiliFollowers.updateStatus({ userId, enabled: false })
    await bridge.bilibiliFollowers.updateSettings({ userId, intervalSeconds: 120 })
    await bridge.bilibiliFollowers.refresh({ userId })
    await bridge.bilibiliFollowers.trend({ userId, limit: 500 })
    await bridge.bilibiliFollowers.trends({ userIds: [userId], limitPerUser: 500 })
    await bridge.bilibiliFollowers.remove({ userId })

    expect(invoke.mock.calls).toEqual([
      ["bilibili-followers:list", { limit: 100 }],
      ["bilibili-followers:add", { mid: "2", intervalSeconds: 3600 }],
      ["bilibili-followers:update-status", { userId, enabled: false }],
      ["bilibili-followers:update-settings", { userId, intervalSeconds: 120 }],
      ["bilibili-followers:refresh", { userId }],
      ["bilibili-followers:trend", { userId, limit: 500 }],
      ["bilibili-followers:trends", { userIds: [userId], limitPerUser: 500 }],
      ["bilibili-followers:delete", { userId }]
    ])
  })

  it("exposes the complete original Bilibili user workbench command surface", async () => {
    const timestamp = "2026-08-29T12:00:00.000Z"
    const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
    const binding = {
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0b01",
      subjectId,
      mid: "22",
      enabledCapabilities: ["follower", "live_heat"] as const,
      danmuEnabled: false,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    const subject = {
      id: subjectId,
      displayName: "碧诗",
      tags: [],
      monitorStatus: "ACTIVE" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      bilibiliBinding: binding
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "bilibili-subjects:list") return [subject]
      if (channel === "bilibili-subjects:delete") return { deleted: true }
      if (channel === "bilibili-subjects:bind") return binding
      if (channel === "bilibili-subjects:workbench") return {
        subject,
        bilibiliBinding: binding,
        summary: { healthScore: 40, enabledModuleCount: 2, totalModuleCount: 4 },
        danmu: { enabled: false, status: "disabled", recentMessages: [] },
        layout: [],
        recentEvents: [{
          eventType: "SUBJECT_CREATED",
          title: "工作台已创建",
          source: "subject",
          occurredAt: timestamp,
          level: "info"
        }]
      }
      if (channel === "bilibili-subjects:trends") return {
        subjectId,
        metrics: ["follower", "live_online"],
        range: "24h",
        bucket: "5m",
        points: []
      }
      if (channel === "bilibili-subjects:layout-update") return [{
        widgetKey: "subject-health-events",
        enabled: true,
        position: {},
        settings: {}
      }]
      return subject
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.bilibiliSubjects.list({})
    await bridge.bilibiliSubjects.list({ limit: 100 })
    await bridge.bilibiliSubjects.create({ mid: "22" })
    await bridge.bilibiliSubjects.create({ displayName: "工作台" })
    await bridge.bilibiliSubjects.create({ displayName: "工作台", danmuEnabled: false })
    await bridge.bilibiliSubjects.create({ displayName: "工作台", danmuEnabled: true })
    await bridge.bilibiliSubjects.get({ subjectId })
    await bridge.bilibiliSubjects.update({ subjectId, enabled: false })
    await bridge.bilibiliSubjects.bind({ subjectId, danmuEnabled: false })
    await bridge.bilibiliSubjects.workbench({ subjectId })
    await bridge.bilibiliSubjects.trends({ subjectId })
    await bridge.bilibiliSubjects.updateLayout({ subjectId, items: [] })
    await bridge.bilibiliSubjects.remove({ subjectId })

    expect(invoke.mock.calls).toStrictEqual([
      ["bilibili-subjects:list", {}],
      ["bilibili-subjects:list", { limit: 100 }],
      ["bilibili-subjects:create", { mid: "22", tags: [] }],
      ["bilibili-subjects:create", { displayName: "工作台", tags: [] }],
      ["bilibili-subjects:create", { displayName: "工作台", tags: [], danmuEnabled: false }],
      ["bilibili-subjects:create", { displayName: "工作台", tags: [], danmuEnabled: true }],
      ["bilibili-subjects:get", { subjectId }],
      ["bilibili-subjects:update", { subjectId, enabled: false }],
      ["bilibili-subjects:bind", { subjectId, danmuEnabled: false }],
      ["bilibili-subjects:workbench", { subjectId }],
      ["bilibili-subjects:trends", {
        subjectId,
        metrics: ["follower", "live_online"],
        range: "24h",
        bucket: "5m"
      }],
      ["bilibili-subjects:layout-update", { subjectId, items: [] }],
      ["bilibili-subjects:delete", { subjectId }]
    ])
  })

  it("exposes the complete original Bilibili auth command surface", async () => {
    const loginId = "018f0f39-7b5e-4cc1-862d-9a208b3d0600"
    const credentialId = "018f0f39-7b5e-4cc1-862d-9a208b3d0601"
    const credential = {
      credentialId,
      account: { mid: "99", uname: "Alice" },
      cookieHeader: "SESSDATA=session; bili_jct=csrf; DedeUserID=99",
      cookies: [
        { name: "SESSDATA", value: "session" },
        { name: "bili_jct", value: "csrf" },
        { name: "DedeUserID", value: "99" }
      ],
      csrf: "csrf",
      rawPayload: { version: 1 }
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "bilibili-auth:qr-start") return {
        loginId,
        qrUrl: "https://passport.bilibili.com/scan?qrcode_key=key",
        expiresInSeconds: 180,
        pollIntervalMillis: 1_500
      }
      if (channel === "bilibili-auth:qr-poll") return {
        status: "SUCCESS",
        message: "ok",
        expiresInSeconds: 0,
        account: { mid: "99", uname: "Alice" },
        credential
      }
      if (channel === "bilibili-auth:status") return {
        loggedIn: true,
        credentialId,
        account: { mid: "99", uname: "Alice" },
        status: "ACTIVE",
        credential
      }
      if (channel === "bilibili-auth:refresh") return {
        refreshed: false,
        loggedIn: true,
        message: "登录态已重新校验；此操作不会刷新 Cookie。",
        account: { mid: "99", uname: "Alice" }
      }
      if (channel === "bilibili-auth:credential") return credential
      return { revoked: true }
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.bilibiliAuth.startQrLogin()
    await bridge.bilibiliAuth.pollQrLogin({ loginId })
    await bridge.bilibiliAuth.status()
    await bridge.bilibiliAuth.refresh()
    await bridge.bilibiliAuth.credential()
    await bridge.bilibiliAuth.revoke()

    expect(invoke.mock.calls).toEqual([
      ["bilibili-auth:qr-start"],
      ["bilibili-auth:qr-poll", { loginId }],
      ["bilibili-auth:status"],
      ["bilibili-auth:refresh"],
      ["bilibili-auth:credential"],
      ["bilibili-auth:revoke"]
    ])
  })

  it("exposes the complete original Bilibili live REST monitor command surface", async () => {
    const timestamp = "2026-08-29T12:00:00.000Z"
    const roomMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0700"
    const room = {
      id: roomMonitorId,
      uid: "22",
      roomId: "33",
      uname: "anchor",
      title: "直播标题",
      liveStatus: 1 as const,
      onlineCount: 100,
      monitorStatus: "ACTIVE" as const,
      intervalSeconds: 300,
      recentTrend: [],
      version: 1
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "bilibili-live:rooms-list") return { items: [room], total: 1, snapshotAt: timestamp }
      if (channel === "bilibili-live:rooms-refresh") return {
        roomMonitorId,
        uid: "22",
        roomId: "33",
        success: true,
        liveStatus: 1,
        onlineCount: 100,
        capturedAt: timestamp,
        sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
        message: "ok"
      }
      if (channel === "bilibili-live:rooms-delete") return { deleted: true }
      if (channel === "bilibili-live:summary") return {
        totalRooms: 1,
        activeRooms: 1,
        liveRooms: 1,
        roundRooms: 0,
        offlineRooms: 0,
        errorRooms: 0,
        totalOnlineCount: 100,
        todayLiveStarts: 0
      }
      if (channel === "bilibili-live:trend") return { room, points: [] }
      if (channel === "bilibili-live:trends") return [{ room, points: [] }]
      if (channel === "bilibili-live:events") return []
      if (channel === "bilibili-live:ranks-summary") return {
        roomMonitorId,
        roomId: "33",
        ruid: "22",
        audienceCount: 1,
        updatedAt: timestamp,
        snapshots: []
      }
      if (channel === "bilibili-live:ranks-latest") return {
        id: "81814b69-d0e0-49c2-a6cc-3803b169a7c0",
        roomMonitorId,
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
        capturedAt: timestamp,
        entries: []
      }
      if (channel === "bilibili-live:ranks-refresh") return {
        roomMonitorId,
        successCount: 1,
        errors: [],
        summary: {
          roomMonitorId,
          roomId: "33",
          ruid: "22",
          audienceCount: 1,
          updatedAt: timestamp,
          snapshots: []
        }
      }
      if (channel === "bilibili-live:danmaku-start" || channel === "bilibili-live:danmaku-status") return {
        liveRoomMonitorId: roomMonitorId,
        roomId: "33",
        running: true,
        status: "CONNECTED",
        ratePerMinute: 1,
        last5MinutesCount: 1,
        likeIncrement: 0,
        protocolVersion: 3,
        authMode: "ANONYMOUS"
      }
      if (channel === "bilibili-live:danmaku-stop") return {
        liveRoomMonitorId: roomMonitorId,
        roomId: "33",
        running: false,
        status: "STOPPED",
        ratePerMinute: 1,
        last5MinutesCount: 1,
        likeIncrement: 0,
        protocolVersion: 3,
        authMode: "ANONYMOUS"
      }
      if (channel === "bilibili-live:danmaku-recent") return [{
        messageText: "hello",
        senderUid: "99",
        displayName: "Alice",
        sentAt: timestamp
      }]
      if (channel === "bilibili-live:danmaku-metrics") return [{
        bucketStart: timestamp,
        bucketSeconds: 60,
        danmuCount: 1,
        likeIncrement: 0,
        rawEventCount: 1
      }]
      if (channel === "bilibili-live:session-export") return {
        category: "all",
        canceled: false,
        savedPath: "D:\\exports\\session.zip"
      }
      return room
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.bilibiliLive.list({ limit: 100 })
    await bridge.bilibiliLive.add({ uid: "22", intervalSeconds: 300 })
    await bridge.bilibiliLive.updateStatus({ roomMonitorId, enabled: false })
    await bridge.bilibiliLive.updateSettings({ roomMonitorId, intervalSeconds: 120 })
    await bridge.bilibiliLive.refresh({ roomMonitorId })
    await bridge.bilibiliLive.remove({ roomMonitorId })
    await bridge.bilibiliLive.summary()
    await bridge.bilibiliLive.trend({ roomMonitorId, limit: 500 })
    await bridge.bilibiliLive.trends({ roomMonitorIds: [roomMonitorId], limitPerRoom: 500 })
    await bridge.bilibiliLive.events({ limit: 20 })
    await bridge.bilibiliLive.rankSummary({ roomMonitorId })
    await bridge.bilibiliLive.rankLatest({ roomMonitorId, family: "AUDIENCE" })
    await bridge.bilibiliLive.rankRefresh({ roomMonitorId, types: ["contribution_rank"] })
    await bridge.bilibiliLive.danmakuStart({ roomMonitorId, protocolVersion: 3 })
    await bridge.bilibiliLive.danmakuStatus({ roomMonitorId })
    await bridge.bilibiliLive.danmakuRecent({ roomMonitorId })
    await bridge.bilibiliLive.danmakuMetrics({ roomMonitorId })
    await bridge.bilibiliLive.danmakuStop({ roomMonitorId })
    await bridge.bilibiliLive.sessionExport({
      sessionId: "018f0f39-7b5e-4cc1-862d-9a208b3d0777",
      category: "all"
    })

    expect(invoke.mock.calls).toEqual([
      ["bilibili-live:rooms-list", { limit: 100 }],
      ["bilibili-live:rooms-add", { uid: "22", intervalSeconds: 300 }],
      ["bilibili-live:rooms-update-status", { roomMonitorId, enabled: false }],
      ["bilibili-live:rooms-update-settings", { roomMonitorId, intervalSeconds: 120 }],
      ["bilibili-live:rooms-refresh", { roomMonitorId }],
      ["bilibili-live:rooms-delete", { roomMonitorId }],
      ["bilibili-live:summary"],
      ["bilibili-live:trend", { roomMonitorId, limit: 500 }],
      ["bilibili-live:trends", { roomMonitorIds: [roomMonitorId], limitPerRoom: 500 }],
      ["bilibili-live:events", { limit: 20 }],
      ["bilibili-live:ranks-summary", { roomMonitorId }],
      ["bilibili-live:ranks-latest", { roomMonitorId, family: "AUDIENCE", limit: 50 }],
      ["bilibili-live:ranks-refresh", {
        roomMonitorId,
        families: [],
        types: ["contribution_rank"],
        force: false
      }],
      ["bilibili-live:danmaku-start", { roomMonitorId, protocolVersion: 3 }],
      ["bilibili-live:danmaku-status", { roomMonitorId }],
      ["bilibili-live:danmaku-recent", { roomMonitorId, limit: 30 }],
      ["bilibili-live:danmaku-metrics", { roomMonitorId, range: "1h" }],
      ["bilibili-live:danmaku-stop", { roomMonitorId }],
      ["bilibili-live:session-export", {
        sessionId: "018f0f39-7b5e-4cc1-862d-9a208b3d0777",
        category: "all"
      }]
    ])
  })

  it("exposes the original independent Douyin Web and OAuth credential surface", async () => {
    const timestamp = "2026-08-30T01:00:00.000Z"
    const loginId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c00"
    const credential = {
      credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
      authType: "DOUYIN_WEB_SESSION" as const,
      status: "ACTIVE" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      payload: { cookies: [] }
    }
    const credentialSummary = {
      ...credential,
      payload: { account: {}, cookieCount: 0 }
    }
    const state = "abcdefghijklmnopqrstuvwxyz1234567890"
    const invoke = vi.fn(async (channel: string, input?: unknown) => {
      if (channel === "douyin-auth:status") return { enabled: true, oauthMode: "live", workerAvailable: true, workerStatus: "UP", pollIntervalMs: 2_000, webCredential: credentialSummary }
      if (channel === "douyin-auth:web-start") return { loginId, status: "STARTING", expiresInSeconds: 180, pollIntervalMs: 2_000, expiresAt: "2026-08-30T01:03:00.000Z" }
      if (channel === "douyin-auth:web-poll") return { loginId, status: "WAITING", message: "scan", expiresInSeconds: 170 }
      if (channel === "douyin-auth:web-validate") return { valid: true, message: "valid", details: {} }
      if (channel === "douyin-auth:oauth-start") return { loginId, mode: "live", authorizationUrl: "https://open.douyin.com/platform/oauth/connect/", state, expiresInSeconds: 180 }
      if (channel === "douyin-auth:export") return { kind: "web", canceled: false, savedPath: "D:\\exports\\douyin-web-credential.json" }
      if (channel === "douyin-auth:revoke") return { kind: (input as { kind: string }).kind, revoked: true }
      if (channel === "douyin-auth:oauth-complete" || channel === "douyin-auth:oauth-refresh") {
        return {
          credentialId: credential.credentialId,
          authType: credential.authType,
          status: credential.status
        }
      }
      return credential
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.douyinAuth.status()
    await bridge.douyinAuth.startWebQr()
    await bridge.douyinAuth.pollWebQr({ loginId })
    await bridge.douyinAuth.validateWeb()
    await bridge.douyinAuth.startOAuth()
    await bridge.douyinAuth.completeOAuth({ state, code: "code" })
    await bridge.douyinAuth.refreshOAuth()
    await bridge.douyinAuth.credential({ kind: "web" })
    await bridge.douyinAuth.exportCredential({ kind: "web" })
    await bridge.douyinAuth.revoke({ kind: "web" })

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      "douyin-auth:status",
      "douyin-auth:web-start",
      "douyin-auth:web-poll",
      "douyin-auth:web-validate",
      "douyin-auth:oauth-start",
      "douyin-auth:oauth-complete",
      "douyin-auth:oauth-refresh",
      "douyin-auth:credential",
      "douyin-auth:export",
      "douyin-auth:revoke"
    ])
  })
})
