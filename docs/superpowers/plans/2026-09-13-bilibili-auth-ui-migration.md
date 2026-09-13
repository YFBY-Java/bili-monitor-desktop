# M07 B站登录交互迁移 Implementation Plan

> **For agentic workers:** 使用适用的内联测试驱动流程逐项执行；只读审查作为完成检查。不自动提交/推送，不派发实现代理。

**Goal:** 迁移原登录面板/扫码弹窗的全部用户操作，保留真实 Core 边界，防止关闭/刷新后的迟到响应污染界面。

**Architecture:** React 只通过既有 typed bridge 调用状态、生成/轮询二维码、复验、查看凭据和撤销。状态元数据留在 TanStack Query；凭据原文只在显式打开的抽屉中短暂持有，关闭/卸载清空。

**Tech Stack:** 现有 TypeScript、React、TanStack Query、qrcode、Vitest/Playwright；不增加依赖。

**Readability:** 不新增 C/C++/Rust/Java。沿用现有樱花雾白 token、字体、抽屉与按钮，不做全局改版。

## Global Constraints

- 原 `D:\codex_work\BiliMonitor` 只读，基线 `fa2faa6`。不启动原工程，不访问真实凭据/用户库/平台。
- 保留未提交的 M06 生命周期与审计文件；本项不编辑这些业务代码。
- 所有测试文件、截图、缓存留在 D 盘。浏览器 fixture 只返回明确合成数据，不能进入生产 bundle。
- 依据：原 `frontend/src/views/bilibili/components/BilibiliAuthPanel.vue`、`BilibiliQrLoginDialog.vue`，Auth Service/SessionStore/PassportClient 和 `BilibiliAuthServiceTests.java`。
- 本计划覆盖 M07 的用户交互；Core/Worker Cookie解析、凭据竞态/恢复和弹幕连接升级的逐操作审计仍保留在全量台账，不能据此宣告 M07 整体完成。

## Task 1: 原操作与异步边界

**Files:** Modify `apps/desktop/src/renderer/src/BilibiliAuthPanel.tsx`, `BilibiliAuthPanel.test.tsx`; Create `BilibiliAuthPanel.interaction.test.ts`, `__fixtures__/bilibili-auth.html`, `__fixtures__/bilibili-auth.tsx`, `bilibili-auth-panel.css`。

**Interfaces:** 继续使用 `DesktopBridge.bilibiliAuth` 的现有7方法；组件补 `onCopyField(text)` 和操作结果反馈。没有新的后端响应类型。

- [ ] RED：未登录刷新可用且仅读status；已登录先refresh再status并显示原返回消息；等待/已扫描/成功时能刷新二维码；失败生成可重试；成功弹窗显示账号；凭据4种原分字段复制及全部字段复制。

```ts
await page.goto(`${url}?active=0`)
expect(await page.getByRole("button", { name: "刷新校验" }).isEnabled()).toBe(true)
await page.getByRole("button", { name: "刷新校验" }).click()
expect(await page.evaluate(() => window.bilibiliAuthFixture.calls)).not.toContain("refresh")
```

- [ ] RED：关闭后迟到生成/读取不得回填，新二维码不得被旧轮询覆盖；生成新二维码期间停止旧轮询；同一面板仅一个轮询请求在途；卸载清理；复制失败必须反馈且无未处理拒绝；撤销取消/失败不伪装成功。
- [ ] GREEN：用请求代次/挂载状态隔离UI副作用，二维码生成前立即停止旧轮询，清除旧loginId；只对当前操作更新忙碌状态。原轮询首轮200ms、后续至少1000ms，五态停止规则不变；保留已有临时错误后可恢复的行为。
- [ ] GREEN：原字段复制内容逐项对齐，缺省复制空串，保留0级/0会员值；完整复制加入到期和账号全部字段；仅用户点击才写剪贴板，不存入Query缓存。结果/错误在当前弹窗内可见。

```ts
const fields = ["credentialId", "expiresAt", "mid", "uname", "face", "level", "vipStatus"]
// All values come from the shared BilibiliCredential, never a reconstructed account.
```

- [ ] 真实Connected浏览器回归：所有操作、反序响应、终态/错误、重开/卸载；浅深色与760px截图只用合成登录数据。针对新增字段使用现有字体token、13px可读提示和40px点击区域。
- [ ] 独立只读审查；完整 `check.cmd`、生产fixture排查、原仓库clean检查；更新README/全量台账，继续M07 Core/Worker/连接审计。

## 核验命令

先加载 `scripts/activate-environment.ps1`。

```powershell
pnpm --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliAuthPanel.test.tsx src/renderer/src/BilibiliAuthPanel.interaction.test.ts
.\check.cmd
git diff --check
```

真实扫码、OS剪贴板和原生客户端/安装包仍需手工验证，不把浏览器合成fixture当成这些验收。

## 2026-09-13 阶段性提交记录

- 用户要求提交当前代码，本次不继续扩展迁移，也不将上方全部验收项标为完成。
- 已补状态刷新、二维码刷新与账号展示、分字段/完整复制、操作反馈，以及关闭/重开后的迟到响应隔离和跨二维码单在途轮询。新增13项Connected浏览器回归；原有4项登录组件测试保持通过。
- 提交前完整 `check.cmd` 退出0：Node391项、Python54项，TypeScript/mypy、Black/isort、Electron生产构建与D盘路径检查通过。首次检查发现浏览器测试对HTMLElement/SVGElement联合类型直接赋值className失败，改为两者共有的setAttribute，不改运行时业务逻辑。
- 独立只读审查尚未完成；Core/Worker Cookie解析、凭据恢复、连接升级/撤销以及真人扫码、系统剪贴板、原生客户端/安装包验收仍待继续。停止界面轮询不等于取消Core内已经发出的请求。
