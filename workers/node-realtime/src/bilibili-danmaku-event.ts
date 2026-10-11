import { decodeBilibiliGiftV2 } from "./bilibili-gift-v2"
import { parseDanmakuMessageJson } from "./bilibili-danmaku-message-text"

export type BilibiliDanmakuEventKind =
  | "DANMAKU"
  | "GIFT"
  | "SUPER_CHAT"
  | "GUARD_BUY"
  | "LIVE"
  | "PREPARING"
  | "METRICS"
  | "NOTIFICATION"
  | "UNKNOWN"

export interface ParsedBilibiliDanmakuEvent {
  command: string
  kind: BilibiliDanmakuEventKind
  eventKey?: string | undefined
  sourceEventId?: string | undefined
  occurredAt: string
  receivedAt: string
  actor?: {
    uid?: string | undefined
    displayName?: string | undefined
    medalName?: string | undefined
  } | undefined
  messageText?: string | undefined
  liveStartedAt?: string | undefined
  liveKey?: string | undefined
  gift?: {
    giftId?: string | undefined
    giftName?: string | undefined
    quantity: number
    coinType?: string | undefined
    price?: number | undefined
    totalCoin?: number | undefined
    paid: boolean
    amountMilliYuan: number
  } | undefined
  likeCount?: number | undefined
  likeIncrement?: number | undefined
  watchedCount?: number | undefined
  giftDelta: number
  superChatDelta: number
  amountMilliYuan?: number | undefined
  guardLevel?: number | undefined
  quantity?: number | undefined
  rawJson: string
}

export function parseBilibiliDanmakuEvent(
  rawJson: string,
  receivedAt: string
): ParsedBilibiliDanmakuEvent | undefined {
  return parseBilibiliDanmakuEvents(rawJson, receivedAt)[0]
}

// Transport consumers must use the batch API: V2 can carry several gifts.
export function parseBilibiliDanmakuEvents(rawJson: string, receivedAt: string): ParsedBilibiliDanmakuEvent[] {
  if (rawJson.includes("SEND_GIFT_V2")) {
    try {
      const root: unknown = JSON.parse(rawJson)
      if (isRecord(root) && text(root.cmd)?.split(":", 1)[0] === "SEND_GIFT_V2") {
        const command = String(root.cmd)
        const safeReceivedAt = validIso(receivedAt) ?? new Date().toISOString()
        const encoded = record(root.data).pb
        if (typeof encoded !== "string") return []
        return decodeBilibiliGiftV2(encoded).map(data => {
          const decoded = { ...root, data }
          return gift(decoded, command, rawJson, safeReceivedAt, eventTime(decoded, safeReceivedAt))
        })
      }
    } catch {
      // Invalid V2 broadcasts produce no partial or invented facts. Never log identity payloads.
      return []
    }
  }
  const event = parseSingleBilibiliDanmakuEvent(rawJson, receivedAt)
  return event ? [event] : []
}

function parseSingleBilibiliDanmakuEvent(
  rawJson: string,
  receivedAt: string
): ParsedBilibiliDanmakuEvent | undefined {
  if (!rawJson.trim().startsWith("{")) return undefined
  try {
    const { root, messageText } = parseDanmakuMessageJson(rawJson)
    if (!isRecord(root)) return undefined
    const command = text(root.cmd)
    if (!command) return undefined
    const normalized = command.split(":", 1)[0] ?? command
    const safeReceivedAt = validIso(receivedAt) ?? new Date().toISOString()
    const occurredAt = eventTime(root, safeReceivedAt)
    if (normalized === "DANMU_MSG") return danmaku(root, command, rawJson, safeReceivedAt, occurredAt, messageText())
    if (normalized === "WATCHED_CHANGE") {
      return metrics(root, command, rawJson, safeReceivedAt, occurredAt, {
        watchedCount: firstNumber(record(root.data), "num", "text_large", "text_small", "count", "watched_count")
      })
    }
    if (normalized === "LIKE_INFO_V3_UPDATE") {
      const data = record(root.data)
      return metrics(root, command, rawJson, safeReceivedAt, occurredAt, {
        likeCount: firstNumber(data, "click_count", "count", "like_count", "total"),
        likeIncrement: firstNumber(data, "increment", "like_increment", "num", "count_update")
      })
    }
    if (normalized === "ROOM_REAL_TIME_MESSAGE_UPDATE") {
      const data = record(root.data)
      return metrics(root, command, rawJson, safeReceivedAt, occurredAt, {
        likeCount: firstNumber(data, "like_count", "likes"),
        watchedCount: firstNumber(data, "watched_count", "watching_count", "online", "fans")
      })
    }
    if (normalized === "SEND_GIFT") return gift(root, command, rawJson, safeReceivedAt, occurredAt)
    if (normalized === "SUPER_CHAT_MESSAGE" || normalized === "SUPER_CHAT_MESSAGE_JPN") {
      return superChat(root, command, rawJson, safeReceivedAt, occurredAt)
    }
    if (normalized === "GUARD_BUY") return guardBuy(root, command, rawJson, safeReceivedAt, occurredAt)
    if (normalized === "LIVE" || normalized === "PREPARING") {
      const data = record(root.data)
      const liveKey = firstText(root, "live_key", "sub_session_key")
        ?? firstText(data, "live_key", "sub_session_key")
      const sourceEventId = firstText(root, "msg_id") ?? firstText(data, "msg_id")
        ?? liveKey
      return {
        ...base(command, normalized, sourceEventId, rawJson, safeReceivedAt, occurredAt),
        ...(liveKey ? { liveKey } : {}),
        ...(normalized === "LIVE"
          ? { liveStartedAt: epochIso(firstNumber(root, "live_time") ?? firstNumber(data, "live_time")) }
          : {})
      }
    }
    if (normalized === "COMBO_SEND" || normalized === "USER_TOAST_MSG") {
      const data = record(root.data)
      return {
        ...base(command, "NOTIFICATION", firstText(data, "id", "batch_combo_id", "combo_id", "rnd"), rawJson, safeReceivedAt, occurredAt),
        actor: actor(firstPositiveId(data, "uid"), firstText(data, "username", "uname")),
        giftDelta: normalized === "COMBO_SEND" ? 1 : 0
      }
    }
    return base(command, "UNKNOWN", undefined, rawJson, safeReceivedAt, occurredAt)
  } catch {
    return undefined
  }
}

function danmaku(
  root: Record<string, unknown>,
  command: string,
  rawJson: string,
  receivedAt: string,
  occurredAt: string,
  messageText: string
): ParsedBilibiliDanmakuEvent {
  const info = array(root.info)
  const ext = array(info[0])
  const detail = record(ext[15])
  const detailUser = record(detail.user)
  const detailBase = record(detailUser.base)
  const detailMedal = record(detailUser.medal)
  const user = array(info[2])
  const medal = array(info[3])
  const preferredName = firstText(detailBase, "name")
    ?? firstText(detailUser, "name", "uname")
  const arrayName = text(user[1])
  const displayName = chooseBetterName(preferredName, arrayName)
  const medalName = firstText(detailMedal, "name", "medal_name") ?? text(medal[1])
  const sourceEventId = extraId(root.extra) ?? extraId(record(root.data).extra)
    ?? extraId(detail.extra) ?? firstText(detail, "id_str")
  const fromInfo = number(ext[4])
  return {
    ...base(command, "DANMAKU", sourceEventId, rawJson, receivedAt, epochIso(fromInfo) ?? occurredAt),
    actor: actor(positiveId(user[0]), displayName, medalName),
    messageText
  }
}

function gift(
  root: Record<string, unknown>,
  command: string,
  rawJson: string,
  receivedAt: string,
  occurredAt: string
): ParsedBilibiliDanmakuEvent {
  const data = record(root.data)
  const userInfo = record(data.uinfo)
  const baseInfo = record(userInfo.base)
  const totalCoin = nonNegative(firstNumber(data, "total_coin", "totalCoin"))
  const price = nonNegative(firstNumber(data, "price", "discount_price"))
  const quantity = positiveNumber(firstNumber(data, "num", "gift_num")) ?? 1
  const paid = (firstText(data, "coin_type", "coinType") ?? "").toLowerCase() === "gold"
  const coinType = firstText(data, "coin_type", "coinType")?.toLowerCase()
  const amount = paid ? totalCoin ?? (price === undefined ? 0 : price * quantity) : 0
  const giftId = firstPositiveId(data, "giftId", "gift_id")
  const giftName = firstText(data, "giftName", "gift_name")
  return {
    ...base(command, "GIFT", firstText(data, "tid", "rnd", "batch_combo_id"), rawJson, receivedAt, occurredAt),
    actor: actor(
      firstPositiveId(data, "uid", "sender_uid"),
      firstText(data, "uname", "username", "name") ?? firstText(baseInfo, "name"),
      firstText(record(data.medal_info), "medal_name", "name")
    ),
    gift: {
      ...(giftId ? { giftId } : {}),
      ...(giftName ? { giftName } : {}),
      quantity,
      ...(coinType ? { coinType } : {}),
      ...(price === undefined ? {} : { price }),
      ...(totalCoin === undefined ? {} : { totalCoin }),
      paid,
      amountMilliYuan: amount
    },
    quantity,
    amountMilliYuan: amount,
    giftDelta: 1
  }
}

function superChat(
  root: Record<string, unknown>,
  command: string,
  rawJson: string,
  receivedAt: string,
  occurredAt: string
): ParsedBilibiliDanmakuEvent {
  const data = record(root.data)
  const user = record(data.user_info)
  const medal = record(data.medal_info)
  const userMedal = record(user.medal_info)
  const price = nonNegative(firstNumber(data, "price"))
  return {
    ...base(command, "SUPER_CHAT", firstText(data, "id_str", "id"), rawJson, receivedAt, occurredAt),
    actor: actor(
      firstPositiveId(data, "uid"),
      firstText(user, "uname") ?? firstText(data, "uname"),
      firstText(medal, "medal_name", "name") ?? firstText(userMedal, "medal_name", "name")
    ),
    messageText: firstText(data, "message"),
    amountMilliYuan: price === undefined ? undefined : price * 1_000,
    quantity: 1,
    superChatDelta: 1
  }
}

function guardBuy(
  root: Record<string, unknown>,
  command: string,
  rawJson: string,
  receivedAt: string,
  occurredAt: string
): ParsedBilibiliDanmakuEvent {
  const data = record(root.data)
  const quantity = positiveNumber(firstNumber(data, "num")) ?? 1
  const price = nonNegative(firstNumber(data, "price"))
  const strongSourceId = firstText(data, "payflow_id", "payflowId", "order_id", "orderId")
  const sourceEventId = strongSourceId ?? `semantic:${createHash("sha256").update([
    firstPositiveId(data, "uid") ?? "",
    String(nonNegative(firstNumber(data, "guard_level", "guardLevel")) ?? ""),
    String(quantity),
    String(price ?? ""),
    firstText(data, "start_time", "timestamp", "ts") ?? ""
  ].join("|")).digest("hex")}`
  return {
    ...base(command, "GUARD_BUY", sourceEventId, rawJson, receivedAt, occurredAt),
    actor: actor(firstPositiveId(data, "uid"), firstText(data, "username", "uname")),
    guardLevel: nonNegative(firstNumber(data, "guard_level", "guardLevel")),
    quantity,
    amountMilliYuan: price === undefined ? undefined : price * quantity
  }
}

function metrics(
  root: Record<string, unknown>,
  command: string,
  rawJson: string,
  receivedAt: string,
  occurredAt: string,
  values: {
    likeCount?: number | undefined
    likeIncrement?: number | undefined
    watchedCount?: number | undefined
  }
): ParsedBilibiliDanmakuEvent {
  const sourceEventId = firstText(root, "msg_id") ?? firstText(record(root.data), "id")
  return { ...base(command, "METRICS", sourceEventId, rawJson, receivedAt, occurredAt), ...values }
}

function base(
  command: string,
  kind: BilibiliDanmakuEventKind,
  sourceEventId: string | undefined,
  rawJson: string,
  receivedAt: string,
  occurredAt: string
): ParsedBilibiliDanmakuEvent {
  const normalized = command.split(":", 1)[0] ?? command
  const keyCommand = normalized === "SEND_GIFT_V2" ? "SEND_GIFT" : normalized
  return {
    command,
    kind,
    ...(sourceEventId ? { sourceEventId, eventKey: `${keyCommand}:${sourceEventId}` } : {}),
    occurredAt,
    receivedAt,
    giftDelta: 0,
    superChatDelta: 0,
    rawJson
  }
}

function eventTime(root: Record<string, unknown>, fallback: string): string {
  const value = firstNumber(root, "send_time", "timestamp", "ts")
    ?? firstNumber(record(root.data), "send_time", "timestamp", "ts", "start_time")
  return epochIso(value) ?? fallback
}

function epochIso(value: number | undefined): string | undefined {
  if (value === undefined || value <= 0) return undefined
  const date = new Date(value < 10_000_000_000 ? value * 1_000 : value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function actor(
  uid: string | undefined,
  displayName?: string,
  medalName?: string
): ParsedBilibiliDanmakuEvent["actor"] {
  if (!uid && !displayName && !medalName) return undefined
  return {
    ...(uid ? { uid } : {}),
    ...(displayName ? { displayName } : {}),
    ...(medalName ? { medalName } : {})
  }
}

function extraId(value: unknown): string | undefined {
  if (isRecord(value)) return firstText(value, "id_str", "id")
  const raw = text(value)
  if (!raw?.startsWith("{")) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? firstText(parsed, "id_str", "id") : undefined
  } catch {
    return undefined
  }
}

function chooseBetterName(preferred?: string, fallback?: string): string | undefined {
  if (!preferred) return fallback
  if (!fallback) return preferred
  return preferred.includes("*") && !fallback.includes("*") ? fallback : preferred
}

function firstText(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const result = text(value[key])
    if (result) return result
  }
  return undefined
}

function firstNumber(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const result = number(value[key])
    if (result !== undefined) return result
  }
  return undefined
}

function firstPositiveId(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const result = positiveId(value[key])
    if (result) return result
  }
  return undefined
}

function positiveId(value: unknown): string | undefined {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim()
  const parsed = number(value)
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : undefined
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value)
  const raw = text(value)?.replaceAll(",", "")
  if (!raw) return undefined
  let multiplier = 1
  let normalized = raw
  if (raw.endsWith("亿")) {
    multiplier = 100_000_000
    normalized = raw.slice(0, -1)
  } else if (raw.endsWith("万")) {
    multiplier = 10_000
    normalized = raw.slice(0, -1)
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : undefined
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined
}

function nonNegative(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 ? value : undefined
}

function validIso(value: string): string | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized = String(value).trim()
  return normalized || undefined
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
import { createHash } from "node:crypto"
