import type { BilibiliLiveSessionExportCategory } from "@bmd/contracts"

const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
})

const categorySuffix: Record<BilibiliLiveSessionExportCategory, string> = {
  danmaku: "弹幕.csv", gifts: "礼物.csv", users: "用户.csv",
  xlsx: "完整数据.xlsx", all: "完整数据.zip"
}

// Java String.strip excludes NBSP, figure/narrow no-break spaces and BOM, unlike JS trim.
// ASCII controls are already replaced with underscores before this whitespace rule runs.
const originalEdgeWhitespace = /^[\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/g

export function bilibiliLiveExportDate(now: Date): string {
  const parts = shanghaiDate.formatToParts(now)
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-")
}

export function bilibiliLiveExportFileName(input: {
  uname: string | null | undefined
  uid: string
  date: string
  number: number
  category: BilibiliLiveSessionExportCategory
}): string {
  // Match the original replacement before trimming, and truncate code points, not UTF-16 units.
  const sanitized = input.uname?.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(originalEdgeWhitespace, "")
  const prefix = sanitized ? Array.from(sanitized).slice(0, 80).join("") : `uid-${input.uid}`
  return `${prefix}-${input.date}-第${input.number}次导出-${categorySuffix[input.category]}`
}
