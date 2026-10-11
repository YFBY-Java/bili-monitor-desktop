import { describe, expect, it } from "vitest"

import { createBrowserPreviewBridge } from "./browser-preview-bridge"

describe("browser preview bridge", () => {
  it("provides honest read-only v2 precision interfaces", async () => {
    const bridge = createBrowserPreviewBridge()
    expect(bridge).toHaveProperty("bilibiliFollowersV2")
    await expect(bridge.bilibiliFollowersV2.list({})).resolves.toMatchObject({ items: [], total: 0 })
    await expect(bridge.bilibiliFollowersV2.trends({})).resolves.toEqual([])
    await expect(bridge.bilibiliFollowersV2.add({ mid: "9223372036854775807" })).rejects.toThrow(/BROWSER_PREVIEW_READ_ONLY/)
    await expect(bridge.bilibiliSubjects.workbenchV2({ subjectId: "018f0f39-7b5e-4cc1-862d-9a208b3d0800" })).rejects.toThrow(/BROWSER_PREVIEW_READ_ONLY/)
    await expect(bridge.bilibiliSubjects.trendsV2({ subjectId: "018f0f39-7b5e-4cc1-862d-9a208b3d0800" })).rejects.toThrow(/BROWSER_PREVIEW_READ_ONLY/)
  })
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
    await expect(bridge.platformCollection.listAdapters()).resolves.toEqual([])
    await expect(bridge.platformCollection.runOnce({ platformCode: "bilibili", dataType: "account", externalId: "2" }))
      .rejects.toThrow(/BROWSER_PREVIEW_READ_ONLY/)
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
