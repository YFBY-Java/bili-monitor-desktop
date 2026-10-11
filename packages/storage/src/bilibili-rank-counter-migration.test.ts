import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { ControlDatabase } from "./control-database"

describe("v17 original signed rank values", () => {
  it("upgrades published constraints preserving historical rows, indexes, evidence and cascades", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-counter-migration-"))
    const path = resolve(directory, "control.db")
    const initial = await ControlDatabase.open(directory)
    initial.close()
    const raw = new DatabaseSync(path)
    const artifactId = `sha256:${"a".repeat(64)}`
    try {
      raw.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
      const currentColumns = raw.prepare("PRAGMA table_info(bilibili_live_rank_entry)").all().map(column => column.name)
      for (const column of ["medal_ruid", "medal_is_light", "raw_entry_json"]) {
        if (currentColumns.includes(column)) raw.exec(`ALTER TABLE bilibili_live_rank_entry DROP COLUMN ${column};`)
      }
      for (const [table, checks] of [
        ["bilibili_live_rank_snapshot", ["total_count IS NULL OR total_count >= 0"]],
        ["bilibili_live_rank_entry", ["rank_no IS NULL OR rank_no > 0", "score IS NULL OR score >= 0",
          "guard_level IS NULL OR guard_level >= 0", "wealth_level IS NULL OR wealth_level >= 0",
          "medal_level IS NULL OR medal_level >= 0", "accompany_days IS NULL OR accompany_days >= 0"]]
      ] as const) {
        const ddl = String(raw.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)!.sql)
        const indexes = raw.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table)
        const missing = checks.filter(check => !ddl.includes(`CHECK(${check})`))
        const constrained = missing.length ? ddl.replace(/\)\s*$/, `, ${missing.map(check => `CHECK(${check})`).join(", ")})`) : ddl
        raw.exec(constrained.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${table}_v16_fixture`))
        raw.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_v16_fixture RENAME TO ${table};`)
        for (const index of indexes) raw.exec(String(index.sql))
      }
      raw.exec(`DELETE FROM schema_migration WHERE version>=17; PRAGMA user_version=16; COMMIT; PRAGMA foreign_keys=ON;
        INSERT INTO object_artifact(object_id, relative_path, media_type, size_bytes, sha256, created_at)
        VALUES ('${artifactId}', 'objects/synthetic.json', 'application/json', 2, '${"a".repeat(64)}', '2026-10-07T00:00:00Z');
        INSERT INTO bilibili_live_room_monitor(monitor_id, uid, room_id, uname, live_status, created_at, updated_at)
        VALUES ('old-room', '118', '218', '原房间资料', 1, '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z');
        INSERT INTO bilibili_live_rank_snapshot(rowid, snapshot_id, monitor_id, room_id, ruid, rank_family, rank_type,
          page_no, page_size, total_count, source_endpoint, captured_at, captured_bucket, evidence_object_id, created_at)
        VALUES (41, 'old-rank', 'old-room', '218', '118', 'GUARD', 'guard_weekly', 1, 30, 7,
          'xlive/app-room/v2/guardTab/topListNew', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', '${artifactId}', '2026-10-07T00:00:00Z');
        INSERT INTO bilibili_live_rank_entry(rowid, entry_id, snapshot_id, monitor_id, room_id, ruid, user_uid,
          rank_no, entry_kind, score, guard_level, wealth_level, medal_level, accompany_days, created_at)
        VALUES (99, 'old-entry', 'old-rank', 'old-room', '218', '118', '119', 4294967298, 'LIST', 8, 3, 4, 5, 6, '2026-10-07T00:00:00Z');`)
      expect(() => raw.exec("UPDATE bilibili_live_rank_entry SET rank_no=-2147483648")).toThrow(/CHECK/)
      const before = Object.fromEntries(["bilibili_live_rank_snapshot", "bilibili_live_rank_entry", "object_artifact"]
        .map(table => [table, raw.prepare(`SELECT rowid, * FROM ${table}`).all()]))
      const indexes = raw.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND tbl_name LIKE 'bilibili_live_rank_%' ORDER BY name").all()
      raw.close()
      const upgraded = await ControlDatabase.open(directory)
      try {
        expect(upgraded.status().schemaVersion).toBe(18)
        expect(upgraded.findBilibiliLiveRankEntries("old-rank", 10)[0]?.rankNo).toBe(4294967298)
        expect(upgraded.findBilibiliLiveRankEntries("old-rank", 10)[0]).toMatchObject({
          medalRuid: null, medalIsLight: null, rawEntryJson: null
        })
      } finally { upgraded.close() }
      const verify = new DatabaseSync(path)
      try {
        for (const [table, rows] of Object.entries(before)) {
          const columns = Object.keys(rows[0]!).map(column => `"${column}"`).join(", ")
          expect(verify.prepare(`SELECT ${columns} FROM ${table}`).all()).toEqual(rows)
        }
        expect(verify.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND tbl_name LIKE 'bilibili_live_rank_%' ORDER BY name").all()).toEqual(indexes)
        expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        verify.exec(`UPDATE bilibili_live_rank_snapshot SET total_count=-2;
          UPDATE bilibili_live_rank_entry SET score=-9223372036854775808, rank_no=-2147483648,
            guard_level=-1, wealth_level=-2, medal_level=-3, accompany_days=-4;`)
        const integers = verify.prepare("SELECT score, typeof(score) AS score_type, rank_no FROM bilibili_live_rank_entry")
        integers.setReadBigInts(true)
        expect(integers.get()).toEqual({ score: -9223372036854775808n, score_type: "integer", rank_no: -2147483648n })
      } finally { verify.close() }
      const reopened = await ControlDatabase.open(directory)
      try {
        expect(reopened.findBilibiliLiveRankEntries("old-rank", 10)[0]).toMatchObject({
          userUid: "119", rankNo: -2147483648, score: "-9223372036854775808", guardLevel: -1, accompanyDays: -4 })
        expect(reopened.findLatestBilibiliLiveRankSnapshots("old-room")[0]?.totalCount).toBe("-2")
      } finally { reopened.close() }
      const cascade = new DatabaseSync(path)
      try {
        cascade.exec("PRAGMA foreign_keys=ON; DELETE FROM bilibili_live_room_monitor WHERE monitor_id='old-room';")
        expect(cascade.prepare("SELECT count(*) AS count FROM bilibili_live_rank_entry").get()?.count).toBe(0)
        expect(cascade.prepare("SELECT count(*) AS count FROM bilibili_live_rank_snapshot").get()?.count).toBe(0)
        expect(cascade.prepare("SELECT object_id FROM object_artifact").get()?.object_id).toBe(artifactId)
      } finally { cascade.close() }
    } finally {
      if (raw.isOpen) raw.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
