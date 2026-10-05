import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { ControlDatabase } from "./control-database"
import { migrateLiveSignedCounters } from "./bilibili-live-counter-migration"

describe("v13 original signed live counters", () => {
  it("rolls back rebuilt tables and version when foreign-key validation fails", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-counter-rollback-"))
    const database = new DatabaseSync(resolve(directory, "control.db"))
    try {
      database.exec(`
        PRAGMA foreign_keys=OFF;
        CREATE TABLE schema_migration(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migration VALUES (12, '2026-09-13T00:00:00Z');
        PRAGMA user_version=12;
        CREATE TABLE bilibili_live_room_monitor (
          monitor_id TEXT PRIMARY KEY, online_count INTEGER, attention_count INTEGER,
          CHECK(online_count IS NULL OR online_count >= 0),
          CHECK(attention_count IS NULL OR attention_count >= 0));
        CREATE TABLE bilibili_live_room_snapshot (
          snapshot_id TEXT PRIMARY KEY, monitor_id TEXT REFERENCES bilibili_live_room_monitor(monitor_id),
          online_count INTEGER, attention_count INTEGER,
          CHECK(online_count IS NULL OR online_count >= 0),
          CHECK(attention_count IS NULL OR attention_count >= 0));
        INSERT INTO bilibili_live_room_monitor VALUES ('kept-room', 7, 8);
        INSERT INTO bilibili_live_room_snapshot VALUES ('broken-reference', 'missing-room', 9, 10);
        PRAGMA foreign_keys=ON;
      `)
      const schemaBefore = database.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all()
      expect(() => migrateLiveSignedCounters(database)).toThrow(/foreign-key integrity/)
      expect(database.prepare("PRAGMA user_version").get()?.user_version).toBe(12)
      expect(database.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1)
      expect(database.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all()).toEqual(schemaBefore)
      expect(database.prepare("SELECT version FROM schema_migration ORDER BY version").all()).toEqual([{ version: 12 }])
      expect(database.prepare("SELECT online_count FROM bilibili_live_room_monitor").get()?.online_count).toBe(7)
      expect(database.prepare("SELECT online_count FROM bilibili_live_room_snapshot").get()?.online_count).toBe(9)
      expect(() => database.exec("UPDATE bilibili_live_room_monitor SET online_count=-1")).toThrow(/CHECK/)
      expect(() => database.exec("UPDATE bilibili_live_room_snapshot SET attention_count=-2")).toThrow(/CHECK/)
    } finally {
      database.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("upgrades real v12 constraints preserving sparse rowids, evidence, indexes and referencing rows", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-counter-migration-"))
    const initial = await ControlDatabase.open(directory)
    initial.close()
    const path = resolve(directory, "control.db")
    const artifactId = `sha256:${"a".repeat(64)}`
    const raw = new DatabaseSync(path)
    try {
      // Reconstruct only the published v12 constraints; retain every actual column and index.
      raw.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
      for (const table of ["bilibili_live_room_monitor", "bilibili_live_room_snapshot"]) {
        const ddl = String(raw.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)!.sql)
        const indexes = raw.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table)
        const constrained = ddl.includes("CHECK(online_count IS NULL OR online_count >= 0)") ? ddl : ddl.replace(/\)\s*$/, `,
          CHECK(online_count IS NULL OR online_count >= 0), CHECK(attention_count IS NULL OR attention_count >= 0))`)
        raw.exec(constrained.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${table}_v12_fixture`))
        raw.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_v12_fixture RENAME TO ${table};`)
        for (const index of indexes) raw.exec(String(index.sql))
      }
      raw.exec(`DELETE FROM schema_migration WHERE version>=13; PRAGMA user_version=12; COMMIT; PRAGMA foreign_keys=ON;
        INSERT INTO object_artifact(object_id, relative_path, media_type, size_bytes, sha256, created_at)
        VALUES ('${artifactId}', 'objects/synthetic.json', 'application/json', 2, '${"a".repeat(64)}', '2026-09-13T00:00:00Z');
        INSERT INTO bilibili_live_room_monitor(rowid, monitor_id, uid, room_id, uname, live_status, online_count, attention_count,
          current_evidence_object_id, created_at, updated_at)
        VALUES (41, 'old-room', '118', '218', '原房间资料', 1, 7, 8, '${artifactId}', '2026-09-13T00:00:00Z', '2026-09-13T00:00:00Z');
        INSERT INTO bilibili_live_room_snapshot(rowid, snapshot_id, monitor_id, uid, room_id, live_status, online_count,
          attention_count, source_endpoint, captured_at, captured_bucket, evidence_object_id, created_at)
        VALUES (77, 'old-snapshot', 'old-room', '118', '218', 1, 7, 8, 'room/v1/Room/get_info',
          '2026-09-13T00:00:00Z', '2026-09-13T00:00:00Z', '${artifactId}', '2026-09-13T00:00:00Z');
        INSERT INTO bilibili_live_status_event(event_id, monitor_id, uid, room_id, event_type, occurred_at)
        VALUES ('old-event', 'old-room', '118', '218', 'LIVE_STARTED', '2026-09-13T00:00:00Z');
        INSERT INTO bilibili_live_danmaku_recent(recent_id, monitor_id, room_id, message_text, sent_at, created_at)
        VALUES ('old-danmaku', 'old-room', '218', '原弹幕', '2026-09-13T00:00:00Z', '2026-09-13T00:00:00Z');`)
      expect(() => raw.exec("UPDATE bilibili_live_room_monitor SET online_count=-1")).toThrow(/CHECK/)
      expect(() => raw.exec("UPDATE bilibili_live_room_snapshot SET attention_count=-2")).toThrow(/CHECK/)
      const before = Object.fromEntries(["bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event",
        "bilibili_live_danmaku_recent", "object_artifact"].map(table => [table, raw.prepare(`SELECT rowid, * FROM ${table}`).all()]))
      raw.close()
      const upgraded = await ControlDatabase.open(directory)
      try { expect(upgraded.status().schemaVersion).toBe(14) } finally { upgraded.close() }
      const verify = new DatabaseSync(path)
      try {
        for (const [table, rows] of Object.entries(before)) expect(verify.prepare(`SELECT rowid, * FROM ${table}`).all()).toEqual(rows)
        expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        verify.exec("PRAGMA foreign_keys=ON; UPDATE bilibili_live_room_monitor SET online_count=-1, attention_count=-2; UPDATE bilibili_live_room_snapshot SET online_count=-3, attention_count=-4;")
        expect(() => verify.exec("UPDATE bilibili_live_room_monitor SET uid='bad'")).toThrow(/CHECK/)
        expect(verify.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name='idx_bilibili_live_snapshot_monitor_time'").get()).toBeTruthy()
      } finally { verify.close() }
      const reopened = await ControlDatabase.open(directory)
      try {
        expect(reopened.findBilibiliLiveRoomById("old-room")).toMatchObject({ onlineCount: -1, attentionCount: -2 })
        expect(reopened.findBilibiliLiveRoomSnapshots("old-room", { limit: 10 })[0]).toMatchObject({ onlineCount: -3, attentionCount: -4 })
      } finally { reopened.close() }
    } finally {
      if (raw.isOpen) raw.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
