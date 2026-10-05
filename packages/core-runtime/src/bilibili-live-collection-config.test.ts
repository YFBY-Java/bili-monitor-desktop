import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadLiveCollectionConfiguration } from "./bilibili-live-collection-config"

describe("read-only live collection configuration loader", () => {
  let directory: string
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
  async function setup() {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-live-config-loader-"))
    return resolve(directory, "config", "bilibili-live-collection.json")
  }
  it("defaults without creating a configuration directory", async () => {
    await setup()
    expect(await loadLiveCollectionConfiguration(directory, {})).toEqual({
      enabled: true, storageEnabled: true, schedulerDelayMs: 1000, dueBatchSize: 20, statusBatchSize: 30,
      defaultIntervalSeconds: 300, minIntervalSeconds: 1, maxIntervalSeconds: 2592000,
      shortIntervalWarningSeconds: 120, failureBackoffSeconds: 900, requestMinIntervalMs: 1500,
      maxAttempts: 3, retryBackoffMs: 1500,
      connectTimeoutMs: 5000, readTimeoutMs: 10000,
      userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)",
      referer: "https://live.bilibili.com/"
    })
    await expect(access(resolve(directory, "config"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("reads BOM JSON and preserves bytes when environment overrides are applied", async () => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    const contents = '\uFEFF{ "enabled": true, "schedulerDelayMs": 250, "dueBatchSize": 99, "statusBatchSize": 50 }\r\n'
    await writeFile(path, contents, "utf8")
    expect(await loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED: " FALSE ",
      SOCIAL_MONITOR_BILIBILI_LIVE_STATUS_BATCH_SIZE: " +64 "
    })).toMatchObject({ enabled: false, schedulerDelayMs: 250, dueBatchSize: 99, statusBatchSize: 64 })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it("reads the original storage switch alias independently of automatic collection", async () => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    const contents = '{"enabled":false,"storageEnabled":true}'
    await writeFile(path, contents, "utf8")
    expect(await loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED: " FALSE "
    })).toMatchObject({ enabled: false, storageEnabled: false })
    expect(await readFile(path, "utf8")).toBe(contents)
    await expect(loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED: "0"
    })).rejects.toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
  })
  it.each(["", "12.5", "1e3", "NaN", "Infinity", "2147483648"])("rejects invalid integer environment value %j", async value => {
    await setup()
    await expect(loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE: value
    })).rejects.toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
  })
  it("does not mistake an unreadable config path for a missing file", async () => {
    const path = await setup()
    await mkdir(path, { recursive: true })
    await expect(loadLiveCollectionConfiguration(directory, {})).rejects.toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
  })
  it("does not let environment overrides hide malformed file values", async () => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    await writeFile(path, '{"enabled":"false"}', "utf8")
    await expect(loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED: "true"
    })).rejects.toMatchObject({ code: "BILIBILI_LIVE_CONFIG_INVALID" })
  })
  it("maps all original policy environment aliases over file values without changing bytes", async () => {
    const path = await setup()
    await mkdir(resolve(directory, "config"))
    const contents = JSON.stringify({ defaultIntervalSeconds: 300, minIntervalSeconds: 1,
      maxIntervalSeconds: 2592000, shortIntervalWarningSeconds: 120, failureBackoffSeconds: 900,
      requestMinIntervalMs: 1500, maxAttempts: 3, retryBackoffMs: 1500 })
    await writeFile(path, contents, "utf8")
    expect(await loadLiveCollectionConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_INTERVAL_SECONDS: " +420 ",
      SOCIAL_MONITOR_BILIBILI_LIVE_MIN_INTERVAL_SECONDS: "120",
      SOCIAL_MONITOR_BILIBILI_LIVE_MAX_INTERVAL_SECONDS: "600",
      SOCIAL_MONITOR_BILIBILI_LIVE_SHORT_INTERVAL_WARNING_SECONDS: "450",
      SOCIAL_MONITOR_BILIBILI_LIVE_FAILURE_BACKOFF_SECONDS: "75",
      SOCIAL_MONITOR_BILIBILI_LIVE_REQUEST_MIN_INTERVAL_MS: "-1",
      SOCIAL_MONITOR_BILIBILI_LIVE_MAX_ATTEMPTS: "10",
      SOCIAL_MONITOR_BILIBILI_LIVE_RETRY_BACKOFF_MS: "250"
    })).toMatchObject({ defaultIntervalSeconds: 420, minIntervalSeconds: 120, maxIntervalSeconds: 600,
      shortIntervalWarningSeconds: 450, failureBackoffSeconds: 75, requestMinIntervalMs: -1,
      maxAttempts: 10, retryBackoffMs: 250 })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
})
