const FOLLOWER_NICKNAME_CHARACTER_LIMIT = 160

/** PostgreSQL VARCHAR(160) preserves text and permits only ASCII-space overflow. */
export function followerStoredNickname(value: string): string {
  const characters = Array.from(value)
  if (characters.length <= FOLLOWER_NICKNAME_CHARACTER_LIMIT) return value
  if (characters.slice(FOLLOWER_NICKNAME_CHARACTER_LIMIT).some(character => character !== " ")) {
    throw new Error("Follower nickname exceeds VARCHAR(160).")
  }
  return characters.slice(0, FOLLOWER_NICKNAME_CHARACTER_LIMIT).join("")
}
