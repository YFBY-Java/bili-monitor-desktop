import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

describe("original follower delete interaction", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  let errors: string[], external: string[]
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  type StartupProbe = {
    startedAt: number; phases: { phase: string; ms: number }[]; pending: Map<Request, string>
    pendingCount: number; failureCount: number; finished: boolean; watchdogFired: boolean
    teardownStarted: boolean; pageCloseCompleted: boolean; listenersRemoved: boolean
  }
  let startupProbe: StartupProbe | undefined
  const poll = { timeout: 1500, interval: 25 }
  function phase(probe: StartupProbe, name: string) {
    if (probe.phases.length < 30) probe.phases.push({ phase: name, ms: Math.round(performance.now() - probe.startedAt) })
  }
  function startupSummary(probe: StartupProbe, reason: string) {
    return JSON.stringify({ reason, ms: Math.round(performance.now() - probe.startedAt), unfinished: !probe.finished,
      phases: probe.phases, pendingCount: probe.pendingCount, pending: [...probe.pending.values()], failureCount: probe.failureCount,
      watchdogFired: probe.watchdogFired, teardownStarted: probe.teardownStarted,
      pageCloseCompleted: probe.pageCloseCompleted, listenersRemoved: probe.listenersRemoved })
  }
  function reportStartup(probe: StartupProbe, reason: string) {
    // Hook diagnostics must remain visible even when a reporter filters console output.
    process.stderr.write(`Follower delete startup probe ${startupSummary(probe, reason)}\n`)
  }
  function watchStartupResources(target: Page, probe: StartupProbe) {
    const origin = new URL(url).origin
    const localPath = (request: Request) => {
      const resource = new URL(request.url())
      return resource.origin === origin ? resource.pathname.slice(0, 256) : undefined
    }
    const requested = (request: Request) => {
      const path = localPath(request)
      if (path === undefined) return
      probe.pendingCount++
      if (probe.pending.size < 50) probe.pending.set(request, path)
    }
    const finished = (request: Request) => {
      if (localPath(request) === undefined) return
      probe.pendingCount--
      probe.pending.delete(request)
    }
    const failed = (request: Request) => {
      if (localPath(request) === undefined) return
      finished(request)
      probe.failureCount++
    }
    target.on("request", requested)
    target.on("requestfinished", finished)
    target.on("requestfailed", failed)
    return () => {
      target.off("request", requested)
      target.off("requestfinished", finished)
      target.off("requestfailed", failed)
      probe.listenersRemoved = true
    }
  }
  async function navigate(target: Page, startup: BrowserStartupObserver, probe?: StartupProbe) {
    target.on("pageerror", error => errors.push(error.message))
    await startup.run("page.route", () => target.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { external.push(route.request().url()); await route.abort() }
    }))
    if (probe) phase(probe, "goto:start")
    await startup.run("page.goto", () => target.goto(url, { waitUntil: "commit" }))
    if (probe) phase(probe, "goto:committed")
    await startup.run("page.visible", () => target.getByText("测试用户1", { exact: true }).waitFor())
    if (probe) phase(probe, "visible:ready")
  }
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("delete", "beforeAll")
    suiteStartup = startup
    const probe: StartupProbe = { startedAt: performance.now(), phases: [], pending: new Map(), pendingCount: 0,
      failureCount: 0, finished: false, watchdogFired: false, teardownStarted: false,
      pageCloseCompleted: false, listenersRemoved: false }
    startupProbe = probe
    const diagnosticTimer = setTimeout(() => {
      probe.watchdogFired = true
      reportStartup(probe, "9500ms-watchdog")
    }, 9500)
    diagnosticTimer.unref()
    let readyPage: Page | undefined
    let removeProbeListeners: (() => void) | undefined
    let startupFailed = false, closeFailed = false
    try {
      phase(probe, "createServer:start")
      server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
        cacheDir: browserFixtureCacheDirectory, plugins: [react()],
        server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
      phase(probe, "createServer:end")
      phase(probe, "listen:start")
      await startup.run("server.listen", () => server.listen())
      phase(probe, "listen:end")
      const address = server.httpServer!.address()
      if (!address || typeof address === "string") throw new Error("Missing fixture port")
      url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html?delete-flow=1&status-flow=1`
      phase(probe, "chromium.launch:start")
      browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
      phase(probe, "chromium.launch:end")
      errors = []; external = []
      phase(probe, "newPage:start")
      readyPage = await startup.run("page.create", () => browser.newPage())
      if (!startup.attachPage(readyPage)) return
      phase(probe, "newPage:end")
      removeProbeListeners = watchStartupResources(readyPage, probe)
      await navigate(readyPage, startup, probe); expect(errors).toEqual([]); expect(external).toEqual([])
    } catch (error) {
      startupFailed = true
      phase(probe, "startup:failed")
      throw error
    } finally {
      startup.stop()
      try {
        if (readyPage) {
          phase(probe, "readyPage.close:start")
          try {
            await startup.run("page.close", () => readyPage!.close())
            probe.pageCloseCompleted = true
            phase(probe, "readyPage.close:end")
          } catch (error) {
            closeFailed = true
            phase(probe, "readyPage.close:failed")
            // Keep the original setup error when teardown also fails.
            if (!startupFailed) throw error
          }
        }
      } finally {
        clearTimeout(diagnosticTimer)
        removeProbeListeners?.()
        probe.finished = true
        phase(probe, "probe:cleanup")
        if (startupFailed || closeFailed || probe.watchdogFired || probe.teardownStarted || performance.now() - probe.startedAt >= 10_000) {
          reportStartup(probe, startupFailed || closeFailed ? "failed-cleanup"
            : probe.teardownStarted ? "late-completion-after-teardown"
            : probe.watchdogFired ? "watchdog-cleanup" : "completed-after-hook-budget")
        } else if (process.env.BMD_TEST_STARTUP_TRACE === "1") {
          reportStartup(probe, "ready-cleanup")
        }
      }
    }
  })
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    const probe = startupProbe
    if (probe && !probe.finished) {
      probe.teardownStarted = true
      phase(probe, "afterAll:cleanup:start")
      reportStartup(probe, "teardown-with-unfinished-startup")
    }
    let cleanupCompleted = false
    try { await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()); cleanupCompleted = true }
    finally {
      startup?.finish()
      if (probe?.teardownStarted) {
        phase(probe, cleanupCompleted ? "afterAll:cleanup:end" : "afterAll:cleanup:failed")
        reportStartup(probe, "teardown-cleanup")
      }
    }
  })
  beforeEach(async () => {
    const startup = createBrowserStartupObserver("delete", "beforeEach")
    pageStartup = startup
    errors = []; external = []
    const setupPage = await startup.run("page.create", () => browser.newPage({ viewport: { width: 1440, height: 1100 } }))
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    await navigate(page, startup)
    await expand(1)
    await page.locator(".follower-settings summary").click()
    await input().fill("600")
    await page.locator(".trend-selector input").first().check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length), poll).toBe(1)
  })
  afterEach(async () => {
    const startup = pageStartup; startup?.stop()
    try { await startup.run("page.close", () => page?.close()); expect(errors).toEqual([]); expect(external).toEqual([]) }
    finally { startup?.finish() }
  })
  function expand(index: number) { return page.getByRole("button", { name: `展开测试用户${index}的详情`, exact: true }).click() }
  function input() { return page.locator(".follower-settings").getByRole("spinbutton") }
  function remove() { return page.getByRole("button", { name: "删除监控与全部历史快照", exact: true }) }
  async function clickDelete(accept = true) {
    page.once("dialog", dialog => accept ? dialog.accept() : dialog.dismiss())
    await remove().click()
  }
  async function deleted(index: number, phase: string) {
    await expect.poll(() => page.evaluate(i => window.followerFixture.deleteFlow.calls[i]?.phase, index), poll).toBe(phase)
  }
  async function listed(index: number, phase: string) {
    await expect.poll(() => page.evaluate(i => window.followerFixture.addFlow.listCalls[i]?.phase, index), poll).toBe(phase)
  }
  it("cancel retains old error and all local state without DELETE", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "旧错误" }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "旧错误" }).waitFor()
    await clickDelete(false)
    expect(await page.evaluate(() => window.followerFixture.deleteFlow.calls)).toEqual([])
    expect(await page.getByRole("alert").allTextContents()).toEqual(["更新失败，保留上次数据：旧错误重新加载"])
    expect(await input().inputValue()).toBe("600")
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(true)
  })
  it("pending permits repeat DELETE and failure preserves selected detail dirty draft without reread", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "入口前旧错误" }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "入口前旧错误" }).waitFor()
    await page.evaluate(() => window.followerFixture.deleteFlow.plans.push({ hold: true }, { hold: true }))
    await clickDelete(); await deleted(0, "pending")
    expect(await page.getByRole("alert").count()).toBe(0)
    expect(await remove().isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "保存间隔", exact: true }).isEnabled()).toBe(true)
    expect(await input().inputValue()).toBe("600")
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(true)
    await clickDelete(); await deleted(1, "pending")
    await page.evaluate(() => { window.followerFixture.deleteFlow.reject(0, "删除失败1"); window.followerFixture.deleteFlow.reject(1, "删除失败2") })
    await page.getByRole("alert").filter({ hasText: "删除失败2" }).waitFor()
    expect(await input().inputValue()).toBe("600")
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(true)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
  })
  it("commit collapses and deselects before held list, then confirms despite list failure", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true, error: "提交后读失败" }))
    await clickDelete(); await listed(1, "pending")
    expect(await page.getByRole("region", { name: "测试用户1监控详情", exact: true }).count()).toBe(0)
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(false)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => page.getByRole("status").filter({ hasText: /^已删除$/ }).count(), poll).toBe(1)
    expect(await page.getByText("测试用户1", { exact: true }).count()).toBe(1)
    await expand(1); await page.locator(".follower-settings summary").click()
    expect(await input().inputValue()).toBe("600")
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await listed(2, "fulfilled")
    expect(await page.getByText("测试用户1", { exact: true }).count()).toBe(0)
    // Reintroduce the identical fixture ID solely to expose whether missing-list
    // synchronization actually removed that ID's draft; real re-add uses a new ID.
    await page.evaluate(() => window.followerFixture.deleteFlow.restore(0))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await listed(3, "fulfilled")
    await expand(1); await page.locator(".follower-settings summary").click()
    expect(await input().inputValue()).toBe("3600")
  })
  it("accepts older list card return without reselecting or reopening and erases unique history cache", async () => {
    await page.evaluate(() => {
      window.followerFixture.history["2"] = [
        { capturedAt: "2026-09-05T02:00:00.000Z", followerCount: "888888", sourceEndpoint: "x/web-interface/card" },
        { capturedAt: "2026-09-05T02:01:00.000Z", followerCount: "999999", sourceEndpoint: "x/web-interface/card" }]
      window.followerFixture.history["3"] = [
        { capturedAt: "2026-09-05T02:00:00.000Z", followerCount: "777777", sourceEndpoint: "x/web-interface/card" }]
    })
    await page.locator(".trend-selector input").first().uncheck()
    await page.locator(".trend-selector input").first().check()
    await page.locator('circle[aria-label*="999,999"]').waitFor()
    await page.locator(".trend-selector input").nth(1).check()
    await page.locator('circle[aria-label*="777,777"]').waitFor()
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await page.getByRole("button", { name: "刷新列表", exact: true }).click(); await listed(1, "pending")
    await clickDelete(); await deleted(0, "fulfilled")
    expect(await page.locator('circle[aria-label*="777,777"]').count()).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => page.getByRole("status").filter({ hasText: /^已删除$/ }).count(), poll).toBe(1)
    expect(await page.getByRole("region", { name: "测试用户1监控详情", exact: true }).count()).toBe(0)
    expect(await page.locator(".trend-selector input").first().isChecked()).toBe(false)
    await page.evaluate(() => { window.followerFixture.trendError = "新历史失败" })
    await page.locator(".trend-selector input").first().check()
    await page.getByRole("alert").filter({ hasText: "趋势更新失败" }).waitFor()
    expect(await page.locator('circle[aria-label*="999,999"]').count()).toBe(0)
    await page.locator('circle[aria-label*="粉丝 120"]').waitFor()
  })
  it("does not collapse a different detail opened while DELETE is held", async () => {
    await page.evaluate(() => window.followerFixture.deleteFlow.plans.push({ hold: true }))
    await clickDelete(); await deleted(0, "pending")
    await expand(2)
    await page.evaluate(() => window.followerFixture.deleteFlow.release(0))
    await expect.poll(() => page.getByRole("status").filter({ hasText: /^已删除$/ }).count(), poll).toBe(1)
    expect(await page.getByRole("region", { name: "测试用户2监控详情", exact: true }).count()).toBe(1)
  })
  it("held history does not delay commit or success notice", async () => {
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await page.locator(".trend-selector input").first().uncheck()
    await page.locator(".trend-selector input").first().check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends), poll).toBe(1)
    await clickDelete()
    await expect.poll(() => page.getByRole("status").filter({ hasText: /^已删除$/ }).count(), poll).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.activeTrends)).toBe(1)
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.forEach(release => release()) })
  })
  it("clears deleted user's unique cached history even when post-delete list fails and card remains", async () => {
    await page.evaluate(() => {
      window.followerFixture.history["2"] = [{ capturedAt: "2026-09-05T02:00:00.000Z", followerCount: "666666", sourceEndpoint: "x/web-interface/card" }]
    })
    await page.locator(".trend-selector input").first().uncheck()
    await page.locator(".trend-selector input").first().check()
    await page.locator('circle[aria-label*="666,666"]').waitFor()
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "旧列表保留" }))
    await clickDelete(); await listed(1, "failed")
    await page.locator(".trend-selector input").first().check()
    await page.getByRole("alert").filter({ hasText: "趋势更新失败" }).waitFor()
    expect(await page.locator('circle[aria-label*="666,666"]').count()).toBe(0)
    await page.locator('circle[aria-label*="粉丝 120"]').waitFor()
  })
  it.each([true, false])("uses the last shared DELETE/list error writer, listLast=%s", async listLast => {
    await page.evaluate(() => {
      window.followerFixture.addFlow.listPlans.push({ hold: true, error: "交错列表失败" })
      window.followerFixture.deleteFlow.plans.push({ hold: true })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click(); await listed(1, "pending")
    await clickDelete(); await deleted(0, "pending")
    if (listLast) {
      await page.evaluate(() => window.followerFixture.deleteFlow.reject(0, "交错删除失败"))
      await page.getByRole("alert").filter({ hasText: "交错删除失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1)); await listed(1, "failed")
      await expect.poll(() => page.getByRole("alert").allTextContents(), poll).toEqual(["更新失败，保留上次数据：交错列表失败重新加载"])
    } else {
      await page.evaluate(() => window.followerFixture.addFlow.releaseList(1)); await listed(1, "failed")
      await page.getByRole("alert").filter({ hasText: "交错列表失败" }).waitFor()
      await page.evaluate(() => window.followerFixture.deleteFlow.reject(0, "交错删除失败"))
      await expect.poll(() => page.getByRole("alert").allTextContents(), poll).toEqual(["交错删除失败"])
    }
  })
})
