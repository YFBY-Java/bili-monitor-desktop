import { z } from "zod"

const TimeoutMillisecondsSchema = z.number().int().min(0).max(2_147_483_647)
const HttpHeaderValueSchema = z.string().regex(/^[\t\x20-\x7e]*$/u)

export const BilibiliLiveHttpConfigurationSchema = z.object({
  connectTimeoutMs: TimeoutMillisecondsSchema.default(5000),
  readTimeoutMs: TimeoutMillisecondsSchema.default(10000),
  userAgent: HttpHeaderValueSchema.default("SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)"),
  referer: HttpHeaderValueSchema.default("https://live.bilibili.com/")
}).strict()

export type BilibiliLiveHttpConfiguration = z.infer<typeof BilibiliLiveHttpConfigurationSchema>
