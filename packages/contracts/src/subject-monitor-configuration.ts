import { z } from "zod"
import { BILIBILI_LIVE_CONFIG_ERROR_MESSAGE } from "./bilibili-live-configuration"
import { BILIBILI_FOLLOWER_CONFIG_ERROR_MESSAGE, BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_ERROR_MESSAGE } from "./bilibili-follower-configuration"

export const SubjectMonitorConfigurationSchema = z.object({
  enabled: z.boolean().default(true)
}).strict()
export type SubjectMonitorConfiguration = z.infer<typeof SubjectMonitorConfigurationSchema>

export const SUBJECT_MONITOR_CONFIG_ERROR_MESSAGE =
  "用户工作台配置无效。请检查 config/subject-monitor.json 和 APP_SUBJECTMONITOR_ENABLED 后重启。"
export const BILIBILI_LIVE_STORAGE_DEPENDENCY_ERROR_MESSAGE =
  "用户工作台依赖直播存储。请启用直播 storageEnabled，或显式关闭 config/subject-monitor.json 的 enabled 后重启。"

/** Only these startup errors may cross the host boundary without raw process diagnostics. */
export function startupConfigurationErrorMessage(code: string | undefined): string | undefined {
  switch (code) {
    case "BILIBILI_LIVE_CONFIG_INVALID": return BILIBILI_LIVE_CONFIG_ERROR_MESSAGE
    case "SUBJECT_MONITOR_CONFIG_INVALID": return SUBJECT_MONITOR_CONFIG_ERROR_MESSAGE
    case "BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID": return BILIBILI_LIVE_STORAGE_DEPENDENCY_ERROR_MESSAGE
    case "BILIBILI_FOLLOWER_CONFIG_INVALID": return BILIBILI_FOLLOWER_CONFIG_ERROR_MESSAGE
    case "BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_INVALID": return BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_ERROR_MESSAGE
    default: return undefined
  }
}
