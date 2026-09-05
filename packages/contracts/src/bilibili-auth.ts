import { z } from "zod"

export const BilibiliQrLoginStateSchema = z.enum([
  "WAITING",
  "SCANNED",
  "EXPIRED",
  "SUCCESS",
  "FAILED"
])

export const BilibiliCredentialStatusSchema = z.enum([
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "INVALID",
  "NONE"
])

export const BilibiliAuthAccountSchema = z.object({
  mid: z.string().regex(/^[1-9]\d*$/),
  uname: z.string().min(1),
  face: z.url().optional(),
  level: z.number().int().nonnegative().optional(),
  vipStatus: z.number().int().nonnegative().optional()
}).strict()

export const BilibiliAuthCookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expiresAt: z.iso.datetime().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional()
}).strict()

export const BilibiliCredentialSchema = z.object({
  credentialId: z.uuid(),
  account: BilibiliAuthAccountSchema.optional(),
  cookieHeader: z.string(),
  cookies: z.array(BilibiliAuthCookieSchema),
  csrf: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.iso.datetime().optional(),
  rawPayload: z.record(z.string(), z.unknown())
}).strict()

export const BilibiliQrLoginStartSchema = z.object({
  loginId: z.uuid(),
  qrUrl: z.url(),
  expiresInSeconds: z.number().int().positive(),
  pollIntervalMillis: z.number().int().min(1_000).max(10_000)
}).strict()

export const BilibiliQrLoginIdInputSchema = z.object({
  loginId: z.uuid()
}).strict()

export const BilibiliQrLoginStatusSchema = z.object({
  status: BilibiliQrLoginStateSchema,
  message: z.string().min(1),
  expiresInSeconds: z.number().int().nonnegative().optional(),
  account: BilibiliAuthAccountSchema.optional(),
  credential: BilibiliCredentialSchema.optional()
}).strict()

export const BilibiliAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  credentialId: z.uuid().optional(),
  account: BilibiliAuthAccountSchema.optional(),
  lastValidatedAt: z.iso.datetime().optional(),
  lastRefreshCheckedAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  status: BilibiliCredentialStatusSchema,
  credential: BilibiliCredentialSchema.optional()
}).strict()

export const BilibiliAuthRefreshResultSchema = z.object({
  refreshed: z.boolean(),
  loggedIn: z.boolean(),
  message: z.string().min(1),
  account: BilibiliAuthAccountSchema.optional()
}).strict()

export const RevokeBilibiliAuthResultSchema = z.object({
  revoked: z.literal(true)
}).strict()

export const BilibiliAuthWorkerGenerateResultSchema = z.object({
  qrUrl: z.url(),
  qrcodeKey: z.string().min(1),
  cookies: z.array(BilibiliAuthCookieSchema)
}).strict()

export const BilibiliAuthWorkerPollInputSchema = z.object({
  qrcodeKey: z.string().min(1),
  cookies: z.array(BilibiliAuthCookieSchema)
}).strict()

export const BilibiliAuthWorkerPollResultSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  refreshToken: z.string().optional(),
  cookies: z.array(BilibiliAuthCookieSchema)
}).strict()

export const BilibiliAuthWorkerValidateInputSchema = z.object({
  cookies: z.array(BilibiliAuthCookieSchema)
}).strict()

export const BilibiliAuthWorkerNavResultSchema = z.object({
  account: BilibiliAuthAccountSchema,
  rawPayload: z.record(z.string(), z.unknown())
}).strict()

export type BilibiliQrLoginState = z.infer<typeof BilibiliQrLoginStateSchema>
export type BilibiliCredentialStatus = z.infer<typeof BilibiliCredentialStatusSchema>
export type BilibiliAuthAccount = z.infer<typeof BilibiliAuthAccountSchema>
export type BilibiliAuthCookie = z.infer<typeof BilibiliAuthCookieSchema>
export type BilibiliCredential = z.infer<typeof BilibiliCredentialSchema>
export type BilibiliQrLoginStart = z.infer<typeof BilibiliQrLoginStartSchema>
export type BilibiliQrLoginStatus = z.infer<typeof BilibiliQrLoginStatusSchema>
export type BilibiliAuthStatus = z.infer<typeof BilibiliAuthStatusSchema>
export type BilibiliAuthRefreshResult = z.infer<typeof BilibiliAuthRefreshResultSchema>
export type RevokeBilibiliAuthResult = z.infer<typeof RevokeBilibiliAuthResultSchema>
export type BilibiliAuthWorkerGenerateResult = z.infer<typeof BilibiliAuthWorkerGenerateResultSchema>
export type BilibiliAuthWorkerPollInput = z.infer<typeof BilibiliAuthWorkerPollInputSchema>
export type BilibiliAuthWorkerPollResult = z.infer<typeof BilibiliAuthWorkerPollResultSchema>
export type BilibiliAuthWorkerValidateInput = z.infer<typeof BilibiliAuthWorkerValidateInputSchema>
export type BilibiliAuthWorkerNavResult = z.infer<typeof BilibiliAuthWorkerNavResultSchema>
