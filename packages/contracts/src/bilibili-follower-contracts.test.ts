import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import * as contracts from "./index"

import { describe, expect, it } from "vitest"

const queryFixtures = JSON.parse(readFileSync(new URL("../fixtures/follower-query-inputs.json", import.meta.url), "utf8")) as Array<{
  name: string; schema: "ListBilibiliFollowerMonitorsInput" | "QueryBilibiliFollowerTrendInput" | "QueryBilibiliFollowerTrendsInput"
  input: Record<string, unknown>; valid: boolean; expected?: Record<string, unknown>; limit?: number; limitPerUser?: number
}>

describe("Bilibili follower contracts", () => {
  it.each(queryFixtures)("validates shared query fixture: $name", fixture => {
    const result = contracts[`${fixture.schema}Schema`].safeParse(fixture.input)
    expect(result.success).toBe(fixture.valid)
    if (!result.success) return
    if (fixture.expected) expect(result.data).toEqual(fixture.expected)
    if (fixture.limit !== undefined) expect(result.data).toMatchObject({ limit: fixture.limit })
    if (fixture.limitPerUser !== undefined) expect(result.data).toMatchObject({ limitPerUser: fixture.limitPerUser })
  })

  it("publishes a language-neutral follower-monitor schema for TypeScript and Python", () => {
    const schemaPath = fileURLToPath(new URL("../schemas/bilibili-follower.v1.schema.json", import.meta.url))
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      $id: string
      $defs: Record<string, unknown>
    }

    expect(schema.$id).toBe("https://bilimonitor.local/schemas/bilibili-follower.v1.schema.json")
    expect(schema.$defs).toHaveProperty("BilibiliFollowerMonitor")
    expect(schema.$defs).toHaveProperty("BilibiliFollowerFetchedSnapshot")
    expect(schema.$defs).toHaveProperty("AddBilibiliFollowerMonitorInput")
    expect(schema.$defs).toHaveProperty("UpdateBilibiliFollowerMonitorSettingsInput")
  })

  it("publishes the original BiliMonitor follower-monitor contract surface", () => {
    expect(contracts).toEqual(expect.objectContaining({
      AddBilibiliFollowerMonitorInputSchema: expect.any(Object),
      BilibiliFollowerMonitorSchema: expect.any(Object),
      BilibiliFollowerTrendSchema: expect.any(Object),
      RefreshBilibiliFollowerMonitorInputSchema: expect.any(Object),
      UpdateBilibiliFollowerMonitorStatusInputSchema: expect.any(Object),
      UpdateBilibiliFollowerMonitorSettingsInputSchema: expect.any(Object)
    }))
  })
})
