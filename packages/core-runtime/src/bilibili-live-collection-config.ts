import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { BILIBILI_LIVE_CONFIG_ERROR_MESSAGE, BilibiliLiveCollectionConfigurationInputSchema,
  BilibiliLiveCollectionConfigurationSchema, type BilibiliLiveCollectionConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"
import { resolveFollowerPlaceholders } from "./follower-configuration-placeholders"
import { createFollowerPropertyLookup, lookupFollowerCanonicalEnvironment } from "./follower-configuration-property-source"
import { bindFollowerBoolean, bindFollowerInteger, followerPropertyCondition, validateFollowerSchedulerDelay } from "./follower-configuration-values"

type ConfigurationKey = keyof BilibiliLiveCollectionConfiguration
const propertyName = (key: ConfigurationKey) =>
  `app.bilibili.live-monitor.${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`

const environmentKeys = {
  enabled: "SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED",
  storageEnabled: "SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED",
  schedulerDelayMs: "SOCIAL_MONITOR_BILIBILI_LIVE_SCHEDULER_DELAY_MS",
  dueBatchSize: "SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE",
  statusBatchSize: "SOCIAL_MONITOR_BILIBILI_LIVE_STATUS_BATCH_SIZE",
  defaultIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_INTERVAL_SECONDS",
  minIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_MIN_INTERVAL_SECONDS",
  maxIntervalSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_MAX_INTERVAL_SECONDS",
  shortIntervalWarningSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_SHORT_INTERVAL_WARNING_SECONDS",
  failureBackoffSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_FAILURE_BACKOFF_SECONDS",
  requestMinIntervalMs: "SOCIAL_MONITOR_BILIBILI_LIVE_REQUEST_MIN_INTERVAL_MS",
  maxAttempts: "SOCIAL_MONITOR_BILIBILI_LIVE_MAX_ATTEMPTS",
  retryBackoffMs: "SOCIAL_MONITOR_BILIBILI_LIVE_RETRY_BACKOFF_MS",
  connectTimeoutMs: "SOCIAL_MONITOR_BILIBILI_LIVE_CONNECT_TIMEOUT_MS",
  readTimeoutMs: "SOCIAL_MONITOR_BILIBILI_LIVE_READ_TIMEOUT_MS",
  userAgent: "SOCIAL_MONITOR_BILIBILI_LIVE_USER_AGENT",
  referer: "SOCIAL_MONITOR_BILIBILI_LIVE_REFERER"
} as const

/** Startup-only configuration: no writes, database access or Worker environment expansion. */
export async function loadLiveCollectionConfiguration(
  dataDirectory: string,
  environment: NodeJS.ProcessEnv
): Promise<BilibiliLiveCollectionConfiguration> {
  try {
    let contents: string
    try {
      contents = await readFile(resolve(dataDirectory, "config", "bilibili-live-collection.json"), "utf8")
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    // Validate the file independently; an override must not conceal a malformed configuration.
    const values = BilibiliLiveCollectionConfigurationInputSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const keys = Object.keys(values) as ConfigurationKey[]
    const properties = new Map(keys.map(key => [propertyName(key),
      `\${${environmentKeys[key]}:${String(values[key])}}`]))
    const lookup = createFollowerPropertyLookup(environment, properties, keys.map(propertyName))
    const raw = new Map(keys.map(key => [key,
      lookupFollowerCanonicalEnvironment(environment, propertyName(key)) ?? properties.get(propertyName(key))!]))
    const expand = (key: ConfigurationKey, strict: boolean) => resolveFollowerPlaceholders(raw.get(key)!, lookup, strict)
    const bound: Record<string, unknown> = {}
    for (const key of keys) {
      const value = expand(key, false)
      bound[key] = key === "enabled" || key === "storageEnabled" ? bindFollowerBoolean(value)
        : key === "userAgent" || key === "referer" ? value : bindFollowerInteger(value)
    }
    const enabledCondition = followerPropertyCondition(expand("enabled", true))
    const storageCondition = followerPropertyCondition(expand("storageEnabled", true))
    // Both primitive fields must bind, but repository/service availability follows
    // the raw @ConditionalOnProperty value, not the storageEnabled boolean field.
    bound.storageEnabled = storageCondition
    const configuration = BilibiliLiveCollectionConfigurationSchema.parse(bound)
    if (enabledCondition && storageCondition) validateFollowerSchedulerDelay(expand("schedulerDelayMs", true))
    return configuration
  } catch {
    // Neither parser errors nor platform paths may reveal configuration contents.
    throw new CoreApplicationError("BILIBILI_LIVE_CONFIG_INVALID", BILIBILI_LIVE_CONFIG_ERROR_MESSAGE)
  }
}
