// Spring Framework 6.1.15: StringToBooleanConverter, NumberUtils and the
// separate @Scheduled fixedDelayString consumer. Do not use JS trim/coercion.
const javaWhitespace = /[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/gu
const decimalZeroes = [
  0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6,
  0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0,
  0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80,
  0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900,
  0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10
] as const

/** OnPropertyCondition has no havingValue: only untrimmed equalsIgnoreCase false disables it. */
export function followerPropertyCondition(value: string): boolean {
  return !/^false$/iu.test(value)
}

export function bindFollowerBoolean(value: string): boolean {
  const text = value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, "").toLowerCase()
  if (["true", "on", "yes", "1"].includes(text)) return true
  if (["false", "off", "no", "0"].includes(text)) return false
  // The converter's null for empty input cannot be bound to the original primitive.
  throw new Error("Invalid primitive boolean configuration")
}

/** Character.digit(char, radix) uses UTF-16 chars, not supplementary Unicode digits. */
function digit(character: number, radix: 10 | 16): number {
  for (const zero of decimalZeroes) {
    const value = character - zero
    if (value >= 0 && value <= 9) return value
  }
  if (radix === 16) {
    for (const start of [0x0041, 0x0061, 0xff21, 0xff41]) {
      const value = character - start
      if (value >= 0 && value <= 5) return value + 10
    }
  }
  return -1
}

function parseInteger(value: string, allowHex: boolean): number {
  const negative = value.startsWith("-")
  let offset = negative || value.startsWith("+") ? 1 : 0
  let radix: 10 | 16 = 10
  // NumberUtils.isHexNumber skips '-' only. '+0x3' must not reach Integer.decode.
  if (allowHex && !value.startsWith("+")) {
    if (value.startsWith("0x", offset) || value.startsWith("0X", offset)) { radix = 16; offset += 2 }
    else if (value.startsWith("#", offset)) { radix = 16; offset++ }
  }
  if (offset === value.length) throw new Error("Empty primitive integer configuration")
  const limit = negative ? 2_147_483_648 : 2_147_483_647
  let result = 0
  for (; offset < value.length; offset++) {
    const next = digit(value.charCodeAt(offset), radix)
    if (next < 0 || next >= radix || result > Math.floor((limit - next) / radix)) {
      throw new Error("Invalid primitive integer configuration")
    }
    result = result * radix + next
  }
  return result === 0 ? 0 : negative ? -result : result
}

export function bindFollowerInteger(value: string): number {
  return parseInteger(value.replace(javaWhitespace, ""), true)
}

export function validateFollowerSchedulerDelay(value: string): void {
  // The original int property is bound first, so no duration or wider long can
  // reach this consumer. Long.parseLong does not strip whitespace or decode hex.
  if (parseInteger(value, false) <= 0) throw new Error("Invalid scheduled fixed delay")
}
