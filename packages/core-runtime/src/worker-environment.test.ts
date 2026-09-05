import { describe, expect, it } from "vitest"

import { safeWorkerEnvironment } from "./worker-environment"

describe("safeWorkerEnvironment", () => {
  it("keeps runtime essentials but never forwards credential keys or OAuth secrets", () => {
    const environment = safeWorkerEnvironment({
      SystemRoot: "C:\\Windows",
      PATH: "D:\\tools",
      TEMP: "D:\\temp",
      PLAYWRIGHT_BROWSERS_PATH: "D:\\playwright",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      BMD_DOUYIN_HEADLESS: "1",
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
      BMD_DATA_DIR: "D:\\data"
    })
    expect(environment).not.toHaveProperty("BMD_CREDENTIAL_KEY_BASE64")
    expect(environment).not.toHaveProperty("BMD_DOUYIN_CLIENT_SECRET")
    expect(environment).not.toHaveProperty("OPENAI_API_KEY")
  })
})
