import type {
  DouyinAuthStatus,
  DouyinCredential,
  DouyinCredentialSummary,
  DouyinQrLoginStatus
} from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { chromium } from "playwright"
import { createServer } from "vite"
import { describe, expect, it, vi } from "vitest"
import { browserFixtureCacheDirectory } from "./__fixtures__/browser-fixture-cache"

import {
  DouyinAuthWorkspace,
  hasOAuthCredentialChanged,
  startDouyinQrPolling
} from "./DouyinAuthWorkspace"

const timestamp = "2026-08-30T01:00:00.000Z"
const webCredential: DouyinCredential = {
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01",
  authType: "DOUYIN_WEB_SESSION",
  status: "ACTIVE",
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: {
    account: { nickname: "本机抖音账号" },
    cookies: [{ name: "sessionid", value: "secret" }],
    cookieHeadersByOrigin: { "https://www.douyin.com": "sessionid=secret" },
    origins: [{
      origin: "https://www.douyin.com",
      localStorage: [{ name: "local-key", value: "local-value" }],
      sessionStorage: [{ name: "session-key", value: "session-value" }],
      indexedDb: []
    }],
    storageState: { cookies: [], origins: [] },
    browserContext: { locale: "zh-CN" },
    lastValidatedAt: timestamp
  }
}
const oauthCredential: DouyinCredential = {
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c02",
  authType: "DOUYIN_OAUTH2",
  status: "ACTIVE",
  expiresAt: "2026-08-31T01:00:00.000Z",
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: { openId: "open-id", scope: ["user_info"], account: { nickname: "官方授权账号" } }
}
const webCredentialSummary: DouyinCredentialSummary = {
  credentialId: webCredential.credentialId,
  authType: "DOUYIN_WEB_SESSION",
  status: "ACTIVE",
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: { account: { nickname: "本机抖音账号" }, cookieCount: 1, lastValidatedAt: timestamp }
}
const oauthCredentialSummary: DouyinCredentialSummary = {
  credentialId: oauthCredential.credentialId,
  authType: "DOUYIN_OAUTH2",
  status: "ACTIVE",
  expiresAt: "2026-08-31T01:00:00.000Z",
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: { openId: "open-id", scope: ["user_info"], account: { nickname: "官方授权账号" } }
}
const status: DouyinAuthStatus = {
  enabled: true,
  oauthMode: "live",
  workerAvailable: true,
  workerStatus: "UP",
  pollIntervalMs: 2_000,
  webCredential: webCredentialSummary,
  oauthCredential: oauthCredentialSummary
}
const handlers = {
  onRefresh: vi.fn(),
  onStartWebQr: vi.fn(),
  onCloseQr: vi.fn(),
  onValidateWeb: vi.fn(),
  onStartOAuth: vi.fn(),
  onCompleteOAuth: vi.fn(),
  onOAuthCodeChange: vi.fn(),
  onRefreshOAuth: vi.fn(),
  onOpenCredential: vi.fn(),
  onCloseCredential: vi.fn(),
  onCopyCredential: vi.fn(),
  onExportCredential: vi.fn(),
  onRevokeCredential: vi.fn()
}

describe("DouyinAuthWorkspace", () => {
  it("reopens QR login without consuming a closed generation and recovers a failed start", async () => {
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
      await page.goto(`http://127.0.0.1:${address.port}/__fixtures__/douyin-auth.html`)
      const start = page.getByRole("button", { name: /^(开始扫码|重新扫码)$/ })
      const dialog = page.getByRole("dialog", { name: "抖音 Web 扫码登录", exact: true })
      await expect.poll(() => start.isEnabled()).toBe(true)
      await start.click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.starts)).toBe(1)
      await dialog.getByRole("button", { name: "关闭", exact: true }).click()
      expect(await start.isEnabled()).toBe(true)
      await start.click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.starts)).toBe(2)
      await page.evaluate(() => window.douyinWorkflowFixture.resolveStart(1))
      await expect.poll(() => dialog.getByText("等待扫码", { exact: true }).count()).toBe(1)
      expect(await dialog.getByRole("button", { name: "刷新二维码图片", exact: true }).count()).toBe(1)
      await dialog.getByRole("button", { name: "刷新二维码图片", exact: true }).click()
      await page.evaluate(() => window.douyinWorkflowFixture.resolveStart(0))
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.polls.length)).toBe(1)
      expect(await page.evaluate(() => window.douyinWorkflowFixture.polls[0])).toBe("018f0f39-7b5e-4cc1-862d-9a208b3d0d01")
      await dialog.getByRole("button", { name: "关闭", exact: true }).click()
      await start.click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.starts)).toBe(3)
      expect(await dialog.getByText("等待扫码", { exact: true }).count()).toBe(0)
      await page.evaluate(() => window.douyinWorkflowFixture.resolvePoll(0, "SUCCESS"))
      await page.evaluate(() => window.douyinWorkflowFixture.rejectStart(2))
      await dialog.getByText("登录失败", { exact: true }).waitFor()
      await dialog.getByRole("button", { name: "重新生成二维码", exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.starts)).toBe(4)
      await page.evaluate(() => window.douyinWorkflowFixture.resolveStart(3))
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.polls.length)).toBe(2)
      await page.evaluate(() => window.douyinWorkflowFixture.resolvePoll(1, "SCANNED"))
      await dialog.getByText("已扫码", { exact: true }).waitFor()
      expect(await dialog.locator(".douyin-qr-progress .is-complete").count()).toBe(2)
      await page.screenshot({ path: fileURLToPath(new URL("../../../../../.tools/temp/bmd-douyin-qr-light.png", import.meta.url)) })
      await dialog.getByRole("button", { name: "关闭", exact: true }).click()
      await page.getByRole("button", { name: "查看完整登录态", exact: true }).click()
      const drawer = page.getByRole("dialog", { name: "完整抖音 Web 登录态", exact: true })
      await drawer.getByRole("tab", { name: "完整合并 JSON", exact: true }).click()
      expect(await drawer.getByRole("tabpanel").innerText()).toContain('"credentialId"')
      await drawer.getByRole("button", { name: "复制当前字段", exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.copiedTexts.length)).toBe(1)
      expect(JSON.parse(await page.evaluate(() => window.douyinWorkflowFixture.copiedTexts[0]!)).authType).toBe("DOUYIN_WEB_SESSION")
      await drawer.getByRole("tab", { name: "账号信息", exact: true }).click()
      await drawer.getByRole("button", { name: "复制当前字段", exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.copiedTexts.length)).toBe(2)
      expect(JSON.parse(await page.evaluate(() => window.douyinWorkflowFixture.copiedTexts[1]!))).toEqual({ nickname: "离线测试账号" })
      await drawer.getByRole("button", { name: "复制全部 JSON", exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.douyinWorkflowFixture.copiedTexts.length)).toBe(3)
      expect(await page.evaluate(() => window.douyinWorkflowFixture.copiedTexts[2])).toBe(await page.evaluate(() => window.douyinWorkflowFixture.copiedTexts[0]))
      await drawer.getByRole("button", { name: "关闭抖音登录态", exact: true }).click()
      await page.getByRole("button", { name: "重新加载校验", exact: true }).click()
      await expect.poll(() => page.locator("[role=alert]").innerText()).toContain("离线登录态不可复用")
    } finally { await browser?.close(); await server.close() }
  }, 15_000)

  it("renders the original independent Web QR and official OAuth credential flows", () => {
    const html = renderToStaticMarkup(
      <DouyinAuthWorkspace
        status={{ phase: "success", data: status }}
        qrOpen={false}
        credentialOpen={false}
        busy={false}
        oauthCode=""
        {...handlers}
      />
    )

    expect(html).toContain("我的抖音登录态")
    expect(html).toContain("Web 扫码登录")
    expect(html).toContain("本机抖音账号")
    expect(html).toContain("重新扫码")
    expect(html).toContain("重新加载校验")
    expect(html).toContain("官方 OAuth")
    expect(html).toContain("官方授权账号")
    expect(html).toContain("刷新 Token")
    expect(html).toContain("查看完整登录态")
    expect(html).toContain("导出 JSON")
    expect(html).toContain("撤销")
  })

  it("renders the real QR image and the original manual challenge state", () => {
    const qrStatus: DouyinQrLoginStatus = {
      loginId: "018f0f39-7b5e-4cc1-a6cd-9a208b3d0c03",
      status: "USER_ACTION_REQUIRED",
      message: "请在可见浏览器中完成人工验证",
      expiresInSeconds: 152,
      imageDataUrl: "data:image/png;base64,DOUYIN_QR"
    }
    const html = renderToStaticMarkup(
      <DouyinAuthWorkspace
        status={{ phase: "success", data: status }}
        qrOpen
        qrStatus={qrStatus}
        credentialOpen={false}
        busy={false}
        oauthCode=""
        {...handlers}
      />
    )

    expect(html).toContain('aria-label="抖音 Web 扫码登录"')
    expect(html).toContain("data:image/png;base64,DOUYIN_QR")
    expect(html).toContain("先完成浏览器验证")
    expect(html).toContain("可见浏览器")
    expect(html).toContain("剩余 152 秒")
  })

  it("shows all captured Web state only in the explicit credential drawer", () => {
    const html = renderToStaticMarkup(
      <DouyinAuthWorkspace
        status={{ phase: "success", data: status }}
        qrOpen={false}
        credentialOpen
        selectedCredential={webCredential}
        busy={false}
        oauthCode=""
        {...handlers}
      />
    )

    expect(html).toContain('aria-label="完整抖音 Web 登录态"')
    expect(html).toContain("Cookie Header")
    expect(html).toContain("Cookies JSON")
    expect(html).toContain("localStorage")
    expect(html).toContain("sessionStorage")
    expect(html).toContain("IndexedDB")
    expect(html).toContain("storageState")
    expect(html).toContain("浏览器上下文")
    expect(html).toContain("复制全部 JSON")
    expect(html).toContain("完整合并 JSON")
    expect(html).toContain('role="tablist"')
    expect(html).toContain("复制当前字段")
  })

  it("does not mistake an existing OAuth credential for completion of a new authorization", () => {
    expect(hasOAuthCredentialChanged(oauthCredentialSummary.credentialId, status)).toBe(false)
    expect(hasOAuthCredentialChanged(undefined, status)).toBe(true)
    expect(hasOAuthCredentialChanged(
      oauthCredentialSummary.credentialId,
      {
        ...status,
        oauthCredential: {
          ...oauthCredentialSummary,
          credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c09"
        }
      }
    )).toBe(true)
  })

  it("continues Douyin QR polling after a temporary error and ignores a stopped generation", async () => {
    vi.useFakeTimers()
    const loginId = "018f0f39-7b5e-4cc1-a6cd-9a208b3d0c03"
    const poll = vi.fn()
      .mockRejectedValueOnce(new Error("temporary worker error"))
      .mockResolvedValueOnce({ loginId, status: "WAITING", message: "waiting", expiresInSeconds: 100 })
      .mockResolvedValueOnce({ loginId, status: "SUCCESS", message: "success", expiresInSeconds: 0 })
    const observed: string[] = []
    const errors: string[] = []
    const stop = startDouyinQrPolling({
      intervalMillis: 1_000,
      poll,
      onStatus: (value) => { observed.push(value.status) },
      onError: (error) => { errors.push(error instanceof Error ? error.message : String(error)) }
    })
    try {
      await vi.advanceTimersByTimeAsync(3_000)
      expect(errors).toEqual(["temporary worker error"])
      expect(observed).toEqual(["WAITING", "SUCCESS"])
      expect(poll).toHaveBeenCalledTimes(3)
      stop()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(poll).toHaveBeenCalledTimes(3)
    } finally {
      stop()
      vi.useRealTimers()
    }
  })
})
