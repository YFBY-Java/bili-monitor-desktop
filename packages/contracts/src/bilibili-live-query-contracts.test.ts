import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { QueryBilibiliLiveDanmakuMetricsInputSchema } from "./bilibili-live-danmaku"
import { ListBilibiliLiveRoomsInputSchema, QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInputSchema, QueryBilibiliLiveEventsInputSchema } from "./bilibili-live"

const schemas = {
  ListBilibiliLiveRoomsInput: ListBilibiliLiveRoomsInputSchema,
  QueryBilibiliLiveTrendInput: QueryBilibiliLiveTrendInputSchema,
  QueryBilibiliLiveTrendsInput: QueryBilibiliLiveTrendsInputSchema,
  QueryBilibiliLiveEventsInput: QueryBilibiliLiveEventsInputSchema,
  QueryBilibiliLiveDanmakuMetricsInput: QueryBilibiliLiveDanmakuMetricsInputSchema
}
const fixtures: Array<{ name: string; schema: keyof typeof schemas; input: unknown; valid: boolean; output?: unknown }> =
  JSON.parse(readFileSync(new URL("../fixtures/live-query-inputs.json", import.meta.url), "utf8"))

describe("original live query input normalization", () => {
  it.each(fixtures)("$name", fixture => {
    const result = schemas[fixture.schema].safeParse(fixture.input)
    expect(result.success).toBe(fixture.valid)
    if (result.success) {
      expect(result.data).toEqual(fixture.output)
      expect(schemas[fixture.schema].parse(result.data)).toEqual(result.data)
    }
  })
  it("allows all selected room IDs without the old hundred-room cap", () => {
    const roomMonitorIds = Array.from({ length: 505 }, (_, index) => `018f0f39-7b5e-4cc1-862d-${String(index).padStart(12, "0")}`)
    expect(QueryBilibiliLiveTrendsInputSchema.parse({ roomMonitorIds }).roomMonitorIds).toEqual(roomMonitorIds)
  })
  it("keeps portable JSON Schema primitives aligned with the installed Zod version", () => {
    const document: { $defs: Record<string, Record<string, unknown>> } = JSON.parse(
      readFileSync(new URL("../schemas/bilibili-live-query.v1.schema.json", import.meta.url), "utf8"))
    expect(document.$defs.RoomMonitorId?.pattern).toBe(z.toJSONSchema(z.uuid()).pattern)
    expect(document.$defs.OffsetDateTime?.pattern).toBe(
      z.toJSONSchema(z.iso.datetime({ offset: true })).pattern?.replaceAll("\\d", "[0-9]"))
    expect(document.$defs.LiveHistoryLimit).toMatchObject({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER })
    expect(document.$defs.QueryBilibiliLiveDanmakuMetricsInput).toMatchObject({
      required: ["roomMonitorId"], properties: { range: { type: ["string", "null"], default: "1h" } }
    })
  })
})
