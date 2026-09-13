import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

describe("original live loadAll and overview", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-live-overview-test"), plugins: [react()],
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
    page.setDefaultTimeout(2500)
    await page.goto(url)
    await page.getByRole("heading", { name: "测试主播1", exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBeGreaterThan(0)
  })
  afterEach(async () => { await page?.close() })
  const refresh = () => page.getByRole("button", { name: "刷新监控数据" }).click()
  const roomNames = () => page.locator(".live-room-card h3").allTextContents()
  async function changeProjection() {
    await page.evaluate(() => {
      window.liveFixture.updateRoom(0, { uname: "更新后的主播", intervalSeconds: 600 })
      window.liveFixture.summaryValues = { liveRooms: 3, totalOnlineCount: 50000, todayLiveStarts: 8 }
      window.liveFixture.setEvents([{ id: crypto.randomUUID(), monitorId: "018f0f39-7b5e-7cc1-962d-000000000000",
        uid: "20", roomId: "120", eventType: "TITLE_CHANGED", titleBefore: "原始标题", titleAfter: "整体更新标题", occurredAt: new Date().toISOString() }])
    })
  }

  it.each(["rooms", "summary", "events"] as const)("does not publish partial success while %s is delayed", async kind => {
    await changeProjection()
    await page.evaluate(value => { window.liveFixture.holdOverview = value }, kind)
    await refresh()
    await expect.poll(() => page.evaluate(() => window.liveFixture.overviewHeldCount)).toBe(1)
    expect(await roomNames()).toContain("测试主播1")
    expect(await page.locator(".live-summary-card strong").first().textContent()).toBe("1")
    expect(await page.getByText("整体更新标题", { exact: false }).count()).toBe(0)
    await page.evaluate(() => { window.liveFixture.holdOverview = undefined; window.liveFixture.releaseOverview(0) })
    await page.getByRole("heading", { name: "更新后的主播", exact: true }).waitFor()
    await expect.poll(() => page.locator(".live-summary-card strong").first().textContent()).toBe("3")
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    await page.getByText("原始标题 → 整体更新标题", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.eventLimits.every(limit => limit === 20))).toBe(true)
  })

  it.each(["listError", "summaryError", "eventsError"] as const)("preserves all three old projections when %s fails", async key => {
    await changeProjection()
    await page.evaluate(value => { window.liveFixture[value] = "整体读取失败" }, key)
    await refresh()
    await page.getByRole("alert").filter({ hasText: "整体读取失败" }).waitFor()
    expect(await roomNames()).toContain("测试主播1")
    expect(await page.locator(".live-summary-card strong").first().textContent()).toBe("1")
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    expect(await page.locator(".live-event-list article").count()).toBe(0)
    await page.getByText("保留上次完整读取的数据", { exact: false }).waitFor()
    await page.evaluate(value => { window.liveFixture[value] = "" }, key)
    await refresh()
    await page.getByRole("alert").waitFor({ state: "detached" })
    await expect.poll(() => page.locator(".live-summary-card strong").first().textContent()).toBe("3")
  })

  it("only normalizes clear selection and interval drafts after a complete successful reread", async () => {
    await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).fill("600")
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByRole("checkbox", { name: "测试主播2", exact: true }).uncheck()
    await page.getByText("尚未选择直播间", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.updateFirst(600); window.liveFixture.summaryError = "汇总失败" })
    const requests = await page.evaluate(() => window.liveFixture.trendRequests.length)
    await refresh()
    await page.getByRole("alert").filter({ hasText: "汇总失败" }).waitFor()
    expect(await page.getByRole("checkbox", { name: "测试主播2", exact: true }).isChecked()).toBe(false)
    expect(await page.evaluate(() => window.liveFixture.trendRequests.length)).toBe(requests)
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    expect(await page.getByRole("spinbutton", { name: "采集间隔（未保存）", exact: true }).inputValue()).toBe("600")
    await page.evaluate(() => { window.liveFixture.summaryError = "" })
    await refresh()
    await expect.poll(() => page.getByRole("button", { name: "已选趋势", exact: true }).count()).toBe(1)
    expect(await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).inputValue()).toBe("600")
  })

  it("distinguishes a failed first load from empty rooms or events and can retry", async () => {
    await page.goto(`${url}?summary-failure`)
    await page.getByRole("alert").filter({ hasText: "首次汇总读取失败" }).waitFor()
    expect(await roomNames()).toEqual([])
    await page.getByText("未能读取直播监控数据", { exact: true }).waitFor()
    expect(await page.locator(".live-summary-card strong").allTextContents()).toEqual(["—", "—", "—", "—"])
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    expect(await page.getByText("暂无状态事件", { exact: true }).count()).toBe(0)
    await page.evaluate(() => { window.liveFixture.summaryError = "" })
    await refresh()
    await page.getByText("暂无状态事件", { exact: true }).waitFor()
  })

  it("does not publish an updated room or lose a saved interval when its reread fails", async () => {
    await page.evaluate(() => { window.liveFixture.summaryError = "汇总暂不可用" })
    await page.getByRole("button", { name: "暂停监控", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "汇总暂不可用" }).waitFor()
    expect(await page.getByRole("button", { name: "暂停监控", exact: true }).count()).toBe(1)
    await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).fill("600")
    await page.getByRole("button", { name: "保存修改", exact: true }).click()
    await expect.poll(() => page.getByRole("button", { name: "已保存", exact: true }).isDisabled()).toBe(true)
    expect(await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).inputValue()).toBe("600")
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "settings" || call === "status"))).toEqual(["status", "settings"])
    await page.evaluate(() => { window.liveFixture.summaryError = "" })
    await refresh()
    await page.getByRole("button", { name: "恢复监控", exact: true }).waitFor()
  })

  it("closes a successfully submitted add form without optimistically inserting a room after reread failure", async () => {
    await page.evaluate(() => { window.liveFixture.eventsError = "事件暂不可用" })
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    await page.getByPlaceholder("例如 6 或 21987615").fill("600")
    await page.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "事件暂不可用" }).waitFor()
    expect(await page.locator(".live-add-panel").count()).toBe(0)
    expect(await roomNames()).toHaveLength(5)
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "add").length)).toBe(1)
    await page.evaluate(() => { window.liveFixture.eventsError = "" })
    await refresh()
    await expect.poll(roomNames).toHaveLength(6)
    await page.getByRole("region", { name: "新主播6房间详情", exact: true }).waitFor()
  })

  it("discards a pre-command read that returns after a newer successful read", async () => {
    await page.evaluate(() => { window.liveFixture.holdOverview = "summary" })
    await refresh()
    await expect.poll(() => page.evaluate(() => window.liveFixture.overviewHeldCount)).toBe(1)
    await page.evaluate(() => { window.liveFixture.holdOverview = undefined })
    await page.getByRole("button", { name: "暂停监控", exact: true }).click()
    await page.getByRole("button", { name: "恢复监控", exact: true }).waitFor()
    await page.evaluate(() => window.liveFixture.releaseOverview(0))
    await expect.poll(() => page.getByRole("button", { name: "刷新监控数据" }).isEnabled()).toBe(true)
    expect(await page.getByRole("button", { name: "恢复监控", exact: true }).count()).toBe(1)
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "status").length)).toBe(1)
  })

  it("shows original summary fields and same-page event names with a live relative clock", async () => {
    await page.clock.install({ time: new Date("2026-09-13T04:00:00Z") })
    await page.goto(url)
    await page.getByRole("heading", { name: "测试主播1", exact: true }).waitFor()
    await page.evaluate(() => {
      const event = { id: crypto.randomUUID(), monitorId: "018f0f39-7b5e-7cc1-962d-000000000000", uid: "20", roomId: "120",
        eventType: "LIVE_STARTED" as const, occurredAt: "2026-09-13T03:59:01Z" }
      window.liveFixture.setEvents([event])
      window.liveFixture.summaryValues = { totalRooms: 5, liveRooms: 1, errorRooms: 2, todayLiveStarts: 3, totalOnlineCount: 12345,
        latestEvent: { ...event, id: crypto.randomUUID(), occurredAt: "2026-09-13T02:00:00Z" } }
    })
    await refresh()
    await page.getByText("测试主播1 · 开播", { exact: true }).waitFor()
    expect(await page.locator(".live-summary-card span").allTextContents()).toEqual(["直播中房间", "总在线/热度", "今日开播次数", "最近状态变化"])
    expect(await page.locator(".live-summary-card strong").allTextContents()).toEqual(["1", "1.2万", "3", "2 小时前"])
    await page.getByText("2 个异常", { exact: true }).waitFor()
    // Finish the queued trend read caused by reload before measuring the display clock.
    await page.clock.runFor(200)
    await expect.poll(() => page.evaluate(() => window.liveFixture.trendRequests.length)).toBeGreaterThan(0)
    const calls = await page.evaluate(() => window.liveFixture.calls)
    await page.clock.runFor(1000)
    await expect.poll(() => page.locator(".live-event-list time").first().textContent()).toBe("1 分钟前")
    expect(await page.evaluate(() => window.liveFixture.calls)).toEqual(calls)
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    await page.getByText("测试主播1 · 开播", { exact: true }).waitFor()
  })

  it("clears deleted selection and detail even if reread fails, without publishing partial room removal", async () => {
    await page.getByRole("button", { name: "加入趋势", exact: true }).first().click()
    await page.evaluate(() => { window.liveFixture.summaryError = "汇总失败" })
    page.once("dialog", dialog => { void dialog.accept() })
    await page.getByRole("button", { name: "删除", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "汇总失败" }).waitFor()
    await expect.poll(() => page.locator(".live-monitor-detail").count()).toBe(0)
    expect(await roomNames()).toContain("测试主播1")
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    expect(await page.getByRole("checkbox", { name: "测试主播1", exact: true }).isChecked()).toBe(false)
    await page.getByRole("checkbox", { name: "测试主播1", exact: true }).click()
    expect(await page.getByRole("checkbox", { name: "测试主播1", exact: true }).isChecked()).toBe(false)
    expect(await page.evaluate(() => window.liveFixture.missingTrendIds)).toEqual([])
    await page.evaluate(() => { window.liveFixture.summaryError = "" })
    await refresh()
    await expect.poll(() => page.getByRole("checkbox", { name: "测试主播1", exact: true }).count()).toBe(0)
    expect(await page.evaluate(() => window.liveFixture.missingTrendIds)).toEqual([])
  })

  it.each(["delete", "interval"] as const)("applies %s command acknowledgement before a delayed overview finishes", async action => {
    await page.evaluate(() => { window.liveFixture.holdOverview = "summary" })
    if (action === "delete") {
      page.once("dialog", dialog => { void dialog.accept() })
      await page.getByRole("button", { name: "删除", exact: true }).click()
    } else {
      await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).fill("600")
      await page.getByRole("button", { name: "保存修改", exact: true }).click()
    }
    await expect.poll(() => page.evaluate(() => window.liveFixture.overviewHeldCount)).toBe(1)
    if (action === "delete") {
      expect(await page.locator(".live-monitor-detail").count()).toBe(0)
      expect(await page.locator(".live-room-data-detail").count()).toBe(0)
    } else {
      expect(await page.getByRole("spinbutton", { name: "采集间隔（未保存）", exact: true }).count()).toBe(0)
      expect(await page.getByRole("spinbutton", { name: "采集间隔", exact: true }).inputValue()).toBe("600")
    }
    await page.evaluate(() => { window.liveFixture.holdOverview = undefined; window.liveFixture.releaseOverview(0) })
    await expect.poll(() => page.getByRole("button", { name: "刷新监控数据" }).isEnabled()).toBe(true)
  })

  it("uses the new monitor identity after deleting and readding the same platform room during failed rereads", async () => {
    await page.evaluate(() => { window.liveFixture.summaryError = "汇总失败" })
    page.once("dialog", dialog => { void dialog.accept() })
    await page.getByRole("button", { name: "删除", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "汇总失败" }).waitFor()
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    await page.getByPlaceholder("例如 6 或 21987615").fill("120")
    await page.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.locator(".live-add-panel").waitFor({ state: "detached" })
    expect(await roomNames()).toContain("测试主播1")
    await page.evaluate(() => { window.liveFixture.summaryError = "" })
    await refresh()
    const detail = page.getByRole("region", { name: "新主播5房间详情", exact: true })
    await detail.waitFor()
    const id = (await detail.getAttribute("id"))!.slice("live-detail-".length)
    expect(id).not.toBe("018f0f39-7b5e-7cc1-962d-000000000000")
    await expect.poll(() => page.evaluate(value => window.liveFixture.trendRequests.at(-1)?.roomMonitorIds?.includes(value), id)).toBe(true)
    expect(await page.evaluate(() => window.liveFixture.missingTrendIds)).toEqual([])
    expect(await roomNames()).not.toContain("测试主播1")
  })

  it("keeps event names and readable time text inside light/dark narrow layouts", async () => {
    await changeProjection()
    await page.evaluate(() => window.liveFixture.updateRoom(0, { uname: "樱花直播测试".repeat(24) }))
    await refresh()
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    await page.locator(".live-event-list time").waitFor()
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(value => { document.querySelector("main")!.className = `theme-${value}` }, theme)
      for (const width of [1600, 900, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        const textStyles = await page.locator(".live-event-list time").evaluate(element => ({
          size: parseFloat(getComputedStyle(element).fontSize), family: getComputedStyle(element).fontFamily
        }))
        expect(textStyles.size).toBeGreaterThanOrEqual(14)
        expect(textStyles.family).not.toContain("Cascadia")
        expect(await page.locator(".live-summary-card span").first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14)
        const overflow = await page.locator(".live-overview-events, .live-overview-summary").evaluateAll(elements => elements.flatMap(element =>
          [element, ...element.querySelectorAll("strong, time")].filter(item => item.getBoundingClientRect().right > innerWidth + 1 || item.getBoundingClientRect().left < -1).map(item => item.tagName)))
        expect(overflow).toEqual([])
        if (width === 1600 || theme === "light" && width === 390) {
          await page.screenshot({ path: resolve(process.env.TEMP!, `bmd-live-overview-${theme}-${width}.png`), fullPage: true })
        }
      }
    }
  })

  it("keeps the refresh action readable in dark mode", async () => {
    await page.evaluate(() => { document.querySelector("main")!.className = "theme-dark" })
    const contrast = await page.getByRole("button", { name: "刷新监控数据" }).evaluate(element => {
      const style = getComputedStyle(element)
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const channel = value / 255
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      }
      const foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  })
})
