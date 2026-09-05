import { randomBytes } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { join } from "node:path"

export interface CredentialKeyProtector {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export interface EnsureCredentialKeyOptions {
  dataDirectory: string
  protector: CredentialKeyProtector
  randomKey?: () => Buffer
}

export function ensureCredentialKey(options: EnsureCredentialKeyOptions): string {
  if (!options.protector.isEncryptionAvailable()) {
    throw new Error("Operating-system credential protection is unavailable.")
  }
  const secretDirectory = join(options.dataDirectory, "secrets")
  const keyPath = join(secretDirectory, "credential-key.bin")
  mkdirSync(secretDirectory, { recursive: true })

  if (existsSync(keyPath)) {
    return validateKey(options.protector.decryptString(readFileSync(keyPath)))
  }

  const key = (options.randomKey ?? (() => randomBytes(32)))()
  if (key.byteLength !== 32) throw new Error("Generated credential key must be exactly 32 bytes.")
  const plainText = key.toString("base64")
  const protectedKey = options.protector.encryptString(plainText)
  const temporaryPath = join(secretDirectory, `credential-key.${process.pid}.tmp`)
  try {
    writeFileSync(temporaryPath, protectedKey, { flag: "wx", mode: 0o600 })
    renameSync(temporaryPath, keyPath)
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    if (existsSync(keyPath)) {
      return validateKey(options.protector.decryptString(readFileSync(keyPath)))
    }
    throw error
  }
  return plainText
}

function validateKey(value: string): string {
  const normalized = value.trim()
  const key = Buffer.from(normalized, "base64")
  if (key.byteLength !== 32 || key.toString("base64") !== normalized) {
    throw new Error("Protected credential key is invalid.")
  }
  return normalized
}
