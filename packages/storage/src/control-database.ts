import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { compareLiveSnapshotTime, hasLiveSnapshotText } from "./bilibili-live-snapshot-values"

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

export interface StoredBilibiliSubject {
  subjectId: string
  displayName: string
  avatarUrl: string | null
  remark: string | null
  tags: string[]
  monitorStatus: string
  healthScore: number | null
  lastSuccessAt: string | null
  lastEventAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliSubjectBinding {
  bindingId: string
  subjectId: string
  bilibiliUserMonitorId: string | null
  bilibiliLiveRoomMonitorId: string | null
  mid: string | null
  roomId: string | null
  enabledCapabilities: string[]
  danmuEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliSubjectWidgetLayout {
  layoutId: string
  subjectId: string
  widgetKey: string
  enabled: boolean
  position: Record<string, unknown>
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface NewStoredBilibiliSubjectBundle {
  subject: StoredBilibiliSubject
  binding?: StoredBilibiliSubjectBinding
  layouts: StoredBilibiliSubjectWidgetLayout[]
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

export interface StoredObjectArtifact {
  objectId: string
  sha256: string
  relativePath: string
  sizeBytes: number
  mediaType: string
  createdAt: string
}

export interface StoredBilibiliFollowerMonitor {
  monitorId: string
  mid: string
  nickname: string
  avatarUrl: string | null
  profileUrl: string
  currentFollowerCount: number | null
  followingCount: number | null
  monitorStatus: string
  intervalSeconds: number
  nextCollectAt: string | null
  lastSnapshotAt: string | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastErrorType: string | null
  lastErrorMessage: string | null
  sourceEndpoint: string | null
  currentEvidenceObjectId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliFollowerSnapshot {
  snapshotId: string
  monitorId: string
  mid: string
  followerCount: number
  followingCount: number | null
  capturedAt: string
  capturedBucket: string
  sourceEndpoint: string
  evidenceObjectId: string
  createdAt: string
}

export interface StoredBilibiliApiCall {
  callId: string
  taskId: string
  attempt: number
  endpointKey: string
  mid: string
  statusCode: number | null
  durationMs: number
  errorType: string | null
  retryable: boolean
  evidenceObjectId: string | null
  createdAt: string
}

export interface StoredBilibiliAuthCredential {
  credentialId: string
  encryptedPayload: string
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewStoredBilibiliAuthCredential {
  credentialId: string
  encryptedPayload: string
  expiresAt: string | null
  account: {
    accountId: string
    mid: string
    uname: string
    face: string | null
  }
  createdAt: string
  updatedAt: string
}

export interface StoredDouyinAuthSession {
  loginId: string
  flowType: string
  providerMode: string
  workerSessionId: string | null
  state: string | null
  status: string
  expiresAt: string
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  rawResultJson: string
  createdAt: string
  updatedAt: string
}

export interface StoredDouyinAuthCredential {
  credentialId: string
  authType: string
  encryptedPayload: string
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewStoredDouyinAuthCredential {
  credentialId: string
  authType: "DOUYIN_OAUTH2" | "DOUYIN_WEB_SESSION"
  encryptedPayload: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliLiveRoomMonitor {
  monitorId: string
  uid: string
  roomId: string
  shortId: string | null
  uname: string
  faceUrl: string | null
  title: string | null
  coverUrl: string | null
  keyframeUrl: string | null
  areaId: string | null
  areaName: string | null
  parentAreaId: string | null
  parentAreaName: string | null
  liveStatus: number
  liveTime: string | null
  onlineCount: number | null
  attentionCount: number | null
  monitorStatus: string
  intervalSeconds: number
  nextCollectAt: string | null
  lastSnapshotAt: string | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastErrorType: string | null
  lastErrorMessage: string | null
  backoffUntil: string | null
  sourceEndpoint: string | null
  currentEvidenceObjectId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliLiveRoomSnapshot {
  snapshotId: string
  monitorId: string
  uid: string
  roomId: string
  liveStatus: number
  title: string | null
  areaId: string | null
  areaName: string | null
  parentAreaId: string | null
  parentAreaName: string | null
  onlineCount: number | null
  attentionCount: number | null
  liveTime: string | null
  sourceEndpoint: string
  capturedAt: string
  capturedBucket: string
  evidenceObjectId: string
  createdAt: string
}

export interface StoredBilibiliLiveDanmakuSession {
  sessionId: string
  monitorId: string
  roomId: string
  startedAt: string
  connectedAt: string | null
  endedAt: string | null
  status: string
  connectHost: string | null
  reconnectCount: number
  lastHeartbeatAt: string | null
  lastErrorAt: string | null
  lastErrorType: string | null
  lastErrorMessage: string | null
  createdAt: string
}

export interface StoredBilibiliLiveDanmakuRecent {
  recentId: string
  monitorId: string
  roomId: string
  senderUid: string | null
  messageText: string
  displayName: string | null
  medalName: string | null
  sentAt: string
  createdAt: string
}

export interface StoredBilibiliLiveDanmakuMetricBucket {
  bucketId: string
  monitorId: string
  sessionId: string | null
  roomId: string
  bucketStart: string
  bucketSeconds: number
  danmuCount: number
  likeCount: number | null
  likeIncrement: number
  watchedCount: number | null
  heartbeatPopularity: number | null
  giftCount: number
  superChatCount: number
  rawEventCount: number
  updatedAt: string
  createdAt: string
}

export interface StoredBilibiliLiveDanmakuStats {
  ratePerMinute: number
  last5MinutesCount: number
  likeCount: number | null
  likeIncrement: number
  watchedCount: number | null
  heartbeatPopularity: number | null
  latestBucketAt: string | null
  latestMessageAt: string | null
}

export interface StoredBilibiliLiveSession {
  sessionId: string
  monitorId: string
  uid: string
  roomId: string
  state: "OPEN" | "END_PENDING" | "CLOSED" | "INCOMPLETE"
  platformLiveTime: string | null
  liveKey: string
  startedAt: string
  startDetectedAt: string
  startSource: string
  endSignalAt: string | null
  endedAt: string | null
  endDetectedAt: string | null
  endSource: string | null
  lastLiveObservedAt: string | null
  lastObservedAt: string
  titleAtStart: string | null
  titleAtEnd: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredBilibiliLiveSessionEvent {
  eventId: string
  liveSessionId: string
  transportSessionId: string | null
  receiptOrdinal: number
  monitorId: string
  roomId: string
  eventKey: string
  sourceEventId: string | null
  eventKind: string
  command: string | null
  protocolVersion: number | null
  senderUid: string | null
  senderName: string | null
  medalName: string | null
  messageText: string | null
  giftId: string | null
  giftName: string | null
  giftCount: number | null
  coinType: string | null
  unitPriceMilliYuan: number | null
  paidAmountMilliYuan: number | null
  paid: boolean
  guardLevel: number | null
  amountSource: string | null
  occurredAt: string
  receivedAt: string
  rawPayloadJson: string
  createdAt: string
}

export interface RecordBilibiliLiveDanmakuEventInput {
  monitorId: string
  sessionId: string | null
  roomId: string
  occurredAt: string
  bucketSeconds: number
  danmuDelta: number
  likeCount: number | null
  likeIncrement: number
  watchedCount: number | null
  heartbeatPopularity: number | null
  giftDelta: number
  superChatDelta: number
  rawEventDelta: number
  recent: {
    senderUid: string | null
    messageText: string
    displayName: string | null
    medalName: string | null
    sentAt: string
  } | null
  recentLimit: number
}

export interface StoredBilibiliLiveStatusEvent {
  eventId: string
  monitorId: string
  uid: string
  roomId: string
  eventType: string
  fromLiveStatus: number | null
  toLiveStatus: number | null
  titleBefore: string | null
  titleAfter: string | null
  onlineCount: number | null
  occurredAt: string
}

export interface StoredBilibiliLiveRankSnapshot {
  snapshotId: string
  monitorId: string
  roomId: string
  ruid: string
  rankFamily: string
  rankType: string
  rankSwitch: string | null
  periodScope: string | null
  pageNo: number
  pageSize: number
  totalCount: number | null
  countText: string | null
  valueText: string | null
  remindMsg: string | null
  sourceEndpoint: string
  signedRequired: boolean
  capturedAt: string
  capturedBucket: string
  evidenceObjectId: string
  createdAt: string
}

export interface StoredBilibiliLiveRankEntry {
  entryId: string
  snapshotId: string
  monitorId: string
  roomId: string
  ruid: string
  userUid: string | null
  rankNo: number | null
  entryKind: string
  displayName: string | null
  faceUrl: string | null
  score: number | null
  guardLevel: number | null
  wealthLevel: number | null
  medalName: string | null
  medalLevel: number | null
  guardExpiredText: string | null
  accompanyDays: number | null
  createdAt: string
}

export interface UpsertBilibiliLiveRankSnapshotInput {
  snapshot: Omit<StoredBilibiliLiveRankSnapshot, "evidenceObjectId" | "createdAt">
  entries: Array<Omit<StoredBilibiliLiveRankEntry, "snapshotId" | "monitorId" | "roomId" | "ruid" | "createdAt">>
  artifact: StoredObjectArtifact
}

export interface ApplyBilibiliLiveRoomSnapshotInput {
  reactivate?: boolean
  appliedAt?: string
  monitor: {
    monitorId: string
    uid: string
    roomId: string
    shortId: string | null
    uname: string
    faceUrl: string | null
    title: string | null
    coverUrl: string | null
    keyframeUrl: string | null
    areaId: string | null
    areaName: string | null
    parentAreaId: string | null
    parentAreaName: string | null
    liveStatus: number
    liveTime: string | null
    onlineCount: number | null
    attentionCount: number | null
    intervalSeconds: number
    nextCollectAt: string
    capturedAt: string
    sourceEndpoint: string
  }
  snapshot: {
    snapshotId: string
    capturedBucket: string
  }
  artifact: StoredObjectArtifact
  outbox: NewStoredOutboxMessage
}

export interface UpsertBilibiliFollowerMonitorSnapshotInput {
  mode?: "add" | "collect"
  monitor: {
    monitorId: string
    mid: string
    nickname: string
    avatarUrl: string | null
    profileUrl: string
    followerCount: number
    followingCount: number | null
    intervalSeconds: number
    nextCollectAt: string
    capturedAt: string
    sourceEndpoint: string
  }
  snapshot: {
    snapshotId: string
    capturedBucket: string
  }
  artifact: StoredObjectArtifact
  outbox: NewStoredOutboxMessage
}

export class ControlDatabase {
  private transactionDepth = 0

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
    if (Number(version.user_version) < 3) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE object_artifact (
          object_id TEXT PRIMARY KEY,
          sha256 TEXT NOT NULL UNIQUE,
          relative_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          media_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK(object_id = 'sha256:' || sha256),
          CHECK(length(sha256) = 64),
          CHECK(size_bytes >= 0)
        );

        CREATE TABLE bilibili_follower_monitor (
          monitor_id TEXT PRIMARY KEY,
          mid TEXT NOT NULL UNIQUE,
          nickname TEXT NOT NULL,
          avatar_url TEXT,
          profile_url TEXT NOT NULL,
          current_follower_count INTEGER,
          following_count INTEGER,
          monitor_status TEXT NOT NULL DEFAULT 'ACTIVE',
          interval_seconds INTEGER NOT NULL DEFAULT 3600,
          next_collect_at TEXT,
          last_snapshot_at TEXT,
          last_success_at TEXT,
          last_error_at TEXT,
          last_error_type TEXT,
          last_error_message TEXT,
          source_endpoint TEXT,
          current_evidence_object_id TEXT REFERENCES object_artifact(object_id),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(length(mid) > 0 AND substr(mid, 1, 1) <> '0' AND mid NOT GLOB '*[^0-9]*'),
          CHECK(length(trim(nickname)) > 0),
          CHECK(monitor_status IN ('ACTIVE', 'PAUSED')),
          CHECK(interval_seconds BETWEEN 1 AND 2592000),
          CHECK(current_follower_count IS NULL OR current_follower_count >= 0),
          CHECK(following_count IS NULL OR following_count >= 0)
        );
        CREATE INDEX idx_bilibili_follower_monitor_due
          ON bilibili_follower_monitor(monitor_status, next_collect_at);
        CREATE INDEX idx_bilibili_follower_monitor_list
          ON bilibili_follower_monitor(monitor_status, current_follower_count DESC, monitor_id);

        CREATE TABLE bilibili_follower_snapshot (
          snapshot_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_follower_monitor(monitor_id) ON DELETE CASCADE,
          mid TEXT NOT NULL,
          follower_count INTEGER NOT NULL,
          following_count INTEGER,
          captured_at TEXT NOT NULL,
          captured_bucket TEXT NOT NULL,
          source_endpoint TEXT NOT NULL,
          evidence_object_id TEXT NOT NULL REFERENCES object_artifact(object_id),
          created_at TEXT NOT NULL,
          UNIQUE(monitor_id, captured_bucket),
          CHECK(follower_count >= 0),
          CHECK(following_count IS NULL OR following_count >= 0)
        );
        CREATE INDEX idx_bilibili_follower_snapshot_lookup
          ON bilibili_follower_snapshot(monitor_id, captured_at);
        CREATE INDEX idx_bilibili_follower_snapshot_mid_time
          ON bilibili_follower_snapshot(mid, captured_at);

        CREATE TABLE bilibili_api_call (
          call_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          endpoint_key TEXT NOT NULL,
          mid TEXT NOT NULL,
          status_code INTEGER,
          duration_ms INTEGER NOT NULL,
          error_type TEXT,
          retryable INTEGER NOT NULL,
          evidence_object_id TEXT REFERENCES object_artifact(object_id),
          created_at TEXT NOT NULL,
          CHECK(attempt > 0),
          CHECK(duration_ms >= 0),
          CHECK(retryable IN (0, 1))
        );
        CREATE INDEX idx_bilibili_api_call_task ON bilibili_api_call(task_id, attempt);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 3;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 4) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_auth_credential (
          credential_id TEXT PRIMARY KEY,
          encrypted_payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'INVALID')),
          CHECK(length(encrypted_payload) > 0)
        );
        CREATE UNIQUE INDEX uq_bilibili_auth_credential_active
          ON bilibili_auth_credential(status)
          WHERE status = 'ACTIVE';
        CREATE INDEX idx_bilibili_auth_credential_status_updated
          ON bilibili_auth_credential(status, updated_at DESC);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 4;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 5) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_live_room_monitor (
          monitor_id TEXT PRIMARY KEY,
          uid TEXT NOT NULL UNIQUE,
          room_id TEXT NOT NULL UNIQUE,
          short_id TEXT,
          uname TEXT NOT NULL,
          face_url TEXT,
          title TEXT,
          cover_url TEXT,
          keyframe_url TEXT,
          area_id TEXT,
          area_name TEXT,
          parent_area_id TEXT,
          parent_area_name TEXT,
          live_status INTEGER NOT NULL DEFAULT 0,
          live_time TEXT,
          online_count INTEGER,
          attention_count INTEGER,
          monitor_status TEXT NOT NULL DEFAULT 'ACTIVE',
          interval_seconds INTEGER NOT NULL DEFAULT 300,
          next_collect_at TEXT,
          last_snapshot_at TEXT,
          last_success_at TEXT,
          last_error_at TEXT,
          last_error_type TEXT,
          last_error_message TEXT,
          backoff_until TEXT,
          source_endpoint TEXT,
          current_evidence_object_id TEXT REFERENCES object_artifact(object_id),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(uid NOT GLOB '*[^0-9]*' AND length(uid) > 0 AND substr(uid, 1, 1) <> '0'),
          CHECK(room_id NOT GLOB '*[^0-9]*' AND length(room_id) > 0 AND substr(room_id, 1, 1) <> '0'),
          CHECK(live_status IN (0, 1, 2)),
          CHECK(monitor_status IN ('ACTIVE', 'PAUSED')),
          CHECK(interval_seconds BETWEEN 1 AND 2592000),
          CHECK(online_count IS NULL OR online_count >= 0),
          CHECK(attention_count IS NULL OR attention_count >= 0)
        );
        CREATE INDEX idx_bilibili_live_room_monitor_due
          ON bilibili_live_room_monitor(monitor_status, next_collect_at);
        CREATE INDEX idx_bilibili_live_room_monitor_status
          ON bilibili_live_room_monitor(live_status, monitor_status);

        CREATE TABLE bilibili_live_room_snapshot (
          snapshot_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          uid TEXT NOT NULL,
          room_id TEXT NOT NULL,
          live_status INTEGER NOT NULL,
          title TEXT,
          area_id TEXT,
          area_name TEXT,
          parent_area_id TEXT,
          parent_area_name TEXT,
          online_count INTEGER,
          attention_count INTEGER,
          live_time TEXT,
          source_endpoint TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          captured_bucket TEXT NOT NULL,
          evidence_object_id TEXT NOT NULL REFERENCES object_artifact(object_id),
          created_at TEXT NOT NULL,
          UNIQUE(monitor_id, captured_bucket),
          CHECK(live_status IN (0, 1, 2)),
          CHECK(online_count IS NULL OR online_count >= 0),
          CHECK(attention_count IS NULL OR attention_count >= 0)
        );
        CREATE INDEX idx_bilibili_live_snapshot_monitor_time
          ON bilibili_live_room_snapshot(monitor_id, captured_at);
        CREATE INDEX idx_bilibili_live_snapshot_room_time
          ON bilibili_live_room_snapshot(room_id, captured_at);

        CREATE TABLE bilibili_live_status_event (
          event_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          uid TEXT NOT NULL,
          room_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          from_live_status INTEGER,
          to_live_status INTEGER,
          title_before TEXT,
          title_after TEXT,
          online_count INTEGER,
          occurred_at TEXT NOT NULL,
          CHECK(event_type IN ('LIVE_STARTED', 'LIVE_ENDED', 'ROUND_STARTED', 'TITLE_CHANGED', 'ERROR_OCCURRED', 'ERROR_RECOVERED'))
        );
        CREATE INDEX idx_bilibili_live_event_time
          ON bilibili_live_status_event(occurred_at DESC, event_id DESC);
        CREATE INDEX idx_bilibili_live_event_room_time
          ON bilibili_live_status_event(room_id, occurred_at DESC);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 5;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 6) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_live_rank_snapshot (
          snapshot_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          ruid TEXT NOT NULL,
          rank_family TEXT NOT NULL,
          rank_type TEXT NOT NULL,
          rank_switch TEXT,
          period_scope TEXT,
          page_no INTEGER NOT NULL,
          page_size INTEGER NOT NULL,
          total_count INTEGER,
          count_text TEXT,
          value_text TEXT,
          remind_msg TEXT,
          source_endpoint TEXT NOT NULL,
          signed_required INTEGER NOT NULL DEFAULT 0,
          captured_at TEXT NOT NULL,
          captured_bucket TEXT NOT NULL,
          evidence_object_id TEXT NOT NULL REFERENCES object_artifact(object_id),
          created_at TEXT NOT NULL,
          CHECK(rank_family IN ('AUDIENCE', 'GUARD')),
          CHECK(page_no BETWEEN 1 AND 5),
          CHECK(page_size BETWEEN 1 AND 100),
          CHECK(total_count IS NULL OR total_count >= 0),
          CHECK(signed_required IN (0, 1))
        );
        CREATE UNIQUE INDEX uq_bilibili_live_rank_snapshot_bucket
          ON bilibili_live_rank_snapshot(
            monitor_id,
            rank_family,
            rank_type,
            COALESCE(rank_switch, ''),
            COALESCE(period_scope, ''),
            captured_bucket,
            page_no
          );
        CREATE INDEX idx_bilibili_live_rank_snapshot_latest
          ON bilibili_live_rank_snapshot(monitor_id, rank_family, rank_type, captured_at DESC);

        CREATE TABLE bilibili_live_rank_entry (
          entry_id TEXT PRIMARY KEY,
          snapshot_id TEXT NOT NULL REFERENCES bilibili_live_rank_snapshot(snapshot_id) ON DELETE CASCADE,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          ruid TEXT NOT NULL,
          user_uid TEXT,
          rank_no INTEGER,
          entry_kind TEXT NOT NULL,
          display_name TEXT,
          face_url TEXT,
          score INTEGER,
          guard_level INTEGER,
          wealth_level INTEGER,
          medal_name TEXT,
          medal_level INTEGER,
          guard_expired_text TEXT,
          accompany_days INTEGER,
          created_at TEXT NOT NULL,
          CHECK(rank_no IS NULL OR rank_no > 0),
          CHECK(score IS NULL OR score >= 0),
          CHECK(guard_level IS NULL OR guard_level >= 0),
          CHECK(wealth_level IS NULL OR wealth_level >= 0),
          CHECK(medal_level IS NULL OR medal_level >= 0),
          CHECK(accompany_days IS NULL OR accompany_days >= 0)
        );
        CREATE INDEX idx_bilibili_live_rank_entry_snapshot
          ON bilibili_live_rank_entry(snapshot_id, rank_no);
        CREATE INDEX idx_bilibili_live_rank_entry_user
          ON bilibili_live_rank_entry(user_uid, room_id, created_at DESC);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 6;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 7) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_live_danmaku_session (
          session_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          connected_at TEXT,
          ended_at TEXT,
          status TEXT NOT NULL,
          connect_host TEXT,
          reconnect_count INTEGER NOT NULL DEFAULT 0,
          last_heartbeat_at TEXT,
          last_error_at TEXT,
          last_error_type TEXT,
          last_error_message TEXT,
          created_at TEXT NOT NULL,
          CHECK(status IN ('CONNECTING', 'AUTHENTICATING', 'CONNECTED', 'CLOSED', 'STOPPED', 'ERROR')),
          CHECK(reconnect_count >= 0)
        );
        CREATE INDEX idx_bilibili_live_danmaku_session_room_time
          ON bilibili_live_danmaku_session(monitor_id, started_at DESC, session_id DESC);
        CREATE INDEX idx_bilibili_live_danmaku_session_status
          ON bilibili_live_danmaku_session(status);

        CREATE TABLE bilibili_live_danmaku_metric_bucket (
          bucket_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          session_id TEXT REFERENCES bilibili_live_danmaku_session(session_id) ON DELETE SET NULL,
          room_id TEXT NOT NULL,
          bucket_start TEXT NOT NULL,
          bucket_seconds INTEGER NOT NULL DEFAULT 60,
          danmu_count INTEGER NOT NULL DEFAULT 0,
          like_count INTEGER,
          like_increment INTEGER NOT NULL DEFAULT 0,
          watched_count INTEGER,
          heartbeat_popularity INTEGER,
          gift_count INTEGER NOT NULL DEFAULT 0,
          super_chat_count INTEGER NOT NULL DEFAULT 0,
          raw_event_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(monitor_id, bucket_start, bucket_seconds),
          CHECK(bucket_seconds BETWEEN 10 AND 3600),
          CHECK(danmu_count >= 0 AND like_increment >= 0 AND gift_count >= 0 AND super_chat_count >= 0 AND raw_event_count >= 0),
          CHECK(like_count IS NULL OR like_count >= 0),
          CHECK(watched_count IS NULL OR watched_count >= 0),
          CHECK(heartbeat_popularity IS NULL OR heartbeat_popularity >= 0)
        );
        CREATE INDEX idx_bilibili_live_danmaku_bucket_room_time
          ON bilibili_live_danmaku_metric_bucket(monitor_id, bucket_start DESC);

        CREATE TABLE bilibili_live_danmaku_recent (
          recent_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          sender_uid TEXT,
          message_text TEXT NOT NULL,
          display_name TEXT,
          medal_name TEXT,
          sent_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK(sender_uid IS NULL OR (sender_uid NOT GLOB '*[^0-9]*' AND length(sender_uid) > 0 AND substr(sender_uid, 1, 1) <> '0'))
        );
        CREATE INDEX idx_bilibili_live_danmaku_recent_room_time
          ON bilibili_live_danmaku_recent(monitor_id, sent_at DESC, recent_id DESC);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 7;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 8) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_live_session (
          session_id TEXT PRIMARY KEY,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          uid TEXT NOT NULL,
          room_id TEXT NOT NULL,
          state TEXT NOT NULL,
          platform_live_time TEXT,
          live_key TEXT NOT NULL,
          started_at TEXT NOT NULL,
          start_detected_at TEXT NOT NULL,
          start_source TEXT NOT NULL,
          end_signal_at TEXT,
          ended_at TEXT,
          end_detected_at TEXT,
          end_source TEXT,
          last_live_observed_at TEXT,
          last_observed_at TEXT NOT NULL,
          title_at_start TEXT,
          title_at_end TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(uid NOT GLOB '*[^0-9]*' AND length(uid) > 0 AND substr(uid, 1, 1) <> '0'),
          CHECK(room_id NOT GLOB '*[^0-9]*' AND length(room_id) > 0 AND substr(room_id, 1, 1) <> '0'),
          CHECK(state IN ('OPEN', 'END_PENDING', 'CLOSED', 'INCOMPLETE')),
          CHECK(ended_at IS NULL OR ended_at >= started_at)
        );
        CREATE UNIQUE INDEX ux_bilibili_live_session_active
          ON bilibili_live_session(monitor_id)
          WHERE state IN ('OPEN', 'END_PENDING');
        CREATE UNIQUE INDEX ux_bilibili_live_session_platform_time
          ON bilibili_live_session(monitor_id, platform_live_time)
          WHERE platform_live_time IS NOT NULL;
        CREATE UNIQUE INDEX ux_bilibili_live_session_live_key
          ON bilibili_live_session(monitor_id, live_key);
        CREATE INDEX idx_bilibili_live_session_monitor_started
          ON bilibili_live_session(monitor_id, started_at DESC, session_id DESC);

        CREATE TABLE bilibili_live_session_event (
          event_id TEXT PRIMARY KEY,
          live_session_id TEXT NOT NULL REFERENCES bilibili_live_session(session_id) ON DELETE CASCADE,
          transport_session_id TEXT REFERENCES bilibili_live_danmaku_session(session_id) ON DELETE SET NULL,
          receipt_ordinal INTEGER NOT NULL,
          monitor_id TEXT NOT NULL REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          event_key TEXT NOT NULL,
          source_event_id TEXT,
          event_kind TEXT NOT NULL,
          command TEXT,
          protocol_version INTEGER,
          sender_uid TEXT,
          sender_name TEXT,
          medal_name TEXT,
          message_text TEXT,
          gift_id TEXT,
          gift_name TEXT,
          gift_count INTEGER,
          coin_type TEXT,
          unit_price_milli_yuan INTEGER,
          paid_amount_milli_yuan INTEGER,
          paid INTEGER NOT NULL DEFAULT 0,
          guard_level INTEGER,
          amount_source TEXT,
          occurred_at TEXT NOT NULL,
          received_at TEXT NOT NULL,
          raw_payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          UNIQUE(live_session_id, event_key),
          CHECK(room_id NOT GLOB '*[^0-9]*' AND length(room_id) > 0 AND substr(room_id, 1, 1) <> '0'),
          CHECK(protocol_version IS NULL OR protocol_version >= 0),
          CHECK(receipt_ordinal > 0),
          CHECK(sender_uid IS NULL OR (sender_uid NOT GLOB '*[^0-9]*' AND length(sender_uid) > 0 AND substr(sender_uid, 1, 1) <> '0')),
          CHECK(gift_id IS NULL OR (gift_id NOT GLOB '*[^0-9]*' AND length(gift_id) > 0 AND substr(gift_id, 1, 1) <> '0')),
          CHECK(gift_count IS NULL OR gift_count >= 0),
          CHECK(unit_price_milli_yuan IS NULL OR unit_price_milli_yuan >= 0),
          CHECK(paid_amount_milli_yuan IS NULL OR paid_amount_milli_yuan >= 0),
          CHECK(paid IN (0, 1)),
          CHECK(guard_level IS NULL OR guard_level >= 0)
        );
        CREATE INDEX idx_bilibili_live_session_event_session_time
          ON bilibili_live_session_event(live_session_id, occurred_at ASC, event_id ASC);
        CREATE INDEX idx_bilibili_live_session_event_session_kind_time
          ON bilibili_live_session_event(live_session_id, event_kind, occurred_at ASC, event_id ASC);
        CREATE INDEX idx_bilibili_live_session_event_transport_time
          ON bilibili_live_session_event(transport_session_id, received_at ASC, event_id ASC)
          WHERE transport_session_id IS NOT NULL;
        CREATE INDEX idx_bilibili_live_session_event_monitor_kind_time
          ON bilibili_live_session_event(monitor_id, event_kind, occurred_at DESC);
        CREATE INDEX idx_bilibili_live_session_event_sender_time
          ON bilibili_live_session_event(sender_uid, occurred_at DESC)
          WHERE sender_uid IS NOT NULL;
        CREATE INDEX idx_bilibili_live_session_event_source
          ON bilibili_live_session_event(monitor_id, source_event_id)
          WHERE source_event_id IS NOT NULL;
        CREATE UNIQUE INDEX ux_bilibili_live_session_event_strong_source
          ON bilibili_live_session_event(monitor_id, event_kind, source_event_id)
          WHERE source_event_id IS NOT NULL AND source_event_id NOT LIKE 'semantic:%';

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 8;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 9) {
      database.exec(`
        BEGIN IMMEDIATE;

        WITH ordered_starts AS (
          SELECT start_event.*,
                 LEAD(start_event.occurred_at) OVER (
                   PARTITION BY start_event.monitor_id
                   ORDER BY start_event.occurred_at, start_event.event_id
                 ) AS next_started_at
          FROM bilibili_live_status_event start_event
          WHERE start_event.event_type = 'LIVE_STARTED'
        ), paired_boundaries AS (
          SELECT start_event.*,
                 (
                   SELECT end_event.occurred_at
                   FROM bilibili_live_status_event end_event
                   WHERE end_event.monitor_id = start_event.monitor_id
                     AND end_event.event_type = 'LIVE_ENDED'
                     AND end_event.occurred_at >= start_event.occurred_at
                     AND (
                       start_event.next_started_at IS NULL
                       OR end_event.occurred_at < start_event.next_started_at
                     )
                   ORDER BY end_event.occurred_at, end_event.event_id
                   LIMIT 1
                 ) AS ended_at,
                 (
                   SELECT end_event.title_after
                   FROM bilibili_live_status_event end_event
                   WHERE end_event.monitor_id = start_event.monitor_id
                     AND end_event.event_type = 'LIVE_ENDED'
                     AND end_event.occurred_at >= start_event.occurred_at
                     AND (
                       start_event.next_started_at IS NULL
                       OR end_event.occurred_at < start_event.next_started_at
                     )
                   ORDER BY end_event.occurred_at, end_event.event_id
                   LIMIT 1
                 ) AS title_at_end
          FROM ordered_starts start_event
        )
        INSERT OR IGNORE INTO bilibili_live_session (
          session_id, monitor_id, uid, room_id, state, platform_live_time, live_key,
          started_at, start_detected_at, start_source, end_signal_at, ended_at,
          end_detected_at, end_source, last_live_observed_at, last_observed_at,
          title_at_start, title_at_end, created_at, updated_at
        )
        SELECT
          event_id, monitor_id, uid, room_id, 'CLOSED', NULL, 'status-event:' || event_id,
          occurred_at, occurred_at, 'STATUS_EVENT_BACKFILL', ended_at, ended_at,
          ended_at, 'STATUS_EVENT_BACKFILL', occurred_at, ended_at,
          title_after, title_at_end, occurred_at, ended_at
        FROM paired_boundaries
        WHERE ended_at IS NOT NULL;

        WITH ordered_starts AS (
          SELECT start_event.*,
                 LEAD(start_event.occurred_at) OVER (
                   PARTITION BY start_event.monitor_id
                   ORDER BY start_event.occurred_at, start_event.event_id
                 ) AS next_started_at
          FROM bilibili_live_status_event start_event
          WHERE start_event.event_type = 'LIVE_STARTED'
        ), unpaired_starts AS (
          SELECT start_event.*
          FROM ordered_starts start_event
          WHERE NOT EXISTS (
            SELECT 1
            FROM bilibili_live_status_event end_event
            WHERE end_event.monitor_id = start_event.monitor_id
              AND end_event.event_type = 'LIVE_ENDED'
              AND end_event.occurred_at >= start_event.occurred_at
              AND (
                start_event.next_started_at IS NULL
                OR end_event.occurred_at < start_event.next_started_at
              )
          )
          AND NOT (
            start_event.next_started_at IS NULL
            AND EXISTS (
              SELECT 1 FROM bilibili_live_room_monitor current_room
              WHERE current_room.monitor_id = start_event.monitor_id
                AND current_room.live_status = 1
            )
          )
        )
        INSERT OR IGNORE INTO bilibili_live_session (
          session_id, monitor_id, uid, room_id, state, platform_live_time, live_key,
          started_at, start_detected_at, start_source, end_signal_at, ended_at,
          end_detected_at, end_source, last_live_observed_at, last_observed_at,
          title_at_start, title_at_end, created_at, updated_at
        )
        SELECT
          event_id, monitor_id, uid, room_id, 'INCOMPLETE', NULL, 'status-event:' || event_id,
          occurred_at, occurred_at, 'STATUS_EVENT_BACKFILL_INCOMPLETE', NULL, NULL,
          NULL, 'UNKNOWN', occurred_at, occurred_at,
          title_after, NULL, occurred_at, occurred_at
        FROM unpaired_starts;

        INSERT OR IGNORE INTO bilibili_live_session (
          session_id, monitor_id, uid, room_id, state, platform_live_time, live_key,
          started_at, start_detected_at, start_source, end_signal_at, ended_at,
          end_detected_at, end_source, last_live_observed_at, last_observed_at,
          title_at_start, title_at_end, created_at, updated_at
        )
        SELECT
          room.monitor_id, room.monitor_id, room.uid, room.room_id, 'OPEN', room.live_time,
          CASE
            WHEN room.live_time IS NOT NULL THEN 'platform:' || room.live_time
            ELSE 'migration-current:' || room.monitor_id
          END,
          COALESCE(room.live_time, room.last_success_at, room.last_snapshot_at, room.updated_at),
          COALESCE(room.last_success_at, room.last_snapshot_at, room.updated_at),
          'MIGRATION_CURRENT_STATE', NULL, NULL, NULL, NULL,
          COALESCE(room.last_success_at, room.last_snapshot_at, room.updated_at),
          COALESCE(room.last_success_at, room.last_snapshot_at, room.updated_at),
          room.title, NULL,
          COALESCE(room.last_success_at, room.last_snapshot_at, room.updated_at),
          COALESCE(room.last_success_at, room.last_snapshot_at, room.updated_at)
        FROM bilibili_live_room_monitor room
        WHERE room.live_status = 1;

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 9;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 10) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_monitored_subject (
          subject_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          avatar_url TEXT,
          remark TEXT,
          tags_json TEXT NOT NULL DEFAULT '[]',
          monitor_status TEXT NOT NULL DEFAULT 'ACTIVE',
          health_score REAL,
          last_success_at TEXT,
          last_event_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(length(trim(display_name)) > 0),
          CHECK(json_valid(tags_json)),
          CHECK(monitor_status IN ('ACTIVE', 'PAUSED')),
          CHECK(health_score IS NULL OR (health_score >= 0 AND health_score <= 100))
        );
        CREATE INDEX idx_bilibili_monitored_subject_status
          ON bilibili_monitored_subject(monitor_status, updated_at DESC, subject_id);

        CREATE TABLE bilibili_subject_binding (
          binding_id TEXT PRIMARY KEY,
          subject_id TEXT NOT NULL UNIQUE REFERENCES bilibili_monitored_subject(subject_id) ON DELETE CASCADE,
          bilibili_user_monitor_id TEXT REFERENCES bilibili_follower_monitor(monitor_id) ON DELETE SET NULL,
          bilibili_live_room_monitor_id TEXT REFERENCES bilibili_live_room_monitor(monitor_id) ON DELETE SET NULL,
          mid TEXT,
          room_id TEXT,
          enabled_capabilities_json TEXT NOT NULL DEFAULT '["follower","live_heat"]',
          danmu_enabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(json_valid(enabled_capabilities_json)),
          CHECK(danmu_enabled IN (0, 1)),
          CHECK(mid IS NULL OR (mid NOT GLOB '*[^0-9]*' AND length(mid) > 0 AND substr(mid, 1, 1) <> '0')),
          CHECK(room_id IS NULL OR (room_id NOT GLOB '*[^0-9]*' AND length(room_id) > 0 AND substr(room_id, 1, 1) <> '0'))
        );
        CREATE INDEX idx_bilibili_subject_binding_user
          ON bilibili_subject_binding(bilibili_user_monitor_id);
        CREATE INDEX idx_bilibili_subject_binding_live
          ON bilibili_subject_binding(bilibili_live_room_monitor_id);

        CREATE TABLE bilibili_subject_widget_layout (
          layout_id TEXT PRIMARY KEY,
          subject_id TEXT NOT NULL REFERENCES bilibili_monitored_subject(subject_id) ON DELETE CASCADE,
          widget_key TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          position_json TEXT NOT NULL DEFAULT '{}',
          settings_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(subject_id, widget_key),
          CHECK(length(trim(widget_key)) > 0),
          CHECK(enabled IN (0, 1)),
          CHECK(json_valid(position_json)),
          CHECK(json_valid(settings_json))
        );
        CREATE INDEX idx_bilibili_subject_widget_layout_subject
          ON bilibili_subject_widget_layout(subject_id, enabled, widget_key);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 10;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 11) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE douyin_auth_session (
          login_id TEXT PRIMARY KEY,
          flow_type TEXT NOT NULL,
          provider_mode TEXT NOT NULL,
          worker_session_id TEXT,
          state TEXT,
          status TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          completed_at TEXT,
          error_code TEXT,
          error_message TEXT,
          raw_result_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(flow_type IN ('OAUTH_LOGIN', 'OAUTH_REFRESH', 'WEB_QR')),
          CHECK(provider_mode IN ('disabled', 'live')),
          CHECK(status IN ('STARTING', 'WAITING', 'SCANNED', 'VALIDATING', 'SUCCESS', 'EXPIRED', 'USER_ACTION_REQUIRED', 'FAILED')),
          CHECK(json_valid(raw_result_json))
        );
        CREATE UNIQUE INDEX ux_douyin_auth_session_state
          ON douyin_auth_session(state) WHERE state IS NOT NULL;
        CREATE UNIQUE INDEX ux_douyin_auth_session_worker
          ON douyin_auth_session(worker_session_id) WHERE worker_session_id IS NOT NULL;
        CREATE INDEX idx_douyin_auth_session_status_expires
          ON douyin_auth_session(status, expires_at);

        CREATE TABLE douyin_auth_credential (
          credential_id TEXT PRIMARY KEY,
          auth_type TEXT NOT NULL,
          encrypted_payload TEXT NOT NULL,
          status TEXT NOT NULL,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK(auth_type IN ('DOUYIN_OAUTH2', 'DOUYIN_WEB_SESSION')),
          CHECK(status IN ('ACTIVE', 'INVALID', 'REVOKED'))
        );
        CREATE UNIQUE INDEX ux_douyin_auth_credential_active
          ON douyin_auth_credential(auth_type) WHERE status = 'ACTIVE';
        CREATE INDEX idx_douyin_auth_credential_status_updated
          ON douyin_auth_credential(auth_type, status, updated_at DESC);

        INSERT OR IGNORE INTO schema_migration(version, applied_at)
        VALUES (11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 11;
        COMMIT;
      `)
    }
    if (Number(version.user_version) < 12) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE bilibili_live_export_daily_counter (
          uid TEXT NOT NULL,
          export_date TEXT NOT NULL,
          export_count INTEGER NOT NULL CHECK (typeof(export_count) = 'integer' AND export_count > 0),
          PRIMARY KEY (uid, export_date)
        );
        INSERT INTO schema_migration(version, applied_at)
        VALUES (12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 12;
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

  createDouyinAuthSession(session: StoredDouyinAuthSession): void {
    this.database.prepare(`
      INSERT INTO douyin_auth_session (
        login_id, flow_type, provider_mode, worker_session_id, state, status,
        expires_at, completed_at, error_code, error_message, raw_result_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.loginId,
      session.flowType,
      session.providerMode,
      session.workerSessionId,
      session.state,
      session.status,
      session.expiresAt,
      session.completedAt,
      session.errorCode,
      session.errorMessage,
      session.rawResultJson,
      session.createdAt,
      session.updatedAt
    )
  }

  findDouyinAuthSessionById(loginId: string): StoredDouyinAuthSession | undefined {
    return this.database.prepare(`${douyinAuthSessionSelect()} WHERE login_id = ?`).get(
      loginId
    ) as unknown as StoredDouyinAuthSession | undefined
  }

  findDouyinAuthSessionByState(state: string): StoredDouyinAuthSession | undefined {
    return this.database.prepare(`${douyinAuthSessionSelect()} WHERE state = ?`).get(
      state
    ) as unknown as StoredDouyinAuthSession | undefined
  }

  findLatestDouyinOAuthSession(): StoredDouyinAuthSession | undefined {
    return this.database.prepare(`
      ${douyinAuthSessionSelect()}
      WHERE flow_type = 'OAUTH_LOGIN'
      ORDER BY created_at DESC, login_id DESC
      LIMIT 1
    `).get() as unknown as StoredDouyinAuthSession | undefined
  }

  tryClaimDouyinOAuthSession(loginId: string, rawResultJson: string, updatedAt: string): boolean {
    return Number(this.database.prepare(`
      UPDATE douyin_auth_session
      SET status = 'VALIDATING', raw_result_json = ?, error_code = NULL,
          error_message = NULL, updated_at = ?
      WHERE login_id = ? AND flow_type = 'OAUTH_LOGIN' AND status = 'WAITING'
    `).run(rawResultJson, updatedAt, loginId).changes) === 1
  }

  attachDouyinWorkerSession(
    loginId: string,
    workerSessionId: string,
    status: string,
    rawResultJson: string,
    updatedAt: string
  ): void {
    this.database.prepare(`
      UPDATE douyin_auth_session
      SET worker_session_id = ?, status = ?, raw_result_json = ?, updated_at = ?
      WHERE login_id = ?
    `).run(workerSessionId, status, rawResultJson, updatedAt, loginId)
  }

  updateDouyinAuthSession(input: {
    loginId: string
    status: string
    rawResultJson: string
    updatedAt: string
    completedAt?: string | null
    errorCode?: string | null
    errorMessage?: string | null
  }): void {
    this.database.prepare(`
      UPDATE douyin_auth_session SET
        status = ?, raw_result_json = ?, updated_at = ?,
        completed_at = CASE WHEN ? IS NULL THEN completed_at ELSE ? END,
        error_code = ?, error_message = ?
      WHERE login_id = ?
    `).run(
      input.status,
      input.rawResultJson,
      input.updatedAt,
      input.completedAt ?? null,
      input.completedAt ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.loginId
    )
  }

  saveActiveDouyinCredential(input: NewStoredDouyinAuthCredential): StoredDouyinAuthCredential {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE douyin_auth_credential
        SET status = 'REVOKED', updated_at = ?
        WHERE auth_type = ? AND status = 'ACTIVE'
      `).run(input.updatedAt, input.authType)
      this.database.prepare(`
        INSERT INTO douyin_auth_credential (
          credential_id, auth_type, encrypted_payload, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        input.credentialId,
        input.authType,
        input.encryptedPayload,
        input.expiresAt,
        input.createdAt,
        input.updatedAt
      )
    })
    return this.findDouyinCredentialById(input.credentialId)!
  }

  replaceActiveDouyinCredentialIfCurrent(
    expectedCredentialId: string,
    input: NewStoredDouyinAuthCredential
  ): StoredDouyinAuthCredential | undefined {
    const replaced = this.transaction(() => {
      const active = this.database.prepare(`
        SELECT credential_id AS credentialId
        FROM douyin_auth_credential
        WHERE auth_type = ? AND status = 'ACTIVE'
        ORDER BY updated_at DESC, credential_id DESC LIMIT 1
      `).get(input.authType) as { credentialId: string } | undefined
      if (active?.credentialId !== expectedCredentialId) return false

      const revoked = this.database.prepare(`
        UPDATE douyin_auth_credential
        SET status = 'REVOKED', updated_at = ?
        WHERE credential_id = ? AND auth_type = ? AND status = 'ACTIVE'
      `).run(input.updatedAt, expectedCredentialId, input.authType)
      if (Number(revoked.changes) !== 1) return false

      this.database.prepare(`
        INSERT INTO douyin_auth_credential (
          credential_id, auth_type, encrypted_payload, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        input.credentialId,
        input.authType,
        input.encryptedPayload,
        input.expiresAt,
        input.createdAt,
        input.updatedAt
      )
      return true
    })
    return replaced ? this.findDouyinCredentialById(input.credentialId) : undefined
  }

  findActiveDouyinCredential(authType: string): StoredDouyinAuthCredential | undefined {
    return this.database.prepare(`${douyinCredentialSelect()}
      WHERE auth_type = ? AND status = 'ACTIVE'
      ORDER BY updated_at DESC LIMIT 1
    `).get(authType) as unknown as StoredDouyinAuthCredential | undefined
  }

  findDouyinCredentialById(credentialId: string): StoredDouyinAuthCredential | undefined {
    return this.database.prepare(`${douyinCredentialSelect()} WHERE credential_id = ?`).get(
      credentialId
    ) as unknown as StoredDouyinAuthCredential | undefined
  }

  markDouyinCredentialStatus(
    credentialId: string,
    status: "INVALID" | "REVOKED",
    updatedAt: string
  ): boolean {
    return Number(this.database.prepare(`
      UPDATE douyin_auth_credential SET status = ?, updated_at = ?
      WHERE credential_id = ? AND status = 'ACTIVE'
    `).run(status, updatedAt, credentialId).changes) > 0
  }

  revokeActiveDouyinCredential(authType: string, updatedAt: string): boolean {
    return Number(this.database.prepare(`
      UPDATE douyin_auth_credential SET status = 'REVOKED', updated_at = ?
      WHERE auth_type = ? AND status = 'ACTIVE'
    `).run(updatedAt, authType).changes) > 0
  }

  createBilibiliSubject(
    bundle: NewStoredBilibiliSubjectBundle,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      const subject = bundle.subject
      this.database.prepare(`
        INSERT INTO bilibili_monitored_subject (
          subject_id, display_name, avatar_url, remark, tags_json, monitor_status,
          health_score, last_success_at, last_event_at, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subject.subjectId,
        subject.displayName,
        subject.avatarUrl,
        subject.remark,
        JSON.stringify(subject.tags),
        subject.monitorStatus,
        subject.healthScore,
        subject.lastSuccessAt,
        subject.lastEventAt,
        subject.version,
        subject.createdAt,
        subject.updatedAt
      )
      if (bundle.binding) this.upsertBilibiliSubjectBinding(bundle.binding)
      for (const layout of bundle.layouts) this.upsertBilibiliSubjectLayout(layout)
      this.insertOutbox(outbox)
    })
  }

  listBilibiliSubjects(limit: number): StoredBilibiliSubject[] {
    return (this.database.prepare(`${bilibiliSubjectSelect()}
      ORDER BY monitor_status ASC, updated_at DESC, subject_id ASC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[]).map(toStoredBilibiliSubject)
  }

  findBilibiliSubjectById(subjectId: string): StoredBilibiliSubject | undefined {
    const row = this.database.prepare(`${bilibiliSubjectSelect()}
      WHERE subject_id = ?
    `).get(subjectId) as Record<string, unknown> | undefined
    return row ? toStoredBilibiliSubject(row) : undefined
  }

  updateBilibiliSubject(input: {
    subjectId: string
    displayName?: string
    avatarUrl?: string | null
    remark?: string | null
    tags?: string[]
    monitorStatus?: string
    updatedAt: string
  }): StoredBilibiliSubject | undefined {
    this.database.prepare(`
      UPDATE bilibili_monitored_subject SET
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        remark = COALESCE(?, remark),
        tags_json = CASE WHEN ? IS NULL THEN tags_json ELSE ? END,
        monitor_status = COALESCE(?, monitor_status),
        version = version + 1,
        updated_at = ?
      WHERE subject_id = ?
    `).run(
      input.displayName ?? null,
      input.avatarUrl ?? null,
      input.remark ?? null,
      input.tags === undefined ? null : JSON.stringify(input.tags),
      input.tags === undefined ? null : JSON.stringify(input.tags),
      input.monitorStatus ?? null,
      input.updatedAt,
      input.subjectId
    )
    return this.findBilibiliSubjectById(input.subjectId)
  }

  updateBilibiliSubjectHealth(input: {
    subjectId: string
    healthScore: number
    lastSuccessAt: string | null
    lastEventAt: string | null
    updatedAt: string
  }): void {
    this.database.prepare(`
      UPDATE bilibili_monitored_subject SET
        health_score = ?, last_success_at = ?, last_event_at = ?,
        version = version + 1, updated_at = ?
      WHERE subject_id = ?
    `).run(
      input.healthScore,
      input.lastSuccessAt,
      input.lastEventAt,
      input.updatedAt,
      input.subjectId
    )
  }

  deleteBilibiliSubject(subjectId: string, outbox: NewStoredOutboxMessage): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM bilibili_monitored_subject WHERE subject_id = ?").run(subjectId)
      this.insertOutbox(outbox)
    })
  }

  findBilibiliSubjectBinding(subjectId: string): StoredBilibiliSubjectBinding | undefined {
    const row = this.database.prepare(`
      SELECT binding_id AS bindingId,
             subject_id AS subjectId,
             bilibili_user_monitor_id AS bilibiliUserMonitorId,
             bilibili_live_room_monitor_id AS bilibiliLiveRoomMonitorId,
             mid,
             room_id AS roomId,
             enabled_capabilities_json AS enabledCapabilitiesJson,
             danmu_enabled AS danmuEnabled,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_subject_binding
      WHERE subject_id = ?
    `).get(subjectId) as Record<string, unknown> | undefined
    return row ? toStoredBilibiliSubjectBinding(row) : undefined
  }

  upsertBilibiliSubjectBinding(binding: StoredBilibiliSubjectBinding): void {
    this.database.prepare(`
      INSERT INTO bilibili_subject_binding (
        binding_id, subject_id, bilibili_user_monitor_id, bilibili_live_room_monitor_id,
        mid, room_id, enabled_capabilities_json, danmu_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_id) DO UPDATE SET
        bilibili_user_monitor_id = excluded.bilibili_user_monitor_id,
        bilibili_live_room_monitor_id = excluded.bilibili_live_room_monitor_id,
        mid = excluded.mid,
        room_id = excluded.room_id,
        enabled_capabilities_json = excluded.enabled_capabilities_json,
        danmu_enabled = excluded.danmu_enabled,
        updated_at = excluded.updated_at
    `).run(
      binding.bindingId,
      binding.subjectId,
      binding.bilibiliUserMonitorId,
      binding.bilibiliLiveRoomMonitorId,
      binding.mid,
      binding.roomId,
      JSON.stringify(binding.enabledCapabilities),
      binding.danmuEnabled ? 1 : 0,
      binding.createdAt,
      binding.updatedAt
    )
  }

  findBilibiliSubjectLayouts(
    subjectId: string,
    includeDisabled = false
  ): StoredBilibiliSubjectWidgetLayout[] {
    const rows = this.database.prepare(`
      SELECT layout_id AS layoutId,
             subject_id AS subjectId,
             widget_key AS widgetKey,
             enabled,
             position_json AS positionJson,
             settings_json AS settingsJson,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_subject_widget_layout
      WHERE subject_id = ? ${includeDisabled ? "" : "AND enabled = 1"}
      ORDER BY
        COALESCE(CAST(json_extract(position_json, '$.y') AS INTEGER), 0),
        COALESCE(CAST(json_extract(position_json, '$.x') AS INTEGER), 0),
        rowid ASC
    `).all(subjectId) as Record<string, unknown>[]
    return rows.map(toStoredBilibiliSubjectLayout)
  }

  replaceBilibiliSubjectLayouts(
    subjectId: string,
    layouts: StoredBilibiliSubjectWidgetLayout[]
  ): void {
    this.transaction(() => {
      this.database.prepare(
        "DELETE FROM bilibili_subject_widget_layout WHERE subject_id = ?"
      ).run(subjectId)
      for (const layout of layouts) this.upsertBilibiliSubjectLayout(layout)
    })
  }

  findBilibiliSubjectDanmakuRoomMonitorIds(): string[] {
    return (this.database.prepare(`
      SELECT binding.bilibili_live_room_monitor_id AS monitorId
      FROM bilibili_subject_binding binding
      JOIN bilibili_live_room_monitor room
        ON room.monitor_id = binding.bilibili_live_room_monitor_id
      WHERE binding.danmu_enabled = 1
        AND room.monitor_status = 'ACTIVE'
      ORDER BY CASE WHEN room.live_status = 1 THEN 0 ELSE 1 END, room.monitor_id
    `).all() as Array<{ monitorId: string }>).map((row) => row.monitorId)
  }

  private upsertBilibiliSubjectLayout(layout: StoredBilibiliSubjectWidgetLayout): void {
    this.database.prepare(`
      INSERT INTO bilibili_subject_widget_layout (
        layout_id, subject_id, widget_key, enabled, position_json, settings_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_id, widget_key) DO UPDATE SET
        enabled = excluded.enabled,
        position_json = excluded.position_json,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `).run(
      layout.layoutId,
      layout.subjectId,
      layout.widgetKey,
      layout.enabled ? 1 : 0,
      JSON.stringify(layout.position),
      JSON.stringify(layout.settings),
      layout.createdAt,
      layout.updatedAt
    )
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

  saveActiveBilibiliCredential(
    input: NewStoredBilibiliAuthCredential,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_auth_credential
        SET status = 'REVOKED', updated_at = ?
        WHERE status = 'ACTIVE'
      `).run(input.updatedAt)
      this.database.prepare(`
        UPDATE platform_account
        SET auth_state = 'revoked', version = version + 1, updated_at = ?
        WHERE platform = 'bilibili' AND auth_state = 'active'
      `).run(input.updatedAt)
      this.database.prepare(`
        INSERT INTO bilibili_auth_credential (
          credential_id, encrypted_payload, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        input.credentialId,
        input.encryptedPayload,
        input.expiresAt,
        input.createdAt,
        input.updatedAt
      )
      this.upsertBilibiliAuthAccount(input)
      this.insertOutbox(outbox)
    })
  }

  updateBilibiliCredentialValidation(
    input: Omit<NewStoredBilibiliAuthCredential, "createdAt">,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_auth_credential
        SET encrypted_payload = ?, expires_at = ?, status = 'ACTIVE', updated_at = ?
        WHERE credential_id = ?
      `).run(input.encryptedPayload, input.expiresAt, input.updatedAt, input.credentialId)
      this.upsertBilibiliAuthAccount({ ...input, createdAt: input.updatedAt })
      this.insertOutbox(outbox)
    })
  }

  findActiveBilibiliCredential(): StoredBilibiliAuthCredential | undefined {
    return this.database.prepare(`
      SELECT credential_id AS credentialId,
             encrypted_payload AS encryptedPayload,
             status,
             expires_at AS expiresAt,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_auth_credential
      WHERE status = 'ACTIVE'
      ORDER BY updated_at DESC, credential_id DESC
      LIMIT 1
    `).get() as unknown as StoredBilibiliAuthCredential | undefined
  }

  findBilibiliCredentialById(credentialId: string): StoredBilibiliAuthCredential | undefined {
    return this.database.prepare(`
      SELECT credential_id AS credentialId,
             encrypted_payload AS encryptedPayload,
             status,
             expires_at AS expiresAt,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_auth_credential
      WHERE credential_id = ?
    `).get(credentialId) as unknown as StoredBilibiliAuthCredential | undefined
  }

  markBilibiliCredentialStatus(
    credentialId: string,
    status: "ACTIVE" | "EXPIRED" | "REVOKED" | "INVALID",
    timestamp: string,
    outbox?: NewStoredOutboxMessage
  ): boolean {
    return this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE bilibili_auth_credential SET status = ?, updated_at = ? WHERE credential_id = ?
      `).run(status, timestamp, credentialId)
      if (status !== "ACTIVE") {
        this.database.prepare(`
          UPDATE platform_account
          SET auth_state = ?, version = version + 1, updated_at = ?
          WHERE platform = 'bilibili' AND secret_ref = ?
        `).run(status === "EXPIRED" || status === "INVALID" ? "expired" : "revoked", timestamp, credentialId)
      }
      if (outbox && result.changes > 0) this.insertOutbox(outbox)
      return result.changes > 0
    })
  }

  revokeActiveBilibiliCredential(timestamp: string, outbox: NewStoredOutboxMessage): boolean {
    return this.transaction(() => {
      const activeRows = this.database.prepare(`
        SELECT credential_id AS credentialId FROM bilibili_auth_credential WHERE status = 'ACTIVE'
      `).all() as unknown as Array<{ credentialId: string }>
      const result = this.database.prepare(`
        UPDATE bilibili_auth_credential
        SET status = 'REVOKED', updated_at = ?
        WHERE status = 'ACTIVE'
      `).run(timestamp)
      for (const credential of activeRows) {
        this.database.prepare(`
          UPDATE platform_account
          SET auth_state = 'revoked', version = version + 1, updated_at = ?
          WHERE platform = 'bilibili' AND secret_ref = ?
        `).run(timestamp, credential.credentialId)
      }
      if (result.changes > 0) this.insertOutbox(outbox)
      return result.changes > 0
    })
  }

  upsertBilibiliFollowerMonitorSnapshot(input: UpsertBilibiliFollowerMonitorSnapshotInput): void {
    this.transaction(() => {
      this.insertObjectArtifact(input.artifact)
      const monitor = input.monitor
      if (input.mode === "collect") {
        // A collection updates measurements, never the user's monitoring settings.
        const result = this.database.prepare(`
          UPDATE bilibili_follower_monitor SET
            nickname = ?, avatar_url = ?, profile_url = ?, current_follower_count = ?,
            following_count = ?, next_collect_at = ?, last_snapshot_at = ?, last_success_at = ?,
            last_error_at = NULL, last_error_type = NULL, last_error_message = NULL,
            source_endpoint = ?, current_evidence_object_id = ?, version = version + 1, updated_at = ?
          WHERE monitor_id = ? AND mid = ?
        `).run(
          monitor.nickname, monitor.avatarUrl, monitor.profileUrl, monitor.followerCount,
          monitor.followingCount, monitor.nextCollectAt, monitor.capturedAt, monitor.capturedAt,
          monitor.sourceEndpoint, input.artifact.objectId, monitor.capturedAt, monitor.monitorId, monitor.mid
        )
        if (result.changes === 0) throw new Error("Cannot collect a deleted follower monitor")
      } else this.database.prepare(`
        INSERT INTO bilibili_follower_monitor (
          monitor_id, mid, nickname, avatar_url, profile_url, current_follower_count,
          following_count, monitor_status, interval_seconds, next_collect_at,
          last_snapshot_at, last_success_at, source_endpoint, current_evidence_object_id,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(mid) DO UPDATE SET
          nickname = excluded.nickname,
          avatar_url = excluded.avatar_url,
          profile_url = excluded.profile_url,
          current_follower_count = excluded.current_follower_count,
          following_count = excluded.following_count,
          monitor_status = 'ACTIVE',
          interval_seconds = excluded.interval_seconds,
          next_collect_at = excluded.next_collect_at,
          last_snapshot_at = excluded.last_snapshot_at,
          last_success_at = excluded.last_success_at,
          last_error_at = NULL,
          last_error_type = NULL,
          last_error_message = NULL,
          source_endpoint = excluded.source_endpoint,
          current_evidence_object_id = excluded.current_evidence_object_id,
          version = bilibili_follower_monitor.version + 1,
          updated_at = excluded.updated_at
      `).run(
        monitor.monitorId,
        monitor.mid,
        monitor.nickname,
        monitor.avatarUrl,
        monitor.profileUrl,
        monitor.followerCount,
        monitor.followingCount,
        monitor.intervalSeconds,
        monitor.nextCollectAt,
        monitor.capturedAt,
        monitor.capturedAt,
        monitor.sourceEndpoint,
        input.artifact.objectId,
        monitor.capturedAt,
        monitor.capturedAt
      )
      this.database.prepare(`
        INSERT INTO bilibili_follower_snapshot (
          snapshot_id, monitor_id, mid, follower_count, following_count,
          captured_at, captured_bucket, source_endpoint, evidence_object_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(monitor_id, captured_bucket) DO UPDATE SET
          follower_count = excluded.follower_count,
          following_count = excluded.following_count,
          captured_at = excluded.captured_at,
          source_endpoint = excluded.source_endpoint,
          evidence_object_id = excluded.evidence_object_id
      `).run(
        input.snapshot.snapshotId,
        monitor.monitorId,
        monitor.mid,
        monitor.followerCount,
        monitor.followingCount,
        monitor.capturedAt,
        input.snapshot.capturedBucket,
        monitor.sourceEndpoint,
        input.artifact.objectId,
        monitor.capturedAt
      )
      this.insertOutbox(input.outbox)
    })
  }

  listBilibiliFollowerMonitors(limit?: number): StoredBilibiliFollowerMonitor[] {
    return this.database.prepare(`
      SELECT monitor_id AS monitorId,
             mid,
             nickname,
             avatar_url AS avatarUrl,
             profile_url AS profileUrl,
             current_follower_count AS currentFollowerCount,
             following_count AS followingCount,
             monitor_status AS monitorStatus,
             interval_seconds AS intervalSeconds,
             next_collect_at AS nextCollectAt,
             last_snapshot_at AS lastSnapshotAt,
             last_success_at AS lastSuccessAt,
             last_error_at AS lastErrorAt,
             last_error_type AS lastErrorType,
             last_error_message AS lastErrorMessage,
             source_endpoint AS sourceEndpoint,
             current_evidence_object_id AS currentEvidenceObjectId,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_follower_monitor
      ORDER BY monitor_status ASC, current_follower_count DESC, rowid ASC
      LIMIT ?
    `).all(limit ?? -1) as unknown as StoredBilibiliFollowerMonitor[]
  }

  findBilibiliFollowerMonitorById(monitorId: string): StoredBilibiliFollowerMonitor | undefined {
    return this.database.prepare(`
      SELECT monitor_id AS monitorId,
             mid,
             nickname,
             avatar_url AS avatarUrl,
             profile_url AS profileUrl,
             current_follower_count AS currentFollowerCount,
             following_count AS followingCount,
             monitor_status AS monitorStatus,
             interval_seconds AS intervalSeconds,
             next_collect_at AS nextCollectAt,
             last_snapshot_at AS lastSnapshotAt,
             last_success_at AS lastSuccessAt,
             last_error_at AS lastErrorAt,
             last_error_type AS lastErrorType,
             last_error_message AS lastErrorMessage,
             source_endpoint AS sourceEndpoint,
             current_evidence_object_id AS currentEvidenceObjectId,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_follower_monitor
      WHERE monitor_id = ?
    `).get(monitorId) as unknown as StoredBilibiliFollowerMonitor | undefined
  }

  findBilibiliFollowerMonitorByMid(mid: string): StoredBilibiliFollowerMonitor | undefined {
    return this.database.prepare(`
      SELECT monitor_id AS monitorId,
             mid,
             nickname,
             avatar_url AS avatarUrl,
             profile_url AS profileUrl,
             current_follower_count AS currentFollowerCount,
             following_count AS followingCount,
             monitor_status AS monitorStatus,
             interval_seconds AS intervalSeconds,
             next_collect_at AS nextCollectAt,
             last_snapshot_at AS lastSnapshotAt,
             last_success_at AS lastSuccessAt,
             last_error_at AS lastErrorAt,
             last_error_type AS lastErrorType,
             last_error_message AS lastErrorMessage,
             source_endpoint AS sourceEndpoint,
             current_evidence_object_id AS currentEvidenceObjectId,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_follower_monitor
      WHERE mid = ?
    `).get(mid) as unknown as StoredBilibiliFollowerMonitor | undefined
  }

  findBilibiliFollowerSnapshots(
    monitorId: string,
    input: { from?: string | undefined; to?: string | undefined; limit: number }
  ): StoredBilibiliFollowerSnapshot[] {
    const where = ["monitor_id = ?"]
    const parameters: Array<string | number> = [monitorId]
    // Stored UTC timestamps may have 0/3/6 fractional digits. A raw text comparison
    // incorrectly considers .000001Z earlier than Z; julianday would lose microseconds.
    const instant = `(substr(captured_at, 1, 19) || '.' || substr(
      (CASE WHEN substr(captured_at, 20, 1) = '.' THEN substr(captured_at, 21, length(captured_at) - 21) ELSE '' END)
      || '000000000', 1, 9))`
    const boundary = (value: string): string => {
      const fraction = value.match(/\.(\d+)/)?.[1] ?? ""
      return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(9, "0").slice(0, 9)}`
    }
    if (input.from) {
      const from = boundary(input.from)
      // Coarse second bounds retain the existing monitor/time index without rewriting old data.
      where.push(`captured_at >= ? AND ${instant} >= ?`)
      parameters.push(from.slice(0, 19), from)
    }
    if (input.to) {
      const to = boundary(input.to)
      where.push(`captured_at <= ? AND ${instant} <= ?`)
      parameters.push(`${to.slice(0, 19)}Z`, to)
    }
    parameters.push(input.limit)
    return this.database.prepare(`
      SELECT snapshot_id AS snapshotId,
             monitor_id AS monitorId,
             mid,
             follower_count AS followerCount,
             following_count AS followingCount,
             captured_at AS capturedAt,
             captured_bucket AS capturedBucket,
             source_endpoint AS sourceEndpoint,
             evidence_object_id AS evidenceObjectId,
             created_at AS createdAt
      FROM (
        SELECT * FROM bilibili_follower_snapshot
        WHERE ${where.join(" AND ")}
        ORDER BY captured_at DESC
        LIMIT ?
      ) limited
      ORDER BY captured_at ASC
    `).all(...parameters) as unknown as StoredBilibiliFollowerSnapshot[]
  }

  findDueBilibiliFollowerMonitors(now: string, limit: number): StoredBilibiliFollowerMonitor[] {
    return this.database.prepare(`
      SELECT monitor_id AS monitorId,
             mid,
             nickname,
             avatar_url AS avatarUrl,
             profile_url AS profileUrl,
             current_follower_count AS currentFollowerCount,
             following_count AS followingCount,
             monitor_status AS monitorStatus,
             interval_seconds AS intervalSeconds,
             next_collect_at AS nextCollectAt,
             last_snapshot_at AS lastSnapshotAt,
             last_success_at AS lastSuccessAt,
             last_error_at AS lastErrorAt,
             last_error_type AS lastErrorType,
             last_error_message AS lastErrorMessage,
             source_endpoint AS sourceEndpoint,
             current_evidence_object_id AS currentEvidenceObjectId,
             version,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM bilibili_follower_monitor
      WHERE monitor_status = 'ACTIVE'
        AND (next_collect_at IS NULL OR next_collect_at <= ?)
      ORDER BY COALESCE(next_collect_at, created_at) ASC
      LIMIT ?
    `).all(now, limit) as unknown as StoredBilibiliFollowerMonitor[]
  }

  insertBilibiliApiCall(call: StoredBilibiliApiCall, artifact?: StoredObjectArtifact): void {
    this.transaction(() => {
      if (artifact) this.insertObjectArtifact(artifact)
      this.database.prepare(`
        INSERT INTO bilibili_api_call (
          call_id, task_id, attempt, endpoint_key, mid, status_code,
          duration_ms, error_type, retryable, evidence_object_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        call.callId,
        call.taskId,
        call.attempt,
        call.endpointKey,
        call.mid,
        call.statusCode,
        call.durationMs,
        call.errorType,
        call.retryable ? 1 : 0,
        call.evidenceObjectId,
        call.createdAt
      )
    })
  }

  listBilibiliApiCalls(taskId: string): StoredBilibiliApiCall[] {
    const rows = this.database.prepare(`
      SELECT call_id AS callId,
             task_id AS taskId,
             attempt,
             endpoint_key AS endpointKey,
             mid,
             status_code AS statusCode,
             duration_ms AS durationMs,
             error_type AS errorType,
             retryable,
             evidence_object_id AS evidenceObjectId,
             created_at AS createdAt
      FROM bilibili_api_call
      WHERE task_id = ?
      ORDER BY attempt ASC, created_at ASC, call_id ASC
    `).all(taskId) as unknown as Array<Omit<StoredBilibiliApiCall, "retryable"> & { retryable: number }>
    return rows.map((row) => ({ ...row, retryable: row.retryable === 1 }))
  }

  updateBilibiliFollowerMonitorStatus(
    monitorId: string,
    enabled: boolean,
    timestamp: string,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_follower_monitor
        SET monitor_status = ?,
            next_collect_at = CASE WHEN ? = 'ACTIVE' THEN ? ELSE next_collect_at END,
            version = version + 1,
            updated_at = ?
        WHERE monitor_id = ?
      `).run(enabled ? "ACTIVE" : "PAUSED", enabled ? "ACTIVE" : "PAUSED", timestamp, timestamp, monitorId)
      this.insertOutbox(outbox)
    })
  }

  updateBilibiliFollowerMonitorInterval(
    monitorId: string,
    intervalSeconds: number,
    nextCollectAt: string,
    timestamp: string,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_follower_monitor
        SET interval_seconds = ?,
            next_collect_at = CASE
              WHEN monitor_status = 'ACTIVE' THEN ?
              ELSE next_collect_at
            END,
            version = version + 1,
            updated_at = ?
        WHERE monitor_id = ?
      `).run(intervalSeconds, nextCollectAt, timestamp, monitorId)
      this.insertOutbox(outbox)
    })
  }

  markBilibiliFollowerMonitorFailure(input: {
    monitorId: string
    nextCollectAt: string
    errorAt: string
    errorType: string
    errorMessage: string
    outbox: NewStoredOutboxMessage
  }): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_follower_monitor
        SET next_collect_at = ?,
            last_error_at = ?,
            last_error_type = ?,
            last_error_message = ?,
            version = version + 1,
            updated_at = ?
        WHERE monitor_id = ?
      `).run(
        input.nextCollectAt,
        input.errorAt,
        input.errorType,
        input.errorMessage.slice(0, 900),
        input.errorAt,
        input.monitorId
      )
      this.insertOutbox(input.outbox)
    })
  }

  deleteBilibiliFollowerMonitor(monitorId: string, outbox: NewStoredOutboxMessage): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM bilibili_follower_monitor WHERE monitor_id = ?").run(monitorId)
      this.insertOutbox(outbox)
    })
  }

  applyBilibiliLiveRoomSnapshot(
    input: ApplyBilibiliLiveRoomSnapshotInput,
    reconcileBeforeSnapshot?: (room: StoredBilibiliLiveRoomMonitor) => void
  ): boolean {
    return this.transaction(() => {
      const previous = this.findBilibiliLiveRoomById(input.monitor.monitorId)
        ?? this.findBilibiliLiveRoomByUid(input.monitor.uid)
        ?? this.findBilibiliLiveRoomByRoomId(input.monitor.roomId)
      if ([previous?.lastSnapshotAt, previous?.lastSuccessAt]
        .some(value => value && compareLiveSnapshotTime(input.monitor.capturedAt, value) < 0)) return false

      this.insertObjectArtifact(input.artifact)
      const monitor = input.monitor
      const appliedAt = input.appliedAt ?? new Date().toISOString()
      if (previous) {
        // Original collection: events -> boundary(current) -> monitor -> history.
        // Initialization has no success events and reconciles after the monitor is available.
        if (!input.reactivate) {
          this.recordBilibiliLiveSuccessEvents(previous, monitor, appliedAt)
          reconcileBeforeSnapshot?.(previous)
        }
        this.database.prepare(`
          UPDATE bilibili_live_room_monitor
          SET uid = ?, room_id = ?, short_id = ?, uname = ?, face_url = ?, title = ?,
              cover_url = ?, keyframe_url = ?, area_id = ?, area_name = ?,
              parent_area_id = ?, parent_area_name = ?, live_status = ?, live_time = ?,
              online_count = ?, attention_count = ?,
              monitor_status = CASE WHEN ? = 1 THEN 'ACTIVE' ELSE monitor_status END,
              interval_seconds = ?, next_collect_at = ?,
              last_snapshot_at = ?, last_success_at = ?, last_error_at = NULL,
              last_error_type = NULL, last_error_message = NULL, backoff_until = NULL,
              source_endpoint = ?, current_evidence_object_id = ?,
              version = version + 1, updated_at = ?
          WHERE monitor_id = ?
        `).run(
          monitor.uid,
          monitor.roomId,
          monitor.shortId,
          monitor.uname,
          monitor.faceUrl,
          monitor.title,
          monitor.coverUrl,
          monitor.keyframeUrl,
          monitor.areaId,
          monitor.areaName,
          monitor.parentAreaId,
          monitor.parentAreaName,
          monitor.liveStatus,
          monitor.liveTime,
          monitor.onlineCount,
          monitor.attentionCount,
          input.reactivate ? 1 : 0,
          monitor.intervalSeconds,
          monitor.nextCollectAt,
          monitor.capturedAt,
          monitor.capturedAt,
          monitor.sourceEndpoint,
          input.artifact.objectId,
          appliedAt,
          previous.monitorId
        )
      } else {
        this.database.prepare(`
          INSERT INTO bilibili_live_room_monitor (
            monitor_id, uid, room_id, short_id, uname, face_url, title, cover_url,
            keyframe_url, area_id, area_name, parent_area_id, parent_area_name,
            live_status, live_time, online_count, attention_count, monitor_status,
            interval_seconds, next_collect_at, last_snapshot_at, last_success_at,
            source_endpoint, current_evidence_object_id, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          monitor.monitorId,
          monitor.uid,
          monitor.roomId,
          monitor.shortId,
          monitor.uname,
          monitor.faceUrl,
          monitor.title,
          monitor.coverUrl,
          monitor.keyframeUrl,
          monitor.areaId,
          monitor.areaName,
          monitor.parentAreaId,
          monitor.parentAreaName,
          monitor.liveStatus,
          monitor.liveTime,
          monitor.onlineCount,
          monitor.attentionCount,
          monitor.intervalSeconds,
          monitor.nextCollectAt,
          monitor.capturedAt,
          monitor.capturedAt,
          monitor.sourceEndpoint,
          input.artifact.objectId,
          appliedAt,
          appliedAt
        )
      }

      const persistedId = previous?.monitorId ?? monitor.monitorId
      if (input.reactivate || !previous) {
        const boundaryRoom = previous ?? this.findBilibiliLiveRoomById(persistedId)
        if (boundaryRoom) reconcileBeforeSnapshot?.(boundaryRoom)
      }
      this.database.prepare(`
        INSERT INTO bilibili_live_room_snapshot (
          snapshot_id, monitor_id, uid, room_id, live_status, title, area_id,
          area_name, parent_area_id, parent_area_name, online_count, attention_count,
          live_time, source_endpoint, captured_at, captured_bucket,
          evidence_object_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(monitor_id, captured_bucket) DO UPDATE SET
          live_status = excluded.live_status,
          title = excluded.title,
          area_id = excluded.area_id,
          area_name = excluded.area_name,
          parent_area_id = excluded.parent_area_id,
          parent_area_name = excluded.parent_area_name,
          online_count = excluded.online_count,
          attention_count = excluded.attention_count,
          live_time = excluded.live_time,
          source_endpoint = excluded.source_endpoint,
          captured_at = excluded.captured_at,
          evidence_object_id = excluded.evidence_object_id
      `).run(
        input.snapshot.snapshotId,
        persistedId,
        monitor.uid,
        monitor.roomId,
        monitor.liveStatus,
        monitor.title,
        monitor.areaId,
        monitor.areaName,
        monitor.parentAreaId,
        monitor.parentAreaName,
        monitor.onlineCount,
        monitor.attentionCount,
        monitor.liveTime,
        monitor.sourceEndpoint,
        monitor.capturedAt,
        input.snapshot.capturedBucket,
        input.artifact.objectId,
        appliedAt
      )
      this.insertOutbox(input.outbox)
      return true
    })
  }

  listBilibiliLiveRooms(limit?: number): StoredBilibiliLiveRoomMonitor[] {
    return this.database.prepare(`${bilibiliLiveRoomSelect()}
      ORDER BY monitor_status ASC, live_status DESC, online_count DESC, rowid ASC
      ${limit === undefined ? "" : "LIMIT ?"}
    `).all(...(limit === undefined ? [] : [limit])) as unknown as StoredBilibiliLiveRoomMonitor[]
  }

  findBilibiliLiveRoomById(monitorId: string): StoredBilibiliLiveRoomMonitor | undefined {
    return this.database.prepare(`${bilibiliLiveRoomSelect()} WHERE monitor_id = ?`)
      .get(monitorId) as unknown as StoredBilibiliLiveRoomMonitor | undefined
  }

  findBilibiliLiveRoomByUid(uid: string): StoredBilibiliLiveRoomMonitor | undefined {
    return this.database.prepare(`${bilibiliLiveRoomSelect()} WHERE uid = ?`)
      .get(uid) as unknown as StoredBilibiliLiveRoomMonitor | undefined
  }

  findBilibiliLiveRoomByRoomId(roomId: string): StoredBilibiliLiveRoomMonitor | undefined {
    return this.database.prepare(`${bilibiliLiveRoomSelect()} WHERE room_id = ?`)
      .get(roomId) as unknown as StoredBilibiliLiveRoomMonitor | undefined
  }

  findBilibiliLiveRoomSnapshots(
    monitorId: string,
    input: { from?: string | undefined; to?: string | undefined; limit: number }
  ): StoredBilibiliLiveRoomSnapshot[] {
    const where = ["monitor_id = ?"]
    const parameters: Array<string | number> = [monitorId]
    // Python emits UTC with microseconds; Electron may emit milliseconds or whole seconds.
    // Keep the indexed coarse second range, then compare exact fractional instants.
    const instant = `(substr(captured_at, 1, 19) || '.' || substr(
      (CASE WHEN substr(captured_at, 20, 1) = '.' THEN substr(captured_at, 21, length(captured_at) - 21) ELSE '' END)
      || '000000000', 1, 9))`
    const boundary = (value: string): string => {
      const fraction = value.match(/\.(\d+)/)?.[1] ?? ""
      return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(9, "0").slice(0, 9)}`
    }
    if (input.from) {
      const from = boundary(input.from)
      where.push(`captured_at >= ? AND ${instant} >= ?`)
      parameters.push(from.slice(0, 19), from)
    }
    if (input.to) {
      const to = boundary(input.to)
      where.push(`captured_at <= ? AND ${instant} <= ?`)
      parameters.push(`${to.slice(0, 19)}Z`, to)
    }
    parameters.push(input.limit)
    return this.database.prepare(`
      SELECT snapshot_id AS snapshotId,
             monitor_id AS monitorId,
             uid,
             room_id AS roomId,
             live_status AS liveStatus,
             title,
             area_id AS areaId,
             area_name AS areaName,
             parent_area_id AS parentAreaId,
             parent_area_name AS parentAreaName,
             online_count AS onlineCount,
             attention_count AS attentionCount,
             live_time AS liveTime,
             source_endpoint AS sourceEndpoint,
             captured_at AS capturedAt,
             captured_bucket AS capturedBucket,
             evidence_object_id AS evidenceObjectId,
             created_at AS createdAt
      FROM (
        SELECT * FROM bilibili_live_room_snapshot
        WHERE ${where.join(" AND ")}
        ORDER BY captured_at DESC
        LIMIT ?
      ) limited
      ORDER BY captured_at ASC
    `).all(...parameters) as unknown as StoredBilibiliLiveRoomSnapshot[]
  }

  findDueBilibiliLiveRooms(now: string, limit: number): StoredBilibiliLiveRoomMonitor[] {
    return this.database.prepare(`${bilibiliLiveRoomSelect()}
      WHERE monitor_status = 'ACTIVE'
        AND (next_collect_at IS NULL OR next_collect_at <= ?)
        AND (backoff_until IS NULL OR backoff_until <= ?)
      ORDER BY COALESCE(next_collect_at, created_at) ASC
      LIMIT ?
    `).all(now, now, limit) as unknown as StoredBilibiliLiveRoomMonitor[]
  }

  updateBilibiliLiveRoomStatus(
    monitorId: string,
    enabled: boolean,
    timestamp: string,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_live_room_monitor
        SET monitor_status = ?,
            next_collect_at = CASE WHEN ? = 'ACTIVE' THEN ? ELSE next_collect_at END,
            version = version + 1,
            updated_at = ?
        WHERE monitor_id = ?
      `).run(enabled ? "ACTIVE" : "PAUSED", enabled ? "ACTIVE" : "PAUSED", timestamp, timestamp, monitorId)
      this.insertOutbox(outbox)
    })
  }

  updateBilibiliLiveRoomInterval(
    monitorId: string,
    intervalSeconds: number,
    nextCollectAt: string,
    timestamp: string,
    outbox: NewStoredOutboxMessage
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        UPDATE bilibili_live_room_monitor
        SET interval_seconds = ?,
            next_collect_at = CASE WHEN monitor_status = 'ACTIVE' THEN ? ELSE next_collect_at END,
            version = version + 1,
            updated_at = ?
        WHERE monitor_id = ?
      `).run(intervalSeconds, nextCollectAt, timestamp, monitorId)
      this.insertOutbox(outbox)
    })
  }

  markBilibiliLiveRoomFailure(input: {
    monitorId: string
    nextCollectAt: string
    errorAt: string
    errorType: string
    errorMessage: string
    eventId: string
    eventContext?: Pick<StoredBilibiliLiveRoomMonitor, "uid" | "roomId" | "liveStatus" | "title" | "onlineCount">
    outbox: NewStoredOutboxMessage
  }): void {
    this.transaction(() => {
      const room = this.findBilibiliLiveRoomById(input.monitorId)
      if (!room) return
      const eventContext = input.eventContext ?? room
      this.database.prepare(`
        UPDATE bilibili_live_room_monitor
        SET next_collect_at = ?, backoff_until = ?, last_error_at = ?,
            last_error_type = ?, last_error_message = ?, version = version + 1, updated_at = ?
        WHERE monitor_id = ?
      `).run(
        input.nextCollectAt,
        input.nextCollectAt,
        input.errorAt,
        input.errorType,
        input.errorMessage.slice(0, 900),
        input.errorAt,
        input.monitorId
      )
      this.insertBilibiliLiveEvent({
        eventId: input.eventId,
        monitorId: room.monitorId,
        uid: eventContext.uid,
        roomId: eventContext.roomId,
        eventType: "ERROR_OCCURRED",
        fromLiveStatus: eventContext.liveStatus,
        toLiveStatus: eventContext.liveStatus,
        titleBefore: eventContext.title,
        titleAfter: eventContext.title,
        onlineCount: eventContext.onlineCount,
        occurredAt: input.errorAt
      })
      this.insertOutbox(input.outbox)
    })
  }

  deleteBilibiliLiveRoom(monitorId: string, outbox: NewStoredOutboxMessage): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM bilibili_live_room_monitor WHERE monitor_id = ?").run(monitorId)
      this.insertOutbox(outbox)
    })
  }

  listBilibiliLiveStatusEvents(limit: number): StoredBilibiliLiveStatusEvent[] {
    return this.database.prepare(`
      SELECT event_id AS eventId,
             monitor_id AS monitorId,
             uid,
             room_id AS roomId,
             event_type AS eventType,
             from_live_status AS fromLiveStatus,
             to_live_status AS toLiveStatus,
             title_before AS titleBefore,
             title_after AS titleAfter,
             online_count AS onlineCount,
             occurred_at AS occurredAt
      FROM bilibili_live_status_event
      ORDER BY occurred_at DESC, rowid DESC
      LIMIT ?
    `).all(limit) as unknown as StoredBilibiliLiveStatusEvent[]
  }

  countTodayBilibiliLiveStarts(startOfDay: string): number {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM bilibili_live_status_event
      WHERE event_type = 'LIVE_STARTED' AND occurred_at >= ?
    `).get(startOfDay) as Record<string, unknown>
    return Number(row.total)
  }

  upsertBilibiliLiveRankSnapshot(
    input: UpsertBilibiliLiveRankSnapshotInput
  ): StoredBilibiliLiveRankSnapshot {
    return this.transaction(() => {
      const snapshot = input.snapshot
      this.insertObjectArtifact(input.artifact)
      const existing = this.database.prepare(`
        SELECT snapshot_id AS snapshotId
        FROM bilibili_live_rank_snapshot
        WHERE monitor_id = ?
          AND rank_family = ?
          AND rank_type = ?
          AND COALESCE(rank_switch, '') = COALESCE(?, '')
          AND COALESCE(period_scope, '') = COALESCE(?, '')
          AND captured_bucket = ?
          AND page_no = ?
        LIMIT 1
      `).get(
        snapshot.monitorId,
        snapshot.rankFamily,
        snapshot.rankType,
        snapshot.rankSwitch,
        snapshot.periodScope,
        snapshot.capturedBucket,
        snapshot.pageNo
      ) as { snapshotId: string } | undefined
      const snapshotId = existing?.snapshotId ?? snapshot.snapshotId
      if (existing) {
        this.database.prepare(`
          UPDATE bilibili_live_rank_snapshot
          SET room_id = ?, ruid = ?, page_size = ?, total_count = ?, count_text = ?,
              value_text = ?, remind_msg = ?, source_endpoint = ?, signed_required = ?,
              captured_at = ?, evidence_object_id = ?
          WHERE snapshot_id = ?
        `).run(
          snapshot.roomId,
          snapshot.ruid,
          snapshot.pageSize,
          snapshot.totalCount,
          snapshot.countText,
          snapshot.valueText,
          snapshot.remindMsg,
          snapshot.sourceEndpoint,
          snapshot.signedRequired ? 1 : 0,
          snapshot.capturedAt,
          input.artifact.objectId,
          snapshotId
        )
        this.database.prepare("DELETE FROM bilibili_live_rank_entry WHERE snapshot_id = ?")
          .run(snapshotId)
      } else {
        this.database.prepare(`
          INSERT INTO bilibili_live_rank_snapshot (
            snapshot_id, monitor_id, room_id, ruid, rank_family, rank_type,
            rank_switch, period_scope, page_no, page_size, total_count, count_text,
            value_text, remind_msg, source_endpoint, signed_required, captured_at,
            captured_bucket, evidence_object_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          snapshotId,
          snapshot.monitorId,
          snapshot.roomId,
          snapshot.ruid,
          snapshot.rankFamily,
          snapshot.rankType,
          snapshot.rankSwitch,
          snapshot.periodScope,
          snapshot.pageNo,
          snapshot.pageSize,
          snapshot.totalCount,
          snapshot.countText,
          snapshot.valueText,
          snapshot.remindMsg,
          snapshot.sourceEndpoint,
          snapshot.signedRequired ? 1 : 0,
          snapshot.capturedAt,
          snapshot.capturedBucket,
          input.artifact.objectId,
          snapshot.capturedAt
        )
      }
      const insertEntry = this.database.prepare(`
        INSERT INTO bilibili_live_rank_entry (
          entry_id, snapshot_id, monitor_id, room_id, ruid, user_uid, rank_no,
          entry_kind, display_name, face_url, score, guard_level, wealth_level,
          medal_name, medal_level, guard_expired_text, accompany_days, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const entry of input.entries) {
        insertEntry.run(
          entry.entryId,
          snapshotId,
          snapshot.monitorId,
          snapshot.roomId,
          snapshot.ruid,
          entry.userUid,
          entry.rankNo,
          entry.entryKind,
          entry.displayName,
          entry.faceUrl,
          entry.score,
          entry.guardLevel,
          entry.wealthLevel,
          entry.medalName,
          entry.medalLevel,
          entry.guardExpiredText,
          entry.accompanyDays,
          snapshot.capturedAt
        )
      }
      return this.findBilibiliLiveRankSnapshotById(snapshotId) as StoredBilibiliLiveRankSnapshot
    })
  }

  findLatestBilibiliLiveRankSnapshots(
    monitorId: string,
    input: { family?: string; type?: string; rankSwitch?: string } = {}
  ): StoredBilibiliLiveRankSnapshot[] {
    const filters = ["monitor_id = ?"]
    const parameters: Array<string | number> = [monitorId]
    if (input.family) {
      filters.push("rank_family = ?")
      parameters.push(input.family)
    }
    if (input.type) {
      filters.push("rank_type = ?")
      parameters.push(input.type)
    }
    if (input.rankSwitch) {
      filters.push("rank_switch = ?")
      parameters.push(input.rankSwitch)
    }
    return this.database.prepare(`
      SELECT snapshotId, monitorId, roomId, ruid, rankFamily, rankType, rankSwitch,
             periodScope, pageNo, pageSize, totalCount, countText, valueText,
             remindMsg, sourceEndpoint, signedRequired, capturedAt, capturedBucket,
             evidenceObjectId, createdAt
      FROM (
        SELECT snapshot_id AS snapshotId,
               monitor_id AS monitorId,
               room_id AS roomId,
               ruid,
               rank_family AS rankFamily,
               rank_type AS rankType,
               rank_switch AS rankSwitch,
               period_scope AS periodScope,
               page_no AS pageNo,
               page_size AS pageSize,
               total_count AS totalCount,
               count_text AS countText,
               value_text AS valueText,
               remind_msg AS remindMsg,
               source_endpoint AS sourceEndpoint,
               signed_required AS signedRequired,
               captured_at AS capturedAt,
               captured_bucket AS capturedBucket,
               evidence_object_id AS evidenceObjectId,
               created_at AS createdAt,
               ROW_NUMBER() OVER (
                 PARTITION BY rank_family, rank_type, COALESCE(rank_switch, ''),
                              COALESCE(period_scope, ''), page_no
                 ORDER BY captured_at DESC, rowid DESC
               ) AS latestRow
        FROM bilibili_live_rank_snapshot
        WHERE ${filters.join(" AND ")}
      ) latest
      WHERE latestRow = 1
      ORDER BY rankFamily, rankType, COALESCE(rankSwitch, ''), pageNo
    `).all(...parameters).map(toStoredRankSnapshot)
  }

  findBilibiliLiveRankEntries(snapshotId: string, limit: number): StoredBilibiliLiveRankEntry[] {
    return this.database.prepare(`
      SELECT entry_id AS entryId,
             snapshot_id AS snapshotId,
             monitor_id AS monitorId,
             room_id AS roomId,
             ruid,
             user_uid AS userUid,
             rank_no AS rankNo,
             entry_kind AS entryKind,
             display_name AS displayName,
             face_url AS faceUrl,
             score,
             guard_level AS guardLevel,
             wealth_level AS wealthLevel,
             medal_name AS medalName,
             medal_level AS medalLevel,
             guard_expired_text AS guardExpiredText,
             accompany_days AS accompanyDays,
             created_at AS createdAt
      FROM bilibili_live_rank_entry
      WHERE snapshot_id = ?
      ORDER BY rank_no IS NULL, rank_no, rowid
      LIMIT ?
    `).all(snapshotId, limit) as unknown as StoredBilibiliLiveRankEntry[]
  }

  createBilibiliLiveDanmakuSession(input: {
    sessionId: string
    monitorId: string
    roomId: string
    connectHost: string | null
    startedAt: string
  }): StoredBilibiliLiveDanmakuSession {
    this.database.prepare(`
      INSERT INTO bilibili_live_danmaku_session (
        session_id, monitor_id, room_id, started_at, status, connect_host, created_at
      ) VALUES (?, ?, ?, ?, 'CONNECTING', ?, ?)
    `).run(
      input.sessionId,
      input.monitorId,
      input.roomId,
      input.startedAt,
      input.connectHost,
      input.startedAt
    )
    return this.findBilibiliLiveDanmakuSessionById(input.sessionId) as StoredBilibiliLiveDanmakuSession
  }

  markBilibiliLiveDanmakuSessionStatus(
    sessionId: string,
    status: "AUTHENTICATING" | "CLOSED" | "STOPPED",
    timestamp: string
  ): void {
    this.database.prepare(`
      UPDATE bilibili_live_danmaku_session
      SET status = ?,
          ended_at = CASE WHEN ? IN ('CLOSED', 'STOPPED') THEN COALESCE(ended_at, ?) ELSE ended_at END
      WHERE session_id = ?
    `).run(status, status, timestamp, sessionId)
  }

  markBilibiliLiveDanmakuSessionConnected(sessionId: string, timestamp: string): void {
    this.database.prepare(`
      UPDATE bilibili_live_danmaku_session
      SET status = 'CONNECTED', connected_at = COALESCE(connected_at, ?)
      WHERE session_id = ?
    `).run(timestamp, sessionId)
  }

  updateBilibiliLiveDanmakuSessionTransport(
    sessionId: string,
    connectHost: string,
    timestamp: string
  ): void {
    this.database.prepare(`
      UPDATE bilibili_live_danmaku_session
      SET connect_host = ?, status = 'AUTHENTICATING'
      WHERE session_id = ? AND started_at <= ?
    `).run(connectHost, sessionId, timestamp)
  }

  markBilibiliLiveDanmakuSessionHeartbeat(sessionId: string, timestamp: string): void {
    this.database.prepare(`
      UPDATE bilibili_live_danmaku_session SET last_heartbeat_at = ? WHERE session_id = ?
    `).run(timestamp, sessionId)
  }

  markBilibiliLiveDanmakuSessionError(
    sessionId: string,
    timestamp: string,
    errorType: string,
    errorMessage: string
  ): void {
    this.database.prepare(`
      UPDATE bilibili_live_danmaku_session
      SET status = 'ERROR', ended_at = COALESCE(ended_at, ?), last_error_at = ?,
          last_error_type = ?, last_error_message = ?
      WHERE session_id = ?
    `).run(timestamp, timestamp, errorType.slice(0, 80), errorMessage.slice(0, 900), sessionId)
  }

  markOrphanedBilibiliLiveDanmakuSessions(timestamp: string): number {
    const result = this.database.prepare(`
      UPDATE bilibili_live_danmaku_session
      SET status = 'ERROR',
          ended_at = COALESCE(ended_at, last_heartbeat_at, connected_at, started_at),
          last_error_at = ?,
          last_error_type = 'PROCESS_RESTART',
          last_error_message = 'Connection did not survive process restart.'
      WHERE status IN ('CONNECTING', 'AUTHENTICATING', 'CONNECTED')
    `).run(timestamp)
    return Number(result.changes)
  }

  findLatestBilibiliLiveDanmakuSession(
    monitorId: string
  ): StoredBilibiliLiveDanmakuSession | undefined {
    return this.database.prepare(`${bilibiliLiveDanmakuSessionSelect()}
      WHERE monitor_id = ?
      ORDER BY started_at DESC, rowid DESC
      LIMIT 1
    `).get(monitorId) as unknown as StoredBilibiliLiveDanmakuSession | undefined
  }

  listBilibiliLiveDanmakuAutoStartRoomIds(limit: number): string[] {
    const rows = this.database.prepare(`
      SELECT desired.monitorId
      FROM (
        SELECT binding.bilibili_live_room_monitor_id AS monitorId,
               CASE WHEN room.live_status = 1 THEN 0 ELSE 1 END AS livePriority,
               room.online_count AS onlineCount
        FROM bilibili_subject_binding binding
        JOIN bilibili_live_room_monitor room
          ON room.monitor_id = binding.bilibili_live_room_monitor_id
        WHERE binding.danmu_enabled = 1
          AND room.monitor_status = 'ACTIVE'
        UNION
        SELECT room.monitor_id AS monitorId, 0 AS livePriority, room.online_count AS onlineCount
        FROM bilibili_live_room_monitor room
        WHERE room.monitor_status = 'ACTIVE' AND room.live_status = 1
      ) desired
      ORDER BY desired.livePriority ASC, desired.onlineCount DESC, desired.monitorId ASC
      LIMIT ?
    `).all(Math.max(1, limit)) as unknown as Array<{ monitorId: string }>
    return rows.map((row) => row.monitorId)
  }

  recordBilibiliLiveDanmakuEvent(input: RecordBilibiliLiveDanmakuEventInput): void {
    this.transaction(() => {
      const safeBucketSeconds = Math.min(3_600, Math.max(10, input.bucketSeconds))
      const occurredAtMs = new Date(input.occurredAt).getTime()
      const bucketMillis = safeBucketSeconds * 1_000
      const bucketStart = new Date(Math.floor(occurredAtMs / bucketMillis) * bucketMillis)
        .toISOString()
      const bucketId = `${input.monitorId}:${bucketStart}:${safeBucketSeconds}`
      this.database.prepare(`
        INSERT INTO bilibili_live_danmaku_metric_bucket (
          bucket_id, monitor_id, session_id, room_id, bucket_start, bucket_seconds,
          danmu_count, like_count, like_increment, watched_count, heartbeat_popularity,
          gift_count, super_chat_count, raw_event_count, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(monitor_id, bucket_start, bucket_seconds) DO UPDATE SET
          session_id = COALESCE(excluded.session_id, bilibili_live_danmaku_metric_bucket.session_id),
          room_id = excluded.room_id,
          danmu_count = bilibili_live_danmaku_metric_bucket.danmu_count + excluded.danmu_count,
          like_count = COALESCE(excluded.like_count, bilibili_live_danmaku_metric_bucket.like_count),
          like_increment = bilibili_live_danmaku_metric_bucket.like_increment + excluded.like_increment,
          watched_count = COALESCE(excluded.watched_count, bilibili_live_danmaku_metric_bucket.watched_count),
          heartbeat_popularity = COALESCE(excluded.heartbeat_popularity, bilibili_live_danmaku_metric_bucket.heartbeat_popularity),
          gift_count = bilibili_live_danmaku_metric_bucket.gift_count + excluded.gift_count,
          super_chat_count = bilibili_live_danmaku_metric_bucket.super_chat_count + excluded.super_chat_count,
          raw_event_count = bilibili_live_danmaku_metric_bucket.raw_event_count + excluded.raw_event_count,
          updated_at = excluded.updated_at
      `).run(
        bucketId,
        input.monitorId,
        input.sessionId,
        input.roomId,
        bucketStart,
        safeBucketSeconds,
        Math.max(0, input.danmuDelta),
        input.likeCount,
        Math.max(0, input.likeIncrement),
        input.watchedCount,
        input.heartbeatPopularity,
        Math.max(0, input.giftDelta),
        Math.max(0, input.superChatDelta),
        Math.max(0, input.rawEventDelta),
        input.occurredAt,
        input.occurredAt
      )
      if (input.recent) {
        const recent = input.recent
        const senderUid = recent.senderUid && /^[1-9]\d*$/.test(recent.senderUid)
          ? recent.senderUid
          : null
        const recentId = randomUUID()
        this.database.prepare(`
          INSERT INTO bilibili_live_danmaku_recent (
            recent_id, monitor_id, room_id, sender_uid, message_text,
            display_name, medal_name, sent_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          recentId,
          input.monitorId,
          input.roomId,
          senderUid,
          recent.messageText.slice(0, 500),
          recent.displayName?.slice(0, 160) ?? null,
          recent.medalName?.slice(0, 80) ?? null,
          recent.sentAt,
          input.occurredAt
        )
        this.database.prepare(`
          DELETE FROM bilibili_live_danmaku_recent
          WHERE monitor_id = ? AND recent_id NOT IN (
            SELECT recent_id FROM bilibili_live_danmaku_recent
            WHERE monitor_id = ?
            ORDER BY sent_at DESC, rowid DESC
            LIMIT ?
          )
        `).run(input.monitorId, input.monitorId, Math.min(500, Math.max(1, input.recentLimit)))
      }
    })
  }

  findBilibiliLiveDanmakuRecent(
    monitorId: string,
    limit: number
  ): StoredBilibiliLiveDanmakuRecent[] {
    return this.database.prepare(`
      SELECT recentId, monitorId, roomId, senderUid, messageText, displayName,
             medalName, sentAt, createdAt
      FROM (
        SELECT recent_id AS recentId, monitor_id AS monitorId, room_id AS roomId,
               sender_uid AS senderUid, message_text AS messageText,
               display_name AS displayName, medal_name AS medalName,
               sent_at AS sentAt, created_at AS createdAt, rowid AS sourceRowId
        FROM bilibili_live_danmaku_recent
        WHERE monitor_id = ?
        ORDER BY sent_at DESC, rowid DESC
        LIMIT ?
      ) recent
      ORDER BY sentAt ASC, sourceRowId ASC
    `).all(monitorId, Math.min(200, Math.max(1, limit))) as unknown as StoredBilibiliLiveDanmakuRecent[]
  }

  findBilibiliLiveDanmakuMetricBuckets(
    monitorId: string,
    from: string,
    to: string,
    limit: number
  ): StoredBilibiliLiveDanmakuMetricBucket[] {
    return this.database.prepare(`
      SELECT bucketId, monitorId, sessionId, roomId, bucketStart, bucketSeconds,
             danmuCount, likeCount, likeIncrement, watchedCount, heartbeatPopularity,
             giftCount, superChatCount, rawEventCount, updatedAt, createdAt
      FROM (
        SELECT bucket_id AS bucketId, monitor_id AS monitorId, session_id AS sessionId,
               room_id AS roomId, bucket_start AS bucketStart, bucket_seconds AS bucketSeconds,
               danmu_count AS danmuCount, like_count AS likeCount,
               like_increment AS likeIncrement, watched_count AS watchedCount,
               heartbeat_popularity AS heartbeatPopularity, gift_count AS giftCount,
               super_chat_count AS superChatCount, raw_event_count AS rawEventCount,
               updated_at AS updatedAt, created_at AS createdAt, rowid AS sourceRowId
        FROM bilibili_live_danmaku_metric_bucket
        WHERE monitor_id = ? AND bucket_start >= ? AND bucket_start <= ?
        ORDER BY bucket_start DESC
        LIMIT ?
      ) buckets
      ORDER BY bucketStart ASC, sourceRowId ASC
    `).all(monitorId, from, to, Math.min(5_000, Math.max(1, limit))) as unknown as StoredBilibiliLiveDanmakuMetricBucket[]
  }

  getBilibiliLiveDanmakuStats(
    monitorId: string,
    now: string
  ): StoredBilibiliLiveDanmakuStats {
    const nowDate = new Date(now)
    const lastMinute = new Date(nowDate.getTime() - 60_000).toISOString()
    const lastFiveMinutes = new Date(nowDate.getTime() - 300_000).toISOString()
    const row = this.database.prepare(`
      SELECT
        COALESCE((SELECT SUM(danmu_count) FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND bucket_start >= ?), 0) AS ratePerMinute,
        COALESCE((SELECT SUM(danmu_count) FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND bucket_start >= ?), 0) AS last5MinutesCount,
        (SELECT like_count FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND like_count IS NOT NULL ORDER BY bucket_start DESC LIMIT 1) AS likeCount,
        COALESCE((SELECT SUM(like_increment) FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND bucket_start >= ?), 0) AS likeIncrement,
        (SELECT watched_count FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND watched_count IS NOT NULL ORDER BY bucket_start DESC LIMIT 1) AS watchedCount,
        (SELECT heartbeat_popularity FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ? AND heartbeat_popularity IS NOT NULL ORDER BY bucket_start DESC LIMIT 1) AS heartbeatPopularity,
        (SELECT MAX(bucket_start) FROM bilibili_live_danmaku_metric_bucket
          WHERE monitor_id = ?) AS latestBucketAt,
        (SELECT MAX(sent_at) FROM bilibili_live_danmaku_recent
          WHERE monitor_id = ?) AS latestMessageAt
    `).get(
      monitorId, lastMinute,
      monitorId, lastFiveMinutes,
      monitorId,
      monitorId, lastFiveMinutes,
      monitorId,
      monitorId,
      monitorId,
      monitorId
    ) as Record<string, unknown>
    return {
      ratePerMinute: Number(row.ratePerMinute),
      last5MinutesCount: Number(row.last5MinutesCount),
      likeCount: nullableNumber(row.likeCount),
      likeIncrement: Number(row.likeIncrement),
      watchedCount: nullableNumber(row.watchedCount),
      heartbeatPopularity: nullableNumber(row.heartbeatPopularity),
      latestBucketAt: nullableString(row.latestBucketAt),
      latestMessageAt: nullableString(row.latestMessageAt)
    }
  }

  insertBilibiliLiveSession(
    session: StoredBilibiliLiveSession
  ): StoredBilibiliLiveSession {
    this.database.prepare(`
      INSERT INTO bilibili_live_session (
        session_id, monitor_id, uid, room_id, state, platform_live_time, live_key,
        started_at, start_detected_at, start_source, end_signal_at, ended_at,
        end_detected_at, end_source, last_live_observed_at, last_observed_at,
        title_at_start, title_at_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.sessionId,
      session.monitorId,
      session.uid,
      session.roomId,
      session.state,
      session.platformLiveTime,
      session.liveKey,
      session.startedAt,
      session.startDetectedAt,
      session.startSource,
      session.endSignalAt,
      session.endedAt,
      session.endDetectedAt,
      session.endSource,
      session.lastLiveObservedAt,
      session.lastObservedAt,
      session.titleAtStart,
      session.titleAtEnd,
      session.createdAt,
      session.updatedAt
    )
    return session
  }

  updateBilibiliLiveSession(session: StoredBilibiliLiveSession): void {
    this.database.prepare(`
      UPDATE bilibili_live_session
      SET uid = ?, room_id = ?, state = ?, platform_live_time = ?, live_key = ?,
          started_at = ?, start_detected_at = ?, start_source = ?, end_signal_at = ?,
          ended_at = ?, end_detected_at = ?, end_source = ?, last_live_observed_at = ?,
          last_observed_at = ?, title_at_start = ?, title_at_end = ?, updated_at = ?
      WHERE session_id = ?
    `).run(
      session.uid,
      session.roomId,
      session.state,
      session.platformLiveTime,
      session.liveKey,
      session.startedAt,
      session.startDetectedAt,
      session.startSource,
      session.endSignalAt,
      session.endedAt,
      session.endDetectedAt,
      session.endSource,
      session.lastLiveObservedAt,
      session.lastObservedAt,
      session.titleAtStart,
      session.titleAtEnd,
      session.updatedAt,
      session.sessionId
    )
  }

  findActiveBilibiliLiveSession(monitorId: string): StoredBilibiliLiveSession | undefined {
    return this.database.prepare(`${bilibiliLiveSessionSelect()}
      WHERE monitor_id = ? AND state IN ('OPEN', 'END_PENDING')
      ORDER BY started_at DESC, rowid DESC LIMIT 1
    `).get(monitorId) as unknown as StoredBilibiliLiveSession | undefined
  }

  findBilibiliLiveSessionById(sessionId: string): StoredBilibiliLiveSession | undefined {
    return this.database.prepare(`${bilibiliLiveSessionSelect()} WHERE session_id = ?`)
      .get(sessionId) as unknown as StoredBilibiliLiveSession | undefined
  }

  findBilibiliLiveSessionByPlatformTime(
    monitorId: string,
    platformLiveTime: string
  ): StoredBilibiliLiveSession | undefined {
    return this.database.prepare(`${bilibiliLiveSessionSelect()}
      WHERE monitor_id = ? AND platform_live_time = ? LIMIT 1
    `).get(monitorId, platformLiveTime) as unknown as StoredBilibiliLiveSession | undefined
  }

  findBilibiliLiveSessionByLiveKey(
    monitorId: string,
    liveKey: string
  ): StoredBilibiliLiveSession | undefined {
    return this.database.prepare(`${bilibiliLiveSessionSelect()}
      WHERE monitor_id = ? AND live_key = ? LIMIT 1
    `).get(monitorId, liveKey) as unknown as StoredBilibiliLiveSession | undefined
  }

  findBilibiliLiveSessionByEventTime(
    monitorId: string,
    eventTime: string
  ): StoredBilibiliLiveSession | undefined {
    return this.database.prepare(`${bilibiliLiveSessionSelect()}
      WHERE monitor_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)
      ORDER BY started_at DESC, rowid DESC LIMIT 1
    `).get(monitorId, eventTime, eventTime) as unknown as StoredBilibiliLiveSession | undefined
  }

  listBilibiliLiveSessions(monitorId: string, limit: number): StoredBilibiliLiveSession[] {
    return this.database.prepare(`${bilibiliLiveSessionSelect()}
      WHERE monitor_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?
    `).all(monitorId, Math.min(200, Math.max(1, limit))) as unknown as StoredBilibiliLiveSession[]
  }

  allocateBilibiliLiveExportNumber(uid: string, date: string): number {
    if (this.transactionDepth > 0) {
      throw new Error("Export numbers must be allocated outside a snapshot transaction.")
    }
    // One autocommitted statement, independent of export encoding, saving, and snapshot rollbacks.
    const row = this.database.prepare(`
      INSERT INTO bilibili_live_export_daily_counter(uid, export_date, export_count)
      VALUES (?, ?, 1)
      ON CONFLICT(uid, export_date) DO UPDATE SET export_count = export_count + 1
      RETURNING export_count
    `).get(uid, date)
    if (!row || typeof row.export_count !== "number" || !Number.isSafeInteger(row.export_count)) {
      throw new Error("Invalid live export sequence allocation.")
    }
    return row.export_count
  }

  listBilibiliLiveDanmakuSessionsForMonitor(
    monitorId: string
  ): StoredBilibiliLiveDanmakuSession[] {
    return this.database.prepare(`${bilibiliLiveDanmakuSessionSelect()}
      WHERE monitor_id = ? ORDER BY started_at ASC, rowid ASC
    `).all(monitorId) as unknown as StoredBilibiliLiveDanmakuSession[]
  }

  insertBilibiliLiveSessionEvent(event: StoredBilibiliLiveSessionEvent): boolean {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO bilibili_live_session_event (
        event_id, live_session_id, transport_session_id, receipt_ordinal, monitor_id,
        room_id, event_key, source_event_id, event_kind, command, protocol_version,
        sender_uid, sender_name, medal_name, message_text, gift_id, gift_name,
        gift_count, coin_type, unit_price_milli_yuan, paid_amount_milli_yuan,
        paid, guard_level, amount_source, occurred_at, received_at,
        raw_payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.liveSessionId,
      event.transportSessionId,
      event.receiptOrdinal,
      event.monitorId,
      event.roomId,
      event.eventKey.slice(0, 240),
      event.sourceEventId?.slice(0, 240) ?? null,
      event.eventKind,
      event.command?.slice(0, 128) ?? null,
      event.protocolVersion,
      event.senderUid,
      event.senderName?.slice(0, 200) ?? null,
      event.medalName?.slice(0, 160) ?? null,
      event.messageText,
      event.giftId,
      event.giftName?.slice(0, 200) ?? null,
      event.giftCount,
      event.coinType?.slice(0, 32) ?? null,
      event.unitPriceMilliYuan,
      event.paidAmountMilliYuan,
      event.paid ? 1 : 0,
      event.guardLevel,
      event.amountSource?.slice(0, 64) ?? null,
      event.occurredAt,
      event.receivedAt,
      event.rawPayloadJson,
      event.createdAt
    )
    return Number(result.changes) === 1
  }

  hasBilibiliLiveSessionStrongSourceEvent(
    monitorId: string,
    eventKind: string,
    sourceEventId: string
  ): boolean {
    if (!sourceEventId || sourceEventId.startsWith("semantic:")) return false
    return this.database.prepare(`
      SELECT 1 FROM bilibili_live_session_event
      WHERE monitor_id = ? AND event_kind = ? AND source_event_id = ? LIMIT 1
    `).get(monitorId, eventKind, sourceEventId) !== undefined
  }

  findBilibiliLiveSessionEvents(
    sessionId: string,
    limit: number
  ): StoredBilibiliLiveSessionEvent[] {
    const rows = this.database.prepare(`${bilibiliLiveSessionEventSelect()}
      WHERE live_session_id = ? ORDER BY occurred_at ASC, rowid ASC LIMIT ?
    `).all(sessionId, Math.min(100_000, Math.max(1, limit))) as unknown as Array<
      Omit<StoredBilibiliLiveSessionEvent, "paid"> & { paid: number }
    >
    return rows.map((row) => ({ ...row, paid: Boolean(row.paid) }))
  }

  findAllBilibiliLiveSessionEvents(sessionId: string): StoredBilibiliLiveSessionEvent[] {
    const rows = this.database.prepare(`${bilibiliLiveSessionEventSelect()}
      WHERE live_session_id = ? ORDER BY occurred_at ASC, rowid ASC
    `).all(sessionId) as unknown as Array<
      Omit<StoredBilibiliLiveSessionEvent, "paid"> & { paid: number }
    >
    return rows.map((row) => ({ ...row, paid: Boolean(row.paid) }))
  }

  findPriorBilibiliLivePaidUserUids(monitorId: string, beforeStartedAt: string): string[] {
    const rows = this.database.prepare(`
      SELECT DISTINCT event.sender_uid AS senderUid
      FROM bilibili_live_session prior_session
      JOIN bilibili_live_session_event event
        ON event.live_session_id = prior_session.session_id
      WHERE prior_session.monitor_id = ?
        AND prior_session.started_at < ?
        AND event.sender_uid IS NOT NULL
        AND event.event_kind IN ('GIFT', 'SUPER_CHAT', 'GUARD_BUY')
        AND (event.paid = 1 OR COALESCE(event.paid_amount_milli_yuan, 0) > 0)
      ORDER BY event.sender_uid
    `).all(monitorId, beforeStartedAt) as unknown as Array<{ senderUid: string }>
    return rows.map((row) => row.senderUid)
  }

  runInTransaction<T>(operation: () => T): T {
    return this.transaction(operation)
  }

  private findBilibiliLiveDanmakuSessionById(
    sessionId: string
  ): StoredBilibiliLiveDanmakuSession | undefined {
    return this.database.prepare(`${bilibiliLiveDanmakuSessionSelect()} WHERE session_id = ?`)
      .get(sessionId) as unknown as StoredBilibiliLiveDanmakuSession | undefined
  }

  private findBilibiliLiveRankSnapshotById(
    snapshotId: string
  ): StoredBilibiliLiveRankSnapshot | undefined {
    const row = this.database.prepare(`
      SELECT snapshot_id AS snapshotId,
             monitor_id AS monitorId,
             room_id AS roomId,
             ruid,
             rank_family AS rankFamily,
             rank_type AS rankType,
             rank_switch AS rankSwitch,
             period_scope AS periodScope,
             page_no AS pageNo,
             page_size AS pageSize,
             total_count AS totalCount,
             count_text AS countText,
             value_text AS valueText,
             remind_msg AS remindMsg,
             source_endpoint AS sourceEndpoint,
             signed_required AS signedRequired,
             captured_at AS capturedAt,
             captured_bucket AS capturedBucket,
             evidence_object_id AS evidenceObjectId,
             created_at AS createdAt
      FROM bilibili_live_rank_snapshot
      WHERE snapshot_id = ?
    `).get(snapshotId)
    return row ? toStoredRankSnapshot(row as Record<string, unknown>) : undefined
  }

  private recordBilibiliLiveSuccessEvents(
    previous: StoredBilibiliLiveRoomMonitor,
    current: ApplyBilibiliLiveRoomSnapshotInput["monitor"],
    occurredAt: string
  ): void {
    if (previous.lastErrorType) {
      this.insertBilibiliLiveEvent({ ...this.liveEvent(previous, current, "ERROR_RECOVERED", occurredAt),
        uid: previous.uid, roomId: previous.roomId })
    }
    if (previous.liveStatus !== current.liveStatus) {
      const eventType = current.liveStatus === 1
        ? "LIVE_STARTED"
        : previous.liveStatus === 1
          ? "LIVE_ENDED"
          : current.liveStatus === 2
            ? "ROUND_STARTED"
            : undefined
      if (eventType) this.insertBilibiliLiveEvent(this.liveEvent(previous, current, eventType, occurredAt))
    }
    if (hasLiveSnapshotText(previous.title) && hasLiveSnapshotText(current.title) && previous.title !== current.title) {
      this.insertBilibiliLiveEvent(this.liveEvent(previous, current, "TITLE_CHANGED", occurredAt))
    }
  }

  private liveEvent(
    previous: StoredBilibiliLiveRoomMonitor,
    current: ApplyBilibiliLiveRoomSnapshotInput["monitor"],
    eventType: string,
    occurredAt: string
  ): StoredBilibiliLiveStatusEvent {
    return {
      eventId: randomUUID(),
      monitorId: previous.monitorId,
      uid: current.uid,
      roomId: current.roomId,
      eventType,
      fromLiveStatus: previous.liveStatus,
      toLiveStatus: current.liveStatus,
      titleBefore: previous.title,
      titleAfter: current.title,
      onlineCount: current.onlineCount,
      occurredAt
    }
  }

  private insertBilibiliLiveEvent(event: StoredBilibiliLiveStatusEvent): void {
    this.database.prepare(`
      INSERT INTO bilibili_live_status_event (
        event_id, monitor_id, uid, room_id, event_type, from_live_status,
        to_live_status, title_before, title_after, online_count, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.monitorId,
      event.uid,
      event.roomId,
      event.eventType,
      event.fromLiveStatus,
      event.toLiveStatus,
      event.titleBefore,
      event.titleAfter,
      event.onlineCount,
      event.occurredAt
    )
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

  private upsertBilibiliAuthAccount(input: NewStoredBilibiliAuthCredential): void {
    this.database.prepare(`
      INSERT INTO platform_account (
        account_id, platform, external_id, display_name, profile_url, avatar_url,
        auth_state, secret_ref, last_validated_at, version, created_at, updated_at
      ) VALUES (?, 'bilibili', ?, ?, ?, ?, 'active', ?, ?, 1, ?, ?)
      ON CONFLICT(platform, external_id) DO UPDATE SET
        display_name = excluded.display_name,
        profile_url = excluded.profile_url,
        avatar_url = excluded.avatar_url,
        auth_state = 'active',
        secret_ref = excluded.secret_ref,
        last_validated_at = excluded.last_validated_at,
        version = platform_account.version + 1,
        updated_at = excluded.updated_at
    `).run(
      input.account.accountId,
      input.account.mid,
      input.account.uname,
      `https://space.bilibili.com/${input.account.mid}`,
      input.account.face,
      input.credentialId,
      input.updatedAt,
      input.createdAt,
      input.updatedAt
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

  private insertObjectArtifact(artifact: StoredObjectArtifact): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO object_artifact (
        object_id, sha256, relative_path, size_bytes, media_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      artifact.objectId,
      artifact.sha256,
      artifact.relativePath,
      artifact.sizeBytes,
      artifact.mediaType,
      artifact.createdAt
    )
  }

  private transaction<T>(operation: () => T): T {
    if (this.transactionDepth > 0) return operation()
    this.database.exec("BEGIN IMMEDIATE")
    this.transactionDepth += 1
    try {
      const result = operation()
      this.database.exec("COMMIT")
      return result
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  close(): void {
    this.database.close()
  }
}

function bilibiliLiveRoomSelect(): string {
  return `
    SELECT monitor_id AS monitorId,
           uid,
           room_id AS roomId,
           short_id AS shortId,
           uname,
           face_url AS faceUrl,
           title,
           cover_url AS coverUrl,
           keyframe_url AS keyframeUrl,
           area_id AS areaId,
           area_name AS areaName,
           parent_area_id AS parentAreaId,
           parent_area_name AS parentAreaName,
           live_status AS liveStatus,
           live_time AS liveTime,
           online_count AS onlineCount,
           attention_count AS attentionCount,
           monitor_status AS monitorStatus,
           interval_seconds AS intervalSeconds,
           next_collect_at AS nextCollectAt,
           last_snapshot_at AS lastSnapshotAt,
           last_success_at AS lastSuccessAt,
           last_error_at AS lastErrorAt,
           last_error_type AS lastErrorType,
           last_error_message AS lastErrorMessage,
           backoff_until AS backoffUntil,
           source_endpoint AS sourceEndpoint,
           current_evidence_object_id AS currentEvidenceObjectId,
           version,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM bilibili_live_room_monitor
  `
}

function bilibiliLiveDanmakuSessionSelect(): string {
  return `
    SELECT session_id AS sessionId,
           monitor_id AS monitorId,
           room_id AS roomId,
           started_at AS startedAt,
           connected_at AS connectedAt,
           ended_at AS endedAt,
           status,
           connect_host AS connectHost,
           reconnect_count AS reconnectCount,
           last_heartbeat_at AS lastHeartbeatAt,
           last_error_at AS lastErrorAt,
           last_error_type AS lastErrorType,
           last_error_message AS lastErrorMessage,
           created_at AS createdAt
    FROM bilibili_live_danmaku_session
  `
}

function bilibiliLiveSessionSelect(): string {
  return `
    SELECT session_id AS sessionId,
           monitor_id AS monitorId,
           uid,
           room_id AS roomId,
           state,
           platform_live_time AS platformLiveTime,
           live_key AS liveKey,
           started_at AS startedAt,
           start_detected_at AS startDetectedAt,
           start_source AS startSource,
           end_signal_at AS endSignalAt,
           ended_at AS endedAt,
           end_detected_at AS endDetectedAt,
           end_source AS endSource,
           last_live_observed_at AS lastLiveObservedAt,
           last_observed_at AS lastObservedAt,
           title_at_start AS titleAtStart,
           title_at_end AS titleAtEnd,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM bilibili_live_session
  `
}

function bilibiliLiveSessionEventSelect(): string {
  return `
    SELECT event_id AS eventId,
           live_session_id AS liveSessionId,
           transport_session_id AS transportSessionId,
           receipt_ordinal AS receiptOrdinal,
           monitor_id AS monitorId,
           room_id AS roomId,
           event_key AS eventKey,
           source_event_id AS sourceEventId,
           event_kind AS eventKind,
           command,
           protocol_version AS protocolVersion,
           sender_uid AS senderUid,
           sender_name AS senderName,
           medal_name AS medalName,
           message_text AS messageText,
           gift_id AS giftId,
           gift_name AS giftName,
           gift_count AS giftCount,
           coin_type AS coinType,
           unit_price_milli_yuan AS unitPriceMilliYuan,
           paid_amount_milli_yuan AS paidAmountMilliYuan,
           paid,
           guard_level AS guardLevel,
           amount_source AS amountSource,
           occurred_at AS occurredAt,
           received_at AS receivedAt,
           raw_payload_json AS rawPayloadJson,
           created_at AS createdAt
    FROM bilibili_live_session_event
  `
}

function douyinAuthSessionSelect(): string {
  return `SELECT login_id AS loginId,
                 flow_type AS flowType,
                 provider_mode AS providerMode,
                 worker_session_id AS workerSessionId,
                 state,
                 status,
                 expires_at AS expiresAt,
                 completed_at AS completedAt,
                 error_code AS errorCode,
                 error_message AS errorMessage,
                 raw_result_json AS rawResultJson,
                 created_at AS createdAt,
                 updated_at AS updatedAt
          FROM douyin_auth_session`
}

function douyinCredentialSelect(): string {
  return `SELECT credential_id AS credentialId,
                 auth_type AS authType,
                 encrypted_payload AS encryptedPayload,
                 status,
                 expires_at AS expiresAt,
                 created_at AS createdAt,
                 updated_at AS updatedAt
          FROM douyin_auth_credential`
}

function bilibiliSubjectSelect(): string {
  return `
    SELECT subject_id AS subjectId,
           display_name AS displayName,
           avatar_url AS avatarUrl,
           remark,
           tags_json AS tagsJson,
           monitor_status AS monitorStatus,
           health_score AS healthScore,
           last_success_at AS lastSuccessAt,
           last_event_at AS lastEventAt,
           version,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM bilibili_monitored_subject
  `
}

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function toStoredBilibiliSubject(row: Record<string, unknown>): StoredBilibiliSubject {
  return {
    subjectId: String(row.subjectId),
    displayName: String(row.displayName),
    avatarUrl: nullableString(row.avatarUrl),
    remark: nullableString(row.remark),
    tags: parseJsonArray(row.tagsJson),
    monitorStatus: String(row.monitorStatus),
    healthScore: nullableNumber(row.healthScore),
    lastSuccessAt: nullableString(row.lastSuccessAt),
    lastEventAt: nullableString(row.lastEventAt),
    version: Number(row.version),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  }
}

function toStoredBilibiliSubjectBinding(
  row: Record<string, unknown>
): StoredBilibiliSubjectBinding {
  return {
    bindingId: String(row.bindingId),
    subjectId: String(row.subjectId),
    bilibiliUserMonitorId: nullableString(row.bilibiliUserMonitorId),
    bilibiliLiveRoomMonitorId: nullableString(row.bilibiliLiveRoomMonitorId),
    mid: nullableString(row.mid),
    roomId: nullableString(row.roomId),
    enabledCapabilities: parseJsonArray(row.enabledCapabilitiesJson),
    danmuEnabled: Boolean(row.danmuEnabled),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  }
}

function toStoredBilibiliSubjectLayout(
  row: Record<string, unknown>
): StoredBilibiliSubjectWidgetLayout {
  return {
    layoutId: String(row.layoutId),
    subjectId: String(row.subjectId),
    widgetKey: String(row.widgetKey),
    enabled: Boolean(row.enabled),
    position: parseJsonObject(row.positionJson),
    settings: parseJsonObject(row.settingsJson),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  }
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function toStoredRankSnapshot(row: Record<string, unknown>): StoredBilibiliLiveRankSnapshot {
  return {
    snapshotId: String(row.snapshotId),
    monitorId: String(row.monitorId),
    roomId: String(row.roomId),
    ruid: String(row.ruid),
    rankFamily: String(row.rankFamily),
    rankType: String(row.rankType),
    rankSwitch: row.rankSwitch === null ? null : String(row.rankSwitch),
    periodScope: row.periodScope === null ? null : String(row.periodScope),
    pageNo: Number(row.pageNo),
    pageSize: Number(row.pageSize),
    totalCount: row.totalCount === null ? null : Number(row.totalCount),
    countText: row.countText === null ? null : String(row.countText),
    valueText: row.valueText === null ? null : String(row.valueText),
    remindMsg: row.remindMsg === null ? null : String(row.remindMsg),
    sourceEndpoint: String(row.sourceEndpoint),
    signedRequired: Boolean(row.signedRequired),
    capturedAt: String(row.capturedAt),
    capturedBucket: String(row.capturedBucket),
    evidenceObjectId: String(row.evidenceObjectId),
    createdAt: String(row.createdAt)
  }
}
