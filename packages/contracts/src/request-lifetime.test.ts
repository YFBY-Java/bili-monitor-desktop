import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { RuntimeEnvelopeSchema } from "./runtime-protocol"
const fixtures: Array<{ name: string; input: object; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/runtime-keep-alive.json", import.meta.url), "utf8"))
describe("opt-in runtime keepAlive compatibility", () => {
  it.each(fixtures)("$name", fixture => {
    expect(RuntimeEnvelopeSchema.safeParse({ id: "r", type: "worker.ping", version: 1,
      timestamp: "2026-09-13T00:00:00Z", correlationId: "c", traceId: "t", payload: {}, ...fixture.input }).success)
      .toBe(fixture.valid)
  })
})
