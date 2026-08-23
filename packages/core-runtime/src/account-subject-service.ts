import {
  BindSubjectAccountInputSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  ListPlatformAccountsInputSchema,
  ListSubjectsInputSchema,
  PlatformAccountListSchema,
  PlatformAccountSchema,
  SubjectListSchema,
  SubjectSummarySchema,
  createRuntimeEnvelope,
  type CreatePlatformAccountInput,
  type CreateSubjectInput,
  type BindSubjectAccountInput,
  type ListPlatformAccountsInput,
  type ListSubjectsInput,
  type PlatformAccount,
  type PlatformAccountList,
  type SubjectList,
  type SubjectSummary
} from "@bmd/contracts"
import {
  ControlDatabase,
  type NewStoredOutboxMessage,
  type StoredPlatformAccount,
  type StoredSubjectAggregate
} from "@bmd/storage"

export class CoreApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(`${code}: ${message}`)
    this.name = "CoreApplicationError"
  }
}

export interface AccountSubjectServiceOptions {
  database: ControlDatabase
  now: () => Date
  idFactory: () => string
}

export class AccountSubjectService {
  constructor(private readonly options: AccountSubjectServiceOptions) {}

  createPlatformAccount(input: CreatePlatformAccountInput): PlatformAccount {
    const parsed = CreatePlatformAccountInputSchema.parse(input)
    const existing = this.options.database.findPlatformAccountByExternalId(
      parsed.platform,
      parsed.externalId
    )
    if (existing) {
      throw new CoreApplicationError(
        "PLATFORM_ACCOUNT_CONFLICT",
        `平台账号 ${parsed.platform}:${parsed.externalId} 已存在。`
      )
    }

    const timestamp = this.options.now().toISOString()
    const accountId = this.options.idFactory()
    const eventId = this.options.idFactory()
    const account: StoredPlatformAccount = {
      accountId,
      platform: parsed.platform,
      externalId: parsed.externalId,
      displayName: parsed.displayName,
      profileUrl: parsed.profileUrl ?? this.defaultProfileUrl(parsed.platform, parsed.externalId),
      avatarUrl: parsed.avatarUrl ?? null,
      authState: "not_connected",
      lastValidatedAt: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.options.database.createPlatformAccount(
      account,
      this.outbox(eventId, "platform-account.created", timestamp, {
        accountId,
        platform: parsed.platform,
        externalId: parsed.externalId
      })
    )
    return this.toPlatformAccount(account)
  }

  listPlatformAccounts(input?: ListPlatformAccountsInput): PlatformAccountList {
    const query = ListPlatformAccountsInputSchema.parse(input ?? {})
    const result = this.options.database.listPlatformAccounts(query)
    return PlatformAccountListSchema.parse({
      items: result.items.map((account) => this.toPlatformAccount(account)),
      total: result.total,
      snapshotAt: this.options.now().toISOString()
    })
  }

  createSubject(input: CreateSubjectInput): SubjectSummary {
    const parsed = CreateSubjectInputSchema.parse(input)
    const account = parsed.accountId
      ? this.options.database.findPlatformAccountById(parsed.accountId)
      : undefined
    if (parsed.accountId && !account) {
      throw new CoreApplicationError("PLATFORM_ACCOUNT_NOT_FOUND", "选择的平台账号不存在。")
    }

    const timestamp = this.options.now().toISOString()
    const subjectId = this.options.idFactory()
    const bindingId = account ? this.options.idFactory() : undefined
    const policyId = account ? this.options.idFactory() : undefined
    const eventId = this.options.idFactory()
    this.options.database.createSubject({
      subject: {
        subjectId,
        name: parsed.name,
        status: "active",
        tags: parsed.tags,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      ...(account && bindingId ? {
        binding: {
          bindingId,
          subjectId,
          accountId: account.accountId,
          validFrom: timestamp,
          createdAt: timestamp
        }
      } : {}),
      ...(account && policyId ? {
        policy: {
          policyId,
          bindingId: bindingId!,
          subjectId,
          accountId: account.accountId,
          capability: "follower.snapshot",
          state: "active",
          intervalSeconds: parsed.followerIntervalSeconds ?? 3600,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      } : {})
    }, this.outbox(eventId, "subject.created", timestamp, {
      subjectId,
      accountIds: account ? [account.accountId] : []
    }))

    return this.requireSubject(subjectId)
  }

  bindSubjectAccount(input: BindSubjectAccountInput): SubjectSummary {
    const parsed = BindSubjectAccountInputSchema.parse(input)
    const subject = this.options.database.findSubjectById(parsed.subjectId)
    if (!subject) throw new CoreApplicationError("SUBJECT_NOT_FOUND", "监控对象不存在。")
    const account = this.options.database.findPlatformAccountById(parsed.accountId)
    if (!account) {
      throw new CoreApplicationError("PLATFORM_ACCOUNT_NOT_FOUND", "选择的平台账号不存在。")
    }
    if (subject.accounts.some((item) => item.accountId === account.accountId)) {
      throw new CoreApplicationError("SUBJECT_ACCOUNT_CONFLICT", "该账号已经绑定到监控对象。")
    }

    const timestamp = this.options.now().toISOString()
    const bindingId = this.options.idFactory()
    const policyId = this.options.idFactory()
    const eventId = this.options.idFactory()
    this.options.database.bindSubjectAccount({
      bindingId,
      subjectId: subject.subjectId,
      accountId: account.accountId,
      validFrom: timestamp,
      createdAt: timestamp
    }, {
      policyId,
      bindingId,
      subjectId: subject.subjectId,
      accountId: account.accountId,
      capability: "follower.snapshot",
      state: "active",
      intervalSeconds: parsed.followerIntervalSeconds,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    }, this.outbox(eventId, "subject.account-bound", timestamp, {
      subjectId: subject.subjectId,
      accountId: account.accountId
    }))
    return this.requireSubject(subject.subjectId)
  }

  listSubjects(input?: ListSubjectsInput): SubjectList {
    const query = ListSubjectsInputSchema.parse(input ?? {})
    const result = this.options.database.listSubjects(query)
    return SubjectListSchema.parse({
      items: result.items.map((subject) => this.toSubjectSummary(subject)),
      total: result.total,
      snapshotAt: this.options.now().toISOString()
    })
  }

  private requireSubject(subjectId: string): SubjectSummary {
    const subject = this.options.database.findSubjectById(subjectId)
    if (!subject) throw new CoreApplicationError("SUBJECT_NOT_FOUND", "监控对象不存在。")
    return this.toSubjectSummary(subject)
  }

  private toPlatformAccount(account: StoredPlatformAccount): PlatformAccount {
    return PlatformAccountSchema.parse({
      id: account.accountId,
      platform: account.platform,
      externalId: account.externalId,
      displayName: account.displayName,
      ...(account.profileUrl ? { profileUrl: account.profileUrl } : {}),
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      authState: account.authState,
      ...(account.lastValidatedAt ? { lastValidatedAt: account.lastValidatedAt } : {}),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      version: account.version
    })
  }

  private toSubjectSummary(subject: StoredSubjectAggregate): SubjectSummary {
    return SubjectSummarySchema.parse({
      id: subject.subjectId,
      name: subject.name,
      status: subject.status,
      tags: subject.tags,
      accounts: subject.accounts.map((account) => this.toPlatformAccount(account)),
      monitorPolicies: subject.policies.map((policy) => ({
        accountId: policy.accountId,
        capability: policy.capability,
        state: policy.state,
        intervalSeconds: policy.intervalSeconds
      })),
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
      version: subject.version
    })
  }

  private defaultProfileUrl(platform: string, externalId: string): string | null {
    return platform === "bilibili" ? `https://space.bilibili.com/${externalId}` : null
  }

  private outbox(
    eventId: string,
    type: string,
    timestamp: string,
    payload: Record<string, unknown>
  ): NewStoredOutboxMessage {
    const envelope = createRuntimeEnvelope({
      id: eventId,
      type,
      timestamp,
      correlationId: eventId,
      traceId: eventId,
      payload
    })
    return {
      messageId: eventId,
      topic: type,
      envelopeJson: JSON.stringify(envelope),
      createdAt: timestamp
    }
  }
}
