import { mkdirSync } from "node:fs"
import { copyFile, unlink, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"

import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron"

import { LocalCoreController } from "./core-client"
import { ensureCredentialKey } from "./credential-key"
import {
  loadDouyinOAuthConfiguration,
  type DouyinOAuthRuntimeConfiguration
} from "./oauth-config"
import { findDouyinOAuthCallback, parseDouyinOAuthCallback, type DouyinOAuthCallback } from "./oauth-callback"
import {
  assertOutsideSystemDrive,
  resolveCoreEntry,
  resolveBrowserWorkerEntry,
  resolveDataDirectory,
  resolvePlaywrightBrowsersPath,
  resolvePackagedPythonWorker,
  resolvePreloadEntry,
  resolveRealtimeWorkerEntry
} from "./runtime-paths"
import { isAllowedExternalUrl, secureWebPreferences } from "./security"

const dataDirectory = resolveDataDirectory({
  appPath: app.getAppPath(),
  isPackaged: app.isPackaged,
  executablePath: app.getPath("exe"),
  overridePath: process.env.BMD_DATA_DIR
})
const tempDirectory = join(dataDirectory, "temp")
process.env.PLAYWRIGHT_BROWSERS_PATH = resolvePlaywrightBrowsersPath({
  appPath: app.getAppPath(),
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath
})
process.env.TEMP = tempDirectory
process.env.TMP = tempDirectory
process.env.TMPDIR = tempDirectory
if (app.isPackaged) {
  process.env.BMD_NODE_EXE = process.execPath
  process.env.BMD_NODE_RUN_AS_ELECTRON = "1"
  const pythonWorker = resolvePackagedPythonWorker(process.resourcesPath)
  process.env.BMD_PYTHON_EXE = pythonWorker.executable
  process.env.BMD_PYTHON_WORKER_PATH = pythonWorker.workerPath
  process.env.BMD_PYTHON_STANDALONE = "1"
}
for (const path of [
  dataDirectory,
  join(dataDirectory, "electron"),
  join(dataDirectory, "chromium"),
  join(dataDirectory, "exports"),
  tempDirectory
]) {
  mkdirSync(path, { recursive: true })
}
app.setPath("userData", join(dataDirectory, "electron"))
app.setPath("sessionData", join(dataDirectory, "chromium"))
app.setPath("logs", join(dataDirectory, "logs"))
app.setPath("temp", tempDirectory)

const ownsPrimaryInstance = app.requestSingleInstanceLock()
if (!ownsPrimaryInstance) app.quit()
const initialOAuthCallback = findDouyinOAuthCallback(process.argv)

let core: LocalCoreController | undefined
let coreStart: ReturnType<LocalCoreController["start"]> | undefined
let quitAfterCoreStops = false
let credentialKeyBase64: string | undefined
let douyinOAuthConfiguration: DouyinOAuthRuntimeConfiguration = { mode: "disabled" }
const oneTimeExternalUrls = new Set<string>()

function registerProtocolHandler(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("bilimonitor", process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient("bilimonitor")
  }
}

async function completeDouyinOAuthCallback(callback: DouyinOAuthCallback): Promise<void> {
  if ("error" in callback) {
    const message = callback.errorDescription || `抖音授权未完成：${callback.error}`
    try {
      await (await getReadyCore()).failDouyinOAuthCallback({ state: callback.state, message })
    } catch (error) {
      console.error("Persisting Douyin OAuth callback failure failed:", error)
    }
    notifyDouyinOAuthFailure(callback.state, message)
    return
  }
  try {
    await (await getReadyCore()).completeDouyinOAuth(callback)
    const window = BrowserWindow.getAllWindows()[0]
    if (window?.isMinimized()) window.restore()
    window?.focus()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    notifyDouyinOAuthFailure(callback.state, message)
    console.error("Douyin OAuth callback failed:", message)
  }
}

function notifyDouyinOAuthFailure(state: string, message: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("douyin-auth:oauth-callback-failed", { state, message })
  }
}

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
  window.webContents.setWindowOpenHandler(({ url }) => {
    const oneTimeAllowed = oneTimeExternalUrls.delete(url)
    if (oneTimeAllowed || isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event) => event.preventDefault())

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(join(__dirname, "../renderer/index.html"))
  return window
}

function initializeCore(): LocalCoreController {
  if (!credentialKeyBase64) throw new Error("Credential encryption key is unavailable.")
  return new LocalCoreController({
    entryPath: resolveCoreEntry(__dirname),
    realtimeWorkerEntry: resolveRealtimeWorkerEntry(__dirname),
    browserWorkerEntry: resolveBrowserWorkerEntry(__dirname),
    dataDirectory,
    credentialKeyBase64,
    douyinOAuth: douyinOAuthConfiguration
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
  registerProtocolHandler()
  app.on("second-instance", (_event, argv) => {
    const callback = findDouyinOAuthCallback(argv)
    if (callback) void completeDouyinOAuthCallback(callback)
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app.on("open-url", (event, url) => {
    const callback = parseDouyinOAuthCallback(url)
    if (!callback) return
    event.preventDefault()
    void completeDouyinOAuthCallback(callback)
  })

  app.whenReady().then(() => {
    douyinOAuthConfiguration = loadDouyinOAuthConfiguration(dataDirectory, process.env, safeStorage)
    credentialKeyBase64 = ensureCredentialKey({
      dataDirectory,
      protector: safeStorage
    })
    core = initializeCore()
    ipcMain.handle("core:bootstrap", () => ensureCoreStarted())
    ipcMain.handle("core:restart", async () => {
      await core?.stop()
      coreStart = undefined
      return ensureCoreStarted()
    })
    ipcMain.handle("douyin-auth:status", async () => (await getReadyCore()).getDouyinAuthStatus())
    ipcMain.handle("douyin-auth:web-start", async () => (await getReadyCore()).startDouyinWebQr())
    ipcMain.handle("douyin-auth:web-poll", async (_event, input: unknown) => (await getReadyCore()).pollDouyinWebQr(input))
    ipcMain.handle("douyin-auth:web-validate", async () => (await getReadyCore()).validateDouyinWeb())
    ipcMain.handle("douyin-auth:oauth-start", async () => {
      const started = await (await getReadyCore()).startDouyinOAuth()
      oneTimeExternalUrls.clear()
      oneTimeExternalUrls.add(started.authorizationUrl)
      return started
    })
    ipcMain.handle("douyin-auth:oauth-complete", async (_event, input: unknown) => (await getReadyCore()).completeDouyinOAuth(input))
    ipcMain.handle("douyin-auth:oauth-refresh", async () => (await getReadyCore()).refreshDouyinOAuth())
    ipcMain.handle("douyin-auth:credential", async (_event, input: unknown) => (await getReadyCore()).getDouyinCredential(input))
    ipcMain.handle("douyin-auth:export", async (_event, input: { kind?: unknown }) => {
      const kind = input?.kind === "oauth" ? "oauth" : input?.kind === "web" ? "web" : undefined
      if (!kind) throw new Error("请选择要导出的抖音凭据类型。")
      const credential = await (await getReadyCore()).getDouyinCredential({ kind })
      const selection = await dialog.showSaveDialog({
        title: kind === "web" ? "导出抖音 Web 登录态" : "导出抖音 OAuth 凭据",
        defaultPath: join(dataDirectory, "exports", `douyin-${kind}-credential.json`),
        filters: [{ name: "JSON 文件", extensions: ["json"] }]
      })
      if (selection.canceled || !selection.filePath) return { kind, canceled: true }
      const savedPath = assertOutsideSystemDrive(selection.filePath)
      await writeFile(savedPath, `${JSON.stringify(credential, null, 2)}\n`, "utf8")
      return { kind, canceled: false, savedPath }
    })
    ipcMain.handle("douyin-auth:revoke", async (_event, input: unknown) => (await getReadyCore()).revokeDouyinCredential(input))
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
    ipcMain.handle("bilibili-subjects:list", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliSubjects(input)
    )
    ipcMain.handle("bilibili-subjects:create", async (_event, input: unknown) =>
      (await getReadyCore()).createBilibiliSubject(input)
    )
    ipcMain.handle("bilibili-subjects:get", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliSubject(input)
    )
    ipcMain.handle("bilibili-subjects:update", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliSubject(input)
    )
    ipcMain.handle("bilibili-subjects:delete", async (_event, input: unknown) =>
      (await getReadyCore()).deleteBilibiliSubject(input)
    )
    ipcMain.handle("bilibili-subjects:bind", async (_event, input: unknown) =>
      (await getReadyCore()).bindBilibiliSubject(input)
    )
    ipcMain.handle("bilibili-subjects:workbench", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliSubjectWorkbench(input)
    )
    ipcMain.handle("bilibili-subjects:trends", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliSubjectTrends(input)
    )
    ipcMain.handle("bilibili-subjects:layout-update", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliSubjectLayout(input)
    )
    ipcMain.handle("bilibili-followers:list", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliFollowerMonitors(input)
    )
    ipcMain.handle("bilibili-followers:add", async (_event, input: unknown) =>
      (await getReadyCore()).addBilibiliFollowerMonitor(input)
    )
    ipcMain.handle("bilibili-followers:update-status", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliFollowerMonitorStatus(input)
    )
    ipcMain.handle("bilibili-followers:update-settings", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliFollowerMonitorSettings(input)
    )
    ipcMain.handle("bilibili-followers:refresh", async (_event, input: unknown) =>
      (await getReadyCore()).refreshBilibiliFollowerMonitor(input)
    )
    ipcMain.handle("bilibili-followers:delete", async (_event, input: unknown) =>
      (await getReadyCore()).deleteBilibiliFollowerMonitor(input)
    )
    ipcMain.handle("bilibili-followers:trend", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliFollowerTrend(input)
    )
    ipcMain.handle("bilibili-followers:trends", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliFollowerTrends(input)
    )
    ipcMain.handle("bilibili-auth:qr-start", async () =>
      (await getReadyCore()).startBilibiliQrLogin()
    )
    ipcMain.handle("bilibili-auth:qr-poll", async (_event, input: unknown) =>
      (await getReadyCore()).pollBilibiliQrLogin(input)
    )
    ipcMain.handle("bilibili-auth:status", async () =>
      (await getReadyCore()).getBilibiliAuthStatus()
    )
    ipcMain.handle("bilibili-auth:refresh", async () =>
      (await getReadyCore()).refreshBilibiliAuth()
    )
    ipcMain.handle("bilibili-auth:credential", async () =>
      (await getReadyCore()).getBilibiliCredential()
    )
    ipcMain.handle("bilibili-auth:revoke", async () =>
      (await getReadyCore()).revokeBilibiliAuth()
    )
    ipcMain.handle("bilibili-live:rooms-list", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliLiveRooms(input)
    )
    ipcMain.handle("bilibili-live:rooms-add", async (_event, input: unknown) =>
      (await getReadyCore()).addBilibiliLiveRoom(input)
    )
    ipcMain.handle("bilibili-live:rooms-update-status", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliLiveRoomStatus(input)
    )
    ipcMain.handle("bilibili-live:rooms-update-settings", async (_event, input: unknown) =>
      (await getReadyCore()).updateBilibiliLiveRoomSettings(input)
    )
    ipcMain.handle("bilibili-live:rooms-refresh", async (_event, input: unknown) =>
      (await getReadyCore()).refreshBilibiliLiveRoom(input)
    )
    ipcMain.handle("bilibili-live:rooms-delete", async (_event, input: unknown) =>
      (await getReadyCore()).deleteBilibiliLiveRoom(input)
    )
    ipcMain.handle("bilibili-live:summary", async () =>
      (await getReadyCore()).getBilibiliLiveSummary()
    )
    ipcMain.handle("bilibili-live:trend", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliLiveTrend(input)
    )
    ipcMain.handle("bilibili-live:trends", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliLiveTrends(input)
    )
    ipcMain.handle("bilibili-live:events", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliLiveEvents(input)
    )
    ipcMain.handle("bilibili-live:ranks-summary", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveRankSummary(input)
    )
    ipcMain.handle("bilibili-live:ranks-latest", async (_event, input: unknown) =>
      (await getReadyCore()).getLatestBilibiliLiveRank(input)
    )
    ipcMain.handle("bilibili-live:ranks-refresh", async (_event, input: unknown) =>
      (await getReadyCore()).refreshBilibiliLiveRanks(input)
    )
    ipcMain.handle("bilibili-live:danmaku-start", async (_event, input: unknown) =>
      (await getReadyCore()).startBilibiliLiveDanmaku(input)
    )
    ipcMain.handle("bilibili-live:danmaku-stop", async (_event, input: unknown) =>
      (await getReadyCore()).stopBilibiliLiveDanmaku(input)
    )
    ipcMain.handle("bilibili-live:danmaku-status", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveDanmakuStatus(input)
    )
    ipcMain.handle("bilibili-live:danmaku-recent", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveDanmakuRecent(input)
    )
    ipcMain.handle("bilibili-live:danmaku-metrics", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveDanmakuMetrics(input)
    )
    ipcMain.handle("bilibili-live:sessions", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliLiveSessions(input)
    )
    ipcMain.handle("bilibili-live:session", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveSession(input)
    )
    ipcMain.handle("bilibili-live:session-users", async (_event, input: unknown) =>
      (await getReadyCore()).listBilibiliLiveSessionUsers(input)
    )
    ipcMain.handle("bilibili-live:session-events", async (_event, input: unknown) =>
      (await getReadyCore()).queryBilibiliLiveSessionEvents(input)
    )
    ipcMain.handle("bilibili-live:session-insight", async (_event, input: unknown) =>
      (await getReadyCore()).getBilibiliLiveSessionInsight(input)
    )
    ipcMain.handle("bilibili-live:session-export", async (_event, input: unknown) => {
      const prepared = await (await getReadyCore()).prepareBilibiliLiveSessionExport(input)
      const tempRoot = resolve(dataDirectory, "exports", "temp")
      const tempPath = resolve(prepared.temporaryPath)
      const relativeTempPath = relative(tempRoot, tempPath)
      if (
        !relativeTempPath
        || relativeTempPath.startsWith("..")
        || isAbsolute(relativeTempPath)
      ) throw new Error("Local Core 返回了无效的临时导出路径。")
      try {
        const selection = await dialog.showSaveDialog({
          title: "导出 B站直播场次",
          defaultPath: join(dataDirectory, "exports", prepared.suggestedFileName),
          filters: exportFilters(prepared.category)
        })
        if (selection.canceled || !selection.filePath) {
          return { category: prepared.category, canceled: true }
        }
        const savedPath = assertOutsideSystemDrive(selection.filePath)
        await copyFile(tempPath, savedPath)
        return {
          category: prepared.category,
          canceled: false,
          savedPath
        }
      } finally {
        await unlink(tempPath).catch(() => undefined)
      }
    })

    createWindow()
    void ensureCoreStarted()
      .then(() => {
        if (initialOAuthCallback) void completeDouyinOAuthCallback(initialOAuthCallback)
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

function exportFilters(category: string): Electron.FileFilter[] {
  if (category === "xlsx") return [{ name: "Excel 工作簿", extensions: ["xlsx"] }]
  if (category === "all") return [{ name: "ZIP 压缩包", extensions: ["zip"] }]
  return [{ name: "CSV 文件", extensions: ["csv"] }]
}
