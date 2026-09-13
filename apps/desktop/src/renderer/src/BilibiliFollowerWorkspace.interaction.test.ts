import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

// Browser integration with deterministic IPC responses; never calls Bilibili or opens the user's DB.
describe("follower workflow in the renderer", () => {
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
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage()
    await page.goto(url)
    await page.getByText("测试用户1", { exact: true }).waitFor()
  })
  afterEach(async () => { await page?.close() })

  it("shows and selects monitors beyond the former 500-user cutoff", async () => {
    await page.evaluate(() => window.followerFixture.expandList())
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.locator(".follower-card").count(), { timeout: 8000 }).toBe(505)
    const last = page.locator(".follower-card").filter({ hasText: "测试用户505" })
    await last.locator('.trend-selector input').check()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".follower-trend-card").filter({ hasText: "测试用户505" }).waitFor()
    expect(await page.evaluate(() => window.followerFixture.listRequests.every(input => input.limit === undefined))).toBe(true)
  }, 20_000)

  it("starts with no selected users and allows deselecting the last trend", async () => {
    const boxes = page.locator('.trend-selector input')
    expect(await boxes.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLInputElement).checked).length)).toBe(0)
    await boxes.first().check()
    await boxes.first().uncheck()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByText("请选择监控用户", { exact: true }).waitFor()
    expect(await page.locator(".follower-trend-card").count()).toBe(0)
  })

  it("enforces the four-user comparison limit and removes a deleted selected user", async () => {
    const boxes = page.locator('.trend-selector input')
    for (let index = 0; index < 4; index++) await boxes.nth(index).check()
    expect(await boxes.nth(4).isDisabled()).toBe(true)
    page.on("dialog", (dialog) => { void dialog.accept() })
    await page.locator(".follower-settings summary").first().click()
    await page.getByRole("button", { name: "删除监控与全部历史快照" }).first().click()
    await page.getByText("测试用户1", { exact: true }).waitFor({ state: "detached" })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await expect.poll(() => page.locator(".follower-trend-card").count()).toBe(3)
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it("shows scheduled collection updates and preserves data if the next read fails", async () => {
    await page.evaluate(() => window.followerFixture.updateFirst(34567))
    await page.getByText("34,567", { exact: true }).waitFor({ timeout: 6000 })
    await page.evaluate(() => { window.followerFixture.readError = "暂时无法读取本地数据" })
    await page.getByText("暂时无法读取本地数据", { exact: false }).waitFor({ timeout: 6000 })
    expect(await page.getByText("34,567", { exact: true }).count()).toBeGreaterThan(0)
  }, 15_000)

  it("surfaces failed operations without unhandled rejections and can retry", async () => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.evaluate(() => { window.followerFixture.actionError = "B站触发风控，请稍后重试" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).first().click()
    await page.getByRole("alert").filter({ hasText: "B站触发风控" }).waitFor()
    expect(errors).toEqual([])
    await page.evaluate(() => { window.followerFixture.actionError = "" })
    await page.getByRole("button", { name: "暂停监控", exact: true }).first().click()
    await page.getByRole("button", { name: "恢复监控", exact: true }).waitFor()
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it("validates intervals and keeps edited drafts when background data refreshes", async () => {
    await page.locator(".follower-settings summary").first().click()
    const input = page.getByRole("spinbutton").first()
    await page.evaluate(() => window.followerFixture.updateFirst(100, 120))
    await expect.poll(() => input.inputValue(), { timeout: 6000 }).toBe("120")
    await input.fill("0")
    expect(await page.getByRole("button", { name: "保存间隔" }).first().isDisabled()).toBe(true)
    await input.fill("600")
    await page.evaluate(() => window.followerFixture.updateFirst(45678, 300))
    await page.getByText("45,678", { exact: true }).waitFor({ timeout: 6000 })
    expect(await input.inputValue()).toBe("600")
    await page.getByRole("button", { name: "保存间隔" }).first().click()
    await page.getByText("当前：每 10 分钟", { exact: true }).waitFor()
  }, 15_000)

  it("plots actual timestamps and a declining range as a loss", async () => {
    await page.locator('.trend-selector input').first().check()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".follower-trend-card circle").first().waitFor()
    const x = await page.locator(".follower-trend-card circle").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("cx"))))
    expect((x[1]! - x[0]!) / (x[2]! - x[0]!)).toBeCloseTo(0.1, 2)
    await page.getByText("区间净变化 -20", { exact: true }).waitFor()
    expect(await page.locator(".follower-trend-card circle title").first().textContent()).toContain("120")
  })
})
