type Decimal = { digits: string; exponent: number }
type Rational = { numerator: bigint; denominator: bigint }

// Node 24's reviver source retains numeric token kind/precision while every tree
// value stays the ordinary JSON.parse value used by the other event fields.
export function parseDanmakuMessageJson(rawJson: string): { root: unknown; messageText: () => string } {
  const lexemes = new WeakMap<object, Map<string, string>>()
  const root: unknown = JSON.parse(rawJson, function (this: object, key: string, value: unknown, context?: { source?: string }) {
    if (typeof value === "number" && context?.source !== undefined) {
      let fields = lexemes.get(this)
      if (!fields) { fields = new Map(); lexemes.set(this, fields) }
      fields.set(key, context.source)
    }
    return value
  })
  return { root, messageText: () => {
    const info = typeof root === "object" && root !== null && "info" in root && Array.isArray(root.info) ? root.info : []
    const value: unknown = info[1]
    if (typeof value === "string") return value
    if (typeof value === "boolean") return String(value)
    if (typeof value !== "number") return ""
    const source = lexemes.get(info)?.get("1")
    if (source === undefined) throw new Error("Danmaku numeric body requires JSON reviver source support")
    return /[.eE]/.test(source) ? jdk20DoubleText(value) : BigInt(source).toString()
  } }
}

// JDK 20 Double.toString (Double.java:371-441). ECMAScript Number::toString
// also minimizes canonical significant length, then distance, with even s on
// ties. Thus its >=2-digit significand is already the JDK choice; only layout
// differs. JDK additionally considers 2-digit candidates when shortest p=1.
export function jdk20DoubleText(value: number): string {
  if (Number.isNaN(value)) return "NaN"
  if (!Number.isFinite(value)) return value < 0 ? "-Infinity" : "Infinity"
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0"
  const magnitude = Math.abs(value)
  let decimal = canonicalDecimal(String(magnitude))
  if (decimal.digits.length === 1) decimal = closestShortDecimal(magnitude, decimal)
  return `${value < 0 ? "-" : ""}${javaDecimalLayout(decimal)}`
}

function canonicalDecimal(text: string): Decimal {
  const [mantissa = "", scientificExponent = "0"] = text.split("e")
  const point = mantissa.indexOf(".")
  let digits = mantissa.replace(".", "").replace(/^0+/, "")
  let exponent = Number(scientificExponent) - (point < 0 ? 0 : mantissa.length - point - 1)
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent++ }
  return { digits, exponent }
}

function closestShortDecimal(value: number, shortest: Decimal): Decimal {
  const binary = binary64Rational(value)
  let best = shortest, bestRational = decimalRational(shortest), bestDistance = distanceNumerator(binary, bestRational)
  // Every positive decimal rounding to x lies in [x/2,3x/2] (including
  // the minimum subnormal). Both candidate y and shortest z obey this, so
  // y/z is in [1/3,3]. For canonical 1<=s<=99 and 1<=z.s<=9, their decimal
  // exponents differ by at most 2. q-2 is essential: 1e-323 -> 99e-325.
  for (let exponent = shortest.exponent - 2; exponent <= shortest.exponent + 2; exponent++) {
    for (let significand = 1; significand <= 99; significand++) {
      if (significand % 10 === 0 || Number(`${significand}e${exponent}`) !== value) continue
      const candidate = { digits: String(significand), exponent }, rational = decimalRational(candidate)
      const distance = distanceNumerator(binary, rational)
      const comparison = distance * bestRational.denominator - bestDistance * rational.denominator
      if (comparison < 0n || (comparison === 0n && significand % 2 === 0 && BigInt(best.digits) % 2n !== 0n)) {
        best = candidate; bestRational = rational; bestDistance = distance
      }
    }
  }
  return best
}

function binary64Rational(value: number): Rational {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  const bits = view.getBigUint64(0), exponentBits = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & ((1n << 52n) - 1n)
  const significand = exponentBits === 0 ? fraction : fraction + (1n << 52n)
  const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52
  return exponent < 0 ? { numerator: significand, denominator: 1n << BigInt(-exponent) }
    : { numerator: significand << BigInt(exponent), denominator: 1n }
}

function decimalRational(decimal: Decimal): Rational {
  return decimal.exponent < 0
    ? { numerator: BigInt(decimal.digits), denominator: 10n ** BigInt(-decimal.exponent) }
    : { numerator: BigInt(decimal.digits) * 10n ** BigInt(decimal.exponent), denominator: 1n }
}

function distanceNumerator(binary: Rational, decimal: Rational): bigint {
  const delta = decimal.numerator * binary.denominator - binary.numerator * decimal.denominator
  return delta < 0n ? -delta : delta
}

function javaDecimalLayout({ digits, exponent }: Decimal): string {
  const order = exponent + digits.length - 1
  if (order < -3 || order >= 7) return `${digits[0]}.${digits.slice(1) || "0"}E${order}`
  const point = digits.length + exponent
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`
  if (point >= digits.length) return `${digits}${"0".repeat(point - digits.length)}.0`
  return `${digits.slice(0, point)}.${digits.slice(point)}`
}
