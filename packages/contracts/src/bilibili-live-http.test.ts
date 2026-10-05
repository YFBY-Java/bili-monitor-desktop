import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliLiveCollectionConfigurationSchema } from "./bilibili-live-configuration"
import { BilibiliLiveRoomRequestSchema } from "./bilibili-live"
import { BilibiliLiveRankWorkerRequestSchema } from "./bilibili-live-rank"

const fixtures: Array<{ name: string; input: object; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-http-configuration.json", import.meta.url), "utf8"))
describe("HTTP configuration in Core and live Worker request contracts", () => {
  it.each(fixtures)("$name", fixture => {
    expect(BilibiliLiveCollectionConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
    expect(BilibiliLiveRoomRequestSchema.safeParse({ taskId: "t", attempt: 1, leaseId: "l", roomId: "2",
      httpConfiguration: fixture.input }).success).toBe(fixture.valid)
    expect(BilibiliLiveRankWorkerRequestSchema.safeParse({ taskId: "t", attempt: 1, leaseId: "l",
      roomId: "2", ruid: "3", family: "AUDIENCE", type: "online_rank", page: 1, pageSize: 50,
      httpConfiguration: fixture.input }).success).toBe(fixture.valid)
  })
  it("retains original HTTP defaults without requiring new fields from old Worker callers", () => {
    expect(BilibiliLiveCollectionConfigurationSchema.parse({})).toMatchObject({ connectTimeoutMs: 5000,
      readTimeoutMs: 10000, userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)",
      referer: "https://live.bilibili.com/" })
    expect(BilibiliLiveRoomRequestSchema.parse({ taskId: "t", attempt: 1, leaseId: "l", roomId: "2" }))
      .not.toHaveProperty("httpConfiguration")
    expect(BilibiliLiveRankWorkerRequestSchema.parse({ taskId: "t", attempt: 1, leaseId: "l",
      roomId: "2", ruid: "3", family: "AUDIENCE", type: "online_rank", page: 1, pageSize: 50 }))
      .not.toHaveProperty("httpConfiguration")
  })
})
