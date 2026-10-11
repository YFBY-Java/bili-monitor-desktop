import { existsSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import * as contracts from "./index"

const timestamp = "2026-10-05T01:00:00.000Z"
const id = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
const point = { capturedAt: timestamp, followerCount: "9223372036854775807", followingCount: "-9223372036854775808", sourceEndpoint: "x/web-interface/card" }
const monitor = { id, mid: "9223372036854775807", nickname: "原始资料", profileUrl: "https://space.bilibili.com/2",
  currentFollowerCount: "9223372036854775807", followingCount: "-9223372036854775808", deltaSincePrevious: "1",
  growthRateSincePrevious: 0.5, monitorStatus: "ACTIVE", intervalSeconds: 300, recentTrend: [point], version: 1 }
const evidence = { objectId: `sha256:${"a".repeat(64)}`, relativePath: "cas/raw.json", sha256: "a".repeat(64), sizeBytes: 10, mediaType: "application/json" }
const snapshot = { mid: "-9223372036854775808", nickname: "原始资料", profileUrl: "https://space.bilibili.com/2",
  followerCount: "9223372036854775807", followingCount: "-9223372036854775808", fetchedAt: timestamp,
  sourceEndpoint: "x/web-interface/card", evidenceObject: evidence, statusCode: 200, durationMs: 1 }
const collect = { userId: id, mid: "2", success: true, followerCount: "9223372036854775807", capturedAt: timestamp, message: "完成" }

type HttpCase = { name: string; input: Record<string, unknown>; valid: boolean }
const httpDefaults = { connectTimeoutMs: 5000, readTimeoutMs: 10000,
  userAgent: "SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)", referer: "https://www.bilibili.com/" }
const httpCases: HttpCase[] = [
  ...JSON.parse(readFileSync(new URL("../fixtures/follower-http-configuration.json", import.meta.url), "utf8")) as HttpCase[],
  ...["userAgent", "referer"].flatMap(field => [
    { name: `${field} horizontal tab`, input: { httpConfiguration: { ...httpDefaults, [field]: "A\tB" } }, valid: true },
    { name: `${field} final LF`, input: { httpConfiguration: { ...httpDefaults, [field]: "A\n" } }, valid: false },
    { name: `${field} final CR`, input: { httpConfiguration: { ...httpDefaults, [field]: "A\r" } }, valid: false },
    { name: `${field} DEL`, input: { httpConfiguration: { ...httpDefaults, [field]: "A\u007f" } }, valid: false },
    { name: `${field} Unicode`, input: { httpConfiguration: { ...httpDefaults, [field]: "A\u00e9" } }, valid: false }
  ])
]
const fetchRequest = { mid: "2", taskId: "task", attempt: 1, leaseId: "lease" }

describe("Bilibili follower v2 exact wire contracts", () => {
  it.each(httpCases)("validates v2 HTTP defaults and header boundaries: $name", fixture => {
    expect(contracts.BilibiliFollowerFetchRequestV2Schema.safeParse({ ...fetchRequest, ...fixture.input }).success)
      .toBe(fixture.valid)
  })
  it("validates the same HTTP golden cases with the portable Draft 2020-12 validator", () => {
    const failureEvidence: { request: unknown; error: unknown } = JSON.parse(
      readFileSync(new URL("../fixtures/follower-failure-evidence.json", import.meta.url), "utf8"))
    expect.soft(contracts.BilibiliFollowerFetchRequestV2Schema.safeParse(failureEvidence.request).success).toBe(true)
    expect(contracts.BilibiliFollowerFetchFailureV2Schema.parse(failureEvidence.error)).toEqual(failureEvidence.error)
    const platformCases: { workerRequests: Array<{ mid: string; valid: boolean }> } = JSON.parse(
      readFileSync(new URL("../fixtures/platform-account-inputs.json", import.meta.url), "utf8"))
    for (const item of platformCases.workerRequests) {
      expect(contracts.BilibiliPlatformAccountFetchRequestV1Schema.safeParse({ ...fetchRequest, mid: item.mid }).success).toBe(item.valid)
    }
    expect(contracts.BilibiliFollowerFetchRequestV2Schema.safeParse({ ...fetchRequest, mid: "0" }).success).toBe(false)
    expect(contracts.BilibiliFollowerFetchRequestV2Schema.safeParse({ ...fetchRequest, mid: "-1" }).success).toBe(false)
    const schema: unknown = JSON.parse(readFileSync(new URL("../schemas/bilibili-follower.v2.schema.json", import.meta.url), "utf8"))
    const decisions: unknown = JSON.parse(execFileSync(process.env.BMD_PYTHON_EXE ?? "python", ["-c", [
      "import json, sys",
      "from jsonschema import Draft202012Validator",
      "value = json.load(sys.stdin)",
      "schema = {**value['schema'], '$ref': '#/$defs/BilibiliFollowerFetchRequestV2'}",
      "Draft202012Validator.check_schema(schema)",
      "validator = Draft202012Validator(schema)",
      "platform_validator = Draft202012Validator({**value['schema'], '$ref': '#/$defs/BilibiliPlatformAccountFetchRequestV1'})",
      "print(json.dumps({'follower': [validator.is_valid(request) for request in value['requests']], 'platform': [platform_validator.is_valid(request) for request in value['platformRequests']]}))"
    ].join("\n")], {
      input: JSON.stringify({ schema, requests: [...httpCases.map(fixture => ({ ...fetchRequest, ...fixture.input })),
        failureEvidence.request], platformRequests: platformCases.workerRequests.map(item => ({ ...fetchRequest, mid: item.mid })) }),
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
    }))
    expect(decisions).toEqual({ follower: [...httpCases.map(fixture => fixture.valid), true],
      platform: platformCases.workerRequests.map(item => item.valid) })
  })
  it.each(["0", "-1", "-9223372036854775808", "9223372036854775807"])("allows signed response MID %s without changing profile text", mid => {
    expect(contracts).toHaveProperty("BilibiliFollowerProfileV2Schema")
    expect(contracts.BilibiliFollowerProfileV2Schema.parse({ mid, nickname: " 原始资料 " }))
      .toEqual({ mid, nickname: " 原始资料 " })
  })
  it("publishes every v2 count-bearing result without number coercion", () => {
    for (const [name, value] of [
      ["BilibiliFollowerPointV2Schema", point], ["BilibiliFollowerMonitorV2Schema", monitor],
      ["BilibiliFollowerMonitorListV2Schema", { items: [monitor], total: 1, snapshotAt: timestamp }],
      ["BilibiliFollowerTrendV2Schema", { user: monitor, points: [point] }],
      ["BilibiliFollowerTrendListV2Schema", [{ user: monitor, points: [point] }]],
      ["BilibiliFollowerCollectResultV2Schema", collect], ["BilibiliFollowerFetchedSnapshotV2Schema", snapshot]
    ] as const) {
      expect(contracts).toHaveProperty(name)
      expect(contracts[name].parse(value)).toEqual(value)
    }
    const rawCases = JSON.parse(readFileSync(new URL("../fixtures/follower-raw-payload-storage.json", import.meta.url), "utf8")) as Array<{ status: string }>
    for (const { status } of rawCases) {
      const value = { ...snapshot, rawPayloadStorageStatus: status }
      expect(contracts.BilibiliFollowerFetchedSnapshotV2Schema.parse(value)).toEqual(value)
    }
    for (const status of [null, "UNKNOWN", 1]) {
      expect(contracts.BilibiliFollowerFetchedSnapshotV2Schema.safeParse({ ...snapshot, rawPayloadStorageStatus: status }).success).toBe(false)
    }
  })
  it("allows signed snapshot response MID but requires positive monitor, collect and request MID", () => {
    expect(contracts).toHaveProperty("BilibiliFollowerFetchedSnapshotV2Schema")
    expect(contracts.BilibiliFollowerFetchedSnapshotV2Schema.parse(snapshot)).toEqual(snapshot)
    for (const mid of ["0", "-1", "9223372036854775808"]) {
      expect(contracts.BilibiliFollowerMonitorV2Schema.safeParse({ ...monitor, mid }).success).toBe(false)
      expect(contracts.BilibiliFollowerCollectResultV2Schema.safeParse({ ...collect, mid }).success).toBe(false)
      expect(contracts.AddBilibiliFollowerMonitorInputV2Schema.safeParse({ mid }).success).toBe(false)
      expect(contracts.BilibiliFollowerFetchRequestV2Schema.safeParse({ mid, taskId: "task", attempt: 1, leaseId: "lease" }).success).toBe(false)
    }
    expect(contracts.AddBilibiliFollowerMonitorInputV2Schema.parse({ mid: "9223372036854775807" }))
      .toEqual({ mid: "9223372036854775807" })
  })
  it("rejects numeric and noncanonical v2 counts", () => {
    expect(contracts).toHaveProperty("BilibiliFollowerPointV2Schema")
    for (const followerCount of [1, "01", "-0", "9223372036854775808"]) {
      expect(contracts.BilibiliFollowerPointV2Schema.safeParse({ ...point, followerCount }).success).toBe(false)
    }
  })
  it("preserves missing counts, numeric growth and strict response keys", () => {
    expect(contracts).toHaveProperty("BilibiliFollowerMonitorV2Schema")
    const { currentFollowerCount, followingCount, deltaSincePrevious, ...emptyMonitor } = monitor
    expect(contracts.BilibiliFollowerMonitorV2Schema.parse(emptyMonitor)).toEqual(emptyMonitor)
    expect(contracts.BilibiliFollowerMonitorV2Schema.safeParse({ ...monitor, unexpected: true }).success).toBe(false)
    expect(contracts.BilibiliFollowerMonitorV2Schema.safeParse({ ...monitor, growthRateSincePrevious: "0.5" }).success).toBe(false)
    const result = contracts.BilibiliFollowerMonitorV2Schema.parse({ ...monitor, growthRateSincePrevious: -0 })
    expect(Object.is(result.growthRateSincePrevious, -0)).toBe(true)
  })
  it("keeps v1 safe numeric monitor projection exact including nested history", () => {
    expect(contracts).toHaveProperty("followerMonitorToV1")
    const exact = { ...monitor, mid: "2", currentFollowerCount: "100", followingCount: "3", deltaSincePrevious: "-1",
      recentTrend: [{ ...point, followerCount: "100", followingCount: "3" }] }
    expect(contracts.followerMonitorToV1(contracts.BilibiliFollowerMonitorV2Schema.parse(exact)))
      .toEqual({ ...exact, currentFollowerCount: 100, followingCount: 3, deltaSincePrevious: -1,
        recentTrend: [{ ...point, followerCount: 100, followingCount: 3 }] })
  })
  it("projects v1 snapshot, collect, trend and list without changing their other fields", () => {
    expect(contracts).toHaveProperty("followerSnapshotToV1")
    const safeSnapshot = { ...snapshot, mid: "2", followerCount: "100", followingCount: "3" }
    expect(contracts.followerSnapshotToV1(contracts.BilibiliFollowerFetchedSnapshotV2Schema.parse(safeSnapshot)))
      .toEqual({ ...safeSnapshot, followerCount: 100, followingCount: 3 })
    expect(contracts.followerCollectResultToV1(contracts.BilibiliFollowerCollectResultV2Schema.parse({ ...collect, followerCount: "100" })))
      .toEqual({ ...collect, followerCount: 100 })
    const safeMonitor = contracts.BilibiliFollowerMonitorV2Schema.parse({ ...monitor, mid: "2", currentFollowerCount: "100", followingCount: "3", recentTrend: [] })
    const trend = { user: safeMonitor, points: [{ ...point, followerCount: "100", followingCount: "3" }] }
    expect(contracts.followerTrendToV1(trend).points[0]?.followerCount).toBe(100)
    expect(contracts.followerMonitorListToV1({ items: [safeMonitor], total: 1, snapshotAt: timestamp }).items[0]?.currentFollowerCount).toBe(100)
  })
  it("preserves omitted optional values through v1 collect projection", () => {
    expect(contracts).toHaveProperty("followerCollectResultToV1")
    const { followerCount, ...withoutCount } = collect
    expect(contracts.followerCollectResultToV1(contracts.BilibiliFollowerCollectResultV2Schema.parse(withoutCount))).toEqual(withoutCount)
  })
  it("fails v1 projection explicitly for unsafe values and retains legacy nonnegative constraints", () => {
    expect(contracts).toHaveProperty("followerMonitorToV1")
    expect(() => contracts.followerMonitorToV1(contracts.BilibiliFollowerMonitorV2Schema.parse(monitor)))
      .toThrow("LONG64_LEGACY_PRECISION_UNSUPPORTED")
    expect(() => contracts.followerCollectResultToV1(contracts.BilibiliFollowerCollectResultV2Schema.parse({ ...collect, followerCount: "-1" }))).toThrow()
    expect(() => contracts.followerSnapshotToV1(contracts.BilibiliFollowerFetchedSnapshotV2Schema.parse({ ...snapshot, mid: "2", followerCount: "-1", followingCount: "3" }))).toThrow()
  })
  it("retains the original v1 schema and numeric output", () => {
    expect(contracts.BilibiliFollowerPointSchema.parse({ ...point, followerCount: 100, followingCount: 3 }))
      .toEqual({ ...point, followerCount: 100, followingCount: 3 })
    expect(contracts.BilibiliFollowerPointSchema.safeParse(point).success).toBe(false)
  })
  it("publishes a standalone portable v2 schema with the full result surface", () => {
    const path = new URL("../schemas/bilibili-follower.v2.schema.json", import.meta.url)
    expect(existsSync(path)).toBe(true)
    const document = JSON.parse(readFileSync(path, "utf8")) as { $id: string; $defs: Record<string, { type?: string; pattern?: string }> }
    expect(document.$id).toBe("https://bilimonitor.local/schemas/bilibili-follower.v2.schema.json")
    for (const name of ["BilibiliFollowerProfileV2", "BilibiliFollowerPointV2", "BilibiliFollowerMonitorV2", "BilibiliFollowerMonitorListV2",
      "BilibiliFollowerTrendV2", "BilibiliFollowerTrendListV2", "BilibiliFollowerCollectResultV2", "BilibiliFollowerFetchedSnapshotV2",
      "BilibiliFollowerFetchRequestV2", "AddBilibiliFollowerMonitorInputV2"]) expect(document.$defs).toHaveProperty(name)
    const fixtures = JSON.parse(readFileSync(new URL("../fixtures/follower-long64-canonical.json", import.meta.url), "utf8")) as Array<{ value: unknown; canonical: boolean; positive: boolean }>
    const signed = document.$defs.JavaLongString, positive = document.$defs.PositiveJavaLongString
    expect(signed?.type).toBe("string")
    expect(positive?.type).toBe("string")
    for (const fixture of fixtures) {
      expect(typeof fixture.value === "string" && new RegExp(signed!.pattern!).test(fixture.value)).toBe(fixture.canonical)
      expect(typeof fixture.value === "string" && new RegExp(positive!.pattern!).test(fixture.value)).toBe(fixture.positive)
    }
  })
})
