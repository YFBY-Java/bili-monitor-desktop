// Original OffsetDateTime compares instants, not their ISO spelling or rounded milliseconds.
export function compareLiveSnapshotTime(left: string, right: string): number {
  const key = (value: string): string => {
    const fraction = value.match(/\.(\d+)/)?.[1] ?? ""
    return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(9, "0").slice(0, 9)}`
  }
  const first = key(left), second = key(right)
  return first < second ? -1 : first > second ? 1 : 0
}

// Character.isWhitespace/String.isBlank excludes NBSP, figure/narrow no-break spaces and BOM.
export function hasLiveSnapshotText(value: string | null | undefined): value is string {
  return typeof value === "string"
    && !/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/.test(value)
}
