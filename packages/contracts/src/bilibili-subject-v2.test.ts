import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as contracts from "./index"

const timestamp = "2026-10-05T01:00:00.000Z"
const id = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
const user = { monitorId: id, mid: "2", nickname: "原始资料", followerCount: "9223372036854775807",
  followingCount: "-9223372036854775808", followerDelta24h: "-9223372036854775808", monitorStatus: "ACTIVE" }
const summary = { followerCount: "9223372036854775807", followerDelta24h: "-9223372036854775808", onlineCount: 200,
  onlineDelta24h: -1, onlinePeak24h: 300, healthScore: 100, enabledModuleCount: 2, totalModuleCount: 4 }
const workbench = { subject: { id, displayName: "原始资料", tags: [], monitorStatus: "ACTIVE", createdAt: timestamp, updatedAt: timestamp },
  bilibiliUser: user, summary, danmu: { enabled: true, status: "RUNNING", recentMessages: [] }, layout: [], recentEvents: [] }
const trend = { subjectId: id, metrics: ["follower", "live_online"], range: "24h", bucket: "5m",
  points: [{ bucketAt: timestamp, followerCount: "9223372036854775807", liveOnlineCount: 200 }] }

describe("Bilibili Subject v2 precision consumers", () => {
  it("uses the same canonical positive Long MID domain in every nested workbench identity", () => {
    const cases = JSON.parse(readFileSync(new URL("../fixtures/follower-long64-canonical.json", import.meta.url), "utf8")) as Array<{ value: unknown; positive: boolean }>
    const binding = { id, subjectId: id, enabledCapabilities: ["follower"], danmuEnabled: false, createdAt: timestamp, updatedAt: timestamp }
    for (const entry of cases) {
      expect(contracts.BilibiliSubjectUserV2Schema.safeParse({ ...user, mid: entry.value }).success).toBe(entry.positive)
      expect(contracts.BilibiliSubjectWorkbenchV2Schema.safeParse({ ...workbench,
        bilibiliBinding: { ...binding, mid: entry.value } }).success).toBe(entry.positive)
      expect(contracts.BilibiliSubjectWorkbenchV2Schema.safeParse({ ...workbench,
        subject: { ...workbench.subject, bilibiliBinding: { ...binding, mid: entry.value } } }).success).toBe(entry.positive)
    }
  })
  it("retains complete follower Long fields and the original numeric live summary", () => {
    expect(contracts).toHaveProperty("BilibiliSubjectWorkbenchV2Schema")
    expect(contracts.BilibiliSubjectWorkbenchV2Schema.parse(workbench)).toEqual(workbench)
  })
  it("uses follower strings and live numbers in the same trend response", () => {
    expect(contracts).toHaveProperty("BilibiliSubjectTrendV2Schema")
    expect(contracts.BilibiliSubjectTrendV2Schema.parse(trend)).toEqual(trend)
    expect(contracts.BilibiliSubjectTrendV2Schema.safeParse({ ...trend, points: [{ ...trend.points[0], liveOnlineCount: "200" }] }).success).toBe(false)
    expect(contracts.BilibiliSubjectTrendV2Schema.safeParse({ ...trend, points: [{ ...trend.points[0], followerCount: 200 }] }).success).toBe(false)
  })
  it("preserves omission instead of filling a missing follower count with zero", () => {
    expect(contracts).toHaveProperty("BilibiliSubjectWorkbenchV2Schema")
    const { followerCount, followingCount, followerDelta24h, ...withoutCounts } = user
    const { followerCount: ignoredCount, followerDelta24h: ignoredDelta, ...withoutSummaryCounts } = summary
    const value = { ...workbench, bilibiliUser: withoutCounts, summary: withoutSummaryCounts }
    expect(contracts.BilibiliSubjectWorkbenchV2Schema.parse(value)).toEqual(value)
  })
  it("keeps v1 safe numeric Subject workbench compatibility", () => {
    const value = { ...workbench, bilibiliUser: { ...user, followerCount: 100, followingCount: 3, followerDelta24h: -1 },
      summary: { ...summary, followerCount: 100, followerDelta24h: -1 } }
    expect(contracts.BilibiliSubjectWorkbenchSchema.parse(value)).toEqual(value)
    expect(contracts.BilibiliSubjectWorkbenchSchema.safeParse(workbench).success).toBe(false)
  })
  it("publishes standalone portable workbench and trend schemas", () => {
    const path = new URL("../schemas/bilibili-subject.v2.schema.json", import.meta.url)
    expect(existsSync(path)).toBe(true)
    const document = JSON.parse(readFileSync(path, "utf8")) as { $id: string; $defs: Record<string, unknown> }
    expect(document.$id).toBe("https://bilimonitor.local/schemas/bilibili-subject.v2.schema.json")
    for (const name of ["JavaLongString", "BilibiliSubjectUserV2", "BilibiliSubjectSummaryV2", "BilibiliSubjectWorkbenchV2", "BilibiliSubjectTrendPointV2", "BilibiliSubjectTrendV2"]) {
      expect(document.$defs).toHaveProperty(name)
    }
  })
})
