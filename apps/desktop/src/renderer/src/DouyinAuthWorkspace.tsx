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
import { useCallback, useEffect, useMemo, useState, type JSX } from "react"

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
  onValidateWeb: () => void
  onStartOAuth: () => void
  onCompleteOAuth: () => void
  onOAuthCodeChange: (value: string) => void
  onRefreshOAuth: () => void
  onOpenCredential: (kind: DouyinCredentialKind) => void
  onCloseCredential: () => void
  onCopyCredential: () => void
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
              {["浏览器就绪", "手机扫码", "新上下文复验", "完整保存"].map((step, index) => <span key={step}><i>{index + 1}</i>{step}</span>)}
            </div>
            <div className={`auth-qr-frame douyin-qr-frame ${qrTerminal ? "is-terminal" : ""}`}>
              {props.qrStatus?.imageDataUrl
                ? <img src={props.qrStatus.imageDataUrl} alt="抖音 Web 登录二维码" />
                : props.qrStatus?.status === "USER_ACTION_REQUIRED"
                  ? <div className="douyin-manual-state"><CircleAlert size={34} /><strong>先完成浏览器验证</strong><span>在 Worker 打开的可见浏览器中手动完成滑块；不要关闭窗口。</span></div>
                  : <LoaderCircle className="spin" size={28} />}
            </div>
            <div className={`auth-qr-status is-${props.qrStatus?.status.toLowerCase() ?? "starting"}`}>
              <strong>{statusLabel(props.qrStatus?.status)}</strong>
              <p>{props.qrStatus?.message ?? "正在创建仅用于本次扫码的浏览器会话。"}</p>
              {props.qrStatus && props.qrStatus.status !== "SUCCESS" && <span>剩余 {props.qrStatus.expiresInSeconds} 秒</span>}
            </div>
            {props.qrStatus?.status === "USER_ACTION_REQUIRED" && <p className="workspace-error"><CircleAlert size={16} /><strong>先完成浏览器验证：</strong>在 Worker 打开的可见浏览器中完成滑块后，系统会继续检测。</p>}
            <div className="douyin-capture-note"><ShieldCheck size={17} /><span><strong>完整保存：</strong>Cookie、localStorage、sessionStorage、IndexedDB、storageState 与浏览器上下文。</span></div>
            <footer><button className="button button-secondary" type="button" onClick={props.onCloseQr}>关闭</button>{qrTerminal && <button className="button button-primary" type="button" disabled={props.busy} onClick={props.onStartWebQr}>重新生成二维码</button>}</footer>
          </section>
        </div>
      )}

      {props.credentialOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="credential-drawer douyin-credential-drawer" role="dialog" aria-modal="true" aria-label={props.selectedCredential?.authType === "DOUYIN_OAUTH2" ? "完整抖音 OAuth 登录态" : "完整抖音 Web 登录态"}>
            <header><div><span>{props.selectedCredential?.authType ?? "DOUYIN CREDENTIAL"}</span><h2>{props.selectedCredential?.authType === "DOUYIN_OAUTH2" ? "完整抖音 OAuth 登录态" : "完整抖音 Web 登录态"}</h2></div><button className="icon-button" type="button" aria-label="关闭抖音登录态" onClick={props.onCloseCredential}><X size={17} /></button></header>
            {props.selectedCredential ? <CredentialDetails credential={props.selectedCredential} onCopy={props.onCopyCredential} onExport={() => props.onExportCredential(props.selectedCredential!.authType === "DOUYIN_OAUTH2" ? "oauth" : "web")} /> : <div className="credential-loading"><LoaderCircle className="spin" size={20} />正在从本机安全存储读取…</div>}
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

function CredentialDetails({ credential, onCopy, onExport }: { credential: DouyinCredential; onCopy: () => void; onExport: () => void }): JSX.Element {
  const origins = payloadArray(credential, "origins") as Array<Record<string, unknown>>
  const storage = (field: string): unknown => origins.map((origin) => ({ origin: origin.origin, [field]: origin[field] ?? [] }))
  const sections: Array<[string, string, unknown]> = credential.authType === "DOUYIN_WEB_SESSION"
    ? [
        ["账号信息", "account", credential.payload.account ?? {}],
        ["Cookie Header", "headers", credential.payload.cookieHeadersByOrigin ?? {}],
        ["Cookies JSON", "cookies", credential.payload.cookies ?? []],
        ["localStorage", "local", storage("localStorage")],
        ["sessionStorage", "session", storage("sessionStorage")],
        ["IndexedDB", "indexeddb", storage("indexedDb")],
        ["storageState", "storage", credential.payload.storageState ?? {}],
        ["浏览器上下文", "browser", credential.payload.browserContext ?? {}],
        ["Worker 原始结果", "worker", credential.payload.rawWorkerResult ?? {}]
      ]
    : [
        ["账号信息", "account", credential.payload.account ?? {}],
        ["OAuth 原始字段", "oauth", credential.payload],
        ["完整合并 JSON", "full", credential]
      ]
  return <div className="credential-content">
    <div className="credential-warning"><KeyRound size={17} /><span><strong>敏感原文</strong>仅在明确查看时由本机 Core 解密。</span></div>
    <div className="workspace-actions"><button className="button button-primary" type="button" onClick={onCopy}><Copy size={14} />复制全部 JSON</button><button className="button button-secondary" type="button" onClick={onExport}><Download size={14} />导出 JSON</button></div>
    <div className="douyin-credential-meta"><span>{credential.status}</span><strong>#{credential.credentialId}</strong><small>更新于 {formatTime(credential.updatedAt)}</small></div>
    {sections.map(([label, key, value]) => <CredentialField key={key} label={label} value={JSON.stringify(value, null, 2)} />)}
  </div>
}

function CredentialField({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="credential-field"><strong>{label}</strong><pre>{value}</pre></div>
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
    setQrOpen(true)
    void run(async () => {
      const started = await bridge.douyinAuth.startWebQr()
      setQrStart(started)
      setQrStatus({
        loginId: started.loginId,
        status: started.status,
        message: "正在创建仅用于本次扫码的浏览器会话。",
        expiresInSeconds: started.expiresInSeconds,
        ...(started.imageDataUrl ? { imageDataUrl: started.imageDataUrl } : {})
      })
    })
  }, [bridge, run])

  useEffect(() => {
    if (openRequest > 0) startWebQr()
  }, [openRequest, startWebQr])

  useEffect(() => {
    if (!qrOpen || !qrStart) return
    return startDouyinQrPolling({
      intervalMillis: qrStart.pollIntervalMs,
      poll: () => bridge.douyinAuth.pollWebQr({ loginId: qrStart.loginId }),
      onStatus: async (next) => {
        setQrStatus(next)
        if (next.status === "SUCCESS") {
          await queryClient.invalidateQueries({ queryKey: ["douyin-auth-status"] })
          setActionMessage("你的抖音 Web 登录态已完整保存。")
        }
      },
      onError: (error: unknown) => setActionError(
        error instanceof Error ? error.message : String(error)
      )
    })
  }, [bridge, qrOpen, qrStart, queryClient])

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
    busy={busy}
    {...(actionError ? { actionError } : {})}
    {...(actionMessage ? { actionMessage } : {})}
    onRefresh={() => { void statusQuery.refetch() }}
    onStartWebQr={startWebQr}
    onCloseQr={() => setQrOpen(false)}
    onValidateWeb={() => { void run(async () => { const result = await bridge.douyinAuth.validateWeb(); await statusQuery.refetch(); return result.message }) }}
    onStartOAuth={() => { void run(async () => { const started = await bridge.douyinAuth.startOAuth(); setOauthCredentialIdBeforeAuthorization(statusQuery.data?.oauthCredential?.credentialId); setOauthPending(started); setOauthCode(""); window.open(started.authorizationUrl, "_blank", "noopener,noreferrer"); return "已在系统浏览器打开抖音官方授权页。" }) }}
    onCompleteOAuth={() => { void run(async () => { if (!oauthPending) throw new Error("请先发起 OAuth 授权。"); await bridge.douyinAuth.completeOAuth({ state: oauthPending.state, code: oauthCode.trim() }); setOauthPending(undefined); setOauthCredentialIdBeforeAuthorization(undefined); setOauthCode(""); await statusQuery.refetch(); return "抖音 OAuth 登录态已保存。" }) }}
    onOAuthCodeChange={setOauthCode}
    onRefreshOAuth={() => { void run(async () => { await bridge.douyinAuth.refreshOAuth(); await statusQuery.refetch(); return "OAuth Token 已刷新并保留旧历史行。" }) }}
    onOpenCredential={(kind) => { setCredentialOpen(true); setSelectedCredential(undefined); void run(async () => { setSelectedCredential(await bridge.douyinAuth.credential({ kind })) }) }}
    onCloseCredential={() => { setCredentialOpen(false); setSelectedCredential(undefined) }}
    onCopyCredential={() => { if (selectedCredential) void navigator.clipboard.writeText(JSON.stringify(selectedCredential, null, 2)) }}
    onExportCredential={(kind) => { void run(async () => { const result = await bridge.douyinAuth.exportCredential({ kind }); return result.canceled ? undefined : `已导出到 ${result.savedPath}` }) }}
    onRevokeCredential={(kind) => {
      if (typeof window !== "undefined" && !window.confirm(`确认撤销当前抖音 ${kind === "web" ? "Web 登录态" : "OAuth 凭据"}？历史记录仍会保留。`)) return
      void run(async () => { await bridge.douyinAuth.revoke({ kind }); if (selectedKind === kind) { setCredentialOpen(false); setSelectedCredential(undefined) }; await statusQuery.refetch(); return "登录态已撤销。" })
    }}
  />
}
