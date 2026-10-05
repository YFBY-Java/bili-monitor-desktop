import { z } from "zod"
import { BilibiliLiveHttpConfigurationSchema } from "./bilibili-live-http"

export const BILIBILI_FOLLOWER_CONFIG_ERROR_MESSAGE =
  "粉丝采集配置无效。请检查 config/bilibili-follower-collection.json 和对应环境变量后重启。"
export const BILIBILI_FOLLOWER_STORAGE_DEPENDENCY_ERROR_MESSAGE =
  "用户工作台依赖粉丝存储。请启用粉丝 storageEnabled，或显式关闭 config/subject-monitor.json 的 enabled 后重启。"

export const BilibiliFollowerHttpConfigurationSchema = BilibiliLiveHttpConfigurationSchema.extend({
  userAgent: BilibiliLiveHttpConfigurationSchema.shape.userAgent.default("SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)"),
  referer: BilibiliLiveHttpConfigurationSchema.shape.referer.default("https://www.bilibili.com/")
})
export type BilibiliFollowerHttpConfiguration = z.infer<typeof BilibiliFollowerHttpConfigurationSchema>

const ConfigurationIntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
/** Typed file fields, before higher-priority environment and consumer conditions. */
export const BilibiliFollowerCollectionConfigurationInputSchema = z.object({
  ...BilibiliFollowerHttpConfigurationSchema.shape,
  enabled: z.boolean().default(true),
  storageEnabled: z.boolean().default(true),
  schedulerDelayMs: ConfigurationIntegerSchema.default(1000),
  dueBatchSize: ConfigurationIntegerSchema.default(10),
  defaultIntervalSeconds: ConfigurationIntegerSchema.default(3600),
  minIntervalSeconds: ConfigurationIntegerSchema.default(1),
  maxIntervalSeconds: ConfigurationIntegerSchema.default(2_592_000),
  shortIntervalWarningSeconds: ConfigurationIntegerSchema.default(60),
  failureBackoffSeconds: ConfigurationIntegerSchema.default(900),
  requestMinIntervalMs: ConfigurationIntegerSchema.default(1500),
  maxAttempts: ConfigurationIntegerSchema.default(3),
  retryBackoffMs: ConfigurationIntegerSchema.default(1500)
}).strict()
export const BilibiliFollowerCollectionConfigurationSchema = BilibiliFollowerCollectionConfigurationInputSchema.refine(
  value => !value.enabled || !value.storageEnabled || value.schedulerDelayMs > 0,
  { path: ["schedulerDelayMs"], message: "Active follower scheduler requires a positive delay" }
)
export type BilibiliFollowerCollectionConfiguration = z.infer<typeof BilibiliFollowerCollectionConfigurationSchema>
