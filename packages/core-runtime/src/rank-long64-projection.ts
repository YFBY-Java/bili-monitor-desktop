import { javaLongToBigInt, javaLongToLegacyNumber } from "@bmd/contracts"
import { CoreApplicationError } from "./account-subject-service"

const longKeys = new Set(["score", "totalCount", "audienceCount", "guardCount"])
function mapLongs(value: unknown, convert: (value: string | number) => string | number): unknown {
  if (Array.isArray(value)) return value.map(item => mapLongs(item, convert))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    longKeys.has(key) && (typeof item === "string" || typeof item === "number")
      ? convert(item) : mapLongs(item, convert)]))
}
export function exactRankFromLegacy(value: unknown): unknown {
  return mapLongs(value, item => javaLongToBigInt(item).toString())
}
export function safeRankLegacyProjection(value: unknown): unknown {
  try { return mapLongs(value, item => javaLongToLegacyNumber(javaLongToBigInt(item))) }
  catch (error) {
    if (error instanceof RangeError && error.message.startsWith("LONG64_LEGACY_PRECISION_UNSUPPORTED")) {
      throw new CoreApplicationError("LONG64_LEGACY_PRECISION_UNSUPPORTED", "旧榜单接口无法精确表示该数值，请使用新版接口。", false)
    }
    throw error
  }
}
