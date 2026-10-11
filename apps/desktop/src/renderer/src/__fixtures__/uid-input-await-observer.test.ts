import { afterEach, describe, expect, it, vi } from "vitest"
import { createUidInputAwaitObserver, type UidInputPhase } from "./uid-input-await-observer"

const phases = ["open", "fill", "validity", "submit", "detached", "uid"] as const
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => vi.restoreAllMocks())

describe("finite UID await observation", () => {
  it("forwards each operation once and preserves value and error identity", async () => {
    const observer = createUidInputAwaitObserver({ now: () => 10, output: () => {} })
    const value = {}, error = {}, calls: string[] = []
    expect(await observer.run(1, "open", () => { calls.push("value"); return value })).toBe(value)
    await expect(observer.run(1, "fill", () => { calls.push("error"); throw error })).rejects.toBe(error)
    expect(calls).toEqual(["value", "error"])
    expect(observer.snapshot().completionMasks[0]).toBe(1)
    expect(observer.snapshot().active).toBeNull()
    expect(observer.snapshot().observedOperations).toBe(2)
  })

  it("records only a safe active round and phase until its assertion completes", async () => {
    let now = 100
    const observer = createUidInputAwaitObserver({ now: () => now, output: () => {} })
    const pending = deferred<string>()
    now = 112
    const run = observer.run(4, "validity", () => pending.promise)
    expect(observer.snapshot().active).toEqual({ round: 4, phase: "validity", ms: 12 })
    expect(observer.snapshot().completionMasks[3]).toBe(0)
    now = 127; pending.resolve("private-result")
    expect(await run).toBe("private-result")
    expect(observer.snapshot().completionMasks[3]).toBe(4)
    expect(observer.snapshot().lastMs).toBe(27)
    expect(observer.snapshot().active).toBeNull()
    observer.finish()
  })

  it("completes the original twelve rounds and final assertion flags within the fixed bound", async () => {
    const lines: string[] = []
    const observer = createUidInputAwaitObserver({ now: () => 0, output: line => lines.push(line) })
    for (let round = 1; round <= 12; round++) for (const phase of phases) await observer.run(round, phase, () => {})
    await observer.run(0, "legacy", () => {})
    await observer.run(0, "count", () => {})
    expect(observer.snapshot()).toMatchObject({ completionMasks: Array<number>(12).fill(63), legacyCompleted: true, countCompleted: true, observedOperations: 74, truncated: false })
    observer.finish(); observer.finish()
    expect(lines).toHaveLength(1)
    expect(Buffer.byteLength(lines[0]! + "\n", "utf8")).toBeLessThanOrEqual(4096)
    expect(JSON.parse(lines[0]!)).toMatchObject({ stopped: true, countCompleted: true })
  })

  it("counts only successful assertion operations as completed", async () => {
    const observer = createUidInputAwaitObserver({ output: () => {} })
    for (const [round, phase] of [[1, "validity"], [12, "uid"], [0, "legacy"], [0, "count"]] as const) {
      await expect(observer.run(round, phase, () => { expect(false).toBe(true) })).rejects.toThrow()
    }
    expect(observer.snapshot()).toMatchObject({ completionMasks: Array<number>(12).fill(0), legacyCompleted: false, countCompleted: false, observedOperations: 4 })
  })

  it("rejects unsafe runtime rounds and phases without retaining or stringifying payloads", async () => {
    const lines: string[] = [], secret = { toString: () => { throw new Error("must not stringify") } }
    const observer = createUidInputAwaitObserver({ output: line => lines.push(line) })
    const cases: [number, UidInputPhase][] = [[0, "open"], [13, "uid"], [-1, "open"], [1.5, "fill"], [NaN, "open"], [Infinity, "open"], [1, "legacy"], [12, "count"], [1, "synthetic-private-phase" as UidInputPhase], [secret as never, secret as never]]
    let calls = 0
    for (const [round, phase] of cases) expect(await observer.run(round, phase, () => { calls++; return secret })).toBe(secret)
    expect(calls).toBe(cases.length)
    expect(observer.snapshot()).toMatchObject({ diagnosticFailure: true, completionMasks: Array<number>(12).fill(0), active: null })
    observer.finish()
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain("private")
    expect(lines[0]).not.toContain("must not stringify")
  })

  it("caps observed operations at eighty while forwarding all later originals", async () => {
    const observer = createUidInputAwaitObserver({ output: () => {} })
    let calls = 0
    for (let index = 0; index < 80; index++) await observer.run(1, "open", () => { calls++ })
    const frozen = observer.snapshot()
    await observer.run(2, "uid", () => { calls++ })
    const error = {}
    await expect(observer.run(0, "count", () => { calls++; throw error })).rejects.toBe(error)
    expect(calls).toBe(82)
    expect(observer.snapshot()).toEqual({ ...frozen, truncated: true })
  })

  it("returns copied masks and active objects", async () => {
    const observer = createUidInputAwaitObserver({ output: () => {} })
    const pending = deferred<void>(), run = observer.run(1, "fill", () => pending.promise)
    const copy = observer.snapshot()
    copy.completionMasks.fill(63)
    expect(copy.active).not.toBeNull()
    copy.active!.round = 12
    expect(observer.snapshot().completionMasks).toEqual(Array<number>(12).fill(0))
    expect(observer.snapshot().active?.round).toBe(1)
    pending.resolve(); await run
  })

  it.each([false, true])("freezes progress before late completion, rejecting=%s", async rejecting => {
    const observer = createUidInputAwaitObserver({ output: () => {} })
    const pending = deferred<object>(), run = observer.run(2, "uid", () => pending.promise)
    observer.stop(); observer.stop()
    const frozen = observer.snapshot(), identity = {}
    expect(frozen.stopped).toBe(true)
    expect(frozen.active?.phase).toBe("uid")
    if (rejecting) { pending.reject(identity); await expect(run).rejects.toBe(identity) }
    else { pending.resolve(identity); expect(await run).toBe(identity) }
    await observer.run(0, "count", () => identity)
    expect(observer.snapshot()).toEqual(frozen)
  })

  it.each(["throws", "nan", "negative", "infinity"])("contains clock failure %s without changing originals", async failure => {
    const observer = createUidInputAwaitObserver({ now: () => { if (failure === "throws") throw new Error("private-clock"); return failure === "nan" ? NaN : failure === "negative" ? -1 : Infinity }, output: () => {} })
    const value = {}, error = {}
    expect(await observer.run(1, "open", () => value)).toBe(value)
    await expect(observer.run(1, "fill", () => { throw error })).rejects.toBe(error)
    expect(observer.snapshot()).toMatchObject({ diagnosticFailure: true, lastMs: 0, completionMasks: [1, ...Array<number>(11).fill(0)] })
    observer.finish()
  })

  it("uses an independent safe fallback when serialization fails", async () => {
    const lines: string[] = []
    const observer = createUidInputAwaitObserver({ output: line => lines.push(line) })
    await observer.run(12, "uid", () => "synthetic-private-uid")
    vi.spyOn(JSON, "stringify").mockImplementation(() => { throw new Error("private serializer") })
    expect(() => observer.finish()).not.toThrow()
    observer.finish()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({ diagnosticFailure: true, stopped: true })
    expect(Buffer.byteLength(lines[0]! + "\n")).toBeLessThanOrEqual(4096)
    expect(lines[0]).not.toContain("private")
  })

  it("bounds malformed serializer output and preserves operation identity despite broken output", async () => {
    const lines: string[] = []
    const observer = createUidInputAwaitObserver({ output: line => { lines.push(line); throw new Error("private output") } })
    vi.spyOn(JSON, "stringify").mockReturnValue("x".repeat(5000))
    const value = {}, error = {}
    expect(await observer.run(1, "open", () => value)).toBe(value)
    await expect(observer.run(1, "fill", () => { throw error })).rejects.toBe(error)
    observer.finish(); observer.finish()
    expect(lines).toHaveLength(1)
    expect(Buffer.byteLength(lines[0]! + "\n")).toBeLessThanOrEqual(4096)
    expect(observer.snapshot().diagnosticFailure).toBe(true)
  })

  it("lets cleanup and the independent observer finish even when diagnostics fail", async () => {
    const observer = createUidInputAwaitObserver({ output: () => { throw new Error("private output") } })
    const originalError = {}, events: string[] = []
    try {
      await expect(observer.run(1, "uid", () => { throw originalError })).rejects.toBe(originalError)
    } finally {
      observer.stop()
      try { events.push("page.close") }
      finally { try { observer.finish() } finally { events.push("startup.finish") } }
    }
    expect(events).toEqual(["page.close", "startup.finish"])
    expect(observer.snapshot()).toMatchObject({ stopped: true, diagnosticFailure: true })
  })
})
