import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadSubjectMonitorConfiguration } from "./subject-monitor-config"

describe("read-only workbench startup configuration", () => {
  let directory: string
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
  async function setup() {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-subject-config-"))
    return resolve(directory, "config", "subject-monitor.json")
  }
  it("does not create a missing config file or folder and preserves enabled defaults", async () => {
    await setup()
    expect(await loadSubjectMonitorConfiguration(directory, {})).toEqual({ enabled: true })
    await expect(access(resolve(directory, "config"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("reads a BOM file and both environment override directions without writing it", async () => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    const contents = '\uFEFF{ "enabled": false }\r\n'
    await writeFile(path, contents, "utf8")
    expect(await loadSubjectMonitorConfiguration(directory, {})).toEqual({ enabled: false })
    expect(await loadSubjectMonitorConfiguration(directory, { APP_SUBJECTMONITOR_ENABLED: " TRUE " })).toEqual({ enabled: true })
    expect(await loadSubjectMonitorConfiguration(directory, { APP_SUBJECTMONITOR_ENABLED: " FALSE " })).toEqual({ enabled: false })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it.each(["", "0", "1", "off", "synthetic-private-value"])("rejects invalid boolean override %j", async value => {
    await setup()
    const error = await loadSubjectMonitorConfiguration(directory, { APP_SUBJECTMONITOR_ENABLED: value })
      .then(() => undefined, (caught: unknown) => caught)
    expect(error).toMatchObject({ code: "SUBJECT_MONITOR_CONFIG_INVALID" })
    expect(String(error)).not.toMatch(/synthetic-private|D:\\|SyntaxError/u)
  })
  it.each(['{"enabled":"false"}', 'synthetic-private-json{'])("does not conceal invalid file values behind environment overrides", async contents => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    await writeFile(path, contents, "utf8")
    await expect(loadSubjectMonitorConfiguration(directory, { APP_SUBJECTMONITOR_ENABLED: "false" }))
      .rejects.toMatchObject({ code: "SUBJECT_MONITOR_CONFIG_INVALID" })
  })
  it("rejects an unreadable path instead of treating it as missing", async () => {
    const path = await setup()
    await mkdir(path, { recursive: true })
    await expect(loadSubjectMonitorConfiguration(directory, {}))
      .rejects.toMatchObject({ code: "SUBJECT_MONITOR_CONFIG_INVALID" })
  })
})
