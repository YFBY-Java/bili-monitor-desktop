import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

type SetupProbe = {
  startedAt: number
  finished: boolean
  phases: { phase: string; ms: number }[]
  pendingResources: Map<Request, string>
  pendingResourceCount: number
  resourceFailures: { kind: "requestfailed" | "response"; pathname: string; status?: number }[]
  failureCount: number
}

describe("original live-room renderer workflows", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let setupProbe: SetupProbe | undefined
  function recordSetupPhase(probe: SetupProbe, phase: string): void {
    if (probe.phases.length < 100) probe.phases.push({ phase, ms: Math.round(performance.now() - probe.startedAt) })
  }
  function watchSetupResources(setupPage: Page, probe: SetupProbe): void {
    const recordFailure = (failure: SetupProbe["resourceFailures"][number]): void => {
      probe.failureCount++
      if (probe.resourceFailures.length < 100) probe.resourceFailures.push(failure)
    }
    setupPage.on("request", request => {
      probe.pendingResourceCount++
      if (probe.pendingResources.size < 100) probe.pendingResources.set(request, new URL(request.url()).pathname.slice(0, 256))
    })
    setupPage.on("requestfinished", request => {
      probe.pendingResourceCount--
      probe.pendingResources.delete(request)
    })
    setupPage.on("requestfailed", request => {
      probe.pendingResourceCount--
      probe.pendingResources.delete(request)
      recordFailure({ kind: "requestfailed", pathname: new URL(request.url()).pathname.slice(0, 256) })
    })
    setupPage.on("response", response => {
      if (response.status() >= 400) recordFailure({ kind: "response", pathname: new URL(response.url()).pathname.slice(0, 256), status: response.status() })
    })
  }
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-live-test"), plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/live-workspace.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    const probe: SetupProbe = { startedAt: performance.now(), finished: false, phases: [], pendingResources: new Map(), pendingResourceCount: 0, resourceFailures: [], failureCount: 0 }
    setupProbe = probe
    recordSetupPhase(probe, "page:create")
    const setupPage = await browser.newPage()
    page = setupPage
    recordSetupPhase(probe, "page:created")
    if (probe.finished) console.warn("Late live workspace setup page created", { phases: probe.phases })
    watchSetupResources(setupPage, probe)
    page.setDefaultTimeout(3000)
    page.setDefaultNavigationTimeout(15000)
    recordSetupPhase(probe, "navigate:start")
    await page.goto(url)
    recordSetupPhase(probe, "navigate:loaded")
    recordSetupPhase(probe, "heading:wait")
    await page.getByRole("heading", { name: "测试主播1", exact: true }).waitFor({ timeout: 15_000 })
    recordSetupPhase(probe, "heading-ready")
  })
  afterEach(async ({ task }) => {
    const probe = setupProbe
    if (probe) probe.finished = true
    if (task.result?.state === "fail" && probe) console.warn("Live workspace setup probe", {
      phases: probe.phases, pendingResourceCount: probe.pendingResourceCount, pendingResources: [...probe.pendingResources.values()],
      failureCount: probe.failureCount, resourceFailures: probe.resourceFailures
    })
    await page?.close()
  })

  it("opens the first room, supports keyboard collapse/switch, and restores it after a successful reread", async () => {
    await page.getByRole("region", { name: "测试主播1房间详情" }).waitFor()
    const expand = page.getByRole("button", { name: "收起测试主播1的详情" })
    await expand.focus()
    await page.keyboard.press("Enter")
    expect(await page.locator(".live-monitor-detail").count()).toBe(0)
    await page.getByRole("button", { name: "展开测试主播2的详情" }).focus()
    await page.keyboard.press("Space")
    await page.getByRole("region", { name: "测试主播2房间详情" }).waitFor()
    await page.locator(".live-room-card").first().getByRole("button", { name: "加入趋势", exact: true }).click()
    expect(await page.getByRole("region", { name: "测试主播2房间详情" }).count()).toBe(1)
    await page.getByRole("button", { name: "收起测试主播2的详情" }).click()
    await page.evaluate(() => window.liveFixture.reload())
    await page.getByRole("region", { name: "测试主播1房间详情" }).waitFor()
  })

  it("shows source detail facts and missing fields, and prioritizes paused/error status", async () => {
    await page.evaluate(async () => {
      window.liveFixture.updateRoom(0, { shortId: "6", parentAreaName: "游戏", areaName: "单机", liveStatus: 1,
        liveTime: "2026-09-05T01:00:00.000Z", onlineCount: 0, attentionCount: 0,
        lastErrorType: "BILIBILI_RISK_CONTROL", backoffUntil: "2026-09-05T02:10:00.000Z" })
      await window.liveFixture.reload()
    })
    const detail = page.getByRole("region", { name: "测试主播1房间详情" })
    await detail.getByText("BILIBILI_RISK_CONTROL: 采集失败", { exact: true }).waitFor()
    expect(await detail.locator("dl > div").count()).toBe(8)
    await detail.getByText("短号 6", { exact: true }).waitFor()
    await detail.getByText("游戏 / 单机", { exact: true }).waitFor()
    await detail.getByText("头像缺失", { exact: true }).waitFor()
    await detail.getByText("封面缺失", { exact: true }).waitFor()
    expect(await detail.getByText("在线缺失", { exact: true }).count()).toBe(0)
    expect(await detail.getByText("关注缺失", { exact: true }).count()).toBe(0)
    expect(await page.locator(".live-room-card").first().getByText("异常", { exact: true }).count()).toBe(1)
    await page.evaluate(async () => { window.liveFixture.updateRoom(0, { monitorStatus: "PAUSED" }); await window.liveFixture.reload() })
    expect(await page.locator(".live-room-card").first().getByText("暂停", { exact: true }).count()).toBe(1)
    expect(await page.locator(".live-room-card").first().getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0")
  })

  it("ticks the original collection rhythm and live duration without collecting from the renderer", async () => {
    // Pin only Date; keep the actual mounted one-second timer and Query notifications.
    await page.clock.setFixedTime(new Date("2026-09-05T02:04:50.000Z"))
    await page.evaluate(async () => {
      window.liveFixture.updateRoom(0, { liveStatus: 1, liveTime: "2026-09-05T01:05:00.000Z" })
      await window.liveFixture.reload()
    })
    const card = page.locator(".live-room-card").first()
    await card.getByText("10 秒后", { exact: true }).waitFor()
    expect(await card.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("97")
    await page.getByText("59 分钟", { exact: true }).waitFor()
    await page.clock.setFixedTime(new Date("2026-09-05T02:04:51.000Z"))
    await card.getByText("9 秒后", { exact: true }).waitFor()
    await page.clock.setFixedTime(new Date("2026-09-05T02:05:00.000Z"))
    await card.getByText("待采集", { exact: true }).waitFor()
    await page.getByText("1 小时 0 分", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.calls.filter(call => call === "refresh"))).toEqual([])
  })

  it("retains dirty interval drafts across collapse, rooms, tabs and failed saves", async () => {
    const first = page.getByRole("region", { name: "测试主播1房间详情" })
    await first.getByRole("spinbutton").fill("600")
    await page.getByRole("button", { name: "展开测试主播2的详情" }).click()
    await page.getByRole("region", { name: "测试主播2房间详情" }).getByRole("spinbutton").fill("900")
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    await page.getByRole("button", { name: "展开测试主播1的详情" }).click()
    expect(await first.getByRole("spinbutton").inputValue()).toBe("600")
    await page.evaluate(async () => { window.liveFixture.updateFirst(120); await window.liveFixture.reload() })
    expect(await first.getByRole("spinbutton").inputValue()).toBe("600")
    await page.evaluate(() => { window.liveFixture.actionError = "设置写入失败" })
    await first.getByRole("button", { name: "保存修改", exact: true }).click()
    await first.getByRole("alert").filter({ hasText: "设置写入失败" }).waitFor()
    expect(await first.getByRole("spinbutton").inputValue()).toBe("600")
    await expect.poll(() => first.getByRole("button", { name: "保存修改", exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => { window.liveFixture.actionError = "" })
    await first.getByRole("button", { name: "保存修改", exact: true }).click()
    await first.getByRole("button", { name: "已保存", exact: true }).waitFor()
    await page.getByRole("button", { name: "展开测试主播2的详情" }).click()
    expect(await page.getByRole("region", { name: "测试主播2房间详情" }).getByRole("spinbutton").inputValue()).toBe("900")
  })

  it("normalizes interval drafts and steps exactly as the original editor", async () => {
    const detail = page.getByRole("region", { name: "测试主播1房间详情" })
    const input = detail.getByRole("spinbutton")
    for (const [entered, normalized, step] of [["0", "1", "1"], ["1.5", "2", "1"], ["60", "60", "60"],
      ["3600", "3600", "300"], ["86400", "86400", "3600"], ["3000000", "2592000", "3600"]]) {
      await input.fill(entered!)
      expect(await input.inputValue()).toBe(normalized)
      expect(await input.evaluate(element => (element as HTMLInputElement).validity.stepMismatch)).toBe(false)
      await input.press("ArrowUp")
      expect(await input.inputValue()).toBe(String(Math.min(2_592_000, Number(normalized) + Number(step))))
    }
    await input.fill("30")
    await page.getByText("短间隔会增加 B站接口请求频率，请确认确有需要。", { exact: true }).waitFor()
    await input.fill("300")
    expect(await detail.getByRole("button", { name: "已保存", exact: true }).isDisabled()).toBe(true)
  })

  it("locks the add form in flight and expands the room returned by the real bridge action", async () => {
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    const form = page.locator(".live-add-panel")
    await form.getByRole("textbox").fill("6")
    await page.evaluate(() => { window.liveFixture.holdAction = true })
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.calls.includes("add"))).toBe(true)
    expect(await form.getByRole("textbox").isDisabled()).toBe(true)
    expect(await form.getByRole("combobox").isDisabled()).toBe(true)
    expect(await form.getByRole("spinbutton").isDisabled()).toBe(true)
    await page.evaluate(() => { window.liveFixture.holdAction = false; window.liveFixture.release() })
    await page.getByRole("region", { name: "新主播6房间详情" }).waitFor()
    expect(await page.getByRole("button", { name: "收起新主播6的详情" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("steps relative to the current interval rather than the native min-based number grid", async () => {
    const input = page.getByRole("region", { name: "测试主播1房间详情" }).getByRole("spinbutton")
    await input.focus()
    await input.press("ArrowUp")
    expect(await input.inputValue()).toBe("360")
    await input.press("ArrowDown")
    expect(await input.inputValue()).toBe("300")
  })

  it("does not let scrolling over the interval silently edit the saved schedule", async () => {
    const input = page.getByRole("region", { name: "测试主播1房间详情" }).getByRole("spinbutton")
    await input.fill("300")
    await input.focus()
    await input.hover()
    await page.mouse.wheel(0, -120)
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    expect(await input.inputValue()).toBe("300")
    expect(await input.evaluate(element => document.activeElement === element)).toBe(true)
  })

  it("expands an existing canonical room returned by duplicate add rather than assuming the last row", async () => {
    await page.evaluate(() => { window.liveFixture.addResultIndex = 3 })
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    const form = page.locator(".live-add-panel")
    await form.getByRole("textbox").fill("6")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("region", { name: "测试主播4房间详情" }).waitFor()
    expect(await page.locator(".live-room-card").count()).toBe(5)
    expect(await page.getByRole("button", { name: "收起测试主播4的详情" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("keeps light/dark detail layout inside narrow windows with long source metadata", async () => {
    const panel = page.locator(".live-monitor-panel")
    await page.setViewportSize({ width: 1440, height: 1100 })
    await panel.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-monitor-light.png") })
    await page.evaluate(() => document.querySelector("main")!.classList.remove("theme-light"))
    await panel.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-monitor-dark.png") })
    await page.evaluate(async () => {
      document.querySelector("main")!.classList.add("theme-light")
      window.liveFixture.updateRoom(0, { uname: "VeryLongLiveRoom".repeat(12), title: "很长的直播标题".repeat(20),
        parentAreaName: "LongParentArea".repeat(12), areaName: "LongAreaName".repeat(12) })
      await window.liveFixture.reload()
    })
    for (const width of [1440, 900, 620, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const detail = page.locator(".live-monitor-detail")
      expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    await panel.screenshot({ path: resolve(process.env.TEMP!, "bmd-live-monitor-narrow.png") })
  })

  it("displays and selects the 505th room without a renderer list cap", async () => {
    await page.evaluate(async () => { window.liveFixture.expandRoomList(); await window.liveFixture.reload() })
    await expect.poll(() => page.locator(".live-room-card").count()).toBe(505)
    const last = page.locator(".live-room-card").filter({ has: page.getByRole("heading", { name: "测试主播505", exact: true }) })
    await last.getByRole("button", { name: "加入趋势", exact: true }).click()
    // Scope the fixture navigation: a full-page role scan traverses ~40k nodes at 505 rooms.
    await page.locator('nav[aria-label="测试页面导航"]').getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".live-chart-card").filter({ hasText: "测试主播505" }).waitFor()
    expect(await page.getByRole("checkbox", { name: "测试主播505", exact: true }).isChecked()).toBe(true)
  }, 20_000)

  it("loads 20 boundary sessions but lets data and analysis select the 200th session", async () => {
    await page.getByRole("button", { name: "查看场次", exact: true }).click()
    await expect.poll(() => page.locator(".live-session-list > button").count()).toBe(20)
    await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
    const selector = page.getByRole("combobox", { name: "直播场次", exact: true })
    await expect.poll(() => selector.locator("option").count()).toBe(200)
    const oldest = (await selector.locator("option").last().getAttribute("value"))!
    await selector.selectOption(oldest)
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionEventIds.at(-1))).toBe(oldest)
    await page.evaluate(() => window.liveFixture.reload())
    expect(await selector.inputValue()).toBe(oldest)
    await page.getByRole("button", { name: "查看场次分析", exact: true }).click()
    await expect.poll(() => selector.locator("option").count()).toBe(200)
    expect(await selector.inputValue()).toBe(oldest)
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionInsightIds.at(-1))).toBe(oldest)
    await page.getByRole("button", { name: "查看场次", exact: true }).click()
    await expect.poll(() => page.locator(".live-session-list > button").count()).toBe(20)
    await expect.poll(() => page.locator(".live-session-list > button.is-selected").count()).toBe(1)
    const limits = await page.evaluate(() => window.liveFixture.sessionRequests.map(input => input.limit))
    expect(limits).toContain(20)
    expect(limits).toContain(200)
    expect(limits).not.toContain(100)
  })

  it("preserves a valid selection when expanding the list and resets selection when changing rooms", async () => {
    await page.getByRole("button", { name: "查看场次", exact: true }).click()
    await expect.poll(() => page.locator(".live-session-list > button").count()).toBe(20)
    await page.locator(".live-session-list > button").nth(5).click()
    await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
    const selector = page.getByRole("combobox", { name: "直播场次", exact: true })
    await expect.poll(() => selector.locator("option").count()).toBe(200)
    const sixth = await selector.locator("option").nth(5).getAttribute("value")
    expect(await selector.inputValue()).toBe(sixth)
    await page.getByRole("combobox", { name: "直播间", exact: true }).selectOption({ label: "测试主播2 · 121" })
    await expect.poll(() => selector.locator("option").first().getAttribute("value"))
      .toBe("018f0f39-7b5e-4cc1-962d-000000001000")
    await expect.poll(() => selector.inputValue()).toBe("018f0f39-7b5e-4cc1-962d-000000001000")
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionEventIds.at(-1)))
      .toBe("018f0f39-7b5e-4cc1-962d-000000001000")
  })

  it("caps comparison at four and restores live-first only after a successful reread following clear", async () => {
    await expect.poll(() => page.getByRole("button", { name: "已选趋势", exact: true }).count()).toBe(1)
    expect(await page.locator(".live-room-card").nth(1).getByRole("button", { name: "已选趋势" }).count()).toBe(1)
    for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "加入趋势", exact: true }).first().click()
    expect(await page.getByRole("button", { name: "趋势已满" }).isDisabled()).toBe(true)
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    for (let index = 0; index < 5; index++) await page.getByRole("checkbox").nth(index).uncheck()
    await page.getByText("尚未选择直播间", { exact: true }).waitFor()
    expect(await page.locator(".live-chart-card").count()).toBe(0)
    await page.evaluate(async () => { window.liveFixture.listError = "读取失败"; await window.liveFixture.reload() })
    expect(await page.locator(".live-chart-card").count()).toBe(0)
    await page.evaluate(async () => { window.liveFixture.listError = ""; await window.liveFixture.reload() })
    await expect.poll(() => page.getByRole("checkbox", { name: "测试主播2", exact: true }).isChecked()).toBe(true)
  })

  it("validates input and adds by room number or UID with the original default interval", async () => {
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    const form = page.locator(".live-add-panel")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await form.getByRole("alert").waitFor()
    expect(await page.evaluate(() => window.liveFixture.addInputs.length)).toBe(0)
    await form.getByRole("textbox").fill("6")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("heading", { name: "新主播6", exact: true }).waitFor()
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    await form.getByRole("combobox").selectOption("uid")
    await form.getByRole("textbox").fill("22")
    await form.getByRole("spinbutton").fill("120")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("heading", { name: "新主播7", exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.addInputs)).toEqual([{ roomId: "6", intervalSeconds: 300 }, { uid: "22", intervalSeconds: 120 }])
    expect(await page.locator(".live-room-card").filter({ hasText: "新主播7" }).getByRole("button", { name: "已选趋势" }).count()).toBe(1)
  })

  it("locks only the busy room and releases it after a real response", async () => {
    await page.evaluate(() => { window.liveFixture.holdAction = true })
    const room = page.getByRole("region", { name: "测试主播1房间详情" })
    await room.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.calls.filter((call) => call === "refresh").length)).toBe(1)
    expect(await room.getByRole("button", { name: "暂停监控", exact: true }).isDisabled()).toBe(true)
    await page.getByRole("button", { name: "展开测试主播2的详情" }).click()
    expect(await page.getByRole("region", { name: "测试主播2房间详情" }).getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
    await page.getByRole("button", { name: "展开测试主播1的详情" }).click()
    await page.evaluate(() => { window.liveFixture.holdAction = false; window.liveFixture.release() })
    await room.getByText("4.6万", { exact: true }).waitFor()
    await expect.poll(() => room.getByRole("button", { name: "暂停监控", exact: true }).isEnabled()).toBe(true)
  })

  it("shows failures and their updated persisted projection without unhandled rejections", async () => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.evaluate(() => { window.liveFixture.actionError = "B站风控，稍后再试" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).first().click()
    await page.getByRole("alert").filter({ hasText: "B站风控" }).first().waitFor()
    expect(errors).toEqual([])
    await page.getByRole("region", { name: "测试主播1房间详情" }).getByText("BILIBILI_RISK_CONTROL: B站风控，稍后再试", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.actionError = "" })
    await page.getByRole("button", { name: "暂停监控", exact: true }).first().click()
    await page.getByRole("button", { name: "恢复监控", exact: true }).waitFor()
    expect(await page.getByRole("region", { name: "测试主播1房间详情" }).locator("dl > div").filter({ hasText: "下次采集" }).innerText()).toContain("已停用")
  })

  it("keeps dirty interval drafts, validates them, and synchronizes unedited values", async () => {
    const room = page.getByRole("region", { name: "测试主播1房间详情" })
    const input = room.getByRole("spinbutton")
    await page.evaluate(async () => { window.liveFixture.updateFirst(120); await window.liveFixture.reload() })
    await expect.poll(() => input.inputValue()).toBe("120")
    await input.fill("600")
    await page.evaluate(async () => { window.liveFixture.updateFirst(900); await window.liveFixture.reload() })
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    expect(await input.inputValue()).toBe("600")
    await input.fill("0")
    expect(await input.inputValue()).toBe("1")
    await input.fill("600")
    await room.getByRole("button", { name: "保存修改", exact: true }).click()
    await expect.poll(() => room.getByRole("button", { name: "已保存", exact: true }).isDisabled()).toBe(true)
    await page.evaluate(async () => { window.liveFixture.updateFirst(180); await window.liveFixture.reload() })
    await expect.poll(() => input.inputValue()).toBe("180")
  })

  it("confirms deletion, removes selected rooms, and does not query deleted trend IDs", async () => {
    await page.locator(".live-room-card").first().getByRole("button", { name: "加入趋势", exact: true }).click()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".live-chart-card").first().waitFor()
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    page.once("dialog", (dialog) => { void dialog.dismiss() })
    await page.getByRole("button", { name: "删除", exact: true }).first().click()
    expect(await page.evaluate(() => window.liveFixture.calls.includes("delete"))).toBe(false)
    page.once("dialog", (dialog) => { void dialog.accept() })
    await page.getByRole("button", { name: "删除", exact: true }).first().click()
    await page.getByRole("heading", { name: "测试主播1", exact: true }).waitFor({ state: "detached" })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await expect.poll(() => page.locator(".live-chart-card").count()).toBe(1)
    expect(await page.evaluate(() => window.liveFixture.missingTrendIds)).toEqual([])
  })

  it("shows trend query failures, supports retry, and keeps stale data on a later failure", async () => {
    await page.getByRole("button", { name: "加入趋势", exact: true }).first().click()
    await page.evaluate(() => { window.liveFixture.trendError = "无法读取直播历史" })
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "无法读取直播历史" }).waitFor()
    await page.evaluate(() => { window.liveFixture.trendError = "" })
    await page.getByRole("button", { name: "重试趋势查询" }).click()
    await page.locator(".live-chart-card").first().waitFor()
    await page.evaluate(async () => { window.liveFixture.trendError = "历史查询暂时失败"; await window.liveFixture.reload() })
    expect(await page.locator(".live-chart-card").count()).toBeGreaterThan(0)
    await page.getByRole("alert").filter({ hasText: "历史查询暂时失败" }).waitFor()
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "历史查询暂时失败" }).waitFor()
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    expect(await page.getByRole("alert").count()).toBe(0)
  })

  it("uses actual timestamps and marks the original missing-heat display-zero rule", async () => {
    await page.getByRole("button", { name: "加入趋势", exact: true }).first().click()
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    const chart = page.locator(".live-chart-card").first()
    await chart.locator("svg").waitFor()
    const coordinates = await chart.locator("circle").evaluateAll(elements => elements.map(element => Number(element.getAttribute("cx"))))
    expect((coordinates[1]! - coordinates[0]!) / (coordinates[2]! - coordinates[0]!)).toBeCloseTo(0.1, 2)
    await page.evaluate(async () => { window.liveFixture.missingHeat(); await window.liveFixture.reload() })
    await expect.poll(() => chart.locator("circle.is-missing").count()).toBe(1)
    expect(await chart.locator("circle").count()).toBe(3)
    expect((await chart.locator(".live-trend-line").getAttribute("d"))?.match(/M/g)).toHaveLength(1)
    expect(await chart.locator("circle title").first().textContent()).toContain("100")
  })

  it("retains already loaded rooms when a changed comparison selection fails to load", async () => {
    await page.getByRole("button", { name: "查看趋势", exact: true }).click()
    await page.locator(".live-chart-card").filter({ hasText: "测试主播2" }).waitFor()
    await page.evaluate(() => { window.liveFixture.trendError = "新选择暂时无法查询" })
    await page.getByRole("checkbox", { name: "测试主播1", exact: true }).check()
    await page.getByRole("alert").filter({ hasText: "新选择暂时无法查询" }).waitFor()
    expect(await page.locator(".live-chart-card").filter({ hasText: "测试主播2" }).count()).toBe(1)
    await page.locator(".live-chart-card").filter({ hasText: "测试主播1" }).getByText("房间近期快照", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.trendError = "" })
    await page.getByRole("button", { name: "重试趋势查询" }).click()
    await expect.poll(() => page.locator(".live-chart-card").count()).toBe(2)
    await page.evaluate(() => { window.liveFixture.trendError = "选择减少后查询失败" })
    await page.getByRole("checkbox", { name: "测试主播2", exact: true }).uncheck()
    await page.getByRole("alert").filter({ hasText: "选择减少后查询失败" }).waitFor()
    expect(await page.locator(".live-chart-card").filter({ hasText: "测试主播1" }).count()).toBe(1)
    expect(await page.locator(".live-chart-card").filter({ hasText: "测试主播2" }).count()).toBe(0)
  })

  it("renders source events and exposes a retry for failed room reads while preserving loaded rooms", async () => {
    await page.getByRole("button", { name: "查看事件", exact: true }).click()
    await page.getByText("暂无状态事件", { exact: true }).waitFor()
    await page.getByRole("button", { name: "注入测试事件" }).click()
    await page.getByText("测试主播1 · 标题变化", { exact: true }).waitFor()
    await page.getByText("旧标题 → 新标题", { exact: true }).waitFor()
    await page.getByRole("button", { name: "查看直播间", exact: true }).click()
    await page.evaluate(async () => { window.liveFixture.listError = "暂时无法读取房间"; await window.liveFixture.reload() })
    expect(await page.locator(".live-room-card").count()).toBe(5)
    await page.getByRole("alert").filter({ hasText: "暂时无法读取房间" }).waitFor()
    await page.evaluate(() => { window.liveFixture.listError = "" })
    await page.getByRole("button", { name: "刷新监控数据" }).click()
    await page.getByRole("alert").waitFor({ state: "detached" })
  })
})
