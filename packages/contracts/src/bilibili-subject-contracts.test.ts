import { describe, expect, it } from "vitest"

import {
  CreateBilibiliSubjectInputSchema,
  QueryBilibiliSubjectTrendsInputSchema,
  UpdateBilibiliSubjectLayoutInputSchema
} from "./bilibili-subject"

describe("Bilibili subject contracts", () => {
  it("supports the original UID-first workbench creation flow", () => {
    expect(CreateBilibiliSubjectInputSchema.parse({ mid: "401742377" })).toEqual({
      mid: "401742377",
      tags: [],
      danmuEnabled: true
    })
    expect(() => CreateBilibiliSubjectInputSchema.parse({})).toThrow()
  })

  it("keeps the original trend defaults and widget layout payload", () => {
    const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
    expect(QueryBilibiliSubjectTrendsInputSchema.parse({ subjectId })).toEqual({
      subjectId,
      metrics: ["follower", "live_online"],
      range: "24h",
      bucket: "5m"
    })
    expect(UpdateBilibiliSubjectLayoutInputSchema.parse({
      subjectId,
      items: [{
        widgetKey: "bilibili-follower-live-heat",
        position: { x: 0, y: 0, w: 8, h: 3 }
      }]
    }).items[0]).toMatchObject({ enabled: true, settings: {} })
  })
})
