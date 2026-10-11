import type { DatabaseSync } from "node:sqlite"

// Append-only v17: PostgreSQL BIGINT/INTEGER rank fields are signed, unlike the
// original client checks. Keep every historical value and insertion-order rowid.
export function migrateRankSignedCounters(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")
  try {
    for (const table of ["bilibili_live_rank_snapshot", "bilibili_live_rank_entry"]) {
      const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)
      if (typeof row?.sql !== "string") throw new Error(`Missing rank migration table: ${table}`)
      const signedDdl = row.sql.replace(
        /,\s*CHECK\((total_count|rank_no|score|guard_level|wealth_level|medal_level|accompany_days) IS NULL OR \1 (?:>=|>) 0\)/g,
        ""
      )
      if (signedDdl === row.sql) continue
      const scratch = `${table}_v17`
      const createDdl = signedDdl.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${scratch}`)
      if (createDdl === signedDdl) throw new Error(`Unsupported rank migration DDL: ${table}`)
      const dependents = database.prepare(
        "SELECT sql FROM sqlite_schema WHERE tbl_name=? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name"
      ).all(table)
      const columns = database.prepare(`PRAGMA table_info(${table})`).all()
        .map(column => `"${String(column.name).replaceAll('"', '""')}"`).join(", ")
      database.exec(createDdl)
      database.exec(`INSERT INTO ${scratch}(rowid, ${columns}) SELECT rowid, ${columns} FROM ${table};`)
      database.exec(`DROP TABLE ${table}; ALTER TABLE ${scratch} RENAME TO ${table};`)
      for (const dependent of dependents) database.exec(String(dependent.sql))
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Rank counter migration failed its foreign-key integrity check.")
    }
    database.exec(`
      INSERT OR IGNORE INTO schema_migration(version, applied_at)
      VALUES (17, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      PRAGMA user_version=17;
      COMMIT;
    `)
  } catch (error) {
    database.exec("ROLLBACK;")
    throw error
  } finally {
    database.exec("PRAGMA foreign_keys=ON;")
  }
}
