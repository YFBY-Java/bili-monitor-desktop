import { describe, expect, it } from "vitest"

import { followerStoredNickname } from "./follower-profile-storage-text"

describe("follower nickname VARCHAR(160) storage text", () => {
  it.each([
    ["empty text", ""],
    ["short text with surrounding spaces", "  name  "],
    ["160 ASCII characters", "a".repeat(160)],
    ["exactly 160 characters with leading and trailing spaces", ` ${"a".repeat(158)} `],
    ["160 supplementary Unicode code points", "😀".repeat(160)]
  ])("preserves %s", (_label, value) => {
    expect(followerStoredNickname(value)).toBe(value)
  })

  it.each([
    ["one overflowing ASCII space", `${"a".repeat(160)} `, "a".repeat(160)],
    ["overflowing spaces after emoji", `${"😀".repeat(160)}   `, "😀".repeat(160)],
    ["spaces within the retained 160 characters", `${"a".repeat(159)}    `, `${"a".repeat(159)} `]
  ])("truncates only %s", (_label, value, expected) => {
    expect(followerStoredNickname(value)).toBe(expected)
  })

  it.each([
    ["161 ASCII characters", "a".repeat(161)],
    ["161 Chinese characters", "中".repeat(161)],
    ["161 supplementary Unicode code points", "😀".repeat(161)],
    ["an overflowing tab", `${"a".repeat(160)}\t`],
    ["an overflowing nonbreaking space", `${"a".repeat(160)}\u00a0`],
    ["a nonspace after overflowing ASCII spaces", `${"a".repeat(160)}  z`]
  ])("rejects %s without exposing the value", (_label, value) => {
    expect(() => followerStoredNickname(value)).toThrowError(new Error("Follower nickname exceeds VARCHAR(160)."))
  })
})
