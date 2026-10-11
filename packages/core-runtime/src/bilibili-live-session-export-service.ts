import { writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { resolve } from "node:path"

import {
  ExportBilibiliLiveSessionInputSchema,
  PreparedBilibiliLiveSessionExportSchema,
  type BilibiliLiveSessionExportCategory,
  type BilibiliLiveSessionSummary,
  type BilibiliLiveSessionUser,
  type ExportBilibiliLiveSessionInput,
  type PreparedBilibiliLiveSessionExport
} from "@bmd/contracts"
import type { ControlDatabase, StoredBilibiliLiveSessionEvent } from "@bmd/storage"
import { bilibiliLiveExportDate, bilibiliLiveExportFileName } from "./bilibili-live-export-name"
import { writeSnapshotCsv, writeSnapshotZip } from "./bilibili-live-session-csv-zip"
import type { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { cleanupExportSnapshotWorkspace, createExportSnapshotWorkspace } from "./export-snapshot-workspace"
import {
  cleanupExportPreparedWorkspace, createExportPreparedWorkspace, resolvePreparedExportMainContext,
  validatePreparedExportCredentialKey, type PreparedExportMainContext
} from "./export-prepared-workspace"
import {
  writeSnapshotRows,
  writeSnapshotXlsx,
  type ExportColumns,
  type ExportRow,
  type XlsxSnapshotSheet
} from "./bilibili-live-session-xlsx"

const SCHEMA_VERSION = "2" as const
const CAPTURE_SCOPE = "received_while_websocket_online_since_deployment"

const SUMMARY: ExportColumns = {
  headers: [
    "id", "monitor_id", "uid", "room_id", "state", "started_at", "ended_at",
    "start_source", "end_source", "coverage_status", "transport_session_count",
    "capture_started_at", "capture_ended_at", "danmaku_count", "gift_event_count", "gift_count",
    "free_gift_count", "gift_sender_count", "paid_user_count", "interacting_user_count",
    "unresolved_interacting_event_count", "unresolved_gift_event_count",
    "unresolved_paid_event_count", "paid_event_count", "paid_amount_milli_yuan",
    "first_event_at", "last_event_at"
  ],
  comments: [
    "场次记录 ID", "直播监控记录 ID", "主播 B站 UID", "直播间 ID", "场次状态", "场次开始时间",
    "场次结束时间", "开始边界来源", "结束边界来源", "数据覆盖状态", "WebSocket 传输会话数",
    "在线采集开始时间", "在线采集结束时间", "弹幕事件数", "礼物事件数", "礼物数量",
    "免费礼物数量", "已识别送礼用户数", "已识别付费用户数", "已识别互动用户数",
    "未解析身份的互动事件数", "未解析身份的送礼事件数", "未解析身份的付费事件数",
    "付费事件数", "消费金额（千分之一元）", "首条事件时间", "末条事件时间"
  ]
}

const DANMAKU: ExportColumns = {
  headers: [
    "occurred_at", "received_at", "sender_uid", "sender_name", "medal_name", "message_text",
    "command", "protocol_version", "source_event_id"
  ],
  comments: [
    "事件发生时间", "系统接收时间", "发送者 B站 UID", "发送者昵称", "粉丝勋章名称", "弹幕内容",
    "B站消息命令", "协议版本", "上游事件 ID"
  ]
}

const GIFTS: ExportColumns = {
  headers: [
    "occurred_at", "received_at", "event_kind", "sender_uid", "sender_name", "medal_name",
    "message_text", "gift_id", "gift_name", "gift_count", "coin_type",
    "unit_price_milli_yuan", "paid_amount_milli_yuan", "paid", "guard_level", "amount_source",
    "command", "protocol_version", "source_event_id", "event_key", "transport_session_id"
  ],
  comments: [
    "事件发生时间", "系统接收时间", "事件类型", "发送者 B站 UID", "发送者昵称", "粉丝勋章名称",
    "消息文本", "礼物 ID", "礼物名称", "礼物数量", "平台币类型", "单件价格（千分之一元）",
    "实付金额（千分之一元）", "是否付费", "舰队等级", "金额来源", "B站消息命令", "协议版本",
    "上游事件 ID", "事件去重键", "WebSocket 传输会话 ID"
  ]
}

const USERS: ExportColumns = {
  headers: [
    "actor_key", "identity_quality", "user_uid", "display_name", "danmaku_count",
    "gift_event_count", "gift_count", "free_gift_count", "paid_event_count",
    "paid_amount_milli_yuan", "first_seen_at", "last_seen_at"
  ],
  comments: [
    "身份聚合键", "身份识别质量", "用户 B站 UID", "用户昵称", "弹幕事件数", "礼物事件数",
    "礼物数量", "免费礼物数量", "付费事件数", "消费金额（千分之一元）", "首次出现时间",
    "最后出现时间"
  ]
}

export class BilibiliLiveSessionExportService {
  private readonly credentialKey: Uint8Array
  private readonly mainContext: PreparedExportMainContext

  constructor(private readonly options: {
    database: ControlDatabase
    sessions: BilibiliLiveSessionService
    exportDirectory: string
    now: () => Date
    idFactory: () => string
    credentialKey?: Uint8Array
    mainContext?: PreparedExportMainContext
  }) {
    this.credentialKey = options.credentialKey ?? randomBytes(32)
    validatePreparedExportCredentialKey(this.credentialKey)
    this.mainContext = resolvePreparedExportMainContext(options.mainContext)
  }

  async prepare(
    input: ExportBilibiliLiveSessionInput,
    reportProgress?: () => void,
    signal?: AbortSignal
  ): Promise<PreparedBilibiliLiveSessionExport> {
    signal?.throwIfAborted()
    const parsed = ExportBilibiliLiveSessionInputSchema.parse(input)
    // Allocate the original daily number exactly once, before any filesystem IO.
    const metadata = this.metadata(this.options.sessions.get(parsed.sessionId), parsed.category,
      resolve(this.options.exportDirectory, parsed.category === "all" ? "output.zip" : parsed.category === "xlsx" ? "output.xlsx" : "output.csv"))
    signal?.throwIfAborted()
    const owned = await createExportPreparedWorkspace(this.options.exportDirectory, parsed.category, this.credentialKey, this.mainContext)
    const prepared = { ...metadata, temporaryPath: owned.outputPath }
    try {
      signal?.throwIfAborted()
      if (parsed.category === "xlsx") return await this.prepareXlsx(parsed.sessionId, prepared, reportProgress, signal)
      return await this.prepareCsvZip(parsed.sessionId, parsed.category, prepared, reportProgress, signal)
    } catch (error) {
      // Writers drain and close their descriptors before rejecting. Main owns success.
      await cleanupExportPreparedWorkspace(owned, this.credentialKey)
      throw error
    }
  }

  private async prepareCsvZip(
    sessionId: string,
    category: Exclude<BilibiliLiveSessionExportCategory, "xlsx">,
    prepared: PreparedBilibiliLiveSessionExport,
    reportProgress?: () => void,
    signal?: AbortSignal
  ): Promise<PreparedBilibiliLiveSessionExport> {
    const temporaryPath = prepared.temporaryPath
    signal?.throwIfAborted()
    if (category !== "all") {
      const summary = this.options.database.runInTransaction(() => {
        const summary = this.options.sessions.get(sessionId)
        this.writeCsv(category, sessionId, temporaryPath, reportProgress, signal)
        return summary
      })
      return PreparedBilibiliLiveSessionExportSchema.parse({ ...prepared, coverageStatus: summary.coverageStatus })
    }
    const ownedWorkspace = await createExportSnapshotWorkspace(this.options.exportDirectory, "zip")
    const workspace = ownedWorkspace.path
    try {
      signal?.throwIfAborted()
      const snapshot = this.options.database.runInTransaction(() => {
        const summary = this.options.sessions.get(sessionId)
        const manifestPath = resolve(workspace, "manifest.json")
        writeFileSync(manifestPath, JSON.stringify(this.manifest(summary)), { encoding: "utf8", flag: "wx" })
        const summaryPath = resolve(workspace, "summary.csv")
        writeSnapshotCsv(summaryPath, SUMMARY, reportRows([summary], reportProgress, signal), summaryRow)
        const entries = [
          { name: "manifest.json", path: manifestPath },
          { name: "summary.csv", path: summaryPath }
        ]
        for (const item of ["danmaku", "gifts", "users"] as const) {
          const path = resolve(workspace, `${item}.csv`)
          this.writeCsv(item, sessionId, path, reportProgress, signal)
          entries.push({ name: `${item}.csv`, path })
        }
        return { summary, entries }
      })
      const result = PreparedBilibiliLiveSessionExportSchema.parse({
        ...prepared, coverageStatus: snapshot.summary.coverageStatus
      })
      await writeSnapshotZip(temporaryPath, snapshot.entries, signal)
      return result
    } finally {
      await cleanupExportSnapshotWorkspace(ownedWorkspace)
    }
  }

  private writeCsv(
    category: Exclude<BilibiliLiveSessionExportCategory, "xlsx" | "all">,
    sessionId: string,
    path: string,
    reportProgress?: () => void,
    signal?: AbortSignal
  ): void {
    const database = this.options.database
    if (category === "danmaku") {
      writeSnapshotCsv(path, DANMAKU, reportRows(database.iterateBilibiliLiveSessionExportEvents(sessionId, "danmaku"), reportProgress, signal), danmakuRow)
    } else if (category === "gifts") {
      writeSnapshotCsv(path, GIFTS, reportRows(database.iterateBilibiliLiveSessionExportEvents(sessionId, "gifts"), reportProgress, signal), giftRow)
    } else {
      writeSnapshotCsv(path, USERS, reportRows(database.iterateBilibiliLiveSessionExportUsers(sessionId), reportProgress, signal), userRow)
    }
  }

  private metadata(
    summary: BilibiliLiveSessionSummary,
    category: BilibiliLiveSessionExportCategory,
    temporaryPath: string
  ): PreparedBilibiliLiveSessionExport {
    const date = bilibiliLiveExportDate(this.options.now())
    const number = this.options.database.allocateBilibiliLiveExportNumber(summary.uid, date)
    const suggestedFileName = bilibiliLiveExportFileName({
      uname: this.options.database.findBilibiliLiveRoomById(summary.monitorId)?.uname,
      uid: summary.uid, date, number, category
    })
    return PreparedBilibiliLiveSessionExportSchema.parse({
      sessionId: summary.id,
      category,
      temporaryPath,
      suggestedFileName,
      mediaType: mediaType(category),
      schemaVersion: SCHEMA_VERSION,
      coverageStatus: summary.coverageStatus
    })
  }

  private async prepareXlsx(
    sessionId: string,
    prepared: PreparedBilibiliLiveSessionExport,
    reportProgress?: () => void,
    signal?: AbortSignal
  ): Promise<PreparedBilibiliLiveSessionExport> {
    const temporaryPath = prepared.temporaryPath
    signal?.throwIfAborted()
    const ownedWorkspace = await createExportSnapshotWorkspace(this.options.exportDirectory, "xlsx")
    const workspace = ownedWorkspace.path
    try {
      signal?.throwIfAborted()
      // Finish the synchronous SQLite snapshot before yielding to ongoing collection.
      const snapshot = this.options.database.runInTransaction(() => {
        const summary = this.options.sessions.get(sessionId)
        const sheets = [
          snapshotSheet(workspace, "summary", "场次摘要", SUMMARY, reportRows([summary], reportProgress, signal), summaryRow),
          snapshotSheet(workspace, "danmaku", "弹幕", DANMAKU,
            reportRows(this.options.database.iterateBilibiliLiveSessionExportEvents(sessionId, "danmaku"), reportProgress, signal), danmakuRow),
          snapshotSheet(workspace, "gifts", "礼物", GIFTS,
            reportRows(this.options.database.iterateBilibiliLiveSessionExportEvents(sessionId, "gifts"), reportProgress, signal), giftRow),
          snapshotSheet(workspace, "users", "用户", USERS,
            reportRows(this.options.database.iterateBilibiliLiveSessionExportUsers(sessionId), reportProgress, signal), userRow)
        ]
        return { summary, sheets }
      })
      const result = PreparedBilibiliLiveSessionExportSchema.parse({
        ...prepared, coverageStatus: snapshot.summary.coverageStatus
      })
      await writeSnapshotXlsx(temporaryPath, snapshot.sheets, signal)
      return result
    } finally {
      await cleanupExportSnapshotWorkspace(ownedWorkspace)
    }
  }

  private manifest(summary: BilibiliLiveSessionSummary) {
    return {
      schema_version: SCHEMA_VERSION,
      amount_unit: "milli_yuan",
      capture_scope: CAPTURE_SCOPE,
      coverage_status: summary.coverageStatus,
      transport_session_count: summary.transportSessionCount,
      capture_started_at: summary.captureStartedAt,
      capture_ended_at: summary.captureEndedAt,
      session_id: summary.id,
      generated_at: this.options.now().toISOString(),
      files: ["summary.csv", "danmaku.csv", "gifts.csv", "users.csv"]
    }
  }
}

function* reportRows<T>(values: Iterable<T>, reportProgress?: () => void, signal?: AbortSignal): Iterable<T> {
  for (const value of values) {
    signal?.throwIfAborted()
    reportProgress?.()
    signal?.throwIfAborted()
    yield value
  }
  reportProgress?.()
  signal?.throwIfAborted()
}

function snapshotSheet<T>(
  workspace: string,
  fileName: string,
  name: string,
  columns: ExportColumns,
  values: Iterable<T>,
  toRow: (value: T) => ExportRow
): XlsxSnapshotSheet {
  const path = resolve(workspace, `${fileName}.ndjson`)
  return { name, columns, path, rowCount: writeSnapshotRows(path, values, toRow) }
}

function summaryRow(summary: BilibiliLiveSessionSummary): ExportRow {
  return [
    summary.id, summary.monitorId, summary.uid, summary.roomId, summary.state, summary.startedAt,
    summary.endedAt, summary.startSource, summary.endSource, summary.coverageStatus,
    summary.transportSessionCount, summary.captureStartedAt, summary.captureEndedAt,
    summary.danmakuCount, summary.giftEventCount, summary.giftCount, summary.freeGiftCount,
    summary.giftSenderCount, summary.paidUserCount, summary.interactingUserCount,
    summary.unresolvedInteractingEventCount, summary.unresolvedGiftEventCount,
    summary.unresolvedPaidEventCount, summary.paidEventCount, summary.paidAmountMilliYuan,
    summary.firstEventAt, summary.lastEventAt
  ]
}

function danmakuRow(event: StoredBilibiliLiveSessionEvent): ExportRow {
  return [
    event.occurredAt, event.receivedAt, event.senderUid, event.senderName, event.medalName,
    event.messageText, event.command, event.protocolVersion, event.sourceEventId
  ]
}

function giftRow(event: StoredBilibiliLiveSessionEvent): ExportRow {
  return [
    event.occurredAt, event.receivedAt, event.eventKind, event.senderUid, event.senderName,
    event.medalName, event.messageText, event.giftId, event.giftName, event.giftCount,
    event.coinType,
    !event.paid || event.coinType?.toLocaleLowerCase() === "silver" ? null : event.unitPriceMilliYuan,
    event.paidAmountMilliYuan, event.paid, event.guardLevel, event.amountSource, event.command,
    event.protocolVersion, event.sourceEventId, event.eventKey, event.transportSessionId
  ]
}

function userRow(user: BilibiliLiveSessionUser): ExportRow {
  return [
    user.actorKey, user.identityQuality, user.userUid, user.displayName, user.danmakuCount,
    user.giftEventCount, user.giftCount, user.freeGiftCount, user.paidEventCount,
    user.paidAmountMilliYuan, user.firstSeenAt, user.lastSeenAt
  ]
}

function mediaType(category: BilibiliLiveSessionExportCategory): string {
  if (category === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (category === "all") return "application/zip"
  return "text/csv;charset=UTF-8"
}
