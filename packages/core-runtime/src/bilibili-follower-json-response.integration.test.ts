import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ControlDatabase } from "@bmd/storage"
import { describe, expect, it } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-json-response-"))
  const database = await ControlDatabase.open(directory)
  const source = new BilibiliFollowerWorkerSource(new NdjsonPythonWorkerTransport({
    pythonExecutable: process.env.BMD_PYTHON_EXE!, role: "crawler", dataDirectory: directory,
    pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_json_response") }))
  const waits: number[] = []
  const service = new BilibiliFollowerMonitorService({ database, source, idFactory: randomUUID,
    now: () => new Date("2026-10-05T00:00:00Z"), requestMinIntervalMs: 0, maxAttempts: 3,
    retryBackoffMs: 100, sleep: async value => { waits.push(value) } })
  const readRows = (table: "bilibili_api_call" | "object_artifact") => {
    const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try { return reader.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() }
    finally { reader.close() }
  }
  const calls = () => readRows("bilibili_api_call").map(row => ({ endpoint: row.endpoint_key,
    category: row.error_type, statusCode: row.status_code, attempt: row.attempt }))
  return { directory, database, source, service, waits, calls, artifacts: () => readRows("object_artifact"),
    close: async () => { await service.stop(); database.close(); await rm(directory, { recursive: true, force: true }) } }
}

describe("original follower JSON business through actual Python, NDJSON, Core and SQLite", () => {
  it.each(["220", "221"])("preserves UTF16 error %s without Worker restart", async mid => {
    const f = await fixture()
    try {
      const request = { mid, taskId: "utf16-error", leaseId: "utf16-error", attempt: 1 }
      await f.source.fetchProfile(request)
      await expect(f.source.fetchCard(request)).rejects.toMatchObject({
        code: "BILIBILI_AUTH_EXPIRED", message: mid === "220" ? "\ud800" : "\udfff",
        retryable: false, statusCode: 200, biliCode: -101, endpoint: "x/web-interface/card"
      })
      expect(await f.source.fetchProfile(request)).toEqual({ mid, nickname: "same-process-third" })
    } finally { await f.close() }
  })

  it.each(["222", "223"])("preserves ephemeral UTF16 profile %s without Worker restart", async mid => {
    const f = await fixture()
    try {
      const request = { mid, taskId: "utf16-profile", leaseId: "utf16-profile", attempt: 1 }
      await f.source.fetchProfile(request)
      expect(await f.source.fetchProfile(request)).toEqual({ mid, nickname: mid === "222" ? "\ud800" : "\udfff" })
      expect(await f.source.fetchProfile(request)).toEqual({ mid, nickname: "same-process-third" })
      expect(f.artifacts()).toEqual([])
    } finally { await f.close() }
  })

  it.each(["201", "202", "204", "209", "214"])("does not fallback or overwrite history for legitimate root %s", async mid => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid })
      const before = f.service.trend(user.id)
      const artifactsBefore = f.artifacts()
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "BILIBILI_UNKNOWN_ERROR",
        retryable: false })
      expect(f.calls()).toEqual([
        { endpoint: "x/web-interface/card", category: null, statusCode: 200, attempt: 1 },
        { endpoint: "x/web-interface/card", category: "BILIBILI_UNKNOWN_ERROR", statusCode: 200, attempt: 1 } ])
      expect(f.waits).toEqual([])
      expect(f.service.trend(user.id).points).toEqual(before.points)
      expect(f.artifacts()).toEqual(artifactsBefore)
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname,
        currentFollowerCount: 12, lastErrorType: "BILIBILI_UNKNOWN_ERROR" })
      expect(await f.source.fetchProfile({ mid, taskId: "alive", leaseId: "alive", attempt: 1 }))
        .toEqual({ mid, nickname: user.nickname })
    } finally { await f.close() }
  })

  it.each(["203", "205", "207", "208", "215", "216", "217", "224", "225"])("classifies malformed/over-limit %s once before relation fallback", async mid => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid })
      expect(await f.service.refreshNow(user.id)).toMatchObject({ success: true, followerCount: 30,
        sourceEndpoint: "x/relation/stat" })
      expect(f.calls()).toEqual([
        { endpoint: "x/web-interface/card", category: null, statusCode: 200, attempt: 1 },
        { endpoint: "x/web-interface/card", category: "BILIBILI_PARSE_ERROR", statusCode: 200, attempt: 1 },
        { endpoint: "x/relation/stat", category: null, statusCode: 200, attempt: 1 } ])
      expect(f.waits).toEqual([])
      // Original snapshots upsert one point per second; the successful refresh
      // may share the initial bucket. Failed refreshes above must not alter it.
      expect(f.service.trend(user.id).points.at(-1)?.followerCount).toBe(30)
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname,
        profileUrl: user.profileUrl, currentFollowerCount: 30 })
      expect(f.artifacts()).toHaveLength(2)
      expect(await f.source.fetchProfile({ mid, taskId: "alive", leaseId: "alive", attempt: 1 }))
        .toMatchObject({ mid })
    } finally { await f.close() }
  })

  it.each(["210", "212"])("keeps authentication category and a live worker for %s", async mid => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid })
      const before = f.service.trend(user.id)
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "BILIBILI_AUTH_EXPIRED",
        retryable: false })
      expect(f.calls()).toHaveLength(2)
      expect(f.calls()[1]).toMatchObject({ endpoint: "x/web-interface/card", category: "BILIBILI_AUTH_EXPIRED" })
      expect(f.waits).toEqual([])
      expect(f.service.trend(user.id).points).toEqual(before.points)
      expect(await f.source.fetchProfile({ mid, taskId: "alive", leaseId: "alive", attempt: 1 })).toMatchObject({ mid })
    } finally { await f.close() }
  })

  it.each(["206", "213"])("persists the accepted first object/last duplicate value %s", async mid => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid })
      expect(await f.service.refreshNow(user.id)).toMatchObject({ success: true, followerCount: 24,
        sourceEndpoint: "x/web-interface/card" })
      expect(f.calls()).toHaveLength(2)
      expect(f.calls().every(call => call.category === null)).toBe(true)
      expect(f.service.trend(user.id).points.at(-1)?.followerCount).toBe(24)
      if (mid === "206") {
        const refs = f.artifacts()
        expect(refs).toHaveLength(2)
        const bytes = await readFile(resolve(f.directory, String(refs[1]?.relative_path)))
        expect(bytes.toString("utf8")).toContain("trailing-synthetic-json")
      }
    } finally { await f.close() }
  })

  it("preserves old history when relation itself returns a legitimate array root", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "219" })
      const before = f.service.trend(user.id)
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({ code: "BILIBILI_UNKNOWN_ERROR" })
      expect(f.calls()).toHaveLength(3)
      expect(f.calls()[1]).toMatchObject({ category: "BILIBILI_PARSE_ERROR" })
      expect(f.calls()[2]).toMatchObject({ endpoint: "x/relation/stat", category: "BILIBILI_UNKNOWN_ERROR" })
      expect(f.waits).toEqual([])
      expect(f.service.trend(user.id).points).toEqual(before.points)
      expect(f.artifacts()).toHaveLength(1)
    } finally { await f.close() }
  })

  it.each([
    ["201", "BILIBILI_UNKNOWN_ERROR", -2147483648],
    ["212", "BILIBILI_AUTH_EXPIRED", -101],
    ["216", "BILIBILI_PARSE_ERROR", undefined]
  ] as const)("retains actual NDJSON source metadata and worker lifetime for %s", async (mid, category, biliCode) => {
    const f = await fixture()
    try {
      const request = { mid, taskId: "source-metadata", leaseId: "source-metadata", attempt: 1 }
      await f.source.fetchProfile(request)
      await expect(f.source.fetchCard(request)).rejects.toMatchObject({ code: category,
        retryable: false, statusCode: 200, endpoint: "x/web-interface/card",
        ...(biliCode === undefined ? {} : { biliCode }) })
      expect(await f.source.fetchProfile(request)).toMatchObject({ mid })
      expect(f.calls()).toEqual([])
      expect(f.artifacts()).toEqual([])
    } finally { await f.close() }
  })
})
