import { createHash } from "node:crypto"
import type { ChildProcess } from "node:child_process"
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, parse, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createRuntimeEnvelope, RuntimeEnvelopeSchema } from "@bmd/contracts"
import { BilibiliFollowerWorkerSource, LocalCoreRuntime, NdjsonPythonWorkerTransport } from "@bmd/core-runtime"
import { expect, it, vi } from "vitest"
import { createDesktopBridge } from "../preload/bridge"
import { dispatchBusinessRequest } from "./core-request-router"

// Observe real spawned processes, without replacing Worker execution or HTTP behavior.
const processProbe = vi.hoisted(() => ({ children: [] as ChildProcess[], observe: undefined as undefined | ((child: ChildProcess, options: import("node:child_process").SpawnOptions | undefined) => void) }))
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    const child = actual.spawn(...args)
    processProbe.children.push(child)
    processProbe.observe?.(child, args[2])
    return child
  } }
})

function assertTemporaryRoot(path: string): void {
  if (!isAbsolute(path) || parse(resolve(path)).root.toLowerCase() !== "d:\\") throw new Error("Fixture TEMP must be absolute on D")
}
function assertTemporaryDescendant(root: string, directory: string): void {
  assertTemporaryRoot(root)
  const descendant = relative(resolve(root), resolve(directory))
  if (!descendant || descendant.startsWith("..") || isAbsolute(descendant)) throw new Error("Fixture cleanup must stay below TEMP")
}
it("rejects unsafe temporary roots and cleanup targets without filesystem operations", () => {
  expect(() => assertTemporaryRoot("C:\\synthetic-temp")).toThrow("absolute on D")
  expect(() => assertTemporaryRoot("relative-temp")).toThrow("absolute on D")
  expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\synthetic-temp")).toThrow("below TEMP")
  expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\sibling")).toThrow("below TEMP")
  expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "C:\\synthetic-child")).toThrow("below TEMP")
  expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\synthetic-temp\\child")).not.toThrow()
})

function createStderrProbe(record: (phase: string, pythonMs?: number) => void, stageLimitReached: () => boolean) {
  let buffer = "", bytes = 0, stages = 0, parsedLines = 0, stopped = false
  const stop = (report = true) => {
    if (stopped) return
    stopped = true; buffer = ""
    if (report) record("stderr:probe-limit")
  }
  return {
    observe(chunk: string | Buffer) {
      if (stopped) return
      if (stageLimitReached()) { stop(); return }
      bytes += Buffer.byteLength(chunk)
      if (bytes > 4096) { stop(); return }
      buffer += String(chunk)
      let newline: number
      while (!stopped && (newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); parsedLines++
        const match = /^BMD_TEST_WAIT:(fixture:enter|fixture:httpx-ready|fixture:patch-ready|replay:enter|marker:write-ok|marker:write-error|stdin:first-read-lookup|stdin:first-read-enter|stdin:first-read-line|stdin:first-read-eof|stdin:first-read-error):(\d+)$/.exec(line)
        if (match) { stages++; record(match[1]!, Number(match[2])) }
        if (stages >= 10 || stageLimitReached()) stop()
      }
    },
    stop,
    state: () => ({ stopped, bufferedBytes: Buffer.byteLength(buffer), receivedBytes: bytes, parsedLines })
  }
}

it("recognizes only the five fixed first-read stages", () => {
  const phases: string[] = []
  const probe = createStderrProbe(phase => phases.push(phase), () => false)
  const allowed = ["stdin:first-read-lookup", "stdin:first-read-enter", "stdin:first-read-line", "stdin:first-read-eof", "stdin:first-read-error"]
  for (const stage of allowed) probe.observe(`BMD_TEST_WAIT:${stage}:12\n`)
  probe.observe("BMD_TEST_WAIT:stdin:first-read-unknown:12\n")
  expect(phases).toEqual(allowed)
})

it("stops diagnostic work and clears buffers at byte, stderr-stage and global-stage bounds", () => {
  for (const boundary of ["bytes", "stderr-stages", "global-stages"] as const) {
    const phases: string[] = []
    let globalLimit = false
    const probe = createStderrProbe(phase => phases.push(phase), () => globalLimit)
    probe.observe("BMD_TEST_WAIT:fixture:enter:0\npartial")
    if (boundary === "bytes") probe.observe("x".repeat(4096))
    else if (boundary === "stderr-stages") probe.observe("\n" + "BMD_TEST_WAIT:replay:enter:1\n".repeat(9))
    else { globalLimit = true; probe.observe("BMD_TEST_WAIT:replay:enter:1\n") }
    const stopped = probe.state()
    expect(stopped.stopped).toBe(true)
    expect(stopped.bufferedBytes).toBe(0)
    expect(phases.filter(phase => phase === "stderr:probe-limit")).toHaveLength(1)
    probe.observe("BMD_TEST_WAIT:marker:write-ok:2\n" + "x".repeat(8192))
    expect(probe.state()).toEqual(stopped)
  }
})

async function fixture(workerFixture = "follower_long64") {
  const childOffset = processProbe.children.length
  const temporaryRoot = resolve(tmpdir())
  assertTemporaryRoot(tmpdir())
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-long64-worker-bridge-"))
  const assertDescendant = () => assertTemporaryDescendant(temporaryRoot, directory)
  assertDescendant()
  const startedAt = performance.now()
  let stopObservers = () => {}
  const stages: { phase: string; ms: number; pythonMs?: number; exitCode?: number }[] = []
  const record = (phase: string, pythonMs?: number, exitCode?: number) => {
    if (stages.length === 39) { stages.push({ phase: "probe-limit", ms: Math.round(performance.now() - startedAt) }); stopObservers(); return }
    if (stages.length < 40) stages.push({ phase, ms: Math.round(performance.now() - startedAt), ...(pythonMs === undefined ? {} : { pythonMs }), ...(exitCode === undefined ? {} : { exitCode }) })
  }
  const safeCode = (error: unknown): string => {
    const code = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined
    return typeof code === "string" && ["EPIPE", "ENOENT", "EACCES", "WORKER_UNRESPONSIVE", "WORKER_CAPABILITY_MISMATCH", "BILIBILI_AUTH_EXPIRED", "BILIBILI_PARSE_ERROR"].includes(code) ? code : "UNCLASSIFIED"
  }
  const cleanups: (() => void)[] = []
  const observing = workerFixture === "live_http_wait"
  const pythonPath = resolve(process.cwd(), "../../workers/python/tests/fixtures", workerFixture)
  const observer = (child: ChildProcess, options: import("node:child_process").SpawnOptions | undefined) => {
    record("child:created")
    record(options?.cwd === pythonPath ? "cwd:match" : "cwd:mismatch")
    record(options?.env?.PYTHONPATH === pythonPath ? "pythonpath:match" : "pythonpath:mismatch")
    record(options?.env?.BMD_DATA_DIR === directory ? "data-dir:match" : "data-dir:mismatch")
    let cleanup = () => {}
    const spawned = () => record("child:os-spawn")
    const exited = (code: number | null) => { record("child:exit", undefined, code ?? undefined); cleanup() }
    const errored = (error: Error) => record(`child:error:${safeCode(error)}`)
    child.on("spawn", spawned); child.on("exit", exited); child.on("error", errored)
    let stdout = "", frames = 0, observationsStopped = false
    const requests = new Map<string, { traceId: string; correlationId: string }>()
    const wire = (chunk: string | Buffer) => {
      if (frames >= 8) return
      stdout += String(chunk)
      if (Buffer.byteLength(stdout) > 65_536) { record("wire:probe-limit"); stdout = ""; frames = 8; return }
      let newline: number
      while (frames < 8 && (newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1); frames++
        let decoded: unknown
        try { decoded = JSON.parse(line) } catch { record("wire:invalid-envelope"); continue }
        const parsed = RuntimeEnvelopeSchema.safeParse(decoded)
        if (!parsed.success) { record("wire:invalid-envelope"); continue }
        const frame = parsed.data
        const matching = requests.get(frame.id)
        if (!matching || matching.traceId !== frame.traceId || matching.correlationId !== frame.correlationId) continue
        if (frame.type === "worker.request-alive" && typeof frame.payload === "object" && frame.payload !== null && Reflect.get(frame.payload, "requestType") === "bilibili.follower.fetch-card.v2") record("wire:card-alive")
        else if (frame.type === "worker.error") record(`wire:worker-error:${safeCode(frame.payload)}`)
        else if (frame.type === "bilibili.follower.fetch-card.v2.result") record("wire:card-result")
      }
      if (frames >= 8) { stdout = ""; record("wire:probe-limit") }
    }
    const stderrProbe = createStderrProbe(record, () => stages.length >= 40)
    const diagnostic = stderrProbe.observe
    stopObservers = () => { observationsStopped = true; stderrProbe.stop(false); stdout = ""; frames = 8; requests.clear() }
    child.stdout?.on("data", wire); child.stderr?.on("data", diagnostic)
    const stdin = child.stdin
    const originalWrite = stdin?.write
    if (stdin && originalWrite) {
      type WriteCallback = (error?: Error | null) => void
      function observedWrite(chunk: unknown, callback?: WriteCallback): boolean
      function observedWrite(chunk: unknown, encoding: BufferEncoding, callback?: WriteCallback): boolean
      function observedWrite(chunk: unknown, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean {
        record("stdin:write-called")
        if (!observationsStopped && typeof chunk === "string" && Buffer.byteLength(chunk) <= 65_536 && requests.size < 8) {
          let decoded: unknown
          try { decoded = JSON.parse(chunk) } catch { decoded = undefined }
          const parsed = RuntimeEnvelopeSchema.safeParse(decoded)
          if (parsed.success && parsed.data.type === "bilibili.follower.fetch-card.v2") requests.set(parsed.data.id, { traceId: parsed.data.traceId, correlationId: parsed.data.correlationId })
        }
        const existingCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
        const observedCallback: WriteCallback = error => { record(error ? `stdin:write-error:${safeCode(error)}` : "stdin:write-ok"); existingCallback?.(error) }
        return typeof encodingOrCallback === "string"
          ? originalWrite!.call(stdin!, chunk, encodingOrCallback, existingCallback ? observedCallback : undefined)
          : originalWrite!.bind(stdin!)(chunk, existingCallback ? observedCallback : undefined)
      }
      stdin.write = observedWrite
    }
    cleanup = () => {
      child.off("spawn", spawned); child.off("exit", exited); child.off("error", errored)
      child.stdout?.off("data", wire); child.stderr?.off("data", diagnostic)
      if (stdin && originalWrite) stdin.write = originalWrite
      stopObservers()
    }
    cleanups.push(cleanup)
  }
  if (observing) processProbe.observe = observer
  const transport = new NdjsonPythonWorkerTransport({ pythonExecutable: process.env.BMD_PYTHON_EXE!,
    role: "crawler", dataDirectory: directory,
    pythonPath })
  const source = new BilibiliFollowerWorkerSource(transport)
  const originalFetchCard = source.fetchCard, originalRequest = transport.request
  const fetchCard = source.fetchCard.bind(source)
  const request = transport.request.bind(transport)
  const restore = () => {
    for (const cleanup of cleanups) cleanup()
    source.fetchCard = originalFetchCard; transport.request = originalRequest
    if (processProbe.observe === observer) processProbe.observe = undefined
  }
  if (observing) {
    source.fetchCard = input => { record("source:card-enter"); return fetchCard(input) }
    transport.request = (type, payload) => {
      record("transport:request-enter")
      return request(type, payload).then(value => { record("transport:resolved"); return value }, error => { record(`transport:rejected:${safeCode(error)}`); throw error })
    }
  }
  let runtime: LocalCoreRuntime
  try {
    runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture", schedulerEnabled: false,
      now: () => new Date("2026-10-05T12:01:00Z"), followerSource: source })
  } catch (error) {
    record(`fixture:start-rejected:${safeCode(error)}`)
    if (observing) process.stderr.write(`Follower Worker startup phases ${JSON.stringify({ stages })}\n`)
    try { await transport.stop(); assertDescendant(); await rm(directory, { recursive: true, force: true }) }
    finally { restore() }
    throw error
  }
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
  return { directory, runtime, source, transport, bridge, inspect, record,
    summary: (pending: string) => process.stderr.write(`Follower Worker bounded phases ${JSON.stringify({ stages, pending, childAlive: processProbe.children.slice(childOffset).some(child => child.exitCode === null && child.signalCode === null) })}\n`),
    children: () => processProbe.children.slice(childOffset),
    close: async () => {
      record("cleanup:start")
      try { await runtime.stop(); record("cleanup:stopped"); assertDescendant(); await rm(directory, { recursive: true, force: true }) }
      finally {
        if (observing) process.stderr.write(`Follower Worker cleanup phases ${JSON.stringify({ stages, exited: processProbe.children.slice(childOffset).every(child => child.exitCode !== null || child.signalCode !== null) })}\n`)
        restore()
      }
    } }
}

it.each(["add", "refresh"] as const)("cancels a pending v2 %s before closing SQLite and never writes a late snapshot", async operation => {
  const f = await fixture("live_http_wait")
  let pendingState = "unsettled"
  try {
    const user = operation === "refresh" ? await f.bridge.bilibiliFollowersV2.add({ mid: "2" }) : undefined
    const started = resolve(f.directory, "http-started")
    if (user) await unlink(started)
    const before = f.inspect("SELECT monitor_id, mid, current_follower_count FROM bilibili_follower_monitor")
    const historyBefore = f.inspect("SELECT snapshot_id, follower_count FROM bilibili_follower_snapshot")
    const artifactsBefore = f.inspect("SELECT object_id FROM object_artifact")
    const pending = (user ? f.bridge.bilibiliFollowersV2.refresh({ userId: user.id })
      : f.bridge.bilibiliFollowersV2.add({ mid: "3" })).then(value => { pendingState = "resolved"; f.record("pending:resolved"); return value }).catch((error: unknown) => { pendingState = "rejected"; f.record("pending:rejected"); return error })
    f.record("marker-wait:start")
    try { await vi.waitFor(async () => expect(await readFile(started, "utf8")).toBe("started"), { timeout: 10000 }) }
    finally { f.record("marker-wait:end") }
    f.record("marker-wait:complete")
    f.record("stop:start")
    await f.runtime.stop()
    f.record("stop:complete")
    expect(await pending).toBeInstanceOf(Error)
    // Core shutdown deliberately force-terminates its Worker. Unlike parent-pipe
    // loss, this does not run Python finally blocks: prove actual process exit.
    expect(f.children()).toHaveLength(1)
    expect(f.children().every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
    expect(f.inspect("SELECT monitor_id, mid, current_follower_count FROM bilibili_follower_monitor")).toEqual(before)
    expect(f.inspect("SELECT snapshot_id, follower_count FROM bilibili_follower_snapshot")).toEqual(historyBefore)
    expect(f.inspect("SELECT object_id FROM object_artifact")).toEqual(artifactsBefore)
  } finally { f.summary(pendingState); await f.close() }
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
