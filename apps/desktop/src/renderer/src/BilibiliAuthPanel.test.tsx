import type { BilibiliAuthStatus, BilibiliCredential, BilibiliQrLoginStatus } from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { BilibiliAuthPanel, startBilibiliQrPolling } from "./BilibiliAuthPanel"

const handlers = {
  onOpenQr: vi.fn(),
  onCloseQr: vi.fn(),
  onRegenerateQr: vi.fn(),
  onRefresh: vi.fn(),
  onOpenCredential: vi.fn(),
  onCloseCredential: vi.fn(),
  onRevoke: vi.fn(),
  onCopyCredential: vi.fn()
}

const activeStatus: BilibiliAuthStatus = {
  loggedIn: true,
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0601",
  account: {
    mid: "99",
    uname: "Alice",
    face: "https://i0.hdslb.com/bfs/face/alice.jpg",
    level: 6,
    vipStatus: 0
  },
  lastValidatedAt: "2026-08-29T12:00:00.000Z",
  status: "ACTIVE"
}

const credential: BilibiliCredential = {
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0601",
  account: { mid: "99", uname: "Alice" },
  cookieHeader: "SESSDATA=session; bili_jct=csrf; DedeUserID=99",
  cookies: [
    { name: "SESSDATA", value: "session" },
    { name: "bili_jct", value: "csrf" },
    { name: "DedeUserID", value: "99" }
  ],
  csrf: "csrf",
  refreshToken: "refresh",
  rawPayload: { version: 1 }
}

describe("BilibiliAuthPanel", () => {
  it("renders the original logged-out and active account actions", () => {
    const loggedOut = renderToStaticMarkup(
      <BilibiliAuthPanel
        status={{ phase: "success", data: { loggedIn: false, status: "NONE" } }}
        qrOpen={false}
        credentialOpen={false}
        busy={false}
        {...handlers}
      />
    )
    const active = renderToStaticMarkup(
      <BilibiliAuthPanel
        status={{ phase: "success", data: activeStatus }}
        qrOpen={false}
        credentialOpen={false}
        busy={false}
        {...handlers}
      />
    )

    expect(loggedOut).toContain("未配置登录态")
    expect(loggedOut).toContain("扫码登录")
    expect(loggedOut).not.toContain("查看完整登录态")
    expect(active).toContain("Alice")
    expect(active).toContain("UID 99")
    expect(active).toContain("重新扫码")
    expect(active).toContain("刷新校验")
    expect(active).toContain("查看完整登录态")
    expect(active).toContain("移除登录态")
  })

  it("renders the real local QR data URL and all original terminal states", () => {
    const scanned: BilibiliQrLoginStatus = {
      status: "SCANNED",
      message: "已扫码，请在手机端确认登录",
      expiresInSeconds: 128
    }
    const html = renderToStaticMarkup(
      <BilibiliAuthPanel
        status={{ phase: "success", data: { loggedIn: false, status: "NONE" } }}
        qrOpen
        qrDataUrl="data:image/png;base64,LOCAL_QR"
        qrStatus={scanned}
        credentialOpen={false}
        busy={false}
        {...handlers}
      />
    )

    expect(html).toContain('aria-label="扫码登录 Bilibili"')
    expect(html).toContain("data:image/png;base64,LOCAL_QR")
    expect(html).toContain("已扫码，请在手机端确认登录")
    expect(html).toContain("剩余 128 秒")
    expect(html).not.toContain("重新生成二维码")
  })

  it("shows complete credential fields only in the explicit credential drawer", () => {
    const html = renderToStaticMarkup(
      <BilibiliAuthPanel
        status={{ phase: "success", data: activeStatus }}
        qrOpen={false}
        credentialOpen
        credential={credential}
        busy={false}
        {...handlers}
      />
    )

    expect(html).toContain('aria-label="完整 Bilibili 登录态"')
    expect(html).toContain("Cookie Header")
    expect(html).toContain("SESSDATA=session; bili_jct=csrf; DedeUserID=99")
    expect(html).toContain("bili_jct / CSRF")
    expect(html).toContain("refresh_token")
    expect(html).toContain("Raw Payload")
    expect(html).toContain("一键复制全部")
  })

  it("keeps polling through repeated WAITING states and a temporary error until SUCCESS", async () => {
    vi.useFakeTimers()
    const statuses: BilibiliQrLoginStatus[] = [
      { status: "WAITING", message: "waiting-1" },
      { status: "WAITING", message: "waiting-2" },
      { status: "SCANNED", message: "scanned" },
      { status: "SUCCESS", message: "success" }
    ]
    const poll = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockImplementation(async () => statuses.shift()!)
    const observed: string[] = []
    const errors: string[] = []
    const stop = startBilibiliQrPolling({
      intervalMillis: 1_000,
      poll,
      onStatus: (status) => { observed.push(status.status) },
      onError: (error) => { errors.push(error instanceof Error ? error.message : String(error)) }
    })
    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(errors).toEqual(["temporary network error"])
      expect(observed).toEqual(["WAITING", "WAITING", "SCANNED", "SUCCESS"])
      expect(poll).toHaveBeenCalledTimes(5)
    } finally {
      stop()
      vi.useRealTimers()
    }
  })
})
