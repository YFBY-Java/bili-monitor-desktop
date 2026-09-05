import { describe, expect, it } from "vitest"

import { createInitialRuntime } from "./App"

describe("App initial runtime", () => {
  it("reports the current SQLite schema in browser preview mode", () => {
    expect(createInitialRuntime(true)).toMatchObject({
      phase: "offline",
      schemaVersion: 11
    })
  })
})
