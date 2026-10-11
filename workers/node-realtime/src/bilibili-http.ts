import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { promisify } from "node:util"
import { brotliDecompress, gunzip, inflate } from "node:zlib"
import { BilibiliLiveHttpConfigurationSchema, type BilibiliLiveHttpConfiguration } from "@bmd/contracts"
import { bilibiliStringDecoder } from "./bilibili-response-text"
import { parseBilibiliApiJson } from "./bilibili-api-json"

const MAX_BYTES = 8 * 1024 * 1024
const API_HOSTS = new Set(["api.bilibili.com", "api.live.bilibili.com"])
interface HttpInput {
  configuration: BilibiliLiveHttpConfiguration
  headers: Record<string, string>
  signal?: AbortSignal
  responseText?: "spring-string"
}
interface HttpResponse {
  status: number
  headers: IncomingMessage["headers"]
  body: Buffer
}

export function danmakuCancelled(): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error("Bilibili danmaku connection cancelled."),
    { code: "BILIBILI_DANMAKU_CANCELLED", retryable: false })
}

export function ensureNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw danmakuCancelled()
}

export async function getBilibiliJson(address: string | URL, input: HttpInput) {
  const configuration = BilibiliLiveHttpConfigurationSchema.parse(input.configuration)
  let url = new URL(address), headers = { ...input.headers }
  for (let redirects = 0; ; redirects++) {
    ensureNotCancelled(input.signal)
    if (url.protocol !== "https:" || !API_HOSTS.has(url.hostname) || url.username || url.password
      || (url.port && url.port !== "443") || redirects > 20) {
      throw httpError("BILIBILI_HTTP_REDIRECT_REJECTED", "Bilibili HTTP destination rejected.")
    }
    const response = await readResponse(url, { ...input, configuration, headers })
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      let next: URL
      try { next = new URL(response.headers.location, url) }
      catch { throw httpError("BILIBILI_HTTP_REDIRECT_REJECTED", "Bilibili HTTP destination rejected.") }
      if (next.origin !== url.origin) headers = Object.fromEntries(Object.entries(headers)
        .filter(([key]) => !["cookie", "authorization"].includes(key.toLowerCase())))
      url = next
      continue
    }
    // Original String consumers validate headers before HTTP status handlers.
    const decode = input.responseText === "spring-string" ? bilibiliStringDecoder(response.headers) : undefined
    let body: Buffer
    try {
      const encoding = response.headers["content-encoding"]?.trim().toLowerCase()
      body = encoding === "gzip" ? await promisify(gunzip)(response.body, { maxOutputLength: MAX_BYTES })
        : encoding === "deflate" ? await promisify(inflate)(response.body, { maxOutputLength: MAX_BYTES })
          : encoding === "br" ? await promisify(brotliDecompress)(response.body, { maxOutputLength: MAX_BYTES })
            : response.body
    } catch {
      ensureNotCancelled(input.signal)
      throw httpError("BILIBILI_PARSE_ERROR", "Bilibili HTTP response could not be decoded.")
    }
    ensureNotCancelled(input.signal)
    return { status: response.status, ok: response.status >= 200 && response.status < 300,
      json: async (): Promise<unknown> => {
        ensureNotCancelled(input.signal)
        try { return decode ? parseBilibiliApiJson(decode(body))
          : JSON.parse(body.toString("utf8").replace(/^\uFEFF/u, "")) as unknown }
        catch { throw httpError("BILIBILI_PARSE_ERROR", "Bilibili HTTP response is not valid JSON.") }
      } }
  }
}

function readResponse(url: URL, input: HttpInput): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false, connected = false
    let timer: NodeJS.Timeout | undefined, socket: Socket | undefined, response: IncomingMessage | undefined
    const chunks: Buffer[] = []
    let length = 0
    const cleanup = () => {
      clearTimeout(timer)
      socket?.removeListener("secureConnect", onConnected)
      socket?.removeListener("data", onRead)
      input.signal?.removeEventListener("abort", onAbort)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true; cleanup(); response?.destroy(); req.destroy(); reject(error)
    }
    const onAbort = () => fail(danmakuCancelled())
    const arm = (milliseconds: number, code: string) => {
      clearTimeout(timer)
      if (milliseconds > 0) timer = setTimeout(() => fail(httpError(code, "Bilibili HTTP request timed out.")), milliseconds)
    }
    const onRead = () => { if (connected && !settled) arm(input.configuration.readTimeoutMs, "BILIBILI_HTTP_READ_TIMEOUT") }
    const onConnected = () => { connected = true; onRead() }
    const req = request(url, { method: "GET", agent: false,
      headers: { "Accept-Encoding": "gzip, deflate, br", ...input.headers } }, incoming => {
      response = incoming
      if (settled) { incoming.destroy(); return }
      incoming.on("error", () => fail(httpError("BILIBILI_NETWORK_ERROR", "Bilibili HTTP request failed.")))
      incoming.on("aborted", () => fail(httpError("BILIBILI_NETWORK_ERROR", "Bilibili HTTP response interrupted.")))
      incoming.on("data", (chunk: Buffer) => {
        length += chunk.length
        if (length > MAX_BYTES) { fail(httpError("BILIBILI_HTTP_RESPONSE_TOO_LARGE", "Bilibili HTTP response exceeded the size limit.")); return }
        chunks.push(chunk)
      })
      incoming.once("end", () => {
        if (settled) return
        settled = true; cleanup()
        resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: Buffer.concat(chunks) })
      })
    })
    req.on("error", () => fail(httpError("BILIBILI_NETWORK_ERROR", "Bilibili HTTP request failed.")))
    req.once("socket", assigned => {
      socket = assigned
      if (settled) return
      assigned.once("secureConnect", onConnected)
      assigned.on("data", onRead)
    })
    input.signal?.addEventListener("abort", onAbort, { once: true })
    if (input.signal?.aborted) { onAbort(); return }
    arm(input.configuration.connectTimeoutMs, "BILIBILI_HTTP_CONNECT_TIMEOUT")
    req.end()
  })
}

function httpError(code: string, message: string) {
  return Object.assign(new Error(message), { code, retryable: true })
}
