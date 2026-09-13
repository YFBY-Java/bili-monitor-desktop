import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openAuthHarness } from "./__fixtures__/auth-migration"
import { BilibiliAuthService } from "./bilibili-auth-service"
import { CredentialCipher } from "./credential-cipher"

describe("post-commit Bilibili credential activation", () => {
  let h: Awaited<ReturnType<typeof openAuthHarness>>, auth: BilibiliAuthService | undefined
  beforeEach(async () => { h = await openAuthHarness() })
  afterEach(async () => { await auth?.stop(); auth = undefined; await h?.close() })

  it("notifies once after committed state is readable, and listener failure does not undo or repeat login", async () => {
    const observed: Array<{ credentialId: string | undefined; activationCount: number }> = []
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    auth = new BilibiliAuthService({ database: h.database, source: h.source, cipher: new CredentialCipher(h.key), now: () => new Date(), idFactory: randomUUID,
      onCredentialActivated: () => {
        observed.push({ credentialId: h.database.findActiveBilibiliCredential()?.credentialId,
          activationCount: h.database.listPendingOutbox().filter(value => value.topic === "bilibili.auth.credential-activated").length })
        throw new Error("SYNTHETIC_SECRET_ACTIVATION_FAILURE")
      } })
    try {
      const qr = await auth.startQrLogin()
      expect(await auth.pollQrLogin(qr.loginId)).toMatchObject({ status: "SUCCESS" })
      expect(await auth.pollQrLogin(qr.loginId)).toMatchObject({ status: "SUCCESS" })
      expect(observed).toEqual([{ credentialId: h.database.findActiveBilibiliCredential()?.credentialId, activationCount: 1 }])
      expect(observed[0]?.credentialId).toBeDefined()
      expect(h.source.calls.validate).toBe(1)
      expect(warning).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(warning.mock.calls)).not.toContain("SYNTHETIC_SECRET")
    } finally { warning.mockRestore() }
  })

  it("does not notify if the actual SQLite activation transaction rolls back", async () => {
    const previous = await h.login()
    const events = h.database.listPendingOutbox()
    const notify = vi.fn()
    auth = new BilibiliAuthService({ database: h.database, source: h.source, cipher: new CredentialCipher(h.key), now: () => new Date(),
      // Reuse the persisted outbox primary key: fail after credential writes, inside the transaction.
      idFactory: () => events[0]!.messageId, onCredentialActivated: notify })
    const qr = await auth.startQrLogin()
    await expect(auth.pollQrLogin(qr.loginId)).rejects.toThrow()
    expect(notify).not.toHaveBeenCalled()
    expect(h.database.findActiveBilibiliCredential()).toEqual(previous.stored)
    expect(h.database.listPendingOutbox()).toEqual(events)
  })
})
