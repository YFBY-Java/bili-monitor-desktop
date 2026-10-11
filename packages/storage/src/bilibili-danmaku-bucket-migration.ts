import type { DatabaseSync } from "node:sqlite"

// Append-only v15: alignment uses max(10, raw), while the persisted width is the original signed int.
export function migrateDanmakuBucketSeconds(database: DatabaseSync): void {
  const table = "bilibili_live_danmaku_metric_bucket", scratch = `${table}_v15`
  const signedCheck = "CHECK(typeof(bucket_seconds) = 'integer' AND bucket_seconds BETWEEN -2147483648 AND 2147483647)"
  const foreignKeys = database.prepare("PRAGMA foreign_keys").get()?.foreign_keys === 1
  const legacyAlterTable = database.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table === 1
  let transactionStarted = false
  try {
    database.exec("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE;")
    transactionStarted = true
    const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)
    if (typeof row?.sql !== "string") throw new Error("Missing danmaku bucket migration table")
    const signedDdl = row.sql.replace(/CHECK\(bucket_seconds BETWEEN 10 AND 3600\)/g, signedCheck)
    if (signedDdl !== row.sql) {
      const createDdl = signedDdl.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${scratch}`)
      if (createDdl === signedDdl) throw new Error("Unsupported danmaku bucket migration DDL")
      const dependents = database.prepare(`SELECT sql FROM sqlite_schema
        WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name`).all(table)
      const columns = database.prepare(`PRAGMA table_info(${table})`).all()
        .map(column => `"${String(column.name).replaceAll('"', '""')}"`).join(", ")
      database.exec(createDdl)
      database.exec(`INSERT INTO ${scratch}(rowid,${columns}) SELECT rowid,${columns} FROM ${table};
        DROP TABLE ${table}; ALTER TABLE ${scratch} RENAME TO ${table};`)
      for (const dependent of dependents) {
        if (typeof dependent.sql !== "string") throw new Error("Missing danmaku bucket dependent DDL")
        database.exec(dependent.sql)
      }
    } else if (!signedDdl.includes(signedCheck)) {
      throw new Error("Unsupported danmaku bucket constraint")
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("Danmaku bucket migration failed its foreign-key integrity check")
    }
    database.exec(`INSERT OR IGNORE INTO schema_migration(version,applied_at)
      VALUES (15,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      PRAGMA user_version=15; COMMIT;`)
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK;")
    throw error
  } finally {
    database.exec(`PRAGMA legacy_alter_table=${legacyAlterTable ? "ON" : "OFF"};
      PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"};`)
  }
}
