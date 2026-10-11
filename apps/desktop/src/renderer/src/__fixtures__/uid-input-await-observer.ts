export type UidInputPhase = "open" | "fill" | "validity" | "submit" | "detached" | "uid" | "legacy" | "count"
export interface UidInputAwaitSnapshot {
  completionMasks: number[]
  legacyCompleted: boolean
  countCompleted: boolean
  active: { round: number; phase: UidInputPhase; ms: number } | null
  observedOperations: number
  lastMs: number
  truncated: boolean
  diagnosticFailure: boolean
  stopped: boolean
}

const roundPhases: readonly UidInputPhase[] = ["open", "fill", "validity", "submit", "detached", "uid"]

/** Await/assertion progress only: no page calls, payloads, timers or listeners. */
export function createUidInputAwaitObserver(options: { now?: () => number; output?: (line: string) => void } = {}) {
  const completionMasks = Array<number>(12).fill(0)
  let legacyCompleted = false, countCompleted = false, observedOperations = 0, lastMs = 0
  let truncated = false, diagnosticFailure = false, stopped = false, finished = false
  let active: UidInputAwaitSnapshot["active"] = null, activeOperation = 0
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
  const snapshot = (): UidInputAwaitSnapshot => ({ completionMasks: [...completionMasks], legacyCompleted, countCompleted,
    active: active === null ? null : { ...active }, observedOperations, lastMs, truncated, diagnosticFailure, stopped })
  const stop = () => { stopped = true }
  const finish = () => {
    if (finished) return
    finished = true; stop()
    let line = "", bounded = false
    guard(() => { line = JSON.stringify(snapshot()) })
    guard(() => { bounded = Boolean(line) && Buffer.byteLength(line + "\n", "utf8") <= 4096 })
    if (!bounded) {
      diagnosticFailure = true; truncated = true
      // All fields are bounded primitives; this fallback never calls JSON.stringify.
      line = `{"completionMasks":[${completionMasks.join(",")}],"legacyCompleted":${legacyCompleted},"countCompleted":${countCompleted},"active":${active === null ? "null" : `{"round":${active.round},"phase":"${active.phase}","ms":${active.ms}}`},"observedOperations":${observedOperations},"lastMs":${lastMs},"truncated":true,"diagnosticFailure":true,"stopped":true}`
    }
    guard(() => { (options.output ?? (value => { process.stderr.write(value + "\n") }))(line) })
  }
  return {
    async run<T>(round: number, phase: UidInputPhase, operation: () => T | Promise<T>): Promise<T> {
      let observed = false, operationNumber = 0, bit = -1
      guard(() => {
        if (stopped) return
        if (observedOperations >= 80) { truncated = true; return }
        observedOperations++; operationNumber = observedOperations
        bit = roundPhases.indexOf(phase)
        const valid = Number.isInteger(round) && (bit >= 0 ? round >= 1 && round <= 12 : round === 0 && (phase === "legacy" || phase === "count"))
        if (!valid) { diagnosticFailure = true; return }
        observed = true; lastMs = elapsed(); activeOperation = operationNumber
        active = { round, phase, ms: lastMs }
      })
      const complete = (succeeded: boolean) => guard(() => {
        if (stopped || !observed) return
        lastMs = elapsed()
        if (activeOperation === operationNumber) active = null
        if (!succeeded) return
        if (bit >= 0) completionMasks[round - 1] = completionMasks[round - 1]! | (1 << bit)
        else if (phase === "legacy") legacyCompleted = true
        else countCompleted = true
      })
      try { const value = await operation(); complete(true); return value }
      catch (error) { complete(false); throw error }
    },
    snapshot, stop, finish
  }
}
export type UidInputAwaitObserver = ReturnType<typeof createUidInputAwaitObserver>
