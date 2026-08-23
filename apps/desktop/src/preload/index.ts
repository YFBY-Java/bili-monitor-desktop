import { contextBridge, ipcRenderer } from "electron"
import type { DesktopBridge } from "@bmd/contracts"

const bridge: DesktopBridge = {
  core: {
    bootstrap: () => ipcRenderer.invoke("core:bootstrap"),
    restart: () => ipcRenderer.invoke("core:restart")
  }
}

contextBridge.exposeInMainWorld("bmd", bridge)
