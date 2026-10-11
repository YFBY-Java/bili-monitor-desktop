import { z } from "zod"

export const BILIBILI_DANMAKU_CONFIG_ERROR_MESSAGE =
  "弹幕启动配置无效。请检查 config/bilibili-live-danmaku.json 和对应环境变量后重启。"
const IntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
export const BilibiliLiveDanmakuConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  autoStartEnabled: z.boolean().default(true),
  schedulerDelayMs: IntegerSchema.default(5000),
  maxConnections: IntegerSchema.default(10),
  protocolVersion: IntegerSchema.default(3),
  recentMessageLimitPerRoom: IntegerSchema.default(200),
  heartbeatSeconds: IntegerSchema.default(30),
  connectTimeoutMs: IntegerSchema.default(8000),
  useLoginCredential: z.boolean().default(true),
  webLocation: z.string().default("444.8"),
  clientVersion: z.string().default("1.14.3"),
  wbiCacheSeconds: IntegerSchema.default(43200),
  buvidCacheSeconds: IntegerSchema.default(43200),
  bucketSeconds: IntegerSchema.default(60),
  listenProbeSeconds: IntegerSchema.default(20)
}).strict()
export type BilibiliLiveDanmakuConfiguration = z.infer<typeof BilibiliLiveDanmakuConfigurationSchema>
export const BilibiliLiveDanmakuConnectionConfigurationSchema = BilibiliLiveDanmakuConfigurationSchema.pick({
  heartbeatSeconds: true, connectTimeoutMs: true, useLoginCredential: true, webLocation: true, clientVersion: true
})
export type BilibiliLiveDanmakuConnectionConfiguration = z.infer<typeof BilibiliLiveDanmakuConnectionConfigurationSchema>
export const BilibiliLiveDanmakuCacheConfigurationSchema = BilibiliLiveDanmakuConfigurationSchema.pick({
  wbiCacheSeconds: true, buvidCacheSeconds: true
})
export type BilibiliLiveDanmakuCacheConfiguration = z.infer<typeof BilibiliLiveDanmakuCacheConfigurationSchema>
