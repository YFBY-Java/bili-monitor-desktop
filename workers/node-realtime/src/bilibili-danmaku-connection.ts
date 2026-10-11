import { createHash } from "node:crypto"
import { BilibiliLiveHttpConfigurationSchema, type BilibiliLiveHttpConfiguration,
  BilibiliLiveDanmakuConnectionConfigurationSchema, type BilibiliLiveDanmakuConnectionConfiguration,
  BilibiliLiveDanmakuCacheConfigurationSchema, type BilibiliLiveDanmakuCacheConfiguration,
  type BilibiliDanmakuCredential,
  type BilibiliDanmakuWorkerLifecycleEvent, type BilibiliDanmakuWorkerStartResult } from "@bmd/contracts"

import WebSocket, { type RawData } from "ws"
import { getBilibiliJson, ensureNotCancelled, danmakuCancelled } from "./bilibili-http"
import { bilibiliApiInt, bilibiliApiText, hasBilibiliApiText, readBilibiliApiJson } from "./bilibili-api-json"
import { bilibiliAnonymousMaterialProvider, type BilibiliAnonymousMaterialProvider } from "./bilibili-anonymous-material-provider"

import { parseBilibiliDanmakuEvents, type ParsedBilibiliDanmakuEvent } from "./bilibili-danmaku-event"
import {
  BILIBILI_DANMAKU_OPERATION,
  buildBilibiliDanmakuAuthPacket,
  buildBilibiliDanmakuHeartbeatPacket,
  parseBilibiliDanmakuPackets,
  type ParsedBilibiliDanmakuPacket
} from "./bilibili-danmaku-packet"

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
] as const

export interface BilibiliDanmakuConnectionInput {
  roomId: string
  protocolVersion?: number
  preferredProtocolVersion?: number
  credential?: BilibiliDanmakuCredential
  connectTimeoutMs?: number
  heartbeatSeconds?: number
  connectionConfiguration?: BilibiliLiveDanmakuConnectionConfiguration
  cacheConfiguration?: BilibiliLiveDanmakuCacheConfiguration
  httpConfiguration?: BilibiliLiveHttpConfiguration
  signal?: AbortSignal
}

export type BilibiliDanmakuConnectionEvent =
  | BilibiliDanmakuWorkerLifecycleEvent
  | { type: "command"; attempt?: number; receivedAt: string; event: ParsedBilibiliDanmakuEvent }
  | { type: "heartbeat"; attempt?: number; popularity: number; receivedAt: string }
  | { type: "closed"; attempt?: number; receivedAt: string; code: number; reason: string }
  | { type: "error"; attempt?: number; receivedAt: string; errorType: string; message: string }

export type RunningBilibiliDanmakuConnection = BilibiliDanmakuWorkerStartResult & {
  stop: () => Promise<void>
}

interface DanmuInfo {
  token: string
  buvid: string
  authMode: "ANONYMOUS" | "LOGIN"
  authUid?: string
  hosts: string[]
}

export interface BilibiliDanmakuConnectionDependencies {
  materials?: BilibiliAnonymousMaterialProvider
  credentialProvider?: () => Promise<BilibiliDanmakuCredential | undefined>
}

export async function startBilibiliDanmakuConnection(
  input: BilibiliDanmakuConnectionInput,
  onEvent: (event: BilibiliDanmakuConnectionEvent) => void,
  dependencies: BilibiliDanmakuConnectionDependencies = {}
): Promise<RunningBilibiliDanmakuConnection> {
  ensureNotCancelled(input.signal)
  const configuration = BilibiliLiveHttpConfigurationSchema.parse(input.httpConfiguration ?? {})
  const connectionConfiguration = BilibiliLiveDanmakuConnectionConfigurationSchema.parse(input.connectionConfiguration ?? {})
  const cacheConfiguration = BilibiliLiveDanmakuCacheConfigurationSchema.parse(input.cacheConfiguration ?? {})
  const materials = dependencies.materials ?? bilibiliAnonymousMaterialProvider
  const credentialProvider = dependencies.credentialProvider ?? (async () => input.credential)
  const candidates = protocolCandidates(input.protocolVersion, input.preferredProtocolVersion)
  let lastError: unknown
  let attempt = 0
  for (const protocolVersion of candidates) {
      attempt++
      ensureNotCancelled(input.signal)
      try {
        const info = await fetchDanmuInfoWithFallback(input.roomId, configuration, connectionConfiguration,
          cacheConfiguration, materials, credentialProvider, input.signal)
        const connectHost = info.hosts[0] ?? "wss://broadcastlv.chat.bilibili.com/sub"
        ensureNotCancelled(input.signal)
        onEvent({ type: "connecting", attempt, receivedAt: new Date().toISOString(), connectHost,
          protocolVersion, authMode: info.authMode, ...(info.authUid ? { authUid: info.authUid } : {}) })
        const socket = await authenticateSocket({
          attempt,
          connectHost,
          roomId: input.roomId,
          protocolVersion,
          info,
          connectTimeoutMs: Math.max(1_000, input.connectionConfiguration?.connectTimeoutMs ?? input.connectTimeoutMs ?? connectionConfiguration.connectTimeoutMs),
          heartbeatSeconds: Math.max(5, input.connectionConfiguration?.heartbeatSeconds ?? input.heartbeatSeconds ?? connectionConfiguration.heartbeatSeconds),
          clientVersion: connectionConfiguration.clientVersion,
          signal: input.signal,
          onEvent
        })
        return {
          status: "AUTHENTICATING",
          attempt,
          connectHost,
          protocolVersion,
          authMode: info.authMode,
          ...(info.authUid ? { authUid: info.authUid } : {}),
          stop: () => closeSocket(socket)
        }
      } catch (error) {
        ensureNotCancelled(input.signal)
        lastError = error
        onEvent({ type: "attempt-failed", attempt, receivedAt: new Date().toISOString(),
          code: errorCode(error) ?? "BILIBILI_DANMAKU_CONNECT_FAILED",
          message: error instanceof Error ? error.message : String(error) })
      }
  }
  throw withCode(
    lastError instanceof Error ? lastError.message : "Unable to connect Bilibili danmaku WebSocket.",
    "BILIBILI_DANMAKU_CONNECT_FAILED"
  )
}

async function fetchDanmuInfoWithFallback(
  roomId: string,
  configuration: BilibiliLiveHttpConfiguration,
  connectionConfiguration: BilibiliLiveDanmakuConnectionConfiguration,
  cacheConfiguration: BilibiliLiveDanmakuCacheConfiguration,
  materials: BilibiliAnonymousMaterialProvider,
  credentialProvider: () => Promise<BilibiliDanmakuCredential | undefined>,
  signal?: AbortSignal
): Promise<DanmuInfo> {
  const fetchInner = async (forceRefreshWbi: boolean): Promise<DanmuInfo> => {
    ensureNotCancelled(signal)
    const credential = connectionConfiguration.useLoginCredential ? await credentialProvider() : undefined
    ensureNotCancelled(signal)
    if (credential) {
      try {
        return await fetchDanmuInfo(roomId, credential, forceRefreshWbi, configuration,
          connectionConfiguration.webLocation, cacheConfiguration, materials, signal)
      } catch (error) {
        ensureNotCancelled(signal)
        if (!isCredentialFallbackError(error)) throw error
        if (isRiskError(error)) materials.clear()
        return fetchDanmuInfo(roomId, undefined, true, configuration,
          connectionConfiguration.webLocation, cacheConfiguration, materials, signal)
      }
    }
    return fetchDanmuInfo(roomId, undefined, forceRefreshWbi, configuration,
      connectionConfiguration.webLocation, cacheConfiguration, materials, signal)
  }
  try {
    return await fetchInner(false)
  } catch (error) {
    ensureNotCancelled(signal)
    if (!isRiskError(error)) throw error
    materials.clear()
    return fetchInner(true)
  }
}

async function fetchDanmuInfo(
  roomId: string,
  credential: BilibiliDanmakuCredential | undefined,
  forceRefresh: boolean,
  configuration: BilibiliLiveHttpConfiguration,
  webLocation: string,
  cacheConfiguration: BilibiliLiveDanmakuCacheConfiguration,
  materials: BilibiliAnonymousMaterialProvider,
  signal?: AbortSignal
): Promise<DanmuInfo> {
  ensureNotCancelled(signal)
  const buvid = await materials.getBuvid(configuration, cacheConfiguration.buvidCacheSeconds, signal)
  const keys = await materials.getWbiKeys(forceRefresh, configuration, cacheConfiguration.wbiCacheSeconds, signal)
  const parameters = signWbiParams({
    id: roomId,
    type: "0",
    web_location: webLocation
  }, keys.imgKey, keys.subKey)
  const url = new URL("https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo")
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  const response = await getBilibiliJson(url, {
    configuration,
    responseText: "spring-string",
    headers: {
      Accept: "application/json",
      Referer: configuration.referer,
      "User-Agent": configuration.userAgent,
      Cookie: mergeCookies(
        credential?.cookieHeader,
        `buvid3=${buvid.buvid3}${buvid.buvid4 ? `; buvid4=${buvid.buvid4}` : ""}`
      )
    },
    ...(signal ? { signal } : {})
  })
  if (response.status >= 400) {
    throw Object.assign(withCode(
      `Bilibili getDanmuInfo failed with HTTP ${response.status}`,
      response.status === 429 ? "BILIBILI_RATE_LIMITED" : "BILIBILI_UNKNOWN_ERROR"
    ), { endpoint: "xlive/web-room/v1/index/getDanmuInfo", statusCode: response.status })
  }
  const root = await readBilibiliApiJson(response, "xlive/web-room/v1/index/getDanmuInfo")
  const code = bilibiliApiInt(root, "code")
  if (code !== 0) {
    const error = withCode(
      bilibiliApiText(root, "message", `Bilibili getDanmuInfo returned code ${code}`)!,
      code === -101 || code === 65530
        ? "BILIBILI_AUTH_EXPIRED"
        : [-352, -403, -412].includes(code)
          ? "BILIBILI_RISK_CONTROL"
          : "BILIBILI_UNKNOWN_ERROR"
    ) as Error & { biliCode?: number }
    Object.assign(error, { biliCode: code, retryable: code !== -101 && code !== 65530,
      endpoint: "xlive/web-room/v1/index/getDanmuInfo", statusCode: 200 })
    throw error
  }
  const data = record(record(root).data)
  const token = bilibiliApiText(data, "token")
  if (!hasBilibiliApiText(token)) throw Object.assign(withCode(
    "Bilibili getDanmuInfo response missing token", "BILIBILI_PARSE_ERROR"),
    { endpoint: "xlive/web-room/v1/index/getDanmuInfo", statusCode: 200 })
  // Jackson's JsonNode iterator also visits object values, not only array members.
  const hostNodes = data.host_list && typeof data.host_list === "object" ? Object.values(data.host_list) : []
  const hosts = hostNodes.flatMap((item) => {
        const host = bilibiliApiText(item, "host")
        return hasBilibiliApiText(host) ? [`wss://${host}/sub`] : []
      })
  return {
    token,
    buvid: buvid.buvid3,
    authMode: credential ? "LOGIN" : "ANONYMOUS",
    ...(credential ? { authUid: credential.authUid } : {}),
    hosts: hosts.length > 0 ? hosts : ["wss://broadcastlv.chat.bilibili.com/sub"]
  }
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
  attempt: number
  connectHost: string
  roomId: string
  protocolVersion: number
  info: DanmuInfo
  connectTimeoutMs: number
  heartbeatSeconds: number
  clientVersion: string
  signal: AbortSignal | undefined
  onEvent: (event: BilibiliDanmakuConnectionEvent) => void
}): Promise<WebSocket> {
  ensureNotCancelled(input.signal)
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(input.connectHost, { handshakeTimeout: input.connectTimeoutMs })
    let authenticated = false
    let started = false
    let ended = false
    let heartbeat: NodeJS.Timeout | undefined
    const timeout = setTimeout(() => {
      fail(withCode("Bilibili danmaku handshake timed out.", "BILIBILI_DANMAKU_CONNECT_TIMEOUT"))
    }, input.connectTimeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      if (heartbeat) clearTimeout(heartbeat)
      input.signal?.removeEventListener("abort", onAbort)
    }
    const fail = (error: unknown): void => {
      if (ended) return
      ended = true
      cleanup()
      if (!started) {
        reject(error)
      } else if (!input.signal?.aborted) {
        input.onEvent({
          type: "error",
          attempt: input.attempt,
          receivedAt: new Date().toISOString(),
          errorType: errorCode(error) ?? "BILIBILI_DANMAKU_TRANSPORT_ERROR",
          message: error instanceof Error ? error.message : String(error)
        })
      }
      socket.terminate()
    }
    const onAbort = () => { fail(danmakuCancelled()) }
    input.signal?.addEventListener("abort", onAbort, { once: true })
    socket.once("open", () => {
      if (ended || input.signal?.aborted) return
      try {
        socket.send(buildBilibiliDanmakuAuthPacket({
        roomId: input.roomId,
        uid: input.info.authUid,
        token: input.info.token,
        buvid: input.info.buvid,
        clientVersion: input.clientVersion,
        protocolVersion: input.protocolVersion
        }), error => { if (error) fail(error) })
        if (ended) return
        started = true
        clearTimeout(timeout)
        const periodMs = input.heartbeatSeconds * 1_000
        let nextHeartbeatAt = performance.now() + periodMs
        const scheduleHeartbeat = (): void => {
          heartbeat = setTimeout(sendHeartbeat, Math.min(2_147_483_647, Math.max(0, nextHeartbeatAt - performance.now())))
          heartbeat.unref()
        }
        const sendHeartbeat = (): void => {
          if (ended || input.signal?.aborted) return
          if (performance.now() < nextHeartbeatAt) { scheduleHeartbeat(); return }
          try {
            if (socket.readyState !== WebSocket.OPEN) throw new Error("Bilibili danmaku socket is not open.")
            socket.send(buildBilibiliDanmakuHeartbeatPacket(), error => {
              if (error) fail(error)
              else if (!ended && !input.signal?.aborted) input.onEvent({ type: "heartbeat-sent", attempt: input.attempt, receivedAt: new Date().toISOString() })
            })
          } catch (error) { fail(error) }
          if (!ended && !input.signal?.aborted) {
            nextHeartbeatAt += periodMs
            scheduleHeartbeat()
          }
        }
        scheduleHeartbeat()
        resolve(socket)
      } catch (error) { fail(error) }
    })
    socket.on("message", (raw, isBinary) => {
      if (input.signal?.aborted || ended) return
      const receivedAt = new Date().toISOString()
      const bytes = rawDataBuffer(raw)
      const packets: ParsedBilibiliDanmakuPacket[] = isBinary === false
        ? [{ operation: BILIBILI_DANMAKU_OPERATION.COMMAND, protocolVersion: 0, sequence: 0,
          bodyText: bytes.toString("utf8") }]
        : parseBilibiliDanmakuPackets(bytes)
      for (const packet of packets) {
        if (packet.operation === BILIBILI_DANMAKU_OPERATION.AUTH_REPLY) {
          if (!successfulAuthReply(packet.bodyText)) {
            fail(withCode("Bilibili danmaku authentication failed.", "BILIBILI_DANMAKU_AUTH_FAILED"))
            return
          }
          if (!authenticated) {
            authenticated = true
            input.onEvent({ type: "connected", attempt: input.attempt, receivedAt })
          }
          continue
        }
        if (packet.operation === BILIBILI_DANMAKU_OPERATION.HEARTBEAT_REPLY && packet.popularity !== undefined) {
          input.onEvent({ type: "heartbeat", attempt: input.attempt, popularity: packet.popularity, receivedAt })
          continue
        }
        if (packet.operation !== BILIBILI_DANMAKU_OPERATION.COMMAND || !packet.bodyText) continue
        for (const event of parseBilibiliDanmakuEvents(packet.bodyText, receivedAt)) {
          input.onEvent({ type: "command", attempt: input.attempt, event, receivedAt })
        }
      }
    })
    socket.once("error", fail)
    socket.once("close", (code, reason) => {
      if (ended) return
      if (!started) {
        fail(withCode(`Bilibili danmaku socket closed before AUTH (${code}).`, "BILIBILI_DANMAKU_CLOSED"))
        return
      }
      ended = true
      cleanup()
      if (input.signal?.aborted) return
      input.onEvent({
        type: "closed",
        attempt: input.attempt,
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
    const timeout = setTimeout(() => { socket.terminate(); resolve() }, 1_500)
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
    const tokens = new WeakMap<object, string | undefined>()
    const parsed = JSON.parse(bodyText, function (this: object, key: string, value: unknown, context?: { source?: string }) {
      if (key === "code") tokens.set(this, context?.source)
      return value
    }) as unknown
    return isRecord(parsed) && parsed.code === 0 && /^-?0$/u.test(tokens.get(parsed) ?? "")
  } catch {
    return false
  }
}

function protocolCandidates(requested?: number, preferred = 3): number[] {
  if (requested !== undefined && Number.isInteger(requested) && requested >= 0 && requested <= 3) {
    return [requested]
  }
  return Number.isInteger(preferred) && preferred >= 0 && preferred <= 3
    ? [preferred, ...[3, 2, 1, 0].filter(version => version !== preferred)]
    : [3, 2, 1, 0]
}

function mergeCookies(primary?: string, secondary?: string): string {
  return [primary, secondary].filter((value) => value?.trim()).join("; ")
}

function isCredentialFallbackError(error: unknown): boolean {
  return isRiskError(error) || errorCode(error) === "BILIBILI_AUTH_EXPIRED"
    || [65530, -403, -412].includes(errorBiliCode(error) ?? Number.NaN)
}

function isRiskError(error: unknown): boolean {
  return errorCode(error) === "BILIBILI_RISK_CONTROL" || errorBiliCode(error) === -352
}

function errorBiliCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "biliCode" in error
    && typeof error.biliCode === "number" ? error.biliCode : undefined
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" ? error.code : undefined
}

function withCode(message: string, code: string): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), { code, retryable: true })
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
