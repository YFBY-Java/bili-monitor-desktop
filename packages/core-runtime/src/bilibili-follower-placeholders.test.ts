import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadFollowerCollectionConfiguration } from "./bilibili-follower-collection-config"

describe("original follower property-source placeholder expansion", () => {
  let directory: string | undefined
  const prefix = "APP_BILIBILI_FOLLOWERMONITOR_"
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined })
  async function load(environment: NodeJS.ProcessEnv, configuration: unknown = {}) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-placeholders-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config/bilibili-follower-collection.json")
    const text = JSON.stringify(configuration)
    await writeFile(path, text, "utf8")
    const result = await loadFollowerCollectionConfiguration(directory, environment)
    expect(await readFile(path, "utf8")).toBe(text)
    return result
  }
  it("expands defaults for every original configuration field before primitive binding", async () => {
    const expected = { enabled: false, storageEnabled: true, schedulerDelayMs: 0, dueBatchSize: 2,
      defaultIntervalSeconds: 420, minIntervalSeconds: 12, maxIntervalSeconds: 600,
      shortIntervalWarningSeconds: 15, failureBackoffSeconds: 500, requestMinIntervalMs: 0,
      maxAttempts: 1, retryBackoffMs: 200, connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture placeholder/2", referer: "https://www.bilibili.com/configured" }
    const environment: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(expected)) {
      environment[`${prefix}${key.toUpperCase()}`] = `\${SYNTHETIC_MISSING_${key}:${value}}`
    }
    expect(await load(environment)).toEqual(expected)
  })
  it("expands all ten original YAML aliases", async () => {
    expect(await load({
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MONITOR_ENABLED: "${SYNTHETIC_MISSING:false}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED: "${SYNTHETIC_MISSING:TRUE}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_SCHEDULER_DELAY_MS: "${SYNTHETIC_MISSING:-1}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "${SYNTHETIC_MISSING:2}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_INTERVAL_SECONDS: "${SYNTHETIC_MISSING:420}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MIN_INTERVAL_SECONDS: "${SYNTHETIC_MISSING:12}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_MAX_INTERVAL_SECONDS: "${SYNTHETIC_MISSING:600}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_SHORT_INTERVAL_WARNING_SECONDS: "${SYNTHETIC_MISSING:15}",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_FAILURE_BACKOFF_SECONDS: "${SYNTHETIC_MISSING:500}",
      SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS: "${SYNTHETIC_MISSING:0}"
    })).toMatchObject({ enabled: false, storageEnabled: true, schedulerDelayMs: -1, dueBatchSize: 2,
      defaultIntervalSeconds: 420, minIntervalSeconds: 12, maxIntervalSeconds: 600,
      shortIntervalWarningSeconds: 15, failureBackoffSeconds: 500, requestMinIntervalMs: 0 })
  })
  it.each([
    ["${SYNTHETIC_MISSING:default}", "default"], ["${SYNTHETIC_VALUE:default}", "actual"],
    ["${SYNTHETIC_EMPTY:default}", ""], ["${SYNTHETIC_MISSING:}", ""],
    ["${SYNTHETIC_MISSING}", "${SYNTHETIC_MISSING}"], ["${SYNTHETIC_MISSING", "${SYNTHETIC_MISSING"],
    ["${SYNTHETIC_MISSING ${SYNTHETIC_VALUE}", "${SYNTHETIC_MISSING ${SYNTHETIC_VALUE}"],
    ["${SYNTHETIC_URL:https://www.bilibili.com/a:b}", "https://www.bilibili.com/a:b"],
    ["${SYNTHETIC_MISSING:{a:{b}}}", "{a:{b}}"], ["$${SYNTHETIC_VALUE}", "$actual"],
    ["\\${SYNTHETIC_VALUE}", "\\actual"], ["${SYNTHETIC_VALUE}/${SYNTHETIC_VALUE}", "actual/actual"],
    ["${SYNTHETIC_MISSING}/${SYNTHETIC_VALUE}", "${SYNTHETIC_MISSING}/actual"],
    ["${SYNTHETIC_REF}", "actual"], ["${SYNTHETIC_${SYNTHETIC_KEY}}", "actual"],
    ["${SYNTHETIC_MISSING:${SYNTHETIC_VALUE}}", "actual"],
    ["${SYNTHETIC_VALUE:${SYNTHETIC_MISSING}}", "actual"],
    ["${SYNTHETIC_MISSING:${SYNTHETIC_MISSING:fallback}}", "fallback"],
    ["prefix${SYNTHETIC_VALUE}suffix", "prefixactualsuffix"],
    ["${SYNTHETIC_WITH:COLON}", "whole-key"], ["${:empty-key-default}", "empty-key-default"],
    ["#{2 + 3}", "#{2 + 3}"]
  ])("uses original Binder string handling %j", async (input, expected) => {
    expect(await load({ [`${prefix}USERAGENT`]: input, SYNTHETIC_VALUE: "actual", SYNTHETIC_EMPTY: "",
      SYNTHETIC_REF: "${SYNTHETIC_VALUE}", SYNTHETIC_KEY: "VALUE", "SYNTHETIC_WITH:COLON": "whole-key" }))
      .toMatchObject({ userAgent: expected })
  })
  it.each(["${SYNTHETIC_A}", "${SYNTHETIC_A:unused}", "${SYNTHETIC_A:${SYNTHETIC_B}}"])(
    "rejects cycles even in ignored/default values: %j", async input => {
      await expect(load({ [`${prefix}USERAGENT`]: input, SYNTHETIC_A: "${SYNTHETIC_B}", SYNTHETIC_B: "${SYNTHETIC_A}" }))
        .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    })
  it.each(["${SYNTHETIC_MISSING}", "${SYNTHETIC_PRESENT:${SYNTHETIC_MISSING}}"])(
    "strict storage condition rejects unresolved nested values without short-circuit: %j", async input => {
      await expect(load({ [`${prefix}ENABLED`]: "false", [`${prefix}STORAGEENABLED`]: input, SYNTHETIC_PRESENT: "false" }))
        .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    })
  it("strict enabled condition evaluates the default even if Binder can use the present key", async () => {
    await expect(load({ [`${prefix}ENABLED`]: "${SYNTHETIC_PRESENT:${SYNTHETIC_MISSING}}",
      [`${prefix}STORAGEENABLED`]: "false", SYNTHETIC_PRESENT: "false" }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it.each(["${SYNTHETIC_MISSING:off}", "${SYNTHETIC_MISSING:0}", "${SYNTHETIC_MISSING: false }"])(
    "resolved storage still uses its original untrimmed condition: %j", async input => {
      expect(await load({ [`${prefix}STORAGEENABLED`]: input })).toMatchObject({ storageEnabled: true })
    })
  it("strict scheduled resolution runs after Binder, only with the active raw condition", async () => {
    await expect(load({ [`${prefix}SCHEDULERDELAYMS`]: "${SYNTHETIC_PRESENT:${SYNTHETIC_MISSING}}", SYNTHETIC_PRESENT: "1000" }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it("inactive scheduler does not apply strict scheduled resolution to a valid bound delay", async () => {
    expect(await load({ [`${prefix}ENABLED`]: "${SYNTHETIC_MISSING:false}",
      [`${prefix}SCHEDULERDELAYMS`]: "${SYNTHETIC_PRESENT:${SYNTHETIC_MISSING}}", SYNTHETIC_PRESENT: "0x3" }))
      .toMatchObject({ enabled: false, schedulerDelayMs: 3 })
  })
  it.each(["${SYNTHETIC_MISSING: 1000 }", "${SYNTHETIC_MISSING:0x3}"])("validates resolved raw delay %j", async input => {
    await expect(load({ [`${prefix}SCHEDULERDELAYMS`]: input })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it("resolves canonical references using environment before alias and local file", async () => {
    expect(await load({ [`${prefix}MAXATTEMPTS`]: "${app.bilibili.follower-monitor.due-batch-size}",
      [`${prefix}DUEBATCHSIZE`]: "${SYNTHETIC_MISSING:2}", SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "4" },
    { dueBatchSize: 5 })).toMatchObject({ dueBatchSize: 2, maxAttempts: 2 })
  })
  it("exposes original YAML defaults, but not missing Java-only field initializers, as properties", async () => {
    expect(await load({ [`${prefix}USERAGENT`]: "${app.bilibili.follower-monitor.default-interval-seconds}/${app.bilibili.follower-monitor.max-attempts:2}" }))
      .toMatchObject({ userAgent: "3600/2", maxAttempts: 3 })
  })
  it("allows canonical references to explicitly configured local fields and file string expansion", async () => {
    expect(await load({ SYNTHETIC_AGENT: "Fixture local string" }, { maxAttempts: 4,
      userAgent: "${SYNTHETIC_AGENT}/${app.bilibili.follower-monitor.max-attempts}" }))
      .toMatchObject({ userAgent: "Fixture local string/4", maxAttempts: 4 })
  })
  it.each([
    "APP_BILIBILI_FOLLOWER_MONITOR_DUE_BATCH_SIZE", "app.bilibili.follower-monitor.due-batch-size",
    "app.bilibili.follower-monitor.dueBatchSize", "app.bilibili.follower_monitor.due_batch_size",
    "app.bilibili.followermonitor.duebatchsize", "app_bilibili_followermonitor_duebatchsize",
    "APP.BILIBILI.FOLLOWER-MONITOR.DUE-BATCH-SIZE"
  ])("binds the original known environment property form %s", async name => {
    expect(await load({ [name]: "${SYNTHETIC_MISSING:2}", SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "4" }))
      .toMatchObject({ dueBatchSize: 2 })
  })
  it.each(["APP_BILIBILI_FOLLOWERMONITOR_DUE_BATCH_SIZE", "APP_BILIBILI_FOLLOWER_MONITOR_DUEBATCHSIZE"])(
    "does not invent compound merging for %s", async name => {
      expect(await load({ [name]: "2", SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "4" }))
        .toMatchObject({ dueBatchSize: 4 })
    })
  it("keeps source/query precedence rather than flattening canonical properties", async () => {
    expect(await load({ APP_BILIBILI_FOLLOWER_MONITOR_DUE_BATCH_SIZE: "22",
      "app.bilibili.follower-monitor.due-batch-size": "23", SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "24",
      [`${prefix}USERAGENT`]: "${app.bilibili.follower-monitor.due-batch-size}/${app.bilibili.followermonitor.duebatchsize}" }))
      .toMatchObject({ dueBatchSize: 22, userAgent: "22/23" })
  })
  it("removed-dash references fall through legacy environment to YAML source", async () => {
    expect(await load({ APP_BILIBILI_FOLLOWER_MONITOR_DUE_BATCH_SIZE: "22",
      SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "24",
      [`${prefix}USERAGENT`]: "${app.bilibili.follower-monitor.due-batch-size}/${app.bilibili.followermonitor.duebatchsize}" }))
      .toMatchObject({ dueBatchSize: 22, userAgent: "22/24" })
  })
  it("does not relax camel/snake placeholder names into a YAML property", async () => {
    expect(await load({ [`${prefix}USERAGENT`]:
      "${app.bilibili.follower-monitor.dueBatchSize:camel}/${app.bilibili.follower_monitor.due_batch_size:snake}" }))
      .toMatchObject({ userAgent: "camel/snake" })
  })
  it.each([
    { name: "APP_BILIBILI_FOLLOWERMONITOR_[DUEBATCHSIZE]", expected: 23 },
    { name: "app.bilibili.follower-monitor.[due-batch-size]", expected: 24 },
    { name: "APP_BILIBILI_FOLLOWERMONITOR_DUE[BATCH]SIZE", expected: 24 }
  ])("keeps original scalar/indexed source boundaries for $name", async sample => {
    expect(await load({ [sample.name]: "${SYNTHETIC_MISSING:23}", SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE: "24" }))
      .toMatchObject({ dueBatchSize: sample.expected })
  })
  it.each([
    { "synthetic.env-name": "exact", synthetic_env_name: "underscores", "SYNTHETIC_ENV_NAME": "upper" },
    { "synthetic_env-name": "dots", "synthetic.env_name": "hyphens", synthetic_env_name: "both" },
    { "synthetic.env_name": "hyphens", synthetic_env_name: "both" },
    { synthetic_env_name: "both", SYNTHETIC_ENV_NAME: "upper" },
    { "SYNTHETIC.ENV-NAME": "upper-exact", "SYNTHETIC_ENV-NAME": "upper-dots", SYNTHETIC_ENV_NAME: "upper-both" },
    { "SYNTHETIC_ENV-NAME": "upper-dots", "SYNTHETIC.ENV_NAME": "upper-hyphens", SYNTHETIC_ENV_NAME: "upper-both" },
    { "SYNTHETIC.ENV_NAME": "upper-hyphens", SYNTHETIC_ENV_NAME: "upper-both" },
    { SYNTHETIC_ENV_NAME: "upper-both" }
  ])("resolves system environment variants in source order: %j", async environment => {
    const expected = Object.values(environment)[0]
    expect(await load({ ...environment, [`${prefix}USERAGENT`]: "${synthetic.env-name}" })).toMatchObject({ userAgent: expected })
  })
  it("keeps high-priority empty referenced values instead of falling back", async () => {
    await expect(load({ [`${prefix}MAXATTEMPTS`]: "${SYNTHETIC_EMPTY:3}", SYNTHETIC_EMPTY: "" }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it("does not leak private variable names or values from cyclic errors", async () => {
    const error = await load({ [`${prefix}USERAGENT`]: "${SYNTHETIC_PRIVATE}", SYNTHETIC_PRIVATE: "secret-fixture-${SYNTHETIC_PRIVATE}" })
      .then(() => undefined, (caught: unknown) => caught)
    expect(error).toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    expect(String(error)).not.toMatch(/SYNTHETIC_PRIVATE|secret-fixture|D:\\/u)
  })
})
