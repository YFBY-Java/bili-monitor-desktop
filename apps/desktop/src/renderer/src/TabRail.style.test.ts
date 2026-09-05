import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

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
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-tab-rail-test"), plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/tab-rail.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
    await page.goto(url)
    await page.getByRole("tablist").waitFor()
  }, 20_000)
  afterEach(async () => { await page?.close() })

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
