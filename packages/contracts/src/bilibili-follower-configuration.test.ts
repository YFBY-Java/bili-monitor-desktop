import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliFollowerCollectionConfigurationSchema, BilibiliFollowerHttpConfigurationSchema } from "./bilibili-follower-configuration"

const fixtures: Array<{ name: string; input: unknown; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/follower-collection-configuration.json", import.meta.url), "utf8"))
describe("portable original follower startup properties", () => {
  it.each(fixtures)("$name", fixture => {
    expect(BilibiliFollowerCollectionConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
  })
  it("uses the effective application.yml defaults, not the unused scheduler property fallback", () => {
    expect(BilibiliFollowerCollectionConfigurationSchema.parse({})).toEqual({
      enabled: true, storageEnabled: true, schedulerDelayMs: 1000, dueBatchSize: 10,
      defaultIntervalSeconds: 3600, minIntervalSeconds: 1, maxIntervalSeconds: 2592000,
      shortIntervalWarningSeconds: 60, failureBackoffSeconds: 900, requestMinIntervalMs: 1500,
      maxAttempts: 3, retryBackoffMs: 1500, connectTimeoutMs: 5000, readTimeoutMs: 10000,
      userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)", referer: "https://www.bilibili.com/"
    })
    expect(BilibiliFollowerHttpConfigurationSchema.parse({})).toMatchObject({
      userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)", referer: "https://www.bilibili.com/"
    })
  })
})
