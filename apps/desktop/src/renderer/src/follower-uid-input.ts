import { PositiveJavaLongStringSchema } from "@bmd/contracts"

const decimalSyntax = /^\+?(?:([0-9]+)(?:\.([0-9]*))?|\.([0-9]+))(?:[eE]([+-]?)([0-9]+))?$/
const radixSyntax = /^(?:0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|0[oO]([0-7]+))$/

/** Preserve supported numeric syntax, but never round the UID through Number. */
export function normalizeFollowerUidInput(raw: string): string | undefined {
  // String.trim follows ECMAScript's whitespace/line-terminator set, not \s in another language.
  const value = raw.trim()
  const radix = radixSyntax.exec(value)
  if (radix) {
    const digits = (radix[1] ?? radix[2] ?? radix[3] ?? "").replace(/^0+/, "")
    const maximumDigits = radix[1] !== undefined ? 16 : radix[2] !== undefined ? 63 : 21
    if (!digits || digits.length > maximumDigits) return undefined
    const prefix = radix[1] !== undefined ? "0x" : radix[2] !== undefined ? "0b" : "0o"
    // The lexical guard bounds conversion to at most 64 bits, even for huge padded input.
    return validatedUid(BigInt(`${prefix}${digits}`).toString())
  }

  const decimal = decimalSyntax.exec(value)
  if (!decimal) return undefined
  const fraction = decimal[2] ?? decimal[3] ?? ""
  const coefficient = `${decimal[1] ?? ""}${fraction}`.replace(/^0+/, "")
  if (!coefficient) return undefined
  let significantEnd = coefficient.length
  while (significantEnd > 0 && coefficient[significantEnd - 1] === "0") significantEnd--
  const significant = coefficient.slice(0, significantEnd)
  if (significant.length > 19) return undefined
  const trailingZeros = coefficient.length - significant.length

  // For a positive Long integer, exponent - fraction.length + trailingZeros must
  // lie in [0, 19 - significant.length]. Larger exponents cannot be valid UIDs.
  const exponent = boundedExponent(decimal[5] ?? "0", decimal[4] === "-", fraction.length + trailingZeros + 19)
  if (exponent === undefined) return undefined
  const power = exponent - fraction.length + trailingZeros
  if (power < 0 || power > 19 - significant.length) return undefined
  // At most 18 zeroes are appended; no unbounded BigInt or exponent expansion.
  return validatedUid(`${significant}${"0".repeat(power)}`)
}

function boundedExponent(digits: string, negative: boolean, maximumMagnitude: number): number | undefined {
  if (!Number.isSafeInteger(maximumMagnitude)) return undefined
  const magnitude = digits.replace(/^0+/, "") || "0"
  const maximum = String(maximumMagnitude)
  if (magnitude.length > maximum.length || (magnitude.length === maximum.length && magnitude > maximum)) return undefined
  // Only an already bounded, safe exponent counter is converted, never UID digits.
  const exponent = Number(magnitude)
  if (!Number.isSafeInteger(exponent)) return undefined
  return negative ? -exponent : exponent
}

function validatedUid(canonical: string): string | undefined {
  return PositiveJavaLongStringSchema.safeParse(canonical).success ? canonical : undefined
}
