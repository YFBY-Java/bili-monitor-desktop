import {
  businessCapabilities,
  findProductPage,
  navigationGroups,
  type PageId,
  type Tone
} from "./product-model"

export interface WorkspaceSearchResult {
  id: string
  kind: "page" | "capability"
  pageId: PageId
  label: string
  detail: string
  tone: Tone
  score: number
}

const implementedPageIds = navigationGroups.flatMap((group) => group.items.map((item) => item.pageId))
const validPageIds = new Set<PageId>(implementedPageIds)
const defaultPageIds: PageId[] = ["bilibili-subjects", "bilibili-followers", "bilibili-live", "douyin-auth"]

export function resolvePageId(value: string): PageId {
  const candidate = value.replace(/^#\/?/, "") as PageId
  return validPageIds.has(candidate) ? candidate : "bilibili-followers"
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN")
}

function includesQuery(value: string, query: string): boolean {
  return normalize(value).includes(query)
}

export function searchWorkspace(value: string): WorkspaceSearchResult[] {
  const query = normalize(value)

  if (!query) {
    return defaultPageIds.map((pageId, index) => {
      const page = findProductPage(pageId)
      if (!page) throw new Error(`Missing default workspace page: ${pageId}`)
      return {
        id: `page:${page.id}`,
        kind: "page",
        pageId: page.id,
        label: page.label,
        detail: page.description,
        tone: page.metrics[0]?.tone ?? "neutral",
        score: 100 - index
      }
    })
  }

  const results: WorkspaceSearchResult[] = []

  for (const pageId of implementedPageIds) {
    const page = findProductPage(pageId)
    if (!page) continue
    const featureText = page.features
      .flatMap((feature) => [feature.title, feature.description, feature.state])
      .join(" ")
    const metricText = page.metrics.flatMap((metric) => [metric.label, metric.detail]).join(" ")
    const fullText = [
      page.label,
      page.eyebrow,
      page.title,
      page.description,
      page.tabs.join(" "),
      featureText,
      metricText
    ].join(" ")

    if (!includesQuery(fullText, query)) continue

    const score = includesQuery(page.label, query)
      ? 140
      : includesQuery(`${page.title} ${page.description}`, query)
        ? 120
        : 100

    results.push({
      id: `page:${page.id}`,
      kind: "page",
      pageId: page.id,
      label: page.label,
      detail: page.description,
      tone: page.metrics[0]?.tone ?? "neutral",
      score
    })
  }

  for (const capability of businessCapabilities) {
    const text = `${capability.label} ${capability.implementation} ${capability.source}`
    if (!includesQuery(text, query)) continue

    results.push({
      id: `capability:${capability.id}`,
      kind: "capability",
      pageId: capability.pageId,
      label: capability.label,
      detail: `${capability.source} · ${capability.implementation}`,
      tone: capability.source === "BiliMonitor" ? "cyan" : "violet",
      score: includesQuery(capability.label, query) ? 110 : 90
    })
  }

  return results
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "zh-CN"))
    .slice(0, 12)
}
