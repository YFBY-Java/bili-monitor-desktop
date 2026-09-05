import { useEffect, useState, type JSX } from "react"

import { DesktopWorkspace, type RuntimeViewState } from "./DesktopWorkspace"
import { createBrowserPreviewBridge } from "./browser-preview-bridge"
import { resolvePageId } from "./navigation-state"

export function createInitialRuntime(preview: boolean): RuntimeViewState {
  return preview
    ? {
        phase: "offline",
        version: "browser-preview",
        schemaVersion: 11,
        workerCount: 0,
        error: "普通浏览器只读预览；真实业务运行在 Electron 客户端。"
      }
    : { phase: "starting" }
}

export default function App(): JSX.Element {
  const initialPageId = resolvePageId(window.location.hash)
  const preview = window.bmd === undefined
  const bridge = window.bmd ?? createBrowserPreviewBridge()
  const [runtime, setRuntime] = useState<RuntimeViewState>(() => createInitialRuntime(preview))

  useEffect(() => {
    let active = true
    if (preview) return () => { active = false }
    void bridge.core.bootstrap().then(
      (bootstrap) => {
        if (!active) return
        setRuntime({
          phase: bootstrap.coreStatus.state === "ready" ? "ready" : "degraded",
          version: bootstrap.coreStatus.version,
          schemaVersion: bootstrap.coreStatus.schemaVersion,
          workerCount: bootstrap.workers.length
        })
      },
      (error: unknown) => {
        if (!active) return
        setRuntime({
          phase: "offline",
          error: error instanceof Error ? error.message : String(error)
        })
      }
    )

    return () => {
      active = false
    }
  }, [bridge, preview])

  return <DesktopWorkspace initialPageId={initialPageId} runtime={runtime} bridge={bridge} />
}
