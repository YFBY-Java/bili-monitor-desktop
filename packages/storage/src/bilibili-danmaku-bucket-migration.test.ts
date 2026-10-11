import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { ControlDatabase } from "./control-database"

it("upgrades v14 buckets preserving raw history, rowids, dependents and foreign keys", async () => {
  if (!/^D:/iu.test(resolve(tmpdir()))) throw new Error("Unsafe bucket migration temporary path")
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-bucket-migration-"))
  const path = resolve(directory, "control.db"), table = "bilibili_live_danmaku_metric_bucket"
  let control: ControlDatabase | undefined, raw: DatabaseSync | undefined
  try {
    control = await ControlDatabase.open(directory); control.close(); control = undefined
    raw = new DatabaseSync(path)
    // Restore only the published v14 constraint, even when the initial database is newer.
    const currentDdl = raw.prepare("SELECT sql FROM sqlite_schema WHERE name=?").get(table)?.sql
    if (typeof currentDdl !== "string") throw new Error("Missing bucket table")
    const oldDdl = currentDdl.replace(
      "CHECK(typeof(bucket_seconds) = 'integer' AND bucket_seconds BETWEEN -2147483648 AND 2147483647)",
      "CHECK(bucket_seconds BETWEEN 10 AND 3600)")
    const indexes = raw.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name=? AND type='index' AND sql IS NOT NULL").all(table)
    raw.exec(`BEGIN; ${oldDdl.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, "CREATE TABLE fixture_v14_bucket")};
      DROP TABLE ${table}; ALTER TABLE fixture_v14_bucket RENAME TO ${table};`)
    for (const index of indexes) raw.exec(String(index.sql))
    raw.exec(`ALTER TABLE bilibili_api_call DROP COLUMN request_meta_json;
      ALTER TABLE bilibili_api_call DROP COLUMN response_meta_json;
      DELETE FROM schema_migration WHERE version>=15; PRAGMA user_version=14; COMMIT;
      PRAGMA foreign_keys=ON;
      INSERT INTO bilibili_live_room_monitor(monitor_id,uid,room_id,uname,created_at,updated_at)
      VALUES ('legacy-room','22','33','合成旧主播','2026-10-06T12:00:00.000Z','2026-10-06T12:00:00.000Z');
      INSERT INTO ${table}(rowid,bucket_id,monitor_id,room_id,bucket_start,bucket_seconds,danmu_count,created_at,updated_at)
      VALUES (41,'legacy-bucket','legacy-room','33','2026-10-06T12:00:00.000Z',60,7,'2026-10-06T12:00:01.000Z','2026-10-06T12:00:02.000Z');
      CREATE VIEW fixture_bucket_view AS SELECT rowid,bucket_id,bucket_seconds FROM ${table};
      CREATE TABLE fixture_bucket_audit(bucket_id TEXT);
      CREATE TRIGGER fixture_bucket_trigger AFTER INSERT ON ${table}
      BEGIN INSERT INTO fixture_bucket_audit VALUES (new.bucket_id); END;`)
    const before = raw.prepare(`SELECT rowid,* FROM ${table}`).all()
    const dependents = raw.prepare("SELECT name,sql FROM sqlite_schema WHERE name IN ('fixture_bucket_view','fixture_bucket_trigger','idx_bilibili_live_danmaku_bucket_room_time') ORDER BY name").all()
    raw.close(); raw = undefined
    control = await ControlDatabase.open(directory)
    expect(control.status().schemaVersion).toBe(18)
    raw = new DatabaseSync(path)
    expect(raw.prepare(`SELECT rowid,* FROM ${table}`).all()).toEqual(before)
    expect(raw.prepare("SELECT name,sql FROM sqlite_schema WHERE name IN ('fixture_bucket_view','fixture_bucket_trigger','idx_bilibili_live_danmaku_bucket_room_time') ORDER BY name").all()).toEqual(dependents)
    const input = { monitorId: "legacy-room", sessionId: null, roomId: "33",
      occurredAt: "1969-12-31T23:59:59.500Z", bucketSeconds: 0, danmuDelta: 1,
      likeCount: null, likeIncrement: 0, watchedCount: null, heartbeatPopularity: null,
      giftDelta: 0, superChatDelta: 0, rawEventDelta: 1, recent: null, recentLimit: 200 }
    control.recordBilibiliLiveDanmakuEvent(input)
    expect(raw.prepare(`SELECT bucket_start,bucket_seconds FROM ${table} WHERE bucket_seconds=0`).get())
      .toEqual({ bucket_start: "1970-01-01T00:00:00.000Z", bucket_seconds: 0 })
    control.recordBilibiliLiveDanmakuEvent({ ...input, bucketSeconds: 2147483647, occurredAt: "2026-10-06T12:00:00.000Z" })
    expect(raw.prepare("SELECT bucket_seconds FROM fixture_bucket_view WHERE bucket_seconds=2147483647").get()?.bucket_seconds).toBe(2147483647)
    expect(raw.prepare("SELECT * FROM fixture_bucket_audit").all()).toHaveLength(2)
    expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    expect(() => control!.recordBilibiliLiveDanmakuEvent({ ...input, bucketSeconds: 2147483648 })).toThrow(/CHECK/)
    expect(raw.prepare(`SELECT rowid,* FROM ${table} WHERE bucket_id='legacy-bucket'`).all()).toEqual(before)
  } finally {
    try { raw?.close() } finally { try { control?.close() } finally { await rm(directory, { recursive: true, force: true }) } }
  }
})
