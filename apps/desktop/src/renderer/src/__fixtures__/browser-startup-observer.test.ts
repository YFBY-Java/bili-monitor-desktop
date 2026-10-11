import { Buffer } from "node:buffer"
import { describe, expect, it, vi } from "vitest"
import { createBrowserStartupObserver, type StartupPage } from "./browser-startup-observer"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
class Lifecycle implements StartupPage {
  readonly frame = Object.defineProperty({}, "url", { get() { throw new Error("URL getter must never be read") } })
  readonly callbacks = new Map<string, Set<(frame?: unknown) => void>>()
  readonly held: ((frame?: unknown) => void)[] = []
  failAttach = ""; failDetach = ""; detachAttempts: string[] = []
  closed = false; navigated = false
  mainFrame() { return this.frame }
  on(event: string, callback: (frame?: unknown) => void) {
    const listeners = this.callbacks.get(event) ?? new Set()
    listeners.add(callback); this.callbacks.set(event, listeners); this.held.push(callback)
    if (event === this.failAttach) throw new Error("private attach failure")
  }
  off(event: string, callback: (frame?: unknown) => void) {
    this.detachAttempts.push(event)
    if (event === this.failDetach) throw new Error("private detach failure")
    this.callbacks.get(event)?.delete(callback)
  }
  emit(event: string, frame?: unknown) { this.callbacks.get(event)?.forEach(callback => callback(frame)) }
  close() { this.closed = true }
  goto() { this.navigated = true }
}
describe("bounded browser startup observation", () => {
  it("forwards exact values and sync/async rejection identities once despite diagnostic failures", async () => {
    const rejection = new Error("https://private.invalid/?secret=fixture")
    for (const broken of [false, true]) {
      const observer = createBrowserStartupObserver("status", "beforeAll", {
        now: () => { if (broken) throw rejection; return 1 },
        output: () => { if (broken) throw rejection }
      })
      const value = { exact: true }; let invoked = 0
      expect(await observer.run("page.goto", () => { invoked++; return value })).toBe(value)
      expect(invoked).toBe(1)
      await expect(observer.run("page.visible", () => Promise.reject(rejection))).rejects.toBe(rejection)
      await expect(observer.run("page.route", () => { throw rejection })).rejects.toBe(rejection)
      observer.stop(); observer.finish()
      expect(observer.snapshot().diagnosticFailure).toBe(broken)
      expect(JSON.stringify(observer.snapshot())).not.toContain("private")
    }
  })
  it.each(["goto-pending", "locator-pending"] as const)("distinguishes lifecycle callbacks while %s with real deferred waits", async boundary => {
    let time = 0
    const observer = createBrowserStartupObserver("workspace", "beforeEach", { now: () => time++, output: () => {} })
    const page = new Lifecycle(); observer.attachPage(page)
    const navigation = deferred<object>(); const visibility = deferred<void>()
    const value = {}; const goto = observer.run("page.goto", () => navigation.promise)
    page.emit("framenavigated", {}); expect(observer.snapshot().observed.mainFrame).toBe(false)
    if (boundary === "locator-pending") { navigation.resolve(value); expect(await goto).toBe(value) }
    const visible = boundary === "locator-pending" ? observer.run("page.visible", () => visibility.promise) : undefined
    page.emit("framenavigated", page.frame); page.emit("domcontentloaded"); page.emit("load")
    expect(observer.snapshot().active).toBe(boundary === "goto-pending" ? "page.goto" : "page.visible")
    expect(observer.snapshot().observed).toEqual({ mainFrame: true, dom: true, load: true })
    observer.stop(); const frozen = observer.snapshot()
    page.held.forEach(callback => callback(page.frame))
    expect(observer.snapshot()).toEqual(frozen)
    navigation.resolve(value); visibility.resolve(); await goto; await visible
    await observer.run("page.close", () => page.close())
    expect(observer.snapshot().active).toBe(frozen.active)
    expect(page.closed).toBe(true); expect(observer.snapshot().listenersRemoved).toBe(true)
    expect([...page.callbacks.values()].every(listeners => listeners.size === 0)).toBe(true)
  })
  it("attempts every detach independently after partial attach failure and freezes held callbacks", async () => {
    const page = new Lifecycle(); page.failAttach = "domcontentloaded"; page.failDetach = "framenavigated"
    const observer = createBrowserStartupObserver("trend", "beforeEach", { output: () => {} })
    expect(observer.attachPage(page)).toBe(true)
    observer.stop(); const frozen = observer.snapshot()
    page.held.forEach(callback => callback(page.frame)); observer.stop()
    await observer.run("page.close", () => page.close()); observer.finish()
    expect(page.detachAttempts).toEqual(["framenavigated", "domcontentloaded", "load"])
    expect(observer.snapshot().observed).toEqual(frozen.observed)
    expect(observer.snapshot().diagnosticFailure).toBe(true)
    expect(observer.snapshot().listenersRemoved).toBe(false)
    expect(page.closed).toBe(true)
    expect(page.callbacks.get("load")?.size).toBe(0)
  })
  it("bounds records and UTF-8 output, emits once, and snapshots cannot mutate internal state", async () => {
    const lines: string[] = []; let time = 0
    const observer = createBrowserStartupObserver("delete", "beforeAll", { now: () => time++, output: line => lines.push(line) })
    for (let i = 0; i < 60; i++) await observer.run("page.goto", () => i)
    const detached = observer.snapshot(); detached.records.length = 0; detached.observed.load = true
    observer.stop(); observer.stop(); observer.finish(); observer.finish()
    expect(observer.snapshot().records).toHaveLength(40)
    expect(observer.snapshot().observed.load).toBe(false)
    expect(observer.snapshot().truncated).toBe(true)
    expect(lines).toHaveLength(1); expect(Buffer.byteLength(lines[0]!, "utf8")).toBeLessThanOrEqual(4096)
    expect(JSON.parse(lines[0]!)).toMatchObject({ label: "delete", hook: "beforeAll", stopped: true })
  })
  it("closes a late owned page without navigation or replacing it", async () => {
    const pending = deferred<Lifecycle>(); let creations = 0
    const observer = createBrowserStartupObserver("widget", "beforeEach", { output: () => {} })
    const setup = (async () => {
      const page = await observer.run("page.create", () => { creations++; return pending.promise })
      if (!observer.attachPage(page)) { try { await observer.run("page.close", () => page.close()) } finally { observer.finish() }; return }
      await observer.run("page.goto", () => page.goto())
    })()
    observer.stop(); const page = new Lifecycle(); pending.resolve(page); await setup
    expect(creations).toBe(1); expect(page.closed).toBe(true); expect(page.navigated).toBe(false)
    expect(page.callbacks.size).toBe(0); expect(observer.snapshot().active).toBe("page.create")
  })
  it("normalizes nonfinite clocks and runtime names without serializing hostile inputs", async () => {
    const hostile = Object.defineProperty({}, "toJSON", { get() { throw new Error("private") } })
    const observer = createBrowserStartupObserver(hostile as never, hostile as never, { now: () => Infinity, output: () => {} })
    expect(await observer.run(hostile as never, () => 7)).toBe(7)
    observer.stop(); observer.finish()
    const summary = observer.snapshot()
    expect(summary.diagnosticFailure).toBe(true)
    expect(JSON.stringify(summary)).not.toContain("private")
  })
  it("isolates serializer failure and output failure from identities and remaining cleanup", async () => {
    const rejection = new Error("https://private.invalid/secret")
    let outputAttempts = 0, cleaned = false
    const observer = createBrowserStartupObserver("status", "beforeAll", { output: () => { outputAttempts++; throw rejection } })
    const value = {}; expect(await observer.run("page.goto", () => value)).toBe(value)
    await expect(observer.run("page.visible", () => Promise.reject(rejection))).rejects.toBe(rejection)
    const serialization = vi.spyOn(JSON, "stringify").mockImplementation(() => { throw rejection })
    try {
      observer.stop(); observer.finish(); observer.finish()
      await observer.run("page.close", () => { cleaned = true })
    } finally { serialization.mockRestore() }
    expect(cleaned).toBe(true); expect(outputAttempts).toBe(1)
    expect(observer.snapshot().diagnosticFailure).toBe(true)
  })
  it("continues real navigation after listener attachment and main-frame accessor failures", async () => {
    const page = new Lifecycle(); page.failAttach = "load"
    page.mainFrame = () => { throw new Error("private frame accessor") }
    const observer = createBrowserStartupObserver("tab-rail", "beforeEach", { now: () => NaN, output: () => {} })
    expect(observer.attachPage(page)).toBe(true)
    page.emit("framenavigated", page.frame)
    await observer.run("page.goto", () => page.goto())
    observer.stop(); await observer.run("page.close", () => page.close()); observer.finish()
    expect(page.navigated).toBe(true); expect(page.closed).toBe(true)
    expect(observer.snapshot().observed.mainFrame).toBe(false)
    expect(observer.snapshot().diagnosticFailure).toBe(true)
    expect(observer.snapshot().records.every(record => Number.isFinite(record.ms) && record.ms >= 0)).toBe(true)
    expect([...page.callbacks.values()].every(listeners => listeners.size === 0)).toBe(true)
  })
})
