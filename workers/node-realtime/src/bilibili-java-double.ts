// Callers validate Java's literal grammar before this conversion. Hexadecimal
// mantissa/exponent must be combined before Number conversion to avoid Inf * 0.
export function javaDoubleLiteral(literal: string): number {
  const hex = literal.match(/^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?[0-9]+)$/u)
  if (!hex) return Number(literal)
  const fraction = hex[3] ?? ""
  const digits = `${hex[2]}${fraction}`.replace(/^0+/u, "")
  const sign = hex[1] === "-" ? -1 : 1
  if (!digits) return sign * 0
  const headText = digits.slice(0, 15), head = BigInt(`0x${headText}`)
  const headBits = head.toString(2).length
  const bits = (digits.length - headText.length) * 4 + headBits
  const exponent = Number(hex[4]) - fraction.length * 4
  const leadingExponent = exponent + bits - 1
  if (leadingExponent > 1023) return sign * Number.POSITIVE_INFINITY
  if (leadingExponent < -1075) return sign * 0
  // Normal doubles retain 53 bits; subnormals have fewer significant bits.
  const keep = Math.min(bits, 53, leadingExponent + 1075)
  const shift = headBits - keep
  let rounded = head >> BigInt(shift)
  if (bits > keep) {
    const discarded = head - (rounded << BigInt(shift))
    const half = 1n << BigInt(shift - 1)
    const sticky = /[1-9a-f]/iu.test(digits.slice(headText.length))
    if (discarded > half || (discarded === half && (sticky || (rounded & 1n) !== 0n))) rounded++
  }
  return sign * Number(rounded) * 2 ** (exponent + bits - keep)
}
