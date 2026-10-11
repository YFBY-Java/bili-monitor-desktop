export interface TrendBounds { min: number; max: number; span: number }
// Conservative glyph budget for the existing small axis font. Content-based,
// deterministic in SSR/tests; no canvas or missing SVG measurement APIs.
export function exactTrendLabelGutter(labels: readonly string[], ordinary: number): number {
  return Math.max(ordinary, ...labels.map(label => label.length * 8 + 20))
}
// Original TrendChart.vue bounds: preserve scale for tiny changes and constant values.
export function trendValueBounds(values: readonly number[]): TrendBounds {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return { min: 0, max: 1, span: 0 }
  const low = Math.min(...finite), high = Math.max(...finite), center = (low + high) / 2
  const magnitude = Math.max(Math.abs(center), Math.abs(low), Math.abs(high), 1)
  const absoluteFloor = magnitude >= 1_000_000 ? 400 : magnitude >= 10_000 ? 80 : 8
  const span = Math.max((high - low) * 2.2, magnitude * 0.000035, absoluteFloor) * 1.18
  const min = low >= 0 ? Math.max(0, center - span / 2) : center - span / 2
  const max = center + span / 2
  return { min: Math.floor(min), max: Math.ceil(max), span: Math.max(1, max - min) }
}

export function trendTimeBounds(timestamps: readonly number[]): TrendBounds {
  if (!timestamps.length) return { min: 0, max: 1, span: 0 }
  const min = Math.min(...timestamps), max = Math.max(...timestamps), span = max - min
  const padding = span <= 0 ? 1_800_000 : Math.max(span * 0.04, span < 120_000 ? 30_000 : 60_000)
  return { min: min - padding, max: max + padding, span: span + 2 * padding }
}

export function formatTrendAxisNumber(value: number, span: number, precise = false): string {
  const fixed = (scale: number, digits: number) => (value / scale).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
  if (Math.abs(value) >= 100_000_000) return `${fixed(100_000_000, precise && span > 0 && span < 10_000_000 ? 3 : span > 0 && span < (precise ? 1_000_000_000 : 10_000_000) ? 2 : 1)}亿`
  if (Math.abs(value) >= 10_000) return `${fixed(10_000, precise && span > 0 && span < 1000 ? 3 : span > 0 && span / 10_000 < (precise ? 20 : 10) ? 2 : 1)}万`
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value)
}
