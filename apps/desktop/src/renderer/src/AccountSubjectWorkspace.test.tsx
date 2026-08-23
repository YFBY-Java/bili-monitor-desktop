import type { PlatformAccount, SubjectSummary } from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AccountSubjectWorkspace } from "./AccountSubjectWorkspace"

const timestamp = "2026-08-23T08:00:00.000Z"
const account: PlatformAccount = {
  id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
  platform: "bilibili",
  externalId: "672328094",
  displayName: "测试账号",
  profileUrl: "https://space.bilibili.com/672328094",
  authState: "not_connected",
  createdAt: timestamp,
  updatedAt: timestamp,
  version: 1
}
const secondAccount: PlatformAccount = {
  ...account,
  id: "018f0f39-7b5e-7cc1-962d-9a208b3d0185",
  externalId: "672328095",
  displayName: "测试账号 B",
  profileUrl: "https://space.bilibili.com/672328095"
}
const subject: SubjectSummary = {
  id: "018f0f39-8b5e-7cc1-962d-9a208b3d0184",
  name: "测试监控对象",
  status: "active",
  tags: ["游戏", "官方"],
  accounts: [account],
  monitorPolicies: [{
    accountId: account.id,
    capability: "follower.snapshot",
    state: "active",
    intervalSeconds: 3600
  }],
  createdAt: timestamp,
  updatedAt: timestamp,
  version: 1
}

const handlers = {
  onCloseCreation: vi.fn(),
  onCreateAccount: vi.fn(async () => undefined),
  onCreateSubject: vi.fn(async () => undefined)
}

describe("AccountSubjectWorkspace", () => {
  it("renders real platform account projection without demo records", () => {
    const html = renderToStaticMarkup(
      <AccountSubjectWorkspace
        pageId="platform-accounts"
        accounts={{ phase: "success", data: [account], total: 1 }}
        subjects={{ phase: "success", data: [subject], total: 1 }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(html).toContain("测试账号")
    expect(html).toContain("UID 672328094")
    expect(html).toContain("未连接登录态")
    expect(html).toContain("只保存账号引用")
    expect(html).not.toContain("采集账号 A")
  })

  it("renders an actionable subject empty state and creation form", () => {
    const html = renderToStaticMarkup(
      <AccountSubjectWorkspace
        pageId="subjects"
        accounts={{ phase: "success", data: [account], total: 1 }}
        subjects={{ phase: "success", data: [], total: 0 }}
        creationOpen
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(html).toContain("还没有监控对象")
    expect(html).toContain("添加第一个监控对象")
    expect(html).toContain("新建监控对象")
    expect(html).toContain("粉丝采集间隔")
    expect(html).toContain("测试账号 · B站 UID 672328094")
  })

  it("renders a separate follower policy for every account binding", () => {
    const html = renderToStaticMarkup(
      <AccountSubjectWorkspace
        pageId="subjects"
        accounts={{ phase: "success", data: [account, secondAccount], total: 2 }}
        subjects={{
          phase: "success",
          data: [{
            ...subject,
            accounts: [account, secondAccount],
            monitorPolicies: [
              ...subject.monitorPolicies,
              {
                accountId: secondAccount.id,
                capability: "follower.snapshot",
                state: "active",
                intervalSeconds: 7200
              }
            ]
          }],
          total: 1
        }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(html).toContain("测试账号")
    expect(html).toContain("测试账号 B")
    expect(html).toContain("每 60 分钟")
    expect(html).toContain("每 120 分钟")
  })

  it("renders explicit loading and error states", () => {
    const loading = renderToStaticMarkup(
      <AccountSubjectWorkspace
        pageId="platform-accounts"
        accounts={{ phase: "loading" }}
        subjects={{ phase: "loading" }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )
    const failed = renderToStaticMarkup(
      <AccountSubjectWorkspace
        pageId="subjects"
        accounts={{ phase: "success", data: [], total: 0 }}
        subjects={{ phase: "error", message: "本地数据库不可用" }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(loading).toContain("正在读取本地账号目录")
    expect(failed).toContain("本地数据库不可用")
    expect(failed).toContain("重新加载")
  })
})
