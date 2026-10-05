import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"

import { ControlDatabase, type UpsertBilibiliFollowerMonitorSnapshotInput } from "./control-database"
import { migrateFollowerSignedCounters } from "./bilibili-follower-counter-migration"

const minimum = -(1n << 63n)
const maximum = (1n << 63n) - 1n
const timestamp = "2026-10-05T00:00:00.000Z"
const artifactId = `sha256:${"a".repeat(64)}`
const monitorId = "old-follower"
const preservedTables = ["bilibili_follower_monitor", "bilibili_follower_snapshot", "object_artifact",
  "bilibili_monitored_subject", "bilibili_subject_binding", "bilibili_subject_widget_layout", "outbox",
  "follower_migration_audit"]

function exactRows(database: DatabaseSync, sql: string) {
  const statement = database.prepare(sql)
  statement.setReadBigInts(true)
  return statement.all()
}

function allPreservedRows(database: DatabaseSync) {
  return Object.fromEntries(preservedTables.map(table => [table,
    exactRows(database, `SELECT rowid, * FROM ${table} ORDER BY rowid`)]))
}

function snapshotInput(overrides: Partial<UpsertBilibiliFollowerMonitorSnapshotInput["monitor"]> = {},
  bucket = "2026-10-05T01:00:00.000Z"): UpsertBilibiliFollowerMonitorSnapshotInput {
  return {
    mode: "collect",
    monitor: { monitorId, mid: "22", nickname: "原关注用户", avatarUrl: null,
      profileUrl: "https://space.bilibili.com/22", followerCount: maximum, followingCount: minimum,
      intervalSeconds: 3600, nextCollectAt: "2026-10-05T02:00:00.000Z", capturedAt: bucket,
      sourceEndpoint: "x/web-interface/card", ...overrides },
    snapshot: { snapshotId: `snapshot-${bucket}`, capturedBucket: bucket },
    artifact: { objectId: artifactId, sha256: "a".repeat(64), relativePath: "objects/synthetic.json",
      mediaType: "application/json", sizeBytes: 2, createdAt: bucket },
    outbox: { messageId: `outbox-${bucket}`, topic: "bilibili.follower.snapshot-collected",
      envelopeJson: "{}", createdAt: bucket }
  }
}

async function createV13Fixture(directory: string, brokenReference = false, crossTableDependents = false) {
  const initial = await ControlDatabase.open(directory)
  initial.close()
  const database = new DatabaseSync(resolve(directory, "control.db"))
  try {
    database.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
    for (const table of ["bilibili_follower_monitor", "bilibili_follower_snapshot"]) {
      const ddl = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.sql
      if (typeof ddl !== "string") throw new Error(`Missing fixture table ${table}`)
      const indexes = database.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table)
      const constraints = table.endsWith("monitor")
        ? "CHECK(current_follower_count IS NULL OR current_follower_count >= 0), CHECK(following_count IS NULL OR following_count >= 0)"
        : "CHECK(follower_count >= 0), CHECK(following_count IS NULL OR following_count >= 0)"
      const constrained = ddl.includes("CHECK(following_count IS NULL OR following_count >= 0)")
        ? ddl : ddl.replace(/\)\s*$/, `, ${constraints})`)
      database.exec(constrained.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${table}_v13_fixture`))
      database.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_v13_fixture RENAME TO ${table};`)
      for (const index of indexes) database.exec(String(index.sql))
    }
    database.exec("DELETE FROM schema_migration WHERE version > 13; PRAGMA user_version=13; COMMIT;")
    database.prepare(`INSERT INTO object_artifact(object_id, sha256, relative_path, media_type, size_bytes, created_at)
      VALUES (?, ?, 'objects/synthetic.json', 'application/json', 2, ?)`).run(artifactId, "a".repeat(64), timestamp)
    const insertMonitor = database.prepare(`INSERT INTO bilibili_follower_monitor(rowid, monitor_id, mid, nickname,
      profile_url, current_follower_count, following_count, current_evidence_object_id, created_at, updated_at)
      VALUES (?, ?, ?, '原关注用户', 'https://space.bilibili.com/22', ?, ?, ?, ?, ?)`)
    insertMonitor.run(41, monitorId, "22", 9007199254740992n, 8n, artifactId, timestamp, timestamp)
    insertMonitor.run(99, "larger-follower", "23", 9007199254740993n, null, artifactId, timestamp, timestamp)
    insertMonitor.run(133, "tied-follower", "24", 9007199254740992n, 7n, artifactId, timestamp, timestamp)
    insertMonitor.run(177, "null-follower", "25", null, null, artifactId, timestamp, timestamp)
    database.prepare(`INSERT INTO bilibili_follower_snapshot(rowid, snapshot_id, monitor_id, mid, follower_count,
      following_count, captured_at, captured_bucket, source_endpoint, evidence_object_id, created_at)
      VALUES (77, 'old-snapshot', ?, '22', ?, 8, ?, ?, 'x/web-interface/card', ?, ?)`)
      .run(brokenReference ? "missing-follower" : monitorId, 9007199254740992n, timestamp, timestamp, artifactId, timestamp)
    database.prepare(`INSERT INTO bilibili_monitored_subject(subject_id, display_name, created_at, updated_at)
      VALUES ('old-subject', '原主体', ?, ?)`).run(timestamp, timestamp)
    database.prepare(`INSERT INTO bilibili_subject_binding(binding_id, subject_id, bilibili_user_monitor_id,
      mid, created_at, updated_at) VALUES ('old-binding', 'old-subject', ?, '22', ?, ?)`)
      .run(monitorId, timestamp, timestamp)
    database.prepare(`INSERT INTO bilibili_subject_widget_layout(layout_id, subject_id, widget_key, created_at, updated_at)
      VALUES ('old-layout', 'old-subject', 'bilibili-follower-live-heat', ?, ?)`).run(timestamp, timestamp)
    database.prepare(`INSERT INTO outbox(message_id, topic, envelope_json, state, created_at)
      VALUES ('old-outbox', 'seed', '{}', 'pending', ?)`).run(timestamp)
    database.exec(`CREATE TABLE follower_migration_audit(monitor_id TEXT, follower_count INTEGER);
      CREATE INDEX fixture_follower_following ON bilibili_follower_monitor(following_count);
      CREATE TRIGGER fixture_follower_update AFTER UPDATE OF current_follower_count ON bilibili_follower_monitor
      BEGIN INSERT INTO follower_migration_audit VALUES (new.monitor_id, new.current_follower_count); END;`)
    if (crossTableDependents) {
      database.exec(`CREATE TABLE follower_migration_probe(probe_id TEXT PRIMARY KEY,
        monitor_count INTEGER NOT NULL, snapshot_count INTEGER NOT NULL, note TEXT NOT NULL);
        INSERT INTO follower_migration_probe(rowid, probe_id, monitor_count, snapshot_count, note)
        VALUES (23, 'cross-table-probe', 12, 13, 'preserve external row');
        CREATE INDEX fixture_follower_probe_note ON follower_migration_probe(note);
        CREATE TRIGGER fixture_follower_probe_update
        AFTER UPDATE OF monitor_count, snapshot_count ON follower_migration_probe
        BEGIN
          UPDATE bilibili_follower_monitor SET current_follower_count=new.monitor_count
            WHERE monitor_id='old-follower';
          UPDATE bilibili_follower_snapshot SET follower_count=new.snapshot_count
            WHERE snapshot_id='old-snapshot';
        END;
        CREATE VIEW fixture_follower_view AS
        SELECT monitor.rowid AS monitor_rowid, snapshot.rowid AS snapshot_rowid,
          monitor.monitor_id, snapshot.snapshot_id, monitor.current_follower_count,
          snapshot.follower_count, monitor.following_count,
          snapshot.following_count AS snapshot_following_count
        FROM bilibili_follower_monitor AS monitor JOIN bilibili_follower_snapshot AS snapshot
          ON snapshot.monitor_id=monitor.monitor_id;`)
    }
    return {
      rows: allPreservedRows(database),
      dependents: database.prepare(`SELECT type, name, sql FROM sqlite_schema
        WHERE type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name`).all(),
      bindingDdl: database.prepare("SELECT sql FROM sqlite_schema WHERE name='bilibili_subject_binding'").get()?.sql
    }
  } finally { database.close() }
}

describe("follower signed Long64 SQLite storage", () => {
  let directory: string | undefined
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

  it("upgrades actual v13 tables preserving sparse rowids, bindings, evidence, indexes and triggers", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-migration-"))
    const before = await createV13Fixture(directory)
    const upgraded = await ControlDatabase.open(directory)
    try {
      expect(upgraded.status().schemaVersion).toBe(14)
      expect(upgraded.listBilibiliFollowerMonitors().map(row => row.monitorId))
        .toEqual(["larger-follower", monitorId, "tied-follower", "null-follower"])
    } finally { upgraded.close() }
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    try {
      expect(allPreservedRows(raw)).toEqual(before.rows)
      expect(raw.prepare(`SELECT type, name, sql FROM sqlite_schema
        WHERE type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name`).all()).toEqual(before.dependents)
      expect(raw.prepare("SELECT sql FROM sqlite_schema WHERE name='bilibili_subject_binding'").get()?.sql).toBe(before.bindingDdl)
      expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([])
      raw.exec("PRAGMA foreign_keys=ON; UPDATE bilibili_follower_monitor SET current_follower_count=-1, following_count=-2 WHERE monitor_id='old-follower'; UPDATE bilibili_follower_snapshot SET follower_count=-3, following_count=-4;")
      expect(raw.prepare("SELECT follower_count FROM follower_migration_audit").get()?.follower_count).toBe(-1)
      expect(() => raw.exec("UPDATE bilibili_follower_monitor SET mid='0' WHERE monitor_id='old-follower'")).toThrow(/CHECK/)
      expect(() => raw.exec("UPDATE bilibili_subject_binding SET mid='-1'")).toThrow(/CHECK/)
      expect(() => raw.exec("UPDATE bilibili_follower_monitor SET interval_seconds=0")).toThrow(/CHECK/)
    } finally { raw.close() }
    const reopened = await ControlDatabase.open(directory)
    try {
      expect(reopened.status().schemaVersion).toBe(14)
      expect(reopened.findBilibiliFollowerMonitorById(monitorId)?.currentFollowerCount).toBe(-1n)
    } finally { reopened.close() }
    const inspection = new DatabaseSync(resolve(directory, "control.db"))
    try { expect(inspection.prepare("SELECT COUNT(*) AS count FROM schema_migration WHERE version=14").get()?.count).toBe(1) }
    finally { inspection.close() }
  })

  it("reads full counters through all five readers while small fields remain numbers", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-read-"))
    await createV13Fixture(directory)
    const database = await ControlDatabase.open(directory)
    try {
      const expected = { currentFollowerCount: 9007199254740992n, followingCount: 8n,
        intervalSeconds: 3600, version: 1 }
      expect(database.listBilibiliFollowerMonitors()[1]).toMatchObject(expected)
      expect(database.findBilibiliFollowerMonitorById(monitorId)).toMatchObject(expected)
      expect(database.findBilibiliFollowerMonitorByMid("22")).toMatchObject(expected)
      expect(database.findBilibiliFollowerMonitorById("null-follower"))
        .toMatchObject({ currentFollowerCount: null, followingCount: null })
      expect(database.findDueBilibiliFollowerMonitors(timestamp, 10)[0]).toMatchObject(expected)
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })[0])
        .toMatchObject({ followerCount: 9007199254740992n, followingCount: 8n })
      expect(database.findBilibiliFollowerMonitorById("missing")).toBeUndefined()
      expect(database.findBilibiliFollowerMonitorByMid("999")).toBeUndefined()
      expect(database.findBilibiliSubjectBinding("old-subject")?.danmuEnabled).toBe(false)
    } finally { database.close() }
  })

  it("refreshes by monitor ID and retains original monitor MID and same-second snapshot identity", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-refresh-"))
    await createV13Fixture(directory)
    const database = await ControlDatabase.open(directory)
    const bucket = "2026-10-05T01:00:00.000Z"
    try {
      database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ mid: minimum.toString(), followerCount: minimum,
        followingCount: maximum, capturedAt: "2026-10-05T01:00:00.123456Z" }, bucket))
      expect(database.findBilibiliFollowerMonitorById(monitorId))
        .toMatchObject({ mid: "22", currentFollowerCount: minimum, followingCount: maximum })
      const first = database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 }).at(-1)!
      expect(first).toMatchObject({ mid: minimum.toString(), followerCount: minimum, followingCount: maximum })
      const second = snapshotInput({ mid: "0", followerCount: -1n, followingCount: null,
        capturedAt: "2026-10-05T01:00:00.999999Z" }, bucket)
      second.snapshot.snapshotId = "replacement-snapshot"
      second.outbox.messageId = "replacement-outbox"
      database.upsertBilibiliFollowerMonitorSnapshot(second)
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 }).at(-1))
        .toMatchObject({ snapshotId: first.snapshotId, mid: minimum.toString(), followerCount: -1n,
          followingCount: null, createdAt: first.createdAt })
      expect(database.findBilibiliFollowerMonitorById(monitorId)?.mid).toBe("22")
      database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ followerCount: 100, followingCount: 0 }, "2026-10-05T03:00:00.000Z"))
      expect(database.findBilibiliFollowerMonitorById(monitorId))
        .toMatchObject({ currentFollowerCount: 100n, followingCount: 0n })
    } finally { database.close() }
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    try {
      expect(raw.prepare("SELECT rowid FROM bilibili_follower_monitor WHERE monitor_id=?").get(monitorId)?.rowid).toBe(41)
      expect(raw.prepare("SELECT rowid FROM bilibili_follower_snapshot WHERE snapshot_id=?").get(`snapshot-${bucket}`)?.rowid).toBe(78)
      expect(raw.prepare("SELECT typeof(follower_count) AS kind FROM bilibili_follower_snapshot WHERE snapshot_id=?").get(`snapshot-${bucket}`)?.kind).toBe("integer")
      expect(exactRows(raw, "SELECT follower_count, following_count FROM bilibili_follower_snapshot WHERE snapshot_id='old-snapshot'"))
        .toEqual([{ follower_count: 9007199254740992n, following_count: 8n }])
    } finally { raw.close() }
  })

  it("rejects unsafe numbers and out-of-range counters without persisting partial writes", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-invalid-"))
    await createV13Fixture(directory)
    const database = await ControlDatabase.open(directory)
    try {
      for (const count of [9007199254740992, -9007199254740992, 1.5, NaN, Infinity, maximum + 1n, minimum - 1n]) {
        expect(() => database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ followerCount: count, followingCount: 0 })))
          .toThrow(/safe integer|signed 64-bit/)
        expect(() => database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ followingCount: count })))
          .toThrow(/safe integer|signed 64-bit/)
      }
      for (const mid of ["0", "-1", (maximum + 1n).toString()]) {
        const input = snapshotInput({ monitorId: "new-monitor", mid, followerCount: 1, followingCount: null })
        input.mode = "add"
        expect(() => database.upsertBilibiliFollowerMonitorSnapshot(input)).toThrow(/positive signed 64-bit|CHECK/)
      }
      for (const mid of [(maximum + 1n).toString(), (minimum - 1n).toString()]) {
        expect(() => database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ mid }))).toThrow(/signed 64-bit/)
      }
      const binding = database.findBilibiliSubjectBinding("old-subject")!
      expect(() => database.upsertBilibiliSubjectBinding({ ...binding, mid: (maximum + 1n).toString() }))
        .toThrow(/positive signed 64-bit/)
      expect(database.findBilibiliFollowerMonitorById(monitorId)?.currentFollowerCount).toBe(9007199254740992n)
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })).toHaveLength(1)
      expect(database.listPendingOutbox()).toHaveLength(1)
    } finally { database.close() }
  })

  it("rolls back the complete migration when an existing foreign key is broken", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-rollback-"))
    const before = await createV13Fixture(directory, true)
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    const schema = raw.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all()
    raw.close()
    let unexpected: ControlDatabase | undefined
    try {
      await expect((async () => { unexpected = await ControlDatabase.open(directory!); })())
        .rejects.toThrow(/foreign-key integrity/)
    } finally { unexpected?.close() }
    const inspection = new DatabaseSync(resolve(directory, "control.db"))
    try {
      inspection.exec("PRAGMA foreign_keys=ON;")
      expect(() => migrateFollowerSignedCounters(inspection)).toThrow(/foreign-key integrity/)
      expect(inspection.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1)
      expect(inspection.prepare("PRAGMA user_version").get()?.user_version).toBe(13)
      expect(inspection.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all()).toEqual(schema)
      expect(allPreservedRows(inspection)).toEqual(before.rows)
      expect(inspection.prepare("SELECT version FROM schema_migration WHERE version=14").all()).toEqual([])
      expect(() => inspection.exec("UPDATE bilibili_follower_monitor SET current_follower_count=-1")).toThrow(/CHECK/)
    } finally { inspection.close() }
  })

  it("rolls back measurement, evidence, history and trigger effects when outbox persistence fails", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-outbox-"))
    await createV13Fixture(directory)
    const database = await ControlDatabase.open(directory)
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    try {
      const before = allPreservedRows(raw)
      const input = snapshotInput({ mid: "-1" })
      input.outbox.messageId = "old-outbox"
      input.artifact = { ...input.artifact, objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64) }
      expect(() => database.upsertBilibiliFollowerMonitorSnapshot(input)).toThrow(/UNIQUE/)
      expect(allPreservedRows(raw)).toEqual(before)
    } finally { raw.close(); database.close() }
  })

  it("retains snapshot cascade and binding SET NULL after the parent table rebuild", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-delete-"))
    await createV13Fixture(directory)
    const database = await ControlDatabase.open(directory)
    try {
      database.deleteBilibiliFollowerMonitor(monitorId, { messageId: "deleted", topic: "deleted",
        envelopeJson: "{}", createdAt: timestamp })
      expect(database.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })).toEqual([])
      expect(database.findBilibiliSubjectBinding("old-subject"))
        .toMatchObject({ bilibiliUserMonitorId: null, mid: "22" })
      expect(database.findBilibiliSubjectLayouts("old-subject", true)).toHaveLength(1)
      expect(() => database.upsertBilibiliFollowerMonitorSnapshot(snapshotInput({ mid: "-1" })))
        .toThrow("Cannot collect a deleted follower monitor")
      expect(database.listPendingOutbox()).toHaveLength(2)
    } finally { database.close() }
  })

  it("opens a real v13 database with cross-table triggers and a dependent view", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-dependent-open-"))
    const before = await createV13Fixture(directory, false, true)
    const database = await ControlDatabase.open(directory)
    try {
      expect(database.status().schemaVersion).toBe(14)
      expect(database.findBilibiliFollowerMonitorById(monitorId)?.currentFollowerCount).toBe(9007199254740992n)
    } finally { database.close() }
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    try {
      expect(allPreservedRows(raw)).toEqual(before.rows)
      expect(exactRows(raw, "SELECT monitor_rowid, snapshot_rowid, current_follower_count, follower_count FROM fixture_follower_view"))
        .toEqual([{ monitor_rowid: 41n, snapshot_rowid: 77n,
          current_follower_count: 9007199254740992n, follower_count: 9007199254740992n }])
      expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    } finally { raw.close() }
  })

  const connectionSettings = [
    { foreignKeys: 0, legacyAlterTable: 0 },
    { foreignKeys: 0, legacyAlterTable: 1 },
    { foreignKeys: 1, legacyAlterTable: 0 },
    { foreignKeys: 1, legacyAlterTable: 1 }
  ]

  it.each(connectionSettings)("preserves dependent SQL and restores FK=$foreignKeys / legacy=$legacyAlterTable after success",
    async ({ foreignKeys, legacyAlterTable }) => {
      directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-dependent-success-"))
      const before = await createV13Fixture(directory, false, true)
      const raw = new DatabaseSync(resolve(directory, "control.db"))
      try {
        raw.exec(`PRAGMA foreign_keys=${foreignKeys}; PRAGMA legacy_alter_table=${legacyAlterTable};`)
        const dependentSql = raw.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
          WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL ORDER BY type, name`).all()
        const probeRows = exactRows(raw, "SELECT rowid, * FROM follower_migration_probe ORDER BY rowid")
        migrateFollowerSignedCounters(raw)
        expect(raw.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(foreignKeys)
        expect(raw.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table).toBe(legacyAlterTable)
        expect(raw.prepare("PRAGMA user_version").get()?.user_version).toBe(14)
        expect(allPreservedRows(raw)).toEqual(before.rows)
        expect(exactRows(raw, "SELECT rowid, * FROM follower_migration_probe ORDER BY rowid")).toEqual(probeRows)
        expect(raw.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
          WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL ORDER BY type, name`).all()).toEqual(dependentSql)
        expect(raw.prepare("SELECT sql FROM sqlite_schema WHERE name='bilibili_subject_binding'").get()?.sql).toBe(before.bindingDdl)
        expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        raw.prepare(`UPDATE follower_migration_probe SET monitor_count=?, snapshot_count=?
          WHERE probe_id='cross-table-probe'`).run(minimum, maximum)
        expect(exactRows(raw, "SELECT monitor_rowid, snapshot_rowid, current_follower_count, follower_count FROM fixture_follower_view"))
          .toEqual([{ monitor_rowid: 41n, snapshot_rowid: 77n, current_follower_count: minimum, follower_count: maximum }])
        expect(exactRows(raw, "SELECT monitor_id, follower_count FROM follower_migration_audit"))
          .toEqual([{ monitor_id: monitorId, follower_count: minimum }])
        expect(exactRows(raw, "SELECT rowid FROM follower_migration_probe")).toEqual([{ rowid: 23n }])
        raw.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; DELETE FROM bilibili_follower_monitor WHERE monitor_id='old-follower';")
        expect(raw.prepare("SELECT snapshot_id FROM bilibili_follower_snapshot").all()).toEqual([])
        expect(raw.prepare("SELECT bilibili_user_monitor_id FROM bilibili_subject_binding").get()?.bilibili_user_monitor_id).toBeNull()
        raw.exec("ROLLBACK;")
        expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([])
      } finally { raw.close() }
      const reopened = await ControlDatabase.open(directory)
      try {
        expect(reopened.status().schemaVersion).toBe(14)
        expect(reopened.findBilibiliFollowerMonitorById(monitorId)?.currentFollowerCount).toBe(minimum)
        expect(reopened.findBilibiliFollowerSnapshots(monitorId, { limit: 30 })[0]?.followerCount).toBe(maximum)
      } finally { reopened.close() }
      const inspection = new DatabaseSync(resolve(directory, "control.db"))
      try {
        expect(inspection.prepare("SELECT COUNT(*) AS count FROM schema_migration WHERE version=14").get()?.count).toBe(1)
        expect(exactRows(inspection, "SELECT monitor_rowid, snapshot_rowid, current_follower_count, follower_count FROM fixture_follower_view"))
          .toEqual([{ monitor_rowid: 41n, snapshot_rowid: 77n, current_follower_count: minimum, follower_count: maximum }])
      } finally { inspection.close() }
    })

  it.each(connectionSettings)("rolls back dependent schemas and restores FK=$foreignKeys / legacy=$legacyAlterTable after failure",
    async ({ foreignKeys, legacyAlterTable }) => {
      directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-dependent-rollback-"))
      const before = await createV13Fixture(directory, true, true)
      const raw = new DatabaseSync(resolve(directory, "control.db"))
      try {
        raw.exec(`PRAGMA foreign_keys=${foreignKeys}; PRAGMA legacy_alter_table=${legacyAlterTable};`)
        const schema = raw.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all()
        const migrationRows = exactRows(raw, "SELECT rowid, * FROM schema_migration ORDER BY version")
        const probeRows = exactRows(raw, "SELECT rowid, * FROM follower_migration_probe ORDER BY rowid")
        expect(() => migrateFollowerSignedCounters(raw)).toThrow(/foreign-key integrity/)
        expect(raw.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(foreignKeys)
        expect(raw.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table).toBe(legacyAlterTable)
        expect(raw.prepare("PRAGMA user_version").get()?.user_version).toBe(13)
        expect(raw.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all()).toEqual(schema)
        expect(allPreservedRows(raw)).toEqual(before.rows)
        expect(exactRows(raw, "SELECT rowid, * FROM schema_migration ORDER BY version")).toEqual(migrationRows)
        expect(exactRows(raw, "SELECT rowid, * FROM follower_migration_probe ORDER BY rowid")).toEqual(probeRows)
        expect(raw.prepare("PRAGMA foreign_key_check").all()).toHaveLength(1)
        expect(() => raw.exec("UPDATE bilibili_follower_monitor SET current_follower_count=-1")).toThrow(/CHECK/)
        expect(() => raw.exec("UPDATE bilibili_follower_snapshot SET follower_count=-1")).toThrow(/CHECK/)
      } finally { raw.close() }
      const reopened = new DatabaseSync(resolve(directory, "control.db"))
      try {
        expect(reopened.prepare("PRAGMA user_version").get()?.user_version).toBe(13)
        expect(allPreservedRows(reopened)).toEqual(before.rows)
        expect(reopened.prepare("SELECT version FROM schema_migration WHERE version=14").all()).toEqual([])
      } finally { reopened.close() }
    })

  it.each(connectionSettings)("preserves a caller transaction and restores FK=$foreignKeys / legacy=$legacyAlterTable if BEGIN fails",
    async ({ foreignKeys, legacyAlterTable }) => {
      directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-long-dependent-begin-"))
      await createV13Fixture(directory, false, true)
      const raw = new DatabaseSync(resolve(directory, "control.db"))
      try {
        raw.exec(`PRAGMA foreign_keys=${foreignKeys}; PRAGMA legacy_alter_table=${legacyAlterTable};
          BEGIN IMMEDIATE; UPDATE follower_migration_probe SET note='caller transaction';`)
        const schema = raw.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all()
        const rows = allPreservedRows(raw)
        expect(() => migrateFollowerSignedCounters(raw)).toThrow(/transaction/)
        expect(raw.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(foreignKeys)
        expect(raw.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table).toBe(legacyAlterTable)
        expect(raw.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all()).toEqual(schema)
        expect(allPreservedRows(raw)).toEqual(rows)
        expect(raw.prepare("PRAGMA user_version").get()?.user_version).toBe(13)
        raw.exec("COMMIT;")
        expect(raw.prepare("SELECT note FROM follower_migration_probe").get()?.note).toBe("caller transaction")
      } finally { raw.close() }
    })
})
