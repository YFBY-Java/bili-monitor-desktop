import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE, BilibiliLiveDanmakuConfigurationSchema,
  type BilibiliLiveDanmakuConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"
import { lookupFollowerEnvironment, resolveFollowerPlaceholders } from "./follower-configuration-placeholders"
import { createFollowerPropertyLookup, lookupFollowerCanonicalEnvironment } from "./follower-configuration-property-source"
import { bindFollowerBoolean, bindFollowerInteger, validateFollowerSchedulerDelay } from "./follower-configuration-values"

type Key = keyof BilibiliLiveDanmakuConfiguration
const aliases: Record<Key, string> = {
  enabled: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ENABLED",
  autoStartEnabled: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_AUTO_START_ENABLED",
  schedulerDelayMs: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_SCHEDULER_DELAY_MS",
  maxConnections: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS",
  protocolVersion: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROTOCOL_VERSION",
  recentMessageLimitPerRoom: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT",
  heartbeatSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_HEARTBEAT_SECONDS",
  connectTimeoutMs: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_CONNECT_TIMEOUT_MS",
  useLoginCredential: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_USE_LOGIN_CREDENTIAL",
  webLocation: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WEB_LOCATION",
  clientVersion: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_CLIENT_VERSION",
  wbiCacheSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WBI_CACHE_SECONDS",
  buvidCacheSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUVID_CACHE_SECONDS",
  bucketSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS",
  listenProbeSeconds: "SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROBE_SECONDS"
}
const propertyName = (key: Key) =>
  `app.bilibili.live-monitor.danmaku.${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`

/** Bind primitive properties at startup; only storage controls raw @Scheduled consumption. */
export async function loadLiveDanmakuConfiguration(
  dataDirectory: string, environment: NodeJS.ProcessEnv, storageEnabled: boolean
): Promise<BilibiliLiveDanmakuConfiguration> {
  try {
    let contents: string
    try { contents = await readFile(resolve(dataDirectory, "config/bilibili-live-danmaku.json"), "utf8") }
    catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    const values = BilibiliLiveDanmakuConfigurationSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const keys = Object.keys(values) as Key[]
    const properties = new Map(keys.map(key => [propertyName(key),
      key === "webLocation" || key === "clientVersion"
        ? lookupFollowerCanonicalEnvironment(environment, propertyName(key))
          ?? lookupFollowerEnvironment(environment, aliases[key]) ?? values[key]
        : `\${${aliases[key]}:${String(values[key])}}`]))
    const lookup = createFollowerPropertyLookup(environment, properties, keys.map(propertyName))
    const raw = new Map(keys.map(key => [key,
      lookupFollowerCanonicalEnvironment(environment, propertyName(key)) ?? properties.get(propertyName(key))!]))
    const expand = (key: Key, strict: boolean) => resolveFollowerPlaceholders(raw.get(key)!, lookup, strict)
    const configuration = BilibiliLiveDanmakuConfigurationSchema.parse(Object.fromEntries(keys.map(key => [key,
      key === "enabled" || key === "autoStartEnabled" || key === "useLoginCredential" ? bindFollowerBoolean(expand(key, false))
        : key === "webLocation" || key === "clientVersion" ? expand(key, false)
        : bindFollowerInteger(expand(key, false))])))
    if (storageEnabled) validateFollowerSchedulerDelay(expand("schedulerDelayMs", true))
    return configuration
  } catch {
    throw new CoreApplicationError("BILIBILI_DANMAKU_CONFIG_INVALID", BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE)
  }
}
