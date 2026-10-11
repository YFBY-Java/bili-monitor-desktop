import type { BilibiliLiveSessionEventPage } from "@bmd/contracts"
import type { JSX } from "react"

export function SessionEventPagination({ result, pending, size, onPageChange, onSizeChange }: {
  result?: BilibiliLiveSessionEventPage
  pending: boolean
  size: number
  onPageChange: (page: number) => void
  onSizeChange: (size: number) => void
}): JSX.Element {
  const current = result?.page ?? 1
  const count = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.size ?? size)))
  const disabled = pending || !result
  const changePage = (page: number): void => {
    const next = Math.min(count, Math.max(1, page))
    if (!disabled && next !== current) onPageChange(next)
  }
  return <footer>
    <nav className="session-event-pagination" aria-label="事件分页">
      <button type="button" disabled={disabled || current <= 1} onClick={() => changePage(current - 1)}>上一页</button>
      {pagerItems(current, count).map(item => typeof item === "number"
        ? <button type="button" key={item} disabled={disabled} aria-label={`第 ${item} 页`}
            aria-current={item === current ? "page" : undefined} onClick={() => changePage(item)}>{item}</button>
        : <button type="button" key={item} disabled={disabled}
            aria-label={item === "previous" ? "向前跳 5 页" : "向后跳 5 页"}
            onClick={() => changePage(current + (item === "previous" ? -5 : 5))}>…</button>)}
      <button type="button" disabled={disabled || current >= count} onClick={() => changePage(current + 1)}>下一页</button>
    </nav>
    <span>{result ? `第 ${current} / ${count} 页` : "尚未取得分页结果"}</span>
    <label>每页条数
      <select value={size} onChange={event => onSizeChange(Number(event.target.value))}>
        {[25, 50, 100].map(value => <option key={value} value={value}>{value} 条</option>)}
      </select>
    </label>
  </footer>
}

// Preserve the original default seven numeric pages and five-page quick jumps.
function pagerItems(current: number, count: number): Array<number | "previous" | "next"> {
  const previous = count > 7 && current > 4
  const next = count > 7 && current < count - 3
  const start = previous ? next ? current - 2 : count - 5 : 2
  const end = next ? previous ? current + 2 : 6 : count - 1
  const items: Array<number | "previous" | "next"> = [1]
  if (previous) items.push("previous")
  for (let page = start; page <= end; page++) items.push(page)
  if (next) items.push("next")
  if (count > 1) items.push(count)
  return items
}
