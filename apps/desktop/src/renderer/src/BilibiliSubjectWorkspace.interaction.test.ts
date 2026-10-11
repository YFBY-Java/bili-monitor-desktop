import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

// Deterministic local renderer fixture; no Bilibili calls, application startup, or user database.
describe("Subject Long64 workflow in the renderer", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory,
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing test fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/subject-long64.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage()
    await page.clock.setFixedTime(new Date("2026-10-05T01:10:00Z"))
    await page.route("**/subject-fixture-avatar.svg", route => route.fulfill({
      contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="pink"/></svg>'
    }))
    await page.goto(url)
    await page.getByRole("heading", { name: "Long64工作台", exact: true }).waitFor()
  })
  afterEach(async () => { await page?.close() })

  it("refreshes exact metrics through v2 and inspects the time-aligned subject trend", async () => {
    const header = page.locator(".subject-workbench-head")
    const kpis = page.locator(".subject-kpis > div")
    expect(await header.locator(".subject-workbench-title > div span").allTextContents()).toEqual([
      "Bilibili UID 9223372036854775807", "1/4 模块"
    ])
    expect(await header.locator(".subject-avatar img").getAttribute("src")).toBe("https://i0.hdslb.com/subject-fixture-avatar.svg")
    expect(await header.getByRole("progressbar", { name: "采集健康" }).getAttribute("aria-valuenow")).toBe("82")
    expect(await kpis.nth(2).locator(".subject-kpi-tag").textContent()).toBe("未启用")
    expect(await kpis.nth(3).locator("strong").textContent()).toBe("10 分钟前")
    const health = page.locator("article").filter({ has: page.getByText("COLLECTION HEALTH", { exact: true }) })
    expect(await health.locator(".subject-health-stats strong").nth(2).textContent()).toBe("10 分钟前")
    expect(await health.getByRole("heading").textContent()).toBe("Long64工作台 采集健康与事件")
    expect(await health.locator(".business-safety").textContent()).toContain("关注")
    expect(await health.locator(".business-safety").getAttribute("class")).toContain("is-warning")
    const nextCollection = await page.evaluate(() => new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date("2026-10-05T01:15:00Z")))
    expect(await health.locator(".subject-health-stats strong").nth(1).textContent()).toBe(nextCollection)
    expect(await kpis.nth(3).locator("small").textContent()).toBe(`下一轮 ${nextCollection}`)
    expect(await health.locator(".subject-event-list time").allTextContents()).toEqual(["30 秒前", nextCollection])
    expect(await health.locator(".subject-event-list span").first().textContent()).toBe("bilibili-live")
    await health.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/bmd-subject-health-light.png", import.meta.url)) })
    expect(await page.locator(".subject-kpis").textContent()).toContain("9,223,372,036,854,775,807")
    expect(await page.locator(".subject-kpis").textContent()).toContain("今日 -9,223,372,036,854,775,808")
    const chart = page.locator(".subject-trend-chart")
    await expect.poll(() => chart.locator("circle[data-metric='heat']").count()).toBe(4)
    const svg = chart.getByRole("img", { name: "粉丝和热度时间趋势", exact: true })
    expect(await svg.getByText("粉丝", { exact: true }).count()).toBe(1)
    expect(await svg.getByText("热度", { exact: true }).count()).toBe(1)
    const coordinates = await svg.locator("circle[data-metric]").evaluateAll(elements => elements.map(element => ({
      metric: element.getAttribute("data-metric"), time: Number(element.getAttribute("data-time")),
      value: element.getAttribute("data-value"), x: Number(element.getAttribute("cx")), y: Number(element.getAttribute("cy"))
    })))
    const heat = coordinates.filter(point => point.metric === "heat")
    const follower = coordinates.filter(point => point.metric === "follower")
    expect(heat.map(point => point.time)).toEqual(["2026-10-05T01:00:00Z", "2026-10-05T01:01:00Z", "2026-10-05T01:10:00Z", "2026-10-05T01:20:00Z"].map(Date.parse))
    expect(heat.map(point => point.value)).toEqual(["200", "100", "150", "200"])
    expect(follower.map(point => point.value)).toEqual(["9223372036854775806", "9223372036854775807", "9223372036854775807"])
    expect(follower.some(point => point.time === Date.parse("2026-10-05T01:10:00Z"))).toBe(false)
    const [heatStart, heatNext, heatLater] = heat
    const [followerStart, followerNext] = follower
    if (!heatStart || !heatNext || !heatLater || !followerStart || !followerNext) throw new Error("Missing subject trend coordinates")
    expect((heatLater.x - heatNext.x) / (heatNext.x - heatStart.x)).toBeCloseTo(9, 4)
    const plotHeight = await svg.evaluate(element => {
      if (!(element instanceof SVGSVGElement)) throw new Error("Missing trend SVG viewBox")
      return element.viewBox.baseVal.height - 40 - 28
    })
    expect(heatStart.y).toBeCloseTo(28 + plotHeight * (267 - 200) / (267 - 33), 4)
    expect(heatNext.y - heatStart.y).toBeCloseTo(plotHeight * 100 / (267 - 33), 4)
    expect(followerStart.y).toBeGreaterThan(followerNext.y)
    expect(followerStart.y - followerNext.y).toBeLessThan(plotHeight / 100)
    expect(followerNext.y).toBeGreaterThan(28)
    expect(followerStart.y).toBeLessThan(28 + plotHeight)
    const followerPath = await svg.locator("path.subject-line.follower").getAttribute("d")
    expect(followerPath?.match(/M/g)).toHaveLength(1)
    expect(followerPath?.match(/[CL]/g)?.length).toBeGreaterThanOrEqual(2)
    await svg.locator("circle[data-metric='heat']").nth(1).hover()
    const tooltip = chart.getByRole("tooltip")
    await expect.poll(() => tooltip.textContent()).toContain("9,223,372,036,854,775,807")
    expect(await tooltip.getByText("100", { exact: true }).count()).toBe(1)
    const hoverTime = await page.evaluate(() => new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(new Date("2026-10-05T01:01:00Z")))
    expect(await tooltip.textContent()).toContain(hoverTime)
    await chart.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/bmd-subject-trend-light.png", import.meta.url)) })
    await page.evaluate(() => {
      window.subjectLong64Fixture.workbench.summary.healthScore = 64
      delete window.subjectLong64Fixture.workbench.summary.lastSuccessAt
      delete window.subjectLong64Fixture.workbench.summary.nextCollectAt
      window.subjectLong64Fixture.workbench.bilibiliLiveRoom = {
        monitorId: "018f0f39-7b5e-4cc1-862d-9a208b3d0903", uid: "9223372036854775807",
        roomId: "1000", uname: "Long64用户", liveStatus: 0, monitorStatus: "ACTIVE"
      }
      window.subjectLong64Fixture.workbench.danmu = { enabled: true, status: "connected", recentMessages: [] }
      window.subjectLong64Fixture.workbench.summary.followerCount = "12500"
      window.subjectLong64Fixture.workbench.summary.followerDelta24h = "0"
      window.subjectLong64Fixture.workbench.summary.onlineCount = "123456789"
    })
    await page.getByRole("button", { name: "刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "workbenchV2").length)).toBe(2)
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "trendsV2").length)).toBe(2)
    await expect.poll(() => health.locator(".business-safety").textContent()).toContain("异常")
    expect(await health.locator(".business-safety").getAttribute("class")).toContain("is-error")
    expect(await health.locator(".subject-health-stats strong").allTextContents()).toEqual(["1/4", "--", "--"])
    expect(await header.getByText("弹幕监听中", { exact: true }).count()).toBe(1)
    expect(await kpis.nth(2).locator(".subject-kpi-tag").textContent()).toBe("监听")
    expect(await kpis.nth(0).locator("strong").textContent()).toBe("1.3万")
    expect(await kpis.nth(0).locator("small").textContent()).toBe("今日 0")
    expect(await kpis.nth(1).locator("strong").textContent()).toBe("1.23亿")
    expect(await kpis.nth(3).locator("strong").textContent()).toBe("--")
    await page.evaluate(() => { window.subjectLong64Fixture.updateFailures = 1 })
    await page.getByRole("button", { name: "暂停工作台", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "工作台状态保存失败" }).waitFor({ timeout: 2_000 })
    await expect.poll(() => page.getByRole("button", { name: "暂停工作台", exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => {
      window.subjectLong64Fixture.workbench.summary.healthScore = 100
      if (window.subjectLong64Fixture.workbench.bilibiliLiveRoom) window.subjectLong64Fixture.workbench.bilibiliLiveRoom.liveStatus = 1
    })
    await page.getByRole("button", { name: "暂停工作台", exact: true }).click()
    await page.getByRole("button", { name: "恢复工作台", exact: true }).waitFor()
    await expect.poll(() => health.locator(".business-safety").textContent()).toContain("正常")
    expect(await header.getByText("弹幕采集中", { exact: true }).count()).toBe(1)
    expect(await header.locator(".subject-avatar").getAttribute("class")).toContain("is-live")
    expect(await kpis.nth(2).locator(".subject-kpi-tag").textContent()).toBe("实时")
    expect(await page.evaluate(() => window.subjectLong64Fixture.updateRequests.map(input => input.enabled))).toEqual([false, false])
    await page.getByRole("button", { name: "返回监控对象", exact: true }).click()
    await expect.poll(() => page.locator(".subject-card").count()).toBe(1)
    const listReads = await page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "subjects.list").length)
    await page.getByRole("button", { name: "刷新监控对象", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "subjects.list").length)).toBe(listReads + 1)
    await page.evaluate(() => {
      delete window.subjectLong64Fixture.workbench.bilibiliUser
      delete window.subjectLong64Fixture.workbench.bilibiliLiveRoom
      window.subjectLong64Fixture.workbench.danmu = { enabled: false, status: "disabled", recentMessages: [] }
    })
    await page.getByRole("button", { name: "打开工作台", exact: true }).click()
    await page.getByRole("heading", { name: "Long64工作台", exact: true }).waitFor()
    await page.getByRole("alert").filter({ hasText: "该对象还没有绑定 B站粉丝监控或直播间监控。可以先在专项页添加监控，再回到这里绑定。" }).waitFor()
    expect(await header.locator(".subject-workbench-title > div span").allTextContents()).toEqual(["1/4 模块"])
    await page.getByRole("button", { name: "返回监控对象", exact: true }).click()
    const confirmations: string[] = []
    page.on("dialog", async dialog => { confirmations.push(dialog.message()); await dialog.accept() })
    await page.evaluate(() => { window.subjectLong64Fixture.removeFailures = 1 })
    await page.getByRole("button", { name: "删除 Long64工作台", exact: true }).click()
    expect(confirmations[0]).toContain("Long64工作台")
    expect(confirmations[0]).toContain("历史")
    await page.getByRole("alert").filter({ hasText: "删除工作台失败" }).waitFor()
    expect(await page.locator(".subject-card").count()).toBe(1)
    await expect.poll(() => page.getByRole("button", { name: "删除 Long64工作台", exact: true }).isEnabled()).toBe(true)
    await page.getByRole("button", { name: "删除 Long64工作台", exact: true }).click()
    await page.getByText(/已删除/).first().waitFor()
    await expect.poll(() => page.locator(".subject-card").count()).toBe(0)
    expect(await page.evaluate(() => window.subjectLong64Fixture.removeRequests.map(input => input.subjectId))).toEqual([
      "018f0f39-7b5e-4cc1-862d-9a208b3d0900", "018f0f39-7b5e-4cc1-862d-9a208b3d0900"
    ])
    const workbenchReads = await page.evaluate(() => window.subjectLong64Fixture.workbenchRequests)
    const trendReads = await page.evaluate(() => window.subjectLong64Fixture.trendRequests)
    await page.getByRole("button", { name: "查看用户工作台", exact: true }).click()
    await page.getByText("请先选择监控对象", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.subjectLong64Fixture.workbenchRequests)).toEqual(workbenchReads)
    expect(await page.evaluate(() => window.subjectLong64Fixture.trendRequests)).toEqual(trendReads)
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
    const listRequests = await page.evaluate(() => window.subjectLong64Fixture.listRequests)
    expect(listRequests.length).toBeGreaterThan(0)
    expect(listRequests).toEqual(listRequests.map(() => ({})))
  })

  it("rejects an overflowing UID before creation and passes the largest positive Long UID intact", async () => {
    await page.getByRole("button", { name: "创建用户工作台", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "创建用户工作台" })
    const uid = dialog.getByRole("textbox").first()
    const create = dialog.getByRole("button", { name: "创建工作台", exact: true })
    await create.click()
    expect(await page.evaluate(() => window.subjectLong64Fixture.createRequests)).toEqual([])
    expect(await uid.evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBe(true)
    expect(await dialog.getByRole("checkbox").isChecked()).toBe(true)
    await uid.fill("9223372036854775808")
    await create.click()
    expect(await page.evaluate(() => window.subjectLong64Fixture.createRequests)).toEqual([])
    await dialog.getByRole("alert").waitFor()
    await uid.fill("  0009223372036854775807  ")
    await create.click()
    await expect.poll(() => page.evaluate(() => window.subjectLong64Fixture.createRequests.length)).toBe(1)
    await dialog.waitFor({ state: "detached" })
    expect(await page.evaluate(() => window.subjectLong64Fixture.createRequests.at(-1))).toEqual({
      mid: "9223372036854775807", danmuEnabled: true
    })
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
  })

  it("retains exact binding values after a failed save and retries without an unhandled rejection", async () => {
    const pageErrors: string[] = []
    page.on("pageerror", error => pageErrors.push(error.message))
    await page.route("**/__fixtures__/subject-long64.tsx*", async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: `${await response.text()}\nbridge.bilibiliSubjects.bind = async input => {
        fixture.calls.push("subjects.bind");
        fixture.calls.push("bind-user:" + input.bilibiliUserMonitorId);
        if (fixture.calls.filter(call => call === "subjects.bind").length === 1) throw new Error("绑定保存失败");
        return workbench.bilibiliBinding;
      };` })
    })
    await page.reload()
    await page.getByRole("heading", { name: "Long64工作台", exact: true }).waitFor()
    await page.getByRole("button", { name: "绑定资源", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "绑定 B站监控资源" })
    const userSelector = dialog.getByRole("combobox", { name: "粉丝监控用户", exact: true })
    const userLabel = "Long64用户 · UID 9223372036854775807"
    await expect.poll(() => userSelector.evaluate(element => element.tagName)).toBe("INPUT")
    await expect.poll(() => userSelector.inputValue()).toBe(userLabel)
    await userSelector.fill("9223372036854775807")
    expect(await dialog.getByRole("option").allTextContents()).toEqual([userLabel])
    await userSelector.press("Escape")
    expect(await userSelector.getAttribute("aria-expanded")).toBe("false")
    expect(await userSelector.inputValue()).toBe(userLabel)
    await userSelector.click()
    expect(await dialog.getByRole("option").allTextContents()).toEqual(["不更换", userLabel])
    await userSelector.fill("long64")
    await userSelector.press("ArrowDown")
    await userSelector.press("Enter")
    expect(await userSelector.inputValue()).toBe(userLabel)
    await userSelector.click()
    await dialog.getByRole("option", { name: userLabel, exact: true }).click()
    expect(await userSelector.getAttribute("aria-expanded")).toBe("false")
    await userSelector.fill("没有匹配的用户")
    await dialog.getByRole("checkbox", { name: "启用弹幕监控" }).focus()
    expect(await dialog.getByRole("listbox").count()).toBe(0)
    expect(await userSelector.inputValue()).toBe(userLabel)
    expect(await page.evaluate(() => window.subjectLong64Fixture.calls)).toContain("followersV2.list")
    await dialog.getByRole("button", { name: "保存绑定", exact: true }).click()
    await expect.poll(() => dialog.getByRole("alert").textContent()).toBe("绑定保存失败")
    expect(await page.evaluate(() => window.subjectLong64Fixture.calls)).toContain("bind-user:018f0f39-7b5e-4cc1-862d-9a208b3d0901")
    await expect.poll(() => dialog.getByRole("button", { name: "保存绑定", exact: true }).isEnabled()).toBe(true)
    expect(await userSelector.inputValue()).toBe(userLabel)
    expect(pageErrors).toEqual([])
    await dialog.getByRole("button", { name: "保存绑定", exact: true }).click()
    await dialog.waitFor({ state: "detached" })
    expect(await page.evaluate(() => window.subjectLong64Fixture.calls.filter(call => call === "subjects.bind").length)).toBe(2)
    expect(await page.evaluate(() => window.subjectLong64Fixture.legacyCalls)).toEqual([])
  })

  it("resizes subject board locally and hides the handle on narrow screens", async () => {
    await page.setViewportSize({ width: 1600, height: 1200 })
    const board = page.locator(".subject-widget-grid")
    const size = () => board.evaluate(element => ({
      width: parseFloat(getComputedStyle(element).getPropertyValue("--subject-main-width")),
      height: parseFloat(getComputedStyle(element).getPropertyValue("--subject-widget-height"))
    }))
    expect(await size()).toEqual({ width: 61, height: 650 })
    const primary = page.locator(".subject-board-primary").first()
    expect((await primary.boundingBox())?.height).toBe(650)
    const handle = page.getByRole("button", { name: "拖动调整趋势图大小", exact: true })
    await handle.scrollIntoViewIfNeeded()
    const box = await handle.boundingBox()
    if (!box) throw new Error("Missing subject board resize handle")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 90, { steps: 3 })
    await page.mouse.up()
    const resized = await size()
    expect(resized.width).toBeGreaterThan(61)
    expect(resized.width).toBeLessThanOrEqual(76)
    expect(resized.height).toBeGreaterThan(650)
    expect(resized.height).toBeLessThanOrEqual(920)
    expect((await primary.boundingBox())?.height).toBe(resized.height)
    expect(await page.evaluate(() => ({ cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }))).toEqual({ cursor: "", userSelect: "" })
    await page.setViewportSize({ width: 1180, height: 1200 })
    await expect.poll(() => handle.isVisible()).toBe(false)
  })
})
