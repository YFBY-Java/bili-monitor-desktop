import { describe, expect, it } from "vitest"

import { findDouyinOAuthCallback, parseDouyinOAuthCallback } from "./oauth-callback"

describe("Douyin desktop OAuth callback", () => {
  it("accepts only the dedicated bilimonitor callback and returns code plus state", () => {
    expect(parseDouyinOAuthCallback("bilimonitor://douyin-oauth?code=oauth-code&state=abcdefghijklmnopqrstuvwxyz1234567890"))
      .toEqual({ code: "oauth-code", state: "abcdefghijklmnopqrstuvwxyz1234567890" })
    expect(parseDouyinOAuthCallback("bilimonitor://other?code=x&state=abcdefghijklmnopqrstuvwxyz1234567890")).toBeUndefined()
    expect(parseDouyinOAuthCallback("https://example.invalid/?code=x&state=abcdefghijklmnopqrstuvwxyz1234567890")).toBeUndefined()
  })

  it("finds a protocol URL in Electron launch arguments without trusting unrelated arguments", () => {
    expect(findDouyinOAuthCallback([
      "D:\\apps\\BiliMonitor.exe",
      "--flag",
      "bilimonitor://douyin-oauth?code=oauth-code&state=abcdefghijklmnopqrstuvwxyz1234567890"
    ])).toEqual({ code: "oauth-code", state: "abcdefghijklmnopqrstuvwxyz1234567890" })
  })

  it("preserves an official denial so the renderer can stop waiting and show the reason", () => {
    expect(parseDouyinOAuthCallback(
      "bilimonitor://douyin-oauth?error=access_denied&error_description=user%20denied&state=abcdefghijklmnopqrstuvwxyz1234567890"
    )).toEqual({
      error: "access_denied",
      errorDescription: "user denied",
      state: "abcdefghijklmnopqrstuvwxyz1234567890"
    })
  })
})
