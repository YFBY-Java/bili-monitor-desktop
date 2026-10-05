import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

// Deterministic local renderer fixture; no Bilibili calls, application startup, or user database.
describe("Subject Long64 workflow in the renderer", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing test fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/subject-long64.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage()
    await page.goto(url)
    await page.getByRole("heading", { name: "Long64工作台", exact: true }).waitFor()
  })
  afterEach(async () => { await page?.close() })

  it("refreshes exact string follower metrics through v2 while retaining numeric live coordinates", async () => {
    expect(await page.locator(".subject-kpis").textContent()).toContain("9,223,372,036,854,775,807")
    expect(await page.locator(".subject-kpis").textContent()).toContain("24h -9,223,372,036,854,775,808")
    await expect.poll(() => page.locator(".subject-line.follower").getAttribute("points")).toBe("18,202 702,18")
    expect(await page.locator(".subject-line.live").getAttribute("points")).toBe("18,18 702,202")
    await page.getByRole("button", { name: "刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "workbenchV2").length)).toBe(2)
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "trendsV2").length)).toBe(2)
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
  })

  it("rejects an overflowing UID before creation and passes the largest positive Long UID intact", async () => {
    await page.getByRole("button", { name: "创建用户工作台", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "创建用户工作台" })
    await dialog.getByRole("textbox").first().fill("9223372036854775808")
    await dialog.getByRole("button", { name: "创建工作台", exact: true }).click()
    expect(await page.evaluate(() => window.subjectLong64Fixture.createRequests)).toEqual([])
    await dialog.getByRole("alert").waitFor()
    await dialog.getByRole("textbox").first().fill("9223372036854775807")
    await dialog.getByRole("button", { name: "创建工作台", exact: true }).click()
    await dialog.waitFor({ state: "detached" })
    expect(await page.evaluate(() => window.subjectLong64Fixture.createRequests.at(-1)?.mid)).toBe("9223372036854775807")
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
  })

  it("populates the binding drawer with exact UID values from the v2 follower list", async () => {
    await page.getByRole("button", { name: "绑定资源", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "绑定 B站监控资源" })
    await expect.poll(() => dialog.getByRole("combobox").first().textContent()).toContain("Long64用户 · UID 9223372036854775807")
    expect(await page.evaluate(() => window.subjectLong64Fixture.calls)).toContain("followersV2.list")
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
  })
})
