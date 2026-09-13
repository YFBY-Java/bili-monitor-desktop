import { useEffect, useId, useMemo, useRef, useState } from "react"
import { formatLiveTrendTime, type LiveChartSamples } from "./live-trend-presentation"
import { formatTrendAxisNumber, trendTimeBounds, trendValueBounds } from "./trend-axis"

export function LiveTrendChart({ roomName, samples, height }: { roomName: string; samples: LiveChartSamples; height: number }) {
  const frame = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null)
  const tooltipId = useId(), helpId = useId()
  const [width, setWidth] = useState(720), [active, setActive] = useState<number>()
  const { points } = samples
  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver(entries => { if (entries[0]?.contentRect.width) setWidth(entries[0].contentRect.width) })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setActive(undefined) }, [points])
  const geometry = useMemo(() => {
    const timestamps = points.map(point => Date.parse(point.capturedAt)), values = points.map(point => point.onlineCount ?? 0)
    const timeAxis = timestamps.length > 0 && timestamps.every(Number.isFinite)
    const y = trendValueBounds(values), x = timeAxis ? trendTimeBounds(timestamps) : { min: 0, max: Math.max(1, points.length - 1), span: 0 }
    const left = Math.min(96, width / 3), right = Math.max(left + 1, width - 24), top = 18, bottom = height - 42
    const mapX = (value: number) => left + (value - x.min) / (x.max - x.min) * (right - left)
    const mapY = (value: number) => bottom - (value - y.min) / (y.max - y.min) * (bottom - top)
    const coordinates = values.map((value, index) => ({ x: mapX(timeAxis ? timestamps[index]! : index), y: mapY(value) }))
    const path = coordinates.map((point, index) => {
      const previous = coordinates[index - 1]
      if (!previous) return `M${point.x} ${point.y}`
      const middle = (previous.x + point.x) / 2
      return `C${middle} ${previous.y},${middle} ${point.y},${point.x} ${point.y}`
    }).join(" ")
    const yTicks = [...new Set(Array.from({ length: 5 }, (_, i) => Math.round(y.min + (y.max - y.min) * i / 4)))]
    const count = Math.max(2, Math.min(5, Math.floor((right - left) / (x.span > 86_400_000 ? 150 : 110))))
    const xTicks = timeAxis ? Array.from({ length: count }, (_, i) => x.min + (x.max - x.min) * i / (count - 1))
      : [...new Set(Array.from({ length: count }, (_, i) => Math.round((points.length - 1) * i / (count - 1))))]
    return { timeAxis, timestamps, values, x, y, left, right, top, bottom, coordinates, path, xTicks, yTicks, mapX, mapY }
  }, [points, width, height])
  const point = active === undefined ? undefined : points[active], coordinate = active === undefined ? undefined : geometry.coordinates[active]
  const first = points[0], last = points.at(-1)
  return <>
    <span id={helpId} className="live-chart-a11y">Tab进入采样点，左右方向键逐点查看，Home/End查看首末点，Escape关闭提示。</span>
    <div ref={frame} className="live-trend-chart" style={{ height }}>
      {!first || !last ? <p className="live-trend-empty">暂无历史快照或当前热度</p>
        : <svg ref={svg} className="live-history-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${roomName} 在线趋势`} aria-describedby={helpId}
          onPointerLeave={() => setActive(undefined)} onPointerMove={event => {
            if (event.buttons) return
            const rect = event.currentTarget.getBoundingClientRect(), localX = (event.clientX - rect.left) * width / rect.width
            let nearest = 0
            geometry.coordinates.forEach((item, index) => {
              if (Math.abs(item.x - localX) < Math.abs(geometry.coordinates[nearest]!.x - localX)) nearest = index
            })
            setActive(nearest)
          }}>
          <g className="live-trend-y-axis">{geometry.yTicks.map(value => <g key={value}>
            <path className="live-chart-grid-line" d={`M${geometry.left} ${geometry.mapY(value)} H${geometry.right}`} />
            <text x={geometry.left - 12} y={geometry.mapY(value)} textAnchor="end" dominantBaseline="middle">{formatTrendAxisNumber(value, geometry.y.span, true)}</text>
          </g>)}</g>
          <path className="live-chart-grid-line" d={`M${geometry.left} ${geometry.bottom} H${geometry.right}`} />
          {geometry.y.min < 0 && geometry.y.max > 0 && <path className="live-chart-zero-line" d={`M${geometry.left} ${geometry.mapY(0)} H${geometry.right}`} />}
          <g className="live-trend-x-axis">{geometry.xTicks.map((time, index) => <text key={time} x={geometry.mapX(time)} y={height - 12}
            textAnchor={index === 0 ? "start" : index === geometry.xTicks.length - 1 ? "end" : "middle"}>
            {geometry.timeAxis ? formatLiveTrendTime(time, geometry.x.span) : formatLiveTrendTime(Date.parse(points[time]?.capturedAt ?? ""))}</text>)}</g>
          <path className="live-trend-area" d={`${geometry.path} L${geometry.coordinates.at(-1)!.x} ${geometry.bottom} L${geometry.coordinates[0]!.x} ${geometry.bottom} Z`} />
          <path className="live-trend-line" d={geometry.path} />
          {coordinate && <path className="live-trend-crosshair" d={`M${coordinate.x} ${geometry.top} V${geometry.bottom}`} />}
          {points.map((item, index) => {
            const position = geometry.coordinates[index]!, missing = item.onlineCount === undefined
            const label = `${formatLiveTrendTime(geometry.timestamps[index]!)} · 热度 ${missing ? "原始值缺失，按0绘制" : item.onlineCount!.toLocaleString("zh-CN")}`
            return <circle key={`${item.capturedAt}-${index}`} cx={position.x} cy={position.y} r={active === index ? 5 : 3.5}
              className={missing ? "is-missing" : ""} role="button" tabIndex={index === (active ?? 0) ? 0 : -1}
              aria-label={label} aria-describedby={active === index ? tooltipId : undefined}
              onFocus={() => setActive(index)} onBlur={() => setActive(undefined)} onKeyDown={event => {
                if (event.key === "Escape") { setActive(undefined); return }
                const target = event.key === "ArrowRight" ? Math.min(points.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1)
                  : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : undefined
                if (target !== undefined) { event.preventDefault(); svg.current?.querySelectorAll("circle")[target]?.focus() }
              }}><title>{label}</title></circle>
          })}
        </svg>}
      {point && coordinate && <div className="live-trend-tooltip" role="tooltip" id={tooltipId}
        style={{ left: Math.max(8, Math.min(width - 236, coordinate.x + 12)), top: Math.min(height - 140, Math.max(8, coordinate.y - 110)) }}>
        <time dateTime={point.capturedAt}>{formatLiveTrendTime(Date.parse(point.capturedAt))}</time>
        <span>在线/热度 <strong>{formatTrendAxisNumber(point.onlineCount ?? 0, geometry.y.span, true)}</strong></span>
        <small>{point.onlineCount === undefined ? "原始值缺失，按原页面以0绘制" : `原始值 ${point.onlineCount.toLocaleString("zh-CN")}`}</small>
      </div>}
    </div>
    {first && last && <div className="live-chart-time-range"><time dateTime={first.capturedAt}>{formatLiveTrendTime(Date.parse(first.capturedAt))}</time>
      <time dateTime={last.capturedAt}>{formatLiveTrendTime(Date.parse(last.capturedAt))}</time></div>}
  </>
}
