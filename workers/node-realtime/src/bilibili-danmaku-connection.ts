import { createHash } from "node:crypto"

import WebSocket, { type RawData } from "ws"

import { parseBilibiliDanmakuEvent, type ParsedBilibiliDanmakuEvent } from "./bilibili-danmaku-event"
import {
  BILIBILI_DANMAKU_OPERATION,
  buildBilibiliDanmakuAuthPacket,
  buildBilibiliDanmakuHeartbeatPacket,
  parseBilibiliDanmakuPackets
} from "./bilibili-danmaku-packet"

const USER_AGENT = "BiliMonitorDesktop/0.1 (+local Bilibili live danmaku monitor)"
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
] as const

export interface BilibiliDanmakuConnectionInput {
  roomId: string
  protocolVersion?: number
  credential?: { cookieHeader: string; authUid: string }
  connectTimeoutMs?: number
  heartbeatSeconds?: number
}

export type BilibiliDanmakuConnectionEvent =
  | { type: "command"; receivedAt: string; event: ParsedBilibiliDanmakuEvent }
  | { type: "heartbeat"; popularity: number; receivedAt: string }
  | { type: "closed"; receivedAt: string; code: number; reason: string }
  | { type: "error"; receivedAt: string; errorType: string; message: string }

export interface RunningBilibiliDanmakuConnection {
  connectHost: string
  protocolVersion: number
  authMode: "ANONYMOUS" | "LOGIN"
  authUid?: string
  stop: () => Promise<void>
}

interface DanmuInfo {
  token: string
  buvid: string
  authMode: "ANONYMOUS" | "LOGIN"
  authUid?: string
  hosts: string[]
}

let cachedWbiKeys: { imgKey: string; subKey: string; expiresAt: number } | undefined
let cachedBuvid: { buvid3: string; buvid4?: string; expiresAt: number } | undefined

export async function startBilibiliDanmakuConnection(
  input: BilibiliDanmakuConnectionInput,
  onEvent: (event: BilibiliDanmakuConnectionEvent) => void
): Promise<RunningBilibiliDanmakuConnection> {
  const info = await fetchDanmuInfoWithFallback(input.roomId, input.credential)
  const candidates = protocolCandidates(input.protocolVersion)
  let lastError: unknown
  for (const protocolVersion of candidates) {
    for (const connectHost of info.hosts) {
      try {
        const socket = await authenticateSocket({
          connectHost,
          roomId: input.roomId,
          protocolVersion,
          info,
          connectTimeoutMs: Math.max(1_000, input.connectTimeoutMs ?? 8_000),
          heartbeatSeconds: Math.max(5, input.heartbeatSeconds ?? 30),
          onEvent
        })
        return {
          connectHost,
          protocolVersion,
          authMode: info.authMode,
          ...(info.authUid ? { authUid: info.authUid } : {}),
          stop: () => closeSocket(socket)
        }
      } catch (error) {
        lastError = error
      }
    }
  }
  throw withCode(
    lastError instanceof Error ? lastError.message : "Unable to connect Bilibili danmaku WebSocket.",
    "BILIBILI_DANMAKU_CONNECT_FAILED"
  )
}

async function fetchDanmuInfoWithFallback(
  roomId: string,
  credential?: { cookieHeader: string; authUid: string }
): Promise<DanmuInfo> {
  if (credential) {
    try {
      return await fetchDanmuInfo(roomId, credential, false)
    } catch (error) {
      if (!isCredentialFallbackError(error)) throw error
      cachedWbiKeys = undefined
      cachedBuvid = undefined
    }
  }
  try {
    return await fetchDanmuInfo(roomId, undefined, false)
  } catch (error) {
    if (!isRiskError(error)) throw error
    cachedWbiKeys = undefined
    cachedBuvid = undefined
    return fetchDanmuInfo(roomId, undefined, true)
  }
}

async function fetchDanmuInfo(
  roomId: string,
  credential: { cookieHeader: string; authUid: string } | undefined,
  forceRefresh: boolean
): Promise<DanmuInfo> {
  const buvid = await getBuvid(forceRefresh)
  const keys = await getWbiKeys(forceRefresh, credential?.cookieHeader)
  const parameters = signWbiParams({
    id: roomId,
    type: "0",
    web_location: "444.8"
  }, keys.imgKey, keys.subKey)
  const url = new URL("https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo")
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://live.bilibili.com/",
      "User-Agent": USER_AGENT,
      Cookie: mergeCookies(
        credential?.cookieHeader,
        `buvid3=${buvid.buvid3}${buvid.buvid4 ? `; buvid4=${buvid.buvid4}` : ""}`
      )
    },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) {
    throw withCode(
      `Bilibili getDanmuInfo returned HTTP ${response.status}.`,
      response.status === 429 ? "BILIBILI_RATE_LIMITED" : "BILIBILI_HTTP_ERROR"
    )
  }
  const root = await response.json() as unknown
  if (!isRecord(root)) throw withCode("Bilibili getDanmuInfo returned invalid JSON.", "BILIBILI_PARSE_ERROR")
  const code = typeof root.code === "number" ? root.code : Number.NaN
  if (code !== 0) {
    const error = withCode(
      text(root.message) ?? `Bilibili getDanmuInfo returned code ${code}.`,
      code === -101 || code === 65530
        ? "BILIBILI_AUTH_EXPIRED"
        : [-352, -403, -412].includes(code)
          ? "BILIBILI_RISK_CONTROL"
          : "BILIBILI_API_ERROR"
    ) as Error & { biliCode?: number }
    error.biliCode = code
    throw error
  }
  const data = record(root.data)
  const token = text(data.token)
  if (!token) throw withCode("Bilibili getDanmuInfo response missing token.", "BILIBILI_PARSE_ERROR")
  const hosts = Array.isArray(data.host_list)
    ? data.host_list.flatMap((item) => {
        const host = text(record(item).host)
        return host ? [`wss://${host}/sub`] : []
      })
    : []
  return {
    token,
    buvid: buvid.buvid3,
    authMode: credential ? "LOGIN" : "ANONYMOUS",
    ...(credential ? { authUid: credential.authUid } : {}),
    hosts: hosts.length > 0 ? hosts : ["wss://broadcastlv.chat.bilibili.com/sub"]
  }
}

async function getBuvid(forceRefresh: boolean): Promise<{ buvid3: string; buvid4?: string }> {
  if (!forceRefresh && cachedBuvid && cachedBuvid.expiresAt > Date.now()) return cachedBuvid
  const response = await fetch("https://api.bilibili.com/x/frontend/finger/spi", {
    headers: { Accept: "application/json", Referer: "https://www.bilibili.com/", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw withCode(`Bilibili buvid returned HTTP ${response.status}.`, "BILIBILI_HTTP_ERROR")
  const root = await response.json() as unknown
  const data = record(record(root).data)
  const buvid3 = text(data.b_3)
  const buvid4 = text(data.b_4)
  if (!buvid3) throw withCode("Bilibili buvid response missing data.b_3.", "BILIBILI_PARSE_ERROR")
  cachedBuvid = { buvid3, ...(buvid4 ? { buvid4 } : {}), expiresAt: Date.now() + 43_200_000 }
  return cachedBuvid
}

async function getWbiKeys(
  forceRefresh: boolean,
  cookieHeader?: string
): Promise<{ imgKey: string; subKey: string }> {
  if (!forceRefresh && cachedWbiKeys && cachedWbiKeys.expiresAt > Date.now()) return cachedWbiKeys
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: {
      Accept: "application/json",
      Referer: "https://www.bilibili.com/",
      "User-Agent": USER_AGENT,
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw withCode(`Bilibili WBI nav returned HTTP ${response.status}.`, "BILIBILI_HTTP_ERROR")
  const root = await response.json() as unknown
  const data = record(record(root).data)
  const wbi = record(data.wbi_img)
  const imgKey = keyFromUrl(text(wbi.img_url))
  const subKey = keyFromUrl(text(wbi.sub_url))
  if (!imgKey || !subKey) throw withCode("Bilibili WBI response missing keys.", "BILIBILI_PARSE_ERROR")
  cachedWbiKeys = { imgKey, subKey, expiresAt: Date.now() + 3_600_000 }
  return cachedWbiKeys
}

export function signWbiParams(
  params: Record<string, string>,
  imgKey: string,
  subKey: string,
  timestamp = Math.floor(Date.now() / 1_000)
): Record<string, string> {
  const combined = imgKey + subKey
  const mixinKey = MIXIN_KEY_ENC_TAB.slice(0, 32).map((index) => combined[index] ?? "").join("")
  const source = { ...params, wts: String(timestamp) }
  const query = new URLSearchParams(
    Object.entries(source)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value.replace(/[!'()*]/g, "")])
  ).toString()
  return {
    ...params,
    wts: String(timestamp),
    w_rid: createHash("md5").update(query + mixinKey).digest("hex")
  }
}

async function authenticateSocket(input: {
  connectHost: string
  roomId: string
  protocolVersion: number
  info: DanmuInfo
  connectTimeoutMs: number
  heartbeatSeconds: number
  onEvent: (event: BilibiliDanmakuConnectionEvent) => void
}): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(input.connectHost, { handshakeTimeout: input.connectTimeoutMs })
    let authenticated = false
    let completed = false
    let heartbeat: NodeJS.Timeout | undefined
    const timeout = setTimeout(() => {
      if (!authenticated) {
        completed = true
        socket.close(1000, "authentication timeout")
        reject(withCode("Bilibili danmaku authentication timed out.", "BILIBILI_DANMAKU_AUTH_TIMEOUT"))
      }
    }, input.connectTimeoutMs)
    const fail = (error: unknown): void => {
      if (!completed) {
        completed = true
        clearTimeout(timeout)
        reject(error)
      } else if (authenticated) {
        input.onEvent({
          type: "error",
          receivedAt: new Date().toISOString(),
          errorType: "BILIBILI_DANMAKU_TRANSPORT_ERROR",
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
    socket.once("open", () => {
      socket.send(buildBilibiliDanmakuAuthPacket({
        roomId: input.roomId,
        uid: input.info.authUid,
        token: input.info.token,
        buvid: input.info.buvid,
        clientVersion: "1.14.3",
        protocolVersion: input.protocolVersion
      }))
    })
    socket.on("message", (raw) => {
      const receivedAt = new Date().toISOString()
      for (const packet of parseBilibiliDanmakuPackets(rawDataBuffer(raw))) {
        if (packet.operation === BILIBILI_DANMAKU_OPERATION.AUTH_REPLY) {
          if (!successfulAuthReply(packet.bodyText)) {
            fail(withCode("Bilibili danmaku authentication failed.", "BILIBILI_DANMAKU_AUTH_FAILED"))
            socket.close(1000, "authentication failed")
            return
          }
          if (!authenticated) {
            authenticated = true
            completed = true
            clearTimeout(timeout)
            heartbeat = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) socket.send(buildBilibiliDanmakuHeartbeatPacket())
            }, input.heartbeatSeconds * 1_000)
            heartbeat.unref()
            resolve(socket)
          }
          continue
        }
        if (packet.operation === BILIBILI_DANMAKU_OPERATION.HEARTBEAT_REPLY && packet.popularity !== undefined) {
          input.onEvent({ type: "heartbeat", popularity: packet.popularity, receivedAt })
          continue
        }
        if (packet.operation !== BILIBILI_DANMAKU_OPERATION.COMMAND || !packet.bodyText) continue
        const event = parseBilibiliDanmakuEvent(packet.bodyText, receivedAt)
        if (event) input.onEvent({ type: "command", event, receivedAt })
      }
    })
    socket.once("error", fail)
    socket.once("close", (code, reason) => {
      clearTimeout(timeout)
      if (heartbeat) clearInterval(heartbeat)
      if (!authenticated) {
        fail(withCode(`Bilibili danmaku socket closed before authentication (${code}).`, "BILIBILI_DANMAKU_CLOSED"))
        return
      }
      input.onEvent({
        type: "closed",
        receivedAt: new Date().toISOString(),
        code,
        reason: reason.toString("utf8")
      })
    })
  })
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1_500)
    socket.once("close", () => {
      clearTimeout(timeout)
      resolve()
    })
    socket.close(1000, "worker stopped")
  })
}

function rawDataBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return Buffer.concat(raw)
  return Buffer.from(raw)
}

function successfulAuthReply(bodyText?: string): boolean {
  if (!bodyText) return false
  try {
    const parsed = JSON.parse(bodyText) as unknown
    return isRecord(parsed) && typeof parsed.code === "number" && parsed.code === 0
  } catch {
    return false
  }
}

function protocolCandidates(requested?: number): number[] {
  if (requested !== undefined && Number.isInteger(requested) && requested >= 0 && requested <= 3) {
    return [requested]
  }
  return [3, 2, 1, 0]
}

function keyFromUrl(value?: string): string | undefined {
  return value?.match(/\/([^/]+)\.png(?:\?.*)?$/)?.[1]
}

function mergeCookies(primary?: string, secondary?: string): string {
  return [primary, secondary].filter((value) => value?.trim()).join("; ")
}

function isCredentialFallbackError(error: unknown): boolean {
  return isRiskError(error) || errorCode(error) === "BILIBILI_AUTH_EXPIRED"
}

function isRiskError(error: unknown): boolean {
  return errorCode(error) === "BILIBILI_RISK_CONTROL"
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" ? error.code : undefined
}

function withCode(message: string, code: string): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), { code, retryable: true })
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized = String(value).trim()
  return normalized || undefined
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
