import type { DatabaseSync } from "node:sqlite"

// Append-only v14: source BIGINT counters allow every signed value. Keep the
// original positive monitor MID rule, all columns, rowids and table dependents.
export function migrateFollowerSignedCounters(database: DatabaseSync): void {
  const foreignKeys = database.prepare("PRAGMA foreign_keys").get()?.foreign_keys === 1
  const legacyAlterTable = database.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table === 1
  let transactionStarted = false
  try {
    // Set these before BEGIN: foreign_keys cannot change inside a transaction.
    // Legacy rename avoids validating cross-table triggers/views while the
    // original table is temporarily absent; restore both settings below.
    database.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON; BEGIN IMMEDIATE;")
    transactionStarted = true
    for (const table of ["bilibili_follower_monitor", "bilibili_follower_snapshot"]) {
      const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)
      if (typeof row?.sql !== "string") throw new Error(`Missing follower migration table: ${table}`)
      const signedDdl = row.sql
        .replace(/,\s*CHECK\(current_follower_count IS NULL OR current_follower_count >= 0\)/g, "")
        .replace(/,\s*CHECK\(follower_count >= 0\)/g, "")
        .replace(/,\s*CHECK\(following_count IS NULL OR following_count >= 0\)/g, "")
      if (signedDdl === row.sql) continue
      const scratch = `${table}_v14`
      const createDdl = signedDdl.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${scratch}`)
      if (createDdl === signedDdl) throw new Error(`Unsupported follower migration DDL: ${table}`)
      const dependents = database.prepare(`SELECT sql FROM sqlite_schema
        WHERE tbl_name=? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name`).all(table)
      const columns = database.prepare(`PRAGMA table_info(${table})`).all()
        .map(column => `"${String(column.name).replaceAll('"', '""')}"`).join(", ")
      database.exec(createDdl)
      database.exec(`INSERT INTO ${scratch}(rowid, ${columns}) SELECT rowid, ${columns} FROM ${table};`)
      database.exec(`DROP TABLE ${table}; ALTER TABLE ${scratch} RENAME TO ${table};`)
      for (const dependent of dependents) {
        if (typeof dependent.sql !== "string") throw new Error(`Missing follower dependent DDL: ${table}`)
        database.exec(dependent.sql)
      }
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Follower counter migration failed its foreign-key integrity check.")
    }
    database.exec(`INSERT INTO schema_migration(version, applied_at)
      VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      PRAGMA user_version = 14; COMMIT;`)
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK;")
    throw error
  } finally {
    database.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable ? "ON" : "OFF"};
      PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"};`)
  }
}
