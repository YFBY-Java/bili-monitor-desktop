import type { BilibiliFollowerMonitorV2, BilibiliFollowerTrendV2 } from "@bmd/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { BilibiliFollowerWorkspace } from "./BilibiliFollowerWorkspace"
import * as followerWorkspace from "./BilibiliFollowerWorkspace"

const timestamp = "2026-08-29T12:00:00.000Z"
const user: BilibiliFollowerMonitorV2 = {
  id: "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
  mid: "672328094",
  nickname: "测试用户",
  avatarUrl: "https://i0.hdslb.com/bfs/face/test.jpg",
  profileUrl: "https://space.bilibili.com/672328094",
  currentFollowerCount: "12840",
  followingCount: "92",
  deltaSincePrevious: "18",
  growthRateSincePrevious: 0.0014,
  lastSnapshotAt: timestamp,
  lastSuccessAt: timestamp,
  nextCollectAt: "2026-08-29T13:00:00.000Z",
  monitorStatus: "ACTIVE",
  intervalSeconds: 3600,
  sourceEndpoint: "x/web-interface/card",
  recentTrend: [
    {
      capturedAt: "2026-08-29T11:00:00.000Z",
      followerCount: "12822",
      followingCount: "92",
      sourceEndpoint: "x/web-interface/card"
    },
    {
      capturedAt: timestamp,
      followerCount: "12840",
      followingCount: "92",
      sourceEndpoint: "x/web-interface/card"
    }
  ],
  version: 2
}

const handlers = {
  intervalDrafts: {},
  savingIntervalUserIds: [],
  onIntervalDraftChange: vi.fn(),
  onCloseCreation: vi.fn(),
  onAdd: vi.fn(async () => undefined),
  onRefreshUser: vi.fn(async () => undefined),
  onUpdateStatus: vi.fn(async () => undefined),
  onUpdateSettings: vi.fn(async () => undefined),
  onDelete: vi.fn(async () => undefined),
  onReload: vi.fn()
}

describe("BilibiliFollowerWorkspace", () => {
  it("hides a broken remote avatar so the local fallback remains visible", () => {
    const exported = followerWorkspace as unknown as Record<string, unknown>
    expect(typeof exported.hideBrokenAvatar).toBe("function")
    if (typeof exported.hideBrokenAvatar !== "function") return

    const image = { hidden: false }
    exported.hideBrokenAvatar({ currentTarget: image })

    expect(image.hidden).toBe(true)
  })

  it("renders original summary and compact monitor projection before opening detail actions", () => {
    const html = renderToStaticMarkup(
      <BilibiliFollowerWorkspace
        view="监控用户"
        monitors={{ phase: "success", data: [user], total: 1 }}
        trends={{ phase: "success", data: [] }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(html).toContain("测试用户")
    expect(html).toContain("UID 672328094")
    expect(html).toContain("12,840")
    expect(html).toContain("+18")
    expect(html).toContain("粉丝采集汇总")
    expect(html).toContain("展开测试用户的详情")
    expect(html).toContain("监控中")
    expect(html).toContain('role="progressbar"')
    expect(html).toContain("采集间隔")
    expect(html).not.toContain("删除监控与全部历史快照")
    expect(html).not.toContain("演示数据")
  })

  it("renders loading, error, empty and add-user states explicitly", () => {
    const loading = renderToStaticMarkup(
      <BilibiliFollowerWorkspace
        view="监控用户"
        monitors={{ phase: "loading" }}
        trends={{ phase: "success", data: [] }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )
    const failed = renderToStaticMarkup(
      <BilibiliFollowerWorkspace
        view="监控用户"
        monitors={{ phase: "error", message: "B站接口触发风控" }}
        trends={{ phase: "success", data: [] }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )
    const empty = renderToStaticMarkup(
      <BilibiliFollowerWorkspace
        view="监控用户"
        monitors={{ phase: "success", data: [], total: 0 }}
        trends={{ phase: "success", data: [] }}
        creationOpen
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(loading).toContain("正在读取粉丝监控列表")
    expect(failed).toContain("B站接口触发风控")
    expect(failed).toContain("重新加载")
    expect(empty).toContain("还没有监控用户")
    expect(empty).toContain("添加 B站监控用户")
    expect(empty).toContain("B站 UID")
    expect(empty).toContain("默认每 1 小时采集一次")
    expect(empty).toContain('type="number"')
    expect(empty).toContain('min="1"')
    expect(empty).toContain('max="2592000"')
  })

  it("renders multi-user historical trend data instead of a decorative chart", () => {
    const trend: BilibiliFollowerTrendV2 = { user, points: user.recentTrend }
    const html = renderToStaticMarkup(
      <BilibiliFollowerWorkspace
        view="趋势对比"
        monitors={{ phase: "success", data: [user], total: 1 }}
        trends={{ phase: "success", data: [trend] }}
        creationOpen={false}
        mutationError={undefined}
        {...handlers}
      />
    )

    expect(html).toContain("粉丝历史趋势")
    expect(html).toContain("最多选择 4 个用户")
    expect(html).toContain('aria-label="测试用户粉丝趋势"')
    expect(html).toContain("12,822")
    expect(html).toContain("12,840")
  })
})
