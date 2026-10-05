import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

describe("original live trend board", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  const roomId = (index: number) => `018f0f39-7b5e-7cc1-962d-${String(index).padStart(12, "0")}`
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-live-trend-test"), plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/live-workspace.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    page.setDefaultTimeout(3000)
    // Vite may still be optimizing local modules; the heading below is the UI readiness signal.
    await page.goto(url, { waitUntil: "commit" })
    await page.getByRole("heading", { name: "测试主播1", exact: true }).waitFor({ timeout: 15_000 })
  })
  afterEach(async () => { await page?.close() })

  it("loads latest 500 samples on the room page and preserves the same board between tabs", async () => {
    await page.getByRole("heading", { name: "在线/热度趋势", exact: true }).waitFor()
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.at(-1)?.limitPerRoom)).toBe(500)
    expect(await page.locator(".live-chart-heading h3").allTextContents()).toEqual(["测试主播2"])
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    expect(await page.locator(".live-chart-heading h3").allTextContents()).toEqual(["测试主播2"])
    await page.getByText("最近500次采集 · 各图独立缩放", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "refresh"))).toEqual([])
  })

  it("keeps selection order and original one/two/three/four layouts and heights", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    const heights = () => page.locator(".live-trend-chart").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
    await expect.poll(heights).toEqual([420])
    await page.getByRole("checkbox", { name: "测试主播4", exact: true }).check()
    await expect.poll(heights).toEqual([320, 320])
    await page.getByRole("checkbox", { name: "测试主播1", exact: true }).check()
    await expect.poll(heights).toEqual([420, 200, 200])
    expect(await page.locator(".live-chart-heading h3").allTextContents()).toEqual(["测试主播2", "测试主播4", "测试主播1"])
    const boxes = await page.locator(".live-chart-card").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width }
    }))
    expect(boxes[0]!.width).toBeGreaterThan(boxes[1]!.width)
    expect(boxes[1]!.x).toBe(boxes[2]!.x)
    expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y)
    await page.getByRole("checkbox", { name: "测试主播3", exact: true }).check()
    await expect.poll(heights).toEqual([240, 240, 240, 240])
    expect(await page.getByRole("checkbox", { name: "测试主播5", exact: true }).isDisabled()).toBe(true)
  })

  it("uses real time spacing, axes and visible keyboard and pointer tooltips", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    const svg = page.locator(".live-history-svg")
    await svg.waitFor()
    const xs = await svg.locator("circle").evaluateAll(elements => elements.map(element => Number(element.getAttribute("cx"))))
    expect((xs[1]! - xs[0]!) / (xs[2]! - xs[0]!)).toBeCloseTo(.1)
    expect(await svg.locator(".live-trend-y-axis text").count()).toBeGreaterThan(2)
    await svg.locator("circle").first().focus()
    await page.getByRole("tooltip").getByText("100", { exact: true }).waitFor()
    await page.keyboard.press("End")
    await page.getByRole("tooltip").getByText("80", { exact: true }).waitFor()
    await page.keyboard.press("ArrowLeft")
    await page.getByRole("tooltip").getByText("90", { exact: true }).waitFor()
    await page.keyboard.press("Escape")
    expect(await page.getByRole("tooltip").count()).toBe(0)
    await svg.locator("circle").first().hover()
    await page.getByRole("tooltip").getByText("100", { exact: true }).waitFor()
  })

  it("retains precise compact format in ticks and tooltip", async () => {
    await page.evaluate(async () => {
      window.liveFixture.updateRoom(1, { onlineCount: 10023, recentTrend: [10013, 10023].map((onlineCount, index) => ({
        roomId: "121", uid: "21", capturedAt: `2026-09-05T02:0${index}:00.000Z`, liveStatus: 1,
        onlineCount, sourceEndpoint: "room/v1/Room/get_info" })) })
      await window.liveFixture.reload()
    })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".live-history-svg circle").last().focus()
    await page.getByRole("tooltip").getByText("1.002万", { exact: true }).waitFor()
    await page.getByRole("tooltip").getByText("原始值 10,023", { exact: true }).waitFor()
  })

  it("falls back through recent/current/empty without writing invented history", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.evaluate(async id => { window.liveFixture.trendPoints[id] = []; await window.liveFixture.reload() }, roomId(1))
    await page.getByText("房间近期快照", { exact: true }).waitFor()
    expect(await page.locator(".live-history-svg circle").count()).toBe(3)
    await page.evaluate(async () => {
      window.liveFixture.updateRoom(1, { recentTrend: [], onlineCount: 0 }); await window.liveFixture.reload()
    })
    await page.getByText("当前值参考（非新增历史）", { exact: true }).waitFor()
    expect(await page.locator(".live-history-svg circle").count()).toBe(1)
    await page.getByText("至少需要2次采集形成趋势。", { exact: true }).waitFor()
    await page.evaluate(async () => { window.liveFixture.updateRoom(1, { onlineCount: undefined }); await window.liveFixture.reload() })
    await page.getByText("暂无历史快照或当前热度", { exact: true }).waitFor()
    expect(await page.locator(".live-history-svg circle").count()).toBe(0)
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "refresh"))).toEqual([])
  })

  it("draws missing heat as display zero but marks the original value as missing", async () => {
    await page.evaluate(async () => { window.liveFixture.missingHeat(); await window.liveFixture.reload() })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    const points = page.locator(".live-history-svg circle")
    await expect.poll(() => points.count()).toBe(3)
    await points.nth(1).focus()
    await page.getByRole("tooltip").getByText("原始值缺失，按原页面以0绘制", { exact: true }).waitFor()
    expect(await points.nth(1).getAttribute("class")).toContain("is-missing")
    expect(await page.evaluate(() => window.liveFixture.trendPoints)).toEqual({})
  })

  it("merges quick selection changes into one request after 180ms", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBeGreaterThan(0)
    await page.clock.install()
    await page.clock.pauseAt(await page.evaluate(() => Date.now()))
    await page.evaluate(() => { window.liveFixture.trendRequests = [] })
    await page.getByRole("checkbox", { name: "测试主播4", exact: true }).check()
    await page.clock.runFor(50)
    await page.getByRole("checkbox", { name: "测试主播1", exact: true }).check()
    await page.clock.runFor(179)
    expect(await page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(0)
    await page.clock.runFor(1)
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(1)
    const requests = await page.evaluate(() => window.liveFixture.trendRequests)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.roomMonitorIds).toEqual([roomId(1), roomId(3), roomId(0)])
  })

  it("restarts an obsolete in-flight read after reread and ignores its late result", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByText("历史快照", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.holdTrends = true; window.liveFixture.trendRequests = [] })
    await page.getByRole("button", { name: "刷新监控数据", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(1)
    await page.evaluate(id => { window.liveFixture.trendPoints[id] = [{ roomId: "121", uid: "21", liveStatus: 1,
      capturedAt: "2026-09-05T03:00:00.000Z", onlineCount: 400, sourceEndpoint: "room/v1/Room/get_info" }] }, roomId(1))
    await page.getByRole("button", { name: "刷新监控数据", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(2)
    await page.evaluate(() => window.liveFixture.releaseTrend(1))
    await expect.poll(() => page.locator(".live-history-svg circle").count()).toBe(1)
    await page.evaluate(() => window.liveFixture.releaseTrend(0))
    await page.locator(".live-history-svg circle").focus()
    await page.getByRole("tooltip").getByText("400", { exact: true }).waitFor()
    expect(await page.locator(".live-history-svg circle").count()).toBe(1)
  })

  it("debounces a selection returning to an already requested key for a full 180ms", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByText("历史快照", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.holdTrends = true })
    const checkbox = page.getByRole("checkbox", { name: "测试主播4", exact: true })
    await checkbox.check()
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.at(-1)?.roomMonitorIds?.length)).toBe(2)
    await page.clock.install()
    await page.clock.pauseAt(await page.evaluate(() => Date.now()))
    await checkbox.uncheck()
    await page.clock.runFor(50)
    await page.evaluate(() => { window.liveFixture.trendRequests = [] })
    await checkbox.check()
    await page.clock.runFor(179)
    expect(await page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(0)
    await page.clock.runFor(1)
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(1)
  })

  it("refreshes a fresh cached trend after each successful room reread", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByText("历史快照", { exact: true }).waitFor()
    await page.evaluate(id => { window.liveFixture.trendPoints[id] = [{ roomId: "121", uid: "21", liveStatus: 1,
      capturedAt: "2026-09-05T03:00:00.000Z", onlineCount: 500, sourceEndpoint: "room/v1/Room/get_info" }] }, roomId(1))
    await page.getByRole("button", { name: "刷新监控数据", exact: true }).click()
    await expect.poll(() => page.locator(".live-history-svg circle").count()).toBe(1)
    await page.locator(".live-history-svg circle").focus()
    await page.getByRole("tooltip").getByText("500", { exact: true }).waitFor()
  })

  it("keeps chart text and tooltips inside narrow light/dark layouts", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByRole("checkbox", { name: "测试主播4", exact: true }).check()
    await page.getByRole("checkbox", { name: "测试主播1", exact: true }).check()
    const board = page.locator(".live-trend-board")
    await board.waitFor()
    expect(await board.locator(".live-chart-source").first().evaluate(element => getComputedStyle(element).fontSize)).toBe("14px")
    await board.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-trend-light.png") })
    await page.evaluate(() => document.querySelector("main")!.classList.remove("theme-light"))
    await board.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-trend-dark.png") })
    await page.evaluate(async () => {
      document.querySelector("main")!.classList.add("theme-light")
      window.liveFixture.updateRoom(1, { uname: "LongLiveRoomName".repeat(14) }); await window.liveFixture.reload()
    })
    for (const width of [900, 620, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      await expect.poll(() => board.evaluate(element => {
        if (element.scrollWidth <= element.clientWidth) return []
        const right = element.getBoundingClientRect().right
        return [...element.querySelectorAll("*")].filter(child => child.getBoundingClientRect().right > right + 1)
          .map(child => ({ tag: child.tagName, class: child.getAttribute("class"), width: child.getBoundingClientRect().width }))
      })).toEqual([])
      const chart = page.locator(".live-trend-chart").first()
      expect(await page.locator(".live-chart-heading h3").first().evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(54)
      await chart.locator("circle").last().focus()
      const box = await chart.boundingBox(), tooltip = await page.getByRole("tooltip").boundingBox()
      expect(tooltip!.x).toBeGreaterThanOrEqual(box!.x)
      expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(box!.x + box!.width + 1)
      expect(await chart.locator("text").first().evaluate(element => getComputedStyle(element).fontSize)).toBe("14px")
    }
    await board.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-trend-narrow.png") })
  })
})
