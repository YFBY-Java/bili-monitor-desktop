import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import * as contracts from "./index"
import {
  BindSubjectAccountInputSchema,
  CreatePlatformAccountInputSchema,
  CreateSubjectInputSchema,
  PlatformAccountSchema,
  SubjectSummarySchema
} from "./account-subject"

describe("account and subject contracts", () => {
  it("publishes a language-neutral v1 JSON Schema for boundary consumers", () => {
    const schemaPath = fileURLToPath(new URL("../schemas/account-subject.v1.schema.json", import.meta.url))
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      $id: string
      $defs: Record<string, unknown>
    }

    expect(schema.$id).toBe("https://bilimonitor.local/schemas/account-subject.v1.schema.json")
    expect(schema.$defs).toHaveProperty("PlatformAccount")
    expect(schema.$defs).toHaveProperty("CreatePlatformAccountInput")
    expect(schema.$defs).toHaveProperty("SubjectSummary")
    expect(schema.$defs).toHaveProperty("CreateSubjectInput")
    expect(schema.$defs).toHaveProperty("BindSubjectAccountInput")
  })

  it("exports the stable account and subject schemas", () => {
    expect(contracts).toHaveProperty("PlatformAccountSchema")
    expect(contracts).toHaveProperty("CreatePlatformAccountInputSchema")
    expect(contracts).toHaveProperty("SubjectSummarySchema")
    expect(contracts).toHaveProperty("CreateSubjectInputSchema")
    expect(contracts).toHaveProperty("BindSubjectAccountInputSchema")
    expect(contracts).toHaveProperty("PlatformAccountListSchema")
    expect(contracts).toHaveProperty("SubjectListSchema")
  })

  it("validates a platform account without accepting secret material", () => {
    const account = {
      id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      platform: "bilibili",
      externalId: "3494364227449238",
      displayName: "原神",
      profileUrl: "https://space.bilibili.com/3494364227449238",
      authState: "not_connected",
      createdAt: "2026-08-23T05:00:00.000Z",
      updatedAt: "2026-08-23T05:00:00.000Z",
      version: 1
    }

    expect(PlatformAccountSchema.parse(account)).toEqual(account)
    expect(PlatformAccountSchema.safeParse({ ...account, cookieHeader: "SESSDATA=secret" }).success).toBe(false)
    expect(CreatePlatformAccountInputSchema.safeParse({
      platform: "bilibili",
      externalId: "0",
      displayName: " "
    }).success).toBe(false)
  })

  it("validates a subject with account bindings and a safe follower policy", () => {
    const account = PlatformAccountSchema.parse({
      id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
      platform: "bilibili",
      externalId: "3494364227449238",
      displayName: "原神",
      authState: "not_connected",
      createdAt: "2026-08-23T05:00:00.000Z",
      updatedAt: "2026-08-23T05:00:00.000Z",
      version: 1
    })
    const subject = {
      id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
      name: "原神官方账号",
      status: "active",
      tags: ["游戏", "官方"],
      accounts: [account],
      monitorPolicies: [{
        accountId: account.id,
        capability: "follower.snapshot",
        state: "active",
        intervalSeconds: 3600
      }],
      createdAt: "2026-08-23T05:00:00.000Z",
      updatedAt: "2026-08-23T05:00:00.000Z",
      version: 1
    }

    expect(SubjectSummarySchema.parse(subject)).toEqual(subject)
    expect(CreateSubjectInputSchema.safeParse({
      name: "原神官方账号",
      tags: ["游戏"],
      accountId: account.id,
      followerIntervalSeconds: 299
    }).success).toBe(false)
    expect(BindSubjectAccountInputSchema.parse({
      subjectId: subject.id,
      accountId: account.id,
      followerIntervalSeconds: 3600
    })).toEqual({
      subjectId: subject.id,
      accountId: account.id,
      followerIntervalSeconds: 3600
    })
  })
})
