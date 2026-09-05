import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import * as contracts from "./index"

describe("Bilibili auth contracts", () => {
  it("publishes the original B/S QR login and credential contract surface", () => {
    expect(contracts).toEqual(expect.objectContaining({
      BilibiliAuthStatusSchema: expect.any(Object),
      BilibiliCredentialSchema: expect.any(Object),
      BilibiliQrLoginStartSchema: expect.any(Object),
      BilibiliQrLoginStatusSchema: expect.any(Object),
      BilibiliAuthRefreshResultSchema: expect.any(Object),
      RevokeBilibiliAuthResultSchema: expect.any(Object)
    }))
  })

  it("keeps the five original QR states and the complete credential projection", () => {
    const exported = contracts as unknown as Record<string, { parse: (value: unknown) => unknown }>
    const parseStatus = exported.BilibiliQrLoginStatusSchema?.parse
    const parseCredential = exported.BilibiliCredentialSchema?.parse
    expect(parseStatus).toBeTypeOf("function")
    expect(parseCredential).toBeTypeOf("function")
    if (!parseStatus || !parseCredential) return

    for (const status of ["WAITING", "SCANNED", "EXPIRED", "SUCCESS", "FAILED"]) {
      expect(() => parseStatus({
        status,
        message: "state",
        expiresInSeconds: status === "SUCCESS" ? 0 : 180
      })).not.toThrow()
    }

    expect(parseCredential({
      credentialId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      account: { mid: "99", uname: "Alice", level: 6, vipStatus: 0 },
      cookieHeader: "SESSDATA=session; bili_jct=csrf; DedeUserID=99",
      cookies: [
        { name: "SESSDATA", value: "session", domain: ".bilibili.com", path: "/", httpOnly: true, secure: true },
        { name: "bili_jct", value: "csrf", domain: ".bilibili.com", path: "/", httpOnly: false, secure: true },
        { name: "DedeUserID", value: "99", domain: ".bilibili.com", path: "/", httpOnly: false, secure: true }
      ],
      csrf: "csrf",
      refreshToken: "refresh",
      rawPayload: { version: 1 }
    })).toEqual(expect.objectContaining({ csrf: "csrf", refreshToken: "refresh" }))
  })

  it("publishes a language-neutral auth schema for the Python auth worker", () => {
    const schemaPath = fileURLToPath(new URL("../schemas/bilibili-auth.v1.schema.json", import.meta.url))
    expect(() => readFileSync(schemaPath, "utf8")).not.toThrow()
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $defs: Record<string, unknown> }
    expect(schema.$defs).toHaveProperty("BilibiliQrLoginStart")
    expect(schema.$defs).toHaveProperty("BilibiliQrLoginStatus")
    expect(schema.$defs).toHaveProperty("BilibiliCredential")
    expect(schema.$defs).toHaveProperty("BilibiliAuthWorkerPollResult")
  })
})
