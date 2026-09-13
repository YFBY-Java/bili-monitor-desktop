import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliLiveCollectionConfigurationSchema } from "./bilibili-live-configuration"

const fixtures: Array<{ name: string; input: unknown; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-collection-configuration.json", import.meta.url), "utf8"))

describe("portable live collection configuration", () => {
  it.each(fixtures)("$name", fixture => {
    expect(BilibiliLiveCollectionConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
  })
  it("keeps original defaults without normalizing batch values before their consumer", () => {
    expect(BilibiliLiveCollectionConfigurationSchema.parse({})).toEqual({
      enabled: true, schedulerDelayMs: 1000, dueBatchSize: 20, statusBatchSize: 30
    })
    expect(BilibiliLiveCollectionConfigurationSchema.parse({ statusBatchSize: -1 }).statusBatchSize).toBe(-1)
  })
})
