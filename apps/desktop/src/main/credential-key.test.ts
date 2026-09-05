import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import * as keyModule from "./credential-key"

describe("ensureCredentialKey", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("stores only an OS-protected key envelope under the D-drive runtime directory", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-key-"))
    const exported = keyModule as unknown as Record<string, unknown>
    expect(typeof exported.ensureCredentialKey).toBe("function")
    if (typeof exported.ensureCredentialKey !== "function") return

    const protect = vi.fn((value: string) => Buffer.from(`protected:${value}`, "utf8"))
    const unprotect = vi.fn((value: Buffer) => value.toString("utf8").replace("protected:", ""))
    const protector = {
      isEncryptionAvailable: () => true,
      encryptString: protect,
      decryptString: unprotect
    }
    const ensureCredentialKey = exported.ensureCredentialKey as (options: {
      dataDirectory: string
      protector: typeof protector
      randomKey: () => Buffer
    }) => string
    const plain = Buffer.alloc(32, 7).toString("base64")
    const first = ensureCredentialKey({
      dataDirectory: directory,
      protector,
      randomKey: () => Buffer.alloc(32, 7)
    })
    const second = ensureCredentialKey({
      dataDirectory: directory,
      protector,
      randomKey: () => Buffer.alloc(32, 9)
    })

    expect(first).toBe(plain)
    expect(second).toBe(plain)
    expect(protect).toHaveBeenCalledTimes(1)
    expect(unprotect).toHaveBeenCalledTimes(1)
    const persisted = await readFile(resolve(directory, "secrets", "credential-key.bin"))
    expect(persisted.toString("utf8")).not.toBe(plain)
    expect(persisted.toString("utf8")).toContain("protected:")
  })

  it("fails closed when OS credential protection is unavailable", () => {
    const exported = keyModule as unknown as Record<string, unknown>
    if (typeof exported.ensureCredentialKey !== "function") {
      expect(typeof exported.ensureCredentialKey).toBe("function")
      return
    }
    const ensureCredentialKey = exported.ensureCredentialKey as (options: Record<string, unknown>) => string
    expect(() => ensureCredentialKey({
      dataDirectory: "D:\\runtime",
      protector: {
        isEncryptionAvailable: () => false,
        encryptString: vi.fn(),
        decryptString: vi.fn()
      }
    })).toThrow(/unavailable/i)
  })
})
