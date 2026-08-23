const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30_000
const MAX_JITTER_RATIO = 0.2

export function nextReconnectDelay(attempt: number, random: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("Reconnect attempt must be non-negative.")
  const baseDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
  if (baseDelay === MAX_DELAY_MS) return MAX_DELAY_MS
  const jitter = Math.max(0, Math.min(1, random())) * MAX_JITTER_RATIO
  return Math.round(baseDelay * (1 + jitter))
}
