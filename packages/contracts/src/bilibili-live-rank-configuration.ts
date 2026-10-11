import { z } from "zod"

export const BILIBILI_LIVE_RANK_CONFIG_ERROR_MESSAGE =
  "榜单采集配置无效。请检查 config/bilibili-live-rank.json 和对应环境变量后重启。"

const ConfigurationIntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
// Bind original signed int values first; page/interval limits belong to their consumers.
export const BilibiliLiveRankConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  pageSize: ConfigurationIntegerSchema.default(50),
  guardPageSize: ConfigurationIntegerSchema.default(30),
  maxPages: ConfigurationIntegerSchema.default(1),
  requestMinIntervalMs: ConfigurationIntegerSchema.default(1500),
  webLocation: z.string().default("444.8")
}).strict()

export type BilibiliLiveRankConfiguration = z.infer<typeof BilibiliLiveRankConfigurationSchema>
