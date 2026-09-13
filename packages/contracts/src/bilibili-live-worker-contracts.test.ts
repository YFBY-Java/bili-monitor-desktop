import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { BilibiliLiveSnapshotDataSchema, BilibiliLiveRoomSchema, BilibiliLiveFetchedSnapshotSchema,
  BilibiliLiveFetchedOptionalSnapshotSchema, BilibiliLiveFetchedStatusBatchSchema } from "./bilibili-live"
import { BilibiliLiveRoomRequestSchema, BilibiliLiveUidRequestSchema, BilibiliLiveStatusByUidsRequestSchema } from "./bilibili-live"

const fixtures: Array<{ name: string; method: string; result?: unknown; error?: unknown }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-worker-responses.json", import.meta.url), "utf8"))
const validation: Array<{ name: string; patch: Record<string, unknown>; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-worker-validation.json", import.meta.url), "utf8"))
const requests = { RoomRequest: BilibiliLiveRoomRequestSchema, UidRequest: BilibiliLiveUidRequestSchema,
  StatusRequest: BilibiliLiveStatusByUidsRequestSchema }
const inputs: Array<{ name: string; schema: keyof typeof requests; input: unknown; valid: boolean; output?: unknown }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-worker-inputs.json", import.meta.url), "utf8"))

describe("original live Worker output fields shared with Python", () => {
  it.each(inputs)("shared request: $name", fixture => {
    const result = requests[fixture.schema].safeParse(fixture.input)
    expect(result.success).toBe(fixture.valid)
    if (result.success) expect(result.data).toEqual(fixture.output ?? fixture.input)
  })
  it("accepts configured batches larger than the original default of 30", () => {
    const base = { taskId: "t", attempt: 1, leaseId: "l" }
    expect(requests.StatusRequest.safeParse({ ...base, uids: Array.from({ length: 30 }, (_, i) => String(i + 1)) }).success).toBe(true)
    expect(requests.StatusRequest.safeParse({ ...base, uids: Array.from({ length: 75 }, (_, i) => String(i + 1)) }).success).toBe(true)
  })
  it.each(fixtures.filter(f => !f.error && f.result !== null))("$name", fixture => {
    const results = Array.isArray(fixture.result) ? fixture.result : [fixture.result]
    for (const result of results) expect(BilibiliLiveSnapshotDataSchema.parse(result)).toEqual(result)
  })

  it("keeps zero auxiliary IDs and nonblank profile whitespace through room projection", () => {
    const snapshot = fixtures[0]!.result
    if (!Array.isArray(snapshot)) throw new Error("Expected batch fixture")
    const room = BilibiliLiveRoomSchema.parse({ ...snapshot[0], id: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      monitorStatus: "ACTIVE", intervalSeconds: 300, recentTrend: [], version: 1 })
    expect(room).toMatchObject({ shortId: "0", areaId: "0", parentAreaId: "0", uname: " 合成直播主播 " })
  })

  it.each(validation)("shared output acceptance: $name", fixture => {
    const input = { uid: "101", roomId: "201", liveStatus: 0, ...fixture.patch }
    const result = BilibiliLiveSnapshotDataSchema.safeParse(input)
    expect(result.success).toBe(fixture.valid)
    if (result.success) expect(result.data).toEqual(input)
  })

  it("matches portable datetime pattern and distinguishes full, optional and batch outputs", () => {
    const document: { $defs: Record<string, Record<string, unknown>> } = JSON.parse(
      readFileSync(new URL("../schemas/bilibili-live-worker.v1.schema.json", import.meta.url), "utf8"))
    expect(document.$defs.IsoDateTime?.pattern).toBe(z.toJSONSchema(z.iso.datetime()).pattern?.replaceAll("\\d", "[0-9]"))
    const metadata = { fetchedAt: "2026-09-13T03:00:00Z", sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
      statusCode: 200, durationMs: 1, evidenceObject: { objectId: `sha256:${"a".repeat(64)}`,
        sha256: "a".repeat(64), relativePath: "objects/synthetic.json", sizeBytes: 2, mediaType: "application/json" } }
    expect(BilibiliLiveFetchedSnapshotSchema.safeParse(metadata).success).toBe(false)
    expect(BilibiliLiveFetchedOptionalSnapshotSchema.parse(metadata)).toEqual(metadata)
    expect(BilibiliLiveFetchedOptionalSnapshotSchema.safeParse({ ...metadata, snapshot: null }).success).toBe(false)
    expect(BilibiliLiveFetchedStatusBatchSchema.parse({ ...metadata, snapshots: [] }).snapshots).toEqual([])
  })
})
