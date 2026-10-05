import { describe, expect, it } from "vitest"

import { normalizeFollowerUidInput } from "./follower-uid-input"

describe("precision-safe follower UID input", () => {
  it.each([
    ["2", "2"], ["+2", "2"], ["0002", "2"], ["+0002", "2"],
    ["2.0", "2"], ["2.", "2"], ["+002.000", "2"],
    ["2e0", "2"], ["2E+0", "2"], ["2e-0", "2"], ["2e+000", "2"],
    [".2e1", "2"], ["+.2e+1", "2"], ["2.e1", "20"],
    ["0.02e2", "2"], ["200e-2", "2"], ["200.00e-2", "2"],
    ["1000e-3", "1"], ["1.5e1", "15"], ["15e1", "150"],
    ["9007199254740991", "9007199254740991"],
    ["9007199254740992", "9007199254740992"],
    ["9007199254740993", "9007199254740993"],
    ["9007199254740993.0", "9007199254740993"],
    ["9.007199254740993e15", "9007199254740993"],
    ["9223372036854775807", "9223372036854775807"],
    ["+009223372036854775807.000", "9223372036854775807"],
    ["9.223372036854775807e18", "9223372036854775807"],
    [".9223372036854775807e19", "9223372036854775807"],
    ["92233720368547758070e-1", "9223372036854775807"],
    ["9223372036854775807000.00e-3", "9223372036854775807"],
    ["0x2", "2"], ["0X000F", "15"], ["0b10", "2"], ["0B0010", "2"],
    ["0o2", "2"], ["0O00017", "15"],
    ["0x20000000000001", "9007199254740993"],
    ["0x7fffffffffffffff", "9223372036854775807"],
    ["0X7FFFFFFFFFFFFFFF", "9223372036854775807"],
    ["0b111111111111111111111111111111111111111111111111111111111111111", "9223372036854775807"],
    ["0o777777777777777777777", "9223372036854775807"]
  ])("normalizes the exact integer %s to %s", (raw, expected) => {
    expect(normalizeFollowerUidInput(raw)).toBe(expected)
  })

  it.each([
    "", " ", "0", "000", "+0", "-0", "-2", "-0002.0", "-2e0", "-.2e1",
    ".", "+", "-", "NaN", "Infinity", "+Infinity", "-Infinity", "infinity",
    "2.5", ".2", "2e-1", "200e-3", "2.0000000000000001", "9007199254740992.5",
    "9223372036854775807.1", "9223372036854775808", "9223372036854775808.0",
    "9.223372036854775808e18", "92233720368547758080e-1", "1e19", "1e21",
    "1e-100", "1e100", "1e", "1e+", "1e-", "2ee1", "2e1.0", "2.0.0",
    "2n", "2_000", "2,000", "2 0", "2\n0", "  + 2  ", "0x", "0b", "0o",
    "0x0", "0b0", "0o0", "+0x2", "-0x2", "+0b10", "-0o2",
    "0x2.0", "0b2", "0o8", "0xg", "0x8000000000000000",
    "0b1000000000000000000000000000000000000000000000000000000000000000",
    "0o1000000000000000000000", "０２", "２", "١٢", "2\u0000"
  ])("rejects the nonpositive, fractional, malformed or overflowing input %j", raw => {
    expect(normalizeFollowerUidInput(raw)).toBeUndefined()
  })

  const ecmascriptWhitespace = [
    0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff
  ]
  it.each(ecmascriptWhitespace)("trims ECMAScript whitespace U+%s around numeric syntax", codePoint => {
    const whitespace = String.fromCodePoint(codePoint)
    expect(normalizeFollowerUidInput(`${whitespace}+002.0${whitespace}`)).toBe("2")
  })
  it.each([0x0085, 0x180e, 0x200b, 0x2060])("does not trim non-ECMAScript character U+%s", codePoint => {
    expect(normalizeFollowerUidInput(`${String.fromCodePoint(codePoint)}2`)).toBeUndefined()
  })

  it.each([
    [`${"0".repeat(5_000)}2`, "2"],
    [`0x${"0".repeat(5_000)}2`, "2"],
    [`0b${"0".repeat(5_000)}10`, "2"],
    [`0o${"0".repeat(5_000)}2`, "2"],
    [`2e+${"0".repeat(5_000)}`, "2"],
    [`2e-${"0".repeat(5_000)}`, "2"],
    [`2e${"0".repeat(5_000)}1`, "20"],
    [`2${"0".repeat(5_000)}e-5000`, "2"],
    [`.${"0".repeat(5_000)}2e5001`, "2"],
    [`9223372036854775807${"0".repeat(5_000)}e-5000`, "9223372036854775807"],
    [`9223372036854775807.${"0".repeat(5_000)}`, "9223372036854775807"]
  ])("accepts an integer whose syntax contains 5000 padding characters (#%#)", (raw, expected) => {
    expect(normalizeFollowerUidInput(raw)).toBe(expected)
  })
  it.each([
    `2e${"9".repeat(5_000)}`, `2e-${"9".repeat(5_000)}`,
    `2${"3".repeat(5_000)}`, `2.${"0".repeat(5_000)}1`,
    `0x${"f".repeat(5_000)}`, `0b${"1".repeat(5_000)}`, `0o${"7".repeat(5_000)}`,
    `0e${"9".repeat(5_000)}`, `9223372036854775808${"0".repeat(5_000)}e-5000`
  ])("rejects huge exact overflow or noninteger syntax without expanding it (#%#)", raw => {
    expect(normalizeFollowerUidInput(raw)).toBeUndefined()
  })

  it("rejects long internal zero runs without quadratic trailing-zero backtracking", () => {
    const raw = `1${"0".repeat(50_000)}1`
    const started = performance.now()
    expect(normalizeFollowerUidInput(raw)).toBeUndefined()
    // The previous suffix regex took ~1.4s for only 50KB; linear scanning is <10ms.
    expect(performance.now() - started).toBeLessThan(500)
  })
})
