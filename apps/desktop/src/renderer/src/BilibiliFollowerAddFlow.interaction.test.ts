import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

import react from "@vitejs/plugin-react"
import { chromium, type Browser, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

// Only the narrow bridge is simulated; these assertions exercise the real React
// workspace, Query lifecycle, drawers and original add/list/trend ordering.
describe("original follower add flow and drawer ownership", () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let url: string
  let pageErrors: string[]
  let externalRequests: string[]
  let startedAt: number
  let phases: { phase: string; ms: number }[]
  let pendingResources: Set<string>
  function recordPhase(phase: string): void {
    if (phases.length < 100) phases.push({ phase, ms: Math.round(performance.now() - startedAt) })
  }
  const firstId = "018f0f39-7b5e-7cc1-962d-000000000000"
  const pollOptions = { timeout: 1_500, interval: 25 }

  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL(".", import.meta.url)),
      cacheDir: resolve("node_modules/.vite-follower-add-flow-test"),
      plugins: [react()], server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === "string") throw new Error("Missing follower add fixture port")
    url = `http://127.0.0.1:${address.port}/__fixtures__/follower-workspace.html?add-flow=1`
    browser = await chromium.launch({ headless: true })
    // listen() only makes the HTTP socket ready. Cold dependency compilation
    // belongs to the existing startup budget, not each business case's budget.
    const readyPage = await browser.newPage()
    const readyErrors: string[] = []
    const blockedResources: string[] = []
    readyPage.on("pageerror", error => readyErrors.push(error.message))
    await readyPage.route("**/*", async route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) await route.continue()
      else { blockedResources.push(new URL(route.request().url()).pathname); await route.abort() }
    })
    const startupStarted = performance.now()
    try {
      await readyPage.goto(url, { waitUntil: "commit" })
      await readyPage.getByRole("button", { name: "添加用户", exact: true }).waitFor()
      expect(readyErrors).toEqual([])
      expect(blockedResources).toEqual([])
      console.info("Follower add fixture ready", { startupMs: Math.round(performance.now() - startupStarted) })
    } finally { await readyPage.close() }
  }, 30_000)
  afterAll(async () => { await browser?.close(); await server?.close() })
  beforeEach(async () => {
    startedAt = performance.now()
    phases = []
    pendingResources = new Set()
    recordPhase("page:create")
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    recordPhase("page:created")
    pageErrors = []
    externalRequests = []
    page.on("pageerror", error => pageErrors.push(error.message))
    page.on("request", request => pendingResources.add(new URL(request.url()).pathname))
    page.on("requestfinished", request => pendingResources.delete(new URL(request.url()).pathname))
    page.on("requestfailed", request => pendingResources.delete(new URL(request.url()).pathname))
    const localOrigin = new URL(url).origin
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).origin === localOrigin) await route.continue()
      else { externalRequests.push(route.request().url()); await route.abort() }
    })
  })
  afterEach(async ({ task }) => {
    if (task.result?.state === "fail") console.warn("Follower add fixture phases", {
      phases, pendingResourceCount: pendingResources.size, pendingResources: [...pendingResources].slice(0, 100)
    })
    await page?.close()
    expect(pageErrors).toEqual([])
    expect(externalRequests).toEqual([])
  })

  async function openFixture(holdInitialList = false): Promise<void> {
    recordPhase("fixture:navigate")
    await page.goto(`${url}${holdInitialList ? "&hold-initial-list=1" : ""}`, { waitUntil: "commit" })
    recordPhase("fixture:committed")
    await page.getByRole("button", { name: "添加用户", exact: true }).waitFor()
    recordPhase("fixture:mounted")
    if (!holdInitialList) await page.getByText("测试用户1", { exact: true }).waitFor()
    else await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.listCalls[0]?.phase), pollOptions).toBe("pending")
    recordPhase("fixture:list-ready")
  }
  function dialog() { return page.getByRole("dialog", { name: "添加 B站监控用户" }) }
  async function enterDraft(mid: string, interval = 600): Promise<void> {
    recordPhase("draft:open")
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    await dialog().getByRole("textbox").fill(mid)
    await dialog().getByRole("spinbutton").fill(String(interval))
    recordPhase("draft:ready")
  }
  async function submitDraft(): Promise<void> {
    recordPhase("add:submit")
    await dialog().getByRole("button", { name: "添加监控", exact: true }).click()
    recordPhase("add:submitted")
  }
  async function selectedNames(): Promise<string[]> {
    return page.locator(".trend-selector input:checked").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label") ?? ""))
  }
  async function createdId(index = 0): Promise<string> {
    await expect.poll(() => page.evaluate(position => window.followerFixture.addFlow.addCalls[position]?.phase, index), pollOptions).toBe("fulfilled")
    const id = await page.evaluate(position => window.followerFixture.addFlow.addCalls[position]?.userId, index)
    if (!id) throw new Error("Successful fixture add did not return a user ID")
    recordPhase("add:committed")
    return id
  }
  async function releaseInitialReadAfterAdding(): Promise<string> {
    await openFixture(true)
    await enterDraft("55")
    await submitDraft()
    const id = await createdId()
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.length)).toBe(1)
    expect(await page.evaluate(newId => window.followerFixture.addFlow.listCalls[0]!.snapshotIds.includes(newId), id)).toBe(false)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(0))
    await page.getByText("测试用户1", { exact: true }).waitFor()
    return id
  }

  it("prunes missing selections before filling the fourth slot with the added user", async () => {
    await openFixture()
    for (let index = 0; index < 4; index++) await page.locator(".trend-selector input").nth(index).check()
    await page.evaluate(id => window.followerFixture.addFlow.addPlans.push({ removeIds: [id] }), firstId)
    await enterDraft("55")
    await submitDraft()
    const id = await createdId()
    await expect.poll(selectedNames, pollOptions).toEqual([
      "测试用户2趋势对比", "测试用户3趋势对比", "测试用户4趋势对比", "新增用户55趋势对比"
    ])
    await expect.poll(() => page.evaluate(newId => window.followerFixture.trendRequests.some(request => request.userIds?.includes(newId)), id), pollOptions).toBe(true)
  })

  it("queries the raw added selection when a reused initial list has not seen it yet", async () => {
    const id = await releaseInitialReadAfterAdding()
    expect(await page.locator(".follower-card").count()).toBe(5)
    await expect.poll(() => page.evaluate(newId => window.followerFixture.trendRequests.some(request => request.userIds?.includes(newId)), id), pollOptions).toBe(true)
  })

  it("keeps the added selection when a later fresh list replaces the old initial snapshot", async () => {
    await releaseInitialReadAfterAdding()
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.getByRole("checkbox", { name: "新增用户55趋势对比" }).count(), pollOptions).toBe(1)
    expect(await page.getByRole("checkbox", { name: "新增用户55趋势对比" }).isChecked()).toBe(true)
  })

  it("settles a removed user's raw history rejection after reusing an old list", async () => {
    await openFixture()
    await page.getByRole("checkbox", { name: "测试用户1趋势对比" }).check()
    await expect.poll(() => page.evaluate(() => window.followerFixture.trendFinishedAt.length), pollOptions).toBe(1)
    await page.evaluate(id => {
      window.followerFixture.addFlow.listPlans.push({ hold: true })
      window.followerFixture.addFlow.addPlans.push({ removeIds: [id] })
    }, firstId)
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.listCalls[1]?.phase), pollOptions).toBe("pending")
    await enterDraft("55")
    await submitDraft()
    await createdId()
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await page.getByRole("alert").filter({ hasText: "监控用户不存在" }).waitFor()
    expect(await page.evaluate(() => window.followerFixture.activeTrends)).toBe(0)
    expect(await page.getByRole("status").filter({ hasText: "已添加监控用户" }).count()).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(1)
  })

  it("finishes one post-add list failure without retrying the add or discarding old data", async () => {
    await openFixture()
    await page.evaluate(() => { window.followerFixture.addFlow.listFailure = "添加后的本地读取失败" })
    await enterDraft("55")
    await submitDraft()
    await createdId()
    await page.getByRole("alert").filter({ hasText: "更新失败，保留上次数据：添加后的本地读取失败" }).waitFor()
    expect(await page.locator(".follower-card").count()).toBe(5)
    expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(1)
    expect(await page.evaluate(() => window.followerFixture.addFlow.listCalls.filter(call => call.error === "添加后的本地读取失败").length)).toBe(1)
    await expect.poll(() => dialog().count(), pollOptions).toBe(0)
  })

  it("reads the raw new user's history despite a failed list and keeps its selection on recovery", async () => {
    await openFixture()
    await page.evaluate(() => { window.followerFixture.addFlow.listFailure = "列表暂时失败，历史可用" })
    await enterDraft("55")
    await submitDraft()
    const id = await createdId()
    await page.getByRole("alert").filter({ hasText: "列表暂时失败，历史可用" }).waitFor()
    await expect.poll(() => page.evaluate(newId => window.followerFixture.trendRequests.some(request => request.userIds?.includes(newId)), id), pollOptions).toBe(true)
    await page.evaluate(() => { window.followerFixture.addFlow.listFailure = "" })
    await page.getByRole("button", { name: "刷新列表", exact: true }).click()
    await expect.poll(() => page.getByRole("checkbox", { name: "新增用户55趋势对比" }).count(), pollOptions).toBe(1)
    expect(await page.getByRole("checkbox", { name: "新增用户55趋势对比" }).isChecked()).toBe(true)
    expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(1)
  })

  it("confirms the committed add after a failed list without waiting for its history request", async () => {
    await openFixture()
    await page.evaluate(() => {
      window.followerFixture.addFlow.listFailure = "读取失败不撤销添加"
      window.followerFixture.holdTrends = true
    })
    await enterDraft("55")
    await submitDraft()
    await createdId()
    await page.getByRole("alert").filter({ hasText: "读取失败不撤销添加" }).waitFor()
    await expect.poll(() => dialog().count(), pollOptions).toBe(0)
    expect(await page.getByRole("status").filter({ hasText: "已添加监控用户" }).count()).toBe(1)
    await expect.poll(() => page.evaluate(() => window.followerFixture.activeTrends), pollOptions).toBe(1)
    expect(await page.getByRole("status").filter({ hasText: "已添加监控用户" }).count()).toBe(1)
    await page.evaluate(() => window.followerFixture.trendReleases.forEach(release => release()))
    expect(await page.evaluate(() => window.followerFixture.addRequests.length)).toBe(1)
  })

  it("clears only the committed UID and stays busy until the post-add read finishes", async () => {
    await openFixture()
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await enterDraft("55", 600)
    await submitDraft()
    await createdId()
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.listCalls[1]?.phase), pollOptions).toBe("pending")
    expect(await dialog().count()).toBe(1)
    expect(await dialog().getByRole("textbox").inputValue()).toBe("")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("600")
    expect(await dialog().getByRole("button", { name: /正在/ }).isDisabled()).toBe(true)
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => dialog().count(), pollOptions).toBe(0)
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    expect(await dialog().getByRole("textbox").inputValue()).toBe("")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("600")
  })

  it("retains the chosen interval for the next add after a successful operation", async () => {
    await openFixture()
    await enterDraft("55", 600)
    await submitDraft()
    await createdId()
    await expect.poll(() => dialog().count(), pollOptions).toBe(0)
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    expect(await dialog().getByRole("textbox").inputValue()).toBe("")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("600")
  })

  it("keeps text entered after commit while the list is still synchronizing", async () => {
    await openFixture()
    await page.evaluate(() => window.followerFixture.addFlow.listPlans.push({ hold: true }))
    await enterDraft("55", 600)
    await submitDraft()
    await createdId()
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.listCalls[1]?.phase), pollOptions).toBe("pending")
    expect(await dialog().getByRole("textbox").inputValue()).toBe("")
    await dialog().getByRole("textbox").fill("66")
    await page.evaluate(() => window.followerFixture.addFlow.releaseList(1))
    await expect.poll(() => dialog().count(), pollOptions).toBe(0)
    await page.getByRole("button", { name: "添加用户", exact: true }).click()
    expect(await dialog().getByRole("textbox").inputValue()).toBe("66")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("600")
  })

  it("preserves the UID and interval after add failure and retries the same draft", async () => {
    await openFixture()
    await page.evaluate(() => window.followerFixture.addFlow.addPlans.push({ error: "合成添加失败" }))
    await enterDraft("55", 600)
    await submitDraft()
    await dialog().getByRole("alert").filter({ hasText: "合成添加失败" }).waitFor()
    expect(await dialog().getByRole("textbox").inputValue()).toBe("55")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("600")
    expect(await dialog().getByRole("button", { name: "添加监控", exact: true }).isEnabled()).toBe(true)
    await submitDraft()
    await createdId(1)
    expect(await page.evaluate(() => window.followerFixture.addRequests)).toEqual([
      { mid: "55", intervalSeconds: 600 }, { mid: "55", intervalSeconds: 600 }
    ])
    await expect.poll(() => page.getByRole("checkbox", { name: "新增用户55趋势对比" }).isChecked(), pollOptions).toBe(true)
  })

  it("applies a late successful add to business state without closing or clearing the newer drawer", async () => {
    await openFixture()
    await page.evaluate(() => window.followerFixture.addFlow.addPlans.push({ hold: true }))
    await enterDraft("55", 600)
    await submitDraft()
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.addCalls[0]?.phase), pollOptions).toBe("pending")
    await dialog().getByRole("button", { name: "关闭", exact: true }).click()
    await enterDraft("66", 1200)
    await page.evaluate(() => window.followerFixture.addFlow.releaseAdd(0))
    await createdId()
    await expect.poll(() => page.getByRole("checkbox", { name: "新增用户55趋势对比" }).count(), pollOptions).toBe(1)
    expect(await page.getByRole("checkbox", { name: "新增用户55趋势对比" }).isChecked()).toBe(true)
    expect(await dialog().count()).toBe(1)
    expect(await dialog().getByRole("textbox").inputValue()).toBe("66")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("1200")
    expect(await dialog().getByRole("alert").count()).toBe(0)
  })

  it("does not attach an old failed add to the reopened drawer's newer draft", async () => {
    await openFixture()
    await page.evaluate(() => window.followerFixture.addFlow.addPlans.push({ hold: true, error: "请求 A 的旧错误" }))
    await enterDraft("55", 600)
    await submitDraft()
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.addCalls[0]?.phase), pollOptions).toBe("pending")
    await dialog().getByRole("button", { name: "关闭", exact: true }).click()
    await enterDraft("66", 1200)
    await page.evaluate(() => window.followerFixture.addFlow.releaseAdd(0))
    await expect.poll(() => page.evaluate(() => window.followerFixture.addFlow.addCalls[0]?.phase), pollOptions).toBe("failed")
    expect(await dialog().count()).toBe(1)
    expect(await dialog().getByRole("textbox").inputValue()).toBe("66")
    expect(await dialog().getByRole("spinbutton").inputValue()).toBe("1200")
    expect(await dialog().getByRole("alert").count()).toBe(0)
    expect(await page.locator(".follower-card").count()).toBe(5)
  })

  it("does not duplicate a selected existing user returned by the upsert", async () => {
    await openFixture()
    await page.getByRole("checkbox", { name: "测试用户2趋势对比" }).check()
    await page.getByRole("checkbox", { name: "测试用户3趋势对比" }).check()
    await enterDraft("3")
    await submitDraft()
    await createdId()
    await expect.poll(selectedNames, pollOptions).toEqual(["测试用户2趋势对比", "测试用户3趋势对比"])
    expect(await page.locator(".follower-card").count()).toBe(5)
  })

  it("keeps four live selections without selecting a fifth returned user", async () => {
    await openFixture()
    for (let index = 0; index < 4; index++) await page.locator(".trend-selector input").nth(index).check()
    await enterDraft("55")
    await submitDraft()
    await createdId()
    await expect.poll(() => page.getByRole("checkbox", { name: "新增用户55趋势对比" }).count(), pollOptions).toBe(1)
    expect(await selectedNames()).toEqual(["测试用户1趋势对比", "测试用户2趋势对比", "测试用户3趋势对比", "测试用户4趋势对比"])
    expect(await page.getByRole("checkbox", { name: "新增用户55趋势对比" }).isChecked()).toBe(false)
  })
})
