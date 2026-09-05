import { contextBridge, ipcRenderer } from "electron"

import { createDesktopBridge } from "./bridge"

const bridge = createDesktopBridge(
  (channel, input) => ipcRenderer.invoke(channel, input),
  (channel, listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => listener(value)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
)

contextBridge.exposeInMainWorld("bmd", bridge)
