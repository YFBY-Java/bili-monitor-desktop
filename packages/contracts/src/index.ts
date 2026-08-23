export const CORE_API_VERSION = "1" as const

export * from "./runtime-protocol"

import type { BootstrapResponse } from "./runtime-protocol"

export interface DesktopBridge {
  core: {
    bootstrap: () => Promise<BootstrapResponse>
    restart: () => Promise<BootstrapResponse>
  }
}
