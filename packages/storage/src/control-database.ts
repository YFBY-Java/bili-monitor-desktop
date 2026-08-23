import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

export interface ControlDatabaseStatus {
  databasePath: string
  journalMode: string
  schemaVersion: number
}

export interface StoredWorkerStatus {
  workerId: string
  workerType: string
  state: string
  restartCount: number
  lastError: string | null
  updatedAt: string
}

export class ControlDatabase {
  private constructor(
    private readonly database: DatabaseSync,
    private readonly databasePath: string
  ) {}

  static async open(directory: string): Promise<ControlDatabase> {
    await mkdir(directory, { recursive: true })
    const databasePath = resolve(directory, "control.db")
    const database = new DatabaseSync(databasePath)
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
    database.exec("PRAGMA journal_mode = WAL;")
    ControlDatabase.migrate(database)
    return new ControlDatabase(database, databasePath)
  }

  private static migrate(database: DatabaseSync): void {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worker_status (
        worker_id TEXT PRIMARY KEY,
        worker_type TEXT NOT NULL,
        state TEXT NOT NULL,
        restart_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task (
        task_id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempt_id TEXT,
        approval_id TEXT,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_event (
        event_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task(task_id),
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approval (
        approval_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task(task_id),
        state TEXT NOT NULL,
        request_json TEXT NOT NULL,
        decision_json TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE TABLE IF NOT EXISTS outbox (
        message_id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        published_at TEXT
      );
      INSERT OR IGNORE INTO schema_migration(version, applied_at)
      VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      PRAGMA user_version = 1;
      COMMIT;
    `)
  }

  status(): ControlDatabaseStatus {
    const journal = this.database.prepare("PRAGMA journal_mode").get() as Record<string, unknown>
    const version = this.database.prepare("PRAGMA user_version").get() as Record<string, unknown>
    return {
      databasePath: this.databasePath,
      journalMode: String(journal.journal_mode).toLowerCase(),
      schemaVersion: Number(version.user_version)
    }
  }

  listWorkerStatuses(): StoredWorkerStatus[] {
    return this.database
      .prepare(`
        SELECT worker_id AS workerId,
               worker_type AS workerType,
               state,
               restart_count AS restartCount,
               last_error AS lastError,
               updated_at AS updatedAt
        FROM worker_status
        ORDER BY worker_id
      `)
      .all() as unknown as StoredWorkerStatus[]
  }

  close(): void {
    this.database.close()
  }
}
