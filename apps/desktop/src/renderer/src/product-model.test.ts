import { describe, expect, it } from "vitest"

import {
  businessCapabilities,
  findProductPage,
  navigationGroups,
  productPages
} from "./product-model"

describe("product information architecture", () => {
  it("exposes every first-release workspace exactly once", () => {
    const expectedPageIds = [
      "command-center",
      "subjects",
      "campaigns",
      "live-radar",
      "data-assets",
      "agent-studio",
      "agent-runs",
      "knowledge",
      "models",
      "evaluations",
      "platform-accounts",
      "connectors",
      "identity",
      "tools",
      "workflows",
      "extensions",
      "approvals",
      "observability",
      "settings"
    ]
    const navigationPageIds = navigationGroups.flatMap((group) =>
      group.items.map((item) => item.pageId)
    )

    expect(navigationPageIds).toEqual(expectedPageIds)
    expect(new Set(navigationPageIds).size).toBe(expectedPageIds.length)
    expect(productPages.map((page) => page.id)).toEqual(expectedPageIds)
  })

  it("keeps the implemented BiliMonitor business capabilities visible", () => {
    const capabilityIds = businessCapabilities.map((capability) => capability.id)

    expect(capabilityIds).toEqual(
      expect.arrayContaining([
        "bilibili-qr-auth",
        "douyin-oauth-auth",
        "douyin-web-auth",
        "follower-monitor",
        "subject-workbench",
        "live-room-monitor",
        "live-danmaku",
        "live-rank",
        "live-session-insight",
        "live-session-export",
        "collect-task",
        "raw-payload",
        "analytics",
        "ai-analysis",
        "identity-link"
      ])
    )
  })

  it("maps every capability to a real product page", () => {
    for (const capability of businessCapabilities) {
      expect(findProductPage(capability.pageId)?.id).toBe(capability.pageId)
    }
  })
})
