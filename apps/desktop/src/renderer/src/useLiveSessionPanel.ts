import type { BilibiliLiveSessionSummary, BilibiliLiveSessionUser, DesktopBridge } from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

interface SessionPanelProjection {
  sessions: BilibiliLiveSessionSummary[]
  selectedSessionId?: string | undefined
  detail?: BilibiliLiveSessionSummary | undefined
  users: BilibiliLiveSessionUser[]
  detailUnavailable: boolean
  errorMessage?: string | undefined
}

const emptyProjection: SessionPanelProjection = { sessions: [], users: [], detailUnavailable: false }

/** Original panel flow: list -> independently recoverable detail/users -> completion-relative refresh. */
export function useLiveSessionPanel(
  bridge: DesktopBridge,
  active: boolean,
  roomMonitorId: string | undefined,
  selectedSessionId: string | undefined,
  onSelectionChange: (sessionId: string | undefined) => void
) {
  const client = useQueryClient()
  const queryKey = ["bilibili-live", "session-panel", roomMonitorId] as const
  const projection = useQuery<SessionPanelProjection>({ queryKey, enabled: false })
  const selection = useRef(selectedSessionId)
  const onSelection = useRef(onSelectionChange)
  const interval = useRef(10)
  const [refreshSeconds, setRefreshSeconds] = useState(10)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const actions = useRef({
    refreshNow: async (): Promise<void> => undefined,
    select: async (_sessionId: string): Promise<void> => undefined,
    reschedule: (): void => undefined
  })
  useEffect(() => { selection.current = selectedSessionId }, [selectedSessionId])
  useEffect(() => { onSelection.current = onSelectionChange }, [onSelectionChange])

  useEffect(() => {
    if (!active || !roomMonitorId) return
    const monitorId = roomMonitorId
    const key = ["bilibili-live", "session-panel", roomMonitorId] as const
    let mounted = true
    let listGeneration = 0
    let detailGeneration = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let currentRequest: Promise<void> | undefined
    const read = () => client.getQueryData<SessionPanelProjection>(key) ?? emptyProjection
    const publish = (change: Partial<SessionPanelProjection>) => {
      if (mounted) client.setQueryData<SessionPanelProjection>(key, previous => ({ ...emptyProjection, ...previous, ...change }))
    }
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    const schedule = () => {
      clearTimer()
      if (mounted && !currentRequest) timer = setTimeout(() => { void execute() }, interval.current * 1000)
    }

    async function select(sessionId: string, preserveCurrent = false): Promise<void> {
      const generation = ++detailGeneration
      const preserve = preserveCurrent && read().selectedSessionId === sessionId
      selection.current = sessionId
      onSelection.current(sessionId)
      publish({ selectedSessionId: sessionId, detailUnavailable: false, errorMessage: undefined,
        ...(!preserve ? { detail: undefined, users: [] } : {}) })
      setDetailLoading(true)
      const [detail, users] = await Promise.allSettled([
        bridge.bilibiliLive.session({ sessionId }), bridge.bilibiliLive.sessionUsers({ sessionId, limit: 100 })
      ])
      if (!mounted || generation !== detailGeneration) return
      publish({
        ...(detail.status === "fulfilled" ? { detail: detail.value } : {}),
        ...(users.status === "fulfilled" ? { users: users.value } : {}),
        detailUnavailable: detail.status === "rejected" || users.status === "rejected",
        errorMessage: detail.status === "rejected" && users.status === "rejected"
          ? "该历史场次暂无可恢复的受支持事件或身份记录。" : undefined
      })
      setDetailLoading(false)
    }

    async function loadSessions(): Promise<void> {
      const generation = ++listGeneration
      const previousSelection = selection.current
      detailGeneration++
      setLoading(true)
      setDetailLoading(false)
      publish({ errorMessage: undefined, detailUnavailable: false })
      try {
        const sessions = await bridge.bilibiliLive.sessions({ roomMonitorId: monitorId, limit: 20 })
        if (!mounted || generation !== listGeneration) return
        publish({ sessions })
        const next = sessions.find(session => session.id === previousSelection)?.id ?? sessions[0]?.id
        if (next) await select(next, next === previousSelection)
        else {
          selection.current = undefined
          onSelection.current(undefined)
          publish({ selectedSessionId: undefined, detail: undefined, users: [] })
        }
      } catch (error) {
        if (mounted && generation === listGeneration) publish({ errorMessage: error instanceof Error ? error.message : "场次记录加载失败" })
      } finally {
        if (mounted && generation === listGeneration) setLoading(false)
      }
    }

    function execute(): Promise<void> {
      if (currentRequest) return currentRequest
      const request = loadSessions().finally(() => {
        if (currentRequest === request) {
          currentRequest = undefined
          schedule()
        }
      })
      currentRequest = request
      return request
    }
    const controller = {
      refreshNow: async () => {
        clearTimer()
        if (currentRequest) await currentRequest
        clearTimer()
        if (mounted) await execute()
      },
      select: (sessionId: string) => select(sessionId),
      reschedule: () => { if (!currentRequest) schedule() }
    }
    actions.current = controller
    void execute()
    return () => {
      mounted = false
      listGeneration++
      detailGeneration++
      clearTimer()
      if (actions.current === controller) actions.current = {
        refreshNow: async () => undefined, select: async () => undefined, reschedule: () => undefined
      }
      setLoading(false)
      setDetailLoading(false)
    }
  }, [active, bridge, client, roomMonitorId])

  return {
    ...(projection.data ?? emptyProjection), loading, detailLoading, refreshSeconds,
    refreshNow: () => actions.current.refreshNow(),
    select: (sessionId: string) => actions.current.select(sessionId),
    dismissError: () => client.setQueryData<SessionPanelProjection>(queryKey, previous => ({ ...emptyProjection, ...previous, errorMessage: undefined })),
    setRefreshSeconds: (value: number) => {
      interval.current = Number.isFinite(value) ? Math.min(3600, Math.max(1, Math.round(value))) : 10
      setRefreshSeconds(interval.current)
      actions.current.reschedule()
    }
  }
}
