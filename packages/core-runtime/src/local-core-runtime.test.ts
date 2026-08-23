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
        schemaVersion: 2,
        startedAt: "2026-08-23T00:00:00.000Z"
      },
      workers: [],
      sequence: 1
    })

    await runtime.stop()
  })

  it("creates and lists platform accounts and bound subjects through the application service", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-business-"))
    directory = testDirectory
    const ids = [
      "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      "018f0f39-7b5e-7cc1-962d-9a208b3d0185",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0185",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0186",
      "018f0f39-8b5e-7cc1-962d-9a208b3d0187"
    ]
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T05:00:00.000Z"),
      idFactory: () => ids.shift() ?? "018f0f39-9b5e-7cc1-962d-9a208b3d0184"
    })
    const businessRuntime = runtime as unknown as {
      createPlatformAccount: (input: Record<string, unknown>) => Record<string, unknown>
      listPlatformAccounts: (input?: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
      createSubject: (input: Record<string, unknown>) => Record<string, unknown>
      listSubjects: (input?: Record<string, unknown>) => { items: Array<Record<string, unknown>>; total: number }
    }

    try {
      expect(typeof businessRuntime.createPlatformAccount).toBe("function")
      expect(typeof businessRuntime.createSubject).toBe("function")

      const account = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神"
      })
      expect(account).toMatchObject({
        id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "原神",
        authState: "not_connected",
        version: 1
      })
      expect(businessRuntime.listPlatformAccounts()).toMatchObject({
        total: 1,
        items: [{ id: account.id, externalId: "3494364227449238" }]
      })
      expect(() => businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "3494364227449238",
        displayName: "重复账号"
      })).toThrowError(/PLATFORM_ACCOUNT_CONFLICT/)

      const subject = businessRuntime.createSubject({
        name: "原神官方账号",
        tags: ["游戏", "官方"],
        accountId: account.id,
        followerIntervalSeconds: 3600
      })
      expect(subject).toMatchObject({
        id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
        name: "原神官方账号",
        status: "active",
        accounts: [{ id: account.id }],
        monitorPolicies: [{
          capability: "follower.snapshot",
          state: "active",
          intervalSeconds: 3600
        }]
      })
      expect(businessRuntime.listSubjects()).toMatchObject({
        total: 1,
        items: [{ id: subject.id, name: "原神官方账号" }]
      })
    } finally {
      await runtime.stop()
    }
  })

  it("keeps an independent follower policy for every account binding", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-binding-"))
    directory = testDirectory
    let sequence = 0
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: testDirectory,
      version: "0.2.0",
      now: () => new Date("2026-08-23T06:00:00.000Z"),
      idFactory: () => `018f0f39-9b5e-7cc1-962d-${String(sequence++).padStart(12, "0")}`
    })
    const businessRuntime = runtime as unknown as {
      createPlatformAccount: (input: Record<string, unknown>) => Record<string, unknown>
      createSubject: (input: Record<string, unknown>) => Record<string, unknown>
      bindSubjectAccount: (input: Record<string, unknown>) => Record<string, unknown>
    }

    try {
      const firstAccount = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "672328094",
        displayName: "测试账号 A"
      })
      const secondAccount = businessRuntime.createPlatformAccount({
        platform: "bilibili",
        externalId: "672328095",
        displayName: "测试账号 B"
      })
      const subject = businessRuntime.createSubject({
        name: "多账号对象",
        tags: [],
        accountId: firstAccount.id,
        followerIntervalSeconds: 3600
      })

      expect(typeof businessRuntime.bindSubjectAccount).toBe("function")
      expect(businessRuntime.bindSubjectAccount({
        subjectId: subject.id,
        accountId: secondAccount.id,
        followerIntervalSeconds: 7200
      })).toMatchObject({
        id: subject.id,
        accounts: [{ id: firstAccount.id }, { id: secondAccount.id }],
        monitorPolicies: [
          { accountId: firstAccount.id, capability: "follower.snapshot", intervalSeconds: 3600 },
          { accountId: secondAccount.id, capability: "follower.snapshot", intervalSeconds: 7200 }
        ]
      })
    } finally {
      await runtime.stop()
    }
  })
})
