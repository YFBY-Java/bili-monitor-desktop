import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { BilibiliFollowerProfileSchema, BilibiliFollowerFetchedSnapshotSchema, BilibiliFollowerMonitorSchema } from "./bilibili-follower"

const fixtures: Array<{ name: string; input: unknown; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/follower-profile.json", import.meta.url), "utf8"))
it.each(fixtures)("independent profile: $name", fixture => {
  expect(BilibiliFollowerProfileSchema.safeParse(fixture.input).success).toBe(fixture.valid)
})

const texts: Array<{ name: string; input: unknown; repeat?: number; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/follower-profile-text.json", import.meta.url), "utf8"))
it.each(texts)("raw profile text: $name", fixture => {
  const nickname = typeof fixture.input === "string" ? fixture.input.repeat(fixture.repeat ?? 1) : fixture.input
  const result = BilibiliFollowerProfileSchema.safeParse({ mid: "2", nickname })
  expect(result.success).toBe(fixture.valid)
  if (result.success) expect(result.data.nickname).toBe(nickname)
  const fetched = BilibiliFollowerFetchedSnapshotSchema.safeParse({ ...snapshot, nickname })
  expect(fetched.success).toBe(fixture.valid)
  if (fetched.success) expect(fetched.data.nickname).toBe(nickname)
  const stored = BilibiliFollowerMonitorSchema.safeParse({ id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
    mid: "2", nickname, profileUrl: snapshot.profileUrl,
    monitorStatus: "ACTIVE", intervalSeconds: 60, recentTrend: [], version: 1 })
  expect(stored.success).toBe(fixture.valid && typeof nickname === "string" && Array.from(nickname).length <= 160)
  if (stored.success) expect(stored.data.nickname).toBe(nickname)
})

const snapshot = { mid: "2", profileUrl: "https://space.bilibili.com/2", followerCount: 10,
  fetchedAt: "2026-10-05T00:00:00Z", sourceEndpoint: "x/web-interface/card", statusCode: 200, durationMs: 1,
  evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64), sizeBytes: 1,
    relativePath: "cas/synthetic-profile.json", mediaType: "application/json" } }
it.each(["  原样昵称  ", "\u00a0", "名".repeat(161), "🌸".repeat(160)])("preserves fetched nickname %s", nickname => {
  expect(BilibiliFollowerFetchedSnapshotSchema.parse({ ...snapshot, nickname }).nickname).toBe(nickname)
})
it.each(["//i0.hdslb.com/synthetic.jpg", "  https://example.invalid/a  ", "not-a-url", "false"])(
  "does not make a successful card fail because avatar text is %s", avatarUrl => {
    expect(BilibiliFollowerFetchedSnapshotSchema.parse({ ...snapshot, avatarUrl }).avatarUrl).toBe(avatarUrl)
  })
it.each(["  原样昵称  ", "\u00a0", "🌸".repeat(160)])("preserves stored nickname %s", nickname => {
  const result = BilibiliFollowerMonitorSchema.parse({ id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
    mid: "2", nickname, avatarUrl: "not-a-url", profileUrl: snapshot.profileUrl,
    monitorStatus: "ACTIVE", intervalSeconds: 60, recentTrend: [], version: 1 })
  expect(result.nickname).toBe(nickname)
  expect(result.avatarUrl).toBe("not-a-url")
})
