import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliLiveDanmakuConfigurationSchema } from "./bilibili-live-danmaku-configuration"

const fixtures: Array<{ name: string; input: unknown; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-danmaku-configuration.json", import.meta.url), "utf8"))
describe("portable danmaku primitive configuration", () => {
  it.each(fixtures)("$name", fixture => {
    expect(BilibiliLiveDanmakuConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
  })
  it("uses the migrated original field defaults", () => {
    expect(BilibiliLiveDanmakuConfigurationSchema.parse({})).toEqual({ enabled: true, autoStartEnabled: true,
      schedulerDelayMs: 5000, maxConnections: 10, protocolVersion: 3, recentMessageLimitPerRoom: 200,
      heartbeatSeconds: 30, connectTimeoutMs: 8000, useLoginCredential: true, webLocation: "444.8", clientVersion: "1.14.3",
      wbiCacheSeconds: 43200, buvidCacheSeconds: 43200, bucketSeconds: 60, listenProbeSeconds: 20 })
  })
})
