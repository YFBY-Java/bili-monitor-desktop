import type { WebPreferences } from "electron"

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const bilibiliProfile = url.protocol === "https:"
      && url.hostname === "space.bilibili.com"
      && /^\/[1-9]\d*\/?$/.test(url.pathname)
      && url.search === ""
      && url.hash === ""
    const bilibiliLiveRoom = url.protocol === "https:"
      && url.hostname === "live.bilibili.com"
      && /^\/[1-9]\d*\/?$/.test(url.pathname)
      && url.search === ""
      && url.hash === ""
    return bilibiliProfile || bilibiliLiveRoom
  } catch {
    return false
  }
}

export function secureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true
  }
}
