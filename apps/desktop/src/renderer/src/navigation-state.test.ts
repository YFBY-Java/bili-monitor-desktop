import { describe, expect, it } from "vitest"

import { resolvePageId, searchWorkspace } from "./navigation-state"

describe("desktop navigation state", () => {
  it("resolves known hashes and falls back to the command center", () => {
    expect(resolvePageId("#models")).toBe("models")
    expect(resolvePageId("live-radar")).toBe("live-radar")
    expect(resolvePageId("#does-not-exist")).toBe("command-center")
    expect(resolvePageId("")).toBe("command-center")
  })

  it("searches pages and inherited BiliMonitor capabilities together", () => {
    const loginResults = searchWorkspace("扫码登录")
    const danmakuResults = searchWorkspace("弹幕")
    const durableTaskResults = searchWorkspace("持久任务")

    expect(loginResults[0]?.pageId).toBe("platform-accounts")
    expect(loginResults.some((result) => result.label.includes("B站扫码"))).toBe(true)
    expect(danmakuResults.some((result) => result.pageId === "live-radar")).toBe(true)
    expect(durableTaskResults.some((result) => result.pageId === "workflows")).toBe(true)
  })

  it("returns high-signal defaults for an empty command search", () => {
    expect(searchWorkspace("").map((result) => result.pageId)).toEqual([
      "command-center",
      "campaigns",
      "agent-studio",
      "approvals"
    ])
  })
})
