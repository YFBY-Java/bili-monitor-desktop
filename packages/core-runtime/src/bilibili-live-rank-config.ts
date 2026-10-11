import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { BILIBILI_LIVE_RANK_CONFIG_ERROR_MESSAGE, BilibiliLiveRankConfigurationSchema,
  type BilibiliLiveRankConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"
import { lookupFollowerEnvironment, resolveFollowerPlaceholders } from "./follower-configuration-placeholders"
import { createFollowerPropertyLookup, lookupFollowerCanonicalEnvironment } from "./follower-configuration-property-source"
import { bindFollowerBoolean, bindFollowerInteger, followerPropertyCondition } from "./follower-configuration-values"

type ConfigurationKey = keyof BilibiliLiveRankConfiguration
const propertyName = (key: ConfigurationKey) =>
  `app.bilibili.live-monitor.rank.${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`
const environmentKeys = {
  enabled: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_ENABLED",
  pageSize: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_PAGE_SIZE",
  guardPageSize: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_GUARD_PAGE_SIZE",
  maxPages: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_MAX_PAGES",
  requestMinIntervalMs: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_REQUEST_MIN_INTERVAL_MS",
  webLocation: "SOCIAL_MONITOR_BILIBILI_LIVE_RANK_WEB_LOCATION"
} as const

/** Startup-only, read-only configuration; shares the original property binding rules. */
export async function loadLiveRankConfiguration(
  dataDirectory: string,
  environment: NodeJS.ProcessEnv
): Promise<BilibiliLiveRankConfiguration> {
  try {
    let contents: string
    try {
      contents = await readFile(resolve(dataDirectory, "config", "bilibili-live-rank.json"), "utf8")
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    const values = BilibiliLiveRankConfigurationSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const keys = Object.keys(values) as ConfigurationKey[]
    // Select the source before expanding. Do not splice file strings into a
    // ${alias:fallback}: braces in a literal fallback would change its contents.
    const properties = new Map(keys.map(key => [propertyName(key),
      lookupFollowerCanonicalEnvironment(environment, propertyName(key))
        ?? lookupFollowerEnvironment(environment, environmentKeys[key]) ?? String(values[key])]))
    const lookup = createFollowerPropertyLookup(environment, properties, keys.map(propertyName))
    const expand = (key: ConfigurationKey, strict: boolean) => resolveFollowerPlaceholders(
      properties.get(propertyName(key))!, lookup, strict)
    const bound: Record<string, unknown> = {}
    for (const key of keys) {
      const value = expand(key, false)
      bound[key] = key === "enabled" ? bindFollowerBoolean(value) : key === "webLocation" ? value : bindFollowerInteger(value)
    }
    // The primitive still binds, but @ConditionalOnProperty controls service availability.
    bound.enabled = followerPropertyCondition(expand("enabled", true))
    return BilibiliLiveRankConfigurationSchema.parse(bound)
  } catch {
    throw new CoreApplicationError("BILIBILI_LIVE_RANK_CONFIG_INVALID", BILIBILI_LIVE_RANK_CONFIG_ERROR_MESSAGE)
  }
}
