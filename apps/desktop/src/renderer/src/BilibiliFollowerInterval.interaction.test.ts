import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

// Real React/Query/input events; only the local bridge is a controlled fixture.
describe("original follower interval input and save ordering", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let pageErrors: string[]
  let externalRequests: string[]
  const firstId = "018f0f39-7b5e-7cc1-962d-000000000000"
  const pollOptions = { timeout: 1_500, interval: 25 }

  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: browserFixtureCacheDirectory, plugins: [react()],
      server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing follower interval fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html?interval-flow=1`
    browser = await chromium.launch({ headless: true })
    // Page readiness belongs to the startup budget, not a business case.
    const readyPage = await browser.newPage()
    const readyErrors: string[] = []
    const blockedResources: string[] = []
    readyPage.on("pageerror", error => readyErrors.push(error.message))
    await readyPage.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { blockedResources.push(route.request().url()); await route.abort() }
    })
    try {
      await readyPage.goto(url, { waitUntil: "commit" })
      await readyPage.getByText("测试用户1", { exact: true }).waitFor()
      expect(readyErrors).toEqual([])
      expect(blockedResources).toEqual([])
    } finally { await readyPage.close() }
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    pageErrors = []
    externalRequests = []
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.on("pageerror", error => pageErrors.push(error.message))
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { externalRequests.push(route.request().url()); await route.abort() }
    })
    await page.goto(url, { waitUntil: "commit" })
    await page.getByText("测试用户1", { exact: true }).waitFor()
    await openSettings("测试用户1")
  })
  afterEach(async () => {
    await page?.close()
    expect(pageErrors).toEqual([])
    expect(externalRequests).toEqual([])
  })

  function input() { return page.locator(".follower-settings").getByRole("spinbutton") }
  function save() { return page.locator(".follower-settings button.button") }
  function success() { return page.getByRole("status").filter({ hasText: "已更新采集间隔为" }) }
  async function openSettings(name: string): Promise<void> {
    await page.getByRole("button", { name: `展开${name}的详情`, exact: true }).click()
    await page.locator(".follower-settings summary").click()
  }
  async function refreshList(): Promise<void> {
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
  }
  async function waitList(index: number, phase: "pending" | "fulfilled" | "failed"): Promise<void> {
    await expect.poll(() => page.evaluate(position => window.followerFixture.addFlow.listCalls[position]?.phase, index), pollOptions).toBe(phase)
  }
  async function waitSettings(index: number, phase: "pending" | "fulfilled" | "failed"): Promise<void> {
    await expect.poll(() => page.evaluate(position => window.followerFixture.intervalFlow.settingsCalls[position]?.phase, index), pollOptions).toBe(phase)
  }

  it("rounds and clamps the integer model while retaining focused raw text until change", async () => {
    for (const [raw, normalized] of [["0", "1"], ["-3", "1"], ["1.5", "2"], ["60.5", "61"], ["2592001", "2592000"], ["", "1"]]) {
      await input().fill(raw!)
      expect(await input().inputValue()).toBe(raw)
      expect(await save().isDisabled()).toBe(false)
      await input().press("Tab")
      expect(await input().inputValue()).toBe(normalized)
    }
    expect(await page.evaluate(() => window.followerFixture.intervalFlow.settingsCalls)).toEqual([])
  })

  it("steps relative to the displayed value using the original dynamic thresholds", async () => {
    for (const [raw, key, result] of [
      ["59", "ArrowUp", "60"], ["60", "ArrowUp", "120"], ["120", "ArrowDown", "60"],
      ["3600", "ArrowUp", "3900"], ["86400", "ArrowUp", "90000"], ["60.5", "ArrowUp", "121"],
      ["0", "ArrowUp", "1"], ["2592000", "ArrowUp", "2592000"]
    ]) {
      await input().fill(raw!)
      await input().press(key!)
      expect(await input().inputValue()).toBe(result)
    }
  })

  it("does not submit or reload an unchanged interval", async () => {
    expect(await save().isDisabled()).toBe(true)
    await input().fill("3599.6")
    await input().press("Tab")
    expect(await input().inputValue()).toBe("3600")
    expect(await save().isDisabled()).toBe(true)
    expect(await page.evaluate(() => window.followerFixture.intervalFlow.settingsCalls.length)).toBe(0)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(1)
  })

  it("hides native mouse steppers like the source controls=false input", async () => {
    await input().fill("60")
    expect(await input().evaluate(element => getComputedStyle(element).appearance)).toBe("textfield")
    await input().hover()
    const box = await input().boundingBox()
    if (!box) throw new Error("Missing interval input geometry")
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 4)
    expect(await input().inputValue()).toBe("60")
    await input().press("ArrowUp")
    expect(await input().inputValue()).toBe("120")
  })

  it("keeps the draft on PATCH failure without a list read and allows the same retry", async () => {
    await page.evaluate(() => window.followerFixture.intervalFlow.settingsPlans.push({ error: "设置写入失败" }))
    await input().fill("600")
    await save().click()
    await waitSettings(0, "failed")
    await page.getByRole("alert").filter({ hasText: "设置写入失败" }).waitFor()
    expect(await input().inputValue()).toBe("600")
    expect(await save().isDisabled()).toBe(false)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(1)
    expect(await success().count()).toBe(0)
    await save().click()
    await waitSettings(1, "fulfilled")
    await expect.poll(() => success().allTextContents(), pollOptions).toEqual(["已更新采集间隔为 10 分"])
    expect(await page.evaluate(() => window.followerFixture.intervalFlow.settingsCalls.map(call => call.input.intervalSeconds))).toEqual([600, 600])
  })

  it("clears a previous list error when saving starts, even if PATCH subsequently fails", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ error: "之前的读取失败" }))
    await refreshList()
    await page.getByRole("alert").filter({ hasText: "之前的读取失败" }).waitFor()
    await page.evaluate(() => window.followerFixture.intervalFlow.settingsPlans.push({ hold: true }))
    await input().fill("600")
    await save().click()
    await waitSettings(0, "pending")
    expect(await page.getByRole("alert").count()).toBe(0)
    await page.evaluate(() => window.followerFixture.intervalFlow.rejectSettings(0, "新的保存失败"))
    await page.getByRole("alert").filter({ hasText: "新的保存失败" }).waitFor()
    expect(await page.getByRole("alert").count()).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
  })

  it("adopts the returned interval and clears dirty even if the single post-save read fails", async () => {
    await page.evaluate(() => {
      window.followerFixture.intervalFlow.settingsPlans.push({ intervalSeconds: 900 })
      window.followerFixture.addFlow.listPlans.push({ error: "保存后读取失败" })
    })
    await input().fill("600")
    await save().click()
    await waitList(1, "failed")
    await expect.poll(() => success().allTextContents(), pollOptions).toEqual(["已更新采集间隔为 10 分"])
    expect(await input().inputValue()).toBe("900")
    expect(await save().isDisabled()).toBe(true)
    expect(await page.locator(".follower-settings").textContent()).toContain("当前：每 1 小时")
    expect(await page.getByRole("alert").filter({ hasText: "保存后读取失败" }).count()).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    expect(await page.evaluate(() => window.followerFixture.intervalFlow.settingsCalls.length)).toBe(1)
  })

  it("stays saving through PATCH and list waiting without locking input or other actions", async () => {
    await page.evaluate(() => {
      window.followerFixture.intervalFlow.settingsPlans.push({ hold: true })
      window.followerFixture.addFlow.listPlans.push({ hold: true })
    })
    await input().fill("600")
    await save().click()
    await waitSettings(0, "pending")
    expect(await save().isDisabled()).toBe(true)
    expect(await input().isDisabled()).toBe(false)
    expect(await page.getByRole("button", { name: "立即刷新", exact: true }).isDisabled()).toBe(false)
    expect(await page.getByRole("button", { name: "暂停监控", exact: true }).isDisabled()).toBe(false)
    expect(await page.getByRole("button", { name: "删除监控与全部历史快照", exact: true }).isDisabled()).toBe(false)
    expect(await success().count()).toBe(0)
    await page.evaluate(() => window.followerFixture.intervalFlow.releaseSettings(0))
    await waitList(1, "pending")
    expect(await save().isDisabled()).toBe(true)
    expect(await success().count()).toBe(0)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    expect(await save().isDisabled()).toBe(true)
  })

  it("overwrites the model at commit but preserves focused raw text that change can submit again", async () => {
    await page.evaluate(() => {
      window.followerFixture.intervalFlow.settingsPlans.push({ hold: true })
      window.followerFixture.addFlow.listPlans.push({ error: "保持旧列表" })
    })
    await input().fill("600")
    await save().click()
    await waitSettings(0, "pending")
    await input().fill("180")
    await page.evaluate(() => window.followerFixture.intervalFlow.releaseSettings(0))
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    expect(await input().inputValue()).toBe("180")
    expect(await save().isDisabled()).toBe(true)
    await input().press("Tab")
    expect(await input().inputValue()).toBe("180")
    expect(await save().isDisabled()).toBe(false)
  })

  it("accepts a reused pre-commit list and overwrites the newly clean draft with its old snapshot", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await refreshList()
    await waitList(1, "pending")
    expect(await page.evaluate(id => window.followerFixture.addFlow.listCalls[1]!.snapshotIntervals[id], firstId)).toBe(3600)
    await input().fill("600")
    await save().click()
    await waitSettings(0, "fulfilled")
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
    expect(await input().inputValue()).toBe("600")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => success().allTextContents(), pollOptions).toEqual(["已更新采集间隔为 10 分"])
    expect(await input().inputValue()).toBe("3600")
    expect(await save().isDisabled()).toBe(true)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(2)
  })

  it("keeps a post-commit edit through list synchronization", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await input().fill("600")
    await save().click()
    await waitList(1, "pending")
    await input().fill("180")
    await input().press("Tab")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    expect(await input().inputValue()).toBe("180")
    expect(await save().isDisabled()).toBe(false)
  })

  it("treats a post-commit edit equal to the old server value as clean and replaces it on read", async () => {
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await input().fill("600")
    await save().click()
    await waitList(1, "pending")
    await input().fill("3600")
    await input().press("Tab")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    expect(await input().inputValue()).toBe("600")
    expect(await save().isDisabled()).toBe(true)
  })

  it("preserves the latent dirty flag when a read temporarily equals the draft", async () => {
    await input().fill("600")
    await input().press("Tab")
    await page.evaluate(() => window.followerFixture.updateFirst("100", 600))
    await refreshList()
    await waitList(1, "fulfilled")
    await expect.poll(() => save().isDisabled(), pollOptions).toBe(true)
    await page.evaluate(() => window.followerFixture.updateFirst("100", 300))
    await refreshList()
    await waitList(2, "fulfilled")
    await expect.poll(() => save().isDisabled(), pollOptions).toBe(false)
    expect(await input().inputValue()).toBe("600")
  })

  it("isolates a late save from another user's draft after switching details", async () => {
    await page.evaluate(() => window.followerFixture.intervalFlow.settingsPlans.push({ hold: true, intervalSeconds: 900 }))
    await input().fill("600")
    await save().click()
    await waitSettings(0, "pending")
    await openSettings("测试用户2")
    await input().fill("180")
    await input().press("Tab")
    await page.evaluate(() => window.followerFixture.intervalFlow.releaseSettings(0))
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    expect(await input().inputValue()).toBe("180")
    expect(await save().isDisabled()).toBe(false)
    await openSettings("测试用户1")
    expect(await input().inputValue()).toBe("900")
    expect(await save().isDisabled()).toBe(true)
  })

  it("confirms saving without waiting for the queued history request", async () => {
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length), pollOptions).toBe(1)
    await page.evaluate(() => { window.followerFixture.holdTrends = true })
    await input().fill("600")
    await save().click()
    await expect.poll(() => success().count(), pollOptions).toBe(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends), pollOptions).toBe(1)
    expect(await save().isDisabled()).toBe(true)
    await page.evaluate(() => window.followerFixture.trendReleases.forEach(release => release()))
  })
})
