import { describe, expect, it } from "vitest"
import { secureWebPreferences } from "./security"
import * as security from "./security"

describe("secureWebPreferences", () => {
  it("keeps the renderer isolated from Node and the host", () => {
    expect(secureWebPreferences("preload.js")).toMatchObject({
      preload: "preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    })
    expect(security.shouldRegisterProtocolClient({ BMD_E2E_HEADLESS: "1" })).toBe(false)
    expect(security.shouldRegisterProtocolClient({})).toBe(true)
  })

  it("allows only explicit Bilibili profiles and live rooms as static external URLs", () => {
    const exported = security as unknown as Record<string, unknown>
    expect(typeof exported.isAllowedExternalUrl).toBe("function")
    if (typeof exported.isAllowedExternalUrl !== "function") return

    const isAllowed = exported.isAllowedExternalUrl as (url: string) => boolean
    expect(isAllowed("https://space.bilibili.com/392836434")).toBe(true)
    expect(isAllowed("https://space.bilibili.com/392836434/")).toBe(true)
    expect(isAllowed("http://space.bilibili.com/392836434")).toBe(false)
    expect(isAllowed("https://space.bilibili.com/not-a-uid")).toBe(false)
    expect(isAllowed("https://live.bilibili.com/21144080")).toBe(true)
    expect(isAllowed("https://live.bilibili.com/21144080/")).toBe(true)
    expect(isAllowed("http://live.bilibili.com/21144080")).toBe(false)
    expect(isAllowed("https://live.bilibili.com/21144080?from=unsafe")).toBe(false)
    expect(isAllowed("https://live.bilibili.com/not-a-room")).toBe(false)
    expect(isAllowed("https://example.com/392836434")).toBe(false)
    expect(isAllowed("https://open.douyin.com/platform/oauth/connect/?client_key=key&response_type=code&scope=user_info&redirect_uri=bilimonitor%3A%2F%2Fdouyin-oauth&state=abcdefghijklmnopqrstuvwxyz1234567890")).toBe(false)
    expect(isAllowed("https://evil.example/platform/oauth/connect/?client_key=key&response_type=code&redirect_uri=bilimonitor%3A%2F%2Fdouyin-oauth&state=abcdefghijklmnopqrstuvwxyz1234567890")).toBe(false)
  })
})
