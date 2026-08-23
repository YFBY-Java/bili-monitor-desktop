import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterEach, describe, expect, it } from "vitest"

import { ControlDatabase } from "./control-database"

describe("ControlDatabase", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("creates the WAL control database and applies account and subject schema version 2", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-control-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    try {
      expect(database.status()).toEqual({
        databasePath: resolve(testDirectory, "control.db"),
        journalMode: "wal",
        schemaVersion: 2
      })
      expect(database.listWorkerStatuses()).toEqual([])

      const inspection = new DatabaseSync(resolve(testDirectory, "control.db"), { readOnly: true })
      try {
        const tables = inspection
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all()
          .map((row) => String(row.name))
        expect(tables).toEqual(expect.arrayContaining([
          "platform_account",
          "subject",
          "subject_account_binding",
          "subject_monitor_policy"
        ]))
      } finally {
        inspection.close()
      }
    } finally {
      database.close()
    }
  })

  it("persists account, subject, binding, policy and outbox records atomically", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-business-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const store = database as unknown as {
      createPlatformAccount: (input: Record<string, unknown>, outbox: Record<string, unknown>) => void
      createSubject: (input: Record<string, unknown>, outbox: Record<string, unknown>) => void
      listPlatformAccounts: (input: Record<string, unknown>) => { items: unknown[]; total: number }
      listSubjects: (input: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
      listPendingOutbox: () => Array<{ topic: string }>
    }

    try {
      expect(typeof store.createPlatformAccount).toBe("function")
      expect(typeof store.createSubject).toBe("function")
      expect(typeof store.listPlatformAccounts).toBe("function")
      expect(typeof store.listSubjects).toBe("function")

      store.createPlatformAccount({
        accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神",
        profileUrl: "https://space.bilibili.com/3494364227449238",
        avatarUrl: null,
        authState: "not_connected",
        lastValidatedAt: null,
        version: 1,
        createdAt: "2026-08-23T05:00:00.000Z",
        updatedAt: "2026-08-23T05:00:00.000Z"
      }, {
        messageId: "018f0f39-7b5e-7cc1-962d-9a208b3d0185",
        topic: "platform-account.created",
        envelopeJson: "{}",
        createdAt: "2026-08-23T05:00:00.000Z"
      })

      store.createSubject({
        subject: {
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          name: "原神官方账号",
          status: "active",
          tags: ["游戏", "官方"],
          version: 1,
          createdAt: "2026-08-23T05:01:00.000Z",
          updatedAt: "2026-08-23T05:01:00.000Z"
        },
        binding: {
          bindingId: "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
          validFrom: "2026-08-23T05:01:00.000Z",
          createdAt: "2026-08-23T05:01:00.000Z"
        },
        policy: {
          policyId: "018f0f39-8b5e-7cc1-962d-9a208b3d0186",
          bindingId: "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
          capability: "follower.snapshot",
          state: "active",
          intervalSeconds: 3600,
          version: 1,
          createdAt: "2026-08-23T05:01:00.000Z",
          updatedAt: "2026-08-23T05:01:00.000Z"
        }
      }, {
        messageId: "018f0f39-8b5e-7cc1-962d-9a208b3d0187",
        topic: "subject.created",
        envelopeJson: "{}",
        createdAt: "2026-08-23T05:01:00.000Z"
      })

      expect(store.listPlatformAccounts({ limit: 50 })).toMatchObject({ total: 1 })
      expect(store.listSubjects({ limit: 50 })).toMatchObject({
        total: 1,
        items: [{
          subjectId: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
          tags: ["游戏", "官方"],
          accounts: [{ externalId: "3494364227449238" }],
          policies: [{
            accountId: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
            capability: "follower.snapshot",
            intervalSeconds: 3600
          }]
        }]
      })
      expect(store.listPendingOutbox().map((message) => message.topic)).toEqual([
        "platform-account.created",
        "subject.created"
      ])
    } finally {
      database.close()
    }
  })
})
