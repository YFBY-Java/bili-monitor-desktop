import { javaLongToBigInt, javaLongToLegacyNumber } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"

const counterKeys = new Set(["onlineCount", "attentionCount", "onlineDelta", "totalOnlineCount",
  "onlineDelta24h", "onlinePeak24h", "liveOnlineCount"])

function mapCounters(value: unknown, convert: (value: string | number) => string | number): unknown {
  if (Array.isArray(value)) return value.map(item => mapCounters(item, convert))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, counterKeys.has(key) && (typeof item === "string" || typeof item === "number")
      ? convert(item) : mapCounters(item, convert)
  ]))
}

// Explicit compatibility adapter for safe numeric internal test/source callers.
export function exactLiveFromLegacy(value: unknown): unknown {
  return mapCounters(value, value => javaLongToBigInt(value).toString())
}

export function safeLiveLegacyProjection(value: unknown): unknown {
  try { return mapCounters(value, value => javaLongToLegacyNumber(javaLongToBigInt(value))) }
  catch (error) {
    if (error instanceof RangeError && error.message.startsWith("LONG64_LEGACY_PRECISION_UNSUPPORTED")) {
      throw new CoreApplicationError("LONG64_LEGACY_PRECISION_UNSUPPORTED", "旧接口无法精确表示该直播计数，请使用新版接口。", false)
    }
    throw error
  }
}
