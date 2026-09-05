import { describe, expect, it } from "vitest"

import { mergeValidatedDouyinBundle } from "./douyin-playwright-driver"

describe("mergeValidatedDouyinBundle", () => {
  it("persists cookies and browser storage rotated by fresh-context validation", () => {
    const merged = mergeValidatedDouyinBundle(
      {
        authType: "DOUYIN_WEB_SESSION",
        cookies: [{ name: "sessionid", value: "old" }],
        storageState: { cookies: [{ name: "sessionid", value: "old" }], origins: [] },
        rawWorkerResult: { captured: true },
        capturedAt: "2026-08-30T01:00:00.000Z"
      },
      {
        authType: "DOUYIN_WEB_SESSION",
        cookies: [{ name: "sessionid", value: "rotated" }],
        storageState: { cookies: [{ name: "sessionid", value: "rotated" }], origins: [] },
        origins: [{ origin: "https://www.douyin.com", localStorage: [], sessionStorage: [] }],
        rawWorkerResult: { page: { url: "https://www.douyin.com/user/self" } },
        capturedAt: "2026-08-30T01:02:00.000Z"
      },
      { status: "SUCCESS" },
      "2026-08-30T01:02:00.000Z"
    )

    expect(merged.cookies).toEqual([{ name: "sessionid", value: "rotated" }])
    expect(merged.storageState).toMatchObject({
      cookies: [{ name: "sessionid", value: "rotated" }]
    })
    expect(merged.origins).toHaveLength(1)
    expect(merged.capturedAt).toBe("2026-08-30T01:00:00.000Z")
    expect(merged.lastValidatedAt).toBe("2026-08-30T01:02:00.000Z")
    expect(merged.rawWorkerResult).toMatchObject({
      captured: true,
      validation: { status: "SUCCESS" }
    })
  })
})
