import { describe, expect, it } from "vitest"

import { resolveCoreRequestTimeout } from "./core-client"

describe("Local Core request timeouts", () => {
  it("allows the original three-attempt Bilibili collection workflow to finish", () => {
    expect(resolveCoreRequestTimeout("bilibili-followers.add", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-followers.refresh", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-followers.add.v2", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-followers.refresh.v2", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-followers.list.v2", 5_000)).toBe(5_000)
    expect(resolveCoreRequestTimeout("bilibili-live.rooms.add", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-live.rooms.refresh", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-live.ranks.refresh", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-live.danmaku.start", 5_000)).toBe(90_000)
    expect(resolveCoreRequestTimeout("bilibili-followers.list", 5_000)).toBe(5_000)
    expect(resolveCoreRequestTimeout("subjects.list", 5_000)).toBe(5_000)
  })
})
