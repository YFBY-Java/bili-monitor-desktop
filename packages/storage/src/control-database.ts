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

export interface StoredPlatformAccount {
  accountId: string
  platform: string
  externalId: string
  displayName: string
  profileUrl: string | null
  avatarUrl: string | null
  authState: string
  lastValidatedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface NewStoredPlatformAccount extends StoredPlatformAccount {}

export interface StoredSubjectRecord {
  subjectId: string
  name: string
  status: string
  tags: string[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface StoredSubjectBinding {
  bindingId: string
  subjectId: string
  accountId: string
  validFrom: string
  createdAt: string
}

export interface StoredSubjectPolicy {
  policyId: string
  bindingId: string
  subjectId: string
  accountId: string
  capability: string
  state: string
  intervalSeconds: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface StoredSubjectAggregate extends StoredSubjectRecord {
  accounts: StoredPlatformAccount[]
  policies: StoredSubjectPolicy[]
}

export interface NewStoredSubjectBundle {
  subject: StoredSubjectRecord
  binding?: StoredSubjectBinding
  policy?: StoredSubjectPolicy
}

export interface NewStoredOutboxMessage {
  messageId: string
  topic: string
  envelopeJson: string
  createdAt: string
}

export interface StoredOutboxMessage extends NewStoredOutboxMessage {
  state: string
  publishedAt: string | null
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
    const version = database.prepare("PRAGMA user_version").get() as Record<string, unknown>
    if (Number(version.user_version) < 1) {
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
    if (Number(version.user_version) < 2) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE platform_account (
          account_id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          external_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          profile_url TEXT,
          avatar_url TEXT,
          auth_state TEXT NOT NULL DEFAULT 'not_connected',
          secret_ref TEXT,
          last_validated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(platform, external_id),
          CHECK(platform IN ('bilibili', 'douyin')),
          CHECK(auth_state IN ('not_connected', 'active', 'expired', 'revoked')),
          CHECK(length(trim(external_id)) > 0),
          CHECK(length(trim(display_name)) > 0)
        );
        CREATE INDEX idx_platform_account_list
          ON platform_account(platform, auth_state, updated_at DESC);

        CREATE TABLE subject (
          subject_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          tags_json TEXT NOT NULL DEFAULT '[]',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(status IN ('active', 'paused')),
          CHECK(length(trim(name)) > 0),
          CHECK(json_valid(tags_json))
        );
        CREATE INDEX idx_subject_list ON subject(status, updated_at DESC);

        CREATE TABLE subject_account_binding (
          binding_id TEXT PRIMARY KEY,
          subject_id TEXT NOT NULL REFERENCES subject(subject_id) ON DELETE CASCADE,
          account_id TEXT NOT NULL REFERENCES platform_account(account_id) ON DELETE RESTRICT,
          valid_from TEXT NOT NULL,
          valid_to TEXT,
          created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX uq_subject_account_binding_active
          ON subject_account_binding(subject_id, account_id)
          WHERE valid_to IS NULL;
        CREATE INDEX idx_subject_account_binding_account
          ON subject_account_binding(account_id, valid_to);

        CREATE TABLE subject_monitor_policy (
          policy_id TEXT PRIMARY KEY,
          binding_id TEXT NOT NULL REFERENCES subject_account_binding(binding_id) ON DELETE CASCADE,
          capability TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'active',
          interval_seconds INTEGER NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(binding_id, capability),
          CHECK(capability = 'follower.snapshot'),
          CHECK(state IN ('active', 'paused')),
          CHECK(interval_seconds BETWEEN 300 AND 604800)
        );
        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 2;
        COMMIT;
      `)
    }
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

  createPlatformAccount(account: NewStoredPlatformAccount, outbox: NewStoredOutboxMessage): void {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO platform_account (
          account_id, platform, external_id, display_name, profile_url, avatar_url,
          auth_state, last_validated_at, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        account.accountId,
        account.platform,
        account.externalId,
        account.displayName,
        account.profileUrl,
        account.avatarUrl,
        account.authState,
        account.lastValidatedAt,
        account.version,
        account.createdAt,
        account.updatedAt
      )
      this.insertOutbox(outbox)
    })
  }

  listPlatformAccounts(input: {
    platform?: string | undefined
    search?: string | undefined
    limit: number
  }): { items: StoredPlatformAccount[]; total: number } {
    const where: string[] = []
    const parameters: Array<string | number> = []
    if (input.platform) {
      where.push("platform = ?")
      parameters.push(input.platform)
    }
    if (input.search) {
      where.push("(display_name LIKE ? OR external_id LIKE ?)")
      parameters.push(`%${input.search}%`, `%${input.search}%`)
    }
    const predicate = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS total FROM platform_account ${predicate}`)
      .get(...parameters) as Record<string, unknown>
    const rows = this.database.prepare(`
      SELECT account_id AS accountId,
             platform,
             external_id AS externalId,
             display_name AS displayName,
             profile_url AS profileUrl,
             avatar_url AS avatarUrl,
             auth_state AS authState,
             last_validated_at AS lastValidatedAt,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM platform_account
      ${predicate}
      ORDER BY updated_at DESC, account_id
      LIMIT ?
    `).all(...parameters, input.limit) as unknown as StoredPlatformAccount[]
    return { items: rows, total: Number(totalRow.total) }
  }

  findPlatformAccountById(accountId: string): StoredPlatformAccount | undefined {
    return this.database.prepare(`
      SELECT account_id AS accountId,
             platform,
             external_id AS externalId,
             display_name AS displayName,
             profile_url AS profileUrl,
             avatar_url AS avatarUrl,
             auth_state AS authState,
             last_validated_at AS lastValidatedAt,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM platform_account
      WHERE account_id = ?
    `).get(accountId) as unknown as StoredPlatformAccount | undefined
  }

  findPlatformAccountByExternalId(platform: string, externalId: string): StoredPlatformAccount | undefined {
    return this.database.prepare(`
      SELECT account_id AS accountId,
             platform,
             external_id AS externalId,
             display_name AS displayName,
             profile_url AS profileUrl,
             avatar_url AS avatarUrl,
             auth_state AS authState,
             last_validated_at AS lastValidatedAt,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM platform_account
      WHERE platform = ? AND external_id = ?
    `).get(platform, externalId) as unknown as StoredPlatformAccount | undefined
  }

  createSubject(bundle: NewStoredSubjectBundle, outbox: NewStoredOutboxMessage): void {
    this.transaction(() => {
      const subject = bundle.subject
      this.database.prepare(`
        INSERT INTO subject (
          subject_id, name, status, tags_json, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        subject.subjectId,
        subject.name,
        subject.status,
        JSON.stringify(subject.tags),
        subject.version,
        subject.createdAt,
        subject.updatedAt
      )
      if (bundle.binding) this.insertSubjectBinding(bundle.binding)
      if (bundle.policy) this.insertSubjectPolicy(bundle.policy)
      this.insertOutbox(outbox)
    })
  }

  bindSubjectAccount(
    binding: StoredSubjectBinding,
    policy: StoredSubjectPolicy,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.insertSubjectBinding(binding)
      this.insertSubjectPolicy(policy)
      this.database.prepare(`
        UPDATE subject
        SET version = version + 1, updated_at = ?
        WHERE subject_id = ?
      `).run(binding.createdAt, binding.subjectId)
      this.insertOutbox(outbox)
    })
  }

  listSubjects(input: {
    platform?: string | undefined
    status?: string | undefined
    search?: string | undefined
    limit: number
  }): { items: StoredSubjectAggregate[]; total: number } {
    const where: string[] = []
    const parameters: Array<string | number> = []
    if (input.status) {
      where.push("s.status = ?")
      parameters.push(input.status)
    }
    if (input.search) {
      where.push("s.name LIKE ?")
      parameters.push(`%${input.search}%`)
    }
    if (input.platform) {
      where.push(`EXISTS (
        SELECT 1 FROM subject_account_binding filter_binding
        JOIN platform_account filter_account ON filter_account.account_id = filter_binding.account_id
        WHERE filter_binding.subject_id = s.subject_id
          AND filter_binding.valid_to IS NULL
          AND filter_account.platform = ?
      )`)
      parameters.push(input.platform)
    }
    const predicate = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS total FROM subject s ${predicate}`)
      .get(...parameters) as Record<string, unknown>
    const rows = this.database.prepare(`
      SELECT s.subject_id AS subjectId,
             s.name,
             s.status,
             s.tags_json AS tagsJson,
             s.version,
             s.created_at AS createdAt,
             s.updated_at AS updatedAt
      FROM subject s
      ${predicate}
      ORDER BY s.updated_at DESC, s.subject_id
      LIMIT ?
    `).all(...parameters, input.limit) as unknown as Array<Record<string, unknown>>
    const items = rows.map((row) => this.mapSubjectAggregate(row))
    return { items, total: Number(totalRow.total) }
  }

  findSubjectById(subjectId: string): StoredSubjectAggregate | undefined {
    const row = this.database.prepare(`
      SELECT subject_id AS subjectId,
             name,
             status,
             tags_json AS tagsJson,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM subject
      WHERE subject_id = ?
    `).get(subjectId) as Record<string, unknown> | undefined
    return row ? this.mapSubjectAggregate(row) : undefined
  }

  listPendingOutbox(): StoredOutboxMessage[] {
    return this.database.prepare(`
      SELECT message_id AS messageId,
             topic,
             envelope_json AS envelopeJson,
             state,
             created_at AS createdAt,
             published_at AS publishedAt
      FROM outbox
      WHERE state = 'pending'
      ORDER BY created_at, message_id
    `).all() as unknown as StoredOutboxMessage[]
  }

  private mapSubjectAggregate(row: Record<string, unknown>): StoredSubjectAggregate {
    const subjectId = String(row.subjectId)
    const accounts = this.database.prepare(`
      SELECT account.account_id AS accountId,
             account.platform,
             account.external_id AS externalId,
             account.display_name AS displayName,
             account.profile_url AS profileUrl,
             account.avatar_url AS avatarUrl,
             account.auth_state AS authState,
             account.last_validated_at AS lastValidatedAt,
             account.version,
             account.created_at AS createdAt,
             account.updated_at AS updatedAt
      FROM subject_account_binding binding
      JOIN platform_account account ON account.account_id = binding.account_id
      WHERE binding.subject_id = ? AND binding.valid_to IS NULL
      ORDER BY binding.valid_from, account.account_id
    `).all(subjectId) as unknown as StoredPlatformAccount[]
    const policies = this.database.prepare(`
      SELECT policy.policy_id AS policyId,
             policy.binding_id AS bindingId,
             binding.subject_id AS subjectId,
             binding.account_id AS accountId,
             policy.capability,
             policy.state,
             policy.interval_seconds AS intervalSeconds,
             policy.version,
             policy.created_at AS createdAt,
             policy.updated_at AS updatedAt
      FROM subject_monitor_policy policy
      JOIN subject_account_binding binding ON binding.binding_id = policy.binding_id
      WHERE binding.subject_id = ? AND binding.valid_to IS NULL
      ORDER BY binding.valid_from, policy.capability
    `).all(subjectId) as unknown as StoredSubjectPolicy[]
    const parsedTags = JSON.parse(String(row.tagsJson)) as unknown
    return {
      subjectId,
      name: String(row.name),
      status: String(row.status),
      tags: Array.isArray(parsedTags) ? parsedTags.map(String) : [],
      version: Number(row.version),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      accounts,
      policies
    }
  }

  private insertSubjectBinding(binding: StoredSubjectBinding): void {
    this.database.prepare(`
      INSERT INTO subject_account_binding (
        binding_id, subject_id, account_id, valid_from, valid_to, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?)
    `).run(
      binding.bindingId,
      binding.subjectId,
      binding.accountId,
      binding.validFrom,
      binding.createdAt
    )
  }

  private insertSubjectPolicy(policy: StoredSubjectPolicy): void {
    this.database.prepare(`
      INSERT INTO subject_monitor_policy (
        policy_id, binding_id, capability, state, interval_seconds,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      policy.policyId,
      policy.bindingId,
      policy.capability,
      policy.state,
      policy.intervalSeconds,
      policy.version,
      policy.createdAt,
      policy.updatedAt
    )
  }

  private insertOutbox(message: NewStoredOutboxMessage): void {
    this.database.prepare(`
      INSERT INTO outbox (message_id, topic, envelope_json, state, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(message.messageId, message.topic, message.envelopeJson, message.createdAt)
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE")
    try {
      const result = operation()
      this.database.exec("COMMIT")
      return result
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  close(): void {
    this.database.close()
  }
}
