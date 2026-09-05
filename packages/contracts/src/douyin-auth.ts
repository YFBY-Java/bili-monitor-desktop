import { z } from "zod"

export const DouyinAuthTypeSchema = z.enum(["DOUYIN_OAUTH2", "DOUYIN_WEB_SESSION"])
export const DouyinCredentialStatusSchema = z.enum(["ACTIVE", "INVALID", "REVOKED"])
export const DouyinAuthSessionStatusSchema = z.enum([
  "STARTING",
  "WAITING",
  "SCANNED",
  "VALIDATING",
  "SUCCESS",
  "EXPIRED",
  "USER_ACTION_REQUIRED",
  "FAILED"
])
export const DouyinCredentialPayloadSchema = z.record(z.string(), z.unknown())

export const DouyinOAuthSessionSummarySchema = z.object({
  loginId: z.uuid(),
  state: z.string().min(32),
  status: DouyinAuthSessionStatusSchema,
  expiresAt: z.iso.datetime(),
  errorMessage: z.string().min(1).optional()
}).strict()

export const DouyinCredentialSchema = z.object({
  credentialId: z.uuid(),
  authType: DouyinAuthTypeSchema,
  status: DouyinCredentialStatusSchema,
  expiresAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  payload: DouyinCredentialPayloadSchema
}).strict()

const DouyinCredentialSummaryBase = {
  credentialId: z.uuid(),
  status: DouyinCredentialStatusSchema,
  expiresAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
}

const DouyinSafeAccountSchema = z.object({
  nickname: z.string().optional(),
  name: z.string().optional(),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional()
}).strict()

export const DouyinCredentialSummarySchema = z.discriminatedUnion("authType", [
  z.object({
    ...DouyinCredentialSummaryBase,
    authType: z.literal("DOUYIN_WEB_SESSION"),
    payload: z.object({
      account: DouyinSafeAccountSchema,
      cookieCount: z.number().int().nonnegative(),
      lastValidatedAt: z.iso.datetime().optional()
    }).strict()
  }).strict(),
  z.object({
    ...DouyinCredentialSummaryBase,
    authType: z.literal("DOUYIN_OAUTH2"),
    payload: z.object({
      account: DouyinSafeAccountSchema,
      openId: z.string().optional(),
      scope: z.array(z.string())
    }).strict()
  }).strict()
])

export const DouyinAuthStatusSchema = z.object({
  enabled: z.boolean(),
  oauthMode: z.enum(["disabled", "live"]),
  workerAvailable: z.boolean(),
  workerStatus: z.string().min(1),
  pollIntervalMs: z.number().int().min(500).max(30_000),
  latestOAuthSession: DouyinOAuthSessionSummarySchema.optional(),
  oauthCredential: DouyinCredentialSummarySchema.optional(),
  webCredential: DouyinCredentialSummarySchema.optional()
}).strict()

export const DouyinQrLoginStartSchema = z.object({
  loginId: z.uuid(),
  status: DouyinAuthSessionStatusSchema,
  imageDataUrl: z.string().startsWith("data:image/png;base64,").optional(),
  expiresInSeconds: z.number().int().nonnegative(),
  pollIntervalMs: z.number().int().min(500).max(30_000),
  expiresAt: z.iso.datetime()
}).strict()

export const DouyinQrLoginIdInputSchema = z.object({ loginId: z.uuid() }).strict()

export const DouyinQrLoginStatusSchema = z.object({
  loginId: z.uuid(),
  status: DouyinAuthSessionStatusSchema,
  message: z.string(),
  expiresInSeconds: z.number().int().nonnegative(),
  imageDataUrl: z.string().startsWith("data:image/png;base64,").optional()
}).strict()

export const DouyinValidationResultSchema = z.object({
  valid: z.boolean(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({})
}).strict()

export const DouyinCredentialMutationResultSchema = z.object({
  credentialId: z.uuid(),
  authType: DouyinAuthTypeSchema,
  status: DouyinCredentialStatusSchema,
  expiresAt: z.iso.datetime().optional()
}).strict()

export const DouyinOAuthStartSchema = z.object({
  loginId: z.uuid(),
  mode: z.literal("live"),
  authorizationUrl: z.url(),
  state: z.string().min(32),
  expiresInSeconds: z.number().int().positive()
}).strict()

export const DouyinOAuthCallbackFailureSchema = z.object({
  state: z.string().min(32),
  message: z.string().min(1)
}).strict()

export const CompleteDouyinOAuthInputSchema = z.object({
  state: z.string().min(32),
  code: z.string().trim().min(1)
}).strict()

export const DouyinCredentialKindInputSchema = z.object({
  kind: z.enum(["oauth", "web"])
}).strict()

export const RevokeDouyinCredentialResultSchema = z.object({
  kind: z.enum(["oauth", "web"]),
  revoked: z.literal(true)
}).strict()

export const ExportDouyinCredentialInputSchema = DouyinCredentialKindInputSchema

export const ExportDouyinCredentialResultSchema = z.object({
  kind: z.enum(["oauth", "web"]),
  canceled: z.boolean(),
  savedPath: z.string().min(1).optional()
}).strict()

export type DouyinAuthType = z.infer<typeof DouyinAuthTypeSchema>
export type DouyinAuthSessionStatus = z.infer<typeof DouyinAuthSessionStatusSchema>
export type DouyinCredential = z.infer<typeof DouyinCredentialSchema>
export type DouyinCredentialSummary = z.infer<typeof DouyinCredentialSummarySchema>
export type DouyinAuthStatus = z.infer<typeof DouyinAuthStatusSchema>
export type DouyinOAuthSessionSummary = z.infer<typeof DouyinOAuthSessionSummarySchema>
export type DouyinQrLoginStart = z.infer<typeof DouyinQrLoginStartSchema>
export type DouyinQrLoginStatus = z.infer<typeof DouyinQrLoginStatusSchema>
export type DouyinValidationResult = z.infer<typeof DouyinValidationResultSchema>
export type DouyinCredentialMutationResult = z.infer<typeof DouyinCredentialMutationResultSchema>
export type DouyinOAuthStart = z.infer<typeof DouyinOAuthStartSchema>
export type DouyinOAuthCallbackFailure = z.infer<typeof DouyinOAuthCallbackFailureSchema>
export type CompleteDouyinOAuthInput = z.input<typeof CompleteDouyinOAuthInputSchema>
export type DouyinCredentialKind = z.infer<typeof DouyinCredentialKindInputSchema>["kind"]
export type ExportDouyinCredentialResult = z.infer<typeof ExportDouyinCredentialResultSchema>
