import { jdk20DoubleText } from "./bilibili-danmaku-message-text"
import { javaDoubleLiteral } from "./bilibili-java-double"

const numericTokens = new WeakMap<object, Map<string, string>>()
const MIN_INT = -2_147_483_648, MAX_INT = 2_147_483_647
const JAVA_DOUBLE = /^[+-]?(?:NaN|Infinity|(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|0[xX](?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP][+-]?[0-9]+)[fFdD]?)$/u

// Preserve integer / Double token identity before ECMAScript rounds large integers.
export function parseBilibiliApiJson(raw: string): unknown {
  return JSON.parse(raw, function (this: object, key: string, value: unknown, context?: { source?: string }) {
    if (typeof value === "number" && context?.source !== undefined) {
      let tokens = numericTokens.get(this)
      if (!tokens) { tokens = new Map(); numericTokens.set(this, tokens) }
      tokens.set(key, context.source)
    }
    return value
  }) as unknown
}

function field(parent: unknown, key: string): unknown {
  return typeof parent === "object" && parent !== null && !Array.isArray(parent)
    ? Reflect.get(parent, key) : undefined
}

function token(parent: unknown, key: string): string | undefined {
  return typeof parent === "object" && parent !== null ? numericTokens.get(parent)?.get(key) : undefined
}

function narrowDouble(value: number): number {
  return Number.isNaN(value) ? 0 : Math.min(MAX_INT, Math.max(MIN_INT, Math.trunc(value)))
}

// Jackson JsonNode.asInt(default): integer nodes wrap; floating nodes saturate;
// text uses NumberInput's integer scan followed by Java Double parsing.
export function bilibiliApiInt(parent: unknown, key: string, fallback = MIN_INT): number {
  const value = field(parent, key)
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "number") {
    const source = token(parent, key)
    if (source !== undefined && !/[.eE]/u.test(source)) {
      // Only the final 32 decimal digits affect the low 32 bits (10^32 is a multiple of 2^32).
      const sign = source.startsWith("-") ? -1n : 1n
      return Number(BigInt.asIntN(32, sign * BigInt(source.replace(/^-/, "").slice(-32))))
    }
    return narrowDouble(value)
  }
  if (typeof value !== "string") return fallback
  let text = value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/gu, "")
  if (text.startsWith("+")) text = text.slice(1)
  if (/^-?[0-9]*$/u.test(text)) {
    const digits = text.replace(/^-/, "").replace(/^0+/, "") || "0"
    if (!/^-?[0-9]+$/u.test(text) || digits.length > 10) return fallback
    const integer = Number(digits) * (text.startsWith("-") ? -1 : 1)
    return integer >= MIN_INT && integer <= MAX_INT ? integer : fallback
  }
  text = text.replace(/^[\x00-\x20]+|[\x00-\x20]+$/gu, "")
  if (!JAVA_DOUBLE.test(text)) return fallback
  const literal = text.replace(/[fFdD]$/u, "")
  return narrowDouble(javaDoubleLiteral(literal))
}

export function bilibiliApiText(parent: unknown, key: string, fallback?: string): string | undefined {
  const value = field(parent, key)
  if (value === null || value === undefined) return fallback
  if (typeof value === "string" || typeof value === "boolean") return String(value)
  if (typeof value === "number") {
    const source = token(parent, key)
    return source !== undefined && !/[.eE]/u.test(source) ? BigInt(source).toString() : jdk20DoubleText(value)
  }
  return ""
}

export function hasBilibiliApiText(value: string | undefined): value is string {
  return value !== undefined && !/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/u.test(value)
}

export async function readBilibiliApiJson(response: { json: () => Promise<unknown> }, endpoint: string): Promise<unknown> {
  try { return await response.json() }
  catch (error) {
    // Original clients wrap JSON parse failures with their declared endpoint/200.
    // Header conversion and cancellation remain outside the platform-error path.
    if (error instanceof Error && "code" in error && error.code === "BILIBILI_PARSE_ERROR") {
      Object.assign(error, { endpoint, statusCode: 200 })
    }
    throw error
  }
}
