import type {
  CreatePlatformAccountInput,
  CreateSubjectInput,
  DesktopBridge,
  PlatformAccount,
  SubjectSummary
} from "@bmd/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BadgeCheck,
  CircleAlert,
  CircleOff,
  Clock3,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { useState, type FormEvent, type JSX } from "react"

import type { PageId } from "./product-model"

export type ResourceState<T> =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "success"; data: T; total: number; refreshing?: boolean }

export interface AccountSubjectWorkspaceProps {
  pageId: Extract<PageId, "platform-accounts" | "subjects">
  accounts: ResourceState<PlatformAccount[]>
  subjects: ResourceState<SubjectSummary[]>
  creationOpen: boolean
  mutationError: string | undefined
  onCloseCreation: () => void
  onCreateAccount: (input: CreatePlatformAccountInput) => Promise<void>
  onCreateSubject: (input: CreateSubjectInput) => Promise<void>
  onRefresh?: () => void
}

function platformName(platform: PlatformAccount["platform"]): string {
  return platform === "bilibili" ? "B站" : "抖音"
}

function authLabel(state: PlatformAccount["authState"]): string {
  switch (state) {
    case "active": return "登录态有效"
    case "expired": return "登录态已过期"
    case "revoked": return "登录态已撤销"
    default: return "未连接登录态"
  }
}

function StatePanel({
  kind,
  state,
  onRefresh
}: {
  kind: "账号目录" | "监控对象"
  state: ResourceState<unknown[]>
  onRefresh?: () => void
}): JSX.Element | null {
  if (state.phase === "loading") {
    return (
      <div className="business-state" role="status">
        <LoaderCircle className="spin" size={20} />
        <div>
          <strong>正在读取本地{kind}</strong>
          <span>数据来自 Local Core 的 SQLite 投影。</span>
        </div>
      </div>
    )
  }
  if (state.phase === "error") {
    return (
      <div className="business-state is-error" role="alert">
        <CircleAlert size={20} />
        <div>
          <strong>{kind}暂时不可用</strong>
          <span>{state.message}</span>
        </div>
        <button className="button button-secondary" type="button" onClick={onRefresh}>
          <RefreshCcw size={14} />重新加载
        </button>
      </div>
    )
  }
  return null
}

function AccountDirectory({
  accounts,
  subjects,
  onRefresh
}: {
  accounts: ResourceState<PlatformAccount[]>
  subjects: ResourceState<SubjectSummary[]>
  onRefresh?: () => void
}): JSX.Element {
  if (accounts.phase !== "success") {
    return <StatePanel kind="账号目录" state={accounts} onRefresh={onRefresh} />
  }
  const subjectItems = subjects.phase === "success" ? subjects.data : []
  return (
    <section className="panel business-directory">
      <div className="panel-header compact">
        <div><p>PLATFORM ACCOUNT DIRECTORY</p><h2>平台账号目录</h2></div>
        <span className="business-safety"><ShieldCheck size={14} />只保存账号引用，不保存 Cookie</span>
      </div>
      {accounts.refreshing && <div className="business-refreshing"><RefreshCcw className="spin" size={12} />正在同步最新投影</div>}
      {accounts.data.length === 0 ? (
        <div className="business-empty">
          <KeyRound size={24} />
          <strong>还没有平台账号</strong>
          <span>先添加 B站 UID；扫码登录和 Secret Vault 会在后续安全切片接入。</span>
        </div>
      ) : (
        <div className="business-list">
          {accounts.data.map((account) => {
            const bindingCount = subjectItems.filter((subject) =>
              subject.accounts.some((bound) => bound.id === account.id)
            ).length
            return (
              <article className="business-row" key={account.id}>
                <div className={`platform-glyph platform-${account.platform}`}>{platformName(account.platform)}</div>
                <div className="business-row-primary">
                  <strong>{account.displayName}</strong>
                  <span>UID {account.externalId}</span>
                </div>
                <div className="business-row-detail">
                  <span><Link2 size={13} />{bindingCount} 个监控对象引用</span>
                  <span><Clock3 size={13} />更新于 {new Date(account.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
                <span className={`auth-state is-${account.authState}`}>
                  {account.authState === "active" ? <BadgeCheck size={14} /> : <CircleOff size={14} />}
                  {authLabel(account.authState)}
                </span>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SubjectDirectory({
  subjects,
  onRefresh
}: {
  subjects: ResourceState<SubjectSummary[]>
  onRefresh?: () => void
}): JSX.Element {
  if (subjects.phase !== "success") {
    return <StatePanel kind="监控对象" state={subjects} onRefresh={onRefresh} />
  }
  return (
    <section className="panel business-directory subject-directory">
      <div className="panel-header compact">
        <div><p>SUBJECT PROJECTION</p><h2>监控对象</h2></div>
        <span className="business-safety"><UsersRound size={14} />账号与对象保持独立</span>
      </div>
      {subjects.refreshing && <div className="business-refreshing"><RefreshCcw className="spin" size={12} />正在同步最新投影</div>}
      {subjects.data.length === 0 ? (
        <div className="business-empty">
          <UserRoundPlus size={26} />
          <strong>还没有监控对象</strong>
          <span>添加第一个监控对象，把平台账号、标签和粉丝策略组织到一起。</span>
        </div>
      ) : (
        <div className="subject-cards">
          {subjects.data.map((subject) => {
            return (
              <article className="subject-card" key={subject.id}>
                <div className="subject-card-head">
                  <div>
                    <strong>{subject.name}</strong>
                    <span>{subject.status === "active" ? "监控中" : "已暂停"}</span>
                  </div>
                  <span className={`subject-health is-${subject.status}`}>
                    <i />{subject.status === "active" ? "健康" : "暂停"}
                  </span>
                </div>
                <div className="subject-tags">
                  {subject.tags.length > 0
                    ? subject.tags.map((tag) => <span key={tag}>{tag}</span>)
                    : <span>未设置标签</span>}
                </div>
                <div className="subject-bindings">
                  <span>账号绑定</span>
                  <strong>{subject.accounts.length}</strong>
                  <p>{subject.accounts.map((account) => `${account.displayName} · ${platformName(account.platform)} UID ${account.externalId}`).join(" · ") || "尚未绑定"}</p>
                </div>
                <div className="subject-policy-list">
                  <span className="subject-policy-title">粉丝快照策略</span>
                  {subject.accounts.length === 0 && <div className="subject-policy"><span>尚未绑定账号</span><strong>未启用</strong></div>}
                  {subject.accounts.map((account) => {
                    const policy = subject.monitorPolicies.find((item) =>
                      item.accountId === account.id && item.capability === "follower.snapshot"
                    )
                    return (
                      <div className="subject-policy" key={account.id}>
                        <span>{account.displayName}</span>
                        <strong>{policy ? `每 ${Math.round(policy.intervalSeconds / 60)} 分钟` : "未启用"}</strong>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CapabilityReadiness({ pageId }: { pageId: "platform-accounts" | "subjects" }): JSX.Element {
  return (
    <aside className="panel readiness-panel">
      <div className="panel-header compact"><div><p>SLICE 1 READINESS</p><h2>能力准备度</h2></div></div>
      <div className="readiness-list">
        <div className="is-ready"><BadgeCheck size={15} /><div><strong>本地业务投影</strong><span>SQLite v2 · 已接通</span></div></div>
        <div className="is-ready"><BadgeCheck size={15} /><div><strong>窄化 IPC 契约</strong><span>Renderer 无数据库权限</span></div></div>
        <div><Clock3 size={15} /><div><strong>{pageId === "subjects" ? "Bilibili 粉丝 Connector" : "B站扫码登录"}</strong><span>下一安全切片</span></div></div>
      </div>
    </aside>
  )
}

function AccountForm({
  mutationError,
  onClose,
  onCreate
}: {
  mutationError: string | undefined
  onClose: () => void
  onCreate: (input: CreatePlatformAccountInput) => Promise<void>
}): JSX.Element {
  const [displayName, setDisplayName] = useState("")
  const [externalId, setExternalId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitting(true)
    void onCreate({ platform: "bilibili", externalId, displayName })
      .finally(() => setSubmitting(false))
  }
  return (
    <form className="creation-form" onSubmit={submit}>
      <label><span>平台</span><select disabled><option>Bilibili / B站</option></select></label>
      <label><span>显示名称</span><input required maxLength={160} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：原神官方账号" /></label>
      <label><span>B站 UID</span><input required inputMode="numeric" pattern="[1-9][0-9]*" value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="输入空间 UID" /></label>
      <p className="form-note"><ShieldCheck size={14} />这里只保存账号引用。Cookie、Token 和二维码不会写入 control.db。</p>
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={submitting} type="submit">保存账号</button></div>
    </form>
  )
}

function SubjectForm({
  accounts,
  mutationError,
  onClose,
  onCreate
}: {
  accounts: PlatformAccount[]
  mutationError: string | undefined
  onClose: () => void
  onCreate: (input: CreateSubjectInput) => Promise<void>
}): JSX.Element {
  const [name, setName] = useState("")
  const [tags, setTags] = useState("")
  const [accountId, setAccountId] = useState("")
  const [intervalSeconds, setIntervalSeconds] = useState(3600)
  const [submitting, setSubmitting] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitting(true)
    const input: CreateSubjectInput = {
      name,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      ...(accountId ? { accountId, followerIntervalSeconds: intervalSeconds } : {})
    }
    void onCreate(input).finally(() => setSubmitting(false))
  }
  return (
    <form className="creation-form" onSubmit={submit}>
      <label><span>对象名称</span><input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：原神官方账号" /></label>
      <label><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="游戏, 官方（逗号分隔）" /></label>
      <label><span>绑定账号</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">暂不绑定</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName} · {platformName(account.platform)} UID {account.externalId}</option>)}</select></label>
      <label><span>粉丝采集间隔</span><select disabled={!accountId} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))}><option value={1800}>30 分钟</option><option value={3600}>1 小时</option><option value={7200}>2 小时</option><option value={21600}>6 小时</option></select></label>
      <p className="form-note"><Link2 size={14} />对象与账号分别保存，后续解绑不会删除平台历史。</p>
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={submitting} type="submit">创建对象</button></div>
    </form>
  )
}

export function AccountSubjectWorkspace(props: AccountSubjectWorkspaceProps): JSX.Element {
  const successAccounts = props.accounts.phase === "success" ? props.accounts.data : []
  const activeCount = successAccounts.filter((account) => account.authState === "active").length
  const subjectCount = props.subjects.phase === "success" ? props.subjects.total : 0
  return (
    <>
      <section className="business-metrics" aria-label="业务统计">
        <div><span>{props.pageId === "platform-accounts" ? "平台账号" : "监控对象"}</span><strong>{props.pageId === "platform-accounts" && props.accounts.phase === "success" ? props.accounts.total : subjectCount}</strong></div>
        <div><span>有效登录态</span><strong>{activeCount}</strong></div>
        <div><span>对象绑定</span><strong>{props.subjects.phase === "success" ? props.subjects.data.reduce((sum, subject) => sum + subject.accounts.length, 0) : 0}</strong></div>
        <div><span>数据所有权</span><strong>LOCAL</strong></div>
      </section>
      <div className="business-grid">
        {props.pageId === "platform-accounts"
          ? <AccountDirectory accounts={props.accounts} subjects={props.subjects} onRefresh={props.onRefresh} />
          : <SubjectDirectory subjects={props.subjects} onRefresh={props.onRefresh} />}
        <CapabilityReadiness pageId={props.pageId} />
      </div>
      {props.creationOpen && (
        <div className="creation-backdrop" role="presentation">
          <section className="creation-drawer" role="dialog" aria-modal="true" aria-label={props.pageId === "platform-accounts" ? "添加平台账号" : "新建监控对象"}>
            <div className="creation-head">
              <div><p>{props.pageId === "platform-accounts" ? "PLATFORM ACCOUNT" : "SUBJECT"}</p><h2>{props.pageId === "platform-accounts" ? "添加平台账号" : "新建监控对象"}</h2></div>
              <button className="icon-button" type="button" aria-label="关闭" onClick={props.onCloseCreation}><X size={17} /></button>
            </div>
            {props.pageId === "platform-accounts"
              ? <AccountForm mutationError={props.mutationError} onClose={props.onCloseCreation} onCreate={props.onCreateAccount} />
              : <SubjectForm accounts={successAccounts} mutationError={props.mutationError} onClose={props.onCloseCreation} onCreate={props.onCreateSubject} />}
          </section>
        </div>
      )}
    </>
  )
}

export function ConnectedAccountSubjectWorkspace({
  bridge,
  pageId,
  creationOpen,
  onCloseCreation
}: {
  bridge: DesktopBridge
  pageId: "platform-accounts" | "subjects"
  creationOpen: boolean
  onCloseCreation: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const accountsQuery = useQuery({
    queryKey: ["platform-accounts"],
    queryFn: () => bridge.platformAccounts.list({ limit: 50 })
  })
  const subjectsQuery = useQuery({
    queryKey: ["subjects"],
    queryFn: () => bridge.subjects.list({ limit: 50 })
  })
  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["platform-accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["subjects"] })
    ])
  }
  const accountMutation = useMutation({
    mutationFn: (input: CreatePlatformAccountInput) => bridge.platformAccounts.create(input),
    onSuccess: async () => { onCloseCreation(); await invalidate() }
  })
  const subjectMutation = useMutation({
    mutationFn: (input: CreateSubjectInput) => bridge.subjects.create(input),
    onSuccess: async () => { onCloseCreation(); await invalidate() }
  })
  const accounts: ResourceState<PlatformAccount[]> = accountsQuery.isPending
    ? { phase: "loading" }
    : accountsQuery.isError
      ? { phase: "error", message: accountsQuery.error.message }
      : { phase: "success", data: accountsQuery.data.items, total: accountsQuery.data.total, refreshing: accountsQuery.isFetching }
  const subjects: ResourceState<SubjectSummary[]> = subjectsQuery.isPending
    ? { phase: "loading" }
    : subjectsQuery.isError
      ? { phase: "error", message: subjectsQuery.error.message }
      : { phase: "success", data: subjectsQuery.data.items, total: subjectsQuery.data.total, refreshing: subjectsQuery.isFetching }
  const mutationError = accountMutation.error?.message ?? subjectMutation.error?.message

  return (
    <AccountSubjectWorkspace
      pageId={pageId}
      accounts={accounts}
      subjects={subjects}
      creationOpen={creationOpen}
      mutationError={mutationError}
      onCloseCreation={onCloseCreation}
      onCreateAccount={async (input) => { await accountMutation.mutateAsync(input) }}
      onCreateSubject={async (input) => { await subjectMutation.mutateAsync(input) }}
      onRefresh={() => { void Promise.all([accountsQuery.refetch(), subjectsQuery.refetch()]) }}
    />
  )
}
