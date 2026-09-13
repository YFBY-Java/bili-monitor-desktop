import type { BilibiliFollowerPoint } from "@bmd/contracts"
import { useEffect, useMemo, useRef, useState } from "react"
import { formatFollowerCount } from "./follower-monitor-presentation"
import { followerTimeBounds, followerValueBounds, formatFollowerAxisNumber } from "./follower-trend-presentation"

const formatTime = (time: number, span?: number) => new Intl.DateTimeFormat("zh-CN", {
  ...(span === undefined || span > 86_400_000 ? { month: "2-digit", day: "2-digit" } : {}),
  hour: "2-digit", minute: "2-digit", ...(span === undefined || span < 120_000 ? { second: "2-digit" } : {}), hour12: false
}).format(new Date(time))

export function FollowerTrendChart({ nickname, points, height }: { nickname: string; points: readonly BilibiliFollowerPoint[]; height: number }) {
  const frame = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number>()
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const resize = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width
      if (measured && measured > 0) setWidth(measured)
    })
    resize.observe(element)
    return () => resize.disconnect()
  }, [])
  const geometry = useMemo(() => {
    const values = points.map(point => point.followerCount), timestamps = points.map(point => Date.parse(point.capturedAt))
    const y = followerValueBounds(values), x = followerTimeBounds(timestamps)
    const left = Math.min(86, width / 3), right = Math.max(left + 1, width - 24), top = 18, bottom = height - 40
    const mapX = (value: number) => left + (value - x.min) / (x.max - x.min) * (right - left)
    const mapY = (value: number) => bottom - (value - y.min) / (y.max - y.min) * (bottom - top)
    const coordinates = points.map((point, index) => ({ x: mapX(timestamps[index]!), y: mapY(point.followerCount) }))
    const path = coordinates.map((point, index) => {
      const previous = coordinates[index - 1]
      if (!previous) return `M${point.x} ${point.y}`
      const middle = (previous.x + point.x) / 2
      return `C${middle} ${previous.y},${middle} ${point.y},${point.x} ${point.y}`
    }).join(" ")
    const yTicks = [...new Set(Array.from({ length: 5 }, (_, i) => Math.round(y.min + (y.max - y.min) * i / 4)))]
    const tickCount = Math.max(2, Math.min(5, Math.floor((right - left) / (x.span > 86_400_000 ? 140 : 100))))
    const xTicks = Array.from({ length: tickCount }, (_, i) => x.min + (x.max - x.min) * i / (tickCount - 1))
    return { values, timestamps, x, y, left, right, bottom, coordinates, path, xTicks, yTicks, mapX, mapY }
  }, [points, width, height])
  useEffect(() => { setActive(undefined) }, [points])
  const point = active === undefined ? undefined : points[active]
  const coordinate = active === undefined ? undefined : geometry.coordinates[active]
  const first = points[0], last = points.at(-1)
  const delta = first && last ? last.followerCount - first.followerCount : undefined
  return <>
    <div ref={frame} className="follower-trend-chart" style={{ height }}>
      {!points.length ? <p className="trend-empty">暂无历史快照</p> : <svg ref={svg} className="follower-history-svg" viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label={`${nickname}粉丝趋势`}
        onPointerLeave={() => setActive(undefined)}
        onPointerMove={event => {
          if (event.buttons) return
          const rect = event.currentTarget.getBoundingClientRect()
          const localX = (event.clientX - rect.left) * width / rect.width
          let nearest = 0
          geometry.coordinates.forEach((item, index) => {
            if (Math.abs(item.x - localX) < Math.abs(geometry.coordinates[nearest]!.x - localX)) nearest = index
          })
          setActive(nearest)
        }}>
        <g className="trend-y-axis">{geometry.yTicks.map(value => <g key={value}>
          <path className="trend-grid-line" d={`M${geometry.left} ${geometry.mapY(value)} H${geometry.right}`} />
          <text x={geometry.left - 12} y={geometry.mapY(value)} textAnchor="end" dominantBaseline="middle">{formatFollowerAxisNumber(value, geometry.y.span)}</text>
        </g>)}</g>
        <g className="trend-x-axis">{geometry.xTicks.map((time, index) => <text key={time} x={geometry.mapX(time)} y={height - 12}
          textAnchor={index === 0 ? "start" : index === geometry.xTicks.length - 1 ? "end" : "middle"}>{formatTime(time, geometry.x.span)}</text>)}</g>
        <path className="follower-trend-area" d={`${geometry.path} L${geometry.coordinates.at(-1)!.x} ${geometry.bottom} L${geometry.coordinates[0]!.x} ${geometry.bottom} Z`} />
        <path className="trend-data-line" d={geometry.path} />
        {coordinate && <path className="follower-trend-crosshair" d={`M${coordinate.x} 18 V${geometry.bottom}`} />}
        {points.map((item, index) => {
          const position = geometry.coordinates[index]!
          const label = `${formatTime(geometry.timestamps[index]!)} · 粉丝 ${formatFollowerCount(item.followerCount)}`
          return <circle key={`${item.capturedAt}-${index}`} cx={position.x} cy={position.y} r={active === index ? 5 : 3.5}
            tabIndex={index === (active ?? 0) ? 0 : -1} aria-label={label}
            onFocus={() => setActive(index)} onBlur={() => setActive(undefined)} onKeyDown={event => {
              if (event.key === "Escape") { setActive(undefined); return }
              const target = event.key === "ArrowRight" ? Math.min(points.length - 1, index + 1)
                : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : undefined
              if (target !== undefined) { event.preventDefault(); svg.current?.querySelectorAll("circle")[target]?.focus() }
            }}><title>{label}</title></circle>
        })}
      </svg>}
      {point && coordinate && <div className="follower-trend-tooltip" role="tooltip" style={{ left: Math.max(8, Math.min(width - 210, coordinate.x + 12)), top: Math.min(height - 95, Math.max(8, coordinate.y - 80)) }}>
        <time dateTime={point.capturedAt}>{formatTime(Date.parse(point.capturedAt))}</time>
        <span>粉丝数 <strong>{formatFollowerCount(point.followerCount)}</strong></span>
      </div>}
    </div>
    {first && last && <div className="follower-chart-footer">
      <div className="trend-time-range"><time dateTime={first.capturedAt}>{formatTime(Date.parse(first.capturedAt))}</time><time dateTime={last.capturedAt}>{formatTime(Date.parse(last.capturedAt))}</time></div>
      <div className="trend-range"><span>最低 {formatFollowerCount(Math.min(...geometry.values))}</span>
        <strong className={delta! < 0 ? "is-negative" : delta! > 0 ? "is-positive" : ""}>区间净变化 {delta! > 0 ? "+" : ""}{formatFollowerCount(delta)}</strong>
        <span>最高 {formatFollowerCount(Math.max(...geometry.values))}</span></div>
    </div>}
  </>
}
