import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"

type SetupProbe = {
  startedAt: number
  finished: boolean
  phases: { phase: string; ms: number }[]
  pendingResources: Map<Request, string>
  pendingResourceCount: number
  resourceFailures: { kind: "requestfailed" | "response"; pathname: string; status?: number }[]
  failureCount: number
  maxLag: number
  lagSamples: number[]
}
const documentPath = "/__fixtures__/live-data-widget.html"

function recordSetupPhase(probe: SetupProbe, phase: string): void {
  if (probe.phases.length < 100) probe.phases.push({ phase, ms: Math.round(performance.now() - probe.startedAt) })
}

function watchSetupResources(setupPage: Page, probe: SetupProbe): void {
  setupPage.on("request", request => {
    if (new URL(request.url()).pathname === documentPath) recordSetupPhase(probe, "DOCUMENT_REQUEST")
    probe.pendingResourceCount++
    if (probe.pendingResources.size < 100) probe.pendingResources.set(request, new URL(request.url()).pathname.slice(0, 256))
  })
  setupPage.on("requestfinished", request => {
    if (new URL(request.url()).pathname === documentPath) recordSetupPhase(probe, "DOCUMENT_FINISHED")
    probe.pendingResourceCount--
    probe.pendingResources.delete(request)
  })
  setupPage.on("requestfailed", request => {
    probe.pendingResourceCount--
    probe.pendingResources.delete(request)
    probe.failureCount++
    if (probe.resourceFailures.length < 100) probe.resourceFailures.push({
      kind: "requestfailed", pathname: new URL(request.url()).pathname.slice(0, 256)
    })
  })
  setupPage.on("response", response => {
    const status = response.status()
    if (new URL(response.url()).pathname === documentPath) recordSetupPhase(probe, `DOCUMENT_RESPONSE_${status}`)
    if (status < 400) return
    probe.failureCount++
    if (probe.resourceFailures.length < 100) probe.resourceFailures.push({
      kind: "response", pathname: new URL(response.url()).pathname.slice(0, 256), status
    })
  })
}

describe("shared original live data widget in real desktop pages", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  let setupProbe: SetupProbe
  let navigationSampler: ReturnType<typeof setInterval> | undefined
  const stopNavigationSampler = () => { clearInterval(navigationSampler); navigationSampler = undefined }
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("widget", "beforeAll")
    suiteStartup = startup
    server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-widget-test"), plugins: [react(), {
        name: "test-document-boundary",
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.split("?")[0] === documentPath && setupProbe) {
              const probe = setupProbe
              recordSetupPhase(probe, "DOCUMENT_SERVER_ENTER")
              response.once("finish", () => recordSetupPhase(probe, "DOCUMENT_SERVER_FINISH"))
              response.once("close", () => recordSetupPhase(probe, "DOCUMENT_SERVER_CLOSE"))
            }
            next()
          })
        }
      }],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
    await startup.run("server.listen", () => server.listen())
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/live-data-widget.html`
    browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
  }, 30000)
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    try { stopNavigationSampler(); await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()) }
    finally { startup?.finish() }
  })
  beforeEach(async () => {
    const startup = createBrowserStartupObserver("widget", "beforeEach")
    pageStartup = startup
    const probe: SetupProbe = {
      startedAt: performance.now(), finished: false, phases: [], pendingResources: new Map(), pendingResourceCount: 0,
      resourceFailures: [], failureCount: 0, maxLag: 0, lagSamples: []
    }
    setupProbe = probe
    recordSetupPhase(probe, "page:create")
    const setupPage = await startup.run("page.create", () => browser.newPage({ viewport: { width: 1500, height: 1100 } }))
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    recordSetupPhase(probe, "page:created")
    if (probe.finished) console.warn("Late live data widget setup page created", { phases: probe.phases })
    watchSetupResources(setupPage, probe)
    page.setDefaultTimeout(2500)
    // Synthetic rank avatars must never escape the local fixture server.
    recordSetupPhase(probe, "route:start")
    await startup.run("page.route", () => page.route("**/*", async route => {
      const document = new URL(route.request().url()).pathname === documentPath
      if (document) recordSetupPhase(probe, "DOCUMENT_ROUTE_ENTER")
      if (new URL(route.request().url()).origin === new URL(url).origin) {
        await route.continue()
        if (document) recordSetupPhase(probe, "DOCUMENT_ROUTE_CONTINUED")
      } else await route.abort()
    }))
    recordSetupPhase(probe, "route:ready")
    recordSetupPhase(probe, "clock:start")
    await startup.run("page.clock", () => page.clock.install())
    recordSetupPhase(probe, "clock:ready")
    // Vite may still be optimizing local modules; the heading below is the UI readiness signal.
    recordSetupPhase(probe, "navigate:start")
    let previousSample = performance.now()
    navigationSampler = setInterval(() => {
      const now = performance.now(), lag = Math.max(0, now - previousSample - 100)
      previousSample = now
      probe.maxLag = Math.max(probe.maxLag, Math.round(lag))
      if (lag > 100 && probe.lagSamples.length < 16) probe.lagSamples.push(Math.round(lag))
    }, 100)
    try { await startup.run("page.goto", () => page.goto(url, { waitUntil: "commit" })) } finally { stopNavigationSampler() }
    recordSetupPhase(probe, "navigate:committed")
    await startup.run("page.visible", () => page.getByRole("heading", { name: "合成工作台", exact: true }).waitFor({ timeout: 15000 }))
    recordSetupPhase(probe, "heading-ready")
  })
  afterEach(async ({ task }) => {
    const startup = pageStartup; startup?.stop()
    try {
    stopNavigationSampler()
    setupProbe.finished = true
    if (task.result?.state === "fail") console.warn("Live data widget fixture setup", {
      phases: setupProbe.phases, pendingResourceCount: setupProbe.pendingResourceCount,
      pendingResources: [...setupProbe.pendingResources.values()], failureCount: setupProbe.failureCount,
      resourceFailures: setupProbe.resourceFailures, maxLag: setupProbe.maxLag, lagSamples: setupProbe.lagSamples
    })
    await startup.run("page.close", () => page?.close())
    } finally { startup?.finish() }
  })

  it("offers the 505th live room in the actual subject binding drawer", async () => {
    await page.evaluate(() => window.widgetFixture.expandRoomList())
    await page.getByRole("button", { name: "绑定资源", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "绑定 B站监控资源" })
    const selector = dialog.getByRole("combobox", { name: "直播间监控", exact: true })
    await selector.click()
    await expect.poll(() => dialog.getByRole("listbox", { name: "直播间监控", exact: true }).getByRole("option").count()).toBe(506)
    await dialog.getByRole("option", { name: "合成房间505 · 房间 537", exact: true }).click()
    expect(await selector.inputValue()).toBe("合成房间505 · 房间 537")
  })

  it("polls 60 real messages with sender UID, watched count and preserves them across metadata refresh", async () => {
    await expect.poll(() => page.locator(".subject-danmu-list > div").count()).toBe(60)
    expect(await page.locator(".subject-danmu-list").innerText()).toContain("游客 · UID 100")
    expect(await page.locator(".subject-danmu-metrics").innerText()).toContain("看过人数\n1.2万")
    expect(await page.locator(".subject-danmu-metrics").innerText()).toContain("+3")
    await page.evaluate(() => window.widgetFixture.metadata())
    expect(await page.locator(".subject-danmu-list > div").count()).toBe(60)
    expect(await page.evaluate(() => window.widgetFixture.recentRequests.every(item => item.limit === 60))).toBe(true)
  })

  it("sorts current snapshots, remembers each family and refreshes the selected rank with four pages", async () => {
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByRole("tab", { name: "日榜", exact: true }).click()
    expect(await page.getByRole("tab", { name: "日榜", exact: true }).count()).toBe(1)
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("高贡献")
    expect(await page.locator(".subject-rank-list > div").count()).toBe(100)
    await page.getByRole("button", { name: "降序", exact: true }).click()
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("低贡献")
    await page.getByRole("tab", { name: "大航海 舰长" }).click()
    await page.getByRole("tab", { name: "陪伴榜", exact: true }).click()
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("365 天")
    await page.getByRole("tab", { name: "周榜", exact: true }).click()
    expect(await page.locator(".subject-rank-list").innerText()).toContain("上期TOP")
    expect(await page.locator(".subject-rank-list").innerText()).toContain("舰长")
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    expect(await page.getByRole("tab", { name: "日榜", exact: true }).getAttribute("aria-selected")).toBe("true")
    expect(await page.getByRole("button", { name: "升序", exact: true }).count()).toBe(1)
    await page.getByRole("button", { name: "刷新榜单", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.widgetFixture.rankRequests.at(-1))).toMatchObject({
      families: ["AUDIENCE"], types: ["today_rank"], maxPages: 4, force: true
    })
    await page.evaluate(() => window.widgetFixture.metadata())
    expect(await page.getByRole("tab", { name: "日榜", exact: true }).getAttribute("aria-selected")).toBe("true")
    await page.evaluate(async () => { window.widgetFixture.preciseRanks = true; await window.widgetFixture.reload() })
    await expect.poll(() => page.locator(".subject-rank-list > div").count()).toBe(2)
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("低贡献")
    expect(await page.locator(".subject-rank-list > div").first().locator("b").getAttribute("title")).toBe("9,007,199,254,740,992")
    await page.getByRole("button", { name: "升序", exact: true }).click()
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("高贡献")
    expect(await page.locator(".subject-rank-list > div").first().locator("b").getAttribute("title")).toBe("9,007,199,254,740,993")
  })

  it("shows offline listening and awaits explicit protocol start and stop without duplicate actions", async () => {
    await page.evaluate(async () => { window.widgetFixture.empty = true; await window.widgetFixture.reload() })
    await page.getByText("未开播，弹幕通道监听中", { exact: true }).waitFor()
    await page.evaluate(() => { window.widgetFixture.hold = true })
    await page.getByRole("button", { name: "停止弹幕监控", exact: true }).click()
    expect(await page.getByRole("button", { name: "正在处理…", exact: true }).isDisabled()).toBe(true)
    await page.evaluate(() => { window.widgetFixture.hold = false; window.widgetFixture.release() })
    await page.getByText("弹幕监听已停止", { exact: true }).waitFor()
    await page.getByRole("combobox", { name: "弹幕协议版本" }).selectOption("2")
    await page.getByRole("button", { name: "手动开启未开播监控", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.widgetFixture.starts.at(-1)?.protocolVersion)).toBe(2)
    await page.getByRole("button", { name: "停止弹幕监控", exact: true }).waitFor()
    expect(await page.evaluate(() => window.widgetFixture.stops.length)).toBe(1)
  })

  it("keeps stale snapshots visible on refresh failure and reports partial results", async () => {
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByText("高贡献", { exact: true }).waitFor()
    await page.evaluate(() => { window.widgetFixture.rankError = "合成断网" })
    await page.getByRole("button", { name: "刷新榜单", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "合成断网" }).waitFor()
    expect(await page.getByText("高贡献", { exact: true }).count()).toBe(1)
    await page.evaluate(() => { window.widgetFixture.rankError = ""; window.widgetFixture.partial = true })
    await page.getByRole("button", { name: "刷新榜单", exact: true }).click()
    await page.getByText("榜单已刷新 1 项，1 项失败", { exact: true }).waitFor()
  })

  it("exposes the same three modes in live-room details and isolates room selection", async () => {
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    await page.getByRole("region", { name: "合成房间1房间详情" }).waitFor()
    await page.getByText("房间一消息59-0", { exact: true }).waitFor()
    await page.getByRole("tab", { name: "大航海 舰长" }).click()
    await page.getByRole("tab", { name: "陪伴榜", exact: true }).click()
    expect(await page.locator(".subject-rank-list > div").first().innerText()).toContain("365 天")
    await page.getByRole("button", { name: "展开合成房间2的详情", exact: true }).click()
    await page.getByText("房间二消息59-0", { exact: true }).waitFor()
    expect(await page.getByText("房间一消息59-0", { exact: true }).count()).toBe(0)
    await page.getByRole("button", { name: "收起合成房间2的详情", exact: true }).click()
    expect(await page.getByRole("tablist", { name: "直播间数据视图" }).count()).toBe(0)
  })

  it("disables polling without leaking cached messages when the module is disabled", async () => {
    await page.getByText("房间一消息59-0", { exact: true }).waitFor()
    await page.evaluate(async () => { window.widgetFixture.enabled = false; await window.widgetFixture.metadata() })
    await page.getByText("弹幕模块未启用", { exact: true }).waitFor()
    expect(await page.locator(".subject-danmu-list > div").count()).toBe(0)
    const count = await page.evaluate(() => window.widgetFixture.recentRequests.length)
    await page.clock.runFor(4100)
    expect(await page.evaluate(() => window.widgetFixture.recentRequests.length)).toBe(count)
    await page.evaluate(async () => { window.widgetFixture.enabled = true; window.widgetFixture.bound = false; await window.widgetFixture.metadata() })
    await page.getByText("需要先绑定直播间监控", { exact: true }).waitFor()
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    expect(await page.getByRole("button", { name: "刷新榜单", exact: true }).isDisabled()).toBe(true)
    expect(await page.evaluate(() => window.widgetFixture.recentRequests.length)).toBe(count)
  })

  it("discards delayed danmaku responses after changing the bound room", async () => {
    await page.getByText("房间一消息59-0", { exact: true }).waitFor()
    const count = await page.evaluate(() => window.widgetFixture.recentRequests.length)
    await page.evaluate(() => { window.widgetFixture.holdRead = true; void window.widgetFixture.reload() })
    await expect.poll(() => page.evaluate(() => window.widgetFixture.recentRequests.length)).toBeGreaterThan(count)
    await page.evaluate(async () => {
      window.widgetFixture.holdRead = false
      window.widgetFixture.roomId = "018f0f39-7b5e-4cc1-862d-000000000001"
      await window.widgetFixture.metadata()
    })
    await page.getByText("房间二消息59-0", { exact: true }).waitFor()
    await page.evaluate(() => window.widgetFixture.release())
    await page.clock.runFor(2100)
    expect(await page.getByText("房间一消息59-0", { exact: true }).count()).toBe(0)
    expect(await page.getByText("房间二消息59-0", { exact: true }).count()).toBe(1)
  })

  it("pauses auto-scroll while reading and resumes when the pointer leaves", async () => {
    const list = page.locator(".subject-danmu-list")
    await page.getByText("房间一消息59-0", { exact: true }).waitFor()
    await page.mouse.move(1, 1)
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await list.hover()
    await list.evaluate(element => { element.scrollTop = 0 })
    await page.evaluate(async () => { window.widgetFixture.revision = 1; await window.widgetFixture.reload() })
    await page.getByText("房间一消息59-1", { exact: true }).waitFor()
    await page.clock.runFor(150)
    expect(await list.evaluate(element => element.scrollTop)).toBe(0)
    await page.mouse.move(1, 1)
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  })

  it("keeps the last danmaku on poll failure and recovers the action after an error", async () => {
    await page.getByText("房间一消息59-0", { exact: true }).waitFor()
    await page.evaluate(async () => { window.widgetFixture.requestError = "合成弹幕断网"; await window.widgetFixture.reload() })
    await page.getByRole("alert").filter({ hasText: "弹幕更新失败" }).waitFor()
    expect(await page.locator(".subject-danmu-list > div").count()).toBe(60)
    await page.getByRole("button", { name: "停止弹幕监控", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: /^合成弹幕断网$/ }).waitFor()
    expect(await page.getByRole("button", { name: "停止弹幕监控", exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => { window.widgetFixture.requestError = "" })
    await page.getByRole("button", { name: "停止弹幕监控", exact: true }).click()
    await page.getByRole("button", { name: "手动开启未开播监控", exact: true }).waitFor()
    await page.getByRole("button", { name: "手动开启未开播监控", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.widgetFixture.starts.length)).toBe(1)
    expect(await page.evaluate(() => Object.hasOwn(window.widgetFixture.starts[0]!, "protocolVersion"))).toBe(false)
  })

  it("sorts entry order and falls back from a broken rank avatar", async () => {
    await page.route("https://avatar.invalid/**", route => route.abort())
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByRole("tab", { name: "进房", exact: true }).click()
    const first = page.locator(".subject-rank-list > div").first()
    expect(await first.innerText()).toContain("低贡献")
    expect(await first.innerText()).toContain("在房")
    await expect.poll(() => first.locator("img").count()).toBe(0)
    expect(await first.locator("span").innerText()).toBe("低")
    await page.getByRole("button", { name: "降序", exact: true }).click()
    expect(await first.innerText()).toContain("普通99")
    await page.getByRole("combobox", { name: "榜单排序方式" }).selectOption("monthly_rank:current_month_rank")
    expect(await page.getByRole("tab", { name: "月榜", exact: true }).getAttribute("aria-selected")).toBe("true")
    expect(await first.innerText()).toContain("高贡献")
  })

  it("does not let an in-flight rank refresh replace the newly bound room", async () => {
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByRole("tab", { name: "日榜", exact: true }).click()
    await page.evaluate(() => { window.widgetFixture.hold = true })
    await page.getByRole("button", { name: "刷新榜单", exact: true }).click()
    expect(await page.getByRole("button", { name: "刷新中…", exact: true }).isDisabled()).toBe(true)
    await page.evaluate(async () => {
      window.widgetFixture.roomId = "018f0f39-7b5e-4cc1-862d-000000000001"
      window.widgetFixture.noRanks = true
      await window.widgetFixture.metadata()
    })
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByText("暂无房间观众快照", { exact: true }).waitFor()
    await page.evaluate(() => {
      window.widgetFixture.noRanks = false; window.widgetFixture.hold = false; window.widgetFixture.release()
    })
    await page.clock.runFor(200)
    expect(await page.getByText("暂无房间观众快照", { exact: true }).count()).toBe(1)
    await page.getByRole("button", { name: "刷新榜单", exact: true }).click()
    await page.getByRole("tab", { name: "日榜", exact: true }).waitFor()
    expect(await page.evaluate(() => window.widgetFixture.rankRequests.at(-1)?.roomMonitorId)).toBe("018f0f39-7b5e-4cc1-862d-000000000001")
  })

  it("renders the shared light-theme widget with readable rank controls", async () => {
    await page.getByRole("tab", { name: "大航海 舰长" }).click()
    await page.getByRole("tab", { name: "陪伴榜", exact: true }).click()
    const widget = page.getByRole("article", { name: "直播间弹幕监控" })
    expect(await widget.evaluate(element => getComputedStyle(element).getPropertyValue("--panel-soft").trim())).toBe("#fff7fa")
    await widget.screenshot({ path: resolve(process.env.TEMP!, "bmd-shared-live-widget.png") })
    await page.setViewportSize({ width: 650, height: 1000 })
    expect(await widget.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  })

  it("reads the latest persisted ranks when reopening a previously visited room", async () => {
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByText("高贡献", { exact: true }).waitFor()
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    await page.evaluate(() => { window.widgetFixture.revision = 1 })
    await page.getByRole("button", { name: "查看工作台", exact: true }).click()
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByText("更新后的高贡献1", { exact: true }).waitFor()
  })

  it("retries an initial snapshot read on reentering rank mode without crawling the platform", async () => {
    await page.evaluate(() => { window.widgetFixture.rankError = "首次读取失败" })
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByRole("alert").filter({ hasText: "首次读取失败" }).waitFor()
    await page.getByRole("tab", { name: "弹幕 实时流" }).click()
    await page.evaluate(() => { window.widgetFixture.rankError = "" })
    await page.getByRole("tab", { name: "房间观众 榜单" }).click()
    await page.getByText("高贡献", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.widgetFixture.rankRequests.length)).toBe(0)
  })

})
