import { z } from "zod"

export const PlatformCodeSchema = z.enum(["bilibili", "douyin"])
export const PlatformAccountAuthStateSchema = z.enum([
  "not_connected",
  "active",
  "expired",
  "revoked"
])

const ExternalIdSchema = z.string().trim().min(1).max(128)

function requirePlatformExternalId(
  value: { platform: z.infer<typeof PlatformCodeSchema>; externalId: string },
  context: z.RefinementCtx
): void {
  if (value.platform === "bilibili" && !/^[1-9]\d*$/.test(value.externalId)) {
    context.addIssue({
      code: "custom",
      path: ["externalId"],
      message: "Bilibili UID 必须是大于 0 的数字。"
    })
  }
}

export const PlatformAccountSchema = z.object({
  id: z.uuid(),
  platform: PlatformCodeSchema,
  externalId: ExternalIdSchema,
  displayName: z.string().trim().min(1).max(160),
  profileUrl: z.url().optional(),
  avatarUrl: z.url().optional(),
  authState: PlatformAccountAuthStateSchema,
  lastValidatedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive()
}).strict().superRefine(requirePlatformExternalId)

export const CreatePlatformAccountInputSchema = z.object({
  platform: PlatformCodeSchema,
  externalId: ExternalIdSchema,
  displayName: z.string().trim().min(1).max(160),
  profileUrl: z.url().optional(),
  avatarUrl: z.url().optional()
}).strict().superRefine(requirePlatformExternalId)

export const ListPlatformAccountsInputSchema = z.object({
  platform: PlatformCodeSchema.optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50)
}).strict()

export const PlatformAccountListSchema = z.object({
  items: z.array(PlatformAccountSchema),
  total: z.number().int().nonnegative(),
  snapshotAt: z.iso.datetime()
}).strict()

export const SubjectStatusSchema = z.enum(["active", "paused"])
export const SubjectMonitorPolicySchema = z.object({
  accountId: z.uuid(),
  capability: z.literal("follower.snapshot"),
  state: z.enum(["active", "paused"]),
  intervalSeconds: z.number().int().min(300).max(604_800)
}).strict()

export const SubjectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  status: SubjectStatusSchema,
  tags: z.array(z.string().trim().min(1).max(48)).max(32),
  accounts: z.array(PlatformAccountSchema),
  monitorPolicies: z.array(SubjectMonitorPolicySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive()
}).strict()

export const CreateSubjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  tags: z.array(z.string().trim().min(1).max(48)).max(32).default([]),
  accountId: z.uuid().optional(),
  followerIntervalSeconds: z.number().int().min(300).max(604_800).optional()
}).strict().superRefine((value, context) => {
  if (value.followerIntervalSeconds !== undefined && value.accountId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["accountId"],
      message: "创建粉丝监控策略前必须选择平台账号。"
    })
  }
})

export const BindSubjectAccountInputSchema = z.object({
  subjectId: z.uuid(),
  accountId: z.uuid(),
  followerIntervalSeconds: z.number().int().min(300).max(604_800).default(3600)
}).strict()

export const ListSubjectsInputSchema = z.object({
  platform: PlatformCodeSchema.optional(),
  status: SubjectStatusSchema.optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50)
}).strict()

export const SubjectListSchema = z.object({
  items: z.array(SubjectSummarySchema),
  total: z.number().int().nonnegative(),
  snapshotAt: z.iso.datetime()
}).strict()

export type PlatformCode = z.infer<typeof PlatformCodeSchema>
export type PlatformAccount = z.infer<typeof PlatformAccountSchema>
export type CreatePlatformAccountInput = z.input<typeof CreatePlatformAccountInputSchema>
export type ListPlatformAccountsInput = z.input<typeof ListPlatformAccountsInputSchema>
export type PlatformAccountList = z.infer<typeof PlatformAccountListSchema>
export type SubjectMonitorPolicy = z.infer<typeof SubjectMonitorPolicySchema>
export type SubjectSummary = z.infer<typeof SubjectSummarySchema>
export type CreateSubjectInput = z.input<typeof CreateSubjectInputSchema>
export type BindSubjectAccountInput = z.input<typeof BindSubjectAccountInputSchema>
export type ListSubjectsInput = z.input<typeof ListSubjectsInputSchema>
export type SubjectList = z.infer<typeof SubjectListSchema>
