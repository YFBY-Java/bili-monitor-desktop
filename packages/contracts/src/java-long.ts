import { z } from "zod"

export const JAVA_LONG_MIN = -9223372036854775808n
export const JAVA_LONG_MAX = 9223372036854775807n

// Encode the bound in the pattern itself so the portable JSON Schema enforces
// the same domain without a JavaScript/Python-specific refinement keyword.
function positiveDecimalPattern(maximum: string): string {
  const alternatives = ["[1-9][0-9]{0,17}", maximum]
  for (let index = 0; index < maximum.length; index++) {
    const lowest = index === 0 ? 1 : 0
    const highest = Number(maximum[index]) - 1
    if (highest < lowest) continue
    const digit = highest === lowest ? String(lowest) : `[${lowest}-${highest}]`
    const remaining = maximum.length - index - 1
    alternatives.push(`${maximum.slice(0, index)}${digit}${remaining ? `[0-9]{${remaining}}` : ""}`)
  }
  return `(?:${alternatives.join("|")})`
}

const positivePattern = positiveDecimalPattern(JAVA_LONG_MAX.toString())
const negativeMagnitudePattern = positiveDecimalPattern((-JAVA_LONG_MIN).toString())
// $ also matches before a final newline in JavaScript/Python. This assertion
// requires the actual end of the string, including every Unicode code unit.
export const JAVA_LONG_STRING_PATTERN = `^(?:0|${positivePattern}|-${negativeMagnitudePattern})(?![\\s\\S])`
export const POSITIVE_JAVA_LONG_STRING_PATTERN = `^${positivePattern}(?![\\s\\S])`

export const JavaLongStringSchema = z.string().regex(new RegExp(JAVA_LONG_STRING_PATTERN),
  "Long64 必须是范围内的 canonical 十进制字符串。")
export const PositiveJavaLongStringSchema = z.string().regex(new RegExp(POSITIVE_JAVA_LONG_STRING_PATTERN),
  "请求 UID 必须是范围内的正 Long64 字符串。")
export type JavaLongString = z.infer<typeof JavaLongStringSchema>
export type PositiveJavaLongString = z.infer<typeof PositiveJavaLongStringSchema>

export function javaLongToBigInt(value: string | bigint | number): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError("LONG64_INVALID: numeric input must be an exact safe integer.")
  }
  if (typeof value === "string" && !JavaLongStringSchema.safeParse(value).success) {
    throw new RangeError("LONG64_INVALID: string input must be a canonical signed Long64.")
  }
  const result = BigInt(value)
  if (result < JAVA_LONG_MIN || result > JAVA_LONG_MAX) {
    throw new RangeError("LONG64_INVALID: input is outside the signed Long64 domain.")
  }
  return result
}

export function javaLongToLegacyNumber(value: string | bigint): number {
  const exact = javaLongToBigInt(value)
  if (exact < BigInt(Number.MIN_SAFE_INTEGER) || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("LONG64_LEGACY_PRECISION_UNSUPPORTED: v1 cannot express this exact integer.")
  }
  return Number(exact)
}

export function javaLongDelta(current: bigint, previous: bigint): bigint {
  return BigInt.asIntN(64, current - previous)
}
