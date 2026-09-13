import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterEach, describe, expect, it } from "vitest"

import { ControlDatabase } from "./control-database"

describe("ControlDatabase", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("creates the WAL control database and applies live export counter schema version 12", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-control-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    try {
      expect(database.status()).toEqual({
        databasePath: resolve(testDirectory, "control.db"),
        journalMode: "wal",
        schemaVersion: 12
      })
      expect(database.listWorkerStatuses()).toEqual([])

      const inspection = new DatabaseSync(resolve(testDirectory, "control.db"), { readOnly: true })
      try {
        const tables = inspection
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all()
          .map((row) => String(row.name))
        expect(tables).toEqual(expect.arrayContaining([
          "bilibili_follower_monitor",
          "bilibili_follower_snapshot",
          "bilibili_api_call",
          "bilibili_auth_credential",
          "bilibili_live_room_monitor",
          "bilibili_live_room_snapshot",
          "bilibili_live_status_event",
          "bilibili_live_rank_snapshot",
          "bilibili_live_rank_entry",
          "bilibili_live_danmaku_session",
          "bilibili_live_danmaku_metric_bucket",
          "bilibili_live_danmaku_recent",
          "bilibili_live_session",
          "bilibili_live_session_event",
          "bilibili_live_export_daily_counter",
          "bilibili_monitored_subject",
          "bilibili_subject_binding",
          "bilibili_subject_widget_layout",
          "douyin_auth_session",
          "douyin_auth_credential",
          "object_artifact",
          "platform_account",
          "subject",
          "subject_account_binding",
          "subject_monitor_policy"
        ]))
      } finally {
        inspection.close()
      }
    } finally {
      database.close()
    }
  })

  it("keeps Douyin OAuth and Web credentials encrypted and independently active", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-auth-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    try {
      database.createDouyinAuthSession({
        loginId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c00",
        flowType: "WEB_QR",
        providerMode: "live",
        workerSessionId: null,
        state: null,
        status: "STARTING",
        expiresAt: "2026-08-30T01:03:00.000Z",
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        rawResultJson: "{}",
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z"
      })
      database.saveActiveDouyinCredential({
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
        authType: "DOUYIN_WEB_SESSION",
        encryptedPayload: "encrypted-web",
        expiresAt: null,
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z"
      })
      database.saveActiveDouyinCredential({
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c02",
        authType: "DOUYIN_OAUTH2",
        encryptedPayload: "encrypted-oauth",
        expiresAt: "2026-08-31T01:00:00.000Z",
        createdAt: "2026-08-30T01:00:00.000Z",
        updatedAt: "2026-08-30T01:00:00.000Z"
      })

      expect(database.findDouyinAuthSessionById("018f0f39-7b5e-4cc1-862d-9a208b3d0c00")).toMatchObject({ status: "STARTING" })
      expect(database.findActiveDouyinCredential("DOUYIN_WEB_SESSION")?.encryptedPayload).toBe("encrypted-web")
      expect(database.findActiveDouyinCredential("DOUYIN_OAUTH2")?.encryptedPayload).toBe("encrypted-oauth")
    } finally {
      database.close()
    }
  })

  it("atomically replaces a Douyin credential only when the expected row is still active", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-douyin-credential-cas-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const oldId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c10"
    const newerId = "018f0f39-7b5e-4cc1-862d-9a208b3d0c11"
    try {
      database.saveActiveDouyinCredential({
        credentialId: newerId,
        authType: "DOUYIN_WEB_SESSION",
        encryptedPayload: "encrypted-newer",
        expiresAt: null,
        createdAt: "2026-08-30T01:01:00.000Z",
        updatedAt: "2026-08-30T01:01:00.000Z"
      })

      expect(database.replaceActiveDouyinCredentialIfCurrent(oldId, {
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c12",
        authType: "DOUYIN_WEB_SESSION",
        encryptedPayload: "encrypted-stale-validation",
        expiresAt: null,
        createdAt: "2026-08-30T01:02:00.000Z",
        updatedAt: "2026-08-30T01:02:00.000Z"
      })).toBeUndefined()
      expect(database.findActiveDouyinCredential("DOUYIN_WEB_SESSION")?.credentialId).toBe(newerId)

      const replacement = database.replaceActiveDouyinCredentialIfCurrent(newerId, {
        credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c13",
        authType: "DOUYIN_WEB_SESSION",
        encryptedPayload: "encrypted-current-validation",
        expiresAt: null,
        createdAt: "2026-08-30T01:03:00.000Z",
        updatedAt: "2026-08-30T01:03:00.000Z"
      })
      expect(replacement?.encryptedPayload).toBe("encrypted-current-validation")
    } finally {
      database.close()
    }
  })

  it("persists an original-style Bilibili subject and its widget layout", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-bilibili-subject-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
    try {
      database.createBilibiliSubject({
        subject: {
          subjectId,
          displayName: "原神",
          avatarUrl: null,
          remark: "指定用户工作台",
          tags: ["游戏"],
          monitorStatus: "ACTIVE",
          healthScore: null,
          lastSuccessAt: null,
          lastEventAt: null,
          version: 1,
          createdAt: "2026-08-29T12:00:00.000Z",
          updatedAt: "2026-08-29T12:00:00.000Z"
        },
        layouts: [{
          layoutId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b01",
          subjectId,
          widgetKey: "bilibili-follower-live-heat",
          enabled: true,
          position: { x: 0, y: 0, w: 8, h: 3 },
          settings: {},
          createdAt: "2026-08-29T12:00:00.000Z",
          updatedAt: "2026-08-29T12:00:00.000Z"
        }]
      }, {
        messageId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b02",
        topic: "bilibili.subject.created",
        envelopeJson: "{}",
        createdAt: "2026-08-29T12:00:00.000Z"
      })

      expect(database.findBilibiliSubjectById(subjectId)).toMatchObject({
        displayName: "原神",
        tags: ["游戏"],
        monitorStatus: "ACTIVE"
      })
      expect(database.findBilibiliSubjectLayouts(subjectId, true)).toMatchObject([{
        widgetKey: "bilibili-follower-live-heat",
        enabled: true,
        position: { x: 0, y: 0, w: 8, h: 3 }
      }])
    } finally {
      database.close()
    }
  })

  it("backfills paired historical boundaries and the currently live room when upgrading from v8", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-session-backfill-"))
    directory = testDirectory
    const initial = await ControlDatabase.open(testDirectory)
    initial.close()
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0f00"
    const raw = new DatabaseSync(resolve(testDirectory, "control.db"))
    try {
      raw.exec(`
        INSERT INTO bilibili_live_room_monitor (
          monitor_id, uid, room_id, uname, title, live_status, live_time,
          monitor_status, interval_seconds, version, created_at, updated_at
        ) VALUES (
          '${monitorId}', '22', '33', 'anchor', '当前直播', 1, '2026-08-29T12:00:00.000Z',
          'ACTIVE', 300, 1, '2026-08-29T10:00:00.000Z', '2026-08-29T12:00:01.000Z'
        );
        INSERT INTO bilibili_live_status_event (
          event_id, monitor_id, uid, room_id, event_type, title_after, occurred_at
        ) VALUES
          ('018f0f39-7b5e-4cc1-862d-9a208b3d0f01', '${monitorId}', '22', '33', 'LIVE_STARTED', '历史直播', '2026-08-29T10:00:00.000Z'),
          ('018f0f39-7b5e-4cc1-862d-9a208b3d0f02', '${monitorId}', '22', '33', 'LIVE_ENDED', '历史直播结束', '2026-08-29T11:00:00.000Z'),
          ('018f0f39-7b5e-4cc1-862d-9a208b3d0f03', '${monitorId}', '22', '33', 'LIVE_STARTED', '当前直播', '2026-08-29T12:00:00.000Z');
        DELETE FROM bilibili_live_session;
        DROP TABLE bilibili_subject_widget_layout;
        DROP TABLE bilibili_subject_binding;
        DROP TABLE bilibili_monitored_subject;
        DROP TABLE douyin_auth_credential;
        DROP TABLE douyin_auth_session;
        DROP TABLE bilibili_live_export_daily_counter;
        DELETE FROM schema_migration WHERE version = 12;
        DELETE FROM schema_migration WHERE version = 11;
        DELETE FROM schema_migration WHERE version = 10;
        DELETE FROM schema_migration WHERE version = 9;
        PRAGMA user_version = 8;
      `)
    } finally {
      raw.close()
    }

    const upgraded = await ControlDatabase.open(testDirectory)
    try {
      expect(upgraded.status().schemaVersion).toBe(12)
      expect(upgraded.listBilibiliLiveSessions(monitorId, 10)).toMatchObject([
        {
          state: "OPEN",
          startSource: "MIGRATION_CURRENT_STATE",
          platformLiveTime: "2026-08-29T12:00:00.000Z"
        },
        {
          state: "CLOSED",
          startSource: "STATUS_EVENT_BACKFILL",
          endSource: "STATUS_EVENT_BACKFILL",
          startedAt: "2026-08-29T10:00:00.000Z",
          endedAt: "2026-08-29T11:00:00.000Z"
        }
      ])
    } finally {
      upgraded.close()
    }
  })

  it("keeps one encrypted active Bilibili credential and revokes it atomically", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-bilibili-auth-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const store = database as unknown as {
      saveActiveBilibiliCredential: (input: Record<string, unknown>, outbox: Record<string, unknown>) => void
      findActiveBilibiliCredential: () => Record<string, unknown> | undefined
      findBilibiliCredentialById: (credentialId: string) => Record<string, unknown> | undefined
      revokeActiveBilibiliCredential: (timestamp: string, outbox: Record<string, unknown>) => boolean
      listPlatformAccounts: (input: Record<string, unknown>) => { items: Array<Record<string, unknown>> }
    }
    const firstId = "018f0f39-7b5e-7cc1-962d-9a208b3d0500"
    const secondId = "018f0f39-7b5e-7cc1-962d-9a208b3d0501"
    const outbox = (messageId: string, topic: string) => ({
      messageId,
      topic,
      envelopeJson: "{}",
      createdAt: "2026-08-29T12:00:00.000Z"
    })

    try {
      expect(typeof store.saveActiveBilibiliCredential).toBe("function")
      store.saveActiveBilibiliCredential({
        credentialId: firstId,
        encryptedPayload: "aes-gcm:first",
        expiresAt: null,
        account: {
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0510",
          mid: "99",
          uname: "Alice",
          face: null
        },
        createdAt: "2026-08-29T12:00:00.000Z",
        updatedAt: "2026-08-29T12:00:00.000Z"
      }, outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0520", "bilibili.auth.credential-activated"))
      store.saveActiveBilibiliCredential({
        credentialId: secondId,
        encryptedPayload: "aes-gcm:second",
        expiresAt: "2027-08-29T12:00:00.000Z",
        account: {
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0510",
          mid: "99",
          uname: "Alice 2",
          face: "https://i0.hdslb.com/bfs/face/alice.jpg"
        },
        createdAt: "2026-08-29T12:01:00.000Z",
        updatedAt: "2026-08-29T12:01:00.000Z"
      }, outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0521", "bilibili.auth.credential-activated"))

      expect(store.findBilibiliCredentialById(firstId)).toMatchObject({ status: "REVOKED" })
      expect(store.findActiveBilibiliCredential()).toMatchObject({
        credentialId: secondId,
        encryptedPayload: "aes-gcm:second",
        status: "ACTIVE"
      })
      expect(store.listPlatformAccounts({ platform: "bilibili", limit: 10 }).items).toMatchObject([{
        externalId: "99",
        displayName: "Alice 2",
        authState: "active"
      }])

      expect(store.revokeActiveBilibiliCredential(
        "2026-08-29T12:02:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0522", "bilibili.auth.credential-revoked")
      )).toBe(true)
      expect(store.findActiveBilibiliCredential()).toBeUndefined()
      expect(store.listPlatformAccounts({ platform: "bilibili", limit: 10 }).items[0]).toMatchObject({
        authState: "revoked"
      })
    } finally {
      database.close()
    }
  })

  it("persists account, subject, binding, policy and outbox records atomically", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-business-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const store = database as unknown as {
      createPlatformAccount: (input: Record<string, unknown>, outbox: Record<string, unknown>) => void
      createSubject: (input: Record<string, unknown>, outbox: Record<string, unknown>) => void
      listPlatformAccounts: (input: Record<string, unknown>) => { items: unknown[]; total: number }
      listSubjects: (input: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
      listPendingOutbox: () => Array<{ topic: string }>
    }

    try {
      expect(typeof store.createPlatformAccount).toBe("function")
      expect(typeof store.createSubject).toBe("function")
      expect(typeof store.listPlatformAccounts).toBe("function")
      expect(typeof store.listSubjects).toBe("function")

      store.createPlatformAccount({
        accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神",
        profileUrl: "https://space.bilibili.com/3494364227449238",
        avatarUrl: null,
        authState: "not_connected",
        lastValidatedAt: null,
        version: 1,
        createdAt: "2026-08-23T05:00:00.000Z",
        updatedAt: "2026-08-23T05:00:00.000Z"
      }, {
        messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0185",
        topic: "platform-account.created",
        envelopeJson: "{}",
        createdAt: "2026-08-23T05:00:00.000Z"
      })

      store.createSubject({
        subject: {
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          name: "原神官方账号",
          status: "active",
          tags: ["游戏", "官方"],
          version: 1,
          createdAt: "2026-08-23T05:01:00.000Z",
          updatedAt: "2026-08-23T05:01:00.000Z"
        },
        binding: {
          bindingId: "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
          validFrom: "2026-08-23T05:01:00.000Z",
          createdAt: "2026-08-23T05:01:00.000Z"
        },
        policy: {
          policyId: "018f0f39-8b5e-7cc1-962d-9a208b3d0186",
          bindingId: "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
          capability: "follower.snapshot",
          state: "active",
          intervalSeconds: 3600,
          version: 1,
          createdAt: "2026-08-23T05:01:00.000Z",
          updatedAt: "2026-08-23T05:01:00.000Z"
        }
      }, {
        messageId: "018f0f39-8b5e-7cc1-962d-9a208b3d0187",
        topic: "subject.created",
        envelopeJson: "{}",
        createdAt: "2026-08-23T05:01:00.000Z"
      })

      expect(store.listPlatformAccounts({ limit: 50 })).toMatchObject({ total: 1 })
      expect(store.listSubjects({ limit: 50 })).toMatchObject({
        total: 1,
        items: [{
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          tags: ["游戏", "官方"],
          accounts: [{ externalId: "3494364227449238" }],
          policies: [{
            accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
            capability: "follower.snapshot",
            intervalSeconds: 3600
          }]
        }]
      })
      expect(store.listPendingOutbox().map((message) => message.topic)).toEqual([
        "platform-account.created",
        "subject.created"
      ])
    } finally {
      database.close()
    }
  })

  it("atomically creates a Bilibili follower monitor, its first snapshot, evidence and outbox event", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const store = database as unknown as {
      upsertBilibiliFollowerMonitorSnapshot: (input: Record<string, unknown>) => void
      listBilibiliFollowerMonitors: (limit: number) => Array<Record<string, unknown>>
      findBilibiliFollowerSnapshots: (
        monitorId: string,
        input: { limit: number }
      ) => Array<Record<string, unknown>>
      insertBilibiliApiCall: (input: Record<string, unknown>) => void
      listBilibiliApiCalls: (taskId: string) => Array<Record<string, unknown>>
      listPendingOutbox: () => Array<{ topic: string }>
    }

    try {
      expect(typeof store.upsertBilibiliFollowerMonitorSnapshot).toBe("function")
      store.upsertBilibiliFollowerMonitorSnapshot({
        monitor: {
          monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0200",
          mid: "2",
          nickname: "碧诗",
          avatarUrl: "https://i2.hdslb.com/bfs/face/example.jpg",
          profileUrl: "https://space.bilibili.com/2",
          followerCount: 1_395_836,
          followingCount: 423,
          intervalSeconds: 3600,
          nextCollectAt: "2026-08-29T13:00:00.000Z",
          capturedAt: "2026-08-29T12:00:00.123Z",
          sourceEndpoint: "x/web-interface/card"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0201",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: {
          objectId: `sha256:${"a".repeat(64)}`,
          sha256: "a".repeat(64),
          relativePath: `cas/sha256/aa/${"a".repeat(64)}.json`,
          sizeBytes: 284,
          mediaType: "application/json",
          createdAt: "2026-08-29T12:00:00.123Z"
        },
        outbox: {
          messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0202",
          topic: "bilibili.follower.snapshot-collected",
          envelopeJson: "{}",
          createdAt: "2026-08-29T12:00:00.123Z"
        }
      })

      expect(store.listBilibiliFollowerMonitors(100)).toMatchObject([{
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0200",
        mid: "2",
        nickname: "碧诗",
        currentFollowerCount: 1_395_836,
        followingCount: 423,
        monitorStatus: "ACTIVE",
        intervalSeconds: 3600,
        sourceEndpoint: "x/web-interface/card"
      }])
      expect(store.findBilibiliFollowerSnapshots(
        "018f0f39-7b5e-7cc1-962d-9a208b3d0200",
        { limit: 30 }
      )).toMatchObject([{
        followerCount: 1_395_836,
        followingCount: 423,
        capturedAt: "2026-08-29T12:00:00.123Z"
      }])
      expect(store.listPendingOutbox().at(-1)?.topic).toBe("bilibili.follower.snapshot-collected")
      store.insertBilibiliApiCall({
        callId: "018f0f39-7b5e-7cc1-962d-9a208b3d0203",
        taskId: "018f0f39-7b5e-7cc1-962d-9a208b3d0204",
        attempt: 1,
        endpointKey: "x/web-interface/card",
        mid: "2",
        statusCode: 200,
        durationMs: 28,
        errorType: null,
        retryable: false,
        evidenceObjectId: `sha256:${"a".repeat(64)}`,
        createdAt: "2026-08-29T12:00:00.123Z"
      })
      expect(store.listBilibiliApiCalls("018f0f39-7b5e-7cc1-962d-9a208b3d0204")).toMatchObject([{
        attempt: 1,
        endpointKey: "x/web-interface/card",
        mid: "2",
        statusCode: 200,
        durationMs: 28,
        errorType: null,
        retryable: false,
        evidenceObjectId: `sha256:${"a".repeat(64)}`
      }])
    } finally {
      database.close()
    }
  })

  it("preserves the original pause, resume, interval, due, failure and cascade-delete semantics", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-follower-lifecycle-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const store = database as unknown as {
      upsertBilibiliFollowerMonitorSnapshot: (input: Record<string, unknown>) => void
      updateBilibiliFollowerMonitorStatus: (
        monitorId: string,
        enabled: boolean,
        timestamp: string,
        outbox: Record<string, unknown>
      ) => void
      updateBilibiliFollowerMonitorInterval: (
        monitorId: string,
        intervalSeconds: number,
        nextCollectAt: string,
        timestamp: string,
        outbox: Record<string, unknown>
      ) => void
      markBilibiliFollowerMonitorFailure: (input: Record<string, unknown>) => void
      findDueBilibiliFollowerMonitors: (now: string, limit: number) => Array<Record<string, unknown>>
      findBilibiliFollowerMonitorById: (monitorId: string) => Record<string, unknown> | undefined
      findBilibiliFollowerSnapshots: (monitorId: string, input: { limit: number }) => unknown[]
      deleteBilibiliFollowerMonitor: (monitorId: string, outbox: Record<string, unknown>) => void
    }
    const monitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0400"
    const outbox = (messageId: string, topic: string, createdAt: string) => ({
      messageId,
      topic,
      envelopeJson: "{}",
      createdAt
    })

    try {
      store.upsertBilibiliFollowerMonitorSnapshot({
        monitor: {
          monitorId,
          mid: "2",
          nickname: "碧诗",
          avatarUrl: null,
          profileUrl: "https://space.bilibili.com/2",
          followerCount: 100,
          followingCount: 10,
          intervalSeconds: 120,
          nextCollectAt: "2026-08-29T12:02:00.000Z",
          capturedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "x/web-interface/card"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0401",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: {
          objectId: `sha256:${"b".repeat(64)}`,
          sha256: "b".repeat(64),
          relativePath: `cas/sha256/bb/${"b".repeat(64)}.json`,
          sizeBytes: 100,
          mediaType: "application/json",
          createdAt: "2026-08-29T12:00:00.000Z"
        },
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0402", "seed", "2026-08-29T12:00:00.000Z")
      })

      expect(typeof store.updateBilibiliFollowerMonitorStatus).toBe("function")
      store.updateBilibiliFollowerMonitorStatus(
        monitorId,
        false,
        "2026-08-29T12:01:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0403", "paused", "2026-08-29T12:01:00.000Z")
      )
      expect(store.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        monitorStatus: "PAUSED",
        nextCollectAt: "2026-08-29T12:02:00.000Z"
      })
      expect(store.findDueBilibiliFollowerMonitors("2026-08-29T13:00:00.000Z", 10)).toEqual([])

      store.updateBilibiliFollowerMonitorStatus(
        monitorId,
        true,
        "2026-08-29T12:03:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0404", "resumed", "2026-08-29T12:03:00.000Z")
      )
      expect(store.findDueBilibiliFollowerMonitors("2026-08-29T12:03:00.000Z", 10)).toHaveLength(1)

      store.updateBilibiliFollowerMonitorInterval(
        monitorId,
        3600,
        "2026-08-29T13:03:00.000Z",
        "2026-08-29T12:03:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0405", "interval", "2026-08-29T12:03:00.000Z")
      )
      expect(store.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        intervalSeconds: 3600,
        nextCollectAt: "2026-08-29T13:03:00.000Z"
      })

      store.markBilibiliFollowerMonitorFailure({
        monitorId,
        nextCollectAt: "2026-08-29T12:18:00.000Z",
        errorAt: "2026-08-29T12:03:00.000Z",
        errorType: "BILIBILI_RATE_LIMITED",
        errorMessage: "请求过于频繁",
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0406", "failure", "2026-08-29T12:03:00.000Z")
      })
      expect(store.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        nextCollectAt: "2026-08-29T12:18:00.000Z",
        lastErrorType: "BILIBILI_RATE_LIMITED",
        lastErrorMessage: "请求过于频繁"
      })

      store.deleteBilibiliFollowerMonitor(
        monitorId,
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0407", "deleted", "2026-08-29T12:04:00.000Z")
      )
      expect(store.findBilibiliFollowerMonitorById(monitorId)).toBeUndefined()
      expect(store.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })).toEqual([])
    } finally {
      database.close()
    }
  })

  it("persists live room snapshots idempotently and derives original status events", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-room-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const monitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0600"
    const outbox = (messageId: string, createdAt: string) => ({
      messageId,
      topic: "bilibili.live.snapshot-collected",
      envelopeJson: "{}",
      createdAt
    })
    const artifact = (sha: string, createdAt: string) => ({
      objectId: `sha256:${sha.repeat(64)}`,
      sha256: sha.repeat(64),
      relativePath: `cas/sha256/${sha}${sha}/${sha.repeat(64)}.json`,
      sizeBytes: 200,
      mediaType: "application/json",
      createdAt
    })

    try {
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
          uid: "22",
          roomId: "33",
          shortId: "3",
          uname: "anchor",
          faceUrl: null,
          title: "old title",
          coverUrl: null,
          keyframeUrl: null,
          areaId: "1",
          areaName: "游戏",
          parentAreaId: "2",
          parentAreaName: "网游",
          liveStatus: 0,
          liveTime: null,
          onlineCount: 0,
          attentionCount: 100,
          intervalSeconds: 300,
          nextCollectAt: "2026-08-29T12:05:00.000Z",
          capturedAt: "2026-08-29T12:00:00.123Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0601",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: artifact("c", "2026-08-29T12:00:00.123Z"),
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0602", "2026-08-29T12:00:00.123Z")
      })
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
          uid: "22",
          roomId: "33",
          shortId: "3",
          uname: "anchor",
          faceUrl: null,
          title: "new title",
          coverUrl: null,
          keyframeUrl: null,
          areaId: "1",
          areaName: "游戏",
          parentAreaId: "2",
          parentAreaName: "网游",
          liveStatus: 1,
          liveTime: "2026-08-29T12:00:01.000Z",
          onlineCount: 200,
          attentionCount: 101,
          intervalSeconds: 300,
          nextCollectAt: "2026-08-29T12:05:01.000Z",
          capturedAt: "2026-08-29T12:00:01.123Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0603",
          capturedBucket: "2026-08-29T12:00:01.000Z"
        },
        artifact: artifact("d", "2026-08-29T12:00:01.123Z"),
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0604", "2026-08-29T12:00:01.123Z")
      })

      expect(database.findBilibiliLiveRoomById(monitorId)).toMatchObject({
        uid: "22",
        roomId: "33",
        title: "new title",
        liveStatus: 1,
        onlineCount: 200
      })
      expect(database.findBilibiliLiveRoomSnapshots(monitorId, { limit: 30 })).toHaveLength(2)
      expect(database.listBilibiliLiveStatusEvents(20).map((event) => event.eventType)).toEqual([
        "TITLE_CHANGED",
        "LIVE_STARTED"
      ])
      expect(database.countTodayBilibiliLiveStarts("2026-08-29T00:00:00.000Z")).toBe(1)
    } finally {
      database.close()
    }
  })

  it("preserves live room pause, resume, due, failure and cascade delete semantics", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-lifecycle-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const monitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0700"
    const outbox = (messageId: string, topic: string, createdAt: string) => ({
      messageId,
      topic,
      envelopeJson: "{}",
      createdAt
    })
    try {
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
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
          liveStatus: 0,
          liveTime: null,
          onlineCount: 0,
          attentionCount: 100,
          intervalSeconds: 120,
          nextCollectAt: "2026-08-29T12:02:00.000Z",
          capturedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_info"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0701",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: {
          objectId: `sha256:${"e".repeat(64)}`,
          sha256: "e".repeat(64),
          relativePath: `cas/sha256/ee/${"e".repeat(64)}.json`,
          sizeBytes: 100,
          mediaType: "application/json",
          createdAt: "2026-08-29T12:00:00.000Z"
        },
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0702", "seed", "2026-08-29T12:00:00.000Z")
      })

      database.updateBilibiliLiveRoomStatus(
        monitorId, false, "2026-08-29T12:01:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0703", "paused", "2026-08-29T12:01:00.000Z")
      )
      expect(database.findDueBilibiliLiveRooms("2026-08-29T13:00:00.000Z", 10)).toEqual([])
      database.updateBilibiliLiveRoomStatus(
        monitorId, true, "2026-08-29T12:03:00.000Z",
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0704", "resumed", "2026-08-29T12:03:00.000Z")
      )
      expect(database.findDueBilibiliLiveRooms("2026-08-29T12:03:00.000Z", 10)).toHaveLength(1)
      database.markBilibiliLiveRoomFailure({
        monitorId,
        nextCollectAt: "2026-08-29T12:05:00.000Z",
        errorAt: "2026-08-29T12:03:00.000Z",
        errorType: "BILIBILI_RATE_LIMITED",
        errorMessage: "请求过于频繁",
        eventId: "018f0f39-7b5e-7cc1-962d-9a208b3d0705",
        outbox: outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0706", "failed", "2026-08-29T12:03:00.000Z")
      })
      expect(database.findBilibiliLiveRoomById(monitorId)).toMatchObject({
        lastErrorType: "BILIBILI_RATE_LIMITED",
        backoffUntil: "2026-08-29T12:05:00.000Z"
      })
      expect(database.listBilibiliLiveStatusEvents(20)[0]).toMatchObject({
        eventType: "ERROR_OCCURRED"
      })
      database.deleteBilibiliLiveRoom(
        monitorId,
        outbox("018f0f39-7b5e-7cc1-962d-9a208b3d0707", "deleted", "2026-08-29T12:04:00.000Z")
      )
      expect(database.findBilibiliLiveRoomById(monitorId)).toBeUndefined()
      expect(database.findBilibiliLiveRoomSnapshots(monitorId, { limit: 30 })).toEqual([])
      expect(database.listBilibiliLiveStatusEvents(20)).toEqual([])
    } finally {
      database.close()
    }
  })

  it("upserts a rank snapshot bucket, replaces its entries and cascades with the room", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-rank-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const monitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0800"
    const store = database as unknown as {
      upsertBilibiliLiveRankSnapshot: (input: Record<string, unknown>) => Record<string, unknown>
      findLatestBilibiliLiveRankSnapshots: (
        monitorId: string,
        input?: Record<string, unknown>
      ) => Array<Record<string, unknown>>
      findBilibiliLiveRankEntries: (snapshotId: string, limit: number) => Array<Record<string, unknown>>
    }
    const artifact = (sha: string) => ({
      objectId: `sha256:${sha.repeat(64)}`,
      sha256: sha.repeat(64),
      relativePath: `cas/sha256/${sha}${sha}/${sha.repeat(64)}.json`,
      sizeBytes: 200,
      mediaType: "application/json",
      createdAt: "2026-08-29T12:00:00.123Z"
    })
    try {
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
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
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0801",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: artifact("a"),
        outbox: {
          messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0802",
          topic: "seed",
          envelopeJson: "{}",
          createdAt: "2026-08-29T12:00:00.000Z"
        }
      })

      expect(typeof store.upsertBilibiliLiveRankSnapshot).toBe("function")
      const base = {
        monitorId,
        roomId: "33",
        ruid: "22",
        rankFamily: "AUDIENCE",
        rankType: "online_rank",
        rankSwitch: "contribution_rank",
        periodScope: "REALTIME",
        pageNo: 1,
        pageSize: 50,
        countText: "2 人",
        valueText: "贡献值",
        remindMsg: null,
        sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank",
        signedRequired: true,
        capturedAt: "2026-08-29T12:00:00.123Z",
        capturedBucket: "2026-08-29T12:00:00.000Z"
      }
      store.upsertBilibiliLiveRankSnapshot({
        snapshot: {
          ...base,
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0803",
          totalCount: 2
        },
        entries: [{
          entryId: "018f0f39-7b5e-7cc1-962d-9a208b3d0804",
          userUid: "99",
          rankNo: 1,
          entryKind: "LIST",
          displayName: "Alice",
          faceUrl: null,
          score: 100,
          guardLevel: null,
          wealthLevel: null,
          medalName: null,
          medalLevel: null,
          guardExpiredText: null,
          accompanyDays: null
        }],
        artifact: artifact("b")
      })
      store.upsertBilibiliLiveRankSnapshot({
        snapshot: {
          ...base,
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0805",
          totalCount: 3
        },
        entries: [{
          entryId: "018f0f39-7b5e-7cc1-962d-9a208b3d0806",
          userUid: null,
          rankNo: 1,
          entryKind: "LIST",
          displayName: "匿名观众",
          faceUrl: null,
          score: 120,
          guardLevel: null,
          wealthLevel: null,
          medalName: null,
          medalLevel: null,
          guardExpiredText: null,
          accompanyDays: null
        }],
        artifact: artifact("c")
      })

      const snapshots = store.findLatestBilibiliLiveRankSnapshots(monitorId, {
        family: "AUDIENCE",
        type: "online_rank",
        rankSwitch: "contribution_rank"
      })
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0]).toMatchObject({ totalCount: 3, pageNo: 1 })
      expect(store.findBilibiliLiveRankEntries(String(snapshots[0]?.snapshotId), 50)).toMatchObject([{
        userUid: null,
        displayName: "匿名观众",
        score: 120
      }])

      database.deleteBilibiliLiveRoom(monitorId, {
        messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0807",
        topic: "deleted",
        envelopeJson: "{}",
        createdAt: "2026-08-29T12:01:00.000Z"
      })
      expect(store.findLatestBilibiliLiveRankSnapshots(monitorId)).toEqual([])
    } finally {
      database.close()
    }
  })

  it("persists original live danmaku sessions, recent messages and metric buckets", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-danmaku-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const monitorId = "018f0f39-7b5e-7cc1-962d-9a208b3d0900"
    const sessionId = "018f0f39-7b5e-7cc1-962d-9a208b3d0901"
    try {
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
          uid: "22",
          roomId: "7734200",
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
          snapshotId: "018f0f39-7b5e-7cc1-962d-9a208b3d0902",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: {
          objectId: `sha256:${"f".repeat(64)}`,
          sha256: "f".repeat(64),
          relativePath: `cas/sha256/ff/${"f".repeat(64)}.json`,
          sizeBytes: 100,
          mediaType: "application/json",
          createdAt: "2026-08-29T12:00:00.000Z"
        },
        outbox: {
          messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0903",
          topic: "seed",
          envelopeJson: "{}",
          createdAt: "2026-08-29T12:00:00.000Z"
        }
      })

      database.createBilibiliLiveDanmakuSession({
        sessionId,
        monitorId,
        roomId: "7734200",
        connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
        startedAt: "2026-08-29T12:00:01.000Z"
      })
      database.markBilibiliLiveDanmakuSessionConnected(
        sessionId,
        "2026-08-29T12:00:02.000Z"
      )
      database.recordBilibiliLiveDanmakuEvent({
        monitorId,
        sessionId,
        roomId: "7734200",
        occurredAt: "2026-08-29T12:00:05.000Z",
        bucketSeconds: 60,
        danmuDelta: 1,
        likeCount: null,
        likeIncrement: 0,
        watchedCount: null,
        heartbeatPopularity: null,
        giftDelta: 0,
        superChatDelta: 0,
        rawEventDelta: 1,
        recent: {
          senderUid: "1001",
          messageText: "hello danmaku",
          displayName: "完整昵称",
          medalName: "详细粉丝牌",
          sentAt: "2026-08-29T12:00:05.000Z"
        },
        recentLimit: 200
      })
      database.recordBilibiliLiveDanmakuEvent({
        monitorId,
        sessionId,
        roomId: "7734200",
        occurredAt: "2026-08-29T12:00:20.000Z",
        bucketSeconds: 60,
        danmuDelta: 0,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        giftDelta: 0,
        superChatDelta: 0,
        rawEventDelta: 1,
        recent: null,
        recentLimit: 200
      })

      expect(database.findLatestBilibiliLiveDanmakuSession(monitorId)).toMatchObject({
        sessionId,
        status: "CONNECTED",
        connectedAt: "2026-08-29T12:00:02.000Z"
      })
      expect(database.findBilibiliLiveDanmakuRecent(monitorId, 30)).toMatchObject([{
        senderUid: "1001",
        messageText: "hello danmaku",
        displayName: "完整昵称"
      }])
      expect(database.findBilibiliLiveDanmakuMetricBuckets(
        monitorId,
        "2026-08-29T11:59:00.000Z",
        "2026-08-29T12:01:00.000Z",
        20
      )).toMatchObject([{
        danmuCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        rawEventCount: 2
      }])
      expect(database.getBilibiliLiveDanmakuStats(
        monitorId,
        "2026-08-29T12:00:30.000Z"
      )).toMatchObject({
        ratePerMinute: 1,
        last5MinutesCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42
      })

      database.deleteBilibiliLiveRoom(monitorId, {
        messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0904",
        topic: "deleted",
        envelopeJson: "{}",
        createdAt: "2026-08-29T12:01:00.000Z"
      })
      expect(database.findBilibiliLiveDanmakuRecent(monitorId, 30)).toEqual([])
      expect(database.findLatestBilibiliLiveDanmakuSession(monitorId)).toBeUndefined()
    } finally {
      database.close()
    }
  })

  it("stores original live session boundaries and strongly deduplicated facts", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-live-session-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0a00"
    const sessionId = "018f0f39-7b5e-4cc1-862d-9a208b3d0a01"
    const transportId = "018f0f39-7b5e-4cc1-862d-9a208b3d0a02"
    try {
      database.applyBilibiliLiveRoomSnapshot({
        monitor: {
          monitorId,
          uid: "22",
          roomId: "33",
          shortId: null,
          uname: "anchor",
          faceUrl: null,
          title: "直播标题",
          coverUrl: null,
          keyframeUrl: null,
          areaId: null,
          areaName: null,
          parentAreaId: null,
          parentAreaName: null,
          liveStatus: 1,
          liveTime: "2026-08-29T12:00:00.000Z",
          onlineCount: 1,
          attentionCount: 2,
          intervalSeconds: 300,
          nextCollectAt: "2026-08-29T12:05:00.000Z",
          capturedAt: "2026-08-29T12:00:00.000Z",
          sourceEndpoint: "room/v1/Room/get_info"
        },
        snapshot: {
          snapshotId: "018f0f39-7b5e-4cc1-862d-9a208b3d0a03",
          capturedBucket: "2026-08-29T12:00:00.000Z"
        },
        artifact: {
          objectId: `sha256:${"a".repeat(64)}`,
          sha256: "a".repeat(64),
          relativePath: "cas/a.json",
          sizeBytes: 1,
          mediaType: "application/json",
          createdAt: "2026-08-29T12:00:00.000Z"
        },
        outbox: {
          messageId: "018f0f39-7b5e-4cc1-862d-9a208b3d0a04",
          topic: "seed",
          envelopeJson: "{}",
          createdAt: "2026-08-29T12:00:00.000Z"
        }
      })
      database.createBilibiliLiveDanmakuSession({
        sessionId: transportId,
        monitorId,
        roomId: "33",
        connectHost: "wss://example.test/sub",
        startedAt: "2026-08-29T12:00:01.000Z"
      })
      database.markBilibiliLiveDanmakuSessionConnected(
        transportId,
        "2026-08-29T12:00:02.000Z"
      )
      database.insertBilibiliLiveSession({
        sessionId,
        monitorId,
        uid: "22",
        roomId: "33",
        state: "OPEN",
        platformLiveTime: "2026-08-29T12:00:00.000Z",
        liveKey: "platform:2026-08-29T12:00:00.000Z",
        startedAt: "2026-08-29T12:00:00.000Z",
        startDetectedAt: "2026-08-29T12:00:00.000Z",
        startSource: "REST_STATUS",
        endSignalAt: null,
        endedAt: null,
        endDetectedAt: null,
        endSource: null,
        lastLiveObservedAt: "2026-08-29T12:00:00.000Z",
        lastObservedAt: "2026-08-29T12:00:00.000Z",
        titleAtStart: "直播标题",
        titleAtEnd: null,
        createdAt: "2026-08-29T12:00:00.000Z",
        updatedAt: "2026-08-29T12:00:00.000Z"
      })
      const event = {
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0a05",
        liveSessionId: sessionId,
        transportSessionId: transportId,
        receiptOrdinal: 1,
        monitorId,
        roomId: "33",
        eventKey: "DANMU_MSG:dm-1",
        sourceEventId: "dm-1",
        eventKind: "DANMAKU",
        command: "DANMU_MSG",
        protocolVersion: 3,
        senderUid: "99",
        senderName: "Alice",
        medalName: "测试牌",
        messageText: "hello",
        giftId: null,
        giftName: null,
        giftCount: null,
        coinType: null,
        unitPriceMilliYuan: null,
        paidAmountMilliYuan: null,
        paid: false,
        guardLevel: null,
        amountSource: null,
        occurredAt: "2026-08-29T12:00:05.000Z",
        receivedAt: "2026-08-29T12:00:05.100Z",
        rawPayloadJson: "{}",
        createdAt: "2026-08-29T12:00:05.100Z"
      }
      expect(database.insertBilibiliLiveSessionEvent(event)).toBe(true)
      expect(database.insertBilibiliLiveSessionEvent({
        ...event,
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0a06",
        receiptOrdinal: 2,
        eventKey: "DANMU_MSG:dm-1-again"
      })).toBe(false)
      expect(database.findActiveBilibiliLiveSession(monitorId)).toMatchObject({
        sessionId,
        state: "OPEN"
      })
      expect(database.findBilibiliLiveSessionEvents(sessionId, 20)).toMatchObject([{
        eventId: event.eventId,
        senderUid: "99",
        messageText: "hello"
      }])
    } finally {
      database.close()
    }
  })
})
