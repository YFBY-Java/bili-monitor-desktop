import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { describe, expect, it } from "vitest"

import { ControlDatabase } from "./control-database"

describe("persistent daily live export counter", () => {
  it("shares one sequence across reopened handles while isolating UID and date", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-export-counter-"))
    let database = await ControlDatabase.open(directory)
    try {
      expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(1)
      expect(database.allocateBilibiliLiveExportNumber("23", "2026-09-13")).toBe(1)
      expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-14")).toBe(1)
      database.close()
      database = await ControlDatabase.open(directory)
      expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(2)
      const second = await ControlDatabase.open(directory)
      try {
        expect(second.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(3)
        expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(4)
      } finally { second.close() }
    } finally { database.close(); await rm(directory, { recursive: true, force: true }) }
  })

  it("does not allow allocation inside a rollbackable export snapshot transaction", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-export-transaction-"))
    const database = await ControlDatabase.open(directory)
    try {
      expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(1)
      expect(() => database.runInTransaction(() => database.allocateBilibiliLiveExportNumber("22", "2026-09-13")))
        .toThrow("outside")
      expect(database.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(2)
    } finally { database.close(); await rm(directory, { recursive: true, force: true }) }
  })

  it("upgrades a v11 database without changing old records and keeps the migration idempotent", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-export-migration-"))
    const initial = await ControlDatabase.open(directory)
    initial.close()
    const raw = new DatabaseSync(resolve(directory, "control.db"))
    try {
      raw.exec(`
        DROP TABLE IF EXISTS bilibili_live_export_daily_counter;
        DELETE FROM schema_migration WHERE version = 12;
        PRAGMA user_version = 11;
        INSERT INTO worker_status(worker_id, worker_type, state, restart_count, updated_at)
        VALUES ('migration-fixture', 'python', 'stopped', 2, '2026-09-13T00:00:00.000Z');
      `)
    } finally { raw.close() }
    let upgraded = await ControlDatabase.open(directory)
    try {
      expect(upgraded.status().schemaVersion).toBe(12)
      expect(upgraded.listWorkerStatuses()).toMatchObject([{ workerId: "migration-fixture", restartCount: 2 }])
      expect(upgraded.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(1)
      upgraded.close()
      upgraded = await ControlDatabase.open(directory)
      expect(upgraded.allocateBilibiliLiveExportNumber("22", "2026-09-13")).toBe(2)
    } finally { upgraded.close(); await rm(directory, { recursive: true, force: true }) }
  })
})
