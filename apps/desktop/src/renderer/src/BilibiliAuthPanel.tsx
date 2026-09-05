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
import { useCallback, useEffect, useState, type JSX } from "react"

export type AuthResourceState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "success"; data: BilibiliAuthStatus; refreshing?: boolean }

export interface BilibiliAuthPanelProps {
  status: AuthResourceState
  qrOpen: boolean
  qrDataUrl?: string
  qrStatus?: BilibiliQrLoginStatus
  credentialOpen: boolean
  credential?: BilibiliCredential
  busy: boolean
  actionError?: string
  onOpenQr: () => void
  onCloseQr: () => void
  onRegenerateQr: () => void
  onRefresh: () => void
  onOpenCredential: () => void
  onCloseCredential: () => void
  onRevoke: () => void
  onCopyCredential: () => void
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
                ? `UID ${account?.mid ?? "—"} · 最后校验 ${formatTime(status.lastValidatedAt)}`
                : "扫码登录后，凭据只在本机加密保存，用于原项目需要登录态的 B站功能。"}</p>
            </>
          )}
        </div>

        {loggedIn && account && (
          <div className="auth-account-card">
            <div className="auth-account-avatar">
              <UserRound size={17} />
              {account.face && <img src={account.face} alt="" referrerPolicy="no-referrer" />}
            </div>
            <div><strong>{account.uname}</strong><span>UID {account.mid} · {status.status}</span></div>
          </div>
        )}

        <div className="auth-panel-actions">
          <button className="button button-primary" disabled={props.busy} type="button" onClick={props.onOpenQr}>
            <QrCode size={14} />{loggedIn ? "重新扫码" : "扫码登录"}
          </button>
          <button className="button button-secondary" disabled={props.busy || !loggedIn} type="button" onClick={props.onRefresh}>
            <RefreshCcw size={14} />刷新校验
          </button>
          {loggedIn && (
            <>
              <button className="button button-secondary" disabled={props.busy} type="button" onClick={props.onOpenCredential}><Eye size={14} />查看完整登录态</button>
              <button className="auth-revoke-button" disabled={props.busy} type="button" onClick={props.onRevoke}><Trash2 size={14} />移除登录态</button>
            </>
          )}
        </div>
        {props.actionError && <p className="auth-action-error" role="alert">{props.actionError}</p>}
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
            <footer>
              <button className="button button-secondary" type="button" onClick={props.onCloseQr}>关闭</button>
              {terminalQr && <button className="button button-primary" disabled={props.busy} type="button" onClick={props.onRegenerateQr}>重新生成二维码</button>}
            </footer>
          </section>
        </div>
      )}

      {props.credentialOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="credential-drawer" role="dialog" aria-modal="true" aria-label="完整 Bilibili 登录态">
            <header><div><span>BILIBILI CREDENTIAL</span><h2>完整 Bilibili 登录态</h2></div><button className="icon-button" type="button" aria-label="关闭登录态" onClick={props.onCloseCredential}><X size={17} /></button></header>
            {props.credential ? (
              <div className="credential-content">
                <div className="credential-warning"><ShieldCheck size={17} /><span><strong>敏感原文</strong>仅在明确查看时从本机 Core 解密，不进入查询缓存。</span></div>
                <button className="button button-primary" type="button" onClick={props.onCopyCredential}><Copy size={14} />一键复制全部</button>
                <CredentialField label="Cookie Header" value={props.credential.cookieHeader} />
                <CredentialField label="bili_jct / CSRF" value={props.credential.csrf ?? "—"} />
                <CredentialField label="refresh_token" value={props.credential.refreshToken ?? "—"} />
                <CredentialField label="Cookies" value={JSON.stringify(props.credential.cookies, null, 2)} />
                <CredentialField label="Raw Payload" value={JSON.stringify(props.credential.rawPayload, null, 2)} />
              </div>
            ) : <div className="credential-loading"><LoaderCircle className="spin" size={20} />正在从本机安全存储读取…</div>}
          </section>
        </div>
      )}
    </>
  )
}

function CredentialField({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="credential-field"><strong>{label}</strong><pre>{value}</pre></div>
}

export function startBilibiliQrPolling(options: {
  intervalMillis: number
  poll: () => Promise<BilibiliQrLoginStatus>
  onStatus: (status: BilibiliQrLoginStatus) => void | Promise<void>
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
  const statusQuery = useQuery({
    queryKey: ["bilibili-auth-status"],
    queryFn: () => bridge.bilibiliAuth.status(),
    staleTime: 0
  })

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setActionError(undefined)
    try {
      await operation()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  const startLogin = useCallback(async (): Promise<void> => {
    await run(async () => {
      setQrStatus(undefined)
      setQrDataUrl(undefined)
      const started = await bridge.bilibiliAuth.startQrLogin()
      const dataUrl = await QRCode.toDataURL(started.qrUrl, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#4A2D38", light: "#FFFFFF" }
      })
      setQrStart(started)
      setQrDataUrl(dataUrl)
      setQrStatus({
        status: "WAITING",
        message: "请使用 Bilibili 手机客户端扫码登录",
        expiresInSeconds: started.expiresInSeconds
      })
    })
  }, [bridge, run])

  useEffect(() => {
    if (!qrOpen || !qrStart) return
    return startBilibiliQrPolling({
      intervalMillis: qrStart.pollIntervalMillis,
      poll: () => bridge.bilibiliAuth.pollQrLogin({ loginId: qrStart.loginId }),
      onStatus: async (next) => {
        setQrStatus(next)
        if (next.status === "SUCCESS") {
          await queryClient.invalidateQueries({ queryKey: ["bilibili-auth-status"] })
        }
      },
      onError: (error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error))
      }
    })
  }, [bridge, qrOpen, qrStart, queryClient])

  const resource: AuthResourceState = statusQuery.isPending
    ? { phase: "loading" }
    : statusQuery.isError
      ? { phase: "error", message: statusQuery.error.message }
      : { phase: "success", data: statusQuery.data, refreshing: statusQuery.isFetching }

  const closeCredential = (): void => {
    setCredentialOpen(false)
    setCredential(undefined)
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
      onOpenQr={() => { setQrOpen(true); void startLogin() }}
      onCloseQr={() => setQrOpen(false)}
      onRegenerateQr={() => { void startLogin() }}
      onRefresh={() => { void run(async () => { await bridge.bilibiliAuth.refresh(); await statusQuery.refetch() }) }}
      onOpenCredential={() => {
        setCredentialOpen(true)
        void run(async () => { setCredential(await bridge.bilibiliAuth.credential()) })
      }}
      onCloseCredential={closeCredential}
      onRevoke={() => {
        if (typeof window !== "undefined" && !window.confirm("确认移除当前 Bilibili 登录态？已有采集历史不会删除。")) return
        void run(async () => { await bridge.bilibiliAuth.revoke(); closeCredential(); await statusQuery.refetch() })
      }}
      onCopyCredential={() => {
        if (!credential) return
        void navigator.clipboard.writeText(formatCredentialForCopy(credential))
      }}
    />
  )
}

export function formatCredentialForCopy(credential: BilibiliCredential): string {
  return [
    "完整 Bilibili 登录态",
    "",
    `credentialId: ${credential.credentialId}`,
    `mid: ${credential.account?.mid ?? ""}`,
    `uname: ${credential.account?.uname ?? ""}`,
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
