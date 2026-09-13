import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

export function useFollowerTrendDrag(ids: string[], onSwap: ((source: string, target: string) => void) | undefined) {
  const board = useRef<HTMLDivElement>(null)
  const latest = useRef({ ids, onSwap })
  latest.current = { ids, onSwap }
  const cleanup = useRef<() => void>(() => {})
  const [drag, setDrag] = useState<{ source?: string; target?: string }>({})
  const key = ids.join(",")
  useEffect(() => { cleanup.current(); setDrag({}); return () => cleanup.current() }, [key])
  const hit = (x: number, y: number, source: string): string | undefined => {
    const rect = board.current?.getBoundingClientRect()
    if (!rect || x < rect.left - 24 || x > rect.right + 24 || y < rect.top - 24 || y > rect.bottom + 24) return
    const cards = [...board.current!.querySelectorAll<HTMLElement>("[data-trend-user-id]")]
      .filter(element => element.dataset.trendUserId !== source)
      .map(element => ({ id: element.dataset.trendUserId!, rect: element.getBoundingClientRect() }))
    return cards.find(card => x >= card.rect.left && x <= card.rect.right && y >= card.rect.top && y <= card.rect.bottom)?.id
      ?? cards.sort((a, b) => Math.hypot(x - a.rect.x - a.rect.width / 2, y - a.rect.y - a.rect.height / 2)
        - Math.hypot(x - b.rect.x - b.rect.width / 2, y - b.rect.y - b.rect.height / 2))[0]?.id
  }
  const start = (source: string, event: ReactPointerEvent<HTMLElement>) => {
    if (ids.length < 2 || event.button !== 0 || !onSwap || (event.target instanceof Element && event.target.closest("button,a,input,textarea,select"))) return
    cleanup.current()
    const element = event.currentTarget, pointer = event.pointerId, x = event.clientX, y = event.clientY
    let moved = false, target: string | undefined
    element.setPointerCapture(pointer)
    const cancel = () => { cleanup.current(); setDrag({}) }
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer || (!moved && Math.hypot(next.clientX - x, next.clientY - y) < 8)) return
      moved = true
      next.preventDefault()
      target = hit(next.clientX, next.clientY, source)
      setDrag({ source, ...(target ? { target } : {}) })
    }
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return
      const destination = hit(next.clientX, next.clientY, source) ?? target
      if (moved && destination && latest.current.ids.includes(source) && latest.current.ids.includes(destination)) latest.current.onSwap?.(source, destination)
      cancel()
    }
    const cancelPointer = (next: PointerEvent) => { if (next.pointerId === pointer) cancel() }
    cleanup.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancelPointer)
      if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer)
      window.getSelection()?.removeAllRanges()
      cleanup.current = () => {}
    }
    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", cancelPointer)
  }
  return { board, drag, start }
}
