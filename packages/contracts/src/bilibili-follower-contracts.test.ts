import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import * as contracts from "./index"

import { describe, expect, it } from "vitest"

describe("Bilibili follower contracts", () => {
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
