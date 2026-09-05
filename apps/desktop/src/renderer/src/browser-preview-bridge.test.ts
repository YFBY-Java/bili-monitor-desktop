import { describe, expect, it } from "vitest"

import { createBrowserPreviewBridge } from "./browser-preview-bridge"

describe("browser preview bridge", () => {
  it("shows honest empty local projections without inventing business data", async () => {
    const bridge = createBrowserPreviewBridge()

    await expect(bridge.core.bootstrap()).resolves.toMatchObject({
      coreStatus: { schemaVersion: 11 }
    })

    await expect(bridge.bilibiliFollowers.list({ limit: 100 })).resolves.toMatchObject({
      items: [],
      total: 0
    })
    await expect(bridge.platformAccounts.list({ limit: 50 })).resolves.toMatchObject({
      items: [],
      total: 0
    })
    await expect(bridge.bilibiliFollowers.add({ mid: "2" })).rejects.toThrowError(
      /BROWSER_PREVIEW_READ_ONLY/
    )
    await expect(bridge.bilibiliLive.list({ limit: 100 })).resolves.toMatchObject({
      items: [],
      total: 0
    })
    await expect(bridge.bilibiliLive.add({ uid: "2" })).rejects.toThrowError(
      /BROWSER_PREVIEW_READ_ONLY/
    )
    await expect(bridge.bilibiliSubjects.list({ limit: 100 })).resolves.toEqual([])
  })
})
