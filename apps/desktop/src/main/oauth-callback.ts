export type DouyinOAuthCallback =
  | { code: string; state: string }
  | { error: string; errorDescription?: string; state: string }

export function parseDouyinOAuthCallback(value: string): DouyinOAuthCallback | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== "bilimonitor:" || url.hostname !== "douyin-oauth" || (url.pathname !== "" && url.pathname !== "/")) return undefined
    const code = url.searchParams.get("code")?.trim()
    const error = url.searchParams.get("error")?.trim()
    const errorDescription = url.searchParams.get("error_description")?.trim()
    const state = url.searchParams.get("state")?.trim()
    if (!state || state.length < 32) return undefined
    if (code) return { code, state }
    if (error) return { error, ...(errorDescription ? { errorDescription } : {}), state }
    return undefined
  } catch {
    return undefined
  }
}

export function findDouyinOAuthCallback(argv: string[]): DouyinOAuthCallback | undefined {
  for (const argument of argv) {
    const callback = parseDouyinOAuthCallback(argument)
    if (callback) return callback
  }
  return undefined
}
