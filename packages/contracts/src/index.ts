export const CORE_API_VERSION = "1" as const

export * from "./account-subject"
export * from "./runtime-protocol"

import type {
  BindSubjectAccountInput,
  CreatePlatformAccountInput,
  CreateSubjectInput,
  ListPlatformAccountsInput,
  ListSubjectsInput,
  PlatformAccount,
  PlatformAccountList,
  SubjectList,
  SubjectSummary
} from "./account-subject"
import type { BootstrapResponse } from "./runtime-protocol"

export interface DesktopBridge {
  core: {
    bootstrap: () => Promise<BootstrapResponse>
    restart: () => Promise<BootstrapResponse>
  }
  platformAccounts: {
    list: (input?: ListPlatformAccountsInput) => Promise<PlatformAccountList>
    create: (input: CreatePlatformAccountInput) => Promise<PlatformAccount>
  }
  subjects: {
    list: (input?: ListSubjectsInput) => Promise<SubjectList>
    create: (input: CreateSubjectInput) => Promise<SubjectSummary>
    bindAccount: (input: BindSubjectAccountInput) => Promise<SubjectSummary>
  }
}
