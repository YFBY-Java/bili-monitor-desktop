import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { ControlDatabase, type UpsertBilibiliFollowerMonitorSnapshotInput } from "./control-database"
import { followerStoredNickname } from "./follower-profile-storage-text"

describe("follower nickname VARCHAR(160) storage text", () => {
  it("maps each isolated UTF16 unit before nickname length handling", () => {
    expect(followerStoredNickname("\ud800x\udfff\ud800\ud800\udfff")).toBe("?x??\ud800\udfff")
    expect(followerStoredNickname(`${"a".repeat(159)}\ud800  `)).toBe(`${"a".repeat(159)}?`)
  })

  it("preserves paired emoji, literal replacement characters, question marks and spaces", () => {
    const value = "  😀\ufffd? text  "
    expect(followerStoredNickname(value)).toBe(value)
  })

  it("rejects NUL before nickname length or overflowing ASCII-space handling", () => {
    for (const value of ["private\0text", `${"a".repeat(160)}  \0`, `${"a".repeat(161)}\0`]) {
      expect(() => followerStoredNickname(value)).toThrowError(new Error("Follower storage text contains NUL."))
    }
  })

  it.each([
    ["empty text", ""],
    ["short text with surrounding spaces", "  name  "],
    ["160 ASCII characters", "a".repeat(160)],
    ["exactly 160 characters with leading and trailing spaces", ` ${"a".repeat(158)} `],
    ["160 supplementary Unicode code points", "😀".repeat(160)]
  ])("preserves %s", (_label, value) => {
    expect(followerStoredNickname(value)).toBe(value)
  })

  it.each([
    ["one overflowing ASCII space", `${"a".repeat(160)} `, "a".repeat(160)],
    ["overflowing spaces after emoji", `${"😀".repeat(160)}   `, "😀".repeat(160)],
    ["spaces within the retained 160 characters", `${"a".repeat(159)}    `, `${"a".repeat(159)} `]
  ])("truncates only %s", (_label, value, expected) => {
    expect(followerStoredNickname(value)).toBe(expected)
  })

  it.each([
    ["161 ASCII characters", "a".repeat(161)],
    ["161 Chinese characters", "中".repeat(161)],
    ["161 supplementary Unicode code points", "😀".repeat(161)],
    ["an overflowing tab", `${"a".repeat(160)}\t`],
    ["an overflowing nonbreaking space", `${"a".repeat(160)}\u00a0`],
    ["a nonspace after overflowing ASCII spaces", `${"a".repeat(160)}  z`]
  ])("rejects %s without exposing the value", (_label, value) => {
    expect(() => followerStoredNickname(value)).toThrowError(new Error("Follower nickname exceeds VARCHAR(160)."))
  })
})

const timestamp = "2026-10-07T00:00:00.000Z"
const monitorId = "direct-text-monitor"

function input(): UpsertBilibiliFollowerMonitorSnapshotInput {
  return {
    mode: "add",
    monitor: { monitorId, mid: "15", nickname: "ordinary", avatarUrl: null,
      profileUrl: "https://space.bilibili.com/15", followerCount: 21n, followingCount: 2n,
      intervalSeconds: 3600, nextCollectAt: "2026-10-07T01:00:00.000Z", capturedAt: timestamp,
      sourceEndpoint: "x/web-interface/card" },
    snapshot: { snapshotId: "direct-text-snapshot", capturedBucket: timestamp },
    artifact: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
      relativePath: "objects/synthetic.json", mediaType: "application/json", sizeBytes: 2, createdAt: timestamp },
    outbox: { messageId: "direct-text-added", topic: "bilibili.follower.snapshot-collected",
      envelopeJson: "{}", createdAt: timestamp }
  }
}

function storedRows(directory: string) {
  const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    return Object.fromEntries(["bilibili_follower_monitor", "bilibili_follower_snapshot", "object_artifact", "outbox"]
      .map(table => {
        const statement = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        statement.setReadBigInts(true)
        return [table, statement.all()]
      }))
  } finally { reader.close() }
}

async function removeOwnedFixture(directory: string) {
  const target = resolve(directory)
  if (!/^D:\\/i.test(target) || dirname(target) !== resolve(tmpdir())
    || !basename(target).startsWith("bmd-follower-direct-text-")) {
    throw new Error("Unexpected follower direct text fixture cleanup path.")
  }
  await rm(target, { recursive: true, force: true })
}

describe("Follower direct Repository TEXT fields in actual SQLite", () => {
  it("stores field encoding and atomically rolls back a new artifact on NUL, including reopen", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-direct-text-"))
    let database = await ControlDatabase.open(directory)
    try {
      const seed = input()
      seed.monitor.nickname = "  \ud800😀\ufffd?  "
      seed.monitor.avatarUrl = "//example.invalid/\udfff😀"
      seed.monitor.profileUrl = "https://example.invalid/\ud800😀"
      database.upsertBilibiliFollowerMonitorSnapshot(seed)
      expect(seed.monitor).toMatchObject({ nickname: "  \ud800😀\ufffd?  ",
        avatarUrl: "//example.invalid/\udfff😀", profileUrl: "https://example.invalid/\ud800😀" })
      expect(database.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        nickname: "  ?😀\ufffd?  ", avatarUrl: "//example.invalid/?😀", profileUrl: "https://example.invalid/?😀",
        currentFollowerCount: 21n, followingCount: 2n, version: 1,
        lastSnapshotAt: timestamp, lastSuccessAt: timestamp, nextCollectAt: seed.monitor.nextCollectAt })
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })).toHaveLength(1)
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })[0]).toMatchObject({
        followerCount: 21n, followingCount: 2n, evidenceObjectId: seed.artifact.objectId })
      expect(database.listPendingOutbox()).toHaveLength(1)
      const before = storedRows(directory)
      const rejected = input()
      rejected.mode = "collect"
      rejected.artifact = { ...rejected.artifact, objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64) }
      rejected.monitor.avatarUrl = "private\0avatar"
      rejected.monitor.followerCount = 999n
      rejected.outbox.messageId = "must-rollback"
      expect(() => database.upsertBilibiliFollowerMonitorSnapshot(rejected))
        .toThrowError(new Error("Follower storage text contains NUL."))
      expect(storedRows(directory)).toEqual(before)
      database.close()
      database = await ControlDatabase.open(directory)
      expect(database.status().schemaVersion).toBe(18)
      expect(storedRows(directory)).toEqual(before)
    } finally { database.close(); await removeOwnedFixture(directory) }
  })

  it("checks the Repository error field after UTF16 slice900 and rolls back retained NUL", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-direct-text-"))
    let database = await ControlDatabase.open(directory)
    try {
      database.upsertBilibiliFollowerMonitorSnapshot(input())
      expect(database.findBilibiliFollowerMonitorById(monitorId)?.avatarUrl).toBeNull()
      const failure = (errorMessage: string, messageId: string) => ({ monitorId, errorMessage,
        nextCollectAt: "2026-10-07T02:00:00.000Z", errorAt: "2026-10-07T01:00:00.000Z",
        errorType: "SYNTHETIC", outbox: { messageId, topic: "bilibili.follower.failed",
          envelopeJson: JSON.stringify({ errorMessage }), createdAt: timestamp } })
      const split = failure(`${"a".repeat(899)}😀`, "split-emoji")
      database.markBilibiliFollowerMonitorFailure(split)
      expect(database.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        lastErrorMessage: `${"a".repeat(899)}?`, version: 2, nextCollectAt: split.nextCollectAt })
      expect(database.listPendingOutbox().at(-1)?.envelopeJson).toBe(split.outbox.envelopeJson)
      const beyond = failure(`${"b".repeat(900)}\0`, "nul-beyond-cut")
      database.markBilibiliFollowerMonitorFailure(beyond)
      expect(database.findBilibiliFollowerMonitorById(monitorId)).toMatchObject({
        lastErrorMessage: "b".repeat(900), version: 3 })
      expect(database.listPendingOutbox()).toHaveLength(3)
      const before = storedRows(directory)
      expect(() => database.markBilibiliFollowerMonitorFailure(failure("private\0failure", "must-rollback")))
        .toThrowError(new Error("Follower storage text contains NUL."))
      expect(storedRows(directory)).toEqual(before)
      database.close()
      database = await ControlDatabase.open(directory)
      expect(storedRows(directory)).toEqual(before)
    } finally { database.close(); await removeOwnedFixture(directory) }
  })
})
