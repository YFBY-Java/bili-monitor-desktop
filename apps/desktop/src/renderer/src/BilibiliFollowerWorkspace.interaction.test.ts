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

  it("shows original aggregate metrics and compact user tiles with one keyboard-operable detail", async () => {
    const summary = page.getByRole("region", { name: "粉丝采集汇总" })
    expect(await summary.count()).toBe(1)
    expect(await summary.textContent()).toContain("总粉丝500")
    expect(await summary.textContent()).toContain("最近净增0")
    expect(await summary.locator("strong").nth(1).getAttribute("class")).toBe("")
    expect(await summary.textContent()).toContain("采集间隔1 小时")
    expect(await page.getByRole("region", { name: /监控详情/ }).count()).toBe(0)
    const first = page.getByRole("button", { name: "展开测试用户1的详情" })
    expect(await page.locator(".follower-tile-change strong").first().getAttribute("class")).toBe("")
    await first.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("region", { name: "测试用户1监控详情" }).waitFor()
    await page.getByRole("button", { name: "展开测试用户2的详情" }).click()
    expect(await page.getByRole("region", { name: /监控详情/ }).count()).toBe(1)
    expect(await page.getByRole("region", { name: "测试用户1监控详情" }).count()).toBe(0)
    await page.getByRole("button", { name: "收起测试用户2的详情" }).focus()
    await page.keyboard.press("Space")
    expect(await page.getByRole("region", { name: /监控详情/ }).count()).toBe(0)
  })

  it("preserves unsaved per-user settings through collapse, switches and failed saves", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").click()
    await page.getByRole("spinbutton").fill("600")
    await page.getByRole("button", { name: "展开测试用户2的详情" }).click()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").click()
    expect(await page.getByRole("spinbutton").inputValue()).toBe("600")
    await page.evaluate(() => { window.followerFixture.actionError = "保存失败" })
    await page.getByRole("button", { name: "保存间隔" }).click()
    await page.getByRole("alert").filter({ hasText: "保存失败" }).waitFor()
    expect(await page.getByRole("spinbutton").inputValue()).toBe("600")
    await page.getByRole("button", { name: "收起测试用户1的详情" }).click()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").click()
    expect(await page.getByRole("spinbutton").inputValue()).toBe("600")
  })

  it("ticks collection rhythm locally, marks only a real refresh in flight, and respects pause", async () => {
    await page.close()
    page = await browser.newPage()
    // Pin Date, not timers: Query notifications and the real one-second clock keep running.
    await page.clock.setFixedTime(new Date("2026-09-13T04:00:00Z"))
    await page.goto(url)
    await page.getByText("测试用户1", { exact: true }).waitFor()
    await page.evaluate(() => window.followerFixture.patchUser(0, {
      lastSnapshotAt: "2026-09-13T04:00:00Z", nextCollectAt: "2026-09-13T04:01:00Z", intervalSeconds: 60
    }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    const tile = page.locator(".follower-card").first()
    await expect.poll(() => tile.locator(".follower-collect-brief").textContent()).toBe("1 分后")
    await page.clock.setFixedTime(new Date("2026-09-13T04:00:30Z"))
    await expect.poll(() => tile.locator(".follower-collect-brief").textContent(), { timeout: 2500 }).toBe("30 秒后")
    expect(Number(await tile.getByRole("progressbar").getAttribute("aria-valuenow"))).toBe(50)
    expect(await page.evaluate(() => window.followerFixture.calls.filter(call => call === "refresh"))).toEqual([])
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.evaluate(() => { window.followerFixture.holdRefresh = true })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    expect(await tile.locator(".follower-collect-brief").textContent()).toBe("采集中")
    await page.evaluate(() => window.followerFixture.releaseRefresh())
    await expect.poll(() => page.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
    await page.getByRole("button", { name: "暂停监控", exact: true }).click()
    await expect.poll(() => tile.locator(".follower-collect-brief").textContent()).toBe("已暂停")
    expect(await tile.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0")
  }, 20_000)

  it("keeps a selected user on cancelled deletion and clears its open detail after confirmation", async () => {
    await page.locator('.trend-selector input').first().check()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").click()
    page.once("dialog", dialog => { void dialog.dismiss() })
    await page.getByRole("button", { name: "删除监控与全部历史快照" }).click()
    expect(await page.getByRole("region", { name: "测试用户1监控详情" }).count()).toBe(1)
    expect(await page.locator('.trend-selector input').first().isChecked()).toBe(true)
    page.once("dialog", dialog => { void dialog.accept() })
    await page.getByRole("button", { name: "删除监控与全部历史快照" }).click()
    await page.getByRole("region", { name: "测试用户1监控详情" }).waitFor({ state: "detached" })
    expect(await page.locator(".follower-card").count()).toBe(4)
    expect(await page.evaluate(() => window.followerFixture.calls.filter(call => call === "delete").length)).toBe(1)
  })

  it("ends the collecting indicator when refresh ends even if projection reload is still pending", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.evaluate(() => { window.followerFixture.holdListAfterRefresh = true })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.listWaiting)).toBe(true)
    expect(await page.locator(".follower-collect-brief").first().textContent()).not.toBe("采集中")
    expect(await page.getByRole("button", { name: "立即刷新", exact: true }).isDisabled()).toBe(true)
    await page.evaluate(() => window.followerFixture.releaseList())
    await expect.poll(() => page.getByRole("button", { name: "立即刷新", exact: true }).isEnabled()).toBe(true)
  })

  it("keeps the monitor strip scrollable and detail readable in light, dark and narrow layouts", async () => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    const strip = page.locator(".follower-user-strip")
    expect(await strip.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.locator(".follower-card").first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 247, 250)")
    expect((await page.getByRole("button", { name: "立即刷新", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(40)
    await page.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/m06-monitor-light.png", import.meta.url)), animations: "disabled" })
    await page.evaluate(() => document.querySelector("main")!.classList.remove("theme-light"))
    expect(await page.locator(".follower-card").first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(10, 22, 38)")
    await page.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/m06-monitor-dark.png", import.meta.url)), animations: "disabled" })
    await page.setViewportSize({ width: 760, height: 1000 })
    expect(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.getByRole("button", { name: "展开测试用户5的详情" }).click()
    expect(await page.getByRole("region", { name: "测试用户5监控详情" }).count()).toBe(1)
  })

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
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").first().click()
    await page.getByRole("button", { name: "删除监控与全部历史快照" }).first().click()
    await page.getByText("测试用户1", { exact: true }).waitFor({ state: "detached" })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await expect.poll(() => page.locator(".follower-trend-card").count()).toBe(3)
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it("shows scheduled collection updates and preserves data if the next read fails", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.evaluate(() => window.followerFixture.updateFirst(34567))
    await page.getByText("34,567", { exact: true }).waitFor({ timeout: 6000 })
    await page.evaluate(() => { window.followerFixture.readError = "暂时无法读取本地数据" })
    await page.getByText("暂时无法读取本地数据", { exact: false }).waitFor({ timeout: 6000 })
    expect(await page.getByText("34,567", { exact: true }).count()).toBeGreaterThan(0)
  }, 15_000)

  it("surfaces failed operations without unhandled rejections and can retry", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
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
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    expect(await page.getByRole("region", { name: "测试用户1监控详情" }).textContent()).toContain("关注 12")
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
