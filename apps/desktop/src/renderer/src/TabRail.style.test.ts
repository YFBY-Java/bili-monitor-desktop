import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createBrowserStartupObserver, type BrowserStartupObserver } from "./__fixtures__/browser-startup-observer"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

function contrast(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  }
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

describe("workspace tab visual hierarchy", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let suiteStartup: BrowserStartupObserver, pageStartup: BrowserStartupObserver
  beforeAll(async () => {
    const startup = createBrowserStartupObserver("tab-rail", "beforeAll")
    suiteStartup = startup
    server = await startup.run("server.create", () => createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory, plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }))
    await startup.run("server.listen", () => server.listen())
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/tab-rail.html`
    browser = await startup.run("browser.launch", () => chromium.launch({ headless: true }))
  }, 30_000)
  afterAll(async () => {
    const startup = suiteStartup; startup?.stop()
    try { await startup.run("browser.close", () => browser?.close()); await startup.run("server.close", () => server?.close()) }
    finally { startup?.finish() }
  })
  beforeEach(async () => {
    const startup = createBrowserStartupObserver("tab-rail", "beforeEach")
    pageStartup = startup
    const setupPage = await startup.run("page.create", () => browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }))
    if (!startup.attachPage(setupPage)) {
      try { await startup.run("page.close", () => setupPage.close()) } finally { startup.finish() }
      return
    }
    page = setupPage
    await startup.run("page.goto", () => page.goto(url))
    await startup.run("page.visible", () => page.getByRole("tablist").waitFor())
  }, 20_000)
  afterEach(async () => {
    const startup = pageStartup; startup?.stop()
    try { await startup.run("page.close", () => page?.close()) } finally { startup?.finish() }
  })

  it("uses lifted warm dark surfaces with readable labels throughout the workspace", async () => {
    await page.getByRole("button", { name: "切换至深色主题" }).click()
    const navigation = page.getByRole("navigation", { name: "业务导航" })
    await navigation.getByRole("button", { name: "分析看板", exact: true }).click()
    await page.getByRole("region", { name: "分析看板", exact: true }).waitFor()
    const captureStage = process.env.BMD_DARK_CAPTURE_STAGE === "before" ? "before" : "after"
    if (process.env.BMD_CAPTURE_DARK_THEME === "1") {
      await page.screenshot({ path: resolve(`../../.tools/temp/dark-theme-analysis-${captureStage}.png`) })
    }
    const surfaces = await page.evaluate(() => {
      const style = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Missing theme surface: ${selector}`)
        const computed = getComputedStyle(element)
        return { background: computed.backgroundColor, color: computed.color }
      }
      return { scheme: getComputedStyle(document.querySelector(".desktop-shell")!).colorScheme,
        main: style(".workspace-main"), sidebar: style(".sidebar"), topbar: style(".topbar"),
        card: style(".analysis-card"), field: style(".analysis-controls select"),
        icon: style(".topbar .icon-button"), selected: style(".nav-item.is-active"),
        group: style(".nav-group-label"), description: style(".heading-copy > span"),
        action: style(".heading-actions .button-primary") }
    })
    for (const surface of [surfaces.main, surfaces.sidebar, surfaces.topbar, surfaces.card, surfaces.field, surfaces.icon]) {
      const channels = surface.background.match(/\d+/g)!.slice(0, 3).map(Number)
      expect(Math.min(...channels)).toBeGreaterThanOrEqual(40)
      expect(Math.max(...channels)).toBeLessThan(100)
    }
    expect(surfaces.scheme).toBe("dark")
    expect(surfaces.card.background).not.toBe(surfaces.main.background)
    expect(contrast(surfaces.card.color, surfaces.card.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(surfaces.field.color, surfaces.field.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(surfaces.group.color, surfaces.sidebar.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(surfaces.description.color, surfaces.main.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(surfaces.selected.color, surfaces.selected.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(surfaces.action.color, surfaces.action.background)).toBeGreaterThanOrEqual(4.5)

    await navigation.getByRole("button", { name: "抖音登录态", exact: true }).click()
    const authCard = page.getByRole("region", { name: "抖音 Web 扫码登录", exact: true })
    await authCard.waitFor()
    const auth = await authCard.evaluate(element => {
      const card = getComputedStyle(element), heading = getComputedStyle(element.querySelector("h3")!)
      return { background: card.backgroundColor, color: heading.color }
    })
    expect(auth.background).toBe(surfaces.card.background)
    expect(contrast(auth.color, auth.background)).toBeGreaterThanOrEqual(4.5)
    if (process.env.BMD_CAPTURE_DARK_THEME === "1") {
      await page.screenshot({ path: resolve(`../../.tools/temp/dark-theme-auth-${captureStage}.png`) })
    }
  })

  it("opens standalone data and analysis entries while retaining the live-page tabs", async () => {
    const navigation = page.getByRole("navigation", { name: "业务导航" })
    const data = navigation.getByRole("button", { name: "数据中心", exact: true })
    await data.click({ timeout: 2_000 })
    await page.getByRole("heading", { level: 1, name: "数据中心", exact: true }).waitFor()
    await page.getByText("数据中心暂无来源", { exact: true }).waitFor()
    expect(await data.getAttribute("aria-current")).toBe("page")
    expect(new URL(page.url()).hash).toBe("#live-data")
    expect(await page.getByRole("tablist").count()).toBe(0)

    await page.getByRole("button", { name: "切换侧边栏" }).click()
    const analysis = navigation.getByRole("button", { name: "分析看板", exact: true })
    await analysis.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("heading", { level: 1, name: "分析看板", exact: true }).waitFor()
    await page.getByRole("region", { name: "分析看板", exact: true }).waitFor()
    expect(await analysis.getAttribute("aria-current")).toBe("page")
    expect(new URL(page.url()).hash).toBe("#live-analytics")

    await page.getByRole("combobox", { name: "时间粒度", exact: true }).selectOption("900")
    await data.click()
    await analysis.click()
    expect(await page.getByRole("combobox", { name: "时间粒度", exact: true }).inputValue()).toBe("900")

    await page.reload()
    await page.getByRole("heading", { level: 1, name: "分析看板", exact: true }).waitFor()
    await page.goBack()
    await page.getByRole("heading", { level: 1, name: "数据中心", exact: true }).waitFor()
    await navigation.getByRole("button", { name: "直播间监控", exact: true }).click()
    await page.getByRole("tab", { name: "数据中心", exact: true }).click()
    expect(await page.getByRole("tab", { name: "数据中心", selected: true }).count()).toBe(1)
    await page.getByRole("tab", { name: "场次分析", exact: true }).click()
    await page.getByRole("region", { name: "分析看板", exact: true }).waitFor()
  })

  for (const theme of ["light", "dark"] as const) {
    it(`distinguishes selected tabs with a filled surface and readable type in ${theme} mode`, async () => {
      if (theme === "dark") await page.getByRole("button", { name: "切换至深色主题" }).click()
      await page.getByRole("tab", { name: "数据中心", exact: true }).click()
      const rail = page.getByRole("tablist")
      const selected = rail.getByRole("tab", { selected: true })
      expect(await selected.count()).toBe(1)
      expect(await selected.textContent()).toBe("数据中心")
      await selected.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished))
      })
      const metrics = await selected.evaluate((element) => {
        const style = getComputedStyle(element)
        const surface = getComputedStyle(element.parentElement!)
        const inactive = getComputedStyle(element.parentElement!.querySelector('[aria-selected="false"]')!)
        return { background: style.backgroundColor, color: style.color, fontWeight: Number(style.fontWeight),
          fontSize: parseFloat(style.fontSize), height: element.getBoundingClientRect().height,
          railBackground: surface.backgroundColor, railRadius: parseFloat(surface.borderRadius),
          inactiveColor: inactive.color, inactiveWeight: Number(inactive.fontWeight) }
      })
      expect(metrics.background).not.toBe("rgba(0, 0, 0, 0)")
      expect(metrics.railBackground).not.toBe("rgba(0, 0, 0, 0)")
      expect(metrics.background).not.toBe(metrics.railBackground)
      expect(metrics.fontSize).toBeGreaterThanOrEqual(14)
      expect(metrics.fontWeight).toBeGreaterThanOrEqual(700)
      expect(metrics.inactiveWeight).toBeGreaterThanOrEqual(600)
      expect(metrics.height).toBeGreaterThanOrEqual(40)
      expect(metrics.railRadius).toBeGreaterThan(0)
      expect(contrast(metrics.color, metrics.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(metrics.inactiveColor, metrics.railBackground)).toBeGreaterThanOrEqual(4.5)
      if (theme === "light") {
        expect(metrics.background).toBe("rgb(255, 228, 238)")
        expect(metrics.color).toBe("rgb(152, 70, 100)")
      }
      if (process.env.BMD_CAPTURE_TAB_RAIL === "1") {
        await rail.screenshot({ path: resolve(`../../.tools/temp/tab-rail-${theme}.png`) })
      }
    })
  }

  it("wraps complete tab labels within a narrow workspace and keeps keyboard focus visible", async () => {
    await page.setViewportSize({ width: 900, height: 1000 })
    const rail = page.getByRole("tablist")
    const geometry = await rail.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, viewport: window.innerWidth,
        tabs: Array.from(element.querySelectorAll('button[role="tab"]')).map((button) => ({
          left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right,
          top: button.getBoundingClientRect().top,
          whiteSpace: getComputedStyle(button).whiteSpace
        })) }
    })
    expect(geometry.tabs).toHaveLength(8)
    const rowSizes = [...new Set(geometry.tabs.map((tab) => tab.top))]
      .map((top) => geometry.tabs.filter((tab) => tab.top === top).length)
    expect(rowSizes).toEqual([4, 4])
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport)
    for (const tab of geometry.tabs) {
      expect(tab.whiteSpace).toBe("nowrap")
      expect(tab.left).toBeGreaterThanOrEqual(geometry.left)
      expect(tab.right).toBeLessThanOrEqual(geometry.right)
    }
    const last = rail.getByRole("tab", { name: "场次分析", exact: true })
    await last.focus()
    await page.keyboard.press("Enter")
    expect(await last.getAttribute("aria-selected")).toBe("true")
    expect(await last.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2)
    if (process.env.BMD_CAPTURE_TAB_RAIL === "1") {
      await rail.screenshot({ path: resolve("../../.tools/temp/tab-rail-narrow.png") })
    }
  })
})
