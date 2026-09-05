import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  assertOutsideSystemDrive,
  resolveDataDirectory,
  resolveBrowserWorkerEntry,
  resolvePlaywrightBrowsersPath,
  resolvePackagedPythonWorker,
  resolvePreloadEntry,
  resolveRealtimeWorkerEntry
} from "./runtime-paths"

describe("desktop runtime paths", () => {
  it("uses a repository-local D-drive data directory during development", () => {
    const appPath = resolve("D:/workspace/bili-monitor-desktop/apps/desktop")

    expect(resolveDataDirectory({ appPath, isPackaged: false, executablePath: "unused" })).toBe(
      resolve(appPath, "../../.local-data")
    )
  })

  it("keeps packaged mutable data outside the NSIS install directory on D", () => {
    expect(
      resolveDataDirectory({
        appPath: "unused",
        isPackaged: true,
        executablePath: "D:/Apps/BiliMonitor/BiliMonitor Desktop.exe"
      })
    ).toBe(resolve("D:/BiliMonitor Desktop Data"))
  })

  it("rejects an explicit C-drive data directory", () => {
    expect(() =>
      resolveDataDirectory({
        appPath: "unused",
        isPackaged: false,
        executablePath: "unused",
        overridePath: "C:/bmd-data"
      })
    ).toThrow(/D drive/i)
  })

  it("rejects C-drive export targets even when a save dialog selected them", () => {
    expect(() => assertOutsideSystemDrive("C:/Users/example/export.json")).toThrow(/D drive/i)
    expect(assertOutsideSystemDrive("D:/BiliMonitor/exports/export.json")).toBe(
      resolve("D:/BiliMonitor/exports/export.json")
    )
    expect(() => assertOutsideSystemDrive("E:/BiliMonitor/export.json")).toThrow(/D drive/i)
    expect(() => assertOutsideSystemDrive("\\\\server\\share\\export.json")).toThrow(/D drive/i)
  })

  it("uses the sandbox-compatible CommonJS preload output", () => {
    expect(resolvePreloadEntry("D:/app/out/main")).toBe(resolve("D:/app/out/preload/index.cjs"))
  })

  it("resolves the bundled independent realtime worker beside Local Core", () => {
    expect(resolveRealtimeWorkerEntry("D:/app/out/main")).toBe(
      resolve("D:/app/out/main/realtime-worker.js")
    )
  })

  it("resolves the bundled independent browser worker beside Local Core", () => {
    expect(resolveBrowserWorkerEntry("D:/app/out/main")).toBe(
      resolve("D:/app/out/main/browser-worker.js")
    )
  })

  it("keeps Playwright Chromium on D in both development and packaged applications", () => {
    expect(resolvePlaywrightBrowsersPath({
      appPath: "D:/workspace/bili-monitor-desktop/apps/desktop",
      isPackaged: false,
      resourcesPath: "unused"
    })).toBe(resolve("D:/workspace/bili-monitor-desktop/.tools/playwright-browsers"))
    expect(resolvePlaywrightBrowsersPath({
      appPath: "unused",
      isPackaged: true,
      resourcesPath: "D:/Apps/BiliMonitor/resources"
    })).toBe(resolve("D:/Apps/BiliMonitor/resources/playwright-browsers"))
  })

  it("resolves the standalone Python worker bundled outside the asar archive", () => {
    expect(resolvePackagedPythonWorker("D:/Apps/BiliMonitor/resources")).toEqual({
      executable: resolve("D:/Apps/BiliMonitor/resources/python-worker/bmd-python-worker.exe"),
      workerPath: resolve("D:/Apps/BiliMonitor/resources/python-worker")
    })
  })
})
