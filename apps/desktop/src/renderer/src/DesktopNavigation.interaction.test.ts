import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { expect, it } from "vitest"

import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

it("keeps new sidebar entries routable when an older navigation module survives a hot update", async () => {
  let server: ViteDevServer | undefined
  let browser: Browser | undefined
  const legacyModelId = "virtual:legacy-navigation-model"
  try {
    server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL(".", import.meta.url)),
      // This server transforms the module graph, so it cannot share the ordinary fixture optimizer cache.
      cacheDir: `${browserFixtureCacheDirectory}-navigation-recovery`,
      plugins: [{
        name: "retained-navigation-model",
        enforce: "pre",
        resolveId(id) { return id === legacyModelId ? `\0${legacyModelId}` : undefined },
        load(id) {
          if (id !== `\0${legacyModelId}`) return undefined
          // Reproduce the observed client: the parser retains five entries while the sidebar has seven.
          return `export * from "/product-model.ts";
            import { navigationGroups as current } from "/product-model.ts";
            export const navigationGroups = current.map(group => ({ ...group,
              items: group.items.filter(item => !["live-data", "live-analytics"].includes(item.pageId)) }));`
        },
        transform(source, id) {
          if (!id.split("?")[0]!.replaceAll("\\", "/").endsWith("/navigation-state.ts")) return undefined
          return source.replace('from "./product-model"', `from "${legacyModelId}"`)
        }
      }, react()],
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error"
    })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing navigation fixture port")
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(5_000)
    page.setDefaultNavigationTimeout(10_000)
    await page.goto(`http://127.0.0.1:${address.port}/__fixtures__/tab-rail.html`)
    const navigation = page.getByRole("navigation", { name: "业务导航" })

    for (const [label, hash] of [
      ["数据中心", "#live-data"], ["分析看板", "#live-analytics"], ["数据中心", "#live-data"]
    ] as const) {
      await navigation.getByRole("button", { name: label, exact: true }).click()
      await page.waitForFunction(expected => location.hash === expected, hash)
      // Wait past the hashchange task so a transient click render cannot hide the fallback.
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe(label)
      expect(await navigation.getByRole("button", { name: label, exact: true }).getAttribute("aria-current")).toBe("page")
    }

    await page.reload()
    await page.getByRole("heading", { level: 1, name: "数据中心", exact: true }).waitFor()
    await page.goBack()
    await page.getByRole("heading", { level: 1, name: "分析看板", exact: true }).waitFor()
    expect(new URL(page.url()).hash).toBe("#live-analytics")
  } finally {
    try { await browser?.close() } finally { await server?.close() }
  }
}, 30_000)
