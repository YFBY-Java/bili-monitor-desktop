import type { BilibiliLiveHttpConfiguration, BilibiliWbiKeys } from "@bmd/contracts"

import { danmakuCancelled, ensureNotCancelled, getBilibiliJson } from "./bilibili-http"
import { bilibiliApiInt, bilibiliApiText, hasBilibiliApiText, readBilibiliApiJson } from "./bilibili-api-json"

interface BuvidCookie {
  buvid3: string
  buvid4?: string
}

interface CachedMaterial<T> {
  value: T
  expiresAt: number
}

export class BilibiliAnonymousMaterialProvider {
  private wbi: CachedMaterial<BilibiliWbiKeys> | undefined
  private buvid: CachedMaterial<BuvidCookie> | undefined
  private wbiTail: Promise<void> = Promise.resolve()
  private buvidTail: Promise<void> = Promise.resolve()

  async getWbiKeys(
    forceRefresh: boolean,
    configuration: BilibiliLiveHttpConfiguration,
    cacheSeconds: number,
    signal?: AbortSignal
  ): Promise<BilibiliWbiKeys> {
    ensureNotCancelled(signal)
    if (!forceRefresh && this.wbi && this.wbi.expiresAt > Date.now()) return this.wbi.value
    const pending = this.wbiTail.then(async () => {
      ensureNotCancelled(signal)
      if (!forceRefresh && this.wbi && this.wbi.expiresAt > Date.now()) return this.wbi.value
      const response = await getBilibiliJson("https://api.bilibili.com/x/web-interface/nav", {
        configuration,
        responseText: "spring-string",
        headers: { Accept: "application/json", Referer: "https://www.bilibili.com/", "User-Agent": configuration.userAgent },
        ...(signal ? { signal } : {})
      })
      if (response.status >= 400) throw Object.assign(materialError(
        `Bilibili WBI key request failed with HTTP ${response.status}`, "BILIBILI_UNKNOWN_ERROR"),
        { endpoint: "x/web-interface/nav", statusCode: response.status })
      const root = await readBilibiliApiJson(response, "x/web-interface/nav")
      const code = bilibiliApiInt(root, "code")
      if (code !== 0 && code !== -101) throw Object.assign(materialError(
        `Bilibili nav API returned code ${code}`, "BILIBILI_UNKNOWN_ERROR"),
        { endpoint: "x/web-interface/nav", statusCode: 200, biliCode: code })
      const wbi = record(record(record(root).data).wbi_img)
      const imgKey = keyFromUrl(bilibiliApiText(wbi, "img_url")), subKey = keyFromUrl(bilibiliApiText(wbi, "sub_url"))
      if (!imgKey || !subKey || (imgKey + subKey).length <= 58) throw Object.assign(materialError(
        "Bilibili WBI response missing img_key/sub_key", "BILIBILI_PARSE_ERROR"),
        { endpoint: "x/web-interface/nav", statusCode: 200 })
      ensureNotCancelled(signal)
      const value = { imgKey, subKey }
      this.wbi = { value, expiresAt: Date.now() + Math.max(300, cacheSeconds) * 1_000 }
      return value
    })
    // The tail releases after either outcome; each waiting caller retries under the lock.
    this.wbiTail = pending.then(() => undefined, () => undefined)
    return waitForMaterial(pending, signal)
  }

  async getBuvid(configuration: BilibiliLiveHttpConfiguration, cacheSeconds: number, signal?: AbortSignal): Promise<BuvidCookie> {
    ensureNotCancelled(signal)
    if (this.buvid && this.buvid.expiresAt > Date.now()) return this.buvid.value
    const pending = this.buvidTail.then(async () => {
      ensureNotCancelled(signal)
      if (this.buvid && this.buvid.expiresAt > Date.now()) return this.buvid.value
      const response = await getBilibiliJson("https://api.bilibili.com/x/frontend/finger/spi", {
        configuration,
        responseText: "spring-string",
        headers: { Accept: "application/json", Referer: "https://www.bilibili.com/", "User-Agent": configuration.userAgent },
        ...(signal ? { signal } : {})
      })
      if (response.status >= 400) throw Object.assign(materialError(
        `Bilibili buvid request failed with HTTP ${response.status}`, "BILIBILI_UNKNOWN_ERROR"),
        { endpoint: "x/frontend/finger/spi", statusCode: response.status })
      const root = await readBilibiliApiJson(response, "x/frontend/finger/spi")
      const code = bilibiliApiInt(root, "code")
      if (code !== 0) throw Object.assign(materialError(
        `Bilibili buvid API returned code ${code}`, "BILIBILI_UNKNOWN_ERROR"),
        { endpoint: "x/frontend/finger/spi", statusCode: 200, biliCode: code })
      const data = record(record(root).data)
      const buvid3 = bilibiliApiText(data, "b_3"), buvid4 = bilibiliApiText(data, "b_4")
      if (!hasBilibiliApiText(buvid3)) throw Object.assign(materialError(
        "Bilibili buvid response missing data.b_3", "BILIBILI_PARSE_ERROR"),
        { endpoint: "x/frontend/finger/spi", statusCode: 200 })
      ensureNotCancelled(signal)
      const value = { buvid3, ...(hasBilibiliApiText(buvid4) ? { buvid4 } : {}) }
      this.buvid = { value, expiresAt: Date.now() + Math.max(300, cacheSeconds) * 1_000 }
      return value
    })
    this.buvidTail = pending.then(() => undefined, () => undefined)
    return waitForMaterial(pending, signal)
  }

  clear(): void {
    this.wbi = undefined
    this.buvid = undefined
  }
}

export const bilibiliAnonymousMaterialProvider = new BilibiliAnonymousMaterialProvider()

function waitForMaterial<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(danmakuCancelled())
    signal.addEventListener("abort", onAbort, { once: true })
    pending.then(value => { signal.removeEventListener("abort", onAbort); resolve(value) },
      error => { signal.removeEventListener("abort", onAbort); reject(error) })
    if (signal.aborted) onAbort()
  })
}

function keyFromUrl(value?: string): string | undefined {
  return value?.match(/\/([^/]+)\.png(?:\?.*)?$/)?.[1]
}

function materialError(message: string, code: string): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), { code, retryable: true })
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
