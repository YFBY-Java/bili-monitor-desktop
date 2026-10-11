import { randomUUID } from "node:crypto"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { ControlDatabase } from "@bmd/storage"
import { describe, expect, it } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

function reverseOrderedUuidFactory() {
  let sequence = 0
  return () => `00000000-0000-4000-8000-${(0xffffffffffff - sequence++).toString(16).padStart(12, "0")}`
}

async function fixture(idFactory: () => string = randomUUID) {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-profile-text-"))
  let database = await ControlDatabase.open(directory)
  const source = new BilibiliFollowerWorkerSource(new NdjsonPythonWorkerTransport({
    pythonExecutable: process.env.BMD_PYTHON_EXE!, role: "crawler", dataDirectory: directory,
    pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_profile_text") }))
  const service = new BilibiliFollowerMonitorService({ database, source, idFactory,
    now: () => new Date("2026-10-05T00:00:00Z"), requestMinIntervalMs: 0 })
  const apiCalls = () => {
    const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try { return reader.prepare("SELECT endpoint_key AS endpoint, error_type AS errorType FROM bilibili_api_call ORDER BY rowid").all() }
    finally { reader.close() }
  }
  const detailedApiCalls = () => {
    const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try {
      return reader.prepare("SELECT task_id AS taskId FROM bilibili_api_call GROUP BY task_id ORDER BY MIN(rowid)").all()
        .flatMap(row => database.listBilibiliApiCalls(String(row.taskId)))
    } finally { reader.close() }
  }
  const storedRows = (tables: string[]) => {
    const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try {
      return Object.fromEntries(tables.map(table => {
        const statement = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        statement.setReadBigInts(true)
        return [table, statement.all()]
      }))
    } finally { reader.close() }
  }
  const businessRows = () => storedRows(["bilibili_follower_monitor", "bilibili_follower_snapshot", "outbox"])
  const artifactRows = () => storedRows(["object_artifact"]).object_artifact!
  return { directory, database, source, service, apiCalls, detailedApiCalls, businessRows, artifactRows,
    reopenProjection: async () => {
      await service.stop()
      database.close()
      database = await ControlDatabase.open(directory)
      return new BilibiliFollowerMonitorService({ database, source, idFactory: randomUUID,
        now: () => new Date("2026-10-05T00:00:00Z"), requestMinIntervalMs: 0 })
    },
    close: async () => {
      try { await service.stop() }
      finally {
        database.close()
        const target = resolve(directory)
        if (!/^D:\\/i.test(target) || dirname(target) !== resolve(tmpdir())
          || !basename(target).startsWith("bmd-follower-profile-text-")) {
          throw new Error("Unexpected follower profile text fixture cleanup path.")
        }
        await rm(target, { recursive: true, force: true })
      }
    } }
}

describe("original follower profile through actual Python, NDJSON, Core and SQLite", () => {
  it("rejects actual card NUL at local storage while retaining the successful API log and raw CAS", async () => {
    const f = await fixture(reverseOrderedUuidFactory())
    try {
      const user = await f.service.addUser({ mid: "15" })
      const before = f.businessRows()
      const callsBefore = f.detailedApiCalls()
      const artifactsBefore = f.artifactRows()
      const seedBytes = await Promise.all(artifactsBefore.map(row => readFile(resolve(f.directory, String(row.relative_path)))))
      await expect(f.service.refreshNow(user.id)).rejects.toThrowError(new Error("Follower storage text contains NUL."))
      expect(f.businessRows()).toEqual(before)
      expect(f.apiCalls()).toEqual([{ endpoint: "x/web-interface/card", errorType: null },
        { endpoint: "x/web-interface/card", errorType: null }])
      const calls = f.detailedApiCalls()
      expect(calls).toHaveLength(callsBefore.length + 1)
      expect(calls.slice(0, callsBefore.length)).toEqual(callsBefore)
      expect(calls[1]).toMatchObject({ attempt: 1, statusCode: 200, errorType: null, retryable: false,
        responseMeta: { success: true, sourceEndpoint: "x/web-interface/card" } })
      const artifacts = f.artifactRows()
      expect(artifacts).toHaveLength(artifactsBefore.length + 1)
      expect(artifacts.slice(0, artifactsBefore.length)).toEqual(artifactsBefore)
      expect(calls[1]?.evidenceObjectId).toBe(artifacts[1]?.object_id)
      const rawBytes = await readFile(resolve(f.directory, String(artifacts[1]?.relative_path)))
      expect(rawBytes.toString("utf8")).toContain("private\\u0000nickname")
      expect(await Promise.all(artifactsBefore.map(row => readFile(resolve(f.directory, String(row.relative_path))))))
        .toEqual(seedBytes)
      const restarted = await f.reopenProjection()
      try {
        expect(f.businessRows()).toEqual(before)
        expect(f.detailedApiCalls()).toEqual(calls)
        expect(f.artifactRows()).toEqual(artifacts)
        expect(await readFile(resolve(f.directory, String(artifacts[1]?.relative_path)))).toEqual(rawBytes)
      } finally { await restarted.stop() }
    } finally { await f.close() }
  })

  it("retains JDK20 numeric profile and error text across a failed refresh and SQLite reopen", async () => {
    const f = await fixture(reverseOrderedUuidFactory())
    try {
      const user = await f.service.addUser({ mid: "14" })
      const profile = { nickname: "1.0E7", avatarUrl: "-0.0", currentFollowerCount: 21 }
      expect(user).toMatchObject(profile)
      expect(f.database.findBilibiliFollowerMonitorById(user.id)).toMatchObject({
        ...profile, currentFollowerCount: 21n })
      const before = f.service.trend(user.id)
      expect(before.user).toMatchObject(profile)
      await expect(f.service.refreshNow(user.id)).rejects.toMatchObject({
        code: "BILIBILI_AUTH_EXPIRED", message: "BILIBILI_AUTH_EXPIRED: 1.0E-4", retryable: false })
      const failedProfile = { ...profile, lastErrorType: "BILIBILI_AUTH_EXPIRED", lastErrorMessage: "1.0E-4" }
      expect(f.service.listUsers().items[0]).toMatchObject(failedProfile)
      expect(f.service.trend(user.id).points).toEqual(before.points)
      expect(f.apiCalls()).toEqual([{ endpoint: "x/web-interface/card", errorType: null },
        { endpoint: "x/web-interface/card", errorType: "BILIBILI_AUTH_EXPIRED" }])
      const calls = f.detailedApiCalls()
      expect(calls).toHaveLength(2)
      expect(calls[1]).toMatchObject({ attempt: 1, statusCode: 200, retryable: false,
        responseMeta: { success: false, biliCode: -101, message: "1.0E-4" } })
      const restarted = await f.reopenProjection()
      try {
        expect(restarted.listUsers().items[0]).toMatchObject(failedProfile)
        expect(restarted.trend(user.id).user).toMatchObject(failedProfile)
        expect(restarted.trend(user.id).points).toEqual(before.points)
        expect(f.detailedApiCalls()).toEqual(calls)
      } finally { await restarted.stop() }
    } finally { await f.close() }
  })

  it.each([
    ["2", "  合成昵称\t ", "//example.invalid/synthetic.jpg"],
    ["3", "\u00a0", "//example.invalid/synthetic.jpg"],
    ["4", "🌸".repeat(160), "//example.invalid/synthetic.jpg"],
    ["8", "  初始昵称  ", "not-a-url"],
    ["9", "false", "false"],
    ["10", "12", "//example.invalid/synthetic.jpg"]
  ])("stores %s without stripping original name/avatar", async (mid, nickname, avatarUrl) => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: mid! })
      expect(user).toMatchObject({ nickname, avatarUrl })
      expect(f.database.findBilibiliFollowerMonitorById(user.id)).toMatchObject({ nickname, avatarUrl })
      expect(f.service.trend(user.id).user).toMatchObject({ nickname, avatarUrl })
      expect(f.apiCalls()).toEqual([{ endpoint: "x/web-interface/card", errorType: null }])
    } finally { await f.close() }
  })

  it("returns an over-160 ephemeral profile without evidence or monitoring writes", async () => {
    const f = await fixture()
    try {
      expect(await f.source.fetchProfile({ mid: "5", taskId: "t", leaseId: "l", attempt: 1 }))
        .toEqual({ mid: "5", nickname: "名".repeat(161) })
      expect(f.service.listUsers().items).toEqual([])
      expect(f.apiCalls()).toEqual([])
      await expect(access(resolve(f.directory, "cas"))).rejects.toMatchObject({ code: "ENOENT" })
    } finally { await f.close() }
  })

  it("applies VARCHAR(160) only when storing, with the original excess-space exception", async () => {
    const f = await fixture()
    try {
      expect(await f.source.fetchProfile({ mid: "6", taskId: "t", leaseId: "l", attempt: 1 }))
        .toMatchObject({ nickname: "名".repeat(160) + "   " })
      expect(await f.service.addUser({ mid: "6" })).toMatchObject({ nickname: "名".repeat(160) })
    } finally { await f.close() }
  })

  it("does not trim the follower service's display-name result", async () => {
    const f = await fixture()
    try { expect(await f.service.resolveDisplayName("2")).toBe("  合成昵称\t ") }
    finally { await f.close() }
  })

  it("keeps raw profile values after closing and reopening SQLite", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "2" })
      const restarted = await f.reopenProjection()
      try {
        expect(restarted.listUsers().items[0]).toMatchObject({ nickname: "  合成昵称\t ",
          avatarUrl: "//example.invalid/synthetic.jpg", profileUrl: user.profileUrl })
        expect(restarted.trend(user.id).user.nickname).toBe("  合成昵称\t ")
      } finally { await restarted.stop() }
    } finally { await f.close() }
  })

  it("replaces card profile verbatim and clears an absent avatar", async () => {
    const f = await fixture()
    try {
      const changed = await f.service.addUser({ mid: "11" })
      await f.service.refreshNow(changed.id)
      expect(f.service.listUsers().items.find(user => user.id === changed.id)).toMatchObject({
        nickname: "  更新昵称  ", avatarUrl: "  https://example.invalid/new.jpg  " })
      const removedAvatar = await f.service.addUser({ mid: "7" })
      await f.service.refreshNow(removedAvatar.id)
      expect(f.database.findBilibiliFollowerMonitorById(removedAvatar.id)?.avatarUrl).toBeNull()
      expect(f.service.trend(removedAvatar.id).user.avatarUrl).toBeUndefined()
    } finally { await f.close() }
  })

  it("keeps all three stored profile fields when missing name falls back to relation", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "12" })
      expect(await f.service.refreshNow(user.id)).toMatchObject({ success: true,
        followerCount: 30, sourceEndpoint: "x/relation/stat" })
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname,
        avatarUrl: user.avatarUrl, profileUrl: user.profileUrl })
      expect(f.apiCalls()).toEqual([{ endpoint: "x/web-interface/card", errorType: null },
        { endpoint: "x/web-interface/card", errorType: "BILIBILI_PARSE_ERROR" },
        { endpoint: "x/relation/stat", errorType: null }])
    } finally { await f.close() }
  })

  it("ignores profile attributes supplied by an injected relation source", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "12" })
      const relation = f.source.fetchRelationStat.bind(f.source)
      f.source.fetchRelationStat = async request => ({ ...await relation(request),
        nickname: "unexpected nickname", avatarUrl: "unexpected avatar", profileUrl: "https://example.invalid/unexpected" })
      await f.service.refreshNow(user.id)
      expect(f.service.listUsers().items[0]).toMatchObject({ nickname: user.nickname,
        avatarUrl: user.avatarUrl, profileUrl: user.profileUrl, currentFollowerCount: 30 })
    } finally { await f.close() }
  })

  it("does not reinterpret a local overlong-name write as a remote failure/fallback", async () => {
    const f = await fixture()
    try {
      const user = await f.service.addUser({ mid: "13" })
      const before = f.service.trend(user.id)
      const outbox = f.database.listPendingOutbox()
      await expect(f.service.refreshNow(user.id)).rejects.toThrow("Follower nickname exceeds VARCHAR(160).")
      expect(f.service.trend(user.id)).toEqual(before)
      expect(f.database.listPendingOutbox()).toEqual(outbox)
      expect(f.apiCalls()).toEqual([{ endpoint: "x/web-interface/card", errorType: null },
        { endpoint: "x/web-interface/card", errorType: null }])
    } finally { await f.close() }
  })
})
