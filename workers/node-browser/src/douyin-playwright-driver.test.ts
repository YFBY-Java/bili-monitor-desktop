import { chromium } from "playwright"
import { describe, expect, it, vi } from "vitest"

import { douyinBrowserConfigFromEnvironment, PlaywrightDouyinDriver } from "./douyin-playwright-driver"

describe("PlaywrightDouyinDriver", () => {
  it("persists fresh-context rotation and browser identity, then reports a page failure while releasing contexts", async () => {
    const environment = {
      BMD_DOUYIN_HEADLESS: "1",
      BMD_DOUYIN_LOGIN_URL: "https://www.douyin.com/",
      BMD_DOUYIN_VALIDATION_URL: "https://www.douyin.com/user/self?fixture_secret=private-fixture-value",
      BMD_DOUYIN_NAVIGATION_TIMEOUT_MS: "1000",
      BMD_DOUYIN_QR_WAIT_MS: "0",
      BMD_DOUYIN_LOCALE: "en-GB",
      BMD_DOUYIN_TIMEZONE_ID: "UTC",
      BMD_DOUYIN_VIEWPORT_WIDTH: "1600",
      BMD_DOUYIN_VIEWPORT_HEIGHT: "1000",
      BMD_DOUYIN_USER_AGENT: "FixtureAgent/1",
      BMD_DOUYIN_COOKIE_HEADER_ORIGINS: "https://www.douyin.com/path, https://open.douyin.com"
    }
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
    const browser = await chromium.launch({ headless: true })
    vi.spyOn(chromium, "launch").mockResolvedValue(browser)
    const newContext = browser.newContext.bind(browser)
    let failNavigation = false
    let closedContexts = 0
    const contextOptions: Array<Parameters<typeof newContext>[0]> = []
    const cookie = {
      name: "sessionid", value: "old", domain: ".douyin.com", path: "/",
      expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const
    }
    vi.spyOn(browser, "newContext").mockImplementation(async (options) => {
      contextOptions.push(options)
      const context = await newContext(options)
      context.on("close", () => { closedContexts += 1 })
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "userAgentData", { value: {
          brands: [{ brand: "Fixture", version: "1" }, { brand: "Engine", version: "2" }],
          platform: "FixtureOS"
        } })
        Object.defineProperty(navigator, "platform", { value: "LegacyPlatform" })
      })
      await context.route("**/*", async (route) => {
        if (failNavigation) return route.abort("failed")
        await context.addCookies([{ ...cookie, value: "rotated" }])
        await route.fulfill({
          contentType: "text/html",
          body: '<title>个人主页</title><div data-e2e="user-name">Fixture Account</div><script>localStorage.setItem("local", "rotated");sessionStorage.setItem("session", "rotated")</script>'
        })
      })
      return context
    })
    const config = douyinBrowserConfigFromEnvironment()
    const driver = new PlaywrightDouyinDriver(config)
    try {
      const captured = {
        authType: "DOUYIN_WEB_SESSION",
        cookies: [cookie],
        storageState: { cookies: [cookie], origins: [] },
        origins: [{ origin: "https://www.douyin.com", localStorage: [], sessionStorage: [{ name: "session", value: "old" }] }],
        rawWorkerResult: { captured: true },
        capturedAt: "2026-08-30T01:00:00.000Z"
      }
      const result = await driver.validateBundle(captured)
      expect(result.valid).toBe(true)
      if (!result.bundle) throw new Error("Validated fixture must retain its credential bundle")
      const merged = result.bundle

      expect(merged.cookies).toEqual([{ ...cookie, value: "rotated" }])
      expect(merged.storageState).toMatchObject({ cookies: [{ name: "sessionid", value: "rotated" }] })
      expect(merged.origins).toEqual([expect.objectContaining({
        origin: "https://www.douyin.com",
        localStorage: [{ name: "local", value: "rotated" }],
        sessionStorage: [{ name: "session", value: "rotated" }]
      })])
      expect(merged.capturedAt).toBe(captured.capturedAt)
      expect(merged.lastValidatedAt).toEqual(expect.any(String))
      expect(merged.rawWorkerResult).toMatchObject({ captured: true, validation: { status: "SUCCESS" } })
      expect.soft(merged.browserContext).toMatchObject({
        userAgent: "FixtureAgent/1",
        secChUa: '"Fixture";v="1", "Engine";v="2"',
        platform: "FixtureOS"
      })
      expect.soft(config).toMatchObject({
        navigationTimeoutMs: 1000, qrWaitMs: 0, locale: "en-GB", timezoneId: "UTC",
        viewport: { width: 1600, height: 1000 }, userAgent: "FixtureAgent/1",
        cookieHeaderOrigins: ["https://www.douyin.com", "https://open.douyin.com"]
      })
      expect.soft(contextOptions[0]).toMatchObject({
        locale: "en-GB", timezoneId: "UTC", viewport: { width: 1600, height: 1000 }, userAgent: "FixtureAgent/1"
      })
      expect(closedContexts).toBe(1)

      failNavigation = true
      const failed = await driver.validateBundle(merged)
      expect(failed).toMatchObject({
        valid: false,
        details: { status: "FAILED", code: "DOUYIN_WEB_VALIDATION_FAILED", retryable: true }
      })
      expect(JSON.stringify(failed.details)).not.toContain("private-fixture-value")
      expect(closedContexts).toBe(2)

      vi.stubEnv("BMD_DOUYIN_VIEWPORT_WIDTH", "319")
      expect(() => douyinBrowserConfigFromEnvironment()).toThrow(expect.objectContaining({ code: "INVALID_BROWSER_CONFIG" }))
    } finally {
      await driver.close()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    }
  })
})
