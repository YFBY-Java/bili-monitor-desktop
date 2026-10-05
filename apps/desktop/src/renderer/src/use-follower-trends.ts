import type { BilibiliFollowerTrendV2, DesktopBridge } from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useMemo, useRef, useState } from "react"

export type FollowerTrendIndicator = "idle" | "refreshing" | "done" | "error"

/** Local history only. Core remains the sole owner of platform collection. */
export function useFollowerTrends(bridge: DesktopBridge, userIds: string[], listUpdatedAt: number) {
  const client = useQueryClient()
  const instance = useId()
  const queryKey = useMemo(() => ["bilibili-follower-trends-v2", "workspace", instance], [instance])
  const latest = useRef({ bridge, userIds })
  latest.current = { bridge, userIds }
  const failedKey = useRef<string | undefined>(undefined)
  const [indicator, setIndicator] = useState<FollowerTrendIndicator>("idle")
  const queue = useRef<(delay: number) => void>(() => {})
  const query = useQuery({
    queryKey, enabled: false, retry: false, gcTime: 0,
    queryFn: async () => {
      const ids = [...latest.current.userIds]
      let incoming: BilibiliFollowerTrendV2[]
      try {
        incoming = await latest.current.bridge.bilibiliFollowersV2.trends({ userIds: ids, limitPerUser: 500 })
        failedKey.current = undefined
      } catch (error) {
        failedKey.current = ids.join(",")
        throw error
      }
      const cache = new Map((client.getQueryData<BilibiliFollowerTrendV2[]>(queryKey) ?? []).map(trend => [trend.user.id, trend]))
      for (const trend of incoming) cache.set(trend.user.id, trend)
      // Bounded to the current four selections; late responses cannot revive removed users.
      return latest.current.userIds.flatMap(id => cache.has(id) ? [cache.get(id)!] : [])
    }
  })
  const { refetch } = query
  useEffect(() => {
    let disposed = false, busy = false, pending = false, activeKey = ""
    let debounce: number | undefined, statusTimer: number | undefined
    let startedAt = 0
    const clearStatus = () => { window.clearTimeout(statusTimer); statusTimer = undefined }
    const finishIndicator = (result: "done" | "error") => {
      clearStatus()
      statusTimer = window.setTimeout(() => {
        setIndicator(result)
        statusTimer = window.setTimeout(() => setIndicator("idle"), 900)
      }, Math.max(0, 700 - (Date.now() - startedAt)))
    }
    const enqueue = (delay: number) => {
      window.clearTimeout(debounce)
      if (!latest.current.userIds.length) {
        pending = false
        clearStatus()
        setIndicator("idle")
        return
      }
      debounce = window.setTimeout(() => { void refresh() }, delay)
    }
    const refresh = async () => {
      if (disposed || !latest.current.userIds.length) return
      const key = latest.current.userIds.join(",")
      if (busy) { pending = pending || activeKey !== key; return }
      busy = true
      activeKey = key
      clearStatus()
      startedAt = Date.now()
      setIndicator("refreshing")
      // A disabled Query gives us cache/error retention; this queue owns refetch timing.
      const result = await refetch({ cancelRefetch: false })
      if (disposed) return
      busy = false
      if (!latest.current.userIds.length) { clearStatus(); setIndicator("idle"); return }
      if (pending || latest.current.userIds.join(",") !== key) {
        pending = false
        enqueue(120)
      } else finishIndicator(result.isError ? "error" : "done")
    }
    queue.current = enqueue
    return () => {
      disposed = true
      queue.current = () => {}
      window.clearTimeout(debounce)
      clearStatus()
    }
  }, [refetch])
  const selectionKey = userIds.join(",")
  useEffect(() => { queue.current(180) }, [selectionKey])
  useEffect(() => {
    if (!listUpdatedAt) return
    client.setQueryData<BilibiliFollowerTrendV2[]>(queryKey, current => current?.filter(trend => latest.current.userIds.includes(trend.user.id)))
    queue.current(0)
  }, [client, queryKey, listUpdatedAt])
  const visibleIndicator: FollowerTrendIndicator = userIds.length ? indicator : "idle"
  return { ...query, indicator: visibleIndicator,
    currentError: failedKey.current === selectionKey ? query.error?.message : undefined,
    reload: () => queue.current(0) }
}
