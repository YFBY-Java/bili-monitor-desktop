import { randomUUID } from "node:crypto"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { ControlDatabase } from "@bmd/storage"
import { describe, expect, it } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"
import { CoreApplicationError } from "./account-subject-service"

const pythonPath = resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_error_response")

function apiCalls(directory: string, database: ControlDatabase) {
  const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    const tasks = reader.prepare("SELECT DISTINCT task_id AS taskId FROM bilibili_api_call").all()
    return tasks.flatMap(row => database.listBilibiliApiCalls(String(row.taskId)))
  } finally { reader.close() }
}

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-error-response-"))
  const database = await ControlDatabase.open(directory)
  const transport = new NdjsonPythonWorkerTransport({ pythonExecutable: process.env.BMD_PYTHON_EXE!,
    pythonPath, dataDirectory: directory, role: "crawler" })
  const source = new BilibiliFollowerWorkerSource(transport)
  const waits: number[] = []
  const service = new BilibiliFollowerMonitorService({ database, source,
    now: () => new Date("2026-10-05T00:00:00Z"), idFactory: randomUUID,
    requestMinIntervalMs: 0, maxAttempts: 3, retryBackoffMs: 100, jitter: () => 0,
    sleep: async value => { waits.push(value) } })
  return { directory, database, source, waits, service, close: async (databaseClosed = false) => {
    await service.stop(); if (!databaseClosed) database.close(); await rm(directory, { recursive: true, force: true })
  } }
}

describe("actual follower HTTP errors through Python, Core and SQLite", () => {
  it("preserves original raw snapshot rejection commits while subject creation rolls back as a whole", async () => {
    const f = await fixture()
    let databaseClosed = false
    const reader = new DatabaseSync(resolve(f.directory, "control.db"))
    const unavailable = async () => { throw new CoreApplicationError("BILIBILI_LIVE_UNAVAILABLE", "synthetic unavailable") }
    const live = new BilibiliLiveMonitorService({ database: f.database,
      now: () => new Date("2026-10-07T00:00:00Z"), idFactory: randomUUID,
      requestMinIntervalMs: 0, source: { fetchRoomInit: unavailable, fetchRoomInfo: unavailable,
        fetchRoomInfoOld: unavailable, fetchStatusByUids: unavailable } })
    const subjects = new BilibiliSubjectService({ database: f.database, followers: f.service, live,
      now: () => new Date("2026-10-07T00:00:00Z"), idFactory: randomUUID,
      liveDanmaku: { status: () => { throw new Error("not used") }, recent: () => [] } })
    const counts = () => ["bilibili_follower_monitor", "bilibili_follower_snapshot", "bilibili_api_call",
      "bilibili_monitored_subject", "bilibili_subject_binding", "bilibili_subject_widget_layout",
      "object_artifact", "outbox"].map(table => reader.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n)
    try {
      const user = await f.service.addUserV2({ mid: "70" })
      const history = f.service.trendV2(user.id).points
      const callsBefore = apiCalls(f.directory, f.database)
      await expect.soft(f.service.refreshNowV2(user.id)).rejects.toThrow("Bilibili follower snapshot JSONB input rejected: NUL.")
      expect.soft(f.service.listUsersV2().items.find(item => item.id === user.id))
        .toMatchObject({ nickname: "raw-json-50", currentFollowerCount: "50", monitorStatus: "ACTIVE" })
      expect.soft(f.service.trendV2(user.id).points).toStrictEqual(history)
      expect(f.database.findBilibiliFollowerMonitorById(user.id)?.lastErrorType).toBeNull()
      const call = apiCalls(f.directory, f.database).filter(item => !callsBefore.some(old => old.callId === item.callId))
      expect(call).toHaveLength(1)
      expect(call[0]).toMatchObject({ attempt: 1, endpointKey: "x/web-interface/card", errorType: null,
        responseMeta: { success: true, sourceEndpoint: "x/web-interface/card" } })
      const artifact = reader.prepare("SELECT relative_path AS path FROM object_artifact WHERE object_id = ?")
        .get(call[0]!.evidenceObjectId)
      expect(await readFile(resolve(f.directory, String(artifact?.path)), "utf8")).toContain('"unused":"\\u0000"')
      expect(f.waits).toEqual([])
      await expect.soft(f.service.addUserV2({ mid: "71" })).rejects.toThrow("Bilibili follower snapshot JSONB input rejected: NUL.")
      const partial = f.database.findBilibiliFollowerMonitorByMid("71")!
      expect.soft(partial).toMatchObject({ nickname: "raw-json-50", currentFollowerCount: 50n })
      expect.soft(f.database.findBilibiliFollowerSnapshots(partial.monitorId, { limit: 30 })).toEqual([])

      const beforeSubject = counts()
      await expect.soft(subjects.create({ mid: "72" })).rejects.toThrow("Bilibili follower snapshot JSONB input rejected: NUL.")
      expect.soft(counts()).toEqual(beforeSubject)
      expect(f.database.findBilibiliFollowerMonitorByMid("72")).toBeUndefined()
      expect(await f.service.refreshNowV2(user.id)).toMatchObject({ success: true, followerCount: "60" })
      expect(f.service.trendV2(user.id).points.at(-1)?.followerCount).toBe("60")
      const persistedHistory = f.service.trendV2(user.id).points
      const version = f.database.findBilibiliFollowerMonitorById(user.id)!.version
      const beforeSqlFailure = apiCalls(f.directory, f.database).length
      reader.exec(`CREATE TRIGGER reject_follower_snapshot BEFORE INSERT ON bilibili_follower_snapshot
        BEGIN SELECT RAISE(ABORT, 'synthetic snapshot SQL failure'); END;`)
      await expect(f.service.refreshNowV2(user.id)).rejects.toThrow("synthetic snapshot SQL failure")
      expect(f.database.findBilibiliFollowerMonitorById(user.id)?.version).toBe(version + 1)
      expect(f.service.trendV2(user.id).points).toStrictEqual(persistedHistory)
      expect(apiCalls(f.directory, f.database)).toHaveLength(beforeSqlFailure + 1)
      reader.exec("DROP TRIGGER reject_follower_snapshot")
      const monitorEvents = reader.prepare("SELECT COUNT(*) AS n FROM outbox WHERE topic = 'bilibili.follower.monitor-refreshed.v2'").get()?.n
      expect(monitorEvents).toBe(5)
      expect(f.waits).toEqual([])
      await f.service.stop()
      f.database.close()
      databaseClosed = true
      const reopened = await ControlDatabase.open(f.directory)
      try {
        expect(reopened.findBilibiliFollowerMonitorByMid("71")).toMatchObject({ currentFollowerCount: 50n })
        expect(reopened.findBilibiliFollowerSnapshots(partial.monitorId, { limit: 30 })).toEqual([])
        expect(reopened.findBilibiliFollowerMonitorByMid("72")).toBeUndefined()
        expect(reopened.findBilibiliFollowerSnapshots(user.id, { limit: 30 }).at(-1)?.followerCount).toBe(60n)
      } finally { reopened.close() }
    } finally { await live.stop(); reader.close(); await f.close(databaseClosed) }
  })

  it("preserves converted code, original message and endpoint in the NDJSON error", async () => {
    const f = await fixture()
    try {
      await expect(f.source.fetchCard({ mid: "50", taskId: "t", leaseId: "l", attempt: 1 }))
        .rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL", message: "  合成风控  ",
          retryable: false, biliCode: -352, statusCode: 200, endpoint: "x/web-interface/card" })
      await expect(access(resolve(f.directory, "cas"))).rejects.toMatchObject({ code: "ENOENT" })
    } finally { await f.close() }
  })

  it.each([
    ["2", "BILIBILI_UNKNOWN_ERROR", true, 200],
    ["3", "BILIBILI_AUTH_EXPIRED", false, 200],
    ["5", "BILIBILI_UNKNOWN_ERROR", false, 403]
  ] as const)("records %s without retry/fallback or replacing history", async (mid, code, retryable, statusCode) => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid })
      const before = f.service.trend(user.id)
      const callsBefore = apiCalls(f.directory, f.database)
      expect(callsBefore[0]).toMatchObject({ requestMeta: { mid },
        responseMeta: { success: true, sourceEndpoint: "x/web-interface/card" } })
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code })
      const newCalls = apiCalls(f.directory, f.database).filter(call => !callsBefore.some(old => old.callId === call.callId))
      expect(newCalls).toMatchObject([{ endpointKey: "x/web-interface/card", attempt: 1,
        errorType: code, retryable, statusCode, evidenceObjectId: null }])
      expect(newCalls).toHaveLength(1)
      if (mid === "3") expect(newCalls[0]).toMatchObject({ requestMeta: { mid },
        responseMeta: { success: false, message: "合成登录过期", biliCode: -101 } })
      expect(f.waits).toEqual([])
      expect(f.service.trend(user.id).points).toEqual(before.points)
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname,
        currentFollowerCount: 20, lastSuccessAt: user.lastSuccessAt, lastErrorType: code })
    } finally { await f.close() }
  })

  it("retries an actual HTTP503 three times then uses relation without replacing profile", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "4" })
      const before = apiCalls(f.directory, f.database)
      const monitorBefore = f.database.findBilibiliFollowerMonitorById(user.id)
      const historyBefore = f.service.trend(user.id)
      // Invalid headers fail before Spring's status handler, even for HTTP503
      // or a zero-byte body. They are not platform failures or retry triggers.
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
      expect(apiCalls(f.directory, f.database)).toEqual(before)
      expect(f.waits).toEqual([])
      expect(f.database.findBilibiliFollowerMonitorById(user.id)).toEqual(monitorBefore)
      expect(f.service.trend(user.id)).toEqual(historyBefore)
      // The stateful HTTP boundary returns this only to the same live Worker;
      // a restarted Worker would replay the initial successful card instead.
      expect(await f.service.refreshNow(user.id)).toMatchObject({ success: true,
        sourceEndpoint: "x/relation/stat", followerCount: 30 })
      const calls = apiCalls(f.directory, f.database).filter(call => !before.some(old => old.callId === call.callId))
      expect(calls).toHaveLength(4)
      expect(calls.filter(call => call.errorType)).toMatchObject([1, 2, 3].map(attempt => ({
        attempt, endpointKey: "x/web-interface/card", errorType: "BILIBILI_SERVER_ERROR", retryable: true, statusCode: 503 })))
      expect(calls.find(call => call.errorType === null)).toMatchObject({ endpointKey: "x/relation/stat", attempt: 1 })
      expect(f.waits).toEqual([100, 200])
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname, profileUrl: user.profileUrl,
        currentFollowerCount: 30 })
      expect(f.service.listUsers().items[0]?.lastErrorType).toBeUndefined()
    } finally { await f.close() }
  })

  it("encodes failure metadata and propagates its real JSONB rejection without platform retry or monitor mutation", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "60" })
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "BILIBILI_AUTH_EXPIRED" })
      const before = apiCalls(f.directory, f.database)
      expect.soft(before.find(call => call.errorType === "BILIBILI_AUTH_EXPIRED")?.responseMeta)
        .toEqual({ success: false, message: "?🙂\\u0000", biliCode: -101 })
      const monitorBefore = f.database.findBilibiliFollowerMonitorById(user.id)
      const historyBefore = f.service.trend(user.id)
      await expect.soft(f.service.refreshNow(user.id)).rejects.toThrow("Bilibili API log JSON storage contains NUL.")
      expect.soft(apiCalls(f.directory, f.database)).toEqual(before)
      expect(f.waits).toEqual([])
      expect(f.database.findBilibiliFollowerMonitorById(user.id)).toEqual(monitorBefore)
      expect(f.service.trend(user.id)).toEqual(historyBefore)
    } finally { await f.close() }
  })
})
