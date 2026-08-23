import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DesktopWorkspace } from "./DesktopWorkspace"

describe("DesktopWorkspace", () => {
  it("renders the pale light theme and exposes a dark-theme switch", () => {
    const html = renderToStaticMarkup(<DesktopWorkspace initialPageId="command-center" />)

    expect(html).toContain("desktop-shell theme-light")
    expect(html).toContain('aria-label="切换至深色主题"')
  })

  it("renders the complete product navigation from the command center", () => {
    const html = renderToStaticMarkup(<DesktopWorkspace initialPageId="command-center" />)

    expect(html).toContain("信号总览")
    expect(html).toContain("监控对象")
    expect(html).toContain("直播雷达")
    expect(html).toContain("Agent 工作台")
    expect(html).toContain("模型路由")
    expect(html).toContain("平台与账号")
    expect(html).toContain("工具与 MCP")
    expect(html).toContain("审批与审计")
    expect(html).toContain("新建采集活动")
  })

  it("renders the inherited live-monitoring functions on the live workspace", () => {
    const html = renderToStaticMarkup(<DesktopWorkspace initialPageId="live-radar" />)

    expect(html).toContain("弹幕流")
    expect(html).toContain("观众与大航海榜")
    expect(html).toContain("场次洞察与导出")
    expect(html).toContain("添加直播间")
  })

  it("renders both Bilibili and Douyin login-state paths", () => {
    const html = renderToStaticMarkup(<DesktopWorkspace initialPageId="platform-accounts" />)

    expect(html).toContain("B站扫码登录")
    expect(html).toContain("抖音官方 OAuth")
    expect(html).toContain("抖音 Web 扫码")
    expect(html).toContain("Session Vault")
  })

  it("renders the real local Core and SQLite bootstrap state in the sidebar", () => {
    const html = renderToStaticMarkup(
      <DesktopWorkspace
        initialPageId="command-center"
        runtime={{
          phase: "ready",
          version: "0.1.0",
          schemaVersion: 1,
          workerCount: 0
        }}
      />
    )

    expect(html).toContain("Core 0.1.0 · SQLite v1")
    expect(html).not.toContain("18 / 18 服务在线")
  })
})
