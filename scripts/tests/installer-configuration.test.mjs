import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(resolve(root, "apps/desktop/package.json"))

test("offline installer can opt out of the redundant system-drive updater cache", () => {
  const builder = dirname(require.resolve("electron-builder/package.json"))
  const builderRequire = createRequire(resolve(builder, "package.json"))
  const library = dirname(builderRequire.resolve("app-builder-lib/package.json"))
  const source = readFileSync(resolve(library, "templates/nsis/include/installer.nsh"), "utf8")
  assert.match(source, /!ifmacrodef customCacheInstaller[\s\S]*!insertmacro customCacheInstaller[\s\S]*!else[\s\S]*APP_INSTALLER_STORE_FILE/)
  const include = readFileSync(resolve(root, "apps/desktop/build/installer.nsh"), "utf8")
  assert.match(include, /!macro customCacheInstaller\s*;[^\n]*\s*!macroend/)
  const uninstaller = readFileSync(resolve(library, "templates/nsis/uninstaller.nsh"), "utf8")
  assert.match(uninstaller, /Function un\.onInit\s*!ifmacrodef customUnPreInit/)
  assert.match(include, /!macro customUnPreInit\s*!insertmacro bmdPrepareInstallerTemp/)
})
