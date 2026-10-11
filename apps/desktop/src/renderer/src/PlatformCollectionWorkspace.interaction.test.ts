import react from "@vitejs/plugin-react"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

it("uses the registered adapter and real run-once bridge without presenting reserved capabilities as implemented", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
    cacheDir: browserFixtureCacheDirectory,
    plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture address")
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(2_000)
    const requestedModules = new Set<string>()
    page.on("request", request => requestedModules.add(new URL(request.url()).pathname))
    await page.goto(`http://127.0.0.1:${address.port}/__fixtures__/platform-collection.html`)
    await page.getByRole("heading", { name: "平台管理与单次采集", exact: true }).waitFor()
    expect([...requestedModules].filter(path => /\/(?:BilibiliFollowerWorkspace|BilibiliLiveWorkspace|BilibiliSubjectWorkspace|BilibiliAuthPanel|DouyinAuthWorkspace)\.tsx$/.test(path))).toEqual([])
    expect(await page.getByRole("button", { name: "平台采集", exact: true }).count()).toBe(1)
    await expect.poll(() => page.evaluate(() => window.platformCollectionFixture.listCalls)).toBe(1)
    expect(await page.getByText("CONTENT_LIST · 预留", { exact: true }).count()).toBe(1)
    await page.getByLabel("B站 UID", { exact: true }).fill("-0001")
    await page.getByRole("button", { name: "单次采集账号资料", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.platformCollectionFixture.calls.length)).toBe(1)
    await page.getByText("离线资料账号", { exact: true }).waitFor()
    expect(await page.getByText("9007199254740995", { exact: true }).count()).toBe(1)
    expect(await page.evaluate(() => window.platformCollectionFixture.calls[0])).toEqual({ platformCode: "bilibili", dataType: "account", externalId: "-0001" })
    await page.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/bmd-platform-collection-light.png", import.meta.url)) })
    await page.getByRole("button", { name: "单次采集账号资料", exact: true }).click()
    await page.getByRole("alert").getByText("离线网络失败", { exact: true }).waitFor()
    expect(await page.getByText("MANUAL_REVIEW", { exact: true }).count()).toBe(1)
    await page.getByRole("button", { name: "刷新 Adapter", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.platformCollectionFixture.listCalls)).toBe(2)
    await page.route("**/DouyinAuthWorkspace.tsx", route => route.abort())
    await page.getByRole("button", { name: "抖音登录态", exact: true }).click()
    await page.getByRole("alert").getByText("页面加载失败，请重新加载。", { exact: true }).waitFor()
    await page.unroute("**/DouyinAuthWorkspace.tsx")
    await page.getByRole("button", { name: "重新加载页面", exact: true }).click()
    await page.getByRole("heading", { name: "平台管理与单次采集", exact: true }).waitFor()
    expect(await page.getByRole("button", { name: "平台采集", exact: true }).count()).toBe(1)
    await page.getByRole("button", { name: "抖音登录态", exact: true }).click()
    await page.locator(".douyin-auth-workspace").waitFor()
    expect(await page.getByText("页面加载失败，请重新加载。", { exact: true }).count()).toBe(0)
  } finally { await browser?.close(); await server.close() }
}, 15_000)
