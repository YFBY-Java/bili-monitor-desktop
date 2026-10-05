import { createHash } from "node:crypto"
import type { ChildProcess } from "node:child_process"
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createRuntimeEnvelope } from "@bmd/contracts"
import { BilibiliFollowerWorkerSource, LocalCoreRuntime, NdjsonPythonWorkerTransport } from "@bmd/core-runtime"
import { expect, it, vi } from "vitest"
import { createDesktopBridge } from "../preload/bridge"
import { dispatchBusinessRequest } from "./core-request-router"

// Observe real spawned processes, without replacing Worker execution or HTTP behavior.
const processProbe = vi.hoisted(() => ({ children: [] as ChildProcess[] }))
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    const child = actual.spawn(...args)
    processProbe.children.push(child)
    return child
  } }
})

async function fixture(workerFixture = "follower_long64") {
  const childOffset = processProbe.children.length
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-long64-worker-bridge-"))
  const transport = new NdjsonPythonWorkerTransport({ pythonExecutable: process.env.BMD_PYTHON_EXE!,
    role: "crawler", dataDirectory: directory,
    pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures", workerFixture) })
  const source = new BilibiliFollowerWorkerSource(transport)
  const runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture", schedulerEnabled: false,
    now: () => new Date("2026-10-05T12:01:00Z"), followerSource: source })
  let sequence = 0
  const bridge = createDesktopBridge(async (channel, payload) => {
    const id = `long64-${sequence++}`
    const request = createRuntimeEnvelope({ id, type: channel.replace(":", "."), timestamp: "2026-10-05T12:01:00Z",
      correlationId: id, traceId: id, payload })
    const response = await dispatchBusinessRequest(runtime, JSON.parse(JSON.stringify(request)))
    return JSON.parse(JSON.stringify(response.payload))
  })
  function inspect(sql: string) {
    const reader = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try { const statement = reader.prepare(sql); statement.setReadBigInts(true); return statement.all() }
    finally { reader.close() }
  }
  return { directory, runtime, source, transport, bridge, inspect,
    children: () => processProbe.children.slice(childOffset),
    close: async () => { await runtime.stop(); await rm(directory, { recursive: true, force: true }) } }
}

it.each(["add", "refresh"] as const)("cancels a pending v2 %s before closing SQLite and never writes a late snapshot", async operation => {
  const f = await fixture("live_http_wait")
  try {
    const user = operation === "refresh" ? await f.bridge.bilibiliFollowersV2.add({ mid: "2" }) : undefined
    const started = resolve(f.directory, "http-started")
    if (user) await unlink(started)
    const before = f.inspect("SELECT monitor_id, mid, current_follower_count FROM bilibili_follower_monitor")
    const historyBefore = f.inspect("SELECT snapshot_id, follower_count FROM bilibili_follower_snapshot")
    const artifactsBefore = f.inspect("SELECT object_id FROM object_artifact")
    const pending = (user ? f.bridge.bilibiliFollowersV2.refresh({ userId: user.id })
      : f.bridge.bilibiliFollowersV2.add({ mid: "3" })).catch((error: unknown) => error)
    await vi.waitFor(async () => expect(await readFile(started, "utf8")).toBe("started"), { timeout: 10000 })
    await f.runtime.stop()
    expect(await pending).toBeInstanceOf(Error)
    // Core shutdown deliberately force-terminates its Worker. Unlike parent-pipe
    // loss, this does not run Python finally blocks: prove actual process exit.
    expect(f.children()).toHaveLength(1)
    expect(f.children().every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
    expect(f.inspect("SELECT monitor_id, mid, current_follower_count FROM bilibili_follower_monitor")).toEqual(before)
    expect(f.inspect("SELECT snapshot_id, follower_count FROM bilibili_follower_snapshot")).toEqual(historyBefore)
    expect(f.inspect("SELECT object_id FROM object_artifact")).toEqual(artifactsBefore)
  } finally { await f.close() }
}, 25000)

it.each([
  ["242", "9007199254740992", "9007199254740993", "1"],
  ["243", "-9223372036854775808", "9223372036854775807", "-1"],
  ["244", "0", "-1", "-1"],
  ["245", "9223372036854775807", "-9223372036854775808", "1"],
  ["246", "9223372036854775807", "-9223372036854775808", "1"]
])("carries original Long conversion %s through real Python HTTP/CAS/stdio, Core SQLite and typed Preload", async (mid, first, last, delta) => {
  const f = await fixture()
  try {
    const user = await f.bridge.bilibiliFollowersV2.add({ mid })
    expect(user.currentFollowerCount).toBe(first)
    expect(user.followingCount).toBe("-9223372036854775808")
    expect((await f.bridge.bilibiliFollowersV2.refresh({ userId: user.id })).followerCount).toBe(last)
    const trend = await f.bridge.bilibiliFollowersV2.trend({ userId: user.id })
    expect(trend.points.map(point => point.followerCount)).toEqual([first, last])
    expect(trend.user.deltaSincePrevious).toBe(delta)
    expect(f.inspect("SELECT follower_count FROM bilibili_follower_snapshot ORDER BY rowid")
      .map(row => row.follower_count)).toEqual([BigInt(first), BigInt(last)])
    const events = f.inspect("SELECT topic, envelope_json FROM outbox WHERE topic='bilibili.follower.snapshot-collected.v2' ORDER BY rowid")
    expect(events.map(row => JSON.parse(String(row.envelope_json)).payload.followerCount)).toEqual([first, last])
    const artifacts = f.inspect("SELECT sha256, relative_path FROM object_artifact")
    expect(artifacts).toHaveLength(2)
    for (const artifact of artifacts) {
      const raw = await readFile(resolve(f.directory, String(artifact.relative_path)))
      expect(createHash("sha256").update(raw).digest("hex")).toBe(artifact.sha256)
    }
    // Unsafe/negative counters fail only at the old compatibility exit; the Worker stays usable.
    expect(() => f.runtime.listBilibiliFollowerMonitors()).toThrow(/LONG64_LEGACY_PRECISION_UNSUPPORTED/)
    expect(await f.source.fetchProfile({ mid: "249", taskId: "after", attempt: 1, leaseId: "after" }))
      .toEqual({ mid: "249", nickname: "合成精确链路用户" })
    expect(await f.transport.request("worker.ping", {})).toEqual({ role: "crawler", state: "ready" })
    expect(f.children()).toHaveLength(1)
  } finally { await f.close() }
}, 20_000)

it("preserves monitor identity, stores signed response MID and uses original relation fallback through the complete v2 bridge", async () => {
  const f = await fixture()
  try {
    const user = await f.bridge.bilibiliFollowersV2.add({ mid: "241" })
    expect(await f.bridge.bilibiliFollowersV2.refresh({ userId: user.id }))
      .toMatchObject({ mid: "241", success: true, followerCount: "-9223372036854775808" })
    expect(await f.bridge.bilibiliFollowersV2.refresh({ userId: user.id }))
      .toMatchObject({ mid: "241", success: true, followerCount: "9007199254740993", sourceEndpoint: "x/relation/stat" })
    expect(f.inspect("SELECT mid, current_follower_count, following_count FROM bilibili_follower_monitor"))
      .toMatchObject([{ mid: "241", current_follower_count: 9007199254740993n, following_count: null }])
    expect(f.inspect("SELECT mid FROM bilibili_follower_snapshot ORDER BY rowid").map(row => row.mid))
      .toEqual(["241", "0", "-9223372036854775808"])
    expect(f.inspect("SELECT endpoint_key, error_type FROM bilibili_api_call ORDER BY rowid"))
      .toMatchObject([{ endpoint_key: "x/web-interface/card", error_type: null },
        { endpoint_key: "x/web-interface/card", error_type: null },
        { endpoint_key: "x/web-interface/card", error_type: "BILIBILI_PARSE_ERROR" },
        { endpoint_key: "x/relation/stat", error_type: null }])
    expect(await f.transport.request("worker.ping", {})).toEqual({ role: "crawler", state: "ready" })
  } finally { await f.close() }
}, 20_000)

it("does not mutate history on auth failure and serves a subsequent exact request in the same Worker", async () => {
  const f = await fixture()
  try {
    const user = await f.bridge.bilibiliFollowersV2.add({ mid: "248" })
    await expect(f.bridge.bilibiliFollowersV2.refresh({ userId: user.id })).rejects.toMatchObject({ code: "BILIBILI_AUTH_EXPIRED" })
    expect((await f.bridge.bilibiliFollowersV2.trend({ userId: user.id })).points.map(point => point.followerCount))
      .toEqual(["9007199254740993"])
    expect((await f.bridge.bilibiliFollowersV2.refresh({ userId: user.id })).followerCount).toBe("9007199254740994")
    expect(f.inspect("SELECT COUNT(*) AS count FROM object_artifact")[0]?.count).toBe(2n)
    expect(f.inspect("SELECT COUNT(*) AS count FROM bilibili_api_call")[0]?.count).toBe(3n)
    expect(await f.transport.request("worker.ping", {})).toEqual({ role: "crawler", state: "ready" })
  } finally { await f.close() }
}, 20_000)
