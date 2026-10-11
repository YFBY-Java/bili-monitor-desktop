import { describe, expect, it } from "vitest"

import { resolvePageId, searchWorkspace } from "./navigation-state"

describe("desktop navigation state", () => {
  it("resolves only implemented hashes and falls back to follower monitoring", () => {
    expect(resolvePageId("#bilibili-followers")).toBe("bilibili-followers")
    expect(resolvePageId("#bilibili-subjects")).toBe("bilibili-subjects")
    expect(resolvePageId("#bilibili-live")).toBe("bilibili-live")
    expect(resolvePageId("#live-data")).toBe("live-data")
    expect(resolvePageId("#live-analytics")).toBe("live-analytics")
    expect(resolvePageId("#douyin-auth")).toBe("douyin-auth")
    expect(resolvePageId("#models")).toBe("bilibili-followers")
    expect(resolvePageId("live-radar")).toBe("bilibili-followers")
    expect(resolvePageId("#does-not-exist")).toBe("bilibili-followers")
    expect(resolvePageId("")).toBe("bilibili-followers")
  })

  it("does not return fabricated workspaces from command search", () => {
    const followerResults = searchWorkspace("粉丝")

    expect(followerResults.some((result) => result.pageId === "bilibili-followers")).toBe(true)
    expect(searchWorkspace("直播间").some((result) => result.pageId === "bilibili-live")).toBe(true)
    expect(searchWorkspace("用户工作台").some((result) => result.pageId === "bilibili-subjects")).toBe(true)
    expect(searchWorkspace("扫码登录").some((result) => result.pageId === "douyin-auth")).toBe(true)
    expect(searchWorkspace("Agent")).toEqual([])
  })

  it("returns the implemented business for an empty command search", () => {
    expect(searchWorkspace("").map((result) => result.pageId)).toEqual([
      "bilibili-subjects",
      "bilibili-followers",
      "bilibili-live",
      "douyin-auth"
    ])
  })
})
