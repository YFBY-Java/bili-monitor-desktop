import { BilibiliFollowerPointSchema } from "@bmd/contracts"
import { expect, it } from "vitest"
import * as implementation from "./legacy-follower-response"

it("turns only legacy Long precision or narrower counter-domain failures into an actionable compatibility code", async () => {
  expect(implementation).toHaveProperty("legacyFollowerResponse")
  const project = implementation.legacyFollowerResponse
  const precision = new RangeError("LONG64_LEGACY_PRECISION_UNSUPPORTED: unsafe number")
  expect(() => project(() => { throw precision })).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
  await expect(project(async () => { throw precision }))
    .rejects.toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED", retryable: false })
  let negative: unknown
  try { project(() => BilibiliFollowerPointSchema.parse({ capturedAt: "2026-10-05T00:00:00Z",
    followerCount: -1, sourceEndpoint: "x/web-interface/card" })) } catch (error) { negative = error }
  expect(negative).toMatchObject({ code: "LONG64_LEGACY_PRECISION_UNSUPPORTED" })
  const unrelated = new Error("unrelated")
  expect(() => project(() => { throw unrelated })).toThrow(unrelated)
  expect(project(() => 123)).toBe(123)
  await expect(project(async () => 123)).resolves.toBe(123)
})
