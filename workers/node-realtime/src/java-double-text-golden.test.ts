import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { jdk20DoubleText } from "./bilibili-danmaku-message-text"

const cases: Array<{ name: string; token: string; text: string }> = JSON.parse(
  readFileSync(new URL("../../../packages/contracts/fixtures/java-double-text.json", import.meta.url), "utf8"))

describe("shared fixed JDK20 Double text golden", () => {
  it.each(cases)("$name", ({ token, text }) => {
    expect(jdk20DoubleText(Number(token))).toBe(text)
  })
})
