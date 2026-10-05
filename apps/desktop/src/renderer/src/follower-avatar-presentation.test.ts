import { expect, it } from "vitest"
import { safeFollowerAvatar } from "./follower-monitor-presentation"

it.each([
  ["https://example.invalid/a.jpg", "https://example.invalid/a.jpg"],
  ["http://example.invalid/a.jpg", "http://example.invalid/a.jpg"],
  ["//example.invalid/a.jpg", "https://example.invalid/a.jpg"],
  ["  https://example.invalid/a.jpg  ", "https://example.invalid/a.jpg"],
  ["http://i2.hdslb.com/a.jpg", "https://i2.hdslb.com/a.jpg"],
  ["http://i0.hdslb.com/a.jpg", "https://i0.hdslb.com/a.jpg"],
  ["http://i1.hdslb.com/a.jpg", "https://i1.hdslb.com/a.jpg"],
  ["http://archive.biliimg.com/a.jpg", "https://archive.biliimg.com/a.jpg"],
  [undefined, undefined], ["", undefined], ["false", undefined], ["/avatar.jpg", undefined],
  ["file:///D:/synthetic-secret", undefined], ["javascript:alert(1)", undefined],
  ["data:image/png,synthetic", undefined], ["https://user:pass@example.invalid/a", undefined],
  ["https://example.invalid:bad/a", undefined], ["ftp://example.invalid/a", undefined]
])("projects remote avatar %s without changing the raw stored field", (raw, expected) => {
  expect(safeFollowerAvatar(raw)).toBe(expected)
})
