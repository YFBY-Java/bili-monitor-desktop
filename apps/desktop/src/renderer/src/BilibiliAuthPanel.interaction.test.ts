import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

describe("original Bilibili auth actions in the Connected renderer", () => {
  let server: ViteDevServer, browser: Browser, page: Page, url: string
  let errors: string[]
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)), plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/bilibili-auth.html`
    browser = await chromium.launch({ headless: true })
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.route("https://**/*", route => route.abort())
    await page.goto(`${url}?active=1`)
    await page.getByRole("button", { name: "查看完整登录态" }).waitFor()
  })
  afterEach(async () => { await page?.close(); expect(errors).toEqual([]) })

  it("refreshes status while logged out and recovers a failed status read without calling credential refresh", async () => {
    await page.goto(url)
    await page.getByText("未配置登录态", { exact: true }).waitFor()
    const refresh = page.getByRole("button", { name: "刷新校验", exact: true })
    expect(await refresh.isEnabled()).toBe(true)
    await page.evaluate(() => { window.bilibiliAuthFixture.statusError = "合成状态读取失败" })
    await refresh.click()
    await page.getByText("合成状态读取失败", { exact: false }).first().waitFor()
    await page.evaluate(() => { window.bilibiliAuthFixture.statusError = ""; window.bilibiliAuthFixture.signedIn = true })
    await refresh.click()
    await page.getByRole("button", { name: "查看完整登录态" }).waitFor()
    expect(await page.evaluate(() => window.bilibiliAuthFixture.calls.includes("refresh"))).toBe(false)
  })

  it("revalidates active credentials then reloads status and explains that cookies were not refreshed", async () => {
    await page.getByRole("button", { name: "刷新校验", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "此操作不会刷新 Cookie" }).waitFor()
    expect(await page.evaluate(() => window.bilibiliAuthFixture.calls)).toEqual(["status", "refresh", "status"])
    expect(await page.locator(".bilibili-auth-panel").textContent()).toContain("到期")
  })

  it("refreshes a waiting QR and isolates the previous in-flight poll with one request at a time", async () => {
    await page.evaluate(() => { window.bilibiliAuthFixture.holdPoll = true; window.bilibiliAuthFixture.pollResult = { status: "SUCCESS", message: "旧二维码成功" } })
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "扫码登录 Bilibili" })
    const refresh = dialog.getByRole("button", { name: "刷新二维码", exact: true })
    expect(await refresh.count()).toBe(1)
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.pollIds.length)).toBe(1)
    await page.evaluate(() => { window.bilibiliAuthFixture.pollResult = { status: "WAITING", message: "新二维码等待" } })
    await refresh.click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.started)).toBe(2)
    await page.waitForTimeout(350)
    expect(await page.evaluate(() => window.bilibiliAuthFixture.pollIds.length)).toBe(1)
    await page.evaluate(() => { window.bilibiliAuthFixture.holdPoll = false; window.bilibiliAuthFixture.pollReleases.shift()?.() })
    await dialog.getByText("新二维码等待", { exact: true }).waitFor()
    expect(await page.evaluate(() => window.bilibiliAuthFixture.maxPollActive)).toBe(1)
    expect(await page.evaluate(() => window.bilibiliAuthFixture.calls.filter(value => value === "status").length)).toBe(1)
  })

  it("ignores a QR generation that completes after close and reopen", async () => {
    await page.evaluate(() => { window.bilibiliAuthFixture.holdStart = true })
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.startReleases.length)).toBe(1)
    await page.getByRole("button", { name: "关闭扫码登录" }).click()
    expect(await page.getByRole("button", { name: "重新扫码", exact: true }).isEnabled()).toBe(true)
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.startReleases.length)).toBe(2)
    await page.evaluate(() => window.bilibiliAuthFixture.startReleases[1]?.())
    await page.getByRole("img", { name: "Bilibili 登录二维码" }).waitFor()
    const image = await page.getByRole("img", { name: "Bilibili 登录二维码" }).getAttribute("src")
    await page.evaluate(() => window.bilibiliAuthFixture.startReleases[0]?.())
    await page.waitForTimeout(400)
    expect(await page.getByRole("img", { name: "Bilibili 登录二维码" }).getAttribute("src")).toBe(image)
    expect(await page.evaluate(() => window.bilibiliAuthFixture.pollIds.every(id => id.endsWith("000000000002")))).toBe(true)
  })

  it("shows generation failure inside the dialog and lets the user regenerate", async () => {
    await page.evaluate(() => { window.bilibiliAuthFixture.startError = "合成生成失败" })
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "扫码登录 Bilibili" })
    await dialog.getByRole("alert").filter({ hasText: "合成生成失败" }).waitFor()
    await page.evaluate(() => { window.bilibiliAuthFixture.startError = "" })
    await dialog.getByRole("button", { name: "重新生成二维码" }).click()
    await dialog.getByRole("img", { name: "Bilibili 登录二维码" }).waitFor()
  })

  it.each(["SUCCESS", "EXPIRED", "FAILED"] as const)("renders %s and ends polling until explicit regeneration", async status => {
    await page.evaluate(value => { window.bilibiliAuthFixture.pollResult = { status: value, message: "合成终态", account: { mid: "99", uname: "扫码合成账号" }, expiresInSeconds: 0 } }, status)
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "扫码登录 Bilibili" })
    await dialog.getByText("合成终态", { exact: true }).waitFor()
    if (status === "SUCCESS") await dialog.getByText("扫码合成账号", { exact: true }).waitFor()
    expect(await dialog.getByRole("button", { name: status === "SUCCESS" ? "刷新二维码" : "重新生成二维码" }).count()).toBe(1)
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => window.bilibiliAuthFixture.pollIds.length)).toBe(1)
  })

  it("copies each original credential field and every account field with feedback, without caching secrets", async () => {
    await page.getByRole("button", { name: "查看完整登录态" }).click()
    const dialog = page.getByRole("dialog", { name: "完整 Bilibili 登录态" })
    const names = ["Cookie Header", "bili_jct / CSRF", "refresh_token", "Raw Payload"]
    for (const name of names) await dialog.getByRole("button", { name: `复制 ${name}`, exact: true }).click()
    await dialog.getByRole("button", { name: "一键复制全部" }).click()
    await dialog.getByRole("status").filter({ hasText: "已复制" }).waitFor()
    const copied = await page.evaluate(() => window.bilibiliAuthFixture.clipboard)
    expect(copied.slice(0, 4)).toEqual(["SESSDATA=SYNTHETIC_AUTH_VALUE; bili_jct=SYNTHETIC_CSRF; DedeUserID=99", "SYNTHETIC_CSRF", "SYNTHETIC_REFRESH", JSON.stringify({ synthetic: true }, null, 2)])
    expect(copied[4]).toContain("expiresAt: 2026-12-13T04:00:00.000Z")
    expect(copied[4]).toContain("face: https://example.test/synthetic-face.png")
    expect(copied[4]).toContain("level: 0\nvipStatus: 0")
    expect(await page.evaluate(() => JSON.stringify(window.bilibiliAuthFixture.queryData()))).not.toContain("SYNTHETIC_AUTH_VALUE")
    await page.evaluate(() => { window.bilibiliAuthFixture.copyError = "合成剪贴板失败" })
    await dialog.getByRole("button", { name: "一键复制全部" }).click()
    await dialog.getByRole("alert").filter({ hasText: "合成剪贴板失败" }).waitFor()
  })

  it("discards a credential response received after drawer close", async () => {
    await page.evaluate(() => { window.bilibiliAuthFixture.holdCredential = true })
    await page.getByRole("button", { name: "查看完整登录态" }).click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.credentialReleases.length)).toBe(1)
    await page.getByRole("button", { name: "关闭登录态" }).click()
    await page.evaluate(() => window.bilibiliAuthFixture.credentialReleases[0]?.())
    await expect.poll(() => page.getByRole("button", { name: "查看完整登录态" }).isEnabled()).toBe(true)
    await page.getByRole("button", { name: "查看完整登录态" }).click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.credentialReleases.length)).toBe(2)
    expect(await page.getByRole("dialog", { name: "完整 Bilibili 登录态" }).textContent()).not.toContain("SYNTHETIC_AUTH_VALUE")
    await page.evaluate(() => window.bilibiliAuthFixture.credentialReleases[1]?.())
    await page.getByText("SESSDATA=SYNTHETIC_AUTH_VALUE", { exact: false }).first().waitFor()
  })

  it("does not revoke on cancellation or pretend a failed revoke succeeded", async () => {
    page.once("dialog", dialog => { void dialog.dismiss() })
    await page.getByRole("button", { name: "移除登录态" }).click()
    expect(await page.evaluate(() => window.bilibiliAuthFixture.calls.includes("revoke"))).toBe(false)
    await page.evaluate(() => { window.bilibiliAuthFixture.actionError = "合成撤销失败" })
    page.once("dialog", dialog => { void dialog.accept() })
    await page.getByRole("button", { name: "移除登录态" }).click()
    await page.getByRole("alert").filter({ hasText: "合成撤销失败" }).waitFor()
    expect(await page.getByRole("button", { name: "查看完整登录态" }).count()).toBe(1)
    await page.evaluate(() => { window.bilibiliAuthFixture.actionError = "" })
    page.once("dialog", dialog => { void dialog.accept() })
    await page.getByRole("button", { name: "移除登录态" }).click()
    await page.getByText("未配置登录态", { exact: true }).waitFor()
  })

  it("does not resume polling after unmount", async () => {
    await page.evaluate(() => { window.bilibiliAuthFixture.holdPoll = true })
    await page.getByRole("button", { name: "重新扫码", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.bilibiliAuthFixture.pollIds.length)).toBe(1)
    await page.getByRole("button", { name: "挂载或卸载登录面板" }).evaluate((element: HTMLButtonElement) => element.click())
    await page.evaluate(() => window.bilibiliAuthFixture.pollReleases[0]?.())
    await page.waitForTimeout(1200)
    expect(await page.getByRole("dialog").count()).toBe(0)
    expect(await page.evaluate(() => window.bilibiliAuthFixture.pollIds.length)).toBe(1)
  })

  it("keeps auth actions and credential copy controls readable in light, dark and narrow layouts", async () => {
    await page.setViewportSize({ width: 760, height: 1050 })
    const columns = await page.locator(".bilibili-auth-panel").evaluate(element => getComputedStyle(element).gridTemplateColumns)
    expect(columns.trim().split(/\s+/)).toHaveLength(1)
    await page.screenshot({ path: resolve(process.env.TEMP!, "m07-auth-narrow-panel.png") })
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.getByRole("button", { name: "查看完整登录态" }).click()
    const copy = page.getByRole("button", { name: "复制 Cookie Header", exact: true })
    await copy.waitFor()
    expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(40)
    for (const theme of ["light", "dark"]) {
      await page.locator("main").evaluate((element, value) => { element.setAttribute("class", value === "light" ? "theme-light" : "") }, theme)
      await page.screenshot({ path: resolve(process.env.TEMP!, `m07-auth-${theme}.png`) })
    }
    await page.setViewportSize({ width: 760, height: 1050 })
    await page.locator("main").evaluate(element => { element.setAttribute("class", "theme-light") })
    const bounds = (await copy.boundingBox())!
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(760)
    await page.screenshot({ path: resolve(process.env.TEMP!, "m07-auth-narrow.png") })
  })
})
