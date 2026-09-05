import { isAbsolute, parse, resolve } from "node:path"

interface DataDirectoryPaths {
  appPath: string
  isPackaged: boolean
  executablePath: string
  overridePath?: string
}

interface PlaywrightBrowserPaths {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
}

function absolutePath(path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path)
}

export function assertOutsideSystemDrive(path: string): string {
  const resolvedPath = absolutePath(path)
  if (parse(resolvedPath).root.toLowerCase() !== "d:\\") {
    throw new Error(`BiliMonitor data must stay on the D drive: ${resolvedPath}`)
  }
  return resolvedPath
}

export function resolveDataDirectory(paths: DataDirectoryPaths): string {
  const dataDirectory = paths.overridePath
    ? absolutePath(paths.overridePath)
    : paths.isPackaged
      ? resolve(parse(paths.executablePath).root, "BiliMonitor Desktop Data")
      : resolve(paths.appPath, "../../.local-data")

  return assertOutsideSystemDrive(dataDirectory)
}

export function resolveCoreEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "core-process.js")
}

export function resolveRealtimeWorkerEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "realtime-worker.js")
}

export function resolveBrowserWorkerEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "browser-worker.js")
}

export function resolvePlaywrightBrowsersPath(paths: PlaywrightBrowserPaths): string {
  const browsersPath = paths.isPackaged
    ? resolve(paths.resourcesPath, "playwright-browsers")
    : resolve(paths.appPath, "../../.tools/playwright-browsers")
  return assertOutsideSystemDrive(browsersPath)
}

export function resolvePackagedPythonWorker(resourcesPath: string): {
  executable: string
  workerPath: string
} {
  const workerPath = assertOutsideSystemDrive(resolve(resourcesPath, "python-worker"))
  return {
    executable: resolve(workerPath, "bmd-python-worker.exe"),
    workerPath
  }
}

export function resolvePreloadEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "../preload/index.cjs")
}
