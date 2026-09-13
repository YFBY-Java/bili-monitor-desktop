import type {
  BilibiliAuthStatus,
  BilibiliCredential,
  BilibiliQrLoginStart,
  BilibiliQrLoginStatus,
  DesktopBridge
} from "@bmd/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CircleAlert,
  Copy,
  Eye,
  LoaderCircle,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  X
} from "lucide-react"
import QRCode from "qrcode"
import { useCallback, useEffect, useRef, useState, type JSX } from "react"
import "./bilibili-auth-panel.css"

export type AuthResourceState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "success"; data: BilibiliAuthStatus; refreshing?: boolean; staleMessage?: string }

export interface BilibiliAuthPanelProps {
  status: AuthResourceState
  qrOpen: boolean
  qrDataUrl?: string
  qrStatus?: BilibiliQrLoginStatus
  credentialOpen: boolean
  credential?: BilibiliCredential
  busy: boolean
  actionError?: string
  actionMessage?: string
  onOpenQr: () => void
  onCloseQr: () => void
  onRegenerateQr: () => void
  onRefresh: () => void
  onOpenCredential: () => void
  onCloseCredential: () => void
  onRevoke: () => void
  onCopyCredential: () => void
  onCopyField?: (text: string) => void
}

function formatTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"
}

function statusLabel(status: BilibiliQrLoginStatus | undefined): string {
  if (!status || status.status === "WAITING") return "等待扫码"
  if (status.status === "SCANNED") return "已扫码"
  if (status.status === "SUCCESS") return "登录成功"
  if (status.status === "EXPIRED") return "已过期"
  return "登录失败"
}

export function BilibiliAuthPanel(props: BilibiliAuthPanelProps): JSX.Element {
  const status = props.status.phase === "success" ? props.status.data : undefined
  const account = status?.account
  const loggedIn = status?.loggedIn === true
  const terminalQr = props.qrStatus?.status === "EXPIRED" || props.qrStatus?.status === "FAILED"

  return (
    <>
      <section className="bilibili-auth-panel" aria-label="Bilibili 登录态">
        <div className="auth-panel-copy">
          <span>BILIBILI AUTH</span>
          {props.status.phase === "loading" ? (
            <div className="auth-loading"><LoaderCircle className="spin" size={16} />正在校验本地登录态</div>
          ) : props.status.phase === "error" ? (
            <div className="auth-error"><CircleAlert size={16} />{props.status.message}</div>
          ) : (
            <>
              <h2>{loggedIn ? account?.uname ?? "Bilibili 用户" : "未配置登录态"}</h2>
              <p>{loggedIn
                ? `UID ${account?.mid ?? "—"} · 最后校验 ${formatTime(status.lastValidatedAt)} · 到期 ${formatTime(status.expiresAt)}`
                : "扫码登录后，凭据只在本机加密保存，用于原项目需要登录态的 B站功能。"}</p>
            </>
          )}
        </div>

        {loggedIn && account && (
          <div className="auth-account-card">
            <div className="auth-account-avatar">
              <UserRound size={17} />
              {account.face && <img src={account.face} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}
            </div>
            <div><strong>{account.uname}</strong><span>UID {account.mid} · {status.status}</span></div>
          </div>
        )}

        <div className="auth-panel-actions">
          <button className="button button-primary" disabled={props.busy} type="button" onClick={props.onOpenQr}>
            <QrCode size={14} />{loggedIn ? "重新扫码" : "扫码登录"}
          </button>
          <button className="button button-secondary" disabled={props.busy} type="button" onClick={props.onRefresh}>
            <RefreshCcw size={14} />刷新校验
          </button>
          {loggedIn && (
            <>
              <button className="button button-secondary" disabled={props.busy} type="button" onClick={props.onOpenCredential}><Eye size={14} />查看完整登录态</button>
              <button className="auth-revoke-button" disabled={props.busy} type="button" onClick={props.onRevoke}><Trash2 size={14} />移除登录态</button>
            </>
          )}
        </div>
        {props.status.phase === "success" && props.status.staleMessage && <p className="auth-action-error" role="alert">状态更新失败，保留上次信息：{props.status.staleMessage}</p>}
        {!props.qrOpen && !props.credentialOpen && <AuthFeedback error={props.actionError} message={props.actionMessage} />}
      </section>

      {props.qrOpen && (
        <div className="auth-modal-backdrop" role="presentation">
          <section className="auth-modal" role="dialog" aria-modal="true" aria-label="扫码登录 Bilibili">
            <header><div><span>BILIBILI WEB QR</span><h2>扫码登录 Bilibili</h2></div><button className="icon-button" type="button" aria-label="关闭扫码登录" onClick={props.onCloseQr}><X size={17} /></button></header>
            <div className={`auth-qr-frame ${terminalQr ? "is-terminal" : ""}`}>
              {props.qrDataUrl ? <img src={props.qrDataUrl} alt="Bilibili 登录二维码" /> : <LoaderCircle className="spin" size={26} />}
            </div>
            <div className={`auth-qr-status is-${props.qrStatus?.status.toLowerCase() ?? "waiting"}`}>
              <strong>{statusLabel(props.qrStatus)}</strong>
              <p>{props.qrStatus?.message ?? "正在本机生成二维码…"}</p>
              {props.qrStatus?.expiresInSeconds !== undefined && props.qrStatus.status !== "SUCCESS" && <span>剩余 {props.qrStatus.expiresInSeconds} 秒</span>}
            </div>
            {props.qrStatus?.account && <div className="auth-qr-account"><UserRound size={20} /><div><strong>{props.qrStatus.account.uname}</strong><span>UID {props.qrStatus.account.mid}</span></div></div>}
            <AuthFeedback error={props.actionError} message={props.actionMessage} />
            <footer>
              <button className="button button-secondary" type="button" onClick={props.onCloseQr}>关闭</button>
              <button className="button button-primary" disabled={props.busy} type="button" onClick={props.onRegenerateQr}>{terminalQr ? "重新生成二维码" : "刷新二维码"}</button>
            </footer>
          </section>
        </div>
      )}

      {props.credentialOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="credential-drawer bilibili-credential-drawer" role="dialog" aria-modal="true" aria-label="完整 Bilibili 登录态">
            <header><div><span>BILIBILI CREDENTIAL</span><h2>完整 Bilibili 登录态</h2></div><button className="icon-button" type="button" aria-label="关闭登录态" onClick={props.onCloseCredential}><X size={17} /></button></header>
            {props.credential ? (
              <div className="credential-content">
                <div className="credential-warning"><ShieldCheck size={17} /><span><strong>敏感原文</strong>仅在明确查看时从本机 Core 解密，不进入查询缓存。</span></div>
                <button className="button button-primary" disabled={props.busy} type="button" onClick={props.onCopyCredential}><Copy size={14} />一键复制全部</button>
                <AuthFeedback error={props.actionError} message={props.actionMessage} />
                {[
                  ["Cookie Header", props.credential.cookieHeader],
                  ["bili_jct / CSRF", props.credential.csrf ?? ""],
                  ["refresh_token", props.credential.refreshToken ?? ""],
                  ["Cookies", JSON.stringify(props.credential.cookies, null, 2)],
                  ["Raw Payload", JSON.stringify(props.credential.rawPayload, null, 2)]
                ].map(([label, value]) => <CredentialField key={label} label={label!} value={value!} disabled={props.busy || !props.onCopyField} onCopy={() => props.onCopyField?.(value!)} />)}
              </div>
            ) : props.actionError ? <AuthFeedback error={props.actionError} /> : <div className="credential-loading"><LoaderCircle className="spin" size={20} />正在从本机安全存储读取…</div>}
          </section>
        </div>
      )}
    </>
  )
}

function AuthFeedback({ error, message }: { error?: string | undefined; message?: string | undefined }): JSX.Element | null {
  return error ? <p className="auth-action-error auth-feedback" role="alert">{error}</p>
    : message ? <p className="auth-feedback" role="status">{message}</p> : null
}

function CredentialField({ label, value, disabled, onCopy }: { label: string; value: string; disabled: boolean; onCopy: () => void }): JSX.Element {
  return <div className="credential-field"><div className="bilibili-credential-field-head"><strong>{label}</strong><button className="button button-secondary" disabled={disabled} type="button" aria-label={`复制 ${label}`} onClick={onCopy}><Copy size={14} />复制</button></div><pre>{value || "—"}</pre></div>
}

export function startBilibiliQrPolling(options: {
  intervalMillis: number
  poll: () => Promise<BilibiliQrLoginStatus>
  onStatus: (status: BilibiliQrLoginStatus) => void | Promise<void>
  onError: (error: unknown) => void
}): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (delay = Math.max(1000, options.intervalMillis)): void => {
    if (stopped) return
    timer = setTimeout(() => { void tick() }, delay)
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
  schedule(200)
  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function ConnectedBilibiliAuthPanel({ bridge }: { bridge: DesktopBridge }): JSX.Element {
  const queryClient = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [qrStart, setQrStart] = useState<BilibiliQrLoginStart>()
  const [qrDataUrl, setQrDataUrl] = useState<string>()
  const [qrStatus, setQrStatus] = useState<BilibiliQrLoginStatus>()
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [credential, setCredential] = useState<BilibiliCredential>()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [actionMessage, setActionMessage] = useState<string>()
  const lifecycle = useRef({ mounted: true, operation: 0, scope: "general" })
  const stopPolling = useRef<() => void>(() => {})
  const pollFlight = useRef<Promise<BilibiliQrLoginStatus> | undefined>(undefined)
  useEffect(() => {
    lifecycle.current.mounted = true
    return () => {
      lifecycle.current.mounted = false
      lifecycle.current.operation++
      stopPolling.current()
    }
  }, [])
  const statusQuery = useQuery({
    queryKey: ["bilibili-auth-status"],
    queryFn: () => bridge.bilibiliAuth.status(),
    staleTime: 0
  })

  const run = useCallback(async (operation: (current: () => boolean) => Promise<void>, scope = "general"): Promise<void> => {
    const version = ++lifecycle.current.operation
    lifecycle.current.scope = scope
    const current = () => lifecycle.current.mounted && lifecycle.current.operation === version
    setBusy(true)
    setActionError(undefined)
    setActionMessage(undefined)
    try {
      await operation(current)
    } catch (error) {
      if (!current()) return
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      if (scope === "qr") setQrStatus({ status: "FAILED", message: "二维码生成失败，请重试。" })
    } finally {
      if (current()) setBusy(false)
    }
  }, [])

  const startLogin = useCallback(async (): Promise<void> => {
    stopPolling.current()
    setQrStart(undefined)
    await run(async current => {
      setQrStatus(undefined)
      setQrDataUrl(undefined)
      const started = await bridge.bilibiliAuth.startQrLogin()
      if (!current()) return
      const dataUrl = await QRCode.toDataURL(started.qrUrl, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#4A2D38", light: "#FFFFFF" }
      })
      if (!current()) return
      setQrStart(started)
      setQrDataUrl(dataUrl)
      setQrStatus({
        status: "WAITING",
        message: "请使用 Bilibili 手机客户端扫码登录",
        expiresInSeconds: started.expiresInSeconds
      })
    }, "qr")
  }, [bridge, run])

  useEffect(() => {
    if (!qrOpen || !qrStart) return
    let disposed = false
    const stop = startBilibiliQrPolling({
      intervalMillis: qrStart.pollIntervalMillis,
      poll: async () => {
        // Regenerating cannot cancel the old IPC call, so wait for it before sending another.
        if (pollFlight.current) await pollFlight.current.catch(() => undefined)
        if (disposed) throw new Error("QR polling stopped")
        const request = bridge.bilibiliAuth.pollQrLogin({ loginId: qrStart.loginId })
        pollFlight.current = request
        try { return await request }
        finally { if (pollFlight.current === request) pollFlight.current = undefined }
      },
      onStatus: async (next) => {
        setActionError(undefined)
        setQrStatus(next)
        if (next.status === "SUCCESS") {
          await queryClient.invalidateQueries({ queryKey: ["bilibili-auth-status"] })
        }
      },
      onError: (error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error))
      }
    })
    const cleanup = () => { disposed = true; stop() }
    stopPolling.current = cleanup
    return cleanup
  }, [bridge, qrOpen, qrStart, queryClient])

  const resource: AuthResourceState = statusQuery.data
    ? { phase: "success", data: statusQuery.data, refreshing: statusQuery.isFetching,
        ...(statusQuery.isError ? { staleMessage: statusQuery.error.message } : {}) }
    : statusQuery.isError
      ? { phase: "error", message: statusQuery.error.message }
      : { phase: "loading" }

  const cancelAction = (scope: string): void => {
    if (lifecycle.current.scope === scope) {
      lifecycle.current.operation++
      setBusy(false)
    }
    setActionError(undefined)
    setActionMessage(undefined)
  }

  const closeCredential = (): void => {
    cancelAction("credential")
    setCredentialOpen(false)
    setCredential(undefined)
  }

  const copy = (text: string): void => {
    void run(async current => {
      await navigator.clipboard.writeText(text)
      if (current()) setActionMessage("已复制")
    }, "credential")
  }

  return (
    <BilibiliAuthPanel
      status={resource}
      qrOpen={qrOpen}
      {...(qrDataUrl ? { qrDataUrl } : {})}
      {...(qrStatus ? { qrStatus } : {})}
      credentialOpen={credentialOpen}
      {...(credential ? { credential } : {})}
      busy={busy}
      {...(actionError ? { actionError } : {})}
      {...(actionMessage ? { actionMessage } : {})}
      onOpenQr={() => { setQrOpen(true); void startLogin() }}
      onCloseQr={() => {
        stopPolling.current()
        cancelAction("qr")
        setQrOpen(false)
        setQrStart(undefined)
        setQrDataUrl(undefined)
        setQrStatus(undefined)
      }}
      onRegenerateQr={() => { void startLogin() }}
      onRefresh={() => { void run(async current => {
        let message = "登录态已更新"
        if (statusQuery.data?.loggedIn) message = (await bridge.bilibiliAuth.refresh()).message
        if (!current()) return
        const result = await statusQuery.refetch()
        if (result.isError) throw result.error
        if (current()) setActionMessage(message)
      }) }}
      onOpenCredential={() => {
        setCredential(undefined)
        setCredentialOpen(true)
        void run(async current => {
          const value = await bridge.bilibiliAuth.credential()
          if (current()) setCredential(value)
        }, "credential")
      }}
      onCloseCredential={closeCredential}
      onRevoke={() => {
        if (typeof window !== "undefined" && !window.confirm("确认移除当前 Bilibili 登录态？已有采集历史不会删除。")) return
        void run(async current => {
          await bridge.bilibiliAuth.revoke()
          if (!current()) return
          closeCredential()
          const result = await statusQuery.refetch()
          if (result.isError) throw result.error
          if (current()) setActionMessage("登录态已移除")
        })
      }}
      onCopyCredential={() => {
        if (!credential) return
        copy(formatCredentialForCopy(credential))
      }}
      onCopyField={copy}
    />
  )
}

export function formatCredentialForCopy(credential: BilibiliCredential): string {
  return [
    "完整 Bilibili 登录态",
    "",
    "[基础信息]",
    `credentialId: ${credential.credentialId}`,
    `expiresAt: ${credential.expiresAt ?? ""}`,
    "",
    "[账号]",
    `mid: ${credential.account?.mid ?? ""}`,
    `uname: ${credential.account?.uname ?? ""}`,
    `face: ${credential.account?.face ?? ""}`,
    `level: ${credential.account?.level ?? ""}`,
    `vipStatus: ${credential.account?.vipStatus ?? ""}`,
    "",
    "[Cookie Header]",
    credential.cookieHeader,
    "",
    "[bili_jct / CSRF]",
    credential.csrf ?? "",
    "",
    "[refresh_token]",
    credential.refreshToken ?? "",
    "",
    "[Cookies]",
    JSON.stringify(credential.cookies, null, 2),
    "",
    "[Raw Payload]",
    JSON.stringify(credential.rawPayload, null, 2)
  ].join("\n")
}
