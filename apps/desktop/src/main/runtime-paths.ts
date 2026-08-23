import { dirname, isAbsolute, parse, resolve } from "node:path"

interface DataDirectoryPaths {
  appPath: string
  isPackaged: boolean
  executablePath: string
  overridePath?: string
}

function absolutePath(path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path)
}

function assertOutsideSystemDrive(path: string): string {
  if (parse(path).root.toLowerCase() === "c:\\") {
    throw new Error(`BiliMonitor data must not use the C drive: ${path}`)
  }
  return path
}

export function resolveDataDirectory(paths: DataDirectoryPaths): string {
  const dataDirectory = paths.overridePath
    ? absolutePath(paths.overridePath)
    : paths.isPackaged
      ? resolve(dirname(paths.executablePath), "data")
      : resolve(paths.appPath, "../../.local-data")

  return assertOutsideSystemDrive(dataDirectory)
}

export function resolveCoreEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "core-process.js")
}

export function resolvePreloadEntry(mainDirectory: string): string {
  return resolve(mainDirectory, "../preload/index.cjs")
}
