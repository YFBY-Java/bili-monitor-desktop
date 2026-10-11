import type { DouyinCredential, DouyinQrLoginStart, DouyinQrLoginStatus } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import { ConnectedDouyinAuthWorkspace } from "../DouyinAuthWorkspace"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

// Synthetic IPC and clipboard only; never starts a Worker or reads real credentials.
const credential: DouyinCredential = {
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0c01", authType: "DOUYIN_WEB_SESSION", status: "ACTIVE",
  createdAt: "2026-10-06T01:00:00Z", updatedAt: "2026-10-06T01:00:00Z",
  payload: { account: { nickname: "离线测试账号" }, cookies: [], cookieHeadersByOrigin: {}, origins: [] }
}
const pendingStarts: Array<{ resolve: (value: DouyinQrLoginStart) => void; reject: (error: Error) => void }> = []
const pendingPolls: Array<{ loginId: string; resolve: (value: DouyinQrLoginStatus) => void }> = []
const fixture = {
  starts: 0, polls: [] as string[], copiedTexts: [] as string[], validations: 0,
  resolveStart(index: number) {
    pendingStarts[index]?.resolve({ loginId: `018f0f39-7b5e-4cc1-862d-9a208b3d0d0${index}`,
      status: "WAITING", expiresInSeconds: 180, pollIntervalMs: 500,
      expiresAt: "2026-10-06T15:00:00Z" })
  },
  rejectStart(index: number) { pendingStarts[index]?.reject(new Error("无法创建抖音扫码会话")) },
  resolvePoll(index: number, status: DouyinQrLoginStatus["status"]) {
    const request = pendingPolls[index]
    request?.resolve({ loginId: request.loginId, status, message: status, expiresInSeconds: 100 })
  }
}
declare global { interface Window { douyinWorkflowFixture: typeof fixture } }
window.douyinWorkflowFixture = fixture
Object.defineProperty(navigator, "clipboard", { value: {
  writeText: async (text: string) => { fixture.copiedTexts.push(text) }
} })
const bridge = createBrowserPreviewBridge()
bridge.douyinAuth.status = async () => ({ enabled: true, oauthMode: "disabled", workerAvailable: true, workerStatus: "UP", pollIntervalMs: 500,
  webCredential: { ...credential, authType: "DOUYIN_WEB_SESSION", payload: { account: { nickname: "离线测试账号" }, cookieCount: 0 } } })
bridge.douyinAuth.credential = async () => credential
bridge.douyinAuth.validateWeb = async () => {
  fixture.validations += 1
  return { valid: false, message: "离线登录态不可复用", details: {} }
}
bridge.douyinAuth.startWebQr = () => {
  fixture.starts += 1
  return new Promise((resolve, reject) => { pendingStarts.push({ resolve, reject }) })
}
bridge.douyinAuth.pollWebQr = ({ loginId }) => {
  fixture.polls.push(loginId)
  return new Promise(resolve => { pendingPolls.push({ loginId, resolve }) })
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}>
  <main className="theme-light" style={{ padding: 24, minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
    <ConnectedDouyinAuthWorkspace bridge={bridge} />
  </main>
</QueryClientProvider>)
