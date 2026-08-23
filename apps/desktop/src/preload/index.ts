import { contextBridge, ipcRenderer } from "electron"

import { createDesktopBridge } from "./bridge"

const bridge = createDesktopBridge((channel, input) => ipcRenderer.invoke(channel, input))

contextBridge.exposeInMainWorld("bmd", bridge)
