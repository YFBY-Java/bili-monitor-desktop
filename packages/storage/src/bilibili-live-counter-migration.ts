import type { DatabaseSync } from "node:sqlite"

// Append-only v13. Rebuild the two known tables using SQLite's safe table-rebuild sequence.
// Foreign keys are suspended only on this startup connection and checked before commit.
export function migrateLiveSignedCounters(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")
  try {
    for (const table of ["bilibili_live_room_monitor", "bilibili_live_room_snapshot"]) {
      const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)
      if (typeof row?.sql !== "string") throw new Error(`Missing live migration table: ${table}`)
      const signedDdl = row.sql
        .replace(/,\s*CHECK\(online_count IS NULL OR online_count >= 0\)/g, "")
        .replace(/,\s*CHECK\(attention_count IS NULL OR attention_count >= 0\)/g, "")
      if (signedDdl === row.sql) continue
      const scratch = `${table}_v13`
      const createDdl = signedDdl.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${scratch}`)
      if (createDdl === signedDdl) throw new Error(`Unsupported live migration DDL: ${table}`)
      const dependents = database.prepare(
        "SELECT sql FROM sqlite_schema WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name"
      ).all(table)
      // Keep rowid: live queries use it as the deterministic insertion-order tie breaker.
      const columns = database.prepare(`PRAGMA table_info(${table})`).all()
        .map(column => `"${String(column.name).replaceAll('"', '""')}"`).join(", ")
      database.exec(createDdl)
      database.exec(`INSERT INTO ${scratch}(rowid, ${columns}) SELECT rowid, ${columns} FROM ${table};`)
      database.exec(`DROP TABLE ${table}; ALTER TABLE ${scratch} RENAME TO ${table};`)
      for (const dependent of dependents) database.exec(String(dependent.sql))
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Live counter migration failed its foreign-key integrity check.")
    }
    database.exec(`
      INSERT OR IGNORE INTO schema_migration(version, applied_at)
      VALUES (13, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      PRAGMA user_version = 13;
      COMMIT;
    `)
  } catch (error) {
    database.exec("ROLLBACK;")
    throw error
  } finally {
    database.exec("PRAGMA foreign_keys = ON;")
  }
}
