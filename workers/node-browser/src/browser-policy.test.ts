import { describe, expect, it } from "vitest"

import { assertBrowserNavigationAllowed, createBrowserWorkerDescriptor } from "./browser-policy"

describe("browser worker boundary", () => {
  it("declares a supervised stdio worker instead of a local service", () => {
    expect(createBrowserWorkerDescriptor()).toEqual({
      workerId: "browser-primary",
      workerType: "browser",
      transport: "stdio",
      capabilities: ["browser.navigate", "browser.extract", "browser.screenshot"]
    })
  })

  it("allows public HTTPS targets", () => {
    expect(assertBrowserNavigationAllowed("https://www.bilibili.com/video/BV1xx")).toBe(
      "https://www.bilibili.com/video/BV1xx"
    )
  })

  it.each(["file:///C:/secret.txt", "http://127.0.0.1:3000", "http://localhost:5173"])(
    "blocks unsafe navigation target %s",
    (target) => expect(() => assertBrowserNavigationAllowed(target)).toThrow(/not allowed/i)
  )
})
