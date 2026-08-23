import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { ControlDatabase } from "./control-database"

describe("ControlDatabase", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("creates the WAL control database and applies schema version 1", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-control-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)

    expect(database.status()).toEqual({
      databasePath: resolve(testDirectory, "control.db"),
      journalMode: "wal",
      schemaVersion: 1
    })
    expect(database.listWorkerStatuses()).toEqual([])

    database.close()
  })
})
