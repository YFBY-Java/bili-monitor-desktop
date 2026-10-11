import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

describe("follower projection polling with real Query structural sharing", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory,
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort())
    const now = new Date("2026-10-06T00:00:00Z")
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    await page.goto(url)
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).waitFor()
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).check()
    await page.clock.runFor(181)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length)).toBe(1)
    await page.clock.runFor(1_601)
    expect(await page.locator(".follower-trend-refresh").textContent()).toBe("")
    expect(await page.locator(".follower-history-svg circle").count()).toBe(3)
  })
  afterEach(async () => { await page?.close() })

  it("keeps unchanged background reads idle but reloads explicit reads and changed projections", async () => {
    const initialLists = await page.evaluate(() => window.followerFixture.listRequests.length)
    await page.clock.runFor(2_100)
    expect(await page.evaluate(() => window.followerFixture.listRequests.length)).toBeGreaterThan(initialLists)
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    expect(await page.locator(".follower-trend-refresh").textContent()).toBe("")
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.clock.runFor(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length)).toBe(2)
    await page.clock.runFor(1_601)
    await page.evaluate(() => {
      window.followerFixture.patchUser(0, { currentFollowerCount: "101", lastSnapshotAt: "2026-10-06T00:00:00Z" })
      window.followerFixture.history["2"] = [{ capturedAt: "2026-10-06T00:00:00Z", followerCount: "101", sourceEndpoint: "history" }]
    })
    await page.clock.runFor(2_100)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length)).toBe(3)
    expect(await page.locator('.follower-history-svg circle[aria-label*="101"]').count()).toBe(1)
  })

  it("does not queue history after a failed explicit shared read and retains the existing chart", async () => {
    await page.evaluate(() => { window.followerFixture.readError = "合成列表读取失败" })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.clock.runFor(1)
    await page.getByRole("alert").filter({ hasText: "合成列表读取失败" }).waitFor()
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    expect(await page.locator(".follower-history-svg circle").count()).toBe(3)
  })
})
