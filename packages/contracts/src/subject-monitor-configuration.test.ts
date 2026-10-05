import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { SubjectMonitorConfigurationSchema, startupConfigurationErrorMessage } from "./subject-monitor-configuration"

const fixtures: Array<{ name: string; input: unknown; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/subject-monitor-configuration.json", import.meta.url), "utf8"))

describe("portable subject monitor startup configuration", () => {
  it.each(fixtures)("$name", fixture => {
    expect(SubjectMonitorConfigurationSchema.safeParse(fixture.input).success).toBe(fixture.valid)
  })
  it("defaults the original missing enabled property to true", () => {
    expect(SubjectMonitorConfigurationSchema.parse({})).toEqual({ enabled: true })
  })
  it("does not let inherited names or unrecognized codes become trusted startup errors", () => {
    for (const code of [undefined, "toString", "__proto__", "synthetic-private-code", "CORE_STOPPED"]) {
      expect(startupConfigurationErrorMessage(code)).toBeUndefined()
    }
    for (const code of ["BILIBILI_LIVE_CONFIG_INVALID", "SUBJECT_MONITOR_CONFIG_INVALID", "BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID"]) {
      expect(startupConfigurationErrorMessage(code)).toMatch(/重启/u)
    }
  })
})
