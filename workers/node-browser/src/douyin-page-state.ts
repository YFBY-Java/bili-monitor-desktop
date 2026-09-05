import type { Cookie } from "playwright"

export type DouyinObservedStatus =
  | "STARTING"
  | "WAITING"
  | "SCANNED"
  | "VALIDATING"
  | "SUCCESS"
  | "EXPIRED"
  | "USER_ACTION_REQUIRED"

const CHALLENGES = [/安全验证/u, /完成.{0,8}验证/u, /captcha/i, /verify you are human/i]
const EXPIRED = [/二维码.{0,8}(过期|失效)/u, /重新扫码/u, /expired/i]
const SCANNED = [/已扫码/u, /扫码成功/u, /请在手机.{0,8}确认/u, /scanned/i]
const VALIDATING = [/正在验证/u, /登录中/u, /validating/i]
const AUTH_COOKIE_NAMES = new Set(["sessionid", "sessionid_ss", "sid_guard"])

export interface StorageEntry {
  name: string
  value: string
}

export interface DouyinStorageOrigin extends Record<string, unknown> {
  origin: string
  localStorage: StorageEntry[]
  sessionStorage?: StorageEntry[]
  indexedDb: unknown[]
}

export function classifyDouyinPageState(input: {
  title?: string
  text?: string
  authenticated?: boolean
  qrVisible?: boolean
} = {}): DouyinObservedStatus {
  const observable = `${input.title ?? ""}\n${input.text ?? ""}`
  if (CHALLENGES.some((pattern) => pattern.test(observable))) return "USER_ACTION_REQUIRED"
  if (input.authenticated) return "SUCCESS"
  if (EXPIRED.some((pattern) => pattern.test(observable))) return "EXPIRED"
  if (SCANNED.some((pattern) => pattern.test(observable))) return "SCANNED"
  if (VALIDATING.some((pattern) => pattern.test(observable))) return "VALIDATING"
  return input.qrVisible ? "WAITING" : "STARTING"
}

export function hasDouyinAuthenticatedCookies(
  cookies: Array<Pick<Cookie, "name" | "value">>
): boolean {
  return cookies.some((cookie) => AUTH_COOKIE_NAMES.has(cookie.name.toLowerCase()) && cookie.value.length > 0)
}

export function buildCookieHeadersByOrigin(
  cookies: Array<Pick<Cookie, "name" | "value" | "domain" | "path" | "secure">>,
  origins: string[]
): Record<string, string> {
  return Object.fromEntries(origins.map((origin) => {
    const url = new URL(origin)
    const header = cookies.filter((cookie) => {
      const domain = cookie.domain.replace(/^\./u, "").toLowerCase()
      const hostname = url.hostname.toLowerCase()
      const domainMatches = hostname === domain || hostname.endsWith(`.${domain}`)
      const pathMatches = (url.pathname || "/").startsWith(cookie.path || "/")
      return domainMatches && pathMatches && (!cookie.secure || url.protocol === "https:")
    }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
    return [origin, header]
  }))
}

export function mergeSessionStorageByOrigin(
  storageOrigins: Array<{ origin: string; localStorage?: StorageEntry[] } & Record<string, unknown>>,
  sessionOrigins: Array<{ origin: string; sessionStorage: StorageEntry[] }>
): DouyinStorageOrigin[] {
  const sessions = new Map<string, Map<string, StorageEntry>>()
  for (const item of sessionOrigins) {
    if (!item.origin || item.origin === "null") continue
    const entries = sessions.get(item.origin) ?? new Map<string, StorageEntry>()
    for (const entry of item.sessionStorage) entries.set(entry.name, entry)
    sessions.set(item.origin, entries)
  }
  const origins = storageOrigins.map((item) => ({
    ...item,
    localStorage: item.localStorage ?? [],
    sessionStorage: [...(sessions.get(item.origin)?.values() ?? [])],
    indexedDb: Array.isArray(item.indexedDB) ? item.indexedDB : Array.isArray(item.indexedDb) ? item.indexedDb : []
  }))
  const known = new Set(origins.map((item) => item.origin))
  for (const [origin, entries] of sessions) {
    if (!known.has(origin)) origins.push({
      origin,
      localStorage: [],
      sessionStorage: [...entries.values()],
      indexedDb: []
    })
  }
  return origins
}

export function sessionStorageByOrigin(
  origins: Array<{ origin: string; sessionStorage?: StorageEntry[] }>
): Record<string, Record<string, string>> {
  return Object.fromEntries(origins.map((origin) => [
    origin.origin,
    Object.fromEntries((origin.sessionStorage ?? []).map((entry) => [entry.name, entry.value]))
  ]))
}
