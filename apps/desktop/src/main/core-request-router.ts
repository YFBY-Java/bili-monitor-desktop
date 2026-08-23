import {
  BindSubjectAccountInputSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  ListPlatformAccountsInputSchema,
  ListSubjectsInputSchema,
  type RuntimeEnvelope
} from "@bmd/contracts"
import { CoreApplicationError, type LocalCoreRuntime } from "@bmd/core-runtime"

export interface BusinessDispatchResult {
  responseType: string
  payload: unknown
}

export function dispatchBusinessRequest(
  runtime: LocalCoreRuntime,
  request: RuntimeEnvelope
): BusinessDispatchResult {
  switch (request.type) {
    case "platform-accounts.list":
      return {
        responseType: "platform-accounts.list.result",
        payload: runtime.listPlatformAccounts(ListPlatformAccountsInputSchema.parse(request.payload))
      }
    case "platform-accounts.create":
      return {
        responseType: "platform-accounts.create.result",
        payload: runtime.createPlatformAccount(CreatePlatformAccountInputSchema.parse(request.payload))
      }
    case "subjects.list":
      return {
        responseType: "subjects.list.result",
        payload: runtime.listSubjects(ListSubjectsInputSchema.parse(request.payload))
      }
    case "subjects.create":
      return {
        responseType: "subjects.create.result",
        payload: runtime.createSubject(CreateSubjectInputSchema.parse(request.payload))
      }
    case "subjects.bind-account":
      return {
        responseType: "subjects.bind-account.result",
        payload: runtime.bindSubjectAccount(BindSubjectAccountInputSchema.parse(request.payload))
      }
    default:
      throw new CoreApplicationError(
        "CORE_METHOD_NOT_FOUND",
        `不支持的 Local Core 消息类型：${request.type}`
      )
  }
}
