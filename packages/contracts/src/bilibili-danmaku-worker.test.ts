import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import * as contracts from "./index"

const fixtures: Array<{ name: string; input: object; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-http-configuration.json", import.meta.url), "utf8"))
it.each(fixtures)("danmaku HTTP contract: $name", fixture => {
  expect(contracts.BilibiliDanmakuWorkerStartSchema).toBeDefined()
  expect(contracts.BilibiliDanmakuWorkerStartSchema.safeParse({ connectionId: "fixture", roomId: "33",
    httpConfiguration: fixture.input }).success).toBe(fixture.valid)
})
it("allows legacy starts but rejects explicit null configuration and untrusted extra HTTP options", () => {
  expect(contracts.BilibiliDanmakuWorkerStartSchema).toBeDefined()
  const base = { connectionId: "fixture", roomId: "33" }
  expect(contracts.BilibiliDanmakuWorkerStartSchema.parse(base)).toEqual(base)
  for (const extra of [{ httpConfiguration: null }, { url: "https://private.test" }, { roomId: "0" },
    { protocolVersion: 4 }, { credential: { cookieHeader: "secret\r\nnew:header", authUid: "1" } }]) {
    expect(contracts.BilibiliDanmakuWorkerStartSchema.safeParse({ ...base, ...extra }).success).toBe(false)
  }
})
