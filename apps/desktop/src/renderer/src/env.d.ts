/// <reference types="vite/client" />

import type { DesktopBridge } from "@bmd/contracts"

declare global {
  interface Window {
    bmd: DesktopBridge
  }
}

export {}
