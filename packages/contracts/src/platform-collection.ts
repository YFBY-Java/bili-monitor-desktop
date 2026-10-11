import { z } from "zod"

import { ObjectRefSchema } from "./bilibili-follower"
import { BilibiliFollowerFetchRequestV2Schema } from "./bilibili-follower-v2"
import { JavaLongStringSchema } from "./java-long"

// A new Worker request: the original generic adapter accepts a signed Long,
// unlike the published positive-only follower monitoring requests.
export const BilibiliPlatformAccountFetchRequestV1Schema = BilibiliFollowerFetchRequestV2Schema.extend({
  mid: JavaLongStringSchema
})
export type BilibiliPlatformAccountFetchRequestV1 = z.infer<typeof BilibiliPlatformAccountFetchRequestV1Schema>

export const PlatformCapabilitySchema = z.enum([
  "ACCOUNT_PROFILE", "CONTENT_LIST", "CONTENT_DETAIL", "COMMENT_LIST", "DANMAKU_LIST",
  "INTERACTION_METRIC", "FOLLOWER_SNAPSHOT", "TREND_TOPIC"
])
export const PlatformCollectionDataTypeSchema = z.enum([
  "account", "contents", "content-detail", "comments", "danmaku", "interactions", "followers", "trends"
])
export const PlatformAdapterViewSchema = z.object({
  platformCode: z.string().min(1),
  capabilities: z.array(PlatformCapabilitySchema),
  implementedDataTypes: z.array(PlatformCollectionDataTypeSchema)
}).strict()
export const PlatformAdapterListSchema = z.array(PlatformAdapterViewSchema)

// Match the original Java String.isBlank without changing the supplied identifiers.
const NonBlankPlatformTextSchema = z.string().regex(
  /[^\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/)
export const RunPlatformCollectionInputSchema = z.object({
  platformCode: NonBlankPlatformTextSchema,
  dataType: NonBlankPlatformTextSchema,
  externalId: z.string().optional(),
  cursor: z.string().optional()
}).strict().superRefine((input, context) => {
  if (input.dataType !== "trends" && !NonBlankPlatformTextSchema.safeParse(input.externalId).success) {
    context.addIssue({ code: "custom", path: ["externalId"],
      message: `externalId is required for data type: ${input.dataType}` })
  }
})

export const PlatformCollectionAccountDataSchema = z.object({
  platform: z.literal("bilibili"),
  externalAccountId: JavaLongStringSchema,
  displayName: NonBlankPlatformTextSchema,
  avatarUrl: z.string(),
  profileUrl: z.url(),
  followerCount: JavaLongStringSchema,
  followingCount: JavaLongStringSchema,
  fetchedAt: z.iso.datetime(),
  sourceEndpoint: z.literal("x/web-interface/card")
}).strict()
export const PlatformCollectionRateLimitInfoSchema = z.object({
  limited: z.boolean(),
  remaining: z.number().int().nullable(),
  resetAt: z.iso.datetime().nullable(),
  policyKey: z.string().min(1)
}).strict()
export const PlatformCollectionFetchErrorTypeSchema = z.enum([
  "NONE", "AUTH_EXPIRED", "RATE_LIMITED", "RISK_CONTROL", "NETWORK_ERROR", "SERVER_ERROR",
  "PARSE_ERROR", "UNSUPPORTED", "UNKNOWN"
])
export const PlatformCollectionRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"])
export const PlatformCollectionFetchResultSchema = z.object({
  success: z.boolean(),
  data: PlatformCollectionAccountDataSchema.nullable(),
  rawPayload: z.string().nullable(),
  rawPayloadObject: ObjectRefSchema.nullable(),
  nextCursor: z.string().nullable(),
  rateLimitInfo: PlatformCollectionRateLimitInfoSchema,
  errorType: PlatformCollectionFetchErrorTypeSchema,
  retryable: z.boolean(),
  riskLevel: PlatformCollectionRiskLevelSchema,
  message: z.string()
}).strict()
export const PlatformCollectionExecutionSchema = z.object({
  status: z.enum(["SUCCESS", "MANUAL_REVIEW"]),
  platformCode: z.string().min(1),
  dataType: z.string().min(1),
  fetchResult: PlatformCollectionFetchResultSchema
}).strict()

export type PlatformCapability = z.infer<typeof PlatformCapabilitySchema>
export type PlatformAdapterList = z.infer<typeof PlatformAdapterListSchema>
export type RunPlatformCollectionInput = z.input<typeof RunPlatformCollectionInputSchema>
export type PlatformCollectionExecution = z.infer<typeof PlatformCollectionExecutionSchema>
export type PlatformCollectionFetchResult = z.infer<typeof PlatformCollectionFetchResultSchema>
export type PlatformCollectionFetchErrorType = z.infer<typeof PlatformCollectionFetchErrorTypeSchema>
export type PlatformCollectionRiskLevel = z.infer<typeof PlatformCollectionRiskLevelSchema>
