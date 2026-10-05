import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadFollowerCollectionConfiguration } from "./bilibili-follower-collection-config"

describe("read-only follower startup file and original environment mapping", () => {
  let directory: string
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
  async function setup(contents?: string) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-config-loader-"))
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    if (contents !== undefined) { await mkdir(resolve(directory, "config")); await writeFile(path, contents, "utf8") }
    return path
  }
  it("uses defaults only for missing files and does not create the configuration directory", async () => {
    await setup()
    expect(await loadFollowerCollectionConfiguration(directory, {})).toMatchObject({ enabled: true,
      storageEnabled: true, schedulerDelayMs: 1000, dueBatchSize: 10, defaultIntervalSeconds: 3600 })
    await expect(access(resolve(directory, "config"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("reads BOM and all original aliases without rewriting the file", async () => {
    const contents = '\uFEFF{"enabled":true,"defaultIntervalSeconds":900}'
    const path = await setup(contents)
    expect(await loadFollowerCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MONITOR_ENABLED: " false ",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED: "FALSE",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_SCHEDULER_DELAY_MS: "250",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "-2",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_INTERVAL_SECONDS: "+00420",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MIN_INTERVAL_SECONDS: "120",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MAX_INTERVAL_SECONDS: "600",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_SHORT_INTERVAL_WARNING_SECONDS: "150",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_FAILURE_BACKOFF_SECONDS: "1200",
      SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS: "75"
    })).toMatchObject({ enabled: false, storageEnabled: false, schedulerDelayMs: 250, dueBatchSize: -2,
      defaultIntervalSeconds: 420, minIntervalSeconds: 120, maxIntervalSeconds: 600,
      shortIntervalWarningSeconds: 150, failureBackoffSeconds: 1200, requestMinIntervalMs: 75 })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it("reads every canonical property and gives it precedence over application.yml aliases", async () => {
    await setup('{}')
    const expected = { enabled: false, storageEnabled: false, schedulerDelayMs: 250, dueBatchSize: 2,
      defaultIntervalSeconds: 420, minIntervalSeconds: 12, maxIntervalSeconds: 600,
      shortIntervalWarningSeconds: 15, failureBackoffSeconds: 500, requestMinIntervalMs: 75,
      maxAttempts: 1, retryBackoffMs: 200, connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture canonical follower/2", referer: "https://www.bilibili.com/configured" }
    const environment: NodeJS.ProcessEnv = { SOCIAL_MONITOR_BILIBILI_FOLLOWER_INTERVAL_SECONDS: "600" }
    for (const [key, value] of Object.entries(expected)) environment[`APP_BILIBILI_FOLLOWERMONITOR_${key.toUpperCase()}`] = String(value)
    expect(await loadFollowerCollectionConfiguration(directory, environment)).toEqual(expected)
  })
  it.each(["", "no", "1", "null"])("keeps storage for non-false condition value %j", async value => {
    await setup('{}')
    expect(await loadFollowerCollectionConfiguration(directory, { SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED: value }))
      .toMatchObject({ storageEnabled: true })
  })
  it.each(["1e3", "1.5", "", "2147483648"])("rejects invalid environment integer %j", async value => {
    await setup('{}')
    await expect(loadFollowerCollectionConfiguration(directory, { APP_BILIBILI_FOLLOWERMONITOR_MAXATTEMPTS: value }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it.each(['{"extra":"synthetic-private-loader"}', '{bad json'])('does not mask an invalid file using environment overrides: %s', async contents => {
    const path = await setup(contents)
    const error = await loadFollowerCollectionConfiguration(directory, { APP_BILIBILI_FOLLOWERMONITOR_ENABLED: "false" })
      .then(() => undefined, (caught: unknown) => caught)
    expect(error).toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    expect(String(error)).not.toMatch(/synthetic-private|D:\\/u)
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it("rejects file I/O failures instead of treating them as missing configuration", async () => {
    const path = await setup()
    await mkdir(path, { recursive: true })
    await expect(loadFollowerCollectionConfiguration(directory, {})).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
})
