import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page, type Request } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

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
      cacheDir: browserFixtureCacheDirectory, plugins: [react()],
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
        liveTime: "2026-09-05T01:00:00.000Z", onlineCount: "0", attentionCount: "0",
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

  it("analytics-board completes the original insight and refresh workflow", async () => {
    await page.evaluate(() => {
      window.liveFixture.sessionInsightValues = {
        kpis: { danmakuPerMinute: 2.5, payerConversionRate: 0.5, arppuMilliYuan: 3000,
          paidAmountMilliYuan: 6000, topFiveRevenueShare: 1 },
        timeline: [0, 5, 20].map((minute, index) => ({
          bucketStart: new Date(Date.parse("2026-09-05T02:00:00.000Z") + minute * 60_000).toISOString(),
          danmakuCount: index * 10, activeUserCount: index * 2, paidEventCount: index,
          paidAmountMilliYuan: index * 3000 })),
        peaks: [{ type: "INTERACTION", bucketStart: "2026-09-05T02:05:00.000Z", value: 10, label: "互动峰值" },
          { type: "REVENUE", bucketStart: "2026-09-05T02:20:00.000Z", value: 6000, label: "付费峰值" }],
        userSegments: [{ code: "CASUAL_INTERACTOR", label: "仅互动用户", userCount: 2, description: "已识别弹幕用户" }],
        giftMix: [{ eventKind: "SUPER_CHAT", giftName: "SC", giftCount: 2, paidAmountMilliYuan: 6000, revenueShare: 1 }],
        findings: [{ code: "CONCENTRATED", level: "RISK", title: "已记录收入集中", description: "来自当前场次事实。" }],
        danmakuDepth: { identifiedDanmakuUserCount: 2, identifiedDanmakuCount: 30, messagesPerActiveUser: 15,
          repeatInteractionRate: 1, sustainedParticipationRate: 0.5, duplicateMessageRate: 0,
          stages: [{ code: "MIDDLE", label: "中段", danmakuCount: 30, activeUserCount: 2, messageShare: 1 }],
          repeatedMessages: [{ messageText: "原场次高频正文", messageCount: 3, userCount: 2 }] },
        paymentDepth: { payerCount: 2, repeatPayerRate: 0.5, engagedPayerRate: 1, returningPayerRate: 0,
          medianPayerAmountMilliYuan: 3000, medianConversionLagSeconds: 61, topOneRevenueShare: 0.5,
          spendTiers: [{ code: "STANDARD", label: "1–10 元", userCount: 2, paidAmountMilliYuan: 6000, revenueShare: 1 }] },
        quality: { coverageStatus: "RECEIVED_WHILE_ONLINE", coveredSeconds: 1200,
          identityResolvedEventShare: 0.75, supportedEventCount: 32, unresolvedInteractionEventCount: 1,
          eventLatencyP95Millis: 350, caveat: "只代表本场成功持久化的受支持事件。" }
      }
    })
    await page.clock.install()
    await page.getByRole("button", { name: "查看场次分析", exact: true }).click()
    await page.getByRole("heading", { name: "互动与付费信号轨", exact: true }).waitFor()
    expect(await page.locator(".analysis-signal-marker").first().getAttribute("style")).toContain("25%")
    for (const name of ["互动趋势", "付费趋势"]) {
      await page.getByRole("img", { name, exact: true }).waitFor()
    }
    await page.getByText("原场次高频正文", { exact: true }).waitFor()
    await page.getByText("醒目留言", { exact: true }).waitFor()
    await page.getByText("350 ms", { exact: true }).waitFor()
    expect(await page.getByRole("heading", { name: "用户分层", exact: true }).locator("..").locator("..").textContent()).toContain("2 人")
    await page.screenshot({ path: resolve("../../.tools/temp/bmd-analytics-light.png"), fullPage: true, animations: "disabled" })
    const auto = page.getByRole("switch", { name: "自动刷新", exact: true })
    expect(await auto.isChecked()).toBe(false)
    expect(await page.getByRole("spinbutton", { name: "分析自动刷新秒数", exact: true }).inputValue()).toBe("10")
    const initialReads = await page.evaluate(() => window.liveFixture.sessionInsightRequests.length)
    await page.clock.runFor(11_000)
    expect(await page.evaluate(() => window.liveFixture.sessionInsightRequests.length)).toBe(initialReads)
    await page.getByRole("combobox", { name: "时间粒度", exact: true }).selectOption("60")
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionInsightRequests.at(-1)?.bucketSeconds)).toBe(60)
    await page.evaluate(() => { window.liveFixture.sessionInsightError = "分析读取失败" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "分析读取失败" }).waitFor()
    await page.getByText("原场次高频正文", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.sessionInsightError = "" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => page.getByRole("alert").filter({ hasText: "分析读取失败" }).count()).toBe(0)
  }, 20_000)

  it("session-panel completes the original detail, export and refresh workflow", async () => {
    await page.evaluate(() => {
      window.liveFixture.sessionDetailValues = { state: "END_PENDING", coverageStatus: "RECEIVED_WHILE_ONLINE",
        endedAt: null, danmakuCount: 321, giftEventCount: 4, giftCount: 12, freeGiftCount: 2,
        giftSenderCount: 3, paidUserCount: 2, interactingUserCount: 5, unresolvedInteractingEventCount: 1,
        unresolvedGiftEventCount: 1, unresolvedPaidEventCount: 1, paidAmountMilliYuan: 128000 }
      window.liveFixture.sessionUserRows = Array.from({ length: 101 }, (_, index) => ({
        actorKey: `uid:${index + 1}`, identityQuality: "VERIFIED_UID", userUid: String(index + 1),
        displayName: `身份记录${index + 1}`, danmakuCount: 2, giftEventCount: 1, giftCount: 3,
        freeGiftCount: 0, paidEventCount: 1, paidAmountMilliYuan: 6000,
        firstSeenAt: "2026-09-05T02:00:00.000Z", lastSeenAt: "2026-09-05T02:00:00.000Z"
      }))
    })
    await page.getByRole("button", { name: "查看场次", exact: true }).click()
    const detail = page.getByRole("region", { name: "所选场次详情", exact: true })
    await detail.getByText("等待结束确认：等待下一次 REST 状态复核；确认下播后关闭。", { exact: true }).waitFor()
    expect(await detail.locator(".session-panel-stat").count()).toBe(11)
    await detail.getByText("¥128.00", { exact: true }).waitFor()
    await detail.getByText("身份记录100", { exact: true }).waitFor()
    expect(await detail.getByText("身份记录101", { exact: true }).count()).toBe(0)
    expect(await page.evaluate(() => window.liveFixture.sessionUserRequests.at(-1)?.limit)).toBe(100)
    const selected = await page.locator(".live-session-list > button.is-selected").getAttribute("data-session-id")
    for (const name of ["Excel XLSX", "弹幕 CSV", "礼物 CSV", "用户 CSV", "全部 ZIP"]) {
      await detail.getByRole("button", { name, exact: true }).click()
      await detail.getByText(/^已保存：/).waitFor()
    }
    expect(await page.evaluate(() => window.liveFixture.sessionExportRequests)).toEqual(
      ["xlsx", "danmaku", "gifts", "users", "all"].map(category => ({ sessionId: selected, category })))
    const interval = page.getByRole("spinbutton", { name: "场次统计自动刷新秒数", exact: true })
    expect(await interval.inputValue()).toBe("10")
    await interval.fill("60")
    await interval.press("Tab")
    await page.evaluate(() => { window.liveFixture.sessionUsersError = "身份读取失败" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await detail.getByText("该场次只有可恢复的边界或汇总记录，部分事件和身份记录不可用。", { exact: true }).waitFor()
    await detail.getByText("¥128.00", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.sessionDetailError = "详情读取失败" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await page.getByText("该历史场次暂无可恢复的受支持事件或身份记录。", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.sessionUsersError = ""; window.liveFixture.sessionDetailError = "" })
    await page.getByRole("button", { name: "立即刷新", exact: true }).click()
    await expect.poll(() => detail.getByText("该场次只有可恢复的边界或汇总记录，部分事件和身份记录不可用。", { exact: true }).count()).toBe(0)
  }, 20_000)

  it("loads 20 boundary sessions but lets data and analysis select the 200th session", async () => {
    await page.getByRole("button", { name: "查看场次", exact: true }).click()
    await expect.poll(() => page.locator(".live-session-list > button").count()).toBe(20)
    await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
    const selector = page.getByRole("combobox", { name: "直播场次", exact: true })
    await selector.click()
    const options = page.getByRole("listbox", { name: "直播场次", exact: true }).getByRole("option")
    await expect.poll(() => options.count()).toBe(200)
    const oldest = (await options.last().innerText()).split(" · ")[0]!.slice(1)
    await selector.fill(oldest)
    await expect.poll(() => options.count()).toBe(1)
    await options.first().click()
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionEventIds.at(-1))).toBe(oldest)
    await page.evaluate(() => window.liveFixture.reload())
    expect(await selector.inputValue()).toContain(oldest)
    await page.getByRole("button", { name: "查看场次分析", exact: true }).click()
    expect(await selector.inputValue()).toContain(oldest)
    await selector.click()
    await expect.poll(() => options.count()).toBe(200)
    await selector.fill(oldest)
    await expect.poll(() => options.count()).toBe(1)
    await selector.press("Escape")
    expect(await selector.inputValue()).toContain(oldest)
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
    const sixth = "018f0f39-7b5e-4cc1-962d-000000000005"
    expect(await selector.inputValue()).toContain(sixth)
    const roomSelector = page.getByRole("combobox", { name: "直播间", exact: true })
    await roomSelector.click()
    await roomSelector.fill("121")
    await page.getByRole("option", { name: "测试主播2 · 房间 121", exact: true }).click()
    await expect.poll(() => selector.inputValue()).toContain("018f0f39-7b5e-4cc1-962d-000000001000")
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionEventIds.at(-1)))
      .toBe("018f0f39-7b5e-4cc1-962d-000000001000")
  })

  it("data-center submits drafts explicitly and exposes original page sizes and collected quality facts", async () => {
    await page.evaluate(() => {
      window.liveFixture.sessionEventRows = Array.from({ length: 255 }, (_, index) => ({
        id: `018f0f39-7b5e-4cc1-962d-${String(index + 8000).padStart(12, "0")}`,
        sessionId: "018f0f39-7b5e-4cc1-962d-000000000000", eventKind: "GIFT", command: "SEND_GIFT",
        senderUid: "9007199254740993", senderName: "采集用户", medalName: null, messageText: null,
        giftId: "1", giftName: `已采集礼物${index}`, giftCount: 3, paid: true, paidAmountMilliYuan: 6000,
        guardLevel: null, occurredAt: "2026-09-05T02:00:00.000Z", receivedAt: "2026-09-05T02:00:00.000Z"
      }))
      window.liveFixture.sessionUserRows = [{ actorKey: "uid:9007199254740993", identityQuality: "VERIFIED_UID",
        userUid: "9007199254740993", displayName: "采集用户", danmakuCount: 2, giftEventCount: 5,
        giftCount: 15, freeGiftCount: 0, paidEventCount: 5, paidAmountMilliYuan: 30000,
        firstSeenAt: "2026-09-05T02:00:00.000Z", lastSeenAt: "2026-09-05T02:00:00.000Z" }]
    })
    await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
    const events = page.locator(".live-session-events-table")
    await events.getByText("已采集礼物0", { exact: true }).waitFor()
    const initialRequests = await page.evaluate(() => window.liveFixture.sessionEventRequests.length)
    await page.getByRole("textbox", { name: "关键词", exact: true }).fill("礼物")
    await page.getByRole("textbox", { name: "用户 UID", exact: true }).fill(" 009007199254740993 ")
    await page.getByRole("combobox", { name: "事件类型", exact: true }).selectOption("GIFT")
    await page.getByRole("combobox", { name: "付费", exact: true }).selectOption("true")
    expect(await page.evaluate(() => window.liveFixture.sessionEventRequests.length)).toBe(initialRequests)
    await page.getByRole("textbox", { name: "关键词", exact: true }).press("Enter")
    await expect.poll(() => page.evaluate(() => window.liveFixture.sessionEventRequests.at(-1))).toMatchObject({
      kind: "GIFT", keyword: "礼物", userUid: "9007199254740993", paid: true, page: 1, size: 50
    })
    const pageSize = events.getByRole("combobox", { name: "每页条数", exact: true })
    expect(await pageSize.locator("option").allTextContents()).toEqual(["25 条", "50 条", "100 条"])
    await pageSize.selectOption("25")
    await expect.poll(() => events.locator("article").count()).toBe(25)
    await events.getByRole("button", { name: "下一页", exact: true }).click()
    await events.getByText("已采集礼物25", { exact: true }).waitFor()
    await events.getByRole("button", { name: "第 11 页", exact: true }).click()
    await events.getByText("已采集礼物250", { exact: true }).waitFor()
    expect(await events.getByRole("button", { name: "第 11 页", exact: true }).getAttribute("aria-current")).toBe("page")
    expect(await events.getByRole("button", { name: "下一页", exact: true }).isDisabled()).toBe(true)
    await events.getByRole("button", { name: "向前跳 5 页", exact: true }).click()
    await events.getByText("已采集礼物125", { exact: true }).waitFor()
    await events.getByRole("button", { name: "第 4 页", exact: true }).click()
    await events.getByText("已采集礼物75", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.sessionEventRequests.at(-1))).toMatchObject({
      kind: "GIFT", keyword: "礼物", userUid: "9007199254740993", paid: true, page: 4, size: 25
    })
    await page.getByRole("button", { name: "筛选", exact: true }).click()
    await events.getByText("已采集礼物0", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.sessionEventRequests.at(-1)?.page)).toBe(1)
    await events.getByText("数量 3", { exact: true }).first().waitFor()
    await page.locator(".live-session-users-table").getByText("礼物事件 5", { exact: true }).waitFor()
    await page.locator(".live-session-users-table").getByText("付费事件 5", { exact: true }).waitFor()
    const quality = page.getByRole("region", { name: "场次数据质量", exact: true })
    await quality.getByText("历史边界记录：没有可验证的在线成功解析并持久化区间；空白指标不能解释为 0。", { exact: true }).waitFor()
    expect(await quality.getByText("不可用", { exact: true }).count()).toBe(2)
    await page.setViewportSize({ width: 900, height: 1100 })
    await page.locator(".live-data-panel").screenshot({ path: resolve(process.env.TEMP!, "bmd-data-center-light.png") })
    expect(await page.locator(".live-data-panel").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }, 20_000)

  it("data-center keeps successful events on a failed filter without blocking users and clears them for another session", async () => {
    await page.evaluate(() => {
      window.liveFixture.sessionEventRows = [{ id: "018f0f39-7b5e-4cc1-962d-000000008001",
        sessionId: "018f0f39-7b5e-4cc1-962d-000000000000", eventKind: "DANMAKU", command: "DANMU_MSG",
        senderUid: null, senderName: "已保存用户", medalName: null, messageText: "上次成功事件",
        giftId: null, giftName: null, giftCount: null, paid: false, paidAmountMilliYuan: null,
        guardLevel: null, occurredAt: "2026-09-05T02:00:00.000Z", receivedAt: "2026-09-05T02:00:00.000Z" }]
    })
    await page.getByRole("button", { name: "查看数据中心", exact: true }).click()
    const events = page.locator(".live-session-events-table")
    const users = page.locator(".live-session-users-table")
    await events.getByText("上次成功事件", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.holdSessionRead = "events"; window.liveFixture.sessionEventsError = "事件查询暂时失败" })
    await page.getByRole("textbox", { name: "关键词", exact: true }).fill("新的筛选")
    await page.getByRole("textbox", { name: "关键词", exact: true }).press("Enter")
    await events.getByRole("status").filter({ hasText: "正在查询事件" }).waitFor()
    expect(await events.getByText("上次成功事件", { exact: true }).count()).toBe(1)
    expect(await users.count()).toBe(1)
    await page.evaluate(() => { window.liveFixture.holdSessionRead = undefined; window.liveFixture.releaseSessionRead(0) })
    await events.getByRole("alert").filter({ hasText: "事件查询暂时失败" }).waitFor()
    expect(await events.getByText("上次成功事件", { exact: true }).count()).toBe(1)
    expect(await events.getByText("当前筛选条件没有已保存事件。", { exact: true }).count()).toBe(0)
    await page.evaluate(() => {
      window.liveFixture.sessionEventsError = ""
      window.liveFixture.sessionEventRows = window.liveFixture.sessionEventRows.map(event => ({ ...event, messageText: "新筛选成功事件" }))
    })
    await events.getByRole("button", { name: "重试事件查询", exact: true }).click()
    await events.getByRole("alert").waitFor({ state: "detached" })
    await events.getByText("新筛选成功事件", { exact: true }).waitFor()
    await page.evaluate(() => { window.liveFixture.sessionEventsError = "切换筛选读取失败" })
    await page.getByRole("textbox", { name: "关键词", exact: true }).fill("")
    await page.getByRole("textbox", { name: "关键词", exact: true }).press("Enter")
    await events.getByRole("alert").filter({ hasText: "切换筛选读取失败" }).waitFor()
    expect(await events.getByText("新筛选成功事件", { exact: true }).count()).toBe(1)
    expect(await events.getByText("上次成功事件", { exact: true }).count()).toBe(0)
    await page.evaluate(() => { window.liveFixture.sessionEventsError = "新场次读取失败" })
    const selector = page.getByRole("combobox", { name: "直播场次", exact: true })
    await selector.click()
    await page.getByRole("listbox", { name: "直播场次", exact: true }).getByRole("option").nth(1).click()
    await events.getByRole("alert").filter({ hasText: "新场次读取失败" }).waitFor()
    expect(await events.getByText("上次成功事件", { exact: true }).count()).toBe(0)
    expect(await events.getByText("新筛选成功事件", { exact: true }).count()).toBe(0)
    expect(await events.getByText("当前筛选条件没有已保存事件。", { exact: true }).count()).toBe(0)
  }, 20_000)

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
    await form.getByRole("textbox").fill("1.5")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    expect(await page.evaluate(() => window.liveFixture.addInputs.length)).toBe(0)
    await form.getByRole("textbox").fill("9223372036854775808")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    expect(await page.evaluate(() => window.liveFixture.addInputs.length)).toBe(0)
    await form.getByRole("textbox").fill(" +0006 ")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("heading", { name: "新主播6", exact: true }).waitFor()
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    await form.getByRole("combobox").selectOption("uid")
    await form.getByRole("textbox").fill(" 22.00e0 ")
    await form.getByRole("spinbutton").fill("120")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("heading", { name: "新主播7", exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.addInputs)).toEqual([{ roomId: "6", intervalSeconds: 300 }, { uid: "22", intervalSeconds: 120 }])
    expect(await page.locator(".live-room-card").filter({ hasText: "新主播7" }).getByRole("button", { name: "已选趋势" }).count()).toBe(1)
    await page.getByRole("button", { name: "添加直播间", exact: true }).click()
    await form.getByRole("textbox").fill(" 9007199254740993 ")
    await form.getByRole("button", { name: "添加监控", exact: true }).click()
    await page.getByRole("heading", { name: "新主播8", exact: true }).waitFor()
    expect(await page.evaluate(() => window.liveFixture.addInputs[2])).toEqual({ uid: "9007199254740993", intervalSeconds: 120 })
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
