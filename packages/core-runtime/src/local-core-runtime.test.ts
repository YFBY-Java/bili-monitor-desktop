import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { LocalCoreRuntime } from "./local-core-runtime"

describe("LocalCoreRuntime", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("bootstraps a ready local Core without opening a business server", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-"))
    directory = testDirectory
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T00:00:00.000Z")
    })

    expect(runtime.bootstrap()).toEqual({
      coreStatus: {
        state: "ready",
        version: "0.2.0",
        dataDirectory: testDirectory,
        databaseReady: true,
        schemaVersion: 1,
        startedAt: "2026-08-23T00:00:00.000Z"
      },
      workers: [],
      sequence: 1
    })

    await runtime.stop()
  })
})
