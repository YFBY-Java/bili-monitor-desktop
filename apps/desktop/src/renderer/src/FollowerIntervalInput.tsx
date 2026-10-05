import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react"

import { clampFollowerInterval, followerIntervalStep, MAX_FOLLOWER_INTERVAL } from "./follower-interval-draft"

// ElementPlus InputNumber (source version 2.14.1): input updates the integer
// parent model but retains raw text; external commits must not clear that cache.
export function FollowerIntervalInput({ value, onChange }: { value: number; onChange: (value: number) => void }): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const rawRef = useRef<string | null>(null)
  const [currentValue, setCurrentValue] = useState(value)
  const currentValueRef = useRef(value)
  const previousModel = useRef(value)
  const latest = useRef({ value, onChange })
  useLayoutEffect(() => {
    latest.current = { value, onChange }
    if (rawRef.current === null && value !== previousModel.current) {
      currentValueRef.current = value
      setCurrentValue(value)
    }
    previousModel.current = value
  }, [value, onChange])
  function clearRaw(): void { rawRef.current = null; setRaw(null) }
  function adoptModel(): void {
    currentValueRef.current = latest.current.value
    setCurrentValue(latest.current.value)
  }
  useEffect(() => {
    const element = input.current
    if (!element) return
    // React onChange uses input events. The source additionally handles the
    // native change before blur, including re-emitting text after a late commit.
    const commitText = (): void => {
      const text = element.value
      const parsed = text === "" ? null : Number.parseFloat(text)
      const verified = parsed === null || Number.isNaN(parsed) ? null : Math.min(MAX_FOLLOWER_INTERVAL, Math.max(1, parsed))
      if (verified !== currentValueRef.current || !parsed) latest.current.onChange(clampFollowerInterval(verified ?? 1))
      clearRaw()
      adoptModel()
    }
    const preventFocusedWheel = (event: WheelEvent): void => {
      if (document.activeElement === element) event.preventDefault()
    }
    element.addEventListener("change", commitText)
    element.addEventListener("wheel", preventFocusedWheel, { passive: false })
    return () => {
      element.removeEventListener("change", commitText)
      element.removeEventListener("wheel", preventFocusedWheel)
    }
  }, [])

  return <input ref={input} className="follower-interval-input" type="number" min={1} max={MAX_FOLLOWER_INTERVAL} step={followerIntervalStep(value)}
    value={raw ?? currentValue} onChange={event => {
      rawRef.current = event.target.value
      setRaw(event.target.value)
      onChange(clampFollowerInterval(Number.parseFloat(event.target.value)))
    }} onBlur={clearRaw} onKeyDown={event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      const direction = event.key === "ArrowUp" ? 1 : -1
      if (direction > 0 ? value >= MAX_FOLLOWER_INTERVAL : value <= 1) return
      const next = clampFollowerInterval((Number(rawRef.current ?? currentValueRef.current) || 0) + direction * followerIntervalStep(value))
      clearRaw()
      onChange(next)
      adoptModel()
    }} />
}
