import { readFileSync, existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BilibiliLiveSnapshotDataV2Schema, BilibiliLiveSnapshotDataSchema,
  BilibiliSubjectTrendPointV3Schema } from "./index"

describe("Live v2 and Subject v3 canonical counters", () => {
  it("shares the small canonical fixture across counter consumers", () => {
    const cases: Array<{ name: string; value: unknown; valid: boolean }> = JSON.parse(
      readFileSync(new URL("../fixtures/live-long64-canonical.json", import.meta.url), "utf8"))
    for (const entry of cases) {
      expect(BilibiliLiveSnapshotDataV2Schema.safeParse({ uid: "1", roomId: "2", liveStatus: 1,
        onlineCount: entry.value, attentionCount: entry.value }).success, entry.name).toBe(entry.valid)
      expect(BilibiliSubjectTrendPointV3Schema.safeParse({ bucketAt: "2026-10-07T00:00:00Z",
        liveOnlineCount: entry.value }).success, entry.name).toBe(entry.valid)
    }
    expect(BilibiliLiveSnapshotDataSchema.safeParse({ uid: "1", roomId: "2", liveStatus: 1, onlineCount: 1 }).success).toBe(true)
  })
  it("publishes new portable schemas while preserving old contracts", () => {
    for (const name of ["bilibili-live-worker.v2.schema.json", "bilibili-live-query.v2.schema.json", "bilibili-subject.v3.schema.json"]) {
      expect(existsSync(new URL("../schemas/" + name, import.meta.url))).toBe(true)
    }
  })
})
