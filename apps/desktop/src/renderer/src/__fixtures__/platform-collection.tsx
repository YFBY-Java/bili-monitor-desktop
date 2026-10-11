import type { RunPlatformCollectionInput } from "@bmd/contracts"
import { createRoot } from "react-dom/client"
import { DesktopWorkspace } from "../DesktopWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

// Synthetic typed IPC only. No platform requests, Worker, control.db or real account.
const fixture = { listCalls: 0, calls: [] as RunPlatformCollectionInput[] }
declare global { interface Window { platformCollectionFixture: typeof fixture } }
window.platformCollectionFixture = fixture
const bridge = createBrowserPreviewBridge()
bridge.platformCollection = {
  listAdapters: async () => {
    fixture.listCalls += 1
    return [{ platformCode: "bilibili", capabilities: ["ACCOUNT_PROFILE", "CONTENT_LIST"], implementedDataTypes: ["account"] }]
  },
  runOnce: async input => {
    fixture.calls.push(input)
    const success = fixture.calls.length === 1
    return { platformCode: input.platformCode, dataType: input.dataType, status: success ? "SUCCESS" : "MANUAL_REVIEW",
      fetchResult: { success, data: success ? { platform: "bilibili", externalAccountId: "9007199254740993",
        displayName: "离线资料账号", avatarUrl: "", profileUrl: "https://space.bilibili.com/9007199254740993",
        followerCount: "9007199254740995", followingCount: "83", fetchedAt: "2026-10-06T01:00:00Z", sourceEndpoint: "x/web-interface/card" } : null,
      rawPayload: null, rawPayloadObject: null, nextCursor: null,
      rateLimitInfo: { limited: false, remaining: null, resetAt: null, policyKey: success ? "default" : "failure" },
      errorType: success ? "NONE" : "NETWORK_ERROR", retryable: !success, riskLevel: "LOW", message: success ? "ok" : "离线网络失败" } }
  }
}
createRoot(document.getElementById("root")!).render(<DesktopWorkspace initialPageId="platform-collection" bridge={bridge}
  runtime={{ phase: "ready", version: "offline-fixture", schemaVersion: 11, workerCount: 0 }} />)
