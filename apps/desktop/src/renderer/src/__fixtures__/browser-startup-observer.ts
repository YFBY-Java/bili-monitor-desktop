export type StartupPhase = "server.create" | "server.listen" | "browser.launch" | "page.create" | "page.route" | "page.clock" | "page.goto" | "page.visible" | "page.close" | "browser.close" | "server.close"
export type StartupLabel = "delete" | "status" | "trend" | "workspace" | "widget" | "tab-rail"
export type StartupHook = "beforeAll" | "beforeEach"
export interface StartupPage {
  on(event: string, callback: (frame?: unknown) => void): unknown
  off(event: string, callback: (frame?: unknown) => void): unknown
  mainFrame(): unknown
}
type LifecycleEvent = "mainFrame" | "dom" | "load"
type RecordEntry = { phase: StartupPhase; state: "begin" | "end" | "error"; ms: number } | { event: LifecycleEvent; ms: number }
const phases: readonly StartupPhase[] = ["server.create", "server.listen", "browser.launch", "page.create", "page.route", "page.clock", "page.goto", "page.visible", "page.close", "browser.close", "server.close"]
const labels: readonly StartupLabel[] = ["delete", "status", "trend", "workspace", "widget", "tab-rail"]
const hooks: readonly StartupHook[] = ["beforeAll", "beforeEach"]

/** Node callback times describe observation only, not browser event timestamps. */
export function createBrowserStartupObserver(label: StartupLabel, hook: StartupHook, options: { now?: () => number; output?: (line: string) => void } = {}) {
  let diagnosticFailure = false, truncated = false, stopped = false, finished = false, listenersRemoved = false, closed = false
  const safeLabel = labels.includes(label) ? label : "status"
  const safeHook = hooks.includes(hook) ? hook : "beforeAll"
  if (safeLabel !== label || safeHook !== hook) diagnosticFailure = true
  const records: RecordEntry[] = []
  const observed = { mainFrame: false, dom: false, load: false }
  let active: StartupPhase | null = null
  const registrations: { page: StartupPage; event: string; callback: (frame?: unknown) => void }[] = []
  const guard = (diagnostic: () => void) => { try { diagnostic() } catch { diagnosticFailure = true } }
  const clock = () => {
    let value = 0
    guard(() => {
      const reading = (options.now ?? (() => performance.now()))()
      if (!Number.isFinite(reading) || reading < 0) { diagnosticFailure = true; return }
      value = Math.min(Math.round(reading), 999_999_999)
    })
    return value
  }
  const started = clock()
  const elapsed = () => Math.max(0, clock() - started)
  const add = (record: RecordEntry) => {
    if (records.length < 40) records.push(record)
    else truncated = true
  }
  const snapshot = () => ({ label: safeLabel, hook: safeHook, records: records.map(record => ({ ...record })),
    observed: { ...observed }, active, truncated, diagnosticFailure, stopped, listenersRemoved, closed })
  const stop = () => {
    if (stopped) return
    stopped = true
    let removed = true
    for (const { page, event, callback } of registrations) {
      try { page.off(event, callback) } catch { diagnosticFailure = true; removed = false }
    }
    registrations.length = 0
    listenersRemoved = removed
  }
  const finish = () => {
    if (finished) return
    finished = true
    stop()
    let line = ""
    guard(() => { line = JSON.stringify(snapshot()) })
    // Only whitelisted ASCII fields are serialized; still enforce the byte boundary.
    let bounded = false
    guard(() => { bounded = Boolean(line) && Buffer.byteLength(line + "\n", "utf8") <= 4096 })
    if (!bounded) {
      diagnosticFailure = true; truncated = true
      // Fixed primitive fallback must not depend on the failing serializer.
      line = `{"label":"${safeLabel}","hook":"${safeHook}","active":${active === null ? "null" : `"${active}"`},"truncated":true,"diagnosticFailure":true,"stopped":${stopped},"listenersRemoved":${listenersRemoved},"closed":${closed}}`
    }
    guard(() => { (options.output ?? (value => { process.stderr.write(value + "\n") }))(line) })
  }
  return {
    async run<T>(phase: StartupPhase, operation: () => T | Promise<T>): Promise<T> {
      const valid = phases.includes(phase)
      if (!valid) diagnosticFailure = true
      const cleanup = valid && (phase === "page.close" || phase === "browser.close" || phase === "server.close")
      const record = (state: "begin" | "end" | "error") => guard(() => {
        if (!valid || (stopped && !cleanup)) return
        if (!stopped) active = state === "begin" ? phase : null
        if (phase === "page.close" && state === "end") closed = true
        add({ phase, state, ms: elapsed() })
      })
      record("begin")
      try { const value = await operation(); record("end"); return value }
      catch (error) { record("error"); throw error }
    },
    attachPage(page: StartupPage): boolean {
      if (stopped) return false
      const observe = (event: LifecycleEvent) => {
        if (stopped) return
        observed[event] = true
        add({ event, ms: elapsed() })
      }
      const entries: { event: string; callback: (frame?: unknown) => void }[] = [
        { event: "framenavigated", callback: frame => { if (!stopped) guard(() => { if (frame === page.mainFrame()) observe("mainFrame") }) } },
        { event: "domcontentloaded", callback: () => { if (!stopped) guard(() => observe("dom")) } },
        { event: "load", callback: () => { if (!stopped) guard(() => observe("load")) } }
      ]
      for (const entry of entries) {
        // Register ownership first: on() may install the callback and then throw.
        registrations.push({ page, ...entry })
        guard(() => { page.on(entry.event, entry.callback) })
      }
      return true
    },
    stop, finish, snapshot
  }
}
export type BrowserStartupObserver = ReturnType<typeof createBrowserStartupObserver>
