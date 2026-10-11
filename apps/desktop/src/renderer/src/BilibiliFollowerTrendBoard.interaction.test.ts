import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

async function closeAfterEvidence<T>(extract: () => Promise<T>, output: (evidence: T) => void,
  failed: (phase: "EVIDENCE_EXTRACTION_FAILED") => void, close: () => Promise<void>, budget = 500): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const evidence = await Promise.race([Promise.resolve().then(extract), new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Evidence extraction deadline")), budget)
    })])
    output(evidence)
  } catch { failed("EVIDENCE_EXTRACTION_FAILED") }
  finally { clearTimeout(timer); await close() }
}

describe("teardown evidence boundary", () => {
  it("closes the resource when evidence extraction throws without exposing the error", async () => {
    const phases: string[] = []
    let closed = false, evidence = false
    await closeAfterEvidence(() => Promise.reject(new Error("synthetic private failure")), () => { evidence = true },
      phase => phases.push(phase), async () => { closed = true }, 20).catch(() => {})
    expect(closed).toBe(true)
    expect(evidence).toBe(false)
    expect(phases).toEqual(["EVIDENCE_EXTRACTION_FAILED"])
  })
  it("bounds unresolved extraction and closes before it settles", async () => {
    const phases: string[] = []
    let closed = false, evidence = false, release!: () => void
    const extraction = new Promise<void>(resolve => { release = resolve })
    const teardown = closeAfterEvidence(() => extraction, () => { evidence = true }, phase => phases.push(phase), async () => { closed = true }, 20)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const outcome = await Promise.race([teardown.then(() => "closed"), new Promise<string>(resolve => { timer = setTimeout(() => resolve("unsettled"), 100) })])
      expect(outcome).toBe("closed")
      expect(closed).toBe(true)
      expect(evidence).toBe(false)
      expect(phases).toEqual(["EVIDENCE_EXTRACTION_FAILED"])
    } finally { clearTimeout(timer); release(); await teardown }
  })
})

// The real connected workspace, Query and SVG run in Chromium; only IPC is synthetic.
describe("original follower trend interactions", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  let volumePhases: { phase: string; ms: number }[] = []
  let hintObserved = false, volumeObserved = false
  let setupProbe: { startedAt: number; phases: { phase: string; ms: number }[]; pending: Map<Request, string>; pendingCount: number; failed: string[]; failureCount: number; finished: boolean }
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("trend", "beforeAll")
    suiteStartup = startup
    server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory,
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
    await startup.run("server.listen", () => server.listen())
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html`
    browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
  }, 30_000)
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    try { await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()) }
    finally { startup?.finish() }
  })
  beforeEach(async () => {
    const startup = createBrowserStartupObserver("trend", "beforeEach")
    pageStartup = startup
    volumePhases = []
    hintObserved = false; volumeObserved = false
    const probe = { startedAt: performance.now(), phases: [] as { phase: string; ms: number }[], pending: new Map<Request, string>(), pendingCount: 0, failed: [] as string[], failureCount: 0, finished: false }
    setupProbe = probe
    const phase = (name: string) => { if (probe.phases.length < 100) probe.phases.push({ phase: name, ms: Math.round(performance.now() - probe.startedAt) }) }
    phase("page:create")
    const setupPage = await startup.run("page.create", () => browser.newPage({ viewport: { width: 1440, height: 1200 } }))
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    phase("page:created")
    if (probe.finished) console.warn("Follower trend page created after teardown", { phases: probe.phases })
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
    page.on("pageerror", error => { throw error })
    phase("fixture:navigate")
    await startup.run("page.goto", () => page.goto(url))
    phase("fixture:loaded")
    await startup.run("page.visible", () => page.getByRole("button", { name: "展开测试用户1的详情" }).waitFor())
    phase("fixture:ready")
  })
  afterEach(async ({ task }) => {
    const startup = pageStartup; startup?.stop()
    try {
    setupProbe.finished = true
    if (task.result?.state === "fail") console.warn("Follower trend setup phases", {
      phases: setupProbe.phases, pendingCount: setupProbe.pendingCount, pending: [...setupProbe.pending.values()], failureCount: setupProbe.failureCount, failed: setupProbe.failed
    })
    if (task.result?.state === "fail" && volumePhases.length) console.warn("Follower volume fixture phases", volumePhases)
    await closeAfterEvidence(async () => {
      if (!page || (!hintObserved && !volumeObserved)) return undefined
      return page.evaluate(() => {
        const hints = Reflect.get(window, "trendObservations") as { text: string; at: number }[] | undefined
        const volume = Reflect.get(window, "volumeObservations") as { events: { phase: string; at: number }[]; longtasks: { at: number; duration: number }[] } | undefined
        const observers = Reflect.get(window, "followerProbeObservers") as { disconnect: () => void }[] | undefined
        observers?.forEach(observer => observer.disconnect())
        return { hints: hints?.map(item => ({ phase: item.text === "趋势刷新中" ? "REFRESHING" : item.text === "趋势已更新" ? "DONE" : item.text === "" ? "IDLE" : "ERROR", at: item.at })), volume,
          trendStartedAt: window.followerFixture.trendStartedAt.slice(0, 64), trendFinishedAt: window.followerFixture.trendFinishedAt.slice(0, 64),
          trendCount: window.followerFixture.trendRequests.length, active: window.followerFixture.activeTrends, maxActive: window.followerFixture.maxActiveTrends,
          lists: window.followerFixture.listPhases }
      })
    }, evidence => { if (evidence) console.warn("Follower browser bounded observations", evidence) },
    phase => console.warn("Follower browser diagnostic phase", { phase }), async () => { await startup.run("page.close", () => page?.close()) })
    } finally { startup?.finish() }
  })
  const choose = async (count: number) => {
    for (let i = 1; i <= count; i++) await page.getByRole("checkbox", { name: `测试用户${i}趋势对比` }).check()
  }
  const order = () => page.locator(".follower-trend-card h3").allTextContents()

  it("requests selected trends on the monitor page and lays out one, two, three and four charts", async () => {
    await choose(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendRequests.length)).toBeGreaterThan(0)
    const charts = page.locator(".follower-trend-chart")
    expect(await charts.count()).toBe(1)
    expect((await charts.first().boundingBox())!.height).toBe(440)
    await choose(2)
    await expect.poll(() => charts.count()).toBe(2)
    const first = (await charts.nth(0).boundingBox())!, second = (await charts.nth(1).boundingBox())!
    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThan(first.x)
    expect(first.height).toBe(360)
    await choose(3)
    await expect.poll(() => charts.count()).toBe(3)
    expect(await order()).toEqual(["测试用户1", "测试用户2", "测试用户3"])
    const main = (await charts.nth(0).boundingBox())!, side = (await charts.nth(1).boundingBox())!, lower = (await charts.nth(2).boundingBox())!
    expect(main.width).toBeGreaterThan(side.width)
    expect(main.height).toBe(440)
    expect(side.height).toBe(204)
    expect(side.x).toBe(lower.x)
    expect(lower.y).toBeGreaterThan(side.y)
    await choose(4)
    await expect.poll(() => charts.count()).toBe(4)
    expect((await charts.first().boundingBox())!.height).toBe(248)
    expect((await charts.nth(2).boundingBox())!.x).toBe((await charts.first().boundingBox())!.x)
    expect(await page.getByRole("checkbox", { name: "测试用户5趋势对比" }).isDisabled()).toBe(true)
  })

  it("merges rapid selection requests and drains one in-flight request before the latest selection", async () => {
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    // Dispatch a burst before the original 180ms debounce expires.
    await page.locator('.trend-selector input').evaluateAll(elements => elements.slice(0, 3).forEach(element => (element as HTMLInputElement).click()))
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.trendRequests[0]!.userIds!.length)).toBe(3)
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).uncheck()
    await choose(4)
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).uncheck()
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => window.followerFixture.maxActiveTrends)).toBe(1)
    expect(await order()).toEqual(["测试用户2", "测试用户3", "测试用户4"])
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(2)
    expect(await page.evaluate(() => window.followerFixture.trendStartedAt[1]! - window.followerFixture.trendFinishedAt[0]!)).toBeGreaterThanOrEqual(110)
    expect(await page.evaluate(() => window.followerFixture.trendRequests.at(-1)!.limitPerUser)).toBe(500)
    expect(await order()).not.toContain("测试用户1")
    expect(await page.evaluate(() => window.followerFixture.maxActiveTrends)).toBe(1)
  })

  it("retains fetched history after errors and never displays an unselected user's late response", async () => {
    await page.evaluate(() => { window.followerFixture.history["2"] = [{ capturedAt: "2026-09-05T02:00:00Z", followerCount: "87654", sourceEndpoint: "history" }] })
    await choose(1)
    await page.locator('.follower-trend-card circle[aria-label*="87,654"]').waitFor()
    await page.evaluate(() => { window.followerFixture.trendError = "趋势读取失败" })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "趋势读取失败" }).waitFor()
    expect(await page.locator('.follower-trend-card circle[aria-label*="87,654"]').count()).toBe(1)
    await page.evaluate(() => { window.followerFixture.trendError = ""; window.followerFixture.holdTrends = true })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendReleases.length)).toBe(1)
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).uncheck()
    await page.getByRole("checkbox", { name: "测试用户2趋势对比" }).check()
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
    await expect.poll(order).toEqual(["测试用户2"])
    expect(await page.locator('.follower-trend-card circle[aria-label*="87,654"]').count()).toBe(0)
  })

  it("does not label a new user's pending request with the previous selection's error", async () => {
    await choose(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    await page.evaluate(() => { window.followerFixture.trendError = "用户1的历史读取失败" })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "用户1的历史读取失败" }).waitFor()
    await page.evaluate(() => { window.followerFixture.trendError = ""; window.followerFixture.holdTrends = true })
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).uncheck()
    await page.getByRole("checkbox", { name: "测试用户2趋势对比" }).check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendReleases.length)).toBe(1)
    expect(await order()).toEqual(["测试用户2"])
    expect(await page.getByRole("alert").count()).toBe(0)
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
  })

  it("keeps the initial summary in view and uses the old trend tab only as a same-page shortcut", async () => {
    await page.setViewportSize({ width: 760, height: 500 })
    await page.reload()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).waitFor()
    expect(await page.locator("main").evaluate(element => element.scrollTop)).toBe(0)
    await choose(1)
    await page.getByRole("button", { name: "展开测试用户1的详情" }).click()
    await page.locator(".follower-settings summary").click()
    await page.getByRole("spinbutton").fill("600")
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    expect(await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).count()).toBe(1)
    expect(await page.getByRole("spinbutton").inputValue()).toBe("600")
    await page.getByRole("button", { name: "查看用户列表", exact: true }).click()
    expect(await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).isChecked()).toBe(true)
    expect(await page.getByRole("spinbutton").inputValue()).toBe("600")
  })

  it("swaps the exact source and target with pointer and keyboard, but ignores tiny movement and cancellation", async () => {
    await choose(3)
    const cards = page.locator(".follower-trend-card")
    await expect.poll(() => cards.count()).toBe(3)
    await cards.first().scrollIntoViewIfNeeded()
    const from = (await cards.first().boundingBox())!, to = (await cards.nth(2).boundingBox())!
    await page.mouse.move(from.x + 20, from.y + 20)
    await page.mouse.down()
    await page.mouse.move(from.x + 24, from.y + 23)
    await page.mouse.up()
    expect(await order()).toEqual(["测试用户1", "测试用户2", "测试用户3"])
    await page.mouse.move(from.x + 20, from.y + 20)
    await page.mouse.down()
    await page.mouse.move(to.x + 30, to.y + 30, { steps: 8 })
    expect(await cards.nth(2).getAttribute("class")).toContain("is-drop-target")
    await page.mouse.up()
    await expect.poll(order).toEqual(["测试用户3", "测试用户2", "测试用户1"])
    await page.getByRole("button", { name: "向前交换测试用户1" }).focus()
    await page.keyboard.press("Enter")
    await expect.poll(order).toEqual(["测试用户3", "测试用户1", "测试用户2"])
    await cards.first().scrollIntoViewIfNeeded()
    const cancelFrom = (await cards.first().boundingBox())!
    await page.mouse.move(cancelFrom.x + 20, cancelFrom.y + 20)
    await page.mouse.down()
    await page.mouse.move(cancelFrom.x + 40, cancelFrom.y + 40)
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })))
    await page.mouse.up()
    expect(await page.locator(".is-dragging, .is-drop-target").count()).toBe(0)
  })

  it("renders readable axes, real time geometry and keyboard point tooltips without stretching small changes", async () => {
    await choose(1)
    // Existing trend tab is retained as a same-page navigation shortcut.
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    const chart = page.locator(".follower-trend-card").first()
    const points = chart.locator(".follower-history-svg circle")
    await points.first().waitFor()
    expect(await chart.locator(".trend-y-axis text").count()).toBeGreaterThan(1)
    const coords = await points.evaluateAll(elements => elements.map(element => ({ x: Number(element.getAttribute("cx")), y: Number(element.getAttribute("cy")) })))
    expect((coords[1]!.x - coords[0]!.x) / (coords[2]!.x - coords[0]!.x)).toBeCloseTo(0.1, 4)
    expect(Math.abs(coords[2]!.y - coords[0]!.y)).toBeLessThan(220)
    await points.first().focus()
    expect(await chart.getByRole("tooltip").textContent()).toContain("120")
    await page.keyboard.press("ArrowRight")
    expect(await chart.getByRole("tooltip").textContent()).toContain("110")
    await page.keyboard.press("Escape")
    expect(await chart.getByRole("tooltip").count()).toBe(0)
  })

  it("stops follow-up queries when unmounted or when the selection is empty", async () => {
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await choose(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendReleases.length)).toBe(1)
    await choose(2)
    await page.getByRole("button", { name: "挂载或卸载粉丝页" }).click()
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
    await page.waitForTimeout(350)
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
    await page.getByRole("button", { name: "挂载或卸载粉丝页" }).click()
    await page.getByRole("button", { name: "展开测试用户1的详情" }).waitFor()
    expect(await page.locator(".follower-trend-card").count()).toBe(0)
    expect(await page.getByText("请选择监控用户", { exact: true }).count()).toBe(1)
  })

  it("clears a pending selection and ignores its late completion without follow-up work", async () => {
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await choose(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends)).toBe(1)
    await choose(2)
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).uncheck()
    await page.getByRole("checkbox", { name: "测试用户2趋势对比" }).uncheck()
    expect(await page.locator(".follower-trend-card").count()).toBe(0)
    expect(await page.locator(".follower-trend-refresh").textContent()).toBe("")
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
    await page.waitForTimeout(1000)
    expect(await page.locator(".follower-trend-card").count()).toBe(0)
    expect(await page.locator(".follower-trend-refresh").textContent()).toBe("")
    expect(await page.evaluate(() => window.followerFixture.trendRequests.length)).toBe(1)
  })

  it("displays all 500 history points for each of four users without creating 2000 keyboard tab stops", async () => {
    const started = performance.now()
    const phase = (label: string) => { if (volumePhases.length < 100) volumePhases.push({ phase: label, ms: Math.round(performance.now() - started) }) }
    volumeObserved = true
    await page.evaluate(() => {
      const events: { phase: string; at: number }[] = [], longtasks: { at: number; duration: number }[] = []
      const event = (phase: string) => { if (events.length < 64) events.push({ phase, at: performance.now() }) }
      const focused = () => event("POINT_FOCUS")
      document.addEventListener("focusin", focused)
      const observer = new MutationObserver(() => { if (document.querySelector('[role="tooltip"]')) event("TOOLTIP_PRESENT") })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      const performanceObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (longtasks.length < 32) longtasks.push({ at: entry.startTime, duration: entry.duration })
      })
      performanceObserver.observe({ type: "longtask", buffered: false })
      Object.assign(window, { volumeObservations: { events, longtasks }, followerProbeObservers: [observer, performanceObserver, { disconnect: () => document.removeEventListener("focusin", focused) }] })
    })
    phase("populate:start")
    await page.evaluate(() => {
      for (const mid of ["2", "3", "4", "5"]) window.followerFixture.history[mid] = Array.from({ length: 500 }, (_, index) => ({
        capturedAt: new Date(Date.parse("2026-09-05T02:00:00Z") + index * 10_000).toISOString(), followerCount: String(100_000 + index), sourceEndpoint: "history"
      }))
    })
    phase("populate:end")
    for (let index = 1; index <= 4; index++) {
      phase(`choose-${index}:start`)
      await page.getByRole("checkbox", { name: `测试用户${index}趋势对比` }).check()
      phase(`choose-${index}:end`)
    }
    const points = page.locator(".follower-history-svg circle")
    await expect.poll(() => points.count()).toBe(2000)
    phase("points:ready")
    phase("tabindex-count:start")
    expect(await page.locator('.follower-history-svg circle[tabindex="0"]').count()).toBe(4)
    phase("tabindex-count:end")
    const first = page.locator(".follower-history-svg").first()
    phase("point-focus:start")
    await first.locator("circle").first().focus()
    phase("point:focused")
    await page.keyboard.press("End")
    phase("key:end")
    phase("end-tooltip:start")
    expect(await page.getByRole("tooltip").textContent()).toContain("100,499")
    phase("end-tooltip:end")
    phase("key-home:start")
    await page.keyboard.press("Home")
    phase("key:home")
    phase("home-tooltip:start")
    expect(await page.getByRole("tooltip").textContent()).toContain("100,000")
    phase("home-tooltip:end")
    expect(await page.evaluate(() => window.followerFixture.trendRequests.every(input => input.limitPerUser === 500))).toBe(true)
    phase("complete")
  })

  it("keeps the original 700ms refreshing and 900ms result hints, cancelling old timers on another refresh", async () => {
    hintObserved = true
    await page.evaluate(() => {
      const indicator = document.querySelector(".follower-trend-refresh")!
      const observations: { text: string; at: number }[] = []
      Object.assign(window, { trendObservations: observations })
      const observer = new MutationObserver(() => { if (observations.length < 64) observations.push({ text: indicator.textContent ?? "", at: performance.now() }) })
      observer.observe(indicator, { childList: true, subtree: true, characterData: true })
      Object.assign(window, { followerProbeObservers: [observer] })
    })
    await choose(1)
    await expect.poll(() => page.locator(".follower-trend-refresh").textContent()).toBe("趋势刷新中")
    await expect.poll(() => page.locator(".follower-trend-refresh").textContent(), { timeout: 1500 }).toBe("趋势已更新")
    await expect.poll(() => page.locator(".follower-trend-refresh").textContent(), { timeout: 1500 }).toBe("")
    const observed = await page.evaluate(() => Reflect.get(window, "trendObservations") as { text: string; at: number }[])
    const started = observed.find(item => item.text === "趋势刷新中")!, done = observed.find(item => item.text === "趋势已更新")!, idle = observed.find(item => item.text === "" && item.at > done.at)!
    expect(done.at - started.at).toBeGreaterThanOrEqual(650)
    expect(idle.at - done.at).toBeGreaterThanOrEqual(850)
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendReleases.length)).toBe(1)
    await page.waitForTimeout(1000)
    expect(await page.locator(".follower-trend-refresh").textContent()).toBe("趋势刷新中")
    await page.evaluate(() => { window.followerFixture.holdTrends = false; window.followerFixture.trendReleases.shift()!() })
    await expect.poll(() => page.locator(".follower-trend-refresh").textContent()).toBe("趋势已更新")
  }, 15_000)

  it("shows recent/known-current fallbacks on first read failure, including zero but not invented snapshots", async () => {
    await page.evaluate(() => {
      window.followerFixture.trendError = "首次历史读取失败"
      window.followerFixture.history = { "2": [], "3": [], "4": [] }
      window.followerFixture.patchUser(1, { recentTrend: [], currentFollowerCount: "0", lastSnapshotAt: "2026-09-05T02:00:00Z" })
      window.followerFixture.patchUser(2, { recentTrend: [], currentFollowerCount: undefined })
    })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await choose(3)
    await page.getByRole("alert").filter({ hasText: "首次历史读取失败" }).waitFor()
    const charts = page.locator(".follower-trend-card")
    expect(await charts.nth(0).locator(".follower-history-svg circle").count()).toBe(3)
    expect(await charts.nth(1).locator(".follower-history-svg circle").count()).toBe(1)
    expect(await charts.nth(1).textContent()).toContain("当前值参考")
    expect(await charts.nth(1).locator(".follower-history-svg circle").getAttribute("aria-label")).toContain("粉丝 0")
    expect(await charts.nth(2).textContent()).toContain("暂无历史快照")
    expect(await charts.nth(2).locator(".follower-history-svg circle").count()).toBe(0)
    await page.evaluate(() => { window.followerFixture.trendError = "" })
    await page.getByRole("button", { name: "重试趋势", exact: true }).click()
    await expect.poll(() => page.getByRole("alert").count()).toBe(0)
    expect(await page.evaluate(() => window.followerFixture.calls.filter(call => call === "refresh").length)).toBe(0)
  })

  it("keeps graph text legible, series colors consistent and controls accessible in light, dark and narrow layouts", async () => {
    await choose(3)
    const board = page.locator(".follower-trend-board")
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendRequests.length)).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends)).toBe(0)
    await expect.poll(() => page.locator(".follower-history-pending").count()).toBe(0)
    const second = page.locator(".follower-trend-card").nth(1)
    expect(await second.locator(".follower-chart-heading span").first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13)
    const colors = await second.evaluate(element => ({ area: getComputedStyle(element.querySelector(".follower-trend-area")!).fill,
      line: getComputedStyle(element.querySelector(".trend-data-line")!).stroke,
      background: getComputedStyle(element).backgroundColor }))
    expect(colors.area).toBe(colors.line)
    expect(colors.background).toBe("rgb(255, 255, 255)")
    expect((await second.getByRole("button").first().boundingBox())!.height).toBeGreaterThanOrEqual(40)
    await board.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/m06-trends-light.png", import.meta.url)), animations: "disabled" })
    await page.evaluate(() => document.querySelector("main")!.classList.remove("theme-light"))
    await board.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/m06-trends-dark.png", import.meta.url)), animations: "disabled" })
    await page.setViewportSize({ width: 760, height: 1000 })
    const cards = page.locator(".follower-trend-card")
    expect((await cards.nth(1).boundingBox())!.x).toBe((await cards.first().boundingBox())!.x)
    expect(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    // Keep the narrow width, but expose the whole scroll container for the evidence image.
    await page.setViewportSize({ width: 760, height: 2200 })
    await board.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/m06-trends-narrow.png", import.meta.url)), animations: "disabled" })
  })
})
