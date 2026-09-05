import { createRoot } from "react-dom/client"

import { DesktopWorkspace } from "../DesktopWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const bridge = createBrowserPreviewBridge()
bridge.bilibiliLive.list = async () => ({ items: [], total: 0, snapshotAt: new Date().toISOString() })
bridge.bilibiliLive.events = async () => []
bridge.bilibiliLive.summary = async () => ({ totalRooms: 0, activeRooms: 0, liveRooms: 0,
  roundRooms: 0, offlineRooms: 0, errorRooms: 0, totalOnlineCount: 0, todayLiveStarts: 0 })

createRoot(document.getElementById("app")!).render(
  <DesktopWorkspace initialPageId="bilibili-live" bridge={bridge} />
)
