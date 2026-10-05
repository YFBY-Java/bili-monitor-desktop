import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { BILIBILI_FOLLOWER_CONFIG_ERROR_MESSAGE, BilibiliFollowerCollectionConfigurationInputSchema, BilibiliFollowerCollectionConfigurationSchema,
  type BilibiliFollowerCollectionConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"
import { resolveFollowerPlaceholders } from "./follower-configuration-placeholders"
import { createFollowerPropertyLookup, lookupFollowerCanonicalEnvironment } from "./follower-configuration-property-source"
import { bindFollowerBoolean, bindFollowerInteger, followerPropertyCondition, validateFollowerSchedulerDelay } from "./follower-configuration-values"

type ConfigurationKey = keyof BilibiliFollowerCollectionConfiguration

function propertyName(key: ConfigurationKey): string {
  return `app.bilibili.follower-monitor.${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`
}

const aliases: Partial<Record<keyof BilibiliFollowerCollectionConfiguration, string>> = {
  enabled: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_MONITOR_ENABLED",
  storageEnabled: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED",
  schedulerDelayMs: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_SCHEDULER_DELAY_MS",
  dueBatchSize: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_DUE_BATCH_SIZE",
  defaultIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_INTERVAL_SECONDS",
  minIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_MIN_INTERVAL_SECONDS",
  maxIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_MAX_INTERVAL_SECONDS",
  shortIntervalWarningSeconds: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_SHORT_INTERVAL_WARNING_SECONDS",
  failureBackoffSeconds: "SOCIAL_MONITOR_BILIBILI_FOLLOWER_FAILURE_BACKOFF_SECONDS",
  requestMinIntervalMs: "SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS"
}

/** Startup-only: no file writes, database access, or Worker environment expansion. */
export async function loadFollowerCollectionConfiguration(
  dataDirectory: string, environment: NodeJS.ProcessEnv
): Promise<BilibiliFollowerCollectionConfiguration> {
  try {
    let contents: string
    try { contents = await readFile(resolve(dataDirectory, "config/bilibili-follower-collection.json"), "utf8") }
    catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    const supplied: unknown = JSON.parse(contents.replace(/^\uFEFF/u, ""))
    const values = BilibiliFollowerCollectionConfigurationInputSchema.parse(supplied)
    const keys = Object.keys(values) as ConfigurationKey[]
    const properties = new Map<string, string>()
    for (const key of keys) {
      const alias = aliases[key]
      // Keep YAML aliases as property text, not pre-expanded primitive values.
      // Java field initializers are binding defaults, not referenceable sources.
      if (alias) properties.set(propertyName(key), `\${${alias}:${String(values[key])}}`)
      else if (typeof supplied === "object" && supplied !== null && Object.hasOwn(supplied, key)) {
        properties.set(propertyName(key), String(values[key]))
      }
    }
    const lookup = createFollowerPropertyLookup(environment, properties, keys.map(propertyName))
    const raw = new Map<ConfigurationKey, string>(keys.map(key => [key,
      lookupFollowerCanonicalEnvironment(environment, propertyName(key))
        ?? properties.get(propertyName(key)) ?? String(values[key])]))
    const expand = (key: ConfigurationKey, strict: boolean) =>
      resolveFollowerPlaceholders(raw.get(key)!, lookup, strict)
    const bound: Record<string, unknown> = {}
    for (const key of keys) {
      if (key === "storageEnabled") continue // No storage field in the original Properties bean.
      const value = expand(key, false)
      bound[key] = key === "enabled" ? bindFollowerBoolean(value)
        : key === "userAgent" || key === "referer" ? value : bindFollowerInteger(value)
    }
    // Conditions consume Environment text strictly and evaluate both properties.
    // Do not short-circuit storage expansion when enabled has resolved to false.
    const enabledCondition = followerPropertyCondition(expand("enabled", true))
    const storageCondition = followerPropertyCondition(expand("storageEnabled", true))
    bound.storageEnabled = storageCondition
    const configuration = BilibiliFollowerCollectionConfigurationSchema.parse(bound)
    // Annotation conditions use property text, not the converted enabled boolean.
    // Thus enabled=off still validates @Scheduled, although collectDueUsers exits early.
    if (enabledCondition && storageCondition) {
      validateFollowerSchedulerDelay(expand("schedulerDelayMs", true))
    }
    return configuration
  } catch {
    throw new CoreApplicationError("BILIBILI_FOLLOWER_CONFIG_INVALID", BILIBILI_FOLLOWER_CONFIG_ERROR_MESSAGE)
  }
}
