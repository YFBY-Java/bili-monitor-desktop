import { useEffect, useState, type JSX } from "react"

import { DesktopWorkspace, type RuntimeViewState } from "./DesktopWorkspace"
import { resolvePageId } from "./navigation-state"

export default function App(): JSX.Element {
  const initialPageId = resolvePageId(window.location.hash)
  const [runtime, setRuntime] = useState<RuntimeViewState>({ phase: "starting" })

  useEffect(() => {
    let active = true
    void window.bmd.core.bootstrap().then(
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
  }, [])

  return <DesktopWorkspace initialPageId={initialPageId} runtime={runtime} bridge={window.bmd} />
}
