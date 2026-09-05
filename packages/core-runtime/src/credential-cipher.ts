import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

interface CredentialEnvelope {
  version: 1
  alg: "AES-256-GCM"
  iv: string
  authTag: string
  ciphertext: string
}

export class CredentialCipher {
  private readonly key: Buffer

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error("Credential encryption key must be exactly 32 bytes.")
    this.key = Buffer.from(key)
  }

  static fromBase64(value: string): CredentialCipher {
    const key = Buffer.from(value, "base64")
    if (key.byteLength !== 32 || key.toString("base64") !== value.trim()) {
      throw new Error("Credential encryption key must be a canonical Base64 value containing 32 bytes.")
    }
    return new CredentialCipher(key)
  }

  encrypt(payload: unknown): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final()
    ])
    const envelope: CredentialEnvelope = {
      version: 1,
      alg: "AES-256-GCM",
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    }
    return JSON.stringify(envelope)
  }

  decrypt(payload: string): unknown {
    try {
      const envelope = JSON.parse(payload) as Partial<CredentialEnvelope>
      if (envelope.version !== 1 || envelope.alg !== "AES-256-GCM") {
        throw new Error("Unsupported credential envelope.")
      }
      if (!envelope.iv || !envelope.authTag || !envelope.ciphertext) {
        throw new Error("Incomplete credential envelope.")
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(envelope.iv, "base64")
      )
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"))
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final()
      ])
      return JSON.parse(plain.toString("utf8")) as unknown
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to decrypt credential: ${message}`)
    }
  }
}
