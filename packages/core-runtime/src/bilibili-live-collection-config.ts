import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { BILIBILI_LIVE_CONFIG_ERROR_MESSAGE, BilibiliLiveCollectionConfigurationSchema, type BilibiliLiveCollectionConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"

const environmentKeys = {
  enabled: "SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED",
  schedulerDelayMs: "SOCIAL_MONITOR_BILIBILI_LIVE_SCHEDULER_DELAY_MS",
  dueBatchSize: "SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE",
  statusBatchSize: "SOCIAL_MONITOR_BILIBILI_LIVE_STATUS_BATCH_SIZE"
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
    const values = BilibiliLiveCollectionConfigurationSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const overrides: Record<string, unknown> = {}
    for (const [key, name] of Object.entries(environmentKeys)) {
      const value = environment[name]
      if (value === undefined) continue
      const text = value.trim()
      if (key === "enabled") {
        if (!/^(true|false)$/iu.test(text)) throw new Error("Invalid boolean configuration")
        overrides[key] = text.toLowerCase() === "true"
      } else {
        if (!/^[+-]?[0-9]+$/u.test(text)) throw new Error("Invalid integer configuration")
        overrides[key] = Number(text)
      }
    }
    return BilibiliLiveCollectionConfigurationSchema.parse({ ...values, ...overrides })
  } catch {
    // Neither parser errors nor platform paths may reveal configuration contents.
    throw new CoreApplicationError("BILIBILI_LIVE_CONFIG_INVALID", BILIBILI_LIVE_CONFIG_ERROR_MESSAGE)
  }
}
