import {
  BootstrapResponseSchema,
  PlatformAccountListSchema,
  PlatformAccountSchema,
  SubjectListSchema,
  SubjectSummarySchema,
  type DesktopBridge
} from "@bmd/contracts"

export type DesktopInvoke = (channel: string, input?: unknown) => Promise<unknown>

export function createDesktopBridge(invoke: DesktopInvoke): DesktopBridge {
  return {
    core: {
      bootstrap: async () => BootstrapResponseSchema.parse(await invoke("core:bootstrap")),
      restart: async () => BootstrapResponseSchema.parse(await invoke("core:restart"))
    },
    platformAccounts: {
      list: async (input) => PlatformAccountListSchema.parse(
        await invoke("platform-accounts:list", input ?? {})
      ),
      create: async (input) => PlatformAccountSchema.parse(
        await invoke("platform-accounts:create", input)
      )
    },
    subjects: {
      list: async (input) => SubjectListSchema.parse(await invoke("subjects:list", input ?? {})),
      create: async (input) => SubjectSummarySchema.parse(await invoke("subjects:create", input)),
      bindAccount: async (input) => SubjectSummarySchema.parse(
        await invoke("subjects:bind-account", input)
      )
    }
  }
}
