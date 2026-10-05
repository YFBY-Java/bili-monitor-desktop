import { randomUUID } from "node:crypto"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { ControlDatabase } from "@bmd/storage"
import { describe, expect, it } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

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
  return { directory, database, source, waits, service, close: async () => {
    await service.stop(); database.close(); await rm(directory, { recursive: true, force: true })
  } }
}

describe("actual follower HTTP errors through Python, Core and SQLite", () => {
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
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code })
      const newCalls = apiCalls(f.directory, f.database).filter(call => !callsBefore.some(old => old.callId === call.callId))
      expect(newCalls).toMatchObject([{ endpointKey: "x/web-interface/card", attempt: 1,
        errorType: code, retryable, statusCode, evidenceObjectId: null }])
      expect(newCalls).toHaveLength(1)
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
})
