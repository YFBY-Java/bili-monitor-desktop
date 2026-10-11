import { createHash, randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalCoreRuntime } from "./local-core-runtime"
import { buildSharedMaterialsWorker } from "./__fixtures__/build-shared-materials-worker"

describe("original rank HTTP settings through actual Core and Python", () => {
  let directory: string
  let core: LocalCoreRuntime | undefined
  afterEach(async () => {
    await core?.stop(); core = undefined; vi.unstubAllEnvs()
    if (directory) {
      const target = resolve(directory)
      if (!/^D:\\/i.test(target) || dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("bmd-rank-http-config-")) {
        throw new Error("Unexpected rank HTTP fixture cleanup path.")
      }
      await rm(target, { recursive: true, force: true })
    }
  })
  it("preserves original rank Long64 and int32 values through the actual worker and SQLite", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 3, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "16" })
    const samples: Record<string, { expected: Record<string, unknown> }> = JSON.parse(await readFile(
      resolve(process.cwd(), "../contracts/fixtures/rank-long64.json"), "utf8"))
    const result = await core.refreshBilibiliLiveRanksV2({ roomMonitorId: room.id, types: ["guard_weekly", "contribution_rank"] })
    expect(result).toMatchObject({ successCount: 2, errors: [],
      summary: { audienceCount: "-2", guardCount: "9223372036854775807" } })
    for (const [name, type] of [["guard", "guard_weekly"], ["audience", "online_rank"]] as const) {
      const snapshot = core.getLatestBilibiliLiveRankV2({ roomMonitorId: room.id, type })
      expect({ totalCount: snapshot.totalCount, countText: snapshot.countText, entries: snapshot.entries }).toEqual(samples[name]!.expected)
    }
    expect(() => core!.getBilibiliLiveRankSummary(room.id)).toThrow(/旧榜单接口/)
    const rows = (sql: string) => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { const statement = reader.prepare(sql); statement.setReadBigInts(true); return statement.all() } finally { reader.close() }
    }
    expect(rows("SELECT total_count, typeof(total_count) AS storage_type FROM bilibili_live_rank_snapshot ORDER BY rowid"))
      .toEqual([{ total_count: -2n, storage_type: "integer" }, { total_count: 9223372036854775807n, storage_type: "integer" }])
    expect(rows("SELECT user_uid, rank_no, score, typeof(score) AS storage_type FROM bilibili_live_rank_entry ORDER BY rowid"))
      .toEqual([{ user_uid: "-9223372036854775808", rank_no: 1n, score: 9007199254740993n, storage_type: "integer" },
        { user_uid: null, rank_no: 12n, score: null, storage_type: "null" },
        { user_uid: "0", rank_no: -2147483648n, score: 9223372036854775807n, storage_type: "integer" }])
    const logs = rows("SELECT * FROM bilibili_api_call ORDER BY rowid")
    const rankLogs = logs.filter(row => /(?:rank|guardTab)\//.test(String(row.endpoint_key)))
    expect(rankLogs.map(row => row.error_type)).toEqual([null, null])
    const artifacts = rows("SELECT * FROM object_artifact ORDER BY rowid")
    for (const log of rankLogs) {
      const artifact = artifacts.find(row => row.object_id === log.evidence_object_id)!
      const bytes = await readFile(resolve(directory, String(artifact.relative_path)))
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256)
      expect(bytes.toString("utf8")).toMatch(/922337203685477580[78]/)
    }
    const saved = core.getBilibiliLiveRankSummaryV2(room.id)
    await core.stop(); core = undefined
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32) })
    expect(core.getBilibiliLiveRankSummaryV2(room.id)).toEqual(saved)
    const archivedRoom = await core.addBilibiliLiveRoom({ uid: "17" })
    const archived = await core.refreshBilibiliLiveRanksV2({ roomMonitorId: archivedRoom.id, types: ["guard_weekly", "contribution_rank"] })
    expect(archived).toMatchObject({ successCount: 2, errors: [] })
    const facts: Record<string, { facts: Array<Record<string, unknown>> }> = JSON.parse(await readFile(
      resolve(process.cwd(), "../contracts/fixtures/rank-entry-facts.json"), "utf8"))
    const readFacts = () => rows(`SELECT s.rank_family, CAST(e.medal_ruid AS TEXT) AS medalRuid,
      e.medal_is_light AS medalIsLight, e.raw_entry_json AS rawEntryJson,
      typeof(e.medal_ruid) AS medalStorageType FROM bilibili_live_rank_entry e
      JOIN bilibili_live_rank_snapshot s ON s.snapshot_id=e.snapshot_id
      WHERE e.monitor_id='${archivedRoom.id}' ORDER BY e.rowid`)
    const storedFacts = readFacts()
    for (const [name, family] of [["audience", "AUDIENCE"], ["guard", "GUARD"]] as const) {
      expect(storedFacts.filter(row => row.rank_family === family)).toEqual(facts[name]!.facts.map(fact => ({
        rank_family: family, medalRuid: fact.medalRuid ?? null,
        medalIsLight: fact.medalIsLight === undefined ? null : BigInt(Number(fact.medalIsLight)),
        rawEntryJson: fact.rawEntryJson, medalStorageType: fact.medalRuid === undefined ? "null" : "integer"
      })))
      for (const entry of archived.summary.snapshots.find(snapshot => snapshot.rankFamily === family)!.entries) {
        expect(entry).not.toHaveProperty("medalRuid")
        expect(entry).not.toHaveProperty("medalIsLight")
        expect(entry).not.toHaveProperty("rawEntryJson")
      }
    }
    await core.stop(); core = undefined
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32) })
    expect(readFacts()).toEqual(storedFacts)
  }, 20_000)
  it("keeps primary fallback and guard field selection through actual rank storage", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 3, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const samples: Record<string, { body: object; expected: Record<string, unknown> }> = JSON.parse(await readFile(
      resolve(process.cwd(), "../contracts/fixtures/rank-response-fields.json"), "utf8"))
    const room = await core.addBilibiliLiveRoom({ uid: "15" })
    const rows = (table: string) => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true); return query.all() } finally { reader.close() }
    }
    for (const [name, type] of [["audiencePresent", "daily_rank"], ["audienceMissing", "daily_rank"],
      ["fallback", "contribution_rank"], ["guard", "guard_weekly"]] as const) {
      const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: [type] })
      expect(result).toMatchObject({ successCount: 1, errors: [] })
      const snapshot = core.getLatestBilibiliLiveRank({ roomMonitorId: room.id, type: type === "contribution_rank" ? "online_rank" : type,
        ...(type === "contribution_rank" ? { rankSwitch: "contribution_rank" } : {}) })
      const fields = ["totalCount", "countText", "valueText", "remindMsg", "entries"]
      expect(Object.fromEntries(fields.filter(key => key in snapshot).map(key => [key, snapshot[key as keyof typeof snapshot]])))
        .toEqual(samples[name]!.expected)
      const log = rows("bilibili_api_call").at(-1)!
      expect(log).toMatchObject({ status_code: 200n, error_type: null, attempt: name === "fallback" ? 2n : 1n })
      const artifact = rows("object_artifact").find(item => item.object_id === log.evidence_object_id)!
      const bytes = await readFile(resolve(directory, String(artifact.relative_path)))
      expect(JSON.parse(bytes.toString("utf8"))).toEqual(samples[name]!.body)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256)
    }
    const committed = Object.fromEntries(["bilibili_api_call", "bilibili_live_rank_snapshot", "bilibili_live_rank_entry", "object_artifact"]
      .map(table => [table, rows(table)]))
    const logs = committed.bilibili_api_call!
    expect(logs.filter(item => item.endpoint_key === "xlive/general-interface/v1/rank/getOnlineGoldRank")).toHaveLength(1)
    expect(logs.filter(item => item.error_type === "BILIBILI_AUTH_EXPIRED")).toHaveLength(1)
    await core.stop(); core = undefined
    expect(Object.fromEntries(Object.keys(committed).map(table => [table, rows(table)]))).toEqual(committed)
  }, 20_000)
  it("keeps original rank API code coercion and failure categories through the actual worker", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 3, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const samples: Array<{ success: boolean; error?: { code: string; message: string; retryable: boolean; biliCode: number } }> = JSON.parse(
      await readFile(resolve(process.cwd(), "../contracts/fixtures/rank-api-responses.json"), "utf8"))
    const room = await core.addBilibiliLiveRoom({ uid: "14" })
    const saved = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(saved).toMatchObject({ successCount: 1, errors: [] })
    expect(saved.summary.snapshots[0]!.entries[0]!.displayName).toBe("original viewer")
    const rows = (table: string) => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true); return query.all() } finally { reader.close() }
    }
    const beforeLogs = rows("bilibili_api_call")
    const artifacts = rows("object_artifact")
    const snapshots = rows("bilibili_live_rank_snapshot")
    const entries = rows("bilibili_live_rank_entry")
    const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id,
      types: ["guard_weekly", "guard_monthly"], maxPages: 4 })
    expect(result).toMatchObject({ successCount: 0,
      errors: [`大航海周榜：${samples[1]!.error!.message}`, `大航海月榜：${samples[2]!.error!.message}`],
      summary: saved.summary })
    const finalLogs = rows("bilibili_api_call")
    expect(finalLogs).toHaveLength(beforeLogs.length + 2)
    for (const [index, log] of finalLogs.slice(beforeLogs.length).entries()) {
      const expected = samples[index + 1]!.error!
      expect(log).toMatchObject({ endpoint_key: "xlive/app-room/v2/guardTab/topListNew", status_code: 200n,
        error_type: expected.code, retryable: expected.retryable ? 1n : 0n, attempt: 1n, evidence_object_id: null })
      expect(JSON.parse(String(log.response_meta_json))).toEqual({ success: false, message: expected.message, biliCode: expected.biliCode })
    }
    expect(rows("object_artifact")).toEqual(artifacts)
    expect(rows("bilibili_live_rank_snapshot")).toEqual(snapshots)
    expect(rows("bilibili_live_rank_entry")).toEqual(entries)
    await core.stop(); core = undefined
    expect(rows("bilibili_api_call")).toEqual(finalLogs)
    expect(rows("bilibili_live_rank_snapshot")).toEqual(snapshots)
    expect(rows("bilibili_live_rank_entry")).toEqual(entries)
  }, 20_000)
  it("stores rank text at the original SQL boundary without discarding successful fetch logs", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 3, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const samples: Record<string, { body: object; stored: object }> = JSON.parse(await readFile(
      resolve(process.cwd(), "../contracts/fixtures/rank-storage-text.json"), "utf8"))
    const room = await core.addBilibiliLiveRoom({ uid: "13" })
    const rows = (table: string) => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try {
        const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true)
        return query.all()
      } finally { reader.close() }
    }
    for (const [sample, type] of [["guard", "guard_weekly"], ["audience", "contribution_rank"]] as const) {
      const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: [type] })
      expect(result).toMatchObject({ successCount: 1, errors: [] })
      const snapshot = result.summary.snapshots.find(item => item.rankFamily === (sample === "guard" ? "GUARD" : "AUDIENCE"))!
      expect(snapshot).toMatchObject(samples[sample]!.stored)
      const log = rows("bilibili_api_call").at(-1)!
      expect(log).toMatchObject({ status_code: 200n, error_type: null, attempt: 1n })
      const artifact = rows("object_artifact").find(item => item.object_id === log.evidence_object_id)!
      const bytes = await readFile(resolve(directory, String(artifact.relative_path)))
      expect(JSON.parse(bytes.toString("utf8"))).toEqual(samples[sample]!.body)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256)
    }
    const saved = core.getBilibiliLiveRankSummary(room.id)
    const snapshots = rows("bilibili_live_rank_snapshot")
    const entries = rows("bilibili_live_rank_entry")
    const outbox = rows("outbox")
    const logs = rows("bilibili_api_call")
    await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id,
      types: ["guard_weekly", "guard_monthly"], maxPages: 2 }))
      .rejects.toThrow(/Rank count_text exceeds VARCHAR\(64\)/)
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(saved)
    expect(rows("bilibili_live_rank_snapshot")).toEqual(snapshots)
    expect(rows("bilibili_live_rank_entry")).toEqual(entries)
    expect(rows("outbox")).toEqual(outbox)
    const finalLogs = rows("bilibili_api_call")
    expect(finalLogs).toHaveLength(logs.length + 1)
    expect(finalLogs.at(-1)).toMatchObject({ status_code: 200n, error_type: null, attempt: 1n })
    const failedArtifact = rows("object_artifact").find(item => item.object_id === finalLogs.at(-1)!.evidence_object_id)!
    const failedBytes = await readFile(resolve(directory, String(failedArtifact.relative_path)))
    expect(JSON.parse(failedBytes.toString("utf8"))).toEqual(samples.failed!.body)
    await core.stop(); core = undefined
    expect(rows("bilibili_live_rank_snapshot")).toEqual(snapshots)
    expect(rows("bilibili_live_rank_entry")).toEqual(entries)
    expect(rows("bilibili_api_call")).toEqual(finalLogs)
    expect(await readFile(resolve(directory, String(failedArtifact.relative_path)))).toEqual(failedBytes)
  }, 20_000)
  it("preserves original rank write stages when snapshots or entries fail", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 3, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "12" })
    const tables = ["bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event",
      "bilibili_live_rank_snapshot", "bilibili_live_rank_entry", "outbox"]
    const rows = (names = tables) => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { return Object.fromEntries(names.map(table => {
        const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true)
        return [table, query.all()]
      })) } finally { reader.close() }
    }
    const saved = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(saved).toMatchObject({ successCount: 1, errors: [] })
    const firstId = saved.summary.snapshots[0]!.id
    const apiBefore = rows(["bilibili_api_call"]).bilibili_api_call!
    await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id,
      types: ["guard_weekly", "guard_monthly"], maxPages: 4 }))
      .rejects.toThrow(/rank snapshot JSONB input rejected: NUL/)
    const retained = core.getBilibiliLiveRankSummary(room.id)
    expect(retained.snapshots).toHaveLength(1)
    expect(retained.snapshots[0]).toMatchObject({ pageNo: 1, rankType: "guard_weekly", totalCount: 12 })
    expect(retained.snapshots[0]!.entries.map(entry => entry.userUid)).toEqual(["91", "92"])
    const afterRaw = rows(["bilibili_api_call"]).bilibili_api_call!
    const newLogs = afterRaw.slice(apiBefore.length)
    expect(newLogs).toHaveLength(2)
    expect(newLogs).toMatchObject(Array.from({ length: 2 }, () => ({
      endpoint_key: "xlive/app-room/v2/guardTab/topListNew", error_type: null,
      status_code: 200n, attempt: 1n
    })))
    const objects = rows(["object_artifact"]).object_artifact!
    const failedObject = objects.find(item => item.object_id === newLogs[1]!.evidence_object_id)!
    const bytes = await readFile(resolve(directory, String(failedObject.relative_path)))
    expect(bytes.toString("utf8")).toContain('"old":"\\u0000","old":"valid"')
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(failedObject.sha256)
    const recovered = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id,
      types: ["guard_weekly"], maxPages: 2 })
    expect(recovered).toMatchObject({ successCount: 2, errors: [] })
    const beforeSql = rows()
    const beforeSqlLogs = rows(["bilibili_api_call"]).bilibili_api_call!
    const writer = new DatabaseSync(resolve(directory, "control.db"))
    try {
      writer.exec("CREATE TRIGGER synthetic_rank_entry_failure BEFORE INSERT ON bilibili_live_rank_entry WHEN NEW.user_uid = '92' BEGIN SELECT RAISE(ABORT, 'synthetic rank entry failure'); END")
      await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id,
        types: ["guard_weekly", "guard_monthly"], maxPages: 2 }))
        .rejects.toThrow(/synthetic rank entry failure/)
    } finally { writer.exec("DROP TRIGGER synthetic_rank_entry_failure"); writer.close() }
    const latest = core.getLatestBilibiliLiveRank({ roomMonitorId: room.id, type: "guard_weekly" })
    expect(latest).toMatchObject({ pageNo: 1, totalCount: 14, entries: [] })
    expect(rows().bilibili_live_room_monitor).toEqual(beforeSql.bilibili_live_room_monitor)
    expect(rows().bilibili_live_status_event).toEqual(beforeSql.bilibili_live_status_event)
    expect(rows().outbox).toEqual(beforeSql.outbox)
    const finalLogs = rows(["bilibili_api_call"]).bilibili_api_call!
    expect(finalLogs).toHaveLength(beforeSqlLogs.length + 1)
    expect(finalLogs.at(-1)).toMatchObject({ error_type: null, attempt: 1n })
    const finalRows = rows()
    await core.stop(); core = undefined
    expect(rows()).toEqual(finalRows)
    expect(rows(["bilibili_api_call"]).bilibili_api_call).toEqual(finalLogs)
    expect(await readFile(resolve(directory, String(failedObject.relative_path)))).toEqual(bytes)
    // Snapshot replacement retains its identity if both writes land in the same minute.
    if (saved.summary.snapshots[0]!.capturedAt.slice(0, 16) === latest.capturedAt.slice(0, 16)) {
      expect(latest.id).toBe(firstId)
    }
  }, 20_000)
  it.each([false, true])("applies disk/environment settings to audience, WBI, guard and fallback (env=%s)", async useEnvironment => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    const http = { connectTimeoutMs: 1250, readTimeoutMs: 0,
      userAgent: "Fixture rank configuration/2", referer: "https://live.bilibili.com/configured-rank" }
    const original = JSON.stringify({ enabled: false, maxAttempts: 1, ...(!useEnvironment ? http : {}) })
    await writeFile(path, original, "utf8")
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}', "utf8")
    const variables = { CONNECT_TIMEOUT_MS: "1250", READ_TIMEOUT_MS: "0", USER_AGENT: http.userAgent, REFERER: http.referer }
    for (const [key, value] of Object.entries(variables)) {
      vi.stubEnv(`SOCIAL_MONITOR_BILIBILI_LIVE_${key}`, useEnvironment ? value : undefined)
    }
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["contribution_rank", "guard_weekly"] })
    expect(result).toMatchObject({ successCount: 2, errors: [] })
    expect(result.summary.snapshots.map(item => item.entries[0]?.displayName))
      .toEqual(["合成配置榜单观众", "合成配置榜单观众"])
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(result.summary)
    const fallbackRoom = await core.addBilibiliLiveRoom({ uid: "3" })
    const fallback = await core.refreshBilibiliLiveRanks({ roomMonitorId: fallbackRoom.id, types: ["contribution_rank"] })
    expect(fallback).toMatchObject({ successCount: 1, errors: [] })
    expect(fallback.summary.snapshots[0]?.sourceEndpoint).toBe("xlive/general-interface/v1/rank/getOnlineGoldRank")
    expect(await readFile(path, "utf8")).toBe(original)
  }, 20_000)

  it("keeps rank String data and internal header errors without fallback or persisted failure", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 1, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture rank configuration/2",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "4" })
    const result = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(result).toMatchObject({ successCount: 1, errors: [] })
    expect(result.summary.snapshots[0]?.entries[0]?.displayName).toBe(" café viewer ")
    const tables = ["bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event",
      "bilibili_live_rank_snapshot", "bilibili_live_rank_entry", "bilibili_api_call", "object_artifact", "outbox"]
    const rows = () => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { return Object.fromEntries(tables.map(table => { const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true); return [table, query.all()] })) } finally { reader.close() }
    }
    const before = rows()
    const artifacts = before.object_artifact!
    const bytes = await Promise.all(artifacts.map(row => readFile(resolve(directory, String(row.relative_path)))))
    await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["contribution_rank"] }))
      .rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false,
        message: "INTERNAL_ERROR: Unable to convert Bilibili response content type or charset." })
    expect(rows()).toEqual(before)
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(result.summary)
    const guardAgain = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["guard_weekly"] })
    expect(guardAgain).toMatchObject({ successCount: 1, errors: [] })
    const committed = rows()
    await core.stop(); core = undefined
    expect(rows()).toEqual(committed)
    expect(await Promise.all(artifacts.map(row => readFile(resolve(directory, String(row.relative_path)))))).toEqual(bytes)
  }, 20_000)

  it("propagates shared WBI conversion errors without changing data or poisoning its cache", async () => {
    if (!/^D:\\/i.test(resolve(tmpdir()))) throw new Error("Rank HTTP fixtures require a D-drive temp directory")
    directory = await mkdtemp(resolve(tmpdir(), "bmd-rank-http-config-"))
    await mkdir(resolve(directory, "config"))
    await writeFile(resolve(directory, "config", "bilibili-live-collection.json"), JSON.stringify({ enabled: false,
      maxAttempts: 1, connectTimeoutMs: 1250, readTimeoutMs: 0, userAgent: "Fixture WBI response String/1",
      referer: "https://live.bilibili.com/configured-rank" }))
    await writeFile(resolve(directory, "config", "bilibili-live-danmaku.json"), '{"wbiCacheSeconds":-8}')
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/live_rank_http_configuration"))
    vi.stubEnv("BMD_NODE_EXE", process.execPath)
    vi.stubEnv("BMD_REALTIME_WORKER_ENTRY", await buildSharedMaterialsWorker(directory))
    core = await LocalCoreRuntime.start({ dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: randomBytes(32) })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const tables = ["bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event",
      "bilibili_live_rank_snapshot", "bilibili_live_rank_entry", "bilibili_api_call", "object_artifact", "outbox"]
    const rows = () => {
      const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { return Object.fromEntries(tables.map(table => { const query = reader.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
        query.setReadBigInts(true); return [table, query.all()] })) } finally { reader.close() }
    }
    const before = rows()
    await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["contribution_rank"] }))
      .rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false,
        message: "INTERNAL_ERROR: Unable to convert Bilibili response content type or charset." })
    expect(rows()).toEqual(before)
    const httpFailure = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"] })
    expect(httpFailure).toMatchObject({ successCount: 0,
      errors: ["房间观众日榜：Bilibili WBI key request failed with HTTP 403"] })
    const failure = rows().bilibili_api_call!.at(-1)!
    expect(failure).toMatchObject({ endpoint_key: "x/web-interface/nav",
      error_type: "BILIBILI_UNKNOWN_ERROR", status_code: 403n, retryable: 1n })
    const good = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"] })
    expect(good).toMatchObject({ successCount: 1, errors: [] })
    expect(good.summary.snapshots[0]?.entries[0]?.displayName).toBe("合成配置榜单观众")
    const committed = rows()
    const bytes = await Promise.all(committed.object_artifact!.map(row => readFile(resolve(directory, String(row.relative_path)))))
    await expect(core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"], force: true }))
      .rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
    expect(rows()).toEqual(committed)
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(good.summary)
    const apiFailure = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"], force: true })
    expect(apiFailure).toMatchObject({ successCount: 0,
      errors: ["房间观众日榜：Bilibili nav API returned code -352"] })
    const apiLog = rows().bilibili_api_call!.at(-1)!
    expect(apiLog).toMatchObject({ endpoint_key: "x/web-interface/nav", error_type: "BILIBILI_UNKNOWN_ERROR",
      status_code: 200n, retryable: 1n })
    expect(JSON.parse(String(apiLog.response_meta_json))).toEqual({ success: false,
      message: "Bilibili nav API returned code -352", biliCode: -352 })
    expect(core.getBilibiliLiveRankSummary(room.id)).toEqual(good.summary)
    const parseFailure = await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"], force: true })
    expect(parseFailure).toMatchObject({ successCount: 0 })
    expect(rows().bilibili_api_call!.at(-1)).toMatchObject({ endpoint_key: "x/web-interface/nav",
      error_type: "BILIBILI_PARSE_ERROR", status_code: 200n, retryable: 1n })
    expect(await core.refreshBilibiliLiveRanks({ roomMonitorId: room.id, types: ["daily_rank"] }))
      .toMatchObject({ successCount: 1, errors: [] })
    const finalRows = rows()
    await core.stop(); core = undefined
    expect(rows()).toEqual(finalRows)
    expect(await Promise.all(committed.object_artifact!.map(row => readFile(resolve(directory, String(row.relative_path)))))).toEqual(bytes)
  }, 20_000)
})
