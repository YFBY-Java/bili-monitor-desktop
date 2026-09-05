import { randomBytes } from "node:crypto"

import { describe, expect, it } from "vitest"

import * as cipherModule from "./credential-cipher"

describe("CredentialCipher", () => {
  it("encrypts Bilibili credentials with AES-256-GCM and round-trips them", () => {
    const exported = cipherModule as unknown as Record<string, unknown>
    expect(typeof exported.CredentialCipher).toBe("function")
    if (typeof exported.CredentialCipher !== "function") return

    const Cipher = exported.CredentialCipher as new (key: Uint8Array) => {
      encrypt: (payload: unknown) => string
      decrypt: (payload: string) => unknown
    }
    const cipher = new Cipher(randomBytes(32))
    const payload = {
      cookieHeader: "SESSDATA=secret-session; bili_jct=secret-csrf; DedeUserID=99",
      refreshToken: "secret-refresh",
      cookies: [{ name: "SESSDATA", value: "secret-session" }]
    }
    const encrypted = cipher.encrypt(payload)

    expect(encrypted).toContain('"alg":"AES-256-GCM"')
    expect(encrypted).not.toContain("secret-session")
    expect(encrypted).not.toContain("secret-refresh")
    expect(cipher.decrypt(encrypted)).toEqual(payload)
  })

  it("rejects invalid key lengths and authenticated-ciphertext tampering", () => {
    const exported = cipherModule as unknown as Record<string, unknown>
    if (typeof exported.CredentialCipher !== "function") {
      expect(typeof exported.CredentialCipher).toBe("function")
      return
    }
    const Cipher = exported.CredentialCipher as new (key: Uint8Array) => {
      encrypt: (payload: unknown) => string
      decrypt: (payload: string) => unknown
    }

    expect(() => new Cipher(randomBytes(16))).toThrow(/32 bytes/i)
    const cipher = new Cipher(randomBytes(32))
    const encrypted = cipher.encrypt({ value: "credential" })
    const envelope = JSON.parse(encrypted) as { ciphertext: string }
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`
    expect(() => cipher.decrypt(JSON.stringify(envelope))).toThrow(/decrypt/i)
  })
})
