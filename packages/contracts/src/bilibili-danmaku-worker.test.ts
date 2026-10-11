import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import * as contracts from "./index"

const fixtures: Array<{ name: string; input: object; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/live-http-configuration.json", import.meta.url), "utf8"))
const protocolFixtures: typeof fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/danmaku-worker-protocol-selection.json", import.meta.url), "utf8"))
const connectionFixtures: typeof fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/danmaku-worker-connection-configuration.json", import.meta.url), "utf8"))
const lifecycleFixtures: Array<{ name: string; kind: string; input: object; valid: boolean }> = JSON.parse(
  readFileSync(new URL("../fixtures/danmaku-worker-auth-lifecycle.json", import.meta.url), "utf8"))
it("shares safe realtime error metadata and preserves legacy errors", () => {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/realtime-worker-error.json", import.meta.url), "utf8"))
  expect(contracts.RealtimeWorkerErrorSchema).toBeDefined()
  expect(contracts.RealtimeWorkerErrorSchema.parse(fixture)).toEqual(fixture)
  expect(contracts.RealtimeWorkerErrorSchema.parse({ code: "FIXTURE_ERROR", message: "" }))
    .toEqual({ code: "FIXTURE_ERROR", message: "" })
  for (const extra of [{ biliCode: 2_147_483_648 }, { statusCode: 99 },
    { endpoint: "https://private.test" }, { cookieHeader: "synthetic" }]) {
    expect(contracts.RealtimeWorkerErrorSchema.safeParse({ ...fixture, ...extra }).success).toBe(false)
  }
})
it.each(lifecycleFixtures)("danmaku lifecycle contract: $name", fixture => {
  const schema = fixture.kind === "result" ? contracts.BilibiliDanmakuWorkerStartResultSchema : contracts.BilibiliDanmakuWorkerLifecycleEventSchema
  expect(schema.safeParse(fixture.input).success).toBe(fixture.valid)
})
it.each([...protocolFixtures, ...connectionFixtures])("danmaku connection/protocol contract: $name", fixture => {
  expect(contracts.BilibiliDanmakuWorkerStartSchema.safeParse({ connectionId: "fixture", roomId: "33",
    ...fixture.input }).success).toBe(fixture.valid)
})
it.each(fixtures)("danmaku HTTP contract: $name", fixture => {
  expect(contracts.BilibiliDanmakuWorkerStartSchema).toBeDefined()
  expect(contracts.BilibiliDanmakuWorkerStartSchema.safeParse({ connectionId: "fixture", roomId: "33",
    httpConfiguration: fixture.input }).success).toBe(fixture.valid)
})
it("allows legacy starts but rejects explicit null configuration and untrusted extra HTTP options", () => {
  expect(contracts.BilibiliDanmakuWorkerStartSchema).toBeDefined()
  const base = { connectionId: "fixture", roomId: "33" }
  expect(contracts.BilibiliDanmakuWorkerStartSchema.parse(base)).toEqual(base)
  for (const extra of [{ httpConfiguration: null }, { connectionConfiguration: null },
    { connectionConfiguration: { extra: true } }, { url: "https://private.test" }, { roomId: "0" },
    { protocolVersion: 4 }, { credential: { cookieHeader: "secret\r\nnew:header", authUid: "1" } }]) {
    expect(contracts.BilibiliDanmakuWorkerStartSchema.safeParse({ ...base, ...extra }).success).toBe(false)
  }
})
