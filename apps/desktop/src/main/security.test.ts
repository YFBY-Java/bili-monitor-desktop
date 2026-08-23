import { describe, expect, it } from "vitest"
import { secureWebPreferences } from "./security"

describe("secureWebPreferences", () => {
  it("keeps the renderer isolated from Node and the host", () => {
    expect(secureWebPreferences("preload.js")).toMatchObject({
      preload: "preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    })
  })
})
