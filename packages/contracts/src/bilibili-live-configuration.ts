import { z } from "zod"

export const BILIBILI_LIVE_CONFIG_ERROR_MESSAGE =
  "直播采集配置无效。请检查 config/bilibili-live-collection.json 和对应环境变量后重启。"

// Original property types are signed Java int. Batch normalization belongs to the consumer.
const ConfigurationIntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
export const BilibiliLiveCollectionConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  schedulerDelayMs: ConfigurationIntegerSchema.min(1).default(1000),
  dueBatchSize: ConfigurationIntegerSchema.default(20),
  statusBatchSize: ConfigurationIntegerSchema.default(30)
}).strict()

export type BilibiliLiveCollectionConfiguration = z.infer<typeof BilibiliLiveCollectionConfigurationSchema>
