import { describe, expect, it } from "vitest"

import { nextReconnectDelay } from "./reconnect-policy"

describe("realtime reconnect policy", () => {
  it("backs off exponentially and caps the delay", () => {
    expect([0, 1, 2, 10].map((attempt) => nextReconnectDelay(attempt, () => 0))).toEqual([
      500, 1_000, 2_000, 30_000
    ])
  })

  it("adds bounded jitter", () => {
    expect(nextReconnectDelay(1, () => 1)).toBe(1_200)
  })
})
