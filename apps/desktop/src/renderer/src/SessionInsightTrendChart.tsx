import type { BilibiliLiveSessionInsight } from "@bmd/contracts"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { formatTrendAxisNumber, trendTimeBounds, trendValueBounds } from "./trend-axis"

type Timeline = BilibiliLiveSessionInsight["timeline"]
type Bucket = Timeline[number]
type SeriesKey = "danmaku" | "active" | "amount" | "paid"
interface ChartSeries {
  key: SeriesKey
  label: string
  tone: "coral" | "violet" | "mint" | "amber"
  value: (bucket: Bucket) => number
}

const interactionSeries: readonly ChartSeries[] = [
  { key: "danmaku", label: "弹幕", tone: "coral", value: bucket => bucket.danmakuCount },
  { key: "active", label: "活跃 UID", tone: "violet", value: bucket => bucket.activeUserCount }
]
const paymentSeries: readonly ChartSeries[] = [
  { key: "amount", label: "付费金额（元）", tone: "mint", value: bucket => bucket.paidAmountMilliYuan / 1000 },
  { key: "paid", label: "付费事件", tone: "amber", value: bucket => bucket.paidEventCount }
]

export function SessionInsightTrendChart({ timeline, kind }: {
  timeline: readonly Bucket[]
  kind: "interaction" | "payment"
}) {
  const frame = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const helpId = useId(), tooltipId = useId()
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number>()
  const [hidden, setHidden] = useState<readonly SeriesKey[]>([])
  const height = 260
  const title = kind === "interaction" ? "互动趋势" : "付费趋势"
  const series = kind === "interaction" ? interactionSeries : paymentSeries
  const visible = useMemo(() => series.filter(item => !hidden.includes(item.key)), [series, hidden])

  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width
      if (measured) setWidth(Math.max(280, measured))
    })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setActive(undefined) }, [timeline])

  const geometry = useMemo(() => {
    const timestamps = timeline.map(bucket => Date.parse(bucket.bucketStart))
    const x = trendTimeBounds(timestamps)
    const y = trendValueBounds(visible.flatMap(item => timeline.map(item.value)))
    const left = Math.min(78, width / 4), right = width - 18, top = 18, bottom = height - 38
    const mapX = (time: number) => left + (time - x.min) / (x.max - x.min) * (right - left)
    const mapY = (value: number) => bottom - (value - y.min) / (y.max - y.min) * (bottom - top)
    const coordinates = timestamps.map(mapX)
    const paths = visible.map(item => ({ ...item, path: timeline.map((bucket, index) =>
      `${index === 0 ? "M" : "L"}${coordinates[index]} ${mapY(item.value(bucket))}`).join(" ") }))
    const tickPrecision = kind === "payment" ? 100 : 1
    const yTicks = [...new Set(Array.from({ length: 5 }, (_, index) =>
      Math.round((y.min + (y.max - y.min) * index / 4) * tickPrecision) / tickPrecision))]
    const tickCount = Math.max(2, Math.min(4, Math.floor((right - left) / (x.span > 86_400_000 ? 150 : 100))))
    const xTicks = Array.from({ length: tickCount }, (_, index) => x.min + (x.max - x.min) * index / (tickCount - 1))
    return { x, y, left, right, top, bottom, coordinates, paths, yTicks, xTicks, mapX, mapY }
  }, [timeline, visible, width, kind])

  const bucket = active === undefined ? undefined : timeline[active]
  const activeX = active === undefined ? undefined : geometry.coordinates[active]
  const first = timeline[0], last = timeline.at(-1)
  const bucketLabel = (item: Bucket) => `${formatTime(Date.parse(item.bucketStart), undefined, true)} · ${visible.map(definition =>
    `${definition.label} ${formatValue(definition.value(item), definition.key)}`).join(" · ")}`

  return <div className="analysis-chart">
    <div className="analysis-chart-legend" aria-label={`${title}图例`}>
      {series.map(item => <button type="button" key={item.key} className={`analysis-legend-item tone-${item.tone}`}
        aria-pressed={!hidden.includes(item.key)} onClick={() => {
          setHidden(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])
        }}><i aria-hidden="true" />{item.label}</button>)}
    </div>
    <span id={helpId} className="analysis-a11y">Tab 进入时间桶，左右方向键逐桶查看，Home 和 End 查看首末桶，Escape 关闭提示。</span>
    <div ref={frame} className="analysis-chart-frame" style={{ height }}>
      {!first || !last ? <p className="analysis-empty">本场暂无可展示的时间桶</p>
        : <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} aria-describedby={helpId}
          onPointerLeave={() => setActive(undefined)} onPointerMove={event => {
            if (event.buttons || !geometry.coordinates.length) return
            const rect = event.currentTarget.getBoundingClientRect()
            if (!rect.width) return
            const localX = (event.clientX - rect.left) * width / rect.width
            let nearest = 0
            geometry.coordinates.forEach((position, index) => {
              if (Math.abs(position - localX) < Math.abs((geometry.coordinates[nearest] ?? position) - localX)) nearest = index
            })
            setActive(nearest)
          }}>
          <g className="analysis-chart-axis">{geometry.yTicks.map(value => <g key={value}>
            <path className="analysis-chart-grid" d={`M${geometry.left} ${geometry.mapY(value)} H${geometry.right}`} />
            <text x={geometry.left - 10} y={geometry.mapY(value)} textAnchor="end" dominantBaseline="middle">
              {kind === "payment" && Math.abs(value) < 10_000
                ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)
                : formatTrendAxisNumber(value, geometry.y.span, true)}
            </text>
          </g>)}</g>
          <g className="analysis-chart-axis">{geometry.xTicks.map((time, index) => <text key={time} x={geometry.mapX(time)} y={height - 10}
            textAnchor={index === 0 ? "start" : index === geometry.xTicks.length - 1 ? "end" : "middle"}>
            {formatTime(time, geometry.x.span)}
          </text>)}</g>
          {geometry.paths.map(item => <path key={item.key} className={`analysis-chart-line tone-${item.tone}`} d={item.path} />)}
          {activeX !== undefined && <path className="analysis-chart-crosshair" d={`M${activeX} ${geometry.top} V${geometry.bottom}`} />}
          {visible.map(item => <g key={item.key} className={`analysis-chart-points tone-${item.tone}`}>
            {timeline.map((point, index) => <circle key={point.bucketStart} cx={geometry.coordinates[index]} cy={geometry.mapY(item.value(point))}
              r={active === index ? 4.5 : 2.5} />)}
          </g>)}
          {timeline.map((point, index) => <circle key={point.bucketStart} cx={geometry.coordinates[index]}
            cy={geometry.bottom} r={8} className="analysis-chart-hit" data-bucket-index={index} role="button"
            tabIndex={index === (active ?? 0) ? 0 : -1} aria-label={bucketLabel(point)}
            aria-describedby={active === index ? tooltipId : undefined}
            onFocus={() => setActive(index)} onBlur={() => setActive(undefined)} onKeyDown={event => {
              if (event.key === "Escape") { setActive(undefined); return }
              const target = event.key === "ArrowRight" ? Math.min(timeline.length - 1, index + 1)
                : event.key === "ArrowLeft" ? Math.max(0, index - 1)
                  : event.key === "Home" ? 0 : event.key === "End" ? timeline.length - 1 : undefined
              if (target !== undefined) {
                event.preventDefault()
                svg.current?.querySelector<SVGCircleElement>(`[data-bucket-index="${target}"]`)?.focus()
              }
            }}><title>{bucketLabel(point)}</title></circle>)}
        </svg>}
      {bucket && activeX !== undefined && <div id={tooltipId} role="tooltip" className="analysis-chart-tooltip"
        style={{ left: Math.max(8, Math.min(width - 226, activeX + 12)), top: 12 }}>
        <time dateTime={bucket.bucketStart}>{formatTime(Date.parse(bucket.bucketStart), undefined, true)}</time>
        {visible.map(item => <span key={item.key} className={`tone-${item.tone}`}>{item.label}<strong>{formatValue(item.value(bucket), item.key)}</strong></span>)}
        {visible.length === 0 && <span>点击图例显示趋势</span>}
      </div>}
    </div>
    {first && last && <div className="analysis-chart-range"><time dateTime={first.bucketStart}>{formatTime(Date.parse(first.bucketStart), undefined, true)}</time>
      <time dateTime={last.bucketStart}>{formatTime(Date.parse(last.bucketStart), undefined, true)}</time></div>}
  </div>
}

function formatTime(value: number, span = 0, full = false): string {
  if (!Number.isFinite(value)) return "--"
  return new Intl.DateTimeFormat("zh-CN", {
    ...(full || span > 86_400_000 ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit", minute: "2-digit", ...(full || span < 120_000 ? { second: "2-digit" } : {}), hour12: false
  }).format(new Date(value))
}

function formatValue(value: number, key: SeriesKey): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: key === "amount" ? 3 : 0 }).format(value)
}
