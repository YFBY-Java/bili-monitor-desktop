import { describe, expect, it } from "vitest"
import { lookupFollowerEnvironment, resolveFollowerPlaceholders } from "./follower-configuration-placeholders"

function lookup(properties: Record<string, string> = {}) {
  const entries = new Map(Object.entries(properties))
  return (name: string): string | undefined => entries.get(name)
}

describe("Spring 6.1 follower placeholder grammar", () => {
  it.each([false, true])("leaves literal text and SpEL untouched, strict=%j", strict => {
    expect(resolveFollowerPlaceholders("prefix #{2 + 3} {literal} $ suffix", lookup(), strict))
      .toBe("prefix #{2 + 3} {literal} $ suffix")
  })

  it.each([
    ["${A}", "actual"],
    ["prefix${A}suffix", "prefixactualsuffix"],
    ["${A}/${A}", "actual/actual"],
    ["${A:unused}", "actual"],
    ["${MISSING:fallback}", "fallback"],
    ["${MISSING:}", ""],
    ["${EMPTY:fallback}", ""],
    ["${MISSING:https://www.bilibili.com/a:b}", "https://www.bilibili.com/a:b"],
    ["${MISSING:{a:{b}}}", "{a:{b}}"],
    ["${A:COLON}", "whole-key"],
    ["${:fallback}", "empty-key"],
    ["$${A}", "$actual"],
    ["\\${A}", "\\actual"],
    ["${REF}", "actual"],
    ["${PREFIX_${KEY}}", "actual"],
    ["${MISSING:${A}}", "actual"],
    ["${MISSING:${MISSING:fallback}}", "fallback"],
    ["${A:${A}}", "actual"],
    ["${MISSING:one:two:three}", "one:two:three"],
    ["${MISSING:{}}tail${A}", "{}tailactual"]
  ])("resolves %j", (input, expected) => {
    const properties = { A: "actual", EMPTY: "", "A:COLON": "whole-key", "": "empty-key",
      REF: "${A}", KEY: "VALUE", PREFIX_VALUE: "actual" }
    expect(resolveFollowerPlaceholders(input, lookup(properties), false)).toBe(expected)
    expect(resolveFollowerPlaceholders(input, lookup(properties), true)).toBe(expected)
  })

  it.each([false, true])("leaves unmatched openings unchanged and stops scanning, strict=%j", strict => {
    expect(resolveFollowerPlaceholders("${MISSING ${A}", lookup({ A: "actual" }), strict))
      .toBe("${MISSING ${A}")
    expect(resolveFollowerPlaceholders("${A}/${MISSING", lookup({ A: "actual" }), strict))
      .toBe("actual/${MISSING")
    expect(resolveFollowerPlaceholders("${MISSING:{a}${A}", lookup({ A: "actual" }), strict))
      .toBe("${MISSING:{a}${A}")
  })

  it("preserves unresolved tokens but continues through following tokens in Binder mode", () => {
    expect(resolveFollowerPlaceholders("${MISSING}/${A}", lookup({ A: "actual" }), false))
      .toBe("${MISSING}/actual")
  })

  it("preserves the original outer token when an expanded dynamic key remains unresolved", () => {
    expect(resolveFollowerPlaceholders("${${K}}/${A}", lookup({ K: "OTHER", A: "actual" }), false))
      .toBe("${${K}}/actual")
  })

  it("eagerly expands defaults but Binder may retain unresolved defaults when a key exists", () => {
    expect(resolveFollowerPlaceholders("${A:${MISSING}}", lookup({ A: "actual" }), false)).toBe("actual")
  })

  it.each(["${MISSING}", "${${K}}", "${A:${MISSING}}"])("strict resolution rejects %j", input => {
    expect(() => resolveFollowerPlaceholders(input, lookup({ A: "actual", K: "OTHER" }), true))
      .toThrow("Unresolved follower configuration placeholder")
  })

  it.each([false, true])("does not rescan placeholders formed across adjacent replacements, strict=%j", strict => {
    expect(resolveFollowerPlaceholders("${A}${B}", lookup({ A: "$", B: "{C}", C: "7" }), strict))
      .toBe("${C}")
    expect(resolveFollowerPlaceholders("${A}{C}", lookup({ A: "$", C: "7" }), strict))
      .toBe("${C}")
  })

  it.each([false, true])("allows independent references after the active recursion ends, strict=%j", strict => {
    expect(resolveFollowerPlaceholders("${REF}/${REF}", lookup({ REF: "${A}", A: "actual" }), strict))
      .toBe("actual/actual")
  })

  it.each([false, true])("rejects self, indirect and eagerly evaluated default cycles, strict=%j", strict => {
    for (const [input, properties] of [
      ["${A}", { A: "${A}" }],
      ["${A}", { A: "${B}", B: "${A}" }],
      ["${A:${B}}", { A: "actual", B: "${B}" }],
      ["${A:unused}", { A: "${A:unused}" }]
    ] as const) {
      expect(() => resolveFollowerPlaceholders(input, lookup(properties), strict))
        .toThrow("Circular follower configuration placeholder")
    }
  })

  it("does not expose names or values in unresolved errors", () => {
    expect(() => resolveFollowerPlaceholders("${SYNTHETIC_PRIVATE}", lookup(), true))
      .toThrow(/^Unresolved follower configuration placeholder$/u)
  })

  it("does not expose names or values in cyclic errors", () => {
    expect(() => resolveFollowerPlaceholders("${SYNTHETIC_PRIVATE}",
      lookup({ SYNTHETIC_PRIVATE: "secret-fixture-${SYNTHETIC_PRIVATE}" }), false))
      .toThrow(/^Circular follower configuration placeholder$/u)
  })
})

describe("Spring system environment candidate lookup", () => {
  it.each([
    { "synthetic.env-name": "exact", "synthetic_env-name": "dots", "synthetic.env_name": "hyphens",
      synthetic_env_name: "both", "SYNTHETIC.ENV-NAME": "upper-exact", SYNTHETIC_ENV_NAME: "upper-both" },
    { "synthetic_env-name": "dots", "synthetic.env_name": "hyphens", synthetic_env_name: "both" },
    { "synthetic.env_name": "hyphens", synthetic_env_name: "both" },
    { synthetic_env_name: "both", "SYNTHETIC.ENV-NAME": "upper-exact" },
    { "SYNTHETIC.ENV-NAME": "upper-exact", "SYNTHETIC_ENV-NAME": "upper-dots",
      "SYNTHETIC.ENV_NAME": "upper-hyphens", SYNTHETIC_ENV_NAME: "upper-both" },
    { "SYNTHETIC_ENV-NAME": "upper-dots", "SYNTHETIC.ENV_NAME": "upper-hyphens", SYNTHETIC_ENV_NAME: "upper-both" },
    { "SYNTHETIC.ENV_NAME": "upper-hyphens", SYNTHETIC_ENV_NAME: "upper-both" },
    { SYNTHETIC_ENV_NAME: "upper-both" }
  ])("uses the first matching candidate: %j", environment => {
    expect(lookupFollowerEnvironment(environment, "synthetic.env-name")).toBe(Object.values(environment)[0])
  })

  it("preserves an exact empty string rather than choosing a lower-priority value", () => {
    expect(lookupFollowerEnvironment({ "synthetic.env-name": "", SYNTHETIC_ENV_NAME: "fallback" }, "synthetic.env-name"))
      .toBe("")
  })

  it("treats undefined environment values as missing", () => {
    expect(lookupFollowerEnvironment({ "synthetic.env-name": undefined, SYNTHETIC_ENV_NAME: "fallback" }, "synthetic.env-name"))
      .toBe("fallback")
  })

  it("does not trim names", () => {
    expect(lookupFollowerEnvironment({ A: "actual" }, " A ")).toBeUndefined()
    expect(lookupFollowerEnvironment({ " A ": "exact" }, " A ")).toBe("exact")
  })

  it("uses locale-independent uppercasing", () => {
    expect(lookupFollowerEnvironment({ MIX_I_SS: "actual" }, "mix.ı-ß")).toBe("actual")
  })

  it("ignores inherited and Object.prototype properties", () => {
    const environment: NodeJS.ProcessEnv = {}
    Object.setPrototypeOf(environment, { INHERITED: "private-fixture" })
    for (const name of ["inherited", "toString", "constructor", "__proto__"]) {
      expect(lookupFollowerEnvironment(environment, name)).toBeUndefined()
    }
  })

  it("allows an explicitly supplied own property with a prototype-looking name", () => {
    const environment: NodeJS.ProcessEnv = {}
    Object.defineProperty(environment, "__proto__", { value: "own-value", enumerable: true })
    expect(lookupFollowerEnvironment(environment, "__proto__")).toBe("own-value")
  })

  it("returns undefined for absent names", () => {
    expect(lookupFollowerEnvironment({}, "MISSING")).toBeUndefined()
  })
})
