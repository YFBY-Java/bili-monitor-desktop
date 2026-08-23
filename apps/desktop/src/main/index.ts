import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { app, BrowserWindow, ipcMain } from "electron"

import { LocalCoreController } from "./core-client"
import { resolveCoreEntry, resolveDataDirectory, resolvePreloadEntry } from "./runtime-paths"
import { secureWebPreferences } from "./security"

const dataDirectory = resolveDataDirectory({
  appPath: app.getAppPath(),
  isPackaged: app.isPackaged,
  executablePath: app.getPath("exe"),
  overridePath: process.env.BMD_DATA_DIR
})
for (const path of [dataDirectory, join(dataDirectory, "electron"), join(dataDirectory, "chromium")]) {
  mkdirSync(path, { recursive: true })
}
app.setPath("userData", join(dataDirectory, "electron"))
app.setPath("sessionData", join(dataDirectory, "chromium"))
app.setPath("logs", join(dataDirectory, "logs"))

const ownsPrimaryInstance = app.requestSingleInstanceLock()
if (!ownsPrimaryInstance) app.quit()

let core: LocalCoreController | undefined
let coreStart: ReturnType<LocalCoreController["start"]> | undefined
let quitAfterCoreStops = false

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#FFF7FA",
    webPreferences: secureWebPreferences(resolvePreloadEntry(__dirname))
  })

  if (process.env.BMD_E2E_HEADLESS !== "1") window.once("ready-to-show", () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(join(__dirname, "../renderer/index.html"))
  return window
}

function initializeCore(): LocalCoreController {
  return new LocalCoreController({
    entryPath: resolveCoreEntry(__dirname),
    dataDirectory
  })
}

async function ensureCoreStarted() {
  if (!core) core = initializeCore()
  if (!coreStart || !core.isRunning()) {
    coreStart = core.start().catch((error: unknown) => {
      coreStart = undefined
      throw error
    })
  }
  return coreStart
}

async function getReadyCore(): Promise<LocalCoreController> {
  await ensureCoreStarted()
  if (!core) throw new Error("Local Core controller is unavailable.")
  return core
}

if (ownsPrimaryInstance) {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(() => {
    core = initializeCore()
    ipcMain.handle("core:bootstrap", () => ensureCoreStarted())
    ipcMain.handle("core:restart", async () => {
      await core?.stop()
      coreStart = undefined
      return ensureCoreStarted()
    })
    ipcMain.handle("platform-accounts:list", async (_event, input: unknown) =>
      (await getReadyCore()).listPlatformAccounts(input)
    )
    ipcMain.handle("platform-accounts:create", async (_event, input: unknown) =>
      (await getReadyCore()).createPlatformAccount(input)
    )
    ipcMain.handle("subjects:list", async (_event, input: unknown) =>
      (await getReadyCore()).listSubjects(input)
    )
    ipcMain.handle("subjects:create", async (_event, input: unknown) =>
      (await getReadyCore()).createSubject(input)
    )
    ipcMain.handle("subjects:bind-account", async (_event, input: unknown) =>
      (await getReadyCore()).bindSubjectAccount(input)
    )

    createWindow()
    void ensureCoreStarted()
      .then(() => {
        const exitAfterMs = Number(process.env.BMD_E2E_EXIT_AFTER_MS)
        if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) setTimeout(() => app.quit(), exitAfterMs)
      })
      .catch((error: unknown) => console.error("Local Core startup failed:", error))
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on("before-quit", (event) => {
  if (quitAfterCoreStops || !core) return
  event.preventDefault()
  quitAfterCoreStops = true
  void core.stop().finally(() => app.quit())
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
