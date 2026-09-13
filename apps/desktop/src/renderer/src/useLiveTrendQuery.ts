import type { BilibiliLiveRoom, BilibiliLiveRoomList, DesktopBridge } from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"

// Original queueTrendRefresh: merge selection clicks for 180ms; rereads refresh immediately.
export function useLiveTrendQuery(bridge: DesktopBridge, rooms: BilibiliLiveRoom[], revision: number, selectedIds: string[]) {
  const queryClient = useQueryClient(), key = selectedIds.join(",")
  // Identity marks this selection occurrence, including A→B→A within the debounce window.
  const queued = useMemo(() => ({ key, revision }), [key, revision])
  const [request, setRequest] = useState({ key: "", revision: -1 })
  const previousRevision = useRef(-1), activeRequest = useRef<string[]>([])
  useEffect(() => {
    // A newer room read must not join the older request for the same selection key.
    // Cancel Query's logical read; the bridge reply is discarded through its AbortSignal.
    void queryClient.cancelQueries({ queryKey: ["bilibili-live", "trends", activeRequest.current], exact: true })
    if (!key) { setRequest(queued); return }
    const delay = revision !== previousRevision.current ? 0 : 180
    previousRevision.current = revision
    const timer = window.setTimeout(() => setRequest(queued), delay)
    return () => window.clearTimeout(timer)
  }, [key, revision, queued, queryClient])
  const ids = request.key ? request.key.split(",").filter(id => rooms.some(room => room.id === id)) : []
  activeRequest.current = ids
  const query = useQuery({
    queryKey: ["bilibili-live", "trends", ids],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const currentRooms = queryClient.getQueryData<BilibiliLiveRoomList>(["bilibili-live", "rooms"])?.items ?? []
      const currentIds = ids.filter(id => currentRooms.some(room => room.id === id))
      if (!currentIds.length) return []
      const result = await bridge.bilibiliLive.trends({ roomMonitorIds: currentIds, limitPerRoom: 500 })
      // Native bridge reads cannot be interrupted; ignore an obsolete reply after it returns.
      signal.throwIfAborted()
      return result
    },
    enabled: ids.length > 0 && request === queued,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false
  })
  const [settling, setSettling] = useState(false)
  useEffect(() => {
    if (query.isFetching) { setSettling(true); return }
    const timer = window.setTimeout(() => setSettling(false), 500)
    return () => window.clearTimeout(timer)
  }, [query.isFetching])
  return { ...query, error: request === queued ? query.error : null,
    pending: selectedIds.length > 0 && (query.isFetching || settling) }
}
