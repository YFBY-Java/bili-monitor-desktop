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
      enabled: true, storageEnabled: true, schedulerDelayMs: 1000, dueBatchSize: 20, statusBatchSize: 30,
      defaultIntervalSeconds: 300, minIntervalSeconds: 1, maxIntervalSeconds: 2592000,
      shortIntervalWarningSeconds: 120, failureBackoffSeconds: 900, requestMinIntervalMs: 1500,
      maxAttempts: 3, retryBackoffMs: 1500,
      connectTimeoutMs: 5000, readTimeoutMs: 10000,
      userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)",
      referer: "https://live.bilibili.com/"
    })
    expect(BilibiliLiveCollectionConfigurationSchema.parse({ statusBatchSize: -1 }).statusBatchSize).toBe(-1)
  })
})
