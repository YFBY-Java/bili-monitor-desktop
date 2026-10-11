import { describe, expect, it } from "vitest"

import {
  businessCapabilities,
  findProductPage,
  navigationGroups,
  productPages
} from "./product-model"

describe("product information architecture", () => {
  it("exposes only business workspaces that are backed by a real local implementation", () => {
    const expectedPageIds = [
      "bilibili-subjects", "bilibili-followers", "bilibili-live", "live-data", "live-analytics", "douyin-auth", "platform-collection"
    ]
    const navigationPageIds = navigationGroups.flatMap((group) =>
      group.items.map((item) => item.pageId)
    )

    expect(navigationPageIds).toEqual(expectedPageIds)
    expect(new Set(navigationPageIds).size).toBe(expectedPageIds.length)
    expect(productPages.map((page) => page.id)).toEqual([
      "platform-collection", "bilibili-subjects", "bilibili-followers", "bilibili-live", "live-data", "live-analytics", "douyin-auth"
    ])
  })

  it("does not label pending original-project migrations as implemented capabilities", () => {
    const capabilityIds = businessCapabilities.map((capability) => capability.id)

    expect(capabilityIds).toEqual(["subject-workbench", "follower-monitor", "live-room-monitor", "douyin-self-auth"])
  })

  it("maps every capability to a real product page", () => {
    for (const capability of businessCapabilities) {
      expect(findProductPage(capability.pageId)?.id).toBe(capability.pageId)
    }
  })

  it("exposes the original B/S follower monitor as a first-class workspace", () => {
    const page = findProductPage("bilibili-followers")

    expect(page).toMatchObject({
      label: "B站粉丝监控",
      primaryAction: "添加监控用户",
      tabs: ["监控用户", "趋势对比"]
    })
    expect(
      navigationGroups.flatMap((group) => group.items).find((item) =>
        item.pageId === "bilibili-followers"
      )
    ).toMatchObject({ label: "粉丝监控", icon: "users" })
    expect(businessCapabilities.find((capability) => capability.id === "follower-monitor")).toMatchObject({
      pageId: "bilibili-followers",
      implementation: "Python httpx Worker + Local Core scheduler + SQLite v3"
    })
  })

  it("exposes the original UID-first user workbench as a first-class workspace", () => {
    expect(findProductPage("bilibili-subjects")).toMatchObject({
      label: "B站用户监控",
      primaryAction: "创建用户工作台",
      tabs: ["监控对象", "用户工作台"]
    })
    expect(businessCapabilities.find((capability) => capability.id === "subject-workbench"))
      .toMatchObject({ pageId: "bilibili-subjects" })
  })

  it("exposes the original B/S live REST monitor as a first-class workspace", () => {
    expect(findProductPage("bilibili-live")).toMatchObject({
      label: "B站直播间监控",
      primaryAction: "添加直播间",
      tabs: [
        "直播间", "趋势对比", "状态事件", "实时弹幕", "观众榜单",
        "直播场次", "数据中心", "场次分析"
      ]
    })
    expect(
      navigationGroups.flatMap((group) => group.items).find((item) =>
        item.pageId === "bilibili-live"
      )
    ).toMatchObject({ label: "直播间监控", icon: "radio", badge: "REST" })
    expect(businessCapabilities.find((capability) => capability.id === "live-room-monitor"))
      .toMatchObject({
        pageId: "bilibili-live",
        implementation: "Python httpx Worker + Node WebSocket Worker + Local Core 场次/主体状态 + SQLite v10"
      })
  })

  it("exposes the original independent Douyin Web and OAuth auth workspace", () => {
    expect(findProductPage("douyin-auth")).toMatchObject({
      label: "我的抖音登录态",
      primaryAction: "开始 Web 扫码",
      tabs: []
    })
    expect(
      navigationGroups.flatMap((group) => group.items).find((item) => item.pageId === "douyin-auth")
    ).toMatchObject({ label: "抖音登录态", icon: "key" })
    expect(businessCapabilities.find((capability) => capability.id === "douyin-self-auth"))
      .toMatchObject({ pageId: "douyin-auth" })
  })
})
