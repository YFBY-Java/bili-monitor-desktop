import type { BilibiliSubjectWorkbench, DesktopBridge } from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type JSX } from "react"
import { BilibiliLiveDataWidget, type LiveWidgetRoom } from "./BilibiliLiveDataWidget"

const initialLiveDanmu: BilibiliSubjectWorkbench["danmu"] = { enabled: true, status: "waiting", recentMessages: [] }

// Callers key the container by room (and binding enablement) so late responses cannot update another room's controls.
export function ConnectedBilibiliLiveDataWidget({ bridge, room, initialDanmu = initialLiveDanmu }: {
  bridge: DesktopBridge; room?: LiveWidgetRoom; initialDanmu?: BilibiliSubjectWorkbench["danmu"]
}): JSX.Element {
  const queryClient = useQueryClient()
  const [ranksVisible, setRanksVisible] = useState(false)
  const roomId = room?.monitorId
  const danmuKey = ["bilibili-live-widget", roomId, "danmu"]
  const rankKey = ["bilibili-live-widget", roomId, "ranks"]
  const danmuQuery = useQuery({
    queryKey: danmuKey,
    queryFn: async ({ signal }) => {
      if (!roomId) throw new Error("未绑定直播间")
      const [status, recent] = await Promise.all([
        bridge.bilibiliLive.danmakuStatus({ roomMonitorId: roomId }),
        bridge.bilibiliLive.danmakuRecent({ roomMonitorId: roomId, limit: 60 })
      ])
      signal.throwIfAborted()
      return { status, recent }
    },
    enabled: Boolean(roomId) && initialDanmu.enabled, refetchInterval: 2000, retry: false
  })
  const ranks = useQuery({
    queryKey: rankKey,
    queryFn: async ({ signal }) => {
      if (!roomId) throw new Error("未绑定直播间")
      const result = await bridge.bilibiliLive.rankSummary({ roomMonitorId: roomId })
      signal.throwIfAborted()
      return result
    }, enabled: Boolean(roomId) && ranksVisible, staleTime: 0, retry: false
  })
  // A disabled binding may share a warm room cache with another screen; do not render that cache as enabled data.
  const liveData = roomId && initialDanmu.enabled ? danmuQuery.data : undefined
  const status = liveData?.status
  const normalizedStatus = !status ? initialDanmu.status : status.running ? "connected"
    : status.status === "NOT_STARTED" ? "waiting" : status.status === "STOPPED" || status.status === "CLOSED" ? "stopped" : status.status.toLowerCase()
  const danmu: BilibiliSubjectWorkbench["danmu"] = status ? { ...initialDanmu, status: normalizedStatus,
    ratePerMinute: status.ratePerMinute, last5MinutesCount: status.last5MinutesCount,
    likeIncrement: status.likeIncrement, watchedCount: status.watchedCount } : initialDanmu
  const refreshDanmu = async () => {
    await queryClient.cancelQueries({ queryKey: danmuKey })
    await queryClient.invalidateQueries({ queryKey: danmuKey })
    await queryClient.invalidateQueries({ queryKey: ["bilibili-subject-workbench"] })
  }
  return <BilibiliLiveDataWidget room={room} danmu={danmu} recentMessages={liveData?.recent}
    rankSummary={ranks.data} rankLoading={ranks.isFetching && !ranks.data}
    danmuLoading={initialDanmu.enabled && danmuQuery.isFetching && !liveData}
    danmuError={initialDanmu.enabled ? danmuQuery.error?.message : undefined} rankError={ranks.error?.message}
    onRanksVisible={() => {
      if (roomId && ranksVisible && !ranks.data && !ranks.isFetching) void ranks.refetch()
      setRanksVisible(true)
    }}
    onStart={async protocolVersion => {
      if (!roomId) return
      await bridge.bilibiliLive.danmakuStart({ roomMonitorId: roomId, ...(protocolVersion === undefined ? {} : { protocolVersion }) })
      await refreshDanmu()
    }}
    onStop={async () => {
      if (!roomId) return
      await bridge.bilibiliLive.danmakuStop({ roomMonitorId: roomId })
      await refreshDanmu()
    }}
    onRankRefresh={async input => {
      await queryClient.cancelQueries({ queryKey: rankKey })
      const result = await bridge.bilibiliLive.rankRefresh(input)
      await queryClient.cancelQueries({ queryKey: rankKey })
      queryClient.setQueryData(rankKey, result.summary)
      return result
    }} />
}
