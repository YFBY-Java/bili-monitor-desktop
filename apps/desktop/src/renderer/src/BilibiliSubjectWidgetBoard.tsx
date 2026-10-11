import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react"

type SubjectBoardStyle = CSSProperties & {
  "--subject-main-width": string
  "--subject-widget-height": string
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function BilibiliSubjectWidgetBoard({ primary, secondary, children }: {
  primary: ReactNode
  secondary: ReactNode
  children: ReactNode
}): JSX.Element {
  const boardRef = useRef<HTMLElement>(null)
  const primaryRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)
  const resizeFrameRef = useRef<number | null>(null)
  const [mainWidthPercent, setMainWidthPercent] = useState(61)
  const [primaryHeight, setPrimaryHeight] = useState(650)
  const [resizing, setResizing] = useState(false)

  useEffect(() => () => {
    cleanupRef.current?.()
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = null
    }
  }, [])

  const requestChartResize = (): void => {
    if (resizeFrameRef.current !== null) return
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null
      window.dispatchEvent(new Event("resize"))
    })
  }

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const board = boardRef.current
    const primaryElement = primaryRef.current
    if (!board || !primaryElement || event.button !== 0) return
    const boardRect = board.getBoundingClientRect()
    const mainRect = primaryElement.getBoundingClientRect()
    if (boardRect.width <= 0) return

    event.preventDefault()
    cleanupRef.current?.()
    const startX = event.clientX
    const startY = event.clientY
    const startHeight = primaryHeight
    const pointerId = event.pointerId
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    let stopped = false

    const handleResize = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return
      const minimumSideWidth = boardRect.width >= 960 ? 360 : 0
      const minimumMainWidth = boardRect.width >= 960 ? 520 : 320
      const nextMainWidth = clamp(
        mainRect.width + moveEvent.clientX - startX,
        minimumMainWidth,
        Math.max(minimumMainWidth, boardRect.width - minimumSideWidth - 18)
      )
      setMainWidthPercent(clamp(nextMainWidth / boardRect.width * 100, 44, 76))
      setPrimaryHeight(clamp(startHeight + moveEvent.clientY - startY, 560, 920))
      requestChartResize()
    }
    const cleanup = (): void => {
      if (stopped) return
      stopped = true
      window.removeEventListener("pointermove", handleResize)
      window.removeEventListener("pointerup", finishPointerResize)
      window.removeEventListener("pointercancel", finishPointerResize)
      window.removeEventListener("blur", finishResize)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      cleanupRef.current = undefined
    }
    const finishResize = (): void => {
      cleanup()
      setResizing(false)
      requestChartResize()
    }
    const finishPointerResize = (finishEvent: PointerEvent): void => {
      if (finishEvent.pointerId === pointerId) finishResize()
    }

    cleanupRef.current = cleanup
    setResizing(true)
    document.body.style.cursor = "nwse-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", handleResize)
    window.addEventListener("pointerup", finishPointerResize)
    window.addEventListener("pointercancel", finishPointerResize)
    window.addEventListener("blur", finishResize)
  }

  const boardStyle: SubjectBoardStyle = {
    "--subject-main-width": `${mainWidthPercent}%`,
    "--subject-widget-height": `${primaryHeight}px`
  }
  return (
    <section
      ref={boardRef}
      className={`subject-widget-grid subject-widget-board${resizing ? " is-resizing" : ""}`}
      style={boardStyle}
    >
      <div ref={primaryRef} className="subject-board-primary subject-board-resizable">
        {primary}
        <button
          className="subject-board-resize-handle"
          type="button"
          aria-label="拖动调整趋势图大小"
          title="拖动调整趋势图大小"
          onPointerDown={startResize}
        ><span /></button>
      </div>
      <div className="subject-board-primary">{secondary}</div>
      {children}
    </section>
  )
}
