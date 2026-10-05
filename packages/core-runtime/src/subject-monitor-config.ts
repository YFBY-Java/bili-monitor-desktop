import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { SUBJECT_MONITOR_CONFIG_ERROR_MESSAGE, SubjectMonitorConfigurationSchema, type SubjectMonitorConfiguration } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"

export async function loadSubjectMonitorConfiguration(
  dataDirectory: string,
  environment: NodeJS.ProcessEnv
): Promise<SubjectMonitorConfiguration> {
  try {
    let contents: string
    try {
      contents = await readFile(resolve(dataDirectory, "config", "subject-monitor.json"), "utf8")
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error
      contents = "{}"
    }
    const configuration = SubjectMonitorConfigurationSchema.parse(JSON.parse(contents.replace(/^\uFEFF/u, "")))
    const override = environment.APP_SUBJECTMONITOR_ENABLED
    if (override === undefined) return configuration
    const text = override.trim()
    if (!/^(true|false)$/iu.test(text)) throw new Error("Invalid boolean configuration")
    return { enabled: text.toLowerCase() === "true" }
  } catch {
    throw new CoreApplicationError("SUBJECT_MONITOR_CONFIG_INVALID", SUBJECT_MONITOR_CONFIG_ERROR_MESSAGE)
  }
}
