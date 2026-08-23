import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { resolveDataDirectory, resolvePreloadEntry } from "./runtime-paths"

describe("desktop runtime paths", () => {
  it("uses a repository-local D-drive data directory during development", () => {
    const appPath = resolve("D:/workspace/bili-monitor-desktop/apps/desktop")

    expect(resolveDataDirectory({ appPath, isPackaged: false, executablePath: "unused" })).toBe(
      resolve(appPath, "../../.local-data")
    )
  })

  it("uses a data directory beside a D-drive packaged executable", () => {
    expect(
      resolveDataDirectory({
        appPath: "unused",
        isPackaged: true,
        executablePath: "D:/Apps/BiliMonitor/BiliMonitor Desktop.exe"
      })
    ).toBe(resolve("D:/Apps/BiliMonitor/data"))
  })

  it("rejects an explicit C-drive data directory", () => {
    expect(() =>
      resolveDataDirectory({
        appPath: "unused",
        isPackaged: false,
        executablePath: "unused",
        overridePath: "C:/bmd-data"
      })
    ).toThrow(/must not use the C drive/i)
  })

  it("uses the sandbox-compatible CommonJS preload output", () => {
    expect(resolvePreloadEntry("D:/app/out/main")).toBe(resolve("D:/app/out/preload/index.cjs"))
  })
})
