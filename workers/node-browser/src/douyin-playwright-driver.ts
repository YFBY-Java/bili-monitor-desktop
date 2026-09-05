import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright"

import {
  buildCookieHeadersByOrigin,
  classifyDouyinPageState,
  hasDouyinAuthenticatedCookies,
  mergeSessionStorageByOrigin,
  sessionStorageByOrigin
} from "./douyin-page-state"
import type { DouyinBrowserBundle, DouyinBrowserStatus, DouyinDriver, DouyinLoginHandle } from "./douyin-session-manager"
import { DouyinWorkerError } from "./douyin-session-manager"

const QR_SELECTORS = [
  "#animate_qrcode_container img",
  '[class*="qrcode" i] canvas',
  '[class*="qr-code" i] canvas',
  '[class*="qrcode" i] img',
  '[class*="qr-code" i] img',
  'img[alt*="二维码"]',
  'img[src*="qrcode" i]',
  '[class*="scan" i] canvas'
]
const LOGIN_TRIGGERS = ['[data-e2e="login-button"]', '[class*="login-button" i]', 'button:has-text("登录")']
const QR_TABS = ['[role="tab"]:has-text("扫码")', 'button:has-text("扫码登录")', 'text=扫码登录']
const IDENTITY_MARKERS = ['[data-douyin-authenticated="true"]', '[data-e2e="user-name"]', '[data-e2e="user-nickname"]', '[data-e2e="user-avatar"]', '[data-e2e="logout"]']
const ACCOUNT_HINTS = ['[data-e2e="user-name"]', '[data-e2e="user-nickname"]', '[class*="nickname" i]']

export interface DouyinBrowserConfig {
  headless: boolean
  loginUrl: string
  validationUrl: string
  navigationTimeoutMs: number
  qrWaitMs: number
  locale: string
  timezoneId: string
  viewport: { width: number; height: number }
  cookieHeaderOrigins: string[]
}

export function douyinBrowserConfigFromEnvironment(): DouyinBrowserConfig {
  return {
    headless: process.env.BMD_DOUYIN_HEADLESS === "1",
    loginUrl: process.env.BMD_DOUYIN_LOGIN_URL ?? "https://www.douyin.com/",
    validationUrl: process.env.BMD_DOUYIN_VALIDATION_URL ?? "https://www.douyin.com/user/self?from_tab_name=main",
    navigationTimeoutMs: 30_000,
    qrWaitMs: 15_000,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1440, height: 900 },
    cookieHeaderOrigins: ["https://www.douyin.com", "https://open.douyin.com"]
  }
}

async function visibleLocator(page: Page): Promise<Locator | undefined> {
  for (const frame of page.frames()) {
    for (const selector of QR_SELECTORS) {
      const matches = frame.locator(selector)
      const count = Math.min(await matches.count().catch(() => 0), 20)
      for (let index = 0; index < count; index += 1) {
        const candidate = matches.nth(index)
        if (!await candidate.isVisible().catch(() => false)) continue
        const box = await candidate.boundingBox().catch(() => null)
        if (!box || box.width < 100 || box.height < 100) continue
        const ratio = box.width / box.height
        if (ratio >= 0.65 && ratio <= 1.35) return candidate
      }
    }
  }
  return undefined
}

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText({ timeout: 2_000 }).catch(() => "")
}

async function clickFirst(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if (await locator.isVisible({ timeout: 400 }).catch(() => false)) {
      await locator.click({ timeout: 2_000 }).catch(() => undefined)
      return
    }
  }
}

async function firstVisibleSelector(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    if (await page.locator(selector).first().isVisible({ timeout: 300 }).catch(() => false)) return selector
  }
  return undefined
}

async function accountHints(page: Page): Promise<Record<string, unknown>> {
  for (const selector of ACCOUNT_HINTS) {
    const locator = page.locator(selector).first()
    if (!await locator.isVisible({ timeout: 250 }).catch(() => false)) continue
    const nickname = (await locator.innerText().catch(() => "")).trim()
    if (nickname) return { nickname, sourceSelector: selector }
  }
  return {}
}

async function observation(page: Page, context: BrowserContext) {
  const [title, text, cookies, qr] = await Promise.all([
    page.title().catch(() => ""),
    bodyText(page),
    context.cookies().catch(() => []),
    visibleLocator(page)
  ])
  return {
    status: classifyDouyinPageState({
      title,
      text,
      authenticated: hasDouyinAuthenticatedCookies(cookies),
      qrVisible: Boolean(qr)
    }),
    title,
    text,
    cookies,
    qr,
    url: page.url()
  }
}

async function captureCurrentBundle(
  context: BrowserContext,
  page: Page,
  config: DouyinBrowserConfig,
  current: Awaited<ReturnType<typeof observation>>,
  workerSessionId: string
): Promise<DouyinBrowserBundle> {
  const storageState = await context.storageState({ indexedDB: true })
  const sessionOrigins = await Promise.all(page.frames().map(async (frame) => frame.evaluate(() => ({
    origin: location.origin,
    sessionStorage: Object.entries(sessionStorage).map(([name, value]) => ({ name, value }))
  })).catch(() => undefined)))
  const completeOrigins = mergeSessionStorageByOrigin(
    storageState.origins,
    sessionOrigins.filter((item): item is NonNullable<typeof item> => Boolean(item))
  )
  const origins = completeOrigins.map((item) => item.origin)
  const account = await accountHints(page)
  const headerOrigins = [...new Set([...config.cookieHeaderOrigins, ...origins, new URL(current.url).origin])]
  const browserContext = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform
  })).catch(() => ({ userAgent: "", platform: "" }))
  return {
    version: 1,
    authType: "DOUYIN_WEB_SESSION",
    source: "WEB_QRCODE",
    account,
    cookies: current.cookies,
    cookieHeadersByOrigin: buildCookieHeadersByOrigin(current.cookies, headerOrigins),
    origins: completeOrigins,
    storageState,
    browserContext: {
      ...browserContext,
      locale: config.locale,
      timezoneId: config.timezoneId,
      viewport: config.viewport
    },
    rawWorkerResult: { workerSessionId, page: { url: current.url, title: current.title } },
    capturedAt: new Date().toISOString(),
    lastValidatedAt: null
  }
}

export function mergeValidatedDouyinBundle(
  original: Record<string, unknown>,
  recaptured: Record<string, unknown>,
  validation: Record<string, unknown>,
  validatedAt: string
): DouyinBrowserBundle {
  const originalRaw = isRecord(original.rawWorkerResult) ? original.rawWorkerResult : {}
  const recapturedRaw = isRecord(recaptured.rawWorkerResult) ? recaptured.rawWorkerResult : {}
  return {
    ...original,
    ...recaptured,
    authType: "DOUYIN_WEB_SESSION",
    source: original.source ?? recaptured.source,
    capturedAt: original.capturedAt ?? recaptured.capturedAt,
    rawWorkerResult: {
      ...originalRaw,
      ...recapturedRaw,
      validation
    },
    lastValidatedAt: validatedAt
  } as DouyinBrowserBundle
}

class PlaywrightDouyinLoginHandle implements DouyinLoginHandle {
  private closed = false

  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly config: DouyinBrowserConfig,
    private readonly workerSessionId: string
  ) {}

  async prepare(): Promise<void> {
    this.page.setDefaultTimeout(this.config.navigationTimeoutMs)
    await this.page.goto(this.config.loginUrl, { waitUntil: "domcontentloaded", timeout: this.config.navigationTimeoutMs })
    let current = await observation(this.page, this.context)
    if (current.status === "USER_ACTION_REQUIRED" || current.status === "SUCCESS") return
    if (!current.qr) {
      await clickFirst(this.page, LOGIN_TRIGGERS)
      await clickFirst(this.page, QR_TABS)
    }
    const deadline = Date.now() + this.config.qrWaitMs
    while (Date.now() < deadline) {
      current = await observation(this.page, this.context)
      if (current.qr || current.status === "USER_ACTION_REQUIRED" || current.status === "SUCCESS") return
      await this.page.waitForTimeout(250)
    }
  }

  async qr(): Promise<Buffer> {
    const current = await observation(this.page, this.context)
    if (current.status === "USER_ACTION_REQUIRED") {
      throw new DouyinWorkerError("USER_ACTION_REQUIRED", "Complete verification in the visible browser")
    }
    if (!current.qr) throw new DouyinWorkerError("QR_NOT_AVAILABLE", "Douyin QR code is not available")
    return current.qr.screenshot({ type: "png" })
  }

  async status(): Promise<DouyinBrowserStatus> {
    const current = await observation(this.page, this.context)
    const messages: Record<string, string> = {
      STARTING: "抖音登录页面正在启动",
      WAITING: "请使用抖音扫描二维码",
      SCANNED: "已扫码，请在手机端确认",
      VALIDATING: "抖音正在校验登录",
      EXPIRED: "二维码已过期",
      USER_ACTION_REQUIRED: "请在可见浏览器中完成人工验证"
    }
    if (current.status !== "SUCCESS") return {
      status: current.status,
      message: messages[current.status] ?? "等待抖音登录状态"
    }
    const bundle = await this.captureBundle(current)
    return { status: "SUCCESS", message: "抖音 Web 登录态已捕获", bundle }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.context.close()
  }

  private async captureBundle(current: Awaited<ReturnType<typeof observation>>): Promise<DouyinBrowserBundle> {
    return captureCurrentBundle(this.context, this.page, this.config, current, this.workerSessionId)
  }
}

export class PlaywrightDouyinDriver implements DouyinDriver {
  private browserPromise: Promise<Browser> | undefined

  constructor(private readonly config: DouyinBrowserConfig) {}

  async createSession(input: { workerSessionId: string }): Promise<DouyinLoginHandle> {
    const browser = await this.browser()
    const context = await browser.newContext({
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      viewport: this.config.viewport
    })
    try {
      const page = await context.newPage()
      const handle = new PlaywrightDouyinLoginHandle(context, page, this.config, input.workerSessionId)
      await handle.prepare()
      return handle
    } catch (error) {
      await context.close()
      throw error
    }
  }

  async validateBundle(bundle: Record<string, unknown>) {
    const browser = await this.browser()
    const storageState = bundle.storageState as Parameters<Browser["newContext"]>[0] extends infer O
      ? O extends { storageState?: infer S } ? S : never
      : never
    const completeOrigins = Array.isArray(bundle.origins)
      ? bundle.origins as Array<Record<string, unknown> & { origin: string }>
      : Array.isArray((bundle.storageState as { origins?: unknown })?.origins)
        ? (bundle.storageState as { origins: Array<Record<string, unknown> & { origin: string }> }).origins
        : []
    const sessionState = sessionStorageByOrigin(completeOrigins)
    const context = await browser.newContext({
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      viewport: this.config.viewport,
      ...(storageState ? { storageState } : {})
    })
    try {
      await context.addInitScript((entriesByOrigin: Record<string, Record<string, string>>) => {
        const entries = entriesByOrigin[location.origin]
        if (!entries) return
        for (const [name, value] of Object.entries(entries)) sessionStorage.setItem(name, value)
      }, sessionState)
      const page = await context.newPage()
      await page.goto(this.config.validationUrl, { waitUntil: "domcontentloaded", timeout: this.config.navigationTimeoutMs })
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined)
      const [current, identityMarker, loginMarker] = await Promise.all([
        observation(page, context),
        firstVisibleSelector(page, IDENTITY_MARKERS),
        firstVisibleSelector(page, LOGIN_TRIGGERS)
      ])
      const loggedOut = page.url().includes("passport.douyin.com") || page.url().includes("/login") || /登录后/u.test(current.text) || Boolean(loginMarker) || Boolean(current.qr)
      const valid = current.status === "SUCCESS" && Boolean(identityMarker) && !loggedOut
      const validatedAt = new Date().toISOString()
      const details = {
        status: valid ? "SUCCESS" : loggedOut ? "LOGGED_OUT" : "IDENTITY_NOT_CONFIRMED",
        url: page.url(),
        title: current.title,
        cookieCount: current.cookies.length,
        authenticatedCookiePresent: hasDouyinAuthenticatedCookies(current.cookies),
        identityMarker: identityMarker ?? null,
        loginMarker: loginMarker ?? null,
        qrVisible: Boolean(current.qr),
        validatedAt
      }
      const recaptured = await captureCurrentBundle(
        context,
        page,
        this.config,
        current,
        "fresh-context-validation"
      )
      return {
        valid,
        message: valid ? "保存的抖音浏览器登录态可复用" : "保存的抖音浏览器登录态不可复用",
        details,
        bundle: mergeValidatedDouyinBundle(bundle, recaptured, details, validatedAt)
      }
    } finally {
      await context.close()
    }
  }

  async close(): Promise<void> {
    const browser = await this.browserPromise?.catch(() => undefined)
    await browser?.close()
    this.browserPromise = undefined
  }

  private browser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: this.config.headless })
    return this.browserPromise
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
