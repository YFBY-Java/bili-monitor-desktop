import { CoreApplicationError } from "./account-subject-service"

const counters = new Set(["currentFollowerCount", "followerCount", "followingCount"])

function isLegacyCounterIssue(issue: unknown): boolean {
  return typeof issue === "object" && issue !== null && "code" in issue && issue.code === "too_small"
    && "path" in issue && Array.isArray(issue.path)
    && issue.path.some(part => typeof part === "string" && counters.has(part))
}

function rejectLegacyValue(error: unknown): never {
  const imprecise = error instanceof RangeError && error.message.startsWith("LONG64_LEGACY_PRECISION_UNSUPPORTED:")
  // Contract validation belongs to the shared package; Core does not depend on its validator library.
  const narrowerDomain = error instanceof Error && error.name === "ZodError" && "issues" in error
    && Array.isArray(error.issues) && error.issues.length > 0 && error.issues.every(isLegacyCounterIssue)
  if (imprecise || narrowerDomain) {
    throw new CoreApplicationError("LONG64_LEGACY_PRECISION_UNSUPPORTED",
      "旧版数字通信格式无法准确表示当前粉丝计数，请使用 v2 精确计数接口。")
  }
  throw error
}

// Convert errors at the old external response exit, never inside collection/fallback.
export function legacyFollowerResponse<T>(read: () => Promise<T>): Promise<T>
export function legacyFollowerResponse<T>(read: () => T): T
export function legacyFollowerResponse<T>(read: () => T | Promise<T>): T | Promise<T> {
  try {
    const result = read()
    return result instanceof Promise ? result.catch(rejectLegacyValue) : result
  } catch (error) { return rejectLegacyValue(error) }
}
