import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { createRuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"
import { afterEach, describe, expect, it } from "vitest"

import { dispatchBusinessRequest } from "./core-request-router"

describe("dispatchBusinessRequest", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("routes typed account commands and queries to the real local Core", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-router-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T07:00:00.000Z"),
      idFactory: () => `018f0f39-ab5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`
    })

    try {
      const createRequest = createRuntimeEnvelope({
        id: "request-create",
        type: "platform-accounts.create",
        timestamp: "2026-08-23T07:00:00.000Z",
        correlationId: "correlation-create",
        traceId: "trace-create",
        payload: {
          platform: "bilibili",
          externalId: "672328094",
          displayName: "测试账号"
        }
      })
      expect(dispatchBusinessRequest(runtime, createRequest)).toMatchObject({
        responseType: "platform-accounts.create.result",
        payload: { platform: "bilibili", externalId: "672328094" }
      })

      const listRequest = createRuntimeEnvelope({
        id: "request-list",
        type: "platform-accounts.list",
        timestamp: "2026-08-23T07:00:00.000Z",
        correlationId: "correlation-list",
        traceId: "trace-list",
        payload: {}
      })
      expect(dispatchBusinessRequest(runtime, listRequest)).toMatchObject({
        responseType: "platform-accounts.list.result",
        payload: { total: 1, items: [{ externalId: "672328094" }] }
      })
    } finally {
      await runtime.stop()
    }
  })
})
