import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliFollowerFetchRequestSchema } from "./bilibili-follower"

const fixtures: Array<{ name: string; input: Record<string, unknown>; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/follower-http-configuration.json", import.meta.url), "utf8"))
describe("follower HTTP worker request compatibility", () => {
  it.each(fixtures)("$name", fixture => {
    expect(BilibiliFollowerFetchRequestSchema.safeParse({ taskId: "t", attempt: 1, leaseId: "l", mid: "2", ...fixture.input }).success).toBe(fixture.valid)
  })
})
