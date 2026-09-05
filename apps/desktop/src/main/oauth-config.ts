import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { join } from "node:path"

export interface DouyinOAuthRuntimeConfiguration {
  mode: "disabled" | "live"
  clientKey?: string
  clientSecret?: string
  redirectUri?: string
  scope?: string
}

export interface ConfigurationProtector {
  isEncryptionAvailable: () => boolean
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
}

const CONFIGURATION_KEYS = [
  "BMD_DOUYIN_OAUTH_MODE",
  "BMD_DOUYIN_OAUTH_CLIENT_KEY",
  "BMD_DOUYIN_OAUTH_CLIENT_SECRET",
  "BMD_DOUYIN_OAUTH_REDIRECT_URI",
  "BMD_DOUYIN_OAUTH_SCOPE"
] as const

const TEMPLATE = `# Copy this file to douyin-oauth.env, fill the Douyin Open Platform values, then restart BiliMonitor Desktop.
BMD_DOUYIN_OAUTH_MODE=live
BMD_DOUYIN_OAUTH_CLIENT_KEY=
BMD_DOUYIN_OAUTH_CLIENT_SECRET=
BMD_DOUYIN_OAUTH_REDIRECT_URI=bilimonitor://douyin-oauth
BMD_DOUYIN_OAUTH_SCOPE=user_info
`

export function loadDouyinOAuthConfiguration(
  dataDirectory: string,
  environment: NodeJS.ProcessEnv,
  protector?: ConfigurationProtector
): DouyinOAuthRuntimeConfiguration {
  const configDirectory = join(dataDirectory, "config")
  mkdirSync(configDirectory, { recursive: true })
  const templatePath = join(configDirectory, "douyin-oauth.env.example")
  if (!existsSync(templatePath)) writeFileSync(templatePath, TEMPLATE, { encoding: "utf8", flag: "wx" })

  const configPath = join(configDirectory, "douyin-oauth.env")
  const securePath = join(configDirectory, "douyin-oauth.secure")
  const secureConfiguration = protector && protector.isEncryptionAvailable() && existsSync(securePath)
    ? readProtectedConfiguration(securePath, protector)
    : undefined
  const fileValues = existsSync(configPath)
    ? parseEnvironmentFile(readFileSync(configPath, "utf8"))
    : {}
  const fileConfiguration = configurationFromValues((key) => fileValues[key]?.trim() || undefined)
  if (fileConfiguration.mode === "live" && protector?.isEncryptionAvailable()) {
    const temporaryPath = `${securePath}.tmp`
    const encrypted = protector.encryptString(JSON.stringify(fileConfiguration)).toString("base64")
    writeFileSync(temporaryPath, `${encrypted}\n`, "utf8")
    renameSync(temporaryPath, securePath)
    unlinkSync(configPath)
  }
  const value = (key: typeof CONFIGURATION_KEYS[number]): string | undefined => {
    const persistentValue = configurationValue(secureConfiguration ?? fileConfiguration, key)
    const selected = environment[key]?.trim() || persistentValue
    return selected || undefined
  }
  return configurationFromValues(value)
}

function configurationFromValues(
  value: (key: typeof CONFIGURATION_KEYS[number]) => string | undefined
): DouyinOAuthRuntimeConfiguration {
  const mode = value("BMD_DOUYIN_OAUTH_MODE")
  const clientKey = value("BMD_DOUYIN_OAUTH_CLIENT_KEY")
  const clientSecret = value("BMD_DOUYIN_OAUTH_CLIENT_SECRET")
  const redirectUri = value("BMD_DOUYIN_OAUTH_REDIRECT_URI")
  if (mode !== "live" || !clientKey || !clientSecret || !redirectUri) return { mode: "disabled" }
  return { mode: "live", clientKey, clientSecret, redirectUri, scope: value("BMD_DOUYIN_OAUTH_SCOPE") ?? "user_info" }
}

function configurationValue(
  configuration: DouyinOAuthRuntimeConfiguration,
  key: typeof CONFIGURATION_KEYS[number]
): string | undefined {
  if (key === "BMD_DOUYIN_OAUTH_MODE") return configuration.mode
  if (configuration.mode !== "live") return undefined
  if (key === "BMD_DOUYIN_OAUTH_CLIENT_KEY") return configuration.clientKey
  if (key === "BMD_DOUYIN_OAUTH_CLIENT_SECRET") return configuration.clientSecret
  if (key === "BMD_DOUYIN_OAUTH_REDIRECT_URI") return configuration.redirectUri
  return configuration.scope
}

function readProtectedConfiguration(
  securePath: string,
  protector: ConfigurationProtector
): DouyinOAuthRuntimeConfiguration {
  const encrypted = Buffer.from(readFileSync(securePath, "utf8").trim(), "base64")
  const parsed = JSON.parse(protector.decryptString(encrypted)) as Record<string, unknown>
  return configurationFromValues((key) => {
    const property = key
      .replace("BMD_DOUYIN_OAUTH_", "")
      .toLowerCase()
      .replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase())
    return typeof parsed[property] === "string" ? parsed[property] : undefined
  })
}

function parseEnvironmentFile(contents: string): Partial<Record<typeof CONFIGURATION_KEYS[number], string>> {
  const parsed: Partial<Record<typeof CONFIGURATION_KEYS[number], string>> = {}
  const accepted = new Set<string>(CONFIGURATION_KEYS)
  for (const sourceLine of contents.split(/\r?\n/u)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!accepted.has(key)) continue
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    parsed[key as typeof CONFIGURATION_KEYS[number]] = value
  }
  return parsed
}
