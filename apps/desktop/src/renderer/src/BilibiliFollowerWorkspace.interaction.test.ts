import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"
import { createUidInputAwaitObserver, type UidInputAwaitObserver } from "./__fixtures__/uid-input-await-observer"

// Browser integration with deterministic IPC responses; never calls Bilibili or opens the user's DB.
describe("follower workflow in the renderer", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  let uidInputObserver: UidInputAwaitObserver | undefined
  let setupProbe: { startedAt: number; phases: { phase: string; ms: number }[]; pending: Map<Request, string>; pendingCount: number; failed: string[]; failureCount: number; finished: boolean }
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("workspace", "beforeAll")
    suiteStartup = startup
    server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory,
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
    await startup.run("server.listen", () => server.listen())
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing test fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html`
    browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
  }, 30_000)
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    try { await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()) }
    finally { startup?.finish() }
  })
  beforeEach(async () => {
    uidInputObserver = undefined
    const startup = createBrowserStartupObserver("workspace", "beforeEach")
    pageStartup = startup
    const probe = { startedAt: performance.now(), phases: [] as { phase: string; ms: number }[], pending: new Map<Request, string>(), pendingCount: 0, failed: [] as string[], failureCount: 0, finished: false }
    setupProbe = probe
    const phase = (name: string) => { if (probe.phases.length < 100) probe.phases.push({ phase: name, ms: Math.round(performance.now() - probe.startedAt) }) }
    phase("page:create")
    const setupPage = await startup.run("page.create", () => browser.newPage())
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    phase("page:created")
    if (probe.finished) console.warn("Follower workspace page created after teardown", { phases: probe.phases })
    page.on("request", request => {
      probe.pendingCount++
      if (probe.pending.size < 100) probe.pending.set(request, new URL(request.url()).pathname.slice(0, 256))
    })
    page.on("requestfinished", request => { probe.pendingCount--; probe.pending.delete(request) })
    page.on("requestfailed", request => {
      const path = new URL(request.url()).pathname.slice(0, 256)
      probe.pendingCount--
      probe.pending.delete(request)
      probe.failureCount++
      if (probe.failed.length < 100) probe.failed.push(`failed:${path}`)
    })
    page.on("response", response => {
      if (response.status() >= 400) {
        probe.failureCount++
        if (probe.failed.length < 100) probe.failed.push(`${response.status()}:${new URL(response.url()).pathname.slice(0, 256)}`)
      }
    })
    phase("fixture:navigate")
    await startup.run("page.goto", () => page.goto(url))
    phase("fixture:loaded")
    await startup.run("page.visible", () => page.getByText("测试用户1", { exact: true }).waitFor())
    phase("fixture:ready")
  })
  afterEach(async ({ task }) => {
    const uidObserver = uidInputObserver; uidInputObserver = undefined; uidObserver?.stop()
    const startup = pageStartup; startup?.stop()
    try {
    setupProbe.finished = true
    if (task.result?.state === "fail") console.warn("Follower workspace setup phases", {
      phases: setupProbe.phases, pendingCount: setupProbe.pendingCount, pending: [...setupProbe.pending.values()], failureCount: setupProbe.failureCount, failed: setupProbe.failed
    })
    await startup.run("page.close", () => page?.close())
    } finally { try { uidObserver?.finish() } finally { startup?.finish() } }
  })

  it("displays exact Long64 totals, detail values, negative changes and keyboard tooltips", async () => {
    await page.evaluate(() => {
      window.followerFixture.patchUser(0, { currentFollowerCount: "9223372036854775807", followingCount: "-9223372036854775808", deltaSincePrevious: "-1" })
      window.followerFixture.patchUser(1, { currentFollowerCount: "9223372036854775807", deltaSincePrevious: "1" })
      window.followerFixture.history["2"] = [
        { capturedAt: "2026-10-05T01:00:00Z", followerCount: "9223372036854775806", sourceEndpoint: "card" },
        { capturedAt: "2026-10-05T01:01:00Z", followerCount: "9223372036854775807", sourceEndpoint: "card" }
      ]
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await expect.poll(() => page.getByRole("region", { name: "粉丝采集汇总" }).locator("strong").first().textContent())
      .toBe("18,446,744,073,709,551,914")
    expect(await page.locator(".follower-counts").textContent()).toContain("9,223,372,036,854,775,807")
    expect(await page.locator(".follower-counts").textContent()).toContain("关注 -9,223,372,036,854,775,808")
    expect(await page.locator(".follower-tile-change strong").first().getAttribute("class")).toBe("is-negative")
    await page.locator('.trend-selector input').first().check()
    await expect.poll(() => page.locator(".follower-history-svg circle").count()).toBe(2)
    const circles = page.locator(".follower-history-svg circle")
    expect(await circles.first().getAttribute("cy")).not.toBe(await circles.last().getAttribute("cy"))
    await circles.first().focus()
    expect(await page.getByRole("tooltip").textContent()).toContain("9,223,372,036,854,775,806")
    await page.keyboard.press("End")
    expect(await page.getByRole("tooltip").textContent()).toContain("9,223,372,036,854,775,807")
    expect(await page.locator(".trend-range").textContent()).toContain("区间净变化 +1")
  })

  it("submits a positive Long64 UID intact and rejects Long overflow before calling the v2 bridge", async () => {
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "添加 B站监控用户" })
    await dialog.getByRole("textbox").fill("9223372036854775808")
    await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
    expect(await page.evaluate(() => window.followerFixture.calls.filter(call => call === "add").length)).toBe(0)
    await dialog.getByRole("alert").waitFor()
    await dialog.getByRole("textbox").fill("9223372036854775807")
    await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
    await dialog.waitFor({ state: "detached" })
    expect(await page.evaluate(() => window.followerFixture.addRequests.at(-1)?.mid)).toBe("9223372036854775807")
    expect(await page.evaluate(() => window.followerFixture.legacyCalls)).toEqual([])
  })

  it("normalizes original integer input forms without rounding the UID", async () => {
    const observer = createUidInputAwaitObserver()
    uidInputObserver = observer
    const inputs = [
      [" 0002 ", "2"], ["+2", "2"], ["2.0", "2"], ["2.", "2"],
      ["20e-1", "2"], [".2e1", "2"], ["0x10", "16"], ["0b10", "2"], ["0o10", "8"],
      ["\uFEFF\u30002\u00A0", "2"], ["9007199254740993", "9007199254740993"],
      ["9.223372036854775807e18", "9223372036854775807"]
    ]
    for (const [index, [raw, canonical]] of inputs.entries()) {
      const round = index + 1
      await observer.run(round, "open", () => page.getByRole("button", { name: "添加用户", exact: true }).click())
      const dialog = page.getByRole("dialog", { name: "添加 B站监控用户" })
      const input = dialog.getByRole("textbox")
      await observer.run(round, "fill", () => input.fill(raw!))
      // Native pattern validation must not prevent our precise parser from running.
      await observer.run(round, "validity", async () => { expect(await input.evaluate(element => (element as HTMLInputElement).checkValidity()), raw).toBe(true) })
      await observer.run(round, "submit", () => dialog.getByRole("button", { name: "添加监控", exact: true }).click())
      await observer.run(round, "detached", () => dialog.waitFor({ state: "detached" }))
      await observer.run(round, "uid", async () => { expect(await page.evaluate(() => window.followerFixture.addRequests.at(-1)?.mid), raw).toBe(canonical) })
    }
    await observer.run(0, "legacy", async () => { expect(await page.evaluate(() => window.followerFixture.legacyCalls)).toEqual([]) })
    await observer.run(0, "count", async () => { expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(inputs.length) })
    observer.finish()
  })

  it("shows a UID validation error for blank, fractional, overflow and invalid text without calling IPC", async () => {
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "添加 B站监控用户" })
    for (const raw of ["", "  ", "0", "-2", "2.0000000000000001", "9007199254740991.1", "9223372036854775808", "0x8000000000000000", "1e21", "Infinity", "２", "2 2"]) {
      const input = dialog.getByRole("textbox")
      await input.fill(raw)
      expect(await input.evaluate(element => (element as HTMLInputElement).checkValidity()), raw).toBe(true)
      await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
      await expect.poll(() => dialog.getByRole("alert").textContent()).toContain("请输入有效 UID")
      expect(await input.inputValue()).toBe(raw)
    }
    expect(await page.evaluate(() => window.followerFixture.addRequests)).toEqual([])
    expect(await page.evaluate(() => window.followerFixture.legacyCalls)).toEqual([])
  })

  it("preserves the original UID and interval drafts after an add failure and retries the same exact UID", async () => {
    await page.evaluate(() => { window.followerFixture.actionError = "合成添加失败" })
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "添加 B站监控用户" })
    const raw = "+0009007199254740993"
    await dialog.getByRole("textbox").fill(raw)
    await dialog.getByRole("spinbutton").fill("120")
    expect(await dialog.getByRole("textbox").evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(true)
    await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
    await dialog.getByRole("alert").filter({ hasText: "合成添加失败" }).waitFor()
    expect(await dialog.getByRole("textbox").inputValue()).toBe(raw)
    expect(await dialog.getByRole("spinbutton").inputValue()).toBe("120")
    await expect.poll(() => dialog.getByRole("button", { name: "添加监控", exact: true }).isEnabled()).toBe(true)
    await dialog.getByRole("textbox").fill("2.0000000000000001")
    await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
    await expect.poll(() => dialog.getByRole("alert").textContent()).toContain("请输入有效 UID")
    expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(1)
    await dialog.getByRole("textbox").fill(raw)
    await page.evaluate(() => { window.followerFixture.actionError = "" })
    await dialog.getByRole("button", { name: "添加监控", exact: true }).click()
    await dialog.waitFor({ state: "detached" })
    expect(await page.evaluate(() => window.followerFixture.addRequests)).toEqual([
      { mid: "9007199254740993", intervalSeconds: 120 },
      { mid: "9007199254740993", intervalSeconds: 120 }
    ])
    expect(await page.evaluate(() => window.followerFixture.legacyCalls)).toEqual([])
  })

  it.each(["http://i2.hdslb.com/synthetic-csp-avatar.png", "  http://i0.hdslb.com/synthetic-csp-avatar.png  ", "//i1.hdslb.com/synthetic-csp-avatar.png"])(
    "displays original CDN avatar %s under the actual production CSP", async raw => {
      const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
      const policy = html.match(/content="(default-src[^\"]+)"/)![1]!
      const requests: string[] = []
      await page.route("**/synthetic-csp-avatar.png", async route => {
        requests.push(route.request().url())
        await route.fulfill({ contentType: "image/png", body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64") })
      })
      await page.evaluate(content => {
        const meta = document.createElement("meta")
        meta.httpEquiv = "Content-Security-Policy"
        meta.content = content
        document.head.append(meta)
      }, policy)
      await page.evaluate(avatarUrl => window.followerFixture.patchUser(0, { avatarUrl }), raw)
      await page.getByRole("button", { name: "刷新列表", exact: true }).click()
      const tile = page.locator(".follower-card").first()
      await expect.poll(() => tile.locator("img").evaluateAll(images => images.length === 1 && (images[0] as HTMLImageElement).naturalWidth > 0)).toBe(true)
      await tile.locator(".follower-tile-expand").click()
      await expect.poll(() => page.locator(".follower-monitor-detail img").evaluateAll(images => images.length === 1 && (images[0] as HTMLImageElement).naturalWidth > 0)).toBe(true)
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every(value => value.startsWith("https://"))).toBe(true)
      await page.unroute("**/synthetic-csp-avatar.png")
    })

  it.each(["not-a-url", "file:///D:/synthetic-secret", "javascript:alert(1)", "data:image/svg+xml,synthetic"])(
    "keeps original nickname and uses both avatar fallbacks for %s", async avatarUrl => {
      await page.evaluate(value => window.followerFixture.patchUser(0, { nickname: "  合成原名  ", avatarUrl: value }), avatarUrl)
      await page.getByRole("button", { name: "刷新列表", exact: true }).click()
      const tile = page.locator(".follower-card").first()
      await expect.poll(() => tile.locator(".follower-tile-identity strong").textContent()).toBe("  合成原名  ")
      expect(await tile.locator("img").count()).toBe(0)
      await tile.locator(".follower-tile-expand").click()
      expect(await page.locator(".follower-monitor-detail img").count()).toBe(0)
      expect(await page.locator(".follower-monitor-detail .follower-profile a").textContent()).toBe("  合成原名  ")
    })

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

  it("ticks collection rhythm locally without labelling manual refresh as automatic collection, and respects pause", async () => {
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
    expect(await tile.locator(".follower-collect-brief").textContent()).toBe("30 秒后")
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

  it("does not label manual refresh as automatic collection or lock it during a pending list reload", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.evaluate(() => { window.followerFixture.holdListAfterRefresh = true })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.listWaiting)).toBe(true)
    expect(await page.locator(".follower-collect-brief").first().textContent()).not.toBe("采集中")
    expect(await page.getByRole("button", { name: "立即刷新", exact: true }).isEnabled()).toBe(true)
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
    await page.evaluate(() => window.followerFixture.updateFirst("34567"))
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

  it("normalizes intervals and keeps edited drafts when background data refreshes", async () => {
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    expect(await page.getByRole("region", { name: "测试用户1监控详情" }).textContent()).toContain("关注 12")
    await page.locator(".follower-settings summary").first().click()
    const input = page.getByRole("spinbutton").first()
    await page.evaluate(() => window.followerFixture.updateFirst("100", 120))
    await expect.poll(() => input.inputValue(), { timeout: 6000 }).toBe("120")
    await input.fill("0")
    expect(await page.getByRole("button", { name: "保存间隔" }).first().isDisabled()).toBe(false)
    await input.press("Tab")
    expect(await input.inputValue()).toBe("1")
    await input.fill("600")
    await page.evaluate(() => window.followerFixture.updateFirst("45678", 300))
    await page.getByText("45,678", { exact: true }).waitFor({ timeout: 6000 })
    expect(await input.inputValue()).toBe("600")
    await page.getByRole("button", { name: "保存间隔" }).first().click()
    await page.getByText("当前：每 10 分钟", { exact: true }).waitFor()
  }, 15_000)

  it("plots actual timestamps and a declining range as a loss", async () => {
    await page.locator('.trend-selector input').first().check()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".follower-history-svg circle").first().waitFor()
    const x = await page.locator(".follower-history-svg circle").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("cx"))))
    expect((x[1]! - x[0]!) / (x[2]! - x[0]!)).toBeCloseTo(0.1, 2)
    await page.getByText("区间净变化 -20", { exact: true }).waitFor()
    expect(await page.locator(".follower-history-svg circle title").first().textContent()).toContain("120")
  })
})
