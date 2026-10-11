import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, relative, resolve } from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { ControlDatabase } from "./control-database"

function assertRetentionTempPath(root: string, target?: string): void {
  if (!isAbsolute(root) || !/^D:/iu.test(resolve(root))) throw new Error("Unsafe retention temporary path")
  if (target === undefined) return
  const suffix = relative(resolve(root), resolve(target))
  if (!isAbsolute(target) || !/^D:/iu.test(resolve(target)) || !suffix || suffix.startsWith("..") || isAbsolute(suffix)) {
    throw new Error("Unsafe retention temporary path")
  }
}

type RetentionDatabase = { close: () => void }
type RetentionStorageOwner<T extends RetentionDatabase> = {
  readonly root: string; directory: string | undefined; database: T | undefined; disposed: boolean
  cleanupPromise: Promise<void> | undefined; cleanupErrors: unknown[]
}
const retentionStorageOwner = <T extends RetentionDatabase>(root: string): RetentionStorageOwner<T> => ({
  root, directory: undefined, database: undefined, disposed: false, cleanupPromise: undefined, cleanupErrors: []
})
type RetentionStorageOperations<T extends RetentionDatabase> = {
  create: () => Promise<string>; open: (directory: string) => Promise<T>; remove: (directory: string) => Promise<void>
}
async function releaseRetentionStorage<T extends RetentionDatabase>(root: string, database: T | undefined, directory: string | undefined,
  remove: RetentionStorageOperations<T>["remove"], errors: unknown[]): Promise<void> {
  try { database?.close() } catch (error) { errors.push(error) }
  if (directory) {
    try { assertRetentionTempPath(root, directory); await remove(directory) } catch (error) { errors.push(error) }
  }
}
function disposeRetentionStorage<T extends RetentionDatabase>(owner: RetentionStorageOwner<T>, remove: RetentionStorageOperations<T>["remove"]): Promise<void> {
  if (owner.cleanupPromise) return owner.cleanupPromise
  owner.disposed = true
  const database = owner.database, directory = owner.directory
  owner.database = undefined; owner.directory = undefined
  owner.cleanupPromise = releaseRetentionStorage(owner.root, database, directory, remove, owner.cleanupErrors)
  return owner.cleanupPromise
}
function throwRetentionStorageErrors(errors: unknown[]): void {
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, "Retention storage test and cleanup failed")
}
async function teardownRetentionStorage<T extends RetentionDatabase>(owner: RetentionStorageOwner<T>, remove: RetentionStorageOperations<T>["remove"]): Promise<void> {
  await disposeRetentionStorage(owner, remove)
  throwRetentionStorageErrors(owner.cleanupErrors)
}
async function runRetentionStorage<T extends RetentionDatabase>(owner: RetentionStorageOwner<T>, operations: RetentionStorageOperations<T>,
  body: (database: T, directory: string) => Promise<void>): Promise<void> {
  const errors: unknown[] = []
  let directory: string | undefined, opening = false, acquiredAfterTeardown = false
  try {
    assertRetentionTempPath(owner.root)
    directory = await operations.create()
    if (owner.disposed) {
      acquiredAfterTeardown = true
      await disposeRetentionStorage(owner, operations.remove)
      await releaseRetentionStorage(owner.root, undefined, directory, operations.remove, errors)
    } else {
      owner.directory = directory
      assertRetentionTempPath(owner.root, directory)
      opening = true
      const database = await operations.open(directory)
      opening = false
      if (owner.disposed) {
        acquiredAfterTeardown = true
        await disposeRetentionStorage(owner, operations.remove)
        await releaseRetentionStorage(owner.root, database, directory, operations.remove, errors)
      } else {
        owner.database = database
        await body(database, directory)
      }
    }
  } catch (error) { errors.push(error) }
  if (owner.disposed && opening) {
    await disposeRetentionStorage(owner, operations.remove)
    await releaseRetentionStorage(owner.root, undefined, directory, operations.remove, errors)
  }
  await disposeRetentionStorage(owner, operations.remove)
  errors.push(...owner.cleanupErrors)
  if (acquiredAfterTeardown && errors.length === 0) errors.push(new Error("Retention storage acquired after teardown"))
  throwRetentionStorageErrors(errors)
}

describe("retention storage lifecycle fault injection without filesystem access", () => {
  it("tears down the owned directory during deferred open, disposes late DB and recreated directory, and leaves the next owner intact", async () => {
    const owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root"), next = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root")
    const calls: string[] = [], nextDatabase = { close: () => { calls.push("next-close") } }
    next.directory = "D:/synthetic-root/next"; next.database = nextDatabase
    let release = (_database: RetentionDatabase) => {}, ready = () => {}, entered = false
    const deferred = new Promise<RetentionDatabase>(resolve => { release = resolve })
    const opened = new Promise<void>(resolve => { ready = resolve })
    const operations: RetentionStorageOperations<RetentionDatabase> = {
      create: async () => "D:/synthetic-root/own", open: async () => { ready(); return deferred },
      remove: async directory => { expect(owner.directory).toBeUndefined(); calls.push(`remove:${directory}`) }
    }
    const running = runRetentionStorage(owner, operations, async () => { entered = true }).catch((caught: unknown) => caught)
    try {
      await opened
      await teardownRetentionStorage(owner, operations.remove)
      expect(calls).toEqual(["remove:D:/synthetic-root/own"])
      expect(owner.directory).toBeUndefined()
    } finally { release({ close: () => { expect(owner.database).toBeUndefined(); calls.push("late-close") } }); await running }
    expect(entered).toBe(false)
    expect(calls).toEqual(["remove:D:/synthetic-root/own", "late-close", "remove:D:/synthetic-root/own"])
    await teardownRetentionStorage(owner, operations.remove)
    expect(calls).toHaveLength(3)
    expect(next.directory).toBe("D:/synthetic-root/next")
    expect(next.database).toBe(nextDatabase)
  })
  it("cleans the acquired directory after setup rejection and preserves the single original error", async () => {
    const failure = new Error("setup"), calls: string[] = [], owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root")
    const error = await runRetentionStorage(owner, {
      create: async () => "D:/synthetic-root/own", open: async () => { throw failure },
      remove: async path => { expect(owner.directory).toBeUndefined(); calls.push(path) }
    }, async () => {}).catch((caught: unknown) => caught)
    expect(error).toBe(failure)
    expect(calls).toEqual(["D:/synthetic-root/own"])
  })
  it("attempts close and guarded removal after body failure and exposes every original error identity", async () => {
    const primary = new Error("body"), close = new Error("close"), remove = new Error("remove"), calls: string[] = []
    const owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root")
    const error = await runRetentionStorage(owner, {
      create: async () => "D:/synthetic-root/own", open: async () => ({ close: () => { expect(owner.database).toBeUndefined(); calls.push("close"); throw close } }),
      remove: async () => { calls.push("remove"); throw remove }
    }, async () => { throw primary }).catch((caught: unknown) => caught)
    expect(calls).toEqual(["close", "remove"])
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected all storage cleanup errors")
    expect(error.errors).toHaveLength(3)
    expect(error.errors[0]).toBe(primary); expect(error.errors[1]).toBe(close); expect(error.errors[2]).toBe(remove)
  })
  it.each(["close", "remove"] as const)("keeps a sole %s error by identity while attempting both cleanup actions", async phase => {
    const failure = new Error(phase), calls: string[] = [], owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root")
    const error = await runRetentionStorage(owner, {
      create: async () => "D:/synthetic-root/own", open: async () => ({ close: () => { calls.push("close"); if (phase === "close") throw failure } }),
      remove: async () => { calls.push("remove"); if (phase === "remove") throw failure }
    }, async () => {}).catch((caught: unknown) => caught)
    expect(error).toBe(failure)
    expect(calls).toEqual(["close", "remove"])
  })
  it("cleans a directory created after teardown without opening a DB or entering the body", async () => {
    const owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root"), calls: string[] = []
    let release = (_directory: string) => {}, entered = false
    const deferred = new Promise<string>(resolve => { release = resolve })
    const operations = { create: () => deferred, open: async () => { calls.push("open"); return { close: () => {} } },
      remove: async (directory: string) => { calls.push(`remove:${directory}`) } }
    const running = runRetentionStorage(owner, operations, async () => { entered = true }).catch((caught: unknown) => caught)
    await teardownRetentionStorage(owner, operations.remove)
    release("D:/synthetic-root/late")
    const error = await running
    expect(error).toMatchObject({ message: "Retention storage acquired after teardown" })
    expect(calls).toEqual(["remove:D:/synthetic-root/late"])
    expect(owner.directory).toBeUndefined(); expect(owner.database).toBeUndefined(); expect(entered).toBe(false)
  })
  it.each(["return", "reject"] as const)("attempts repeated guarded cleanup after late open %s and preserves late error identities", async mode => {
    const owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root"), calls: string[] = []
    const open = new Error("late open"), close = new Error("late close"), remove = new Error("late remove")
    let release = (_database: RetentionDatabase) => {}, reject = (_error: Error) => {}, ready = () => {}, removals = 0, entered = false
    const deferred = new Promise<RetentionDatabase>((resolve, rejectPromise) => { release = resolve; reject = rejectPromise })
    const started = new Promise<void>(resolve => { ready = resolve })
    const operations: RetentionStorageOperations<RetentionDatabase> = { create: async () => "D:/synthetic-root/late",
      open: async () => { ready(); return deferred }, remove: async () => { calls.push("remove"); if (++removals === 2) throw remove } }
    const running = runRetentionStorage(owner, operations, async () => { entered = true }).catch((caught: unknown) => caught)
    await started
    await teardownRetentionStorage(owner, operations.remove)
    if (mode === "return") release({ close: () => { calls.push("close"); throw close } })
    else reject(open)
    const error = await running
    expect(entered).toBe(false)
    expect(calls).toEqual(mode === "return" ? ["remove", "close", "remove"] : ["remove", "remove"])
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected late acquisition cleanup evidence")
    expect(error.errors).toHaveLength(2)
    expect(error.errors[0]).toBe(mode === "return" ? close : open)
    expect(error.errors[1]).toBe(remove)
    expect(owner.directory).toBeUndefined(); expect(owner.database).toBeUndefined()
  })
  it.each(["return", "reject"] as const)("does not let an earlier teardown remove error block late open %s cleanup", async mode => {
    const owner = retentionStorageOwner<RetentionDatabase>("D:/synthetic-root"), calls: string[] = []
    const firstRemove = new Error("fallback remove"), open = new Error("late open")
    let release = (_database: RetentionDatabase) => {}, reject = (_error: Error) => {}, ready = () => {}, removals = 0
    const deferred = new Promise<RetentionDatabase>((resolve, rejectPromise) => { release = resolve; reject = rejectPromise })
    const started = new Promise<void>(resolve => { ready = resolve })
    const operations: RetentionStorageOperations<RetentionDatabase> = { create: async () => "D:/synthetic-root/late",
      open: async () => { ready(); return deferred }, remove: async () => { calls.push("remove"); if (++removals === 1) throw firstRemove } }
    const running = runRetentionStorage(owner, operations, async () => { throw new Error("Ended case must not enter body") }).catch((caught: unknown) => caught)
    await started
    expect(await teardownRetentionStorage(owner, operations.remove).catch((caught: unknown) => caught)).toBe(firstRemove)
    if (mode === "return") release({ close: () => { calls.push("close") } })
    else reject(open)
    const error = await running
    expect(calls).toEqual(mode === "return" ? ["remove", "close", "remove"] : ["remove", "remove"])
    if (mode === "return") expect(error).toBe(firstRemove)
    else {
      expect(error).toBeInstanceOf(AggregateError)
      if (!(error instanceof AggregateError)) throw new Error("Expected setup plus teardown errors")
      expect(error.errors).toHaveLength(2); expect(error.errors[0]).toBe(open); expect(error.errors[1]).toBe(firstRemove)
    }
  })
})

describe("retention temporary path validation without filesystem access", () => {
  it.each([["C:/synthetic-temp", undefined], ["relative-temp", undefined],
    ["D:/synthetic-temp", "D:/synthetic-temp"], ["D:/synthetic-temp", "D:/outside"],
    ["D:/synthetic-temp", "D:/synthetic-temp/../outside"], ["D:/synthetic-temp", "C:/synthetic-temp/child"]] as const)
    ("rejects unsafe root %s or target %s", (root, target) => {
      expect(() => assertRetentionTempPath(root, target)).toThrow("Unsafe retention temporary path")
    })
  it("allows only an absolute D root and its strict descendant", () => {
    expect(() => assertRetentionTempPath("D:/synthetic-temp")).not.toThrow()
    expect(() => assertRetentionTempPath("D:/synthetic-temp", "D:/synthetic-temp/child")).not.toThrow()
  })
})

describe("ControlDatabase recent retention", () => {
  let activeOwner: RetentionStorageOwner<ControlDatabase> | undefined
  const removeRetentionDirectory = async (directory: string) => { await rm(directory, { recursive: true, force: true }) }
  afterEach(async () => {
    const owner = activeOwner
    activeOwner = undefined
    if (owner) await teardownRetentionStorage(owner, removeRetentionDirectory)
  })

  it("retains more than 500 recent rows per monitor with insertion-order ties, event-time trim and a separate read cap", async () => {
    const temporaryRoot = tmpdir()
    assertRetentionTempPath(temporaryRoot)
    const owner = retentionStorageOwner<ControlDatabase>(temporaryRoot)
    activeOwner = owner
    await runRetentionStorage(owner, { create: () => mkdtemp(resolve(temporaryRoot, "bmd-recent-retention-")),
      open: directory => ControlDatabase.open(directory), remove: removeRetentionDirectory }, async (database, retentionDirectory) => {
      const store = database
      const timestamp = new Date().toISOString()
      const seed = (roomId: string) => {
        const monitorId = randomUUID()
        store.applyBilibiliLiveRoomSnapshot({
          monitor: { monitorId, uid: roomId, roomId, shortId: null, uname: "合成保留主播", faceUrl: null,
            title: "合成保留房间", coverUrl: null, keyframeUrl: null, areaId: null, areaName: null,
            parentAreaId: null, parentAreaName: null, liveStatus: 1, liveTime: null, onlineCount: 0,
            attentionCount: 0, intervalSeconds: 300, nextCollectAt: timestamp, capturedAt: timestamp,
            sourceEndpoint: "room/v1/Room/get_info" },
          snapshot: { snapshotId: randomUUID(), capturedBucket: timestamp },
          artifact: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), relativePath: "cas/synthetic-retention.json",
            sizeBytes: 1, mediaType: "application/json", createdAt: timestamp },
          outbox: { messageId: randomUUID(), topic: "seed", envelopeJson: "{}", createdAt: timestamp }
        })
        return monitorId
      }
      const a = seed("801"), b = seed("802")
      const append = (monitorId: string, index: number, recentLimit: number, sentAt = timestamp) => store.recordBilibiliLiveDanmakuEvent({
        monitorId, sessionId: null, roomId: monitorId === a ? "801" : "802", occurredAt: sentAt,
        bucketSeconds: 60, danmuDelta: 1, likeCount: null, likeIncrement: 0, watchedCount: null,
        heartbeatPopularity: null, giftDelta: 0, superChatDelta: 0, rawEventDelta: 1,
        recent: { senderUid: "123", messageText: `message:${index}`, displayName: null, medalName: null, sentAt }, recentLimit
      })
      const originalPrepare = DatabaseSync.prototype.prepare
      let pruneStatement: StatementSync | undefined
      const pruneObserver = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
        const statement = originalPrepare.call(this, sql)
        if (sql.trim().startsWith("DELETE FROM bilibili_live_danmaku_recent") && !pruneStatement) pruneStatement = statement
        return statement
      })
      try { for (let i = 1; i <= 502; i++) append(a, i, 501) }
      finally { pruneObserver.mockRestore() }
      for (let i = 1; i <= 27; i++) append(b, i, 25)
      append(b, 0, 25, new Date(Date.parse(timestamp) - 1000).toISOString())
      const inspection = new DatabaseSync(resolve(retentionDirectory, "control.db"), { readOnly: true })
      try {
        if (!pruneStatement) throw new Error("No production retention delete was observed")
        // The delete must address only overflow rows, not rescan every retained UUID.
        const plan = inspection.prepare(`EXPLAIN QUERY PLAN ${pruneStatement.expandedSQL}`).all()
        expect(plan.filter(row => row.parent === 0).map(row => row.detail))
          .toContain("SEARCH bilibili_live_danmaku_recent USING INTEGER PRIMARY KEY (rowid=?)")
        const rows = (monitorId: string) => inspection.prepare("SELECT message_text FROM bilibili_live_danmaku_recent WHERE monitor_id = ? ORDER BY sent_at, rowid").all(monitorId).map(row => row.message_text)
        expect(rows(a)).toEqual(Array.from({ length: 501 }, (_, i) => `message:${i + 2}`))
        expect(rows(b)).toEqual(Array.from({ length: 25 }, (_, i) => `message:${i + 3}`))
        expect(database.findBilibiliLiveDanmakuRecent(a, 999)).toHaveLength(200)
        expect(database.findBilibiliLiveDanmakuRecent(a, 999)[0]?.messageText).toBe("message:303")
        expect(database.findBilibiliLiveDanmakuRecent(b, 200).map(row => row.messageText)).toEqual(rows(b))
        append(b, 28, 0)
        expect(rows(b)).toEqual(["message:28"]) // Repository's own defensive floor is 1, distinct from the service floor 20.
        expect(rows(a)).toHaveLength(501)
        append(b, 29, -1)
        expect(rows(b)).toEqual(["message:29"])
        expect(database.findBilibiliLiveDanmakuMetricBuckets(a, new Date(Date.parse(timestamp) - 60_000).toISOString(), new Date(Date.parse(timestamp) + 60_000).toISOString(), 200).reduce((sum, row) => sum + row.danmuCount, 0)).toBe(502)
      } finally { inspection.close() }
    })
  })
})

describe("ControlDatabase", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("creates the WAL control database and applies signed follower counter schema version 14", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-control-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    try {
      expect(database.status()).toEqual({
        databasePath: resolve(testDirectory, "control.db"),
        journalMode: "wal",
        schemaVersion: 18
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
        ALTER TABLE bilibili_api_call DROP COLUMN request_meta_json;
        ALTER TABLE bilibili_api_call DROP COLUMN response_meta_json;
        DELETE FROM schema_migration WHERE version >= 9;
        PRAGMA user_version = 8;
      `)
    } finally {
      raw.close()
    }

    const upgraded = await ControlDatabase.open(testDirectory)
    try {
      expect(upgraded.status().schemaVersion).toBe(18)
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
    let database = await ControlDatabase.open(testDirectory)
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
        currentFollowerCount: 1_395_836n,
        followingCount: 423n,
        monitorStatus: "ACTIVE",
        intervalSeconds: 3600,
        sourceEndpoint: "x/web-interface/card"
      }])
      expect(store.findBilibiliFollowerSnapshots(
        "018f0f39-7b5e-7cc1-962d-9a208b3d0200",
        { limit: 30 }
      )).toMatchObject([{
        followerCount: 1_395_836n,
        followingCount: 423n,
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
      const taskId = "018f0f39-7b5e-7cc1-962d-9a208b3d0204"
      const before = database.listBilibiliApiCalls(taskId)
      database.close()
      // Restore the published v15 API-call layout, then upgrade a populated
      // database. Unknown legacy metadata must not be fabricated.
      const legacy = new DatabaseSync(resolve(testDirectory, "control.db"))
      try {
        legacy.exec(`BEGIN;
          ALTER TABLE bilibili_api_call DROP COLUMN request_meta_json;
          ALTER TABLE bilibili_api_call DROP COLUMN response_meta_json;
          DELETE FROM schema_migration WHERE version>=16;
          PRAGMA user_version=15;
          COMMIT;`)
      } finally { legacy.close() }
      database = await ControlDatabase.open(testDirectory)
      expect(database.status().schemaVersion).toBe(18)
      expect(database.listBilibiliApiCalls(taskId)).toEqual(before)
      expect(database.listBilibiliFollowerMonitors(100)[0]?.currentFollowerCount).toBe(1_395_836n)
      database.insertBilibiliApiCall({ ...before[0]!, callId: "metadata-call", attempt: 2,
        mid: "9007199254740993", errorType: "BILIBILI_AUTH_EXPIRED", evidenceObjectId: null,
        requestMeta: { mid: "9007199254740993" },
        responseMeta: { success: false, message: "  合成登录过期  ", biliCode: -101 } })
      const after = database.listBilibiliApiCalls(taskId)
      expect(after[1]).toMatchObject({ requestMeta: { mid: "9007199254740993" },
        responseMeta: { success: false, message: "  合成登录过期  ", biliCode: -101 } })
      database.insertBilibiliApiCall({ ...after[1]!, callId: "encoded-metadata-call",
        responseMeta: { success: false, message: "\ud800🙂\\u0000", biliCode: -101 } })
      const encodedCalls = database.listBilibiliApiCalls(taskId)
      expect.soft(encodedCalls.find(call => call.callId === "encoded-metadata-call")?.responseMeta)
        .toEqual({ success: false, message: "?🙂\\u0000", biliCode: -101 })
      const invalidArtifact = { objectId: `sha256:${"c".repeat(64)}`, sha256: "c".repeat(64),
        relativePath: "cas/synthetic-invalid-api-meta.json", sizeBytes: 1,
        mediaType: "application/json", createdAt: "2026-08-29T12:00:00.123Z" }
      expect.soft(() => database.insertBilibiliApiCall({ ...after[1]!, callId: "invalid-metadata-call",
        evidenceObjectId: invalidArtifact.objectId,
        responseMeta: { success: false, message: "synthetic\u0000failure", biliCode: -101 } }, invalidArtifact))
        .toThrow("Bilibili API log JSON storage contains NUL.")
      expect.soft(database.listBilibiliApiCalls(taskId)).toEqual(encodedCalls)
      const inspection = new DatabaseSync(resolve(testDirectory, "control.db"), { readOnly: true })
      try { expect.soft(inspection.prepare("SELECT COUNT(*) AS total FROM object_artifact WHERE object_id = ?")
        .get(invalidArtifact.objectId)?.total).toBe(0) }
      finally { inspection.close() }
      database.close()
      database = await ControlDatabase.open(testDirectory)
      expect(database.listBilibiliApiCalls(taskId)).toEqual(encodedCalls)
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
        onlineCount: 200n
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
      expect(snapshots[0]).toMatchObject({ totalCount: "3", pageNo: 1 })
      expect(store.findBilibiliLiveRankEntries(String(snapshots[0]?.snapshotId), 50)).toMatchObject([{
        userUid: null,
        displayName: "匿名观众",
        score: "120"
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
