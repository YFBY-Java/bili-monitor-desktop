import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

// Real React/Query/Chromium; the synthetic boundary is only the typed bridge.
describe("original follower status interaction", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let errors: string[]
  let external: string[]
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  const pollOptions = { timeout: 1_500, interval: 25 }
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("status", "beforeAll")
    suiteStartup = startup
    server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory, plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
    await startup.run("server.listen", () => server.listen())
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing follower status fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html?status-flow=1&refresh-flow=1`
    browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
    const readyPage = await startup.run("page.create", () => browser.newPage())
    if (!startup.attachPage(readyPage)) {
      try { await startup.run("page.close", () => readyPage.close()) } finally { startup.finish() }
      return
    }
    const readyErrors: string[] = []
    const blocked: string[] = []
    readyPage.on("pageerror", error => readyErrors.push(error.message))
    await startup.run("page.route", () => readyPage.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { blocked.push(route.request().url()); await route.abort() }
    }))
    try {
      await startup.run("page.goto", () => readyPage.goto(url, { waitUntil: "commit" }))
      await startup.run("page.visible", () => readyPage.getByText("测试用户1", { exact: true }).waitFor())
      expect(readyErrors).toEqual([])
      expect(blocked).toEqual([])
    } finally { startup.stop(); await startup.run("page.close", () => readyPage.close()) }
  })
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    try { await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()) }
    finally { startup?.finish() }
  })
  beforeEach(async () => {
    const startup = createBrowserStartupObserver("status", "beforeEach")
    pageStartup = startup
    errors = []; external = []
    const setupPage = await startup.run("page.create", () => browser.newPage({ viewport: { width: 1440, height: 1100 } }))
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    page.on("pageerror", error => errors.push(error.message))
    await startup.run("page.route", () => page.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { external.push(route.request().url()); await route.abort() }
    }))
    await startup.run("page.goto", () => page.goto(url, { waitUntil: "commit" }))
    await startup.run("page.visible", () => page.getByText("测试用户1", { exact: true }).waitFor())
    await page.getByRole("button", { name: "展开测试用户1的详情", exact: true }).click()
  })
  afterEach(async () => {
    const startup = pageStartup; startup?.stop()
    try {
      await startup.run("page.close", () => page?.close())
      expect(errors).toEqual([])
      expect(external).toEqual([])
    } finally { startup?.finish() }
  })
  function pause() { return page.getByRole("button", { name: "暂停监控", exact: true }) }
  function resume() { return page.getByRole("button", { name: "恢复监控", exact: true }) }
  function input() { return page.locator(".follower-settings").getByRole("spinbutton") }
  function successNotice() { return page.getByRole("status").filter({ hasText: /^(已刷新|已添加|已更新)/ }) }
  async function waitStatus(index: number, phase: "pending" | "fulfilled" | "failed") {
    await expect.poll(() => page.evaluate(position => window.followerFixture.statusFlow.statusCalls[position]?.phase, index), pollOptions).toBe(phase)
  }
  async function waitList(index: number, phase: "pending" | "fulfilled" | "failed") {
    await expect.poll(() => page.evaluate(position => window.followerFixture.addFlow.listCalls[position]?.phase, index), pollOptions).toBe(phase)
  }

  it("keeps all actions enabled during PATCH and permits repeated same-user requests", async () => {
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await page.evaluate(() => window.followerFixture.statusFlow.statusPlans.push({ hold: true }, { hold: true }))
    await pause().click()
    await waitStatus(0, "pending")
    expect(await pause().isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "立即刷新", exact: true }).isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "保存间隔", exact: true }).isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "删除监控与全部历史快照", exact: true }).isEnabled()).toBe(true)
    expect(await input().isEnabled()).toBe(true)
    await pause().click()
    await waitStatus(1, "pending")
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.refreshFlow.refreshCalls.length), pollOptions).toBe(1)
    await page.evaluate(() => { window.followerFixture.statusFlow.rejectStatus(0, "first"); window.followerFixture.statusFlow.rejectStatus(1, "second") })
    await waitStatus(1, "failed")
  })

  it("clears the old list error at PATCH entry and preserves selection/detail/dirty draft on failure", async () => {
    await page.locator(".trend-selector input").first().check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length), pollOptions).toBe(1)
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "旧列表错误" }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "旧列表错误" }).waitFor()
    const before = await page.evaluate(() => ({ lists: window.followerFixture.addFlow.listCalls.length, trends: window.followerFixture.trendRequests.length }))
    await page.evaluate(() => window.followerFixture.statusFlow.statusPlans.push({ hold: true }))
    await pause().click()
    await waitStatus(0, "pending")
    expect(await page.getByRole("alert").count()).toBe(0)
    await page.evaluate(() => window.followerFixture.statusFlow.rejectStatus(0, "暂停失败"))
    await page.getByRole("alert").filter({ hasText: "暂停失败" }).waitFor()
    expect(await page.evaluate(() => ({ lists: window.followerFixture.addFlow.listCalls.length, trends: window.followerFixture.trendRequests.length }))).toEqual(before)
    expect(await input().inputValue()).toBe("600")
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(true)
    expect(await page.getByRole("region", { name: "测试用户1监控详情", exact: true }).count()).toBe(1)
    expect(await pause().count()).toBe(1)
    expect(await successNotice().count()).toBe(0)
  })

  it("ignores PATCH return fields and renders only the final list projection without a toast", async () => {
    await page.evaluate(() => {
      window.followerFixture.statusFlow.statusPlans.push({ resultPatch: { monitorStatus: "ACTIVE", currentFollowerCount: "900" }, listPatch: { currentFollowerCount: "200" } })
      window.followerFixture.addFlow.listPlans.push({ hold: true })
    })
    await pause().click()
    await waitList(1, "pending")
    expect(await pause().isEnabled()).toBe(true)
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("100")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await resume().waitFor()
    expect(await page.locator(".follower-counts strong").first().textContent()).toBe("200")
    expect(await successNotice().count()).toBe(0)
    await resume().click()
    await pause().waitFor()
    expect(await page.evaluate(() => window.followerFixture.statusFlow.statusCalls.map(call => call.input.enabled))).toEqual([false, true])
  })

  it("shares an older pending list and accepts its old status before a later reload", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await waitList(1, "pending")
    await pause().click()
    await waitStatus(0, "fulfilled")
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitList(1, "fulfilled")
    expect(await pause().isEnabled()).toBe(true)
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await resume().waitFor()
  })

  it("retains old state on a single failed post-PATCH list and produces no success notice", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "状态写入后读失败" }))
    await pause().click()
    await waitList(1, "failed")
    await page.getByRole("alert").filter({ hasText: "状态写入后读失败" }).waitFor()
    expect(await pause().isEnabled()).toBe(true)
    expect(await successNotice().count()).toBe(0)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
  })

  it("does not force or await held selected history before status completes", async () => {
    await page.locator(".trend-selector input").first().check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length), pollOptions).toBe(1)
    await page.evaluate(() => { window.followerFixture.holdTrends = true; window.followerFixture.addFlow.listPlans.push({ hold: true }) })
    await pause().click()
    await waitList(1, "pending")
    // Original queue refresh follows successful list; it is not forced at PATCH.
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await resume().waitFor()
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends), pollOptions).toBe(1)
    expect(await resume().isEnabled()).toBe(true)
    await resume().click()
    await waitStatus(1, "fulfilled")
    await pause().waitFor()
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(true)
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.forEach(release => release()) })
  })

  it("does not clear a newer concurrent error when reusing the shared list", async () => {
    await page.evaluate(() => {
      window.followerFixture.addFlow.listPlans.push({ hold: true })
      window.followerFixture.statusFlow.statusPlans.push({ hold: true }, { hold: true })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await waitList(1, "pending")
    await pause().click(); await waitStatus(0, "pending")
    expect(await pause().isEnabled()).toBe(true)
    await pause().click(); await waitStatus(1, "pending")
    await page.evaluate(() => window.followerFixture.statusFlow.rejectStatus(0, "共享读期间失败"))
    await page.getByRole("alert").filter({ hasText: "共享读期间失败" }).waitFor()
    await page.evaluate(() => window.followerFixture.statusFlow.releaseStatus(1))
    await waitStatus(1, "fulfilled")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await waitList(1, "fulfilled")
    expect(await page.getByRole("alert").allTextContents()).toEqual(["共享读期间失败"])
  })

  it("clears a concurrent status failure when another successful status starts a new list", async () => {
    await page.evaluate(() => window.followerFixture.statusFlow.statusPlans.push({ hold: true }, { hold: true }))
    await pause().click(); await waitStatus(0, "pending")
    await pause().click(); await waitStatus(1, "pending")
    await page.evaluate(() => window.followerFixture.statusFlow.rejectStatus(0, "新读取前失败"))
    await page.getByRole("alert").filter({ hasText: "新读取前失败" }).waitFor()
    await page.evaluate(() => window.followerFixture.statusFlow.releaseStatus(1))
    await resume().waitFor()
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it.each([true, false])("shows only the final status/list failure with listFinishesLast=%s", async listFinishesLast => {
    await page.evaluate(() => {
      window.followerFixture.addFlow.listPlans.push({ hold: true, error: "交错列表失败" })
      window.followerFixture.statusFlow.statusPlans.push({ hold: true })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click(); await waitList(1, "pending")
    await pause().click(); await waitStatus(0, "pending")
    if (listFinishesLast) {
      await page.evaluate(() => window.followerFixture.statusFlow.rejectStatus(0, "交错状态失败"))
      await page.getByRole("alert").filter({ hasText: "交错状态失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1)); await waitList(1, "failed")
      await expect.poll(() => page.getByRole("alert").allTextContents(), pollOptions).toEqual(["更新失败，保留上次数据：交错列表失败重新加载"])
    } else {
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1)); await waitList(1, "failed")
      await page.getByRole("alert").filter({ hasText: "交错列表失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.statusFlow.rejectStatus(0, "交错状态失败"))
      await expect.poll(() => page.getByRole("alert").allTextContents(), pollOptions).toEqual(["交错状态失败"])
    }
  })
})
