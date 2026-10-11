import type { DesktopBridge } from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export const liveOverviewKey = ["bilibili-live", "overview"] as const

export async function readLiveOverview(bridge: DesktopBridge, signal: AbortSignal) {
  signal.throwIfAborted()
  // Original loadAll publishes nothing until all three reads have succeeded.
  // This is a single page projection, not a database transaction across the reads.
  const [roomList, summary, events] = await Promise.all([
    bridge.bilibiliLiveV2.list({}), bridge.bilibiliLiveV2.summary(), bridge.bilibiliLiveV2.events({ limit: 20 })
  ])
  signal.throwIfAborted()
  return { roomList, summary, events }
}

export type LiveOverview = Awaited<ReturnType<typeof readLiveOverview>>

export function useLiveOverviewQuery(bridge: DesktopBridge) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: liveOverviewKey,
    queryFn: ({ signal }) => readLiveOverview(bridge, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 15_000
  })
  const reload = async () => {
    // Also cancel a first load without cached data: a command may complete during it.
    await client.cancelQueries({ queryKey: liveOverviewKey, exact: true })
    return query.refetch()
  }
  return { ...query, reload }
}
