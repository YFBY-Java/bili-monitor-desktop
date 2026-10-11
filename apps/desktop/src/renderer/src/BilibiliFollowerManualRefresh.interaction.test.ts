import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

// Actual React/Query/Chromium events; only the typed bridge is synthetic.
describe("original follower manual refresh interaction", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let pageErrors: string[]
  let externalRequests: string[]
  const firstId = "018f0f39-7b5e-7cc1-962d-000000000000"
  const secondId = "018f0f39-7b5e-7cc1-962d-000000000001"
  const pollOptions = { timeout: 1_500, interval: 25 }

  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory, plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing follower manual refresh fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html?refresh-flow=1`
    browser = await chromium.launch({ headless: true })
    const readyPage = await browser.newPage()
    const readyErrors: string[] = []
    const blocked: string[] = []
    readyPage.on("pageerror", error => readyErrors.push(error.message))
    await readyPage.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { blocked.push(route.request().url()); await route.abort() }
    })
    try {
      await readyPage.goto(url, { waitUntil: "commit" })
      await readyPage.getByText("测试用户1", { exact: true }).waitFor()
      expect(readyErrors).toEqual([])
      expect(blocked).toEqual([])
    } finally { await readyPage.close() }
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    pageErrors = []
    externalRequests = []
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.on("pageerror", error => pageErrors.push(error.message))
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { externalRequests.push(route.request().url()); await route.abort() }
    })
    await page.goto(url, { waitUntil: "commit" })
    await page.getByText("测试用户1", { exact: true }).waitFor()
    await openDetail("测试用户1")
  })
  afterEach(async () => {
    await page?.close()
    expect(pageErrors).toEqual([])
    expect(externalRequests).toEqual([])
  })

  function refresh() { return page.getByRole("button", { name: "立即刷新", exact: true }) }
  function success() { return page.getByRole("status").filter({ hasText: /^已刷新$/ }) }
  function input() { return page.locator(".follower-settings").getByRole("spinbutton") }
  async function openDetail(name: string): Promise<void> {
    await page.getByRole("button", { name: `展开${name}的详情`, exact: true }).click()
  }
  async function waitRefresh(index: number, phase: "pending" | "fulfilled" | "failed"): Promise<void> {
    await expect.poll(() => page.evaluate(position => window.followerFixture.refreshFlow.refreshCalls[position]?.phase, index), pollOptions).toBe(phase)
  }
  async function waitList(index: number, phase: "pending" | "fulfilled" | "failed"): Promise<void> {
    await expect.poll(() => page.evaluate(position => window.followerFixture.addFlow.listCalls[position]?.phase, index), pollOptions).toBe(phase)
  }
  async function waitSuccess(): Promise<void> {
    await expect.poll(() => success().allTextContents(), pollOptions).toEqual(["已刷新"])
  }

  it("rejects without a follow-up list/history read, preserves the draft and allows retry", async () => {
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ error: "手动采集失败" }))
    await refresh().click()
    await waitRefresh(0, "failed")
    await page.getByRole("alert").filter({ hasText: "手动采集失败" }).waitFor()
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(0)
    expect(await success().count()).toBe(0)
    expect(await input().inputValue()).toBe("600")
    expect(await refresh().isEnabled()).toBe(true)
    await refresh().click()
    await waitSuccess()
    expect(await page.evaluate(() => window.followerFixture.refreshFlow.refreshCalls.length)).toBe(2)
    expect(await input().inputValue()).toBe("600")
  })

  it("clears old action/read errors at manual start even if the new request rejects", async () => {
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ error: "旧写错误" }))
    await refresh().click()
    await page.getByRole("alert").filter({ hasText: "旧写错误" }).waitFor()
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "旧读错误" }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "旧读错误" }).waitFor()
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ hold: true }))
    await refresh().click()
    await waitRefresh(1, "pending")
    expect(await page.getByRole("alert").count()).toBe(0)
    await page.evaluate(() => window.followerFixture.refreshFlow.rejectRefresh(1, "新刷新失败"))
    await page.getByRole("alert").filter({ hasText: "新刷新失败" }).waitFor()
    expect(await page.getByRole("alert").allTextContents()).toEqual(["新刷新失败"])
  })

  it("does not label manual requests as auto-collecting or lock any same-user action", async () => {
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ hold: true }))
    await refresh().click()
    await waitRefresh(0, "pending")
    expect(await refresh().isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "删除监控与全部历史快照", exact: true }).isEnabled()).toBe(true)
    expect(await input().isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "保存间隔", exact: true }).isEnabled()).toBe(true)
    expect(await page.locator(".follower-collect-brief").first().textContent()).not.toBe("采集中")
    expect(await page.locator(".follower-detail-rhythm").textContent()).not.toContain("采集中")
    expect(await success().count()).toBe(0)
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(0))
    await waitSuccess()
  })

  it("waits for the list before confirming and never optimistically uses the result count", async () => {
    await page.evaluate(() => {
      window.followerFixture.refreshFlow.refreshPlans.push({ followerCount: "9007199254740993" })
      window.followerFixture.addFlow.listPlans.push({ hold: true })
    })
    await refresh().click()
    await waitList(1, "pending")
    expect(await success().count()).toBe(0)
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("100")
    expect(await refresh().isEnabled()).toBe(true)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitSuccess()
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("9,007,199,254,740,993")
  })

  it("confirms the successful refresh even when its single list read fails", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "刷新后的读取失败" }))
    await refresh().click()
    await waitList(1, "failed")
    await waitSuccess()
    expect(await page.getByRole("alert").allTextContents()).toEqual(["更新失败，保留上次数据：刷新后的读取失败重新加载"])
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("100")
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    expect(await page.evaluate(() => window.followerFixture.refreshFlow.refreshCalls.length)).toBe(1)
  })

  it("reuses a read already pending before collection, accepts its old snapshot and allows a later reload", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await waitList(1, "pending")
    await refresh().click()
    await waitRefresh(0, "fulfilled")
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    expect(await success().count()).toBe(0)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitSuccess()
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("100")
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.locator(".follower-counts strong").first().textContent(), pollOptions).toBe("101")
  })

  it("confirms after list synchronization without waiting for queued history", async () => {
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await page.locator('.trend-selector input').first().check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends), pollOptions).toBe(1)
    await refresh().click()
    await waitSuccess()
    expect(await page.evaluate(() => window.followerFixture.activeTrends)).toBe(1)
    expect(await page.locator('.trend-selector input').first().isChecked()).toBe(true)
    await page.evaluate(() => window.followerFixture.trendReleases.forEach(release => release()))
  })

  it("synchronizes clean interval fields but preserves an existing dirty draft", async () => {
    await page.locator(".follower-settings summary").click()
    await page.evaluate(() => window.followerFixture.patchUser(0, { intervalSeconds: 120 }))
    await refresh().click()
    await waitSuccess()
    expect(await input().inputValue()).toBe("120")
    await input().fill("600")
    await page.evaluate(() => window.followerFixture.patchUser(0, { intervalSeconds: 7200 }))
    await refresh().click()
    await waitRefresh(1, "fulfilled")
    await waitList(2, "fulfilled")
    await expect.poll(() => page.locator(".follower-settings small").first().textContent(), pollOptions).toBe("当前：每 2 小时")
    expect(await input().inputValue()).toBe("600")
    expect(await page.getByRole("button", { name: "保存间隔", exact: true }).isEnabled()).toBe(true)
    expect(await page.evaluate(() => window.followerFixture.intervalFlow.settingsCalls)).toEqual([])
  })

  it("allows repeated same-user clicks and shares the pending post-refresh list", async () => {
    await page.evaluate(() => {
      window.followerFixture.refreshFlow.refreshPlans.push({ hold: true, followerCount: "150" }, { hold: true, followerCount: "200" })
      window.followerFixture.addFlow.listPlans.push({ hold: true })
    })
    await refresh().click()
    await waitRefresh(0, "pending")
    expect(await refresh().isEnabled()).toBe(true)
    await refresh().click()
    await waitRefresh(1, "pending")
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(1))
    await waitList(1, "pending")
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(0))
    await waitRefresh(0, "fulfilled")
    expect(await page.evaluate(() => window.followerFixture.refreshFlow.refreshCalls.map(call => call.input.userId))).toEqual([firstId, firstId])
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitSuccess()
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("200")
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.locator(".follower-counts strong").first().textContent(), pollOptions).toBe("150")
  })

  it("retains the selected detail/draft while two different users refresh concurrently", async () => {
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ hold: true, followerCount: "150" }, { hold: true, followerCount: "200" }))
    await refresh().click()
    await waitRefresh(0, "pending")
    await openDetail("测试用户2")
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await refresh().click()
    await waitRefresh(1, "pending")
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(1))
    await waitSuccess()
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(0))
    await waitList(2, "fulfilled")
    expect(await page.getByRole("region", { name: "测试用户2监控详情", exact: true }).count()).toBe(1)
    expect(await input().inputValue()).toBe("600")
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("200")
    expect(await page.evaluate(() => window.followerFixture.refreshFlow.refreshCalls.map(call => call.input.userId))).toEqual([firstId, secondId])
  })

  it("allows manual refresh while a status action is waiting for its list", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await page.getByRole("button", { name: "暂停监控", exact: true }).click()
    await waitList(1, "pending")
    expect(await refresh().isEnabled()).toBe(true)
    await refresh().click()
    await waitRefresh(0, "fulfilled")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitSuccess()
    expect(await page.getByRole("button", { name: "恢复监控", exact: true }).isEnabled()).toBe(true)
  })

  it("clears a concurrent action failure when a new list starts after another refresh", async () => {
    await page.evaluate(() => window.followerFixture.refreshFlow.refreshPlans.push({ hold: true }, { hold: true }))
    await refresh().click()
    await waitRefresh(0, "pending")
    await openDetail("测试用户2")
    await refresh().click()
    await waitRefresh(1, "pending")
    await page.evaluate(() => window.followerFixture.refreshFlow.rejectRefresh(0, "并发的旧采集失败"))
    await page.getByRole("alert").filter({ hasText: "并发的旧采集失败" }).waitFor()
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(1))
    await waitSuccess()
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it("does not clear a concurrent failure again when sharing an already pending list", async () => {
    await page.evaluate(() => {
      window.followerFixture.addFlow.listPlans.push({ hold: true })
      window.followerFixture.refreshFlow.refreshPlans.push({ hold: true }, { hold: true })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await waitList(1, "pending")
    await refresh().click()
    await waitRefresh(0, "pending")
    await openDetail("测试用户2")
    await refresh().click()
    await waitRefresh(1, "pending")
    await page.evaluate(() => window.followerFixture.refreshFlow.rejectRefresh(0, "共享读期间的采集失败"))
    await page.getByRole("alert").filter({ hasText: "共享读期间的采集失败" }).waitFor()
    await page.evaluate(() => window.followerFixture.refreshFlow.releaseRefresh(1))
    await waitRefresh(1, "fulfilled")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitSuccess()
    expect(await page.getByRole("alert").allTextContents()).toEqual(["共享读期间的采集失败"])
  })

  it.each(["status", "delete"] as const)("does not erase a failed %s action by starting a list read", async action => {
    await page.evaluate(() => { window.followerFixture.actionError = "操作失败需保留" })
    if (action === "delete") {
      await page.locator(".follower-settings summary").click()
      page.once("dialog", dialog => { void dialog.accept() })
      await page.getByRole("button", { name: "删除监控与全部历史快照", exact: true }).click()
    } else await page.getByRole("button", { name: "暂停监控", exact: true }).click()
    expect(await page.evaluate(() => window.followerFixture.calls.filter(call => call === "status" || call === "delete"))).toEqual([action])
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(1)
    await expect.poll(() => page.getByRole("alert").allTextContents(), pollOptions).toEqual(["操作失败需保留"])
    expect(await page.getByRole("region", { name: "测试用户1监控详情", exact: true }).count()).toBe(1)
    expect(await page.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
    expect(await refresh().isEnabled()).toBe(true)
  })

  it.each([true, false])("shows only the last failed operation, listFinishesLast=%s", async listFinishesLast => {
    await page.evaluate(() => {
      window.followerFixture.addFlow.listPlans.push({ hold: true, error: "交错的列表失败" })
      window.followerFixture.refreshFlow.refreshPlans.push({ hold: true })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await waitList(1, "pending")
    await refresh().click()
    await waitRefresh(0, "pending")
    if (listFinishesLast) {
      await page.evaluate(() => window.followerFixture.refreshFlow.rejectRefresh(0, "交错的手动失败"))
      await page.getByRole("alert").filter({ hasText: "交错的手动失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
      await waitList(1, "failed")
      await expect.poll(() => page.getByRole("alert").allTextContents(), pollOptions)
        .toEqual(["更新失败，保留上次数据：交错的列表失败重新加载"])
    } else {
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
      await page.getByRole("alert").filter({ hasText: "交错的列表失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.refreshFlow.rejectRefresh(0, "交错的手动失败"))
      await waitRefresh(0, "failed")
      await expect.poll(() => page.getByRole("alert").allTextContents(), pollOptions).toEqual(["交错的手动失败"])
    }
    expect(await success().count()).toBe(0)
  })
})
