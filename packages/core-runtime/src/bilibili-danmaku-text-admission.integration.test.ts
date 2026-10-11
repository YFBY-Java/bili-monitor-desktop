import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"
import { assertDanmakuTempPath, danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import type { BilibiliLiveDanmakuSourceEvent } from "./bilibili-live-danmaku-service"

type Fixture = Awaited<ReturnType<typeof danmakuConfigurationFixture>>
type Closable = { close(): Promise<void>; stop?: () => Promise<void> }
type TextOwner = { root: string; directory?: string; current?: Closable; disposed: boolean; finished: boolean;
  cleanupErrors: unknown[]; cleanupPromise?: Promise<void>; releasePending?: () => void; pending?: Promise<{ error?: unknown }> }
const registeredOwners = new Set<TextOwner>()
const textOwner = (): TextOwner => {
  const owner: TextOwner = { root: resolve(tmpdir()), disposed: false, finished: false, cleanupErrors: [] }
  registeredOwners.add(owner)
  return owner
}

async function removeOwnedDirectory(owner: TextOwner) {
  if (!owner.directory) return
  const suffix = relative(owner.root, owner.directory)
  if (!/^D:/iu.test(owner.directory) || !suffix || suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("Unsafe owned text fixture path")
  await rm(owner.directory, { recursive: true, force: true })
}

// The fixture's normal close guard uses current tmpdir. Frozen ownership also
// permits closing a runtime acquired after teardown, without changing globals.
async function closeOwnedFixture(fixture: Closable | undefined) {
  if (fixture?.stop) await fixture.stop()
  else await fixture?.close()
}

function cleanTextOwner(owner: TextOwner): Promise<void> {
  if (owner.cleanupPromise) return owner.cleanupPromise
  owner.disposed = true
  const fixture = owner.current
  delete owner.current
  owner.cleanupPromise = (async () => {
    for (const cleanup of [() => closeOwnedFixture(fixture), () => vi.unstubAllEnvs(), () => vi.restoreAllMocks(), () => removeOwnedDirectory(owner)]) {
      try { await cleanup() } catch (error) { owner.cleanupErrors.push(error) }
    }
  })()
  return owner.cleanupPromise
}

function throwTextErrors(errors: unknown[]) {
  const unique = [...new Set(errors)]
  if (unique.length === 1) throw unique[0]
  if (unique.length > 1) throw new AggregateError(unique, "Danmaku text test and cleanup failed")
}

async function cleanRegisteredTextOwners() {
  const owners = [...registeredOwners].map(owner => ({ owner, unfinished: !owner.finished }))
  registeredOwners.clear()
  // Attempt every owner's cleanup before observing any pending run rejection.
  for (const { owner } of owners) await cleanTextOwner(owner)
  const errors: unknown[] = []
  for (const { owner } of owners) {
    try { owner.releasePending?.() } catch (error) { errors.push(error) }
  }
  for (const { owner, unfinished } of owners) {
    if (!unfinished) continue
    if (owner.pending) {
      const outcome = await owner.pending
      if ("error" in outcome) errors.push(outcome.error)
    } else errors.push(...owner.cleanupErrors)
    owner.finished = true
  }
  throwTextErrors(errors)
}
afterEach(cleanRegisteredTextOwners)

async function acquireTextFixture(owner: TextOwner, fixture: Closable) {
  if (owner.disposed) {
    const errors: unknown[] = [new Error("Text fixture acquired after teardown")]
    try { await closeOwnedFixture(fixture) } catch (error) { errors.push(error) }
    throwTextErrors(errors)
  }
  owner.current = fixture
}

async function withDirectTextRun(owners: TextOwner[], pending: Promise<{ error?: unknown }>, release: () => void, operation: () => Promise<void>) {
  const errors: unknown[] = []
  try { await operation() } catch (error) { errors.push(error) }
  finally {
    release()
    // This outcome never rejects, so subsequent owners always receive cleanup.
    const outcome = await pending
    if ("error" in outcome) errors.push(outcome.error)
    for (const owner of owners) {
      await cleanTextOwner(owner)
      errors.push(...owner.cleanupErrors)
      owner.finished = true
    }
  }
  throwTextErrors(errors)
}

// Own a D-only parent before setup so even a partially constructed fixture is removable.
async function executeTextFixture<F extends Closable>(owner: TextOwner, create: () => Promise<F>, operation: (fixture: F) => Promise<void>) {
  const errors: unknown[] = []
  let fixture: F | undefined, late = false
  try {
    assertDanmakuTempPath()
    owner.directory = await mkdtemp(resolve(owner.root, "bmd-danmaku-text-case-"))
    if (owner.disposed) throw new Error("Text fixture directory acquired after teardown")
    assertDanmakuTempPath(owner.directory, true)
    vi.stubEnv("TEMP", owner.directory)
    vi.stubEnv("TMP", owner.directory)
    fixture = await create()
    if (owner.disposed) throw new Error("Text fixture acquired after teardown")
    owner.current = fixture
    await operation(fixture)
  } catch (error) { errors.push(error) }
  finally {
    late = owner.disposed
    await cleanTextOwner(owner)
    errors.push(...owner.cleanupErrors)
    if (late) {
      // A pending start can acquire a runtime after the first stop. Close it
      // again when it settles; never restore another case's globals here.
      for (const cleanup of [() => closeOwnedFixture(fixture), () => removeOwnedDirectory(owner)]) {
        try { await cleanup() } catch (error) { errors.push(error) }
      }
    }
    owner.finished = true
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, "Danmaku text test and cleanup failed")
}

function runTextFixture<F extends Closable>(owner: TextOwner, create: () => Promise<F>, operation: (fixture: F) => Promise<void>) {
  const running = executeTextFixture(owner, create, operation)
  owner.pending = running.then(() => ({}), (error: unknown) => ({ error }))
  return running
}

async function withTextFixture<F extends Closable>(create: () => Promise<F>, operation: (fixture: F) => Promise<void>) {
  const owner = textOwner()
  await runTextFixture(owner, create, operation)
}

function stored(directory: string, monitorId: string) {
  const database = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    return {
      recent: database.prepare("SELECT recent_id, message_text, sent_at FROM bilibili_live_danmaku_recent WHERE monitor_id = ? ORDER BY sent_at, rowid").all(monitorId),
      facts: database.prepare("SELECT event_id, message_text, live_session_id, transport_session_id, receipt_ordinal FROM bilibili_live_session_event WHERE monitor_id = ? AND event_kind = 'DANMAKU' ORDER BY rowid").all(monitorId),
      sessions: database.prepare("SELECT session_id, state FROM bilibili_live_session WHERE monitor_id = ?").all(monitorId),
      metrics: database.prepare("SELECT SUM(danmu_count) AS danmu, SUM(raw_event_count) AS raw FROM bilibili_live_danmaku_metric_bucket WHERE monitor_id = ?").get(monitorId)
    }
  } finally { database.close() }
}

function command(kind: "LIVE" | "DANMAKU" | "SUPER_CHAT" | "UNKNOWN", timestamp: string, sourceEventId: string, body?: string): BilibiliLiveDanmakuSourceEvent {
  return { type: "command", receivedAt: timestamp, event: {
    command: kind === "DANMAKU" ? "DANMU_MSG" : kind === "SUPER_CHAT" ? "SUPER_CHAT_MESSAGE" : kind,
    kind, occurredAt: timestamp, receivedAt: timestamp, sourceEventId,
    actor: { uid: "123", displayName: "合成正文昵称", medalName: "合成勋章" },
    ...(body === undefined ? {} : { messageText: body }),
    ...(kind === "LIVE" ? { liveStartedAt: timestamp, liveKey: sourceEventId } : {}),
    giftDelta: 0, superChatDelta: kind === "SUPER_CHAT" ? 1 : 0, rawJson: "{}"
  } }
}

async function connect(fixture: Fixture, runtime: Awaited<ReturnType<Fixture["start"]>>, monitorId: string, timestamp: string) {
  const connected = await runtime.startBilibiliLiveDanmaku({ roomMonitorId: monitorId })
  const emit = fixture.realtime.listeners.get(connected.sessionId!)!
  emit(command("LIVE", new Date(Date.parse(timestamp) - 1000).toISOString(), `live:${monitorId}`))
  expect(stored(fixture.directory, monitorId).sessions).toMatchObject([{ state: "OPEN" }])
  return { emit, sessionId: connected.sessionId! }
}

describe("danmaku text case ownership", () => {
  it("closes deferred setup after teardown without restoring a later owner's globals", async () => {
    const owner = textOwner(), laterOwner = textOwner(), calls: string[] = []
    let release = () => {}, began = () => {}
    const pending = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { began = resolve })
    owner.releasePending = release
    runTextFixture(owner, async () => {
      began()
      await pending
      return { close: async () => { calls.push("late-close") } }
    }, async () => { calls.push("operation") })
    const outcome = owner.pending!
    const error = await withDirectTextRun([owner, laterOwner], outcome, release, async () => {
      await started
      await cleanTextOwner(owner)
      const laterFixture = { close: async () => { calls.push("later-close") } }
      await acquireTextFixture(laterOwner, laterFixture)
      vi.stubEnv("BMD_TEXT_LATER_OWNER", "later")
      release()
      expect(await outcome).toMatchObject({ error: { message: "Text fixture acquired after teardown" } })
      expect(calls).toEqual(["late-close"])
      expect(laterOwner.current).toBe(laterFixture)
      expect(process.env.BMD_TEXT_LATER_OWNER).toBe("later")
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ message: "Text fixture acquired after teardown" })
  })

  it.each([false, true])("closes a runtime acquired by deferred start after early stop without touching the next owner; late stop rejects=%s", async rejectLateStop => {
    const owner = textOwner(), laterOwner = textOwner()
    const original = process.env.BMD_TEXT_LATER_START, lateStop = new Error("late stop"), target = { value: () => "original" }
    let release = () => {}, began = () => {}, runtimeAcquired = false, stops = 0, laterClosed = false
    const pending = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { began = resolve })
    owner.releasePending = release
    const fixture = { close: async () => {}, stop: async () => {
      stops++; runtimeAcquired = false
      if (rejectLateStop && stops === 2) throw lateStop
    }, start: async () => {
      began()
      await pending
      runtimeAcquired = true
    } }
    runTextFixture(owner, async () => fixture, async f => { await f.start() })
    const outcome = owner.pending!
    const result = withDirectTextRun([owner, laterOwner], outcome, release, async () => {
      await started
      await cleanTextOwner(owner)
      expect(stops).toBe(1)
      const laterFixture = { close: async () => { laterClosed = true } }
      await acquireTextFixture(laterOwner, laterFixture)
      vi.stubEnv("BMD_TEXT_LATER_START", "later")
      vi.spyOn(target, "value").mockReturnValue("stubbed")
      release()
      const settled = await outcome
      if ("error" in settled) throw settled.error
      expect(stops).toBe(2)
      expect(runtimeAcquired).toBe(false)
      expect(laterOwner.current).toBe(laterFixture)
      expect(process.env.BMD_TEXT_LATER_START).toBe("later")
    }).catch((caught: unknown) => caught)
    const error = await result
    expect(error).toBe(rejectLateStop ? lateStop : undefined)
    expect(laterClosed).toBe(true)
    expect(process.env.BMD_TEXT_LATER_START).toBe(original)
    expect(target.value()).toBe("original")
  })

  it("preserves a rejected deferred run and later close failure while restoring every owner's globals", async () => {
    const owner = textOwner(), laterOwner = textOwner(), primary = new Error("deferred run"), close = new Error("later close")
    const original = process.env.BMD_TEXT_REJECTED_RUN, target = { value: () => "original" }
    let release = () => {}, began = () => {}, closed = false
    const pending = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { began = resolve })
    owner.releasePending = release
    runTextFixture(owner, async () => ({ close: async () => {} }), async () => {
      began(); await pending; throw primary
    })
    const outcome = owner.pending!
    const error = await withDirectTextRun([owner, laterOwner], outcome, release, async () => {
      await started
      await cleanTextOwner(owner)
      await acquireTextFixture(laterOwner, { close: async () => { closed = true; throw close } })
      vi.stubEnv("BMD_TEXT_REJECTED_RUN", "later")
      vi.spyOn(target, "value").mockReturnValue("stubbed")
      release()
      const settled = await outcome
      if ("error" in settled) throw settled.error
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected run and cleanup failures")
    expect(error.errors).toEqual([primary, close])
    expect(closed).toBe(true)
    expect(process.env.BMD_TEXT_REJECTED_RUN).toBe(original)
    expect(target.value()).toBe("original")
  })

  it("uses the afterEach fallback for both direct owners and closes a runtime acquired after early teardown with rejecting cleanup", async () => {
    const owner = textOwner(), laterOwner = textOwner(), primary = new Error("late run"), lateStop = new Error("late stop"), laterClose = new Error("later close")
    const original = process.env.BMD_TEXT_FALLBACK, target = { value: () => "original" }
    let release = () => {}, began = () => {}, runtimeAcquired = false, stops = 0, laterClosed = false
    const pending = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { began = resolve })
    owner.releasePending = release
    const fixture = { close: async () => {}, stop: async () => {
      stops++; runtimeAcquired = false
      if (stops === 2) throw lateStop
    } }
    runTextFixture(owner, async () => fixture, async () => {
      began(); await pending; runtimeAcquired = true; throw primary
    })
    await started
    await acquireTextFixture(laterOwner, { close: async () => { laterClosed = true; throw laterClose } })
    vi.stubEnv("BMD_TEXT_FALLBACK", "later")
    vi.spyOn(target, "value").mockReturnValue("stubbed")
    // This is the same registered cleanup function used by the real hook. It
    // releases the deferred operation only after both owners' first cleanup.
    const error = await cleanRegisteredTextOwners().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected fallback failures")
    expect(error.errors).toHaveLength(2)
    const runError: unknown = error.errors[0]
    expect(runError).toBeInstanceOf(AggregateError)
    if (!(runError instanceof AggregateError)) throw new Error("Expected primary run and late stop")
    expect(runError.errors).toEqual([primary, lateStop])
    expect(error.errors[1]).toBe(laterClose)
    expect(stops).toBe(2)
    expect(runtimeAcquired).toBe(false)
    expect(laterClosed).toBe(true)
    expect(owner.current).toBeUndefined()
    expect(laterOwner.current).toBeUndefined()
    expect(registeredOwners.size).toBe(0)
    expect(process.env.BMD_TEXT_FALLBACK).toBe(original)
    expect(target.value()).toBe("original")
    const { access } = await import("node:fs/promises")
    await expect(access(owner.directory!)).rejects.toMatchObject({ code: "ENOENT" })

    let acquiredAfterTeardownClosed = false
    const lateAcquisitionError = await acquireTextFixture(laterOwner, {
      close: async () => { acquiredAfterTeardownClosed = true }
    }).catch((caught: unknown) => caught)
    expect(lateAcquisitionError).toMatchObject({ message: "Text fixture acquired after teardown" })
    expect(acquiredAfterTeardownClosed).toBe(true)
    expect(laterOwner.current).toBeUndefined()
  })

  it("cleans partial setup and restores globals while preserving the primary failure", async () => {
    const original = process.env.TEMP, primary = new Error("partial setup")
    let orphan = ""
    const target = { value: () => "original" }
    const error = await withTextFixture(async () => {
      orphan = resolve(tmpdir(), "partially-created")
      await mkdir(orphan)
      vi.spyOn(target, "value").mockReturnValue("stubbed")
      throw primary
    }, async () => {}).catch((caught: unknown) => caught)
    expect(error).toBe(primary)
    expect(process.env.TEMP).toBe(original)
    expect(target.value()).toBe("original")
    const { access } = await import("node:fs/promises")
    await expect(access(orphan)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("preserves operation and close failures and still removes owned files and restores globals", async () => {
    const primary = new Error("operation"), close = new Error("close"), original = process.env.TMP
    let orphan = "", closed = false
    const error = await withTextFixture(async () => {
      orphan = resolve(tmpdir(), "owned")
      await mkdir(orphan)
      return { close: async () => { closed = true; throw close } }
    }, async () => { throw primary }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected both errors")
    expect(error.errors).toEqual([primary, close])
    expect(closed).toBe(true)
    expect(process.env.TMP).toBe(original)
    const { access } = await import("node:fs/promises")
    await expect(access(orphan)).rejects.toMatchObject({ code: "ENOENT" })
  })
})

describe("original blank admission through Core and real SQLite", () => {
  it("keeps all Java blank facts and metrics with receipt ordinals, admitting Java nonblank spaces unchanged", async () => {
    await withTextFixture(() => danmakuConfigurationFixture(), async f => {
      const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
      const { emit, sessionId } = await connect(f, runtime, room.id, timestamp)
      const whites = ["", ...Array.from({ length: 5 }, (_, i) => String.fromCharCode(9 + i)),
        ...Array.from({ length: 5 }, (_, i) => String.fromCharCode(28 + i)), "\u1680",
        ...Array.from({ length: 7 }, (_, i) => String.fromCharCode(0x2000 + i)),
        "\u2008", "\u2009", "\u200a", "\u2028", "\u2029", "\u205f", "\u3000"]
      const blanks: Array<string | undefined> = [undefined, ...whites, whites.join("")]
      blanks.forEach((text, i) => emit(command("DANMAKU", timestamp, `blank:${i}`, text)))
      const blankRows = stored(f.directory, room.id)
      expect(blankRows.recent).toEqual([])
      expect(blankRows.facts).toHaveLength(blanks.length)
      expect(blankRows.facts.map(row => row.message_text)).toEqual(blanks.map(text => text ?? null))
      expect(blankRows.facts.map(row => row.receipt_ordinal)).toEqual(blanks.map((_, i) => i + 2))
      expect(blankRows.facts.every(row => row.transport_session_id === sessionId && row.live_session_id === blankRows.sessions[0]?.session_id)).toBe(true)
      expect(blankRows.metrics).toMatchObject({ danmu: blanks.length, raw: blanks.length + 1 })
      const long = `  ${"正文".repeat(300)}  `, bodies = ["\u00a0", "\u2007", "\u202f", "\ufeff", "  正文 \t ", long]
      bodies.forEach((body, i) => emit(command("DANMAKU", timestamp, `admitted:${i}`, body)))
      const rows = stored(f.directory, room.id)
      expect(rows.recent.map(row => row.message_text)).toEqual(bodies.map(body => body.slice(0, 500)))
      expect(rows.facts.slice(-bodies.length).map(row => row.message_text)).toEqual(bodies)
      expect(rows.facts.at(-1)?.receipt_ordinal).toBe(blanks.length + bodies.length + 1)
      expect(rows.metrics).toMatchObject({ danmu: blanks.length + bodies.length, raw: blanks.length + bodies.length + 1 })
    })
  })

  it("preserves all survivor IDs after a lower restart and blank, trimming only the next admitted room body", async () => {
    await withTextFixture(() => danmakuConfigurationFixture({ recentMessageLimitPerRoom: 30 }), async f => {
      const a = await f.seedRoom({ liveStatus: 1 }), b = await f.seedRoom({ liveStatus: 1 }), timestamp = new Date().toISOString()
      let runtime = await f.start()
      const first = await connect(f, runtime, a.id, timestamp), second = await connect(f, runtime, b.id, timestamp)
      for (let i = 1; i <= 30; i++) {
        first.emit(command("DANMAKU", timestamp, `a:${i}`, `a body:${i}`))
        second.emit(command("DANMAKU", timestamp, `b:${i}`, `b body:${i}`))
      }
      const beforeA = stored(f.directory, a.id), beforeB = stored(f.directory, b.id)
      await f.stop()
      await writeFile(f.path, '{"recentMessageLimitPerRoom":20}', "utf8")
      runtime = await f.start()
      const lower = await connect(f, runtime, a.id, timestamp)
      lower.emit(command("DANMAKU", timestamp, "a:blank", " \u001c\u3000"))
      lower.emit(command("DANMAKU", timestamp, "a:missing"))
      lower.emit(command("SUPER_CHAT", timestamp, "a:sc", "nonblank other kind"))
      lower.emit(command("UNKNOWN", timestamp, "a:unknown", "nonblank unknown"))
      const blankRows = stored(f.directory, a.id)
      expect(blankRows.recent).toEqual(beforeA.recent)
      expect(stored(f.directory, b.id)).toEqual(beforeB)
      expect(blankRows.facts.slice(0, 30)).toEqual(beforeA.facts)
      expect(blankRows.facts.slice(30).map(row => row.receipt_ordinal)).toEqual([2, 3])
      expect(blankRows.metrics).toMatchObject({ danmu: 32, raw: 36 })
      lower.emit(command("DANMAKU", timestamp, "a:31", "  a next  "))
      const admitted = stored(f.directory, a.id)
      expect(admitted.recent).toHaveLength(20)
      expect(admitted.recent.slice(0, 19)).toEqual(beforeA.recent.slice(11))
      expect(admitted.recent.at(-1)?.message_text).toBe("  a next  ")
      expect(stored(f.directory, b.id)).toEqual(beforeB)
      expect(admitted.facts).toHaveLength(33)
      expect(admitted.facts.at(-1)?.receipt_ordinal).toBe(6)
      expect(admitted.metrics).toMatchObject({ danmu: 33, raw: 37 })
    })
  })

  it("deduplicates strong facts while projecting every duplicate's metric and recent body", async () => {
    await withTextFixture(() => danmakuConfigurationFixture(), async f => {
      const room = await f.seedRoom({ liveStatus: 1 }), runtime = await f.start(), timestamp = new Date().toISOString()
      const { emit } = await connect(f, runtime, room.id, timestamp)
      emit(command("DANMAKU", timestamp, "strong:1", "  original  "))
      emit(command("DANMAKU", timestamp, "strong:1", " \t "))
      emit(command("DANMAKU", timestamp, "strong:1", "  repeat  "))
      const rows = stored(f.directory, room.id)
      expect(rows.facts).toHaveLength(1)
      expect(rows.facts[0]).toMatchObject({ message_text: "  original  ", receipt_ordinal: 2 })
      expect(rows.metrics).toMatchObject({ danmu: 3, raw: 4 })
      expect(rows.recent.map(row => row.message_text)).toEqual(["  original  ", "  repeat  "])
    })
  })
})
