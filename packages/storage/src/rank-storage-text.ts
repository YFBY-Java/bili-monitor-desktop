import { postgresStoredText } from "./postgres-storage-text"

export function rankStoredText(value: string | null): string | null {
  return value === null ? null : postgresStoredText(value, "Rank")
}

/** Parsed entry JSON is already serialized by the Worker, never JSON.stringify it again. */
export function rankStoredEntryJson(value: string | null, storageStatus?: string): string | null {
  if (value === null) return null // Unknown legacy facts must not become invented '{}'.
  if (storageStatus !== undefined && storageStatus !== "ACCEPTED") {
    throw new Error(`Rank entry JSONB input rejected: ${storageStatus}.`)
  }
  return rankStoredText(value)
}

/** Original Java substring happens before the JDBC UTF8 encoder. */
export function rankStoredTruncatedText(value: string | null, maximum: 128 | 512): string | null {
  return rankStoredText(value === null ? null : value.slice(0, maximum))
}

/** Implicit VARCHAR assignment rejects non-space overflow after encoding. */
export function rankStoredCountText(value: string | null, column: "count_text" | "value_text"): string | null {
  const stored = rankStoredText(value)
  if (stored === null) return null
  const characters = Array.from(stored)
  if (characters.length <= 64) return stored
  if (characters.slice(64).some(character => character !== " ")) {
    throw new Error(`Rank ${column} exceeds VARCHAR(64).`)
  }
  return characters.slice(0, 64).join("")
}
