import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as contracts from "./index"

const cases = JSON.parse(readFileSync(new URL("../fixtures/follower-long64-canonical.json", import.meta.url), "utf8")) as Array<{
  name: string; value: unknown; canonical: boolean; positive: boolean; legacySignedSafe: boolean
}>

describe("Java Long canonical wire domain", () => {
  it.each(cases)("validates canonical signed strings: $name", fixture => {
    expect(contracts).toHaveProperty("JavaLongStringSchema")
    const result = contracts.JavaLongStringSchema.safeParse(fixture.value)
    expect(result.success).toBe(fixture.canonical)
    if (result.success) expect(result.data).toBe(fixture.value)
  })
  it.each(cases)("validates positive request strings: $name", fixture => {
    expect(contracts).toHaveProperty("PositiveJavaLongStringSchema")
    expect(contracts.PositiveJavaLongStringSchema.safeParse(fixture.value).success).toBe(fixture.positive)
  })
  it.each(cases.filter(fixture => fixture.canonical))("converts exact strings to bigint: $name", fixture => {
    expect(contracts).toHaveProperty("javaLongToBigInt")
    expect(typeof fixture.value).toBe("string")
    expect(contracts.javaLongToBigInt(String(fixture.value))).toBe(BigInt(String(fixture.value)))
  })
  it.each([0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])("accepts only exact legacy numeric input: %s", value => {
    expect(contracts).toHaveProperty("javaLongToBigInt")
    expect(contracts.javaLongToBigInt(value)).toBe(BigInt(value))
  })
  it.each([Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, 0.5, NaN, Infinity])("rejects inexact numeric input: %s", value => {
    expect(contracts).toHaveProperty("javaLongToBigInt")
    expect(() => contracts.javaLongToBigInt(value)).toThrow(RangeError)
  })
  it.each([-9223372036854775808n, 9223372036854775807n])("accepts bigint endpoints: %s", value => {
    expect(contracts).toHaveProperty("javaLongToBigInt")
    expect(contracts.javaLongToBigInt(value)).toBe(value)
  })
  it.each([-9223372036854775809n, 9223372036854775808n, "01", "+1", "-0", "1\n"])("rejects invalid exact-domain input: %s", value => {
    expect(contracts).toHaveProperty("javaLongToBigInt")
    expect(() => contracts.javaLongToBigInt(value)).toThrow(RangeError)
  })
  it.each(cases.filter(fixture => fixture.canonical))("projects signed safe v1 numbers explicitly: $name", fixture => {
    expect(contracts).toHaveProperty("javaLongToLegacyNumber")
    if (fixture.legacySignedSafe) {
      expect(contracts.javaLongToLegacyNumber(String(fixture.value))).toBe(Number(fixture.value))
    } else {
      expect(() => contracts.javaLongToLegacyNumber(String(fixture.value)))
        .toThrow("LONG64_LEGACY_PRECISION_UNSUPPORTED")
    }
  })
  it("accepts bigint for explicit legacy projection", () => {
    expect(contracts).toHaveProperty("javaLongToLegacyNumber")
    expect(contracts.javaLongToLegacyNumber(-12n)).toBe(-12)
    expect(() => contracts.javaLongToLegacyNumber(9223372036854775807n)).toThrow(RangeError)
  })
  it.each([
    { current: 9007199254740993n, previous: 9007199254740992n, expected: 1n },
    { current: -9223372036854775808n, previous: 1n, expected: 9223372036854775807n },
    { current: 9223372036854775807n, previous: -1n, expected: -9223372036854775808n },
    { current: -9223372036854775808n, previous: 9223372036854775807n, expected: 1n }
  ])("preserves Java signed64 delta: $current - $previous", fixture => {
    expect(contracts).toHaveProperty("javaLongDelta")
    expect(contracts.javaLongDelta(fixture.current, fixture.previous)).toBe(fixture.expected)
  })
})
