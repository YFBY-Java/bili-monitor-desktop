import { describe, expect, it } from "vitest"
import { jdk20DoubleText, parseDanmakuMessageJson } from "./bilibili-danmaku-message-text"

describe("worker-local Jackson scalar text", () => {
  it("captures exact numeric tokens while preserving every ordinary JSON tree value", () => {
    const raw = '{"cmd":"DANMU_MSG","info":[[9223372036854775807],9223372036854775807,[9007199254740993]],"data":{"num":1.4}}'
    const parsed = parseDanmakuMessageJson(raw)
    expect(parsed.root).toEqual(JSON.parse(raw))
    expect(parsed.messageText()).toBe("9223372036854775807")
  })

  it("retains integer tokens even when their ordinary Number tree value overflows", () => {
    const token = "9".repeat(400)
    for (const signed of [token, `-${token}`]) {
      const parsed = parseDanmakuMessageJson(`{"info":[[],${signed}]}`)
      expect(parsed.messageText()).toBe(signed)
      expect(parsed.root).toEqual({ info: [[], signed.startsWith("-") ? -Infinity : Infinity] })
    }
  })

  it.each([
    ['"  raw  "', "  raw  "], ["true", "true"], ["false", "false"], ["null", ""], ["{}", ""], ["[]", ""],
    ["-0", "0"], ["-0.0", "-0.0"], ["123456789012345678901234567890", "123456789012345678901234567890"],
    ["1e309", "Infinity"], ["-1e400", "-Infinity"], ["1e-400", "0.0"]
  ])("converts scalar token %s", (token, expected) => {
    expect(parseDanmakuMessageJson(`{"info":[[],${token}]}`).messageText()).toBe(expected)
  })

  it("rejects invalid JSON before resolving message text", () => {
    expect(() => parseDanmakuMessageJson('{"info":[[],01]}')).toThrow(SyntaxError)
  })
})

describe("JDK 20 closest shortest Double text", () => {
  it.each([
    [0, "0.0"], [-0, "-0.0"], [Infinity, "Infinity"], [-Infinity, "-Infinity"], [NaN, "NaN"],
    [1, "1.0"], [1000, "1000.0"], [0.01, "0.01"], [0.001, "0.001"], [0.0001, "1.0E-4"],
    [9999999, "9999999.0"], [10000000, "1.0E7"], [1e23, "1.0E23"],
    [Number.MIN_VALUE, "4.9E-324"], [Number.MIN_VALUE * 2, "9.9E-324"], [-Number.MIN_VALUE * 2, "-9.9E-324"],
    [1e-322, "9.9E-323"], [Number.MAX_VALUE, "1.7976931348623157E308"],
    [2 ** -25, "2.9802322387695312E-8"], [2 ** -24, "5.960464477539063E-8"],
    [1.0000000000000002, "1.0000000000000002"], [0.9999999999999999, "0.9999999999999999"]
  ])("formats %s as %s", (value, expected) => { expect(jdk20DoubleText(value)).toBe(expected) })

  it("chooses the even canonical significand when both shortest decimals are exactly equally distant", () => {
    const value = 2 ** -25
    // x = 298023223876953125 * 10^-25; candidates end in 12/13 at 10^-24.
    const exact = 298023223876953125n
    expect(exact - 29802322387695312n * 10n).toBe(29802322387695313n * 10n - exact)
    expect(Number("2.9802322387695312e-8")).toBe(value)
    expect(Number("2.9802322387695313e-8")).toBe(value)
    expect(jdk20DoubleText(value)).toBe("2.9802322387695312E-8")
  })

  it("keeps the power-of-two boundary's asymmetric rounding interval when the closer lower tie cannot roundtrip", () => {
    const value = 2 ** -24
    expect(Number("5.960464477539062e-8")).not.toBe(value)
    expect(Number("5.960464477539063e-8")).toBe(value)
    expect(jdk20DoubleText(value)).toBe("5.960464477539063E-8")
  })

  it("matches an independent exact rational candidate search for the first 100 subnormal binary64 values", () => {
    const binaryDenominator = 1n << 1074n
    const view = new DataView(new ArrayBuffer(8))
    for (let bits = 1n; bits <= 100n; bits++) {
      view.setBigUint64(0, bits)
      const value = view.getFloat64(0)
      const candidates: Array<{ s: number; q: number; distance: bigint; denominator: bigint }> = []
      for (let q = -327; q <= -321; q++) {
        const denominator = 10n ** BigInt(-q)
        for (let s = 1; s <= 999; s++) {
          if (s % 10 === 0 || Number(`${s}e${q}`) !== value) continue
          const delta = BigInt(s) * binaryDenominator - bits * denominator
          candidates.push({ s, q, distance: delta < 0n ? -delta : delta, denominator })
        }
      }
      const shortest = Math.min(...candidates.map(candidate => String(candidate.s).length))
      expect(shortest).toBeLessThanOrEqual(3)
      const allowed = candidates.filter(candidate => String(candidate.s).length === shortest
        || (shortest === 1 && String(candidate.s).length === 2))
      allowed.sort((a, b) => {
        const delta = a.distance * b.denominator - b.distance * a.denominator
        return delta < 0n ? -1 : delta > 0n ? 1 : a.s % 2 - b.s % 2
      })
      const best = allowed[0]!
      const digits = String(best.s), order = best.q + digits.length - 1
      const expected = `${digits[0]}.${digits.slice(1) || "0"}E${order}`
      expect(jdk20DoubleText(value)).toBe(expected)
    }
  })

  it("roundtrips every one-digit decimal order, each sign, and every immediate binary64 neighbor", () => {
    const view = new DataView(new ArrayBuffer(8))
    for (let exponent = -324; exponent <= 308; exponent++) {
      for (let significand = 1; significand <= 9; significand++) {
        const value = Number(`${significand}e${exponent}`)
        if (value === 0 || !Number.isFinite(value)) continue
        view.setFloat64(0, value)
        const bits = view.getBigUint64(0)
        for (const candidateBits of [bits - 1n, bits, bits + 1n]) {
          view.setBigUint64(0, candidateBits)
          const candidate = view.getFloat64(0)
          if (!Number.isFinite(candidate)) continue
          for (const signed of [candidate, -candidate]) {
            const formatted = jdk20DoubleText(signed)
            expect(Object.is(Number(formatted), signed)).toBe(true)
            expect(formatted).not.toMatch(/[e+]/)
            expect(formatted).toMatch(/^-?(?:\d+\.\d+|0\.\d+)(?:E-?\d+)?$/)
          }
        }
      }
    }
  })
})
