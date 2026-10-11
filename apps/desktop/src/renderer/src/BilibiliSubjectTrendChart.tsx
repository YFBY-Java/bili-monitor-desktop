import type { BilibiliSubjectTrendV3 } from "@bmd/contracts"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { formatFollowerCount, formatFollowerFixed } from "./follower-monitor-presentation"
import { followerValueRatio, followerValueTicks, type FollowerLongBounds } from "./follower-trend-presentation"
import { exactTrendLabelGutter } from "./trend-axis"

type Coordinate = { x: number; y: number }
const maximum = (...values: bigint[]) => values.reduce((result, value) => value > result ? value : result)
const absolute = (value: bigint) => value < 0n ? -value : value
const floorDivide = (value: bigint, divisor: bigint) => value / divisor - (value % divisor < 0n ? 1n : 0n)

// Original BilibiliFollowerLiveHeatWidget.vue dual-axis padding, not the
// single-follower chart's scale. Counts and bounds stay exact, even above 2^53.
function followerBounds(values: readonly bigint[]): FollowerLongBounds {
  if (!values.length) return { min: 0n, max: 1n, span: 1n }
  const low = values.reduce((result, value) => value < result ? value : result)
  const high = values.reduce((result, value) => value > result ? value : result)
  const magnitude = maximum(absolute(low), absolute(high), 1n)
  const scale = 100_000n
  const magnitudeFloor = maximum(60n * scale, magnitude * 3n < 2_400n * scale ? magnitude * 3n : 2_400n * scale)
  const visibleSpan = maximum(magnitudeFloor, (high - low) * 8n * scale)
  const padding = maximum(visibleSpan * 8n, 6n * 100n * scale)
  const center = (low + high) * 50n * scale
  const halfSpan = visibleSpan * 50n
  const denominator = 100n * scale
  const min = maximum(0n, floorDivide(center - halfSpan - padding, denominator))
  const upper = -floorDivide(-(center + halfSpan + padding), denominator)
  const max = maximum(min + 1n, upper)
  return { min, max, span: max - min }
}

function heatBounds(values: readonly bigint[]): FollowerLongBounds {
  if (!values.length) return { min: 0n, max: 1n, span: 1n }
  const low = values.reduce((result, value) => value < result ? value : result)
  const high = values.reduce((result, value) => value > result ? value : result)
  const magnitude = maximum(absolute(low), absolute(high), 1n)
  const unsafe = magnitude > BigInt(Number.MAX_SAFE_INTEGER)
  const scale = 100n
  const magnitudeFloor = unsafe ? 8n * scale : maximum(80n * scale, magnitude < 3_000_000n ? magnitude : 3_000_000n)
  const span = maximum(magnitudeFloor, (high - low) * 195n)
  const padding = maximum(span, 8n * 1000n)
  const center = (low + high) * 500n
  const lower = floorDivide(center - span * 5n - padding, 1000n)
  const min = low >= 0n ? maximum(0n, lower) : lower
  const max = maximum(min + 1n, -floorDivide(-(center + span * 5n + padding), 1000n))
  return { min, max, span: max - min }
}

function timeBounds(times: readonly number[]) {
  const first = Math.min(...times), last = Math.max(...times)
  const padding = first === last ? 900_000 : Math.min(Math.max((last - first) * 0.04, 60_000), 3_600_000)
  return { min: first - padding, max: last + padding }
}

function formatTime(time: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time))
}

function formatCount(value: bigint, axis = false): string {
  // Unlike the original browser Number, an unsafe Long never loses units in a
  // tooltip or axis label. Safe values retain the original compact formatting.
  if (absolute(value) > BigInt(Number.MAX_SAFE_INTEGER)) return formatFollowerCount(value)
  if (absolute(value) >= 100_000_000n) return `${formatFollowerFixed(value, 100_000_000n, 2, true)}亿`
  if (absolute(value) >= 10_000n) return `${formatFollowerFixed(value, 10_000n, axis ? 2 : 1, true)}万`
  return formatFollowerCount(value)
}

function smoothPath(points: readonly Coordinate[], smooth: number): string {
  const first = points[0]
  if (!first) return ""
  let path = `M${first.x} ${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]!, previous = points[index - 1]!
    const before = points[index - 2] ?? previous, after = points[index + 1] ?? current
    const dx = (current.x - previous.x) * smooth
    const clampY = (value: number) => Math.max(Math.min(previous.y, current.y), Math.min(Math.max(previous.y, current.y), value))
    path += ` C${previous.x + dx} ${clampY(previous.y + (current.y - before.y) * smooth)} ${current.x - dx} ${clampY(current.y - (after.y - previous.y) * smooth)} ${current.x} ${current.y}`
  }
  return path
}

export function BilibiliSubjectTrendChart({ trend }: { trend?: BilibiliSubjectTrendV3 }) {
  const frame = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null)
  const tooltipId = useId(), helpId = useId()
  const [size, setSize] = useState({ width: 640, height: 330 })
  const [active, setActive] = useState<number>()
  const points = useMemo(() => (trend?.points ?? []).flatMap(point => {
    const time = Date.parse(point.bucketAt)
    return Number.isFinite(time) && (point.followerCount !== undefined || point.liveOnlineCount !== undefined)
      ? [{ point, time }] : []
  }).sort((left, right) => left.time - right.time), [trend])
  const hasPoints = points.length > 0

  useEffect(() => {
    const element = frame.current
    if (!element || !hasPoints) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const next = { width: rect.width, height: rect.height }
      setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasPoints])
  useEffect(() => { setActive(undefined) }, [points])

  const geometry = useMemo(() => {
    const followers = points.flatMap(({ point, time }) => point.followerCount === undefined ? [] : [{ time, value: BigInt(point.followerCount) }])
    const heat = points.flatMap(({ point, time }) => point.liveOnlineCount === undefined ? [] : [{ time, value: BigInt(point.liveOnlineCount) }])
    const follower = followerBounds(followers.map(item => item.value)), live = heatBounds(heat.map(item => item.value))
    const time = hasPoints ? timeBounds(points.map(item => item.time)) : { min: 0, max: 1 }
    const followerTicks = followerValueTicks(follower), heatTicks = followerValueTicks(live)
    const wideFollower = followerTicks.some(value => absolute(value) > BigInt(Number.MAX_SAFE_INTEGER))
    const wideHeat = heatTicks.some(value => absolute(value) > BigInt(Number.MAX_SAFE_INTEGER))
    const left = wideFollower ? exactTrendLabelGutter(followerTicks.map(value => formatCount(value, true)), 72) : Math.min(72, size.width * 0.36)
    const rightGutter = wideHeat ? exactTrendLabelGutter(heatTicks.map(value => formatCount(value, true)), 72) : Math.min(72, size.width * 0.18)
    const plotWidth = Math.max(size.width, left + rightGutter + 120), right = plotWidth - rightGutter
    const top = 28, bottom = size.height - 40
    const mapX = (value: number) => left + (value - time.min) / (time.max - time.min) * (right - left)
    const mapFollower = (value: bigint) => bottom - followerValueRatio(value, follower) * (bottom - top)
    const mapHeat = (value: bigint) => bottom - followerValueRatio(value, live) * (bottom - top)
    const followerCoordinates = followers.map(item => ({ ...item, x: mapX(item.time), y: mapFollower(item.value) }))
    const heatCoordinates = heat.map(item => ({ ...item, x: mapX(item.time), y: mapHeat(item.value) }))
    const followerPath = smoothPath(followerCoordinates, 0.18), heatPath = smoothPath(heatCoordinates, 0.22)
    const ticks = Math.max(2, Math.min(4, Math.floor((right - left) / 145)))
    return { plotWidth, followers: followerCoordinates, heat: heatCoordinates, follower, live, left, right, top, bottom,
      mapX, mapFollower, mapHeat, followerPath, heatPath, followerTicks, heatTicks,
      timeTicks: Array.from({ length: ticks }, (_, index) => time.min + (time.max - time.min) * index / (ticks - 1)) }
  }, [points, hasPoints, size])
  const current = active === undefined ? undefined : points[active]
  const activeX = current ? geometry.mapX(current.time) : undefined
  const label = (index: number) => {
    const entry = points[index]!
    return `${formatTime(entry.time)}${entry.point.followerCount === undefined ? "" : `，粉丝数 ${formatCount(BigInt(entry.point.followerCount))}`}${entry.point.liveOnlineCount === undefined ? "" : `，直播间热度 ${formatCount(BigInt(entry.point.liveOnlineCount))}`}`
  }

  return <div className="subject-trend-chart">
    <div className="subject-chart-legend"><span className="follower">粉丝数</span><span className="live">直播间热度</span><span className="subject-chart-note">按采集时间对齐</span></div>
    <span id={helpId} className="subject-trend-a11y">左右方向键查看时间桶，Home 和 End 查看首末桶，Escape 关闭提示。</span>
    <div ref={frame} className="subject-trend-plot">
      {!hasPoints ? <span className="subject-trend-empty">暂无趋势点，等待粉丝或直播采集快照</span> : <svg ref={svg}
        viewBox={`0 0 ${geometry.plotWidth} ${size.height}`} role="img" aria-label="粉丝和热度时间趋势" aria-describedby={helpId}
        onPointerLeave={() => setActive(undefined)} onPointerMove={event => {
          if (event.buttons) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (!rect.width) return
          const x = (event.clientX - rect.left) * geometry.plotWidth / rect.width
          if (x < geometry.left || x > geometry.right) { setActive(undefined); return }
          let nearest = 0
          points.forEach((entry, index) => {
            if (Math.abs(geometry.mapX(entry.time) - x) < Math.abs(geometry.mapX(points[nearest]!.time) - x)) nearest = index
          })
          setActive(nearest)
        }}>
        <g className="subject-trend-axis">
          {geometry.followerTicks.map(value => <g key={value.toString()}>
            <path className="chart-axis" d={`M${geometry.left} ${geometry.mapFollower(value)} H${geometry.right}`} />
            {geometry.followers.length > 0 && <text x={geometry.left - 10} y={geometry.mapFollower(value)} textAnchor="end" dominantBaseline="middle">{formatCount(value, true)}</text>}
          </g>)}
          {geometry.heat.length > 0 && geometry.heatTicks.map(value => <text key={value.toString()} x={geometry.right + 10} y={geometry.mapHeat(value)} dominantBaseline="middle">{formatCount(value, true)}</text>)}
          <text className="subject-trend-axis-name" x={geometry.left} y={16}>粉丝</text>
          <text className="subject-trend-axis-name" x={geometry.right} y={16} textAnchor="end">热度</text>
          {geometry.timeTicks.map((time, index) => <text key={time} x={geometry.mapX(time)} y={size.height - 12}
            textAnchor={index === 0 ? "start" : index === geometry.timeTicks.length - 1 ? "end" : "middle"}>{formatTime(time)}</text>)}
        </g>
        {geometry.followers.length > 1 && <path className="subject-trend-area follower" d={`${geometry.followerPath} L${geometry.followers.at(-1)!.x} ${geometry.bottom} L${geometry.followers[0]!.x} ${geometry.bottom} Z`} />}
        {geometry.heat.length > 1 && <path className="subject-trend-area live" d={`${geometry.heatPath} L${geometry.heat.at(-1)!.x} ${geometry.bottom} L${geometry.heat[0]!.x} ${geometry.bottom} Z`} />}
        {geometry.followerPath && <path className="subject-line follower" d={geometry.followerPath} />}
        {geometry.heatPath && <path className="subject-line live" d={geometry.heatPath} />}
        {activeX !== undefined && <path className="subject-trend-crosshair" d={`M${activeX} ${geometry.top} V${geometry.bottom}`} />}
        {geometry.followers.map((item, index) => <circle key={`follower-${index}`} className="subject-trend-point follower" cx={item.x} cy={item.y} r={3}
          data-metric="follower" data-time={item.time} data-value={item.value.toString()} />)}
        {geometry.heat.map((item, index) => <circle key={`heat-${index}`} className="subject-trend-point live" cx={item.x} cy={item.y} r={3.5}
          data-metric="heat" data-time={item.time} data-value={item.value.toString()} />)}
        {points.map((entry, index) => <circle key={`${entry.time}-${index}`} className="subject-trend-hit" cx={geometry.mapX(entry.time)} cy={geometry.bottom}
          r={8} role="button" tabIndex={index === (active ?? 0) ? 0 : -1} aria-label={label(index)} data-bucket-index={index}
          aria-describedby={active === index ? tooltipId : undefined} onFocus={() => setActive(index)} onBlur={() => setActive(undefined)}
          onKeyDown={event => {
            if (event.key === "Escape") { setActive(undefined); return }
            const next = event.key === "ArrowRight" ? Math.min(points.length - 1, index + 1)
              : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : undefined
            if (next !== undefined) { event.preventDefault(); svg.current?.querySelector<SVGCircleElement>(`[data-bucket-index="${next}"]`)?.focus() }
          }}><title>{label(index)}</title></circle>)}
      </svg>}
      {current && activeX !== undefined && <div id={tooltipId} role="tooltip" className="subject-trend-tooltip"
        style={{ left: Math.max(8, Math.min(size.width - 268, activeX * size.width / geometry.plotWidth + 12)) }}>
        <time dateTime={current.point.bucketAt}>{formatTime(current.time)}</time>
        {current.point.followerCount !== undefined && <span className="follower">粉丝数<strong>{formatCount(BigInt(current.point.followerCount))}</strong></span>}
        {current.point.liveOnlineCount !== undefined && <span className="live">直播间热度<strong>{formatCount(BigInt(current.point.liveOnlineCount))}</strong></span>}
      </div>}
    </div>
  </div>
}
