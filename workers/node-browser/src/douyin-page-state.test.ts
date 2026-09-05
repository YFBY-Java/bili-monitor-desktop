import { describe, expect, it } from "vitest"

import {
  buildCookieHeadersByOrigin,
  classifyDouyinPageState,
  hasDouyinAuthenticatedCookies,
  mergeSessionStorageByOrigin,
  sessionStorageByOrigin
} from "./douyin-page-state"

describe("Douyin browser page state", () => {
  it("requires visible user action for platform challenges", () => {
    expect(classifyDouyinPageState({ title: "安全验证", text: "请完成验证", qrVisible: true })).toBe("USER_ACTION_REQUIRED")
  })

  it("distinguishes QR, scanned, validating, expired and authenticated states", () => {
    expect(classifyDouyinPageState({ qrVisible: true })).toBe("WAITING")
    expect(classifyDouyinPageState({ text: "已扫码，请在手机确认" })).toBe("SCANNED")
    expect(classifyDouyinPageState({ text: "正在验证登录状态" })).toBe("VALIDATING")
    expect(classifyDouyinPageState({ text: "二维码已过期" })).toBe("EXPIRED")
    expect(classifyDouyinPageState({ authenticated: true })).toBe("SUCCESS")
  })

  it("uses only authentication cookies and preserves all applicable names in headers", () => {
    expect(hasDouyinAuthenticatedCookies([{ name: "ttwid", value: "anonymous" }])).toBe(false)
    expect(hasDouyinAuthenticatedCookies([{ name: "sessionid_ss", value: "secret" }])).toBe(true)
    expect(buildCookieHeadersByOrigin([
      { name: "sessionid", value: "secret", domain: ".douyin.com", path: "/", secure: true },
      { name: "future", value: "keep", domain: "www.douyin.com", path: "/", secure: true }
    ], ["https://www.douyin.com"])).toEqual({
      "https://www.douyin.com": "sessionid=secret; future=keep"
    })
  })

  it("captures and restores sessionStorage independently from Playwright storageState", () => {
    const merged = mergeSessionStorageByOrigin([
      { origin: "https://www.douyin.com", localStorage: [{ name: "local", value: "keep" }], indexedDB: [{ name: "db" }] }
    ], [
      { origin: "https://www.douyin.com", sessionStorage: [{ name: "session", value: "restore" }] },
      { origin: "https://www.douyin.com", sessionStorage: [{ name: "second", value: "frame" }] },
      { origin: "https://open.douyin.com", sessionStorage: [{ name: "oauth", value: "state" }] }
    ])

    expect(merged).toEqual([
      {
        origin: "https://www.douyin.com",
        localStorage: [{ name: "local", value: "keep" }],
        indexedDB: [{ name: "db" }],
        indexedDb: [{ name: "db" }],
        sessionStorage: [{ name: "session", value: "restore" }, { name: "second", value: "frame" }]
      },
      { origin: "https://open.douyin.com", localStorage: [], sessionStorage: [{ name: "oauth", value: "state" }], indexedDb: [] }
    ])
    expect(sessionStorageByOrigin(merged)).toEqual({
      "https://www.douyin.com": { session: "restore", second: "frame" },
      "https://open.douyin.com": { oauth: "state" }
    })
  })
})
