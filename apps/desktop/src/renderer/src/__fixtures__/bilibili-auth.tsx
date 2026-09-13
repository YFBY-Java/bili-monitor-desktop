import type { BilibiliAuthAccount, BilibiliCredential, BilibiliQrLoginStatus } from "@bmd/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ConnectedBilibiliAuthPanel } from "../BilibiliAuthPanel"
import { createBrowserPreviewBridge } from "../browser-preview-bridge"
import "../styles.css"

const account: BilibiliAuthAccount = { mid: "99", uname: "合成登录用户", face: "https://example.test/synthetic-face.png", level: 0, vipStatus: 0 }
const credential: BilibiliCredential = {
  credentialId: "018f0f39-7b5e-4cc1-862d-9a208b3d0601", account,
  expiresAt: "2026-12-13T04:00:00.000Z",
  cookieHeader: "SESSDATA=SYNTHETIC_AUTH_VALUE; bili_jct=SYNTHETIC_CSRF; DedeUserID=99",
  csrf: "SYNTHETIC_CSRF", refreshToken: "SYNTHETIC_REFRESH",
  cookies: [{ name: "SESSDATA", value: "SYNTHETIC_AUTH_VALUE" }], rawPayload: { synthetic: true }
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const fixture = {
  signedIn: new URLSearchParams(location.search).get("active") === "1",
  calls: [] as string[], started: 0, pollIds: [] as string[], pollActive: 0, maxPollActive: 0,
  startError: "", statusError: "", actionError: "", copyError: "", clipboard: [] as string[],
  holdStart: false, holdPoll: false, holdCredential: false,
  startReleases: [] as Array<() => void>, pollReleases: [] as Array<() => void>, credentialReleases: [] as Array<() => void>,
  pollResult: { status: "WAITING", message: "合成等待扫码", expiresInSeconds: 170 } as BilibiliQrLoginStatus,
  credential,
  queryData: () => client.getQueryCache().getAll().map(query => query.state.data)
}
declare global { interface Window { bilibiliAuthFixture: typeof fixture } }
window.bilibiliAuthFixture = fixture
Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
  writeText: async (text: string) => { if (fixture.copyError) throw new Error(fixture.copyError); fixture.clipboard.push(text) }
} })
const bridge = createBrowserPreviewBridge()
bridge.bilibiliAuth = {
  status: async () => {
    fixture.calls.push("status")
    if (fixture.statusError) throw new Error(fixture.statusError)
    return fixture.signedIn
      ? { loggedIn: true, status: "ACTIVE", account, credentialId: credential.credentialId, expiresAt: credential.expiresAt!, lastValidatedAt: "2026-09-13T04:00:00.000Z" }
      : { loggedIn: false, status: "NONE" }
  },
  refresh: async () => {
    fixture.calls.push("refresh")
    if (fixture.actionError) throw new Error(fixture.actionError)
    return { refreshed: false, loggedIn: true, account, message: "登录态已重新校验；此操作不会刷新 Cookie。" }
  },
  startQrLogin: async () => {
    fixture.calls.push("start")
    const index = ++fixture.started, error = fixture.startError
    if (fixture.holdStart) await new Promise<void>(resolve => fixture.startReleases.push(resolve))
    if (error) throw new Error(error)
    return { loginId: `018f0f39-7b5e-4cc1-862d-${String(index).padStart(12, "0")}`,
      qrUrl: `https://example.test/synthetic-qr/${index}`, expiresInSeconds: 180, pollIntervalMillis: 1000 }
  },
  pollQrLogin: async ({ loginId }) => {
    fixture.calls.push("poll"); fixture.pollIds.push(loginId)
    fixture.pollActive++; fixture.maxPollActive = Math.max(fixture.maxPollActive, fixture.pollActive)
    const result = structuredClone(fixture.pollResult)
    try {
      if (fixture.holdPoll) await new Promise<void>(resolve => fixture.pollReleases.push(resolve))
      if (result.status === "SUCCESS") fixture.signedIn = true
      return result
    } finally { fixture.pollActive-- }
  },
  credential: async () => {
    fixture.calls.push("credential")
    const result = structuredClone(fixture.credential), error = fixture.actionError
    if (fixture.holdCredential) await new Promise<void>(resolve => fixture.credentialReleases.push(resolve))
    if (error) throw new Error(error)
    return result
  },
  revoke: async () => {
    fixture.calls.push("revoke")
    if (fixture.actionError) throw new Error(fixture.actionError)
    fixture.signedIn = false
    return { revoked: true }
  }
}
function Fixture() {
  const [mounted, setMounted] = useState(true)
  return <QueryClientProvider client={client}><main className="theme-light" style={{ minHeight: "100vh", padding: 24, background: "var(--bg)", color: "var(--text)" }}>
    <button className="button button-secondary" onClick={() => setMounted(value => !value)}>挂载或卸载登录面板</button>
    {mounted && <ConnectedBilibiliAuthPanel bridge={bridge} />}
  </main></QueryClientProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
