import type { DesktopBridge, PlatformCollectionExecution } from "@bmd/contracts"
import { useMutation, useQuery } from "@tanstack/react-query"
import { CircleAlert, LoaderCircle, Play, RefreshCcw } from "lucide-react"
import { useState, type FormEvent, type JSX } from "react"
import "./PlatformCollectionWorkspace.css"

export function ConnectedPlatformCollectionWorkspace({ bridge }: { bridge: DesktopBridge }): JSX.Element {
  const [externalId, setExternalId] = useState("")
  const adapters = useQuery({ queryKey: ["platform-adapters"], queryFn: () => bridge.platformCollection.listAdapters(), staleTime: 0 })
  const collection = useMutation({ mutationFn: () =>
    bridge.platformCollection.runOnce({ platformCode: "bilibili", dataType: "account", externalId }) })
  const adapter = adapters.data?.find(item => item.platformCode === "bilibili")
  const canCollectAccount = adapter?.implementedDataTypes.includes("account") === true
  const submit = (event: FormEvent): void => { event.preventDefault(); if (canCollectAccount && !collection.isPending) collection.mutate() }

  return <div className="platform-collection-workspace">
    <header className="platform-collection-header">
      <div><span>PLATFORM / LOCAL COLLECTION</span><h2>平台管理与单次采集</h2><p>迁移原 Adapter 注册表与 run-once 业务。仅执行一次账号资料查询，不创建监控或定时任务。</p></div>
      <button className="button button-secondary" type="button" disabled={adapters.isFetching} onClick={() => { void adapters.refetch() }}>
        <RefreshCcw className={adapters.isFetching ? "spin" : undefined} size={16} />刷新 Adapter
      </button>
    </header>
    {adapters.isPending && <p className="workspace-loading"><LoaderCircle className="spin" size={18} />正在读取已注册 Adapter…</p>}
    {adapters.error && <p className="workspace-error" role="alert"><CircleAlert size={17} />{adapters.data ? "刷新失败，保留上次注册表：" : "读取失败："}{adapters.error.message}</p>}
    {adapters.data && <section className="platform-collection-card" aria-label="已注册 Adapter">
      <h3>已注册 Adapter</h3><p>能力声明不等于已实现。原 B站通用 Adapter 目前只有 ACCOUNT_PROFILE 能执行，其余类型仍为预留。</p>
      {adapters.data.length === 0 ? <p className="platform-collection-empty">当前没有已注册 Adapter。普通浏览器仅提供只读预览，请在客户端中使用真实业务。</p>
        : adapters.data.map(item => <article className="platform-adapter" key={item.platformCode}>
          <strong>{item.platformCode}</strong><div className="platform-capabilities">{item.capabilities.map(capability => {
            const implemented = capability === "ACCOUNT_PROFILE" && item.implementedDataTypes.includes("account")
            return <span className={implemented ? "is-implemented" : "is-reserved"} key={capability}>{capability} · {implemented ? "已实现" : "预留"}</span>
          })}</div>
        </article>)}
    </section>}
    {canCollectAccount && <section className="platform-collection-card">
      <h3>单次账号资料采集</h3><p>沿用原 x/web-interface/card 查询；UID 以文本传递，不舍入。此操作不写入粉丝监控列表。</p>
      <form className="platform-collection-form" onSubmit={submit}>
        <label>B站 UID<input name="externalId" type="text" inputMode="numeric" required value={externalId} onChange={event => setExternalId(event.target.value)} placeholder="输入精确 UID" disabled={collection.isPending} /></label>
        <button className="button button-primary" type="submit" disabled={collection.isPending}>{collection.isPending ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}单次采集账号资料</button>
      </form>
      {collection.error && <p className="workspace-error" role="alert"><CircleAlert size={17} />{collection.error.message}</p>}
      {collection.isPending && <p className="platform-collection-note" role="status">正在采集{collection.data ? "，以下保留上次结果" : ""}…</p>}
      {collection.data && <CollectionResult result={collection.data} />}
    </section>}
  </div>
}

function CollectionResult({ result }: { result: PlatformCollectionExecution }): JSX.Element {
  const { fetchResult } = result
  return <section className="platform-collection-result" aria-label="单次采集结果">
    <header><h3>采集结果</h3><span className={fetchResult.success ? "is-success" : "is-failure"}>{result.status}</span></header>
    {!fetchResult.success && <p className="workspace-error" role="alert"><CircleAlert size={17} /><span>{fetchResult.message}</span><small>{fetchResult.errorType} · {fetchResult.retryable ? "可重试" : "不可重试"} · {fetchResult.riskLevel}</small></p>}
    {fetchResult.data && <dl>
      <div><dt>账号</dt><dd>{fetchResult.data.displayName}</dd></div>
      <div><dt>UID</dt><dd>{fetchResult.data.externalAccountId}</dd></div>
      <div><dt>粉丝</dt><dd>{fetchResult.data.followerCount}</dd></div>
      <div><dt>关注</dt><dd>{fetchResult.data.followingCount}</dd></div>
      <div><dt>采集时间</dt><dd>{fetchResult.data.fetchedAt}</dd></div>
      <div><dt>来源</dt><dd>{fetchResult.data.sourceEndpoint}</dd></div>
    </dl>}
    <details><summary>查看本次返回字段与证据引用</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
    <p className="platform-collection-note">原通用任务的日志、Raw 和 checkpoint 方法尚为空；这里不伪造任务历史。原始响应仅通过已有证据引用传递。</p>
  </section>
}
