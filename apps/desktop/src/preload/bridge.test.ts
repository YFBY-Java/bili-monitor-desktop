import { describe, expect, it, vi } from "vitest"

import { createDesktopBridge } from "./bridge"

describe("createDesktopBridge", () => {
  it("exposes only typed account and subject channels", async () => {
    const timestamp = "2026-08-23T07:00:00.000Z"
    const account = {
      id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      platform: "bilibili" as const,
      externalId: "672328094",
      displayName: "测试账号",
      authState: "not_connected" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    }
    const subject = {
      id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      name: "测试对象",
      status: "active" as const,
      tags: [],
      accounts: [account],
      monitorPolicies: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "platform-accounts:list") return { items: [account], total: 1, snapshotAt: timestamp }
      if (channel === "platform-accounts:create") return account
      if (channel === "subjects:list") return { items: [subject], total: 1, snapshotAt: timestamp }
      return subject
    })
    const bridge = createDesktopBridge(invoke)

    await bridge.platformAccounts.list({ platform: "bilibili", limit: 20 })
    await bridge.platformAccounts.create({
      platform: "bilibili",
      externalId: "672328094",
      displayName: "测试账号"
    })
    await bridge.subjects.list({ status: "active", limit: 20 })
    await bridge.subjects.create({ name: "测试对象", tags: [] })
    await bridge.subjects.bindAccount({
      subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      followerIntervalSeconds: 3600
    })

    expect(invoke.mock.calls).toEqual([
      ["platform-accounts:list", { platform: "bilibili", limit: 20 }],
      ["platform-accounts:create", {
        platform: "bilibili",
        externalId: "672328094",
        displayName: "测试账号"
      }],
      ["subjects:list", { status: "active", limit: 20 }],
      ["subjects:create", { name: "测试对象", tags: [] }],
      ["subjects:bind-account", {
        subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
        accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        followerIntervalSeconds: 3600
      }]
    ])
  })
})
