import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  BilibiliSubjectSchema,
  BilibiliSubjectWidgetLayoutSchema,
  CreateBilibiliSubjectInputSchema,
  ListBilibiliSubjectsInputSchema,
  QueryBilibiliSubjectTrendsInputSchema,
  UpdateBilibiliSubjectBindingInputSchema,
  UpdateBilibiliSubjectInputSchema,
  UpdateBilibiliSubjectLayoutInputSchema,
  type BilibiliSubject,
  type BilibiliSubjectBinding,
  type CreateBilibiliSubjectInput,
  type UpdateBilibiliSubjectBindingInput,
  type UpdateBilibiliSubjectInput
} from "./bilibili-subject"

const textFixture: {
  create: CreateBilibiliSubjectInput
  remarkUnit: string
  remarkRepeat: number
  update: Omit<UpdateBilibiliSubjectInput, "subjectId">
  expected: Pick<BilibiliSubject, "displayName" | "avatarUrl" | "tags">
  expectedUpdatedName: string
  bindingUpdate: Omit<UpdateBilibiliSubjectBindingInput, "subjectId">
  expectedCapabilities: BilibiliSubjectBinding["enabledCapabilities"]
} = JSON.parse(readFileSync(
  new URL("../fixtures/subject-text-inputs.json", import.meta.url), "utf8"
))

describe("Bilibili subject contracts", () => {
  it("supports the original UID-first workbench creation flow", () => {
    expect(ListBilibiliSubjectsInputSchema.parse({})).toStrictEqual({})
    expect(ListBilibiliSubjectsInputSchema.parse({ limit: 501 })).toStrictEqual({ limit: 501 })
    expect(ListBilibiliSubjectsInputSchema.parse({ limit: 1 })).toStrictEqual({ limit: 1 })
    expect(CreateBilibiliSubjectInputSchema.parse({ mid: "401742377" })).toStrictEqual({
      mid: "401742377",
      tags: []
    })
    expect(CreateBilibiliSubjectInputSchema.parse({ displayName: "工作台" })).toStrictEqual({
      displayName: "工作台",
      tags: []
    })
    expect(CreateBilibiliSubjectInputSchema.parse({
      displayName: "工作台", danmuEnabled: false
    })).toStrictEqual({
      displayName: "工作台",
      tags: [],
      danmuEnabled: false
    })
    expect(CreateBilibiliSubjectInputSchema.parse({
      mid: "401742377", danmuEnabled: true
    })).toStrictEqual({
      mid: "401742377",
      tags: [],
      danmuEnabled: true
    })
    expect(() => CreateBilibiliSubjectInputSchema.parse({})).toThrow()
    const remark = textFixture.remarkUnit.repeat(textFixture.remarkRepeat)
    expect(CreateBilibiliSubjectInputSchema.safeParse({ ...textFixture.create, remark }).success)
      .toBe(true)
    expect(UpdateBilibiliSubjectInputSchema.safeParse({
      subjectId: "018f0f39-7b5e-4cc1-862d-9a208b3d0800", ...textFixture.update
    }).success).toBe(true)
    // @Size is applied to the raw Java UTF-16 input, before service trim.
    expect(CreateBilibiliSubjectInputSchema.safeParse({ displayName: "🌸".repeat(80) }).success)
      .toBe(true)
    expect(CreateBilibiliSubjectInputSchema.safeParse({ displayName: "🌸".repeat(81) }).success)
      .toBe(false)
    expect(CreateBilibiliSubjectInputSchema.safeParse({ displayName: `${" ".repeat(160)}x` }).success)
      .toBe(false)
    const subject = {
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0800", ...textFixture.expected, remark,
      monitorStatus: "ACTIVE", createdAt: "2026-10-07T08:00:00.000Z",
      updatedAt: "2026-10-07T08:00:00.000Z"
    }
    expect(BilibiliSubjectSchema.parse(subject)).toStrictEqual(subject)
    const binding = {
      id: subject.id, subjectId: subject.id,
      enabledCapabilities: textFixture.expectedCapabilities, danmuEnabled: false,
      createdAt: subject.createdAt, updatedAt: subject.updatedAt
    }
    expect(UpdateBilibiliSubjectBindingInputSchema.safeParse({
      subjectId: subject.id, ...textFixture.bindingUpdate
    }).success).toBe(true)
    expect(BilibiliSubjectSchema.parse({ ...subject, bilibiliBinding: binding }).bilibiliBinding)
      .toStrictEqual(binding)
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
    const rawKey = ` ${"😀".repeat(78)} `
    const layout = { widgetKey: rawKey, enabled: true, position: {}, settings: {} }
    expect(UpdateBilibiliSubjectLayoutInputSchema.parse({ subjectId, items: [layout] }).items)
      .toEqual([layout])
    expect(BilibiliSubjectWidgetLayoutSchema.parse(layout)).toEqual(layout)
    expect(UpdateBilibiliSubjectLayoutInputSchema.safeParse({ subjectId, items: [{ widgetKey: "\u00a0" }] }).success)
      .toBe(true)
    expect(UpdateBilibiliSubjectLayoutInputSchema.safeParse({ subjectId, items: [{ widgetKey: "\u001c\u3000" }] }).success)
      .toBe(false)
    expect(UpdateBilibiliSubjectLayoutInputSchema.safeParse({ subjectId, items: [{ widgetKey: `${rawKey}x` }] }).success)
      .toBe(false)
    expect(UpdateBilibiliSubjectLayoutInputSchema.safeParse({ subjectId }).success).toBe(false)
    expect(UpdateBilibiliSubjectLayoutInputSchema.safeParse({ subjectId, items: null }).success).toBe(false)
  })
})
