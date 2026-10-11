import { postgresStoredText } from "./postgres-storage-text"

const FOLLOWER_NICKNAME_CHARACTER_LIMIT = 160

/** Direct TEXT parameters match the observed pgjdbc UTF8 encoding boundary. */
export function followerStoredText(value: string): string {
  return postgresStoredText(value, "Follower")
}

/** PostgreSQL VARCHAR(160) preserves text and permits only ASCII-space overflow. */
export function followerStoredNickname(value: string): string {
  const stored = followerStoredText(value)
  const characters = Array.from(stored)
  if (characters.length <= FOLLOWER_NICKNAME_CHARACTER_LIMIT) return stored
  if (characters.slice(FOLLOWER_NICKNAME_CHARACTER_LIMIT).some(character => character !== " ")) {
    throw new Error("Follower nickname exceeds VARCHAR(160).")
  }
  return characters.slice(0, FOLLOWER_NICKNAME_CHARACTER_LIMIT).join("")
}
