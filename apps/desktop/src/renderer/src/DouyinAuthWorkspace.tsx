import type {
  DesktopBridge,
  DouyinAuthStatus,
  DouyinCredential,
  DouyinCredentialKind,
  DouyinOAuthStart,
  DouyinQrLoginStart,
  DouyinQrLoginStatus
} from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  Eye,
  KeyRound,
  LoaderCircle,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react"

export type DouyinAuthResourceState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "success"; data: DouyinAuthStatus; refreshing?: boolean }

type DouyinOAuthPending = Pick<DouyinOAuthStart, "loginId" | "state" | "expiresInSeconds">

export interface DouyinAuthWorkspaceProps {
  status: DouyinAuthResourceState
  qrOpen: boolean
  qrStatus?: DouyinQrLoginStatus
  credentialOpen: boolean
  selectedCredential?: DouyinCredential
  oauthPending?: DouyinOAuthPending
  oauthCode: string
  busy: boolean
  actionError?: string
  actionMessage?: string
  onRefresh: () => void
  onStartWebQr: () => void
  onCloseQr: () => void
  onRefreshQrImage?: () => void
  onValidateWeb: () => void
  onStartOAuth: () => void
  onCompleteOAuth: () => void
  onOAuthCodeChange: (value: string) => void
  onRefreshOAuth: () => void
  onOpenCredential: (kind: DouyinCredentialKind) => void
  onCloseCredential: () => void
  onCopyCredential: (text?: string) => void
  onExportCredential: (kind: DouyinCredentialKind) => void
  onRevokeCredential: (kind: DouyinCredentialKind) => void
}

function formatTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"
}

function payloadObject(credential: { payload: unknown } | undefined, key: string): Record<string, unknown> {
  const payload = credential?.payload
  const value = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)[key]
    : undefined
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function payloadArray(credential: { payload: unknown } | undefined, key: string): unknown[] {
  const payload = credential?.payload
  const value = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)[key]
    : undefined
  return Array.isArray(value) ? value : []
}

function credentialName(credential: { payload: unknown } | undefined, fallback: string): string {
  const account = payloadObject(credential, "account")
  const value = account.nickname ?? account.name ?? account.displayName
  return typeof value === "string" && value.trim() ? value : fallback
}

function scalar(value: unknown, fallback = "—"): string {
  if (Array.isArray(value)) return value.join(", ") || fallback
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback
}

function statusLabel(status: DouyinQrLoginStatus["status"] | undefined): string {
  const labels: Record<DouyinQrLoginStatus["status"], string> = {
    STARTING: "浏览器启动中",
    WAITING: "等待扫码",
    SCANNED: "已扫码",
    VALIDATING: "新 Context 复验中",
    SUCCESS: "登录态已保存",
    EXPIRED: "二维码已过期",
    USER_ACTION_REQUIRED: "需要人工验证",
    FAILED: "登录失败"
  }
  return status ? labels[status] : "准备浏览器会话"
}

export function DouyinAuthWorkspace(props: DouyinAuthWorkspaceProps): JSX.Element {
  const data = props.status.phase === "success" ? props.status.data : undefined
  const web = data?.webCredential?.authType === "DOUYIN_WEB_SESSION"
    ? data.webCredential
    : undefined
  const oauth = data?.oauthCredential?.authType === "DOUYIN_OAUTH2"
    ? data.oauthCredential
    : undefined
  const webValidated = typeof web?.payload.lastValidatedAt === "string"
  const webCookieCount = typeof web?.payload.cookieCount === "number"
    ? web.payload.cookieCount
    : payloadArray(web, "cookies").length
  const qrTerminal = props.qrStatus && ["SUCCESS", "EXPIRED", "FAILED"].includes(props.qrStatus.status)
  const qrStep = props.qrStatus ? { STARTING: 0, WAITING: 1, SCANNED: 2, VALIDATING: 2,
    SUCCESS: 4, EXPIRED: 1, USER_ACTION_REQUIRED: 0, FAILED: 0 }[props.qrStatus.status] : 0
  const qrOverlay = props.qrStatus ? { STARTING: "", WAITING: "", SCANNED: "已扫码", VALIDATING: "正在复验",
    SUCCESS: "保存成功", EXPIRED: "已过期", USER_ACTION_REQUIRED: "", FAILED: "" }[props.qrStatus.status] : ""

  return (
    <div className="douyin-auth-workspace">
      <section className="douyin-auth-hero">
        <div>
          <span>DOUYIN / AUTH STATE</span>
          <h2>我的抖音登录态</h2>
          <p>按原 BiliMonitor 业务保存自己的 Web 浏览器会话与官方 OAuth 凭据，两种登录态互不覆盖。</p>
        </div>
        <div className="douyin-hero-status">
          <StatusChip label="Browser Worker" value={data?.workerStatus ?? "DOWN"} active={data?.workerAvailable === true} />
          <StatusChip label="Web 会话" value={web?.status ?? "NONE"} active={Boolean(web)} />
          <button className="icon-button" type="button" aria-label="刷新抖音登录态" disabled={props.busy} onClick={props.onRefresh}>
            <RefreshCcw className={data?.workerStatus === "STARTING" ? "spin" : undefined} size={17} />
          </button>
        </div>
      </section>

      <div className="douyin-auth-signal" aria-label="Web 扫码登录链路">
        {[
          ["01", "隔离浏览器", "Worker 创建 Context", data?.workerAvailable],
          ["02", "手机确认", "自己的抖音扫码", Boolean(web)],
          ["03", "重新加载", "第二 Context 复验", webValidated],
          ["04", "完整保存", "原始会话加密入库", Boolean(web)]
        ].map(([index, title, detail, done]) => (
          <div className={done ? "is-done" : ""} key={String(index)}>
            <span>{index}</span><strong>{title}</strong><small>{detail}</small>
          </div>
        ))}
      </div>

      {props.status.phase === "loading" && <div className="workspace-loading"><LoaderCircle className="spin" size={18} />正在读取抖音登录态…</div>}
      {props.status.phase === "error" && <p className="workspace-error" role="alert"><CircleAlert size={16} />{props.status.message}</p>}
      {props.actionError && <p className="workspace-error" role="alert"><CircleAlert size={16} />{props.actionError}</p>}
      {props.actionMessage && <p className="workspace-success" role="status"><CheckCircle2 size={16} />{props.actionMessage}</p>}

      <div className="douyin-auth-grid">
        <section className="douyin-auth-card web-auth-card" aria-label="抖音 Web 扫码登录">
          <header>
            <div><span>主要登录方式 · Web QR</span><h3>{web ? credentialName(web, "抖音账号") : "扫码获取你自己的抖音登录态"}</h3></div>
            <StatusChip label="Worker" value={data?.workerAvailable ? "在线" : "不可用"} active={data?.workerAvailable === true} />
          </header>
          <p>{web
            ? `已保存 ${webCookieCount} 个 Cookie；最后复验 ${formatTime(typeof web.payload.lastValidatedAt === "string" ? web.payload.lastValidatedAt : undefined)}`
            : "独立浏览器打开抖音登录页；手机确认后，系统用第二个浏览器 Context 复验并加密保存完整会话。"}</p>
          <div className="douyin-session-facts">
            <Fact label="登录态" value={web?.status ?? "尚未保存"} />
            <Fact label="Cookie" value={web ? String(webCookieCount) : "—"} />
            <Fact label="新 Context 复验" value={webValidated ? "通过" : "未执行"} />
            <Fact label="Worker 状态" value={data?.workerStatus ?? "DOWN"} />
          </div>
          <div className="workspace-actions">
            <button className="button button-primary" type="button" disabled={props.busy || !data?.workerAvailable} onClick={props.onStartWebQr}><QrCode size={15} />{web ? "重新扫码" : "开始扫码"}</button>
            {web && <button className="button button-secondary" type="button" disabled={props.busy || !data?.workerAvailable} onClick={props.onValidateWeb}><RefreshCcw size={14} />重新加载校验</button>}
            {web && <button className="button button-secondary" type="button" disabled={props.busy} onClick={() => props.onOpenCredential("web")}><Eye size={14} />查看完整登录态</button>}
            {web && <button className="button button-secondary" type="button" disabled={props.busy} onClick={() => props.onExportCredential("web")}><Download size={14} />导出 JSON</button>}
            {web && <button className="auth-revoke-button" type="button" disabled={props.busy} onClick={() => props.onRevokeCredential("web")}><Trash2 size={14} />撤销</button>}
          </div>
          {!data?.workerAvailable && <p className="douyin-worker-hint">浏览器 Worker 当前不可用；这不会影响 B站业务。</p>}
        </section>

        <section className="douyin-auth-card oauth-auth-card" aria-label="抖音官方 OAuth">
          <header>
            <div><span>可选登录方式 · 官方 OAuth</span><h3>{oauth ? credentialName(oauth, "已授权抖音账号") : "开放平台授权"}</h3></div>
            <em className={`oauth-mode is-${data?.oauthMode ?? "disabled"}`}>{data?.oauthMode ?? "disabled"}</em>
          </header>
          <p>{oauth
            ? `Access Token 到期 ${formatTime(oauth.expiresAt)}`
            : data?.oauthMode === "disabled"
              ? "当前未配置开放平台应用；这不影响 Web 扫码登录。"
              : "跳转抖音开放平台完成授权，单独保存 OAuth token。"}</p>
          <dl className="oauth-facts">
            <div><dt>状态</dt><dd>{oauth?.status ?? "NONE"}</dd></div>
            <div><dt>Open ID</dt><dd>{scalar(oauth?.payload.openId)}</dd></div>
            <div><dt>Scope</dt><dd>{scalar(oauth?.payload.scope)}</dd></div>
          </dl>
          {props.oauthPending && (
            <div className="oauth-completion">
              <strong>完成授权回调</strong>
              <p>浏览器授权后，将回调地址中的 <code>code</code> 粘贴到这里；state 已由本机会话锁定并校验。</p>
              <div><input aria-label="抖音 OAuth 授权码" value={props.oauthCode} onChange={(event) => props.onOAuthCodeChange(event.target.value)} placeholder="回调参数 code" /><button className="button button-primary" type="button" disabled={props.busy || !props.oauthCode.trim()} onClick={props.onCompleteOAuth}>保存 OAuth 凭据</button></div>
            </div>
          )}
          <div className="workspace-actions">
            <button className="button button-primary outline" type="button" disabled={props.busy || data?.oauthMode !== "live"} onClick={props.onStartOAuth}><ExternalLink size={14} />{oauth ? "重新授权" : "开始官方授权"}</button>
            {oauth && <button className="button button-secondary" type="button" disabled={props.busy || data?.oauthMode !== "live"} onClick={props.onRefreshOAuth}><RefreshCcw size={14} />刷新 Token</button>}
            {oauth && <button className="button button-secondary" type="button" disabled={props.busy} onClick={() => props.onOpenCredential("oauth")}><Eye size={14} />查看完整登录态</button>}
            {oauth && <button className="button button-secondary" type="button" disabled={props.busy} onClick={() => props.onExportCredential("oauth")}><Download size={14} />导出 JSON</button>}
            {oauth && <button className="auth-revoke-button" type="button" disabled={props.busy} onClick={() => props.onRevokeCredential("oauth")}><Trash2 size={14} />撤销</button>}
          </div>
        </section>
      </div>

      {props.qrOpen && (
        <div className="auth-modal-backdrop" role="presentation">
          <section className="auth-modal douyin-qr-modal" role="dialog" aria-modal="true" aria-label="抖音 Web 扫码登录">
            <header><div><span>DOUYIN WEB QR</span><h2>用自己的抖音扫码登录</h2></div><button className="icon-button" type="button" aria-label="关闭抖音扫码登录" onClick={props.onCloseQr}><X size={17} /></button></header>
            <div className="douyin-qr-progress" aria-label="扫码进度">
              {["浏览器就绪", "手机扫码", "新上下文复验", "完整保存"].map((step, index) => <span key={step} className={index < qrStep ? "is-complete" : index === Math.min(qrStep, 3) ? "is-current" : ""}><i>{index + 1}</i>{step}</span>)}
            </div>
            <div className={`auth-qr-frame douyin-qr-frame ${qrTerminal ? "is-terminal" : ""}`}>
              {props.qrStatus?.imageDataUrl
                ? <img src={props.qrStatus.imageDataUrl} alt="抖音 Web 登录二维码" />
                : props.qrStatus?.status === "USER_ACTION_REQUIRED"
                  ? <div className="douyin-manual-state"><CircleAlert size={34} /><strong>先完成浏览器验证</strong><span>在 Worker 打开的可见浏览器中手动完成滑块；不要关闭窗口。</span></div>
                  : <LoaderCircle className="spin" size={28} />}
              {qrOverlay && props.qrStatus?.imageDataUrl && <div className="douyin-qr-overlay">{qrOverlay}</div>}
            </div>
            <div className={`auth-qr-status is-${props.qrStatus?.status.toLowerCase() ?? "starting"}`}>
              <strong>{statusLabel(props.qrStatus?.status)}</strong>
              <p>{props.qrStatus?.message ?? "正在创建仅用于本次扫码的浏览器会话。"}</p>
              {props.qrStatus && !["SUCCESS", "FAILED"].includes(props.qrStatus.status) && <span>剩余 {props.qrStatus.expiresInSeconds} 秒</span>}
            </div>
            {props.qrStatus?.status === "USER_ACTION_REQUIRED" && <p className="workspace-error"><CircleAlert size={16} /><strong>先完成浏览器验证：</strong>在 Worker 打开的可见浏览器中完成滑块后，系统会继续检测。</p>}
            <div className="douyin-capture-note"><ShieldCheck size={17} /><span><strong>完整保存：</strong>Cookie、localStorage、sessionStorage、IndexedDB、storageState 与浏览器上下文。</span></div>
            <footer><button className="button button-secondary" type="button" onClick={props.onCloseQr}>关闭</button>{qrTerminal
              ? <button className="button button-primary" type="button" disabled={props.busy} onClick={props.onStartWebQr}>重新生成二维码</button>
              : props.onRefreshQrImage && props.qrStatus && ["WAITING", "SCANNED"].includes(props.qrStatus.status) && <button className="button button-secondary" type="button" disabled={props.busy} onClick={props.onRefreshQrImage}>刷新二维码图片</button>}</footer>
          </section>
        </div>
      )}

      {props.credentialOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="credential-drawer douyin-credential-drawer" role="dialog" aria-modal="true" aria-label={props.selectedCredential?.authType === "DOUYIN_OAUTH2" ? "完整抖音 OAuth 登录态" : "完整抖音 Web 登录态"}>
            <header><div><span>{props.selectedCredential?.authType ?? "DOUYIN CREDENTIAL"}</span><h2>{props.selectedCredential?.authType === "DOUYIN_OAUTH2" ? "完整抖音 OAuth 登录态" : "完整抖音 Web 登录态"}</h2></div><button className="icon-button" type="button" aria-label="关闭抖音登录态" onClick={props.onCloseCredential}><X size={17} /></button></header>
            {props.selectedCredential ? <CredentialDetails key={props.selectedCredential.credentialId} credential={props.selectedCredential} onCopy={props.onCopyCredential} onExport={() => props.onExportCredential(props.selectedCredential!.authType === "DOUYIN_OAUTH2" ? "oauth" : "web")} /> : <div className="credential-loading"><LoaderCircle className="spin" size={20} />正在从本机安全存储读取…</div>}
          </section>
        </div>
      )}
    </div>
  )
}

function StatusChip({ label, value, active }: { label: string; value: string; active: boolean }): JSX.Element {
  return <div className={`douyin-status-chip ${active ? "is-active" : ""}`}><span>{label}</span><strong>{value}</strong></div>
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function CredentialDetails({ credential, onCopy, onExport }: { credential: DouyinCredential; onCopy: (text?: string) => void; onExport: () => void }): JSX.Element {
  const [activeKey, setActiveKey] = useState("account")
  const origins = payloadArray(credential, "origins") as Array<Record<string, unknown>>
  const storage = (field: string): unknown => origins.map((origin) => ({ origin: origin.origin, [field]: origin[field] || [] }))
  const sections: Array<[string, string, string, unknown]> = [
    ["账号信息", "account", "Worker 或 OAuth 返回的账号原始字段。", credential.payload.account || {}],
    ["Cookie Header", "headers", "按目标 Origin 生成的完整 Cookie Header。", credential.payload.cookieHeadersByOrigin || {}],
    ["Cookies JSON", "cookies", "浏览器上下文内捕获的全部 Cookie 及其属性。", credential.payload.cookies || []],
    ["localStorage", "local", "逐 Origin 保存的 localStorage。", storage("localStorage")],
    ["sessionStorage", "session", "逐 Origin 保存的 sessionStorage。", storage("sessionStorage")],
    ["IndexedDB", "indexeddb", "Playwright 可序列化导出的 IndexedDB。", storage("indexedDb")],
    ["storageState", "storage", "Playwright 原始 storageState，可用于恢复新 Context。", credential.payload.storageState || {}],
    ["浏览器上下文", "browser", "User-Agent、语言、时区、视口与平台信息。", credential.payload.browserContext || {}],
    ["Worker 原始结果", "worker", "捕获与第二 Context 复验时的 Worker 原始结果。", credential.payload.rawWorkerResult || {}],
    ["完整合并 JSON", "full", "数据库解密后的完整凭据对象。", credential]
  ]
  const active = sections.find(([, key]) => key === activeKey) ?? sections[0]!
  const activeText = JSON.stringify(active[3] ?? null, null, 2)
  return <div className="credential-content">
    <div className="credential-warning"><KeyRound size={17} /><span><strong>敏感原文</strong>仅在明确查看时由本机 Core 解密。</span></div>
    <div className="workspace-actions"><button className="button button-primary" type="button" onClick={() => onCopy()}><Copy size={14} />复制全部 JSON</button><button className="button button-secondary" type="button" onClick={onExport}><Download size={14} />导出 JSON</button></div>
    <div className="douyin-credential-meta"><span>{credential.status}</span><strong>#{credential.credentialId}</strong><small>更新于 {formatTime(credential.updatedAt)}</small></div>
    <div className="douyin-credential-tabs" role="tablist" aria-label="登录态原始字段">
      {sections.map(([label, key], index) => <button type="button" role="tab" key={key} id={`credential-tab-${key}`} aria-controls={`credential-panel-${key}`} aria-selected={key === active[1]} tabIndex={key === active[1] ? 0 : -1}
        onClick={() => setActiveKey(key)} onKeyDown={event => {
          const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : undefined
          const nextIndex = offset === undefined ? event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : undefined : (index + offset + sections.length) % sections.length
          if (nextIndex === undefined) return
          event.preventDefault()
          const next = sections[nextIndex]!
          setActiveKey(next[1])
          document.getElementById(`credential-tab-${next[1]}`)?.focus()
        }}>{label}</button>)}
    </div>
    <div className="credential-field" role="tabpanel" id={`credential-panel-${active[1]}`} aria-labelledby={`credential-tab-${active[1]}`}>
      <div className="douyin-credential-toolbar"><div><strong>{active[0]}</strong><span>{active[2]}</span></div><button className="button button-secondary" type="button" onClick={() => onCopy(activeText)}><Copy size={14} />复制当前字段</button></div>
      <pre>{activeText}</pre>
    </div>
  </div>
}

export function hasOAuthCredentialChanged(
  credentialIdBeforeAuthorization: string | undefined,
  status: DouyinAuthStatus | undefined
): boolean {
  const currentCredentialId = status?.oauthCredential?.credentialId
  return Boolean(
    currentCredentialId
    && currentCredentialId !== credentialIdBeforeAuthorization
  )
}

export function startDouyinQrPolling(options: {
  intervalMillis: number
  poll: () => Promise<DouyinQrLoginStatus>
  onStatus: (status: DouyinQrLoginStatus) => void | Promise<void>
  onError: (error: unknown) => void
}): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    if (stopped) return
    timer = setTimeout(() => { void tick() }, options.intervalMillis)
  }
  const tick = async (): Promise<void> => {
    try {
      const status = await options.poll()
      if (stopped) return
      await options.onStatus(status)
      if (!["SUCCESS", "EXPIRED", "FAILED"].includes(status.status)) schedule()
    } catch (error) {
      if (stopped) return
      options.onError(error)
      schedule()
    }
  }
  schedule()
  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function ConnectedDouyinAuthWorkspace({ bridge, openRequest = 0 }: { bridge: DesktopBridge; openRequest?: number }): JSX.Element {
  const queryClient = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [qrStart, setQrStart] = useState<DouyinQrLoginStart>()
  const [qrStatus, setQrStatus] = useState<DouyinQrLoginStatus>()
  const [qrStarting, setQrStarting] = useState(false)
  const [qrImageLoading, setQrImageLoading] = useState(false)
  const qrGeneration = useRef(0)
  const qrInFlight = useRef<{ generation: number; promise: Promise<DouyinQrLoginStatus> } | undefined>(undefined)
  const stopQrPolling = useRef<(() => void) | undefined>(undefined)
  const credentialGeneration = useRef(0)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [selectedCredential, setSelectedCredential] = useState<DouyinCredential>()
  const [oauthPending, setOauthPending] = useState<DouyinOAuthPending>()
  const [oauthCredentialIdBeforeAuthorization, setOauthCredentialIdBeforeAuthorization] = useState<string>()
  const [handledOAuthSession, setHandledOAuthSession] = useState<string>()
  const [oauthCode, setOauthCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [actionMessage, setActionMessage] = useState<string>()
  const statusQuery = useQuery({
    queryKey: ["douyin-auth-status"],
    queryFn: () => bridge.douyinAuth.status(),
    staleTime: 0,
    refetchInterval: oauthPending ? 2_000 : false
  })

  useEffect(() => {
    if (!oauthPending || !hasOAuthCredentialChanged(
      oauthCredentialIdBeforeAuthorization,
      statusQuery.data
    )) return
    setOauthPending(undefined)
    setOauthCredentialIdBeforeAuthorization(undefined)
    setOauthCode("")
    setActionMessage("抖音 OAuth 登录态已保存。")
  }, [oauthCredentialIdBeforeAuthorization, oauthPending, statusQuery.data])

  useEffect(() => {
    const session = statusQuery.data?.latestOAuthSession
    if (!session || handledOAuthSession === `${session.loginId}:${session.status}`) return
    if (session.status === "WAITING" || session.status === "VALIDATING") {
      const expiresInSeconds = Math.max(0, Math.ceil(
        (new Date(session.expiresAt).getTime() - Date.now()) / 1_000
      ))
      if (expiresInSeconds > 0 && !oauthPending) {
        setOauthPending({ loginId: session.loginId, state: session.state, expiresInSeconds })
        setOauthCredentialIdBeforeAuthorization(statusQuery.data?.oauthCredential?.credentialId)
      }
    } else if (session.status === "FAILED" || session.status === "EXPIRED") {
      setOauthPending(undefined)
      setOauthCredentialIdBeforeAuthorization(undefined)
      setOauthCode("")
      setActionError(session.errorMessage ?? (session.status === "EXPIRED"
        ? "抖音 OAuth 授权会话已过期，请重新发起授权。"
        : "抖音 OAuth 授权未完成。"))
    }
    setHandledOAuthSession(`${session.loginId}:${session.status}`)
  }, [handledOAuthSession, oauthPending, statusQuery.data])

  useEffect(() => bridge.douyinAuth.onOAuthCallbackFailure((failure) => {
    if (failure.state !== oauthPending?.state) return
    setOauthPending(undefined)
    setOauthCredentialIdBeforeAuthorization(undefined)
    setOauthCode("")
    setActionError(failure.message)
  }), [bridge, oauthPending])

  useEffect(() => {
    if (!oauthPending) return
    const timer = window.setTimeout(() => {
      setOauthPending(undefined)
      setOauthCredentialIdBeforeAuthorization(undefined)
      setOauthCode("")
      setActionError("抖音 OAuth 授权会话已过期，请重新发起授权。")
    }, oauthPending.expiresInSeconds * 1_000)
    return () => window.clearTimeout(timer)
  }, [oauthPending])

  const run = useCallback(async (operation: () => Promise<string | void>): Promise<void> => {
    setBusy(true)
    setActionError(undefined)
    setActionMessage(undefined)
    try {
      const message = await operation()
      if (message) setActionMessage(message)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  const startWebQr = useCallback((): void => {
    const generation = ++qrGeneration.current
    stopQrPolling.current?.()
    stopQrPolling.current = undefined
    setQrStart(undefined)
    setQrStatus(undefined)
    setQrStarting(true)
    setQrImageLoading(false)
    setActionError(undefined)
    setActionMessage(undefined)
    setQrOpen(true)
    void (async () => {
      try {
        const started = await bridge.douyinAuth.startWebQr()
        if (qrGeneration.current !== generation) return
        setQrStart(started)
        setQrStatus({ loginId: started.loginId, status: started.status,
          message: started.status === "WAITING" ? "抖音登录二维码已准备好，请使用抖音 App 扫码。" : "正在创建仅用于本次扫码的浏览器会话。",
          expiresInSeconds: started.expiresInSeconds,
          ...(started.imageDataUrl ? { imageDataUrl: started.imageDataUrl } : {}) })
      } catch (error) {
        if (qrGeneration.current !== generation) return
        const message = error instanceof Error ? error.message : "无法创建抖音扫码会话。"
        setActionError(message)
        setQrStatus({ loginId: "", status: "FAILED", message, expiresInSeconds: 0 })
      } finally {
        if (qrGeneration.current === generation) setQrStarting(false)
      }
    })()
  }, [bridge])

  const closeQr = useCallback((): void => {
    qrGeneration.current += 1
    stopQrPolling.current?.()
    stopQrPolling.current = undefined
    setQrOpen(false)
    setQrStart(undefined)
    setQrStatus(undefined)
    setQrStarting(false)
    setQrImageLoading(false)
  }, [])

  useEffect(() => () => {
    qrGeneration.current += 1
    credentialGeneration.current += 1
    stopQrPolling.current?.()
  }, [])

  useEffect(() => {
    if (openRequest > 0) startWebQr()
  }, [openRequest, startWebQr])

  const readQrStatus = useCallback((loginId: string, generation: number): Promise<DouyinQrLoginStatus> => {
    if (qrInFlight.current?.generation === generation) return qrInFlight.current.promise
    const promise = bridge.douyinAuth.pollWebQr({ loginId }).then(async next => {
      if (qrGeneration.current !== generation) return next
      setActionError(undefined)
      setQrStatus(previous => ({ ...next,
        ...(!next.imageDataUrl && previous?.imageDataUrl ? { imageDataUrl: previous.imageDataUrl } : {}) }))
      if (["SUCCESS", "EXPIRED", "FAILED"].includes(next.status)) stopQrPolling.current?.()
      if (next.status === "SUCCESS") {
        await queryClient.invalidateQueries({ queryKey: ["douyin-auth-status"] })
        if (qrGeneration.current === generation) setActionMessage("你的抖音 Web 登录态已完整保存。")
      }
      return next
    })
    const entry = { generation, promise }
    qrInFlight.current = entry
    const clear = (): void => { if (qrInFlight.current === entry) qrInFlight.current = undefined }
    void promise.then(clear, clear)
    return promise
  }, [bridge, queryClient])

  useEffect(() => {
    if (!qrOpen || !qrStart) return
    const generation = qrGeneration.current
    const stop = startDouyinQrPolling({
      intervalMillis: qrStart.pollIntervalMs,
      poll: () => readQrStatus(qrStart.loginId, generation),
      onStatus: () => undefined,
      onError: (error: unknown) => {
        if (qrGeneration.current === generation) setActionError(error instanceof Error ? error.message : "暂时无法读取扫码状态，系统会继续重试。")
      }
    })
    stopQrPolling.current = stop
    return () => { stop(); if (stopQrPolling.current === stop) stopQrPolling.current = undefined }
  }, [qrOpen, qrStart, readQrStatus])

  const resource: DouyinAuthResourceState = statusQuery.isPending
    ? { phase: "loading" }
    : statusQuery.isError
      ? { phase: "error", message: statusQuery.error.message }
      : { phase: "success", data: statusQuery.data, refreshing: statusQuery.isFetching }

  const selectedKind = useMemo<DouyinCredentialKind | undefined>(() => selectedCredential?.authType === "DOUYIN_OAUTH2" ? "oauth" : selectedCredential ? "web" : undefined, [selectedCredential])

  return <DouyinAuthWorkspace
    status={resource}
    qrOpen={qrOpen}
    {...(qrStatus ? { qrStatus } : {})}
    credentialOpen={credentialOpen}
    {...(selectedCredential ? { selectedCredential } : {})}
    {...(oauthPending ? { oauthPending } : {})}
    oauthCode={oauthCode}
    busy={busy || qrStarting || qrImageLoading}
    {...(actionError ? { actionError } : {})}
    {...(actionMessage ? { actionMessage } : {})}
    onRefresh={() => { void statusQuery.refetch() }}
    onStartWebQr={startWebQr}
    onCloseQr={closeQr}
    onRefreshQrImage={() => {
      if (!qrStart) return
      const generation = qrGeneration.current
      setQrImageLoading(true)
      void readQrStatus(qrStart.loginId, generation).catch(error => {
        if (qrGeneration.current === generation) setActionError(error instanceof Error ? error.message : "二维码暂未生成，系统会继续检测。")
      }).finally(() => { if (qrGeneration.current === generation) setQrImageLoading(false) })
    }}
    onValidateWeb={() => { void run(async () => {
      const result = await bridge.douyinAuth.validateWeb()
      await statusQuery.refetch()
      if (!result.valid) { setActionError(result.message || "保存的抖音登录态不可复用。"); return }
      return result.message || "保存的抖音登录态可复用。"
    }) }}
    onStartOAuth={() => { void run(async () => { const started = await bridge.douyinAuth.startOAuth(); setOauthCredentialIdBeforeAuthorization(statusQuery.data?.oauthCredential?.credentialId); setOauthPending(started); setOauthCode(""); window.open(started.authorizationUrl, "_blank", "noopener,noreferrer"); return "已在系统浏览器打开抖音官方授权页。" }) }}
    onCompleteOAuth={() => { void run(async () => { if (!oauthPending) throw new Error("请先发起 OAuth 授权。"); await bridge.douyinAuth.completeOAuth({ state: oauthPending.state, code: oauthCode.trim() }); setOauthPending(undefined); setOauthCredentialIdBeforeAuthorization(undefined); setOauthCode(""); await statusQuery.refetch(); return "抖音 OAuth 登录态已保存。" }) }}
    onOAuthCodeChange={setOauthCode}
    onRefreshOAuth={() => { void run(async () => { await bridge.douyinAuth.refreshOAuth(); await statusQuery.refetch(); return "OAuth Token 已刷新并保留旧历史行。" }) }}
    onOpenCredential={(kind) => {
      const generation = ++credentialGeneration.current
      void run(async () => {
        const credential = await bridge.douyinAuth.credential({ kind })
        if (credentialGeneration.current !== generation) return
        setSelectedCredential(credential)
        setCredentialOpen(true)
      })
    }}
    onCloseCredential={() => { credentialGeneration.current += 1; setCredentialOpen(false); setSelectedCredential(undefined) }}
    onCopyCredential={(text) => { if (selectedCredential) void run(async () => { await navigator.clipboard.writeText(text ?? JSON.stringify(selectedCredential, null, 2)); return "已复制原始字段。" }) }}
    onExportCredential={(kind) => { void run(async () => { const result = await bridge.douyinAuth.exportCredential({ kind }); return result.canceled ? undefined : `已导出到 ${result.savedPath}` }) }}
    onRevokeCredential={(kind) => {
      if (typeof window !== "undefined" && !window.confirm(`确认撤销当前抖音 ${kind === "web" ? "Web 登录态" : "OAuth 凭据"}？历史记录仍会保留。`)) return
      void run(async () => { await bridge.douyinAuth.revoke({ kind }); if (selectedKind === kind) { setCredentialOpen(false); setSelectedCredential(undefined) }; await statusQuery.refetch(); return "登录态已撤销。" })
    }}
  />
}
