import { mkdir, writeFile } from "node:fs/promises"
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
import ExcelJS from "exceljs"
import { strToU8, zipSync } from "fflate"

import type { BilibiliLiveSessionService } from "./bilibili-live-session-service"

const SCHEMA_VERSION = "2" as const
const CAPTURE_SCOPE = "received_while_websocket_online_since_deployment"

interface ColumnSet {
  headers: readonly string[]
  comments: readonly string[]
}

interface ExportSnapshot {
  summary: BilibiliLiveSessionSummary
  danmaku: StoredBilibiliLiveSessionEvent[]
  gifts: StoredBilibiliLiveSessionEvent[]
  users: BilibiliLiveSessionUser[]
}

const SUMMARY: ColumnSet = {
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

const DANMAKU: ColumnSet = {
  headers: [
    "occurred_at", "received_at", "sender_uid", "sender_name", "medal_name", "message_text",
    "command", "protocol_version", "source_event_id"
  ],
  comments: [
    "事件发生时间", "系统接收时间", "发送者 B站 UID", "发送者昵称", "粉丝勋章名称", "弹幕内容",
    "B站消息命令", "协议版本", "上游事件 ID"
  ]
}

const GIFTS: ColumnSet = {
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

const USERS: ColumnSet = {
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
  constructor(private readonly options: {
    database: ControlDatabase
    sessions: BilibiliLiveSessionService
    exportDirectory: string
    now: () => Date
    idFactory: () => string
  }) {}

  async prepare(input: ExportBilibiliLiveSessionInput): Promise<PreparedBilibiliLiveSessionExport> {
    const parsed = ExportBilibiliLiveSessionInputSchema.parse(input)
    const snapshot = this.options.database.runInTransaction(() => this.snapshot(parsed.sessionId))
    const extension = parsed.category === "xlsx" ? "xlsx" : parsed.category === "all" ? "zip" : "csv"
    const suggestedFileName = parsed.category === "xlsx"
      ? `bilibili-live-session-${parsed.sessionId}.xlsx`
      : `bilibili-live-session-${parsed.sessionId}-${parsed.category}.${extension}`
    await mkdir(this.options.exportDirectory, { recursive: true })
    const temporaryPath = resolve(
      this.options.exportDirectory,
      `${this.options.idFactory()}-${parsed.category}.${extension}`
    )
    const bytes = await this.encode(parsed.category, snapshot)
    await writeFile(temporaryPath, bytes)
    return PreparedBilibiliLiveSessionExportSchema.parse({
      sessionId: parsed.sessionId,
      category: parsed.category,
      temporaryPath,
      suggestedFileName,
      mediaType: mediaType(parsed.category),
      schemaVersion: SCHEMA_VERSION,
      coverageStatus: snapshot.summary.coverageStatus
    })
  }

  private snapshot(sessionId: string): ExportSnapshot {
    const summary = this.options.sessions.get(sessionId)
    const facts = this.options.database.findAllBilibiliLiveSessionEvents(sessionId)
      .filter((event) => ["DANMAKU", "GIFT", "SUPER_CHAT", "GUARD_BUY"].includes(event.eventKind))
    return {
      summary,
      danmaku: facts.filter((event) => event.eventKind === "DANMAKU"),
      gifts: facts.filter((event) => ["GIFT", "SUPER_CHAT", "GUARD_BUY"].includes(event.eventKind)),
      users: aggregateUsers(facts)
    }
  }

  private async encode(
    category: BilibiliLiveSessionExportCategory,
    snapshot: ExportSnapshot
  ): Promise<Uint8Array> {
    if (category === "danmaku") return csvBytes(DANMAKU, danmakuRows(snapshot.danmaku))
    if (category === "gifts") return csvBytes(GIFTS, giftRows(snapshot.gifts))
    if (category === "users") return csvBytes(USERS, userRows(snapshot.users))
    if (category === "xlsx") return this.xlsx(snapshot)
    const manifest = {
      schema_version: SCHEMA_VERSION,
      amount_unit: "milli_yuan",
      capture_scope: CAPTURE_SCOPE,
      coverage_status: snapshot.summary.coverageStatus,
      transport_session_count: snapshot.summary.transportSessionCount,
      capture_started_at: snapshot.summary.captureStartedAt,
      capture_ended_at: snapshot.summary.captureEndedAt,
      session_id: snapshot.summary.id,
      generated_at: this.options.now().toISOString(),
      files: ["summary.csv", "danmaku.csv", "gifts.csv", "users.csv"]
    }
    return zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "summary.csv": csvBytes(SUMMARY, [summaryRow(snapshot.summary)]),
      "danmaku.csv": csvBytes(DANMAKU, danmakuRows(snapshot.danmaku)),
      "gifts.csv": csvBytes(GIFTS, giftRows(snapshot.gifts)),
      "users.csv": csvBytes(USERS, userRows(snapshot.users))
    }, { level: 6 })
  }

  private async xlsx(snapshot: ExportSnapshot): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook()
    addSheet(workbook, "场次摘要", SUMMARY, [summaryRow(snapshot.summary)])
    addSheet(workbook, "弹幕", DANMAKU, danmakuRows(snapshot.danmaku))
    addSheet(workbook, "礼物", GIFTS, giftRows(snapshot.gifts))
    addSheet(workbook, "用户", USERS, userRows(snapshot.users))
    return new Uint8Array(await workbook.xlsx.writeBuffer())
  }
}

function summaryRow(summary: BilibiliLiveSessionSummary): unknown[] {
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

function danmakuRows(events: StoredBilibiliLiveSessionEvent[]): unknown[][] {
  return events.map((event) => [
    event.occurredAt, event.receivedAt, event.senderUid, event.senderName, event.medalName,
    event.messageText, event.command, event.protocolVersion, event.sourceEventId
  ])
}

function giftRows(events: StoredBilibiliLiveSessionEvent[]): unknown[][] {
  return events.map((event) => [
    event.occurredAt, event.receivedAt, event.eventKind, event.senderUid, event.senderName,
    event.medalName, event.messageText, event.giftId, event.giftName, event.giftCount,
    event.coinType,
    !event.paid || event.coinType?.toLocaleLowerCase() === "silver" ? null : event.unitPriceMilliYuan,
    event.paidAmountMilliYuan, event.paid, event.guardLevel, event.amountSource, event.command,
    event.protocolVersion, event.sourceEventId, event.eventKey, event.transportSessionId
  ])
}

function userRows(users: BilibiliLiveSessionUser[]): unknown[][] {
  return users.map((user) => [
    user.actorKey, user.identityQuality, user.userUid, user.displayName, user.danmakuCount,
    user.giftEventCount, user.giftCount, user.freeGiftCount, user.paidEventCount,
    user.paidAmountMilliYuan, user.firstSeenAt, user.lastSeenAt
  ])
}

function aggregateUsers(events: StoredBilibiliLiveSessionEvent[]): BilibiliLiveSessionUser[] {
  const grouped = new Map<string, StoredBilibiliLiveSessionEvent[]>()
  for (const event of events) {
    const actorKey = event.senderUid ? `uid:${event.senderUid}` : `event:${event.eventId}`
    const values = grouped.get(actorKey) ?? []
    values.push(event)
    grouped.set(actorKey, values)
  }
  return [...grouped.entries()].map(([actorKey, values]) => {
    const paidEvents = values.filter((event) =>
      ["GIFT", "SUPER_CHAT", "GUARD_BUY"].includes(event.eventKind)
      && (event.paid || (event.paidAmountMilliYuan ?? 0) > 0)
    )
    return {
      actorKey,
      identityQuality: actorKey.startsWith("uid:") ? "VERIFIED_UID" as const : "UNRESOLVED_EVENT" as const,
      userUid: actorKey.startsWith("uid:") ? actorKey.slice(4) : null,
      displayName: [...values].reverse().find((event) => event.senderName?.trim())?.senderName ?? null,
      danmakuCount: values.filter((event) => event.eventKind === "DANMAKU").length,
      giftEventCount: values.filter((event) => event.eventKind === "GIFT").length,
      giftCount: sum(values.filter((event) => event.eventKind === "GIFT"), giftQuantity),
      freeGiftCount: sum(
        values.filter((event) => event.eventKind === "GIFT" && !event.paid),
        giftQuantity
      ),
      paidEventCount: paidEvents.length,
      paidAmountMilliYuan: sum(paidEvents, (event) => event.paidAmountMilliYuan ?? 0),
      firstSeenAt: values[0]?.occurredAt ?? values[0]?.receivedAt ?? new Date(0).toISOString(),
      lastSeenAt: values.at(-1)?.occurredAt ?? values.at(-1)?.receivedAt ?? new Date(0).toISOString()
    }
  }).sort((left, right) =>
    right.paidAmountMilliYuan - left.paidAmountMilliYuan
    || right.giftCount - left.giftCount
    || right.danmakuCount - left.danmakuCount
    || left.actorKey.localeCompare(right.actorKey)
  )
}

function csvBytes(columns: ColumnSet, rows: unknown[][]): Uint8Array {
  const lines = [columns.headers, columns.comments, ...rows]
    .map((row) => row.map(csvField).join(","))
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8")
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text = String(value)
  if (typeof value === "string" && isFormula(text)) text = `'${text}`
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function isFormula(value: string): boolean {
  if (!value) return false
  let index = 0
  let controlWhitespace = false
  while (index < value.length && /\s/u.test(value[index] ?? "")) {
    if ((value.codePointAt(index) ?? 32) < 32) controlWhitespace = true
    index += 1
  }
  if (controlWhitespace) return true
  return ["=", "+", "-", "@"].includes(value[index] ?? "")
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ColumnSet,
  rows: unknown[][]
): void {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] })
  const header = sheet.addRow([...columns.headers])
  const comments = sheet.addRow([...columns.comments])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } }
  comments.font = { color: { argb: "FF1F4E78" } }
  comments.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } }
  comments.height = 32
  comments.alignment = { wrapText: true }
  for (const row of rows) sheet.addRow(row)
  for (let index = 0; index < columns.headers.length; index += 1) {
    const field = columns.headers[index] ?? ""
    const comment = columns.comments[index] ?? ""
    sheet.getColumn(index + 1).width = columnWidth(field, comment)
  }
  const lastColumn = sheet.getColumn(columns.headers.length).letter
  sheet.autoFilter = `A1:${lastColumn}${Math.max(1, sheet.rowCount)}`
}

function columnWidth(header: string, comment: string): number {
  const base = header.endsWith("_at")
    ? 30
    : header.endsWith("_id") || header.endsWith("_uid") || header === "event_key"
      ? 24
      : header === "message_text" ? 56 : header.includes("name") ? 24 : 18
  return Math.max(base, Math.min(36, comment.length * 2))
}

function mediaType(category: BilibiliLiveSessionExportCategory): string {
  if (category === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (category === "all") return "application/zip"
  return "text/csv;charset=UTF-8"
}

function giftQuantity(event: StoredBilibiliLiveSessionEvent): number {
  return event.giftCount ?? 1
}

function sum<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0)
}
