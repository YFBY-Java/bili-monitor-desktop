import { describe, expect, it } from "vitest"

import { safeWorkerEnvironment } from "./worker-environment"

describe("safeWorkerEnvironment", () => {
  it("keeps runtime essentials but never forwards credential keys or OAuth secrets", () => {
    const douyinBrowserConfiguration = {
      BMD_DOUYIN_NAVIGATION_TIMEOUT_MS: "45000",
      BMD_DOUYIN_QR_WAIT_MS: "10000",
      BMD_DOUYIN_LOCALE: "zh-CN",
      BMD_DOUYIN_TIMEZONE_ID: "Asia/Shanghai",
      BMD_DOUYIN_VIEWPORT_WIDTH: "1280",
      BMD_DOUYIN_VIEWPORT_HEIGHT: "720",
      BMD_DOUYIN_USER_AGENT: "BMD-Douyin-Test",
      BMD_DOUYIN_COOKIE_HEADER_ORIGINS: "https://www.douyin.com"
    }
    const environment = safeWorkerEnvironment({
      SystemRoot: "C:\\Windows",
      PATH: "D:\\tools",
      TEMP: "D:\\temp",
      PLAYWRIGHT_BROWSERS_PATH: "D:\\playwright",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      BMD_DOUYIN_HEADLESS: "1",
      ...douyinBrowserConfiguration,
      BMD_CREDENTIAL_KEY_BASE64: "master-secret",
      BMD_DOUYIN_CLIENT_SECRET: "oauth-secret",
      OPENAI_API_KEY: "unrelated-secret"
    }, { BMD_DATA_DIR: "D:\\data" })

    expect(environment).toMatchObject({
      SystemRoot: "C:\\Windows",
      PATH: "D:\\tools",
      TEMP: "D:\\temp",
      PLAYWRIGHT_BROWSERS_PATH: "D:\\playwright",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      BMD_DOUYIN_HEADLESS: "1",
      ...douyinBrowserConfiguration,
      BMD_DATA_DIR: "D:\\data"
    })
    expect(environment).not.toHaveProperty("BMD_CREDENTIAL_KEY_BASE64")
    expect(environment).not.toHaveProperty("BMD_DOUYIN_CLIENT_SECRET")
    expect(environment).not.toHaveProperty("OPENAI_API_KEY")
  })
})
