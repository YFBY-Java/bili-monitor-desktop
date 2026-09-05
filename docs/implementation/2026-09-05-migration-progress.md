# 原 Web 业务逐项迁移记录（2026-09-05）

原项目只读基线：`D:\codex_work\BiliMonitor`，`01200f3c21c264963f2ad92a23b991ced5b0c9c0`。
客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`。

验收单元是具体业务操作和状态转换。页面存在、方法存在、构建成功均不等于全部迁移完成。

## 1. 粉丝监控：操作、采集节奏、页面更新

对照来源（相对于原仓库的 `social-data-monitor`）：

- `frontend/src/views/bilibili/BilibiliView.vue`：`loadUsers`、`submitAdd`、`toggleTrendUser`、`removeUser`、`startAutoCollectScheduler`、`syncIntervalDrafts`。
- `frontend/src/components/charts/TrendChart.vue`：时间轴及采样时间/数值提示。
- `backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java`。
- `backend/src/main/java/com/socialmonitor/bilibili/repository/BilibiliFollowerMonitorRepository.java`：添加与成功采集分别落库。
- `backend/src/main/java/com/socialmonitor/collector/service/RateLimitService.java`：端点限频。

本轮已修复并回归：

| 操作/规则 | 发现的差异 | 客户端行为 |
| --- | --- | --- |
| 暂停后立即刷新 | 通用 upsert 把状态改回 ACTIVE | 采集只改数据，保持 PAUSED |
| 请求中修改间隔、暂停 | 旧快照带回旧配置 | 保存前重新读取当前监控，保留设置 |
| 请求中删除 | 迟到结果重建监控 | 拒绝已删除的监控，保持历史级联删除 |
| 两次同时添加同一 UID | 旧 monitorId 导致外键失败 | 完成平台校验后重新按 UID 查找并复用 |
| 显式再次添加已有 UID | 需区别于普通刷新 | 仍按原版恢复启用并应用输入间隔 |
| 并发限频 | 多个请求占用同一个时间点 | 每个端点按请求顺序分配独立时隙 |
| 1 秒间隔 | 只有 60 秒 Core 定时器 | Core 每秒检查到期用户；仍受 1.5 秒端点限频和失败退避约束 |
| 页面自动更新 | 后台采集后 UI 不刷新 | 每 2 秒查询本地列表；趋势可见时同步更新 |
| 查询暂时失败 | 已加载数据消失 | 保留上次数据并显示错误与重试入口 |
| 刷新/启停/设置/删除失败 | Promise 异常没有业务反馈 | 显示实际错误；释放忙碌状态，可再次操作 |
| 趋势选择 | 空选择自动替换成前 4 个，不能清空 | 初始为空、最多 4 个、可全部取消、删除同步清理选择 |
| 采集设置草稿 | 外部更新不回显；无效数字仍可提交 | 未编辑值跟随更新、保留草稿、只接受范围内整数 |
| 历史图表 | 横轴按下标均分，下降也显示正值 | 横轴按采样时间，区间净变化为末值减首值，点位展示时间和数值 |

对应自动测试：

- `packages/core-runtime/src/bilibili-follower-parity.test.ts`：6 项，其中 5 项改动前失败。
- `packages/core-runtime/src/bilibili-follower-scheduler.test.ts`：默认 Core 调度及限频，改动前失败。
- `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts`：6 项 Chromium 点击测试，改动前全部失败。
- 保留原有 follower Service/Storage/Contract/Renderer 测试。

交互测试使用独立 Vite 测试页面与可控 IPC 响应，测试服务器只在测试期间监听可用的本地端口，结束后关闭。它不属于应用运行架构，不连接平台、不访问用户数据库。测试文件中的用户仅存在于测试入口，生产入口不引用。

## 2. 直播间：一次采集结果的应用与场次一致性

对照来源：

- `backend/src/main/java/com/socialmonitor/bilibili/live/service/BilibiliLiveSnapshotApplicationService.java`：`initializeMonitor`、`applySuccessfulSnapshot`、`reactivateMonitor`。
- `backend/src/main/java/com/socialmonitor/bilibili/live/repository/BilibiliLiveMonitorRepository.java`。

本轮已修复并回归：

1. 请求中的间隔修改使用最新值重新安排下次采集，暂停状态不被覆盖。
2. 请求中的删除不会被迟到响应撤销。
3. 显式再次添加房间，即使平台响应早于已存快照，也重新启用并应用间隔，但不覆盖更新的直播状态。
4. 早于 `END_PENDING.endSignalAt` 的 REST 结果整体忽略，房间卡片与场次状态保持一致。
5. 房间状态、快照、事件、Outbox、场次边界一起事务提交；场次处理失败时全部回滚，只另行记录采集失败。
6. 并发房间操作遵守端点最小请求间隔。

测试：`packages/core-runtime/src/bilibili-live-snapshot-parity.test.ts`，6 项改动前全部失败，修复后通过；同时回归原 live Service 和 session Service 测试。

## 3. 直播间页面：逐操作迁移验收

对照来源：`frontend/src/views/bilibili-live/BilibiliLiveView.vue` 的 `submitAdd`、`refreshRoom`、`toggleMonitor`、`saveInterval`、`removeRoom`、`toggleTrendRoom`、`normalizeSelection`、`syncIntervalDrafts`、`refreshSelectedTrendData`，以及 `frontend/src/components/charts/TrendChart.vue`。

本批实现与修复：

| 操作 | 客户端行为及验证 |
| --- | --- |
| 按房间号/UID 添加 | 正整数校验、默认 300 秒；真实 bridge 返回房间后刷新列表，有空位时加入趋势；复用既有解析/落库链路 |
| 立即刷新、暂停/恢复、间隔、删除 | 同一房间请求期间禁止重复/冲突操作，其他房间仍可操作；结束后释放锁 |
| 操作失败 | 显示对应房间的实际错误；重新查询本地数据，回显 Core 已写入的错误与退避信息；不产生未处理 Promise 拒绝 |
| 暂停监控 | 卡片显示“下次采集 已暂停”，不再展示无效的计划时间 |
| 间隔编辑 | 未编辑值跟随后台，脏草稿不被轮询覆盖；1～2592000 秒整数校验，保存成功后回到同步模式 |
| 趋势选择 | 首次读取按原版优先选择直播中房间，最多 4 个；新增房间自动加入；明确清空后保持为空（避免轮询覆盖用户操作） |
| 删除房间 | 确认后才调用删除；同步清理列表缓存与趋势选择，刷新旧查询时再次排除已删除 ID |
| 趋势查询 | 仅趋势页可见且有选择时请求；失败可重试；按房间保留上次成功图表，切换对比选择后请求失败也不清空已有曲线；只显示当前选择，不伪造新选房间数据 |
| 图表 | 按采样时间排序及定位；缺失热度断线，不填 0；点位含时间/数值提示，展示区间起止时间 |
| 状态事件与列表读取 | 展示原事件类型/标题前后值；读取失败保留已有房间，提供“刷新监控数据”重试（只读本地，非立即请求 B站） |

测试：`BilibiliLiveWorkspace.interaction.test.ts` 新增 10 项独立 Chromium 点击测试，均完成先失败再修复；同时原 `BilibiliLiveWorkspace.test.tsx` 的 5 项展示测试通过。第 10 项来自独立审查发现的“选择变更后失败丢失旧曲线”，覆盖增加/减少选择与重试。测试运行真实 React + TanStack Query + DOM 交互，平台/IPC 数据为可控测试替身，不是平台端到端验收。

本批只核对直播间卡片、趋势、状态事件入口，不将同一文件内的弹幕、榜单、场次等页签算作验收完成。

## 继续迁移顺序

以下是下一轮逐操作核对项，不表示此前代码不存在，也不表示已完成验收：

1. B站认证与弹幕：扫码状态转换、重连、撤销凭据后的连接行为；手机确认需真人参与。
2. 榜单：逐榜单核对参数、翻页、空态、部分失败和已保存快照展示。
3. 场次/数据中心/分析/导出：逐筛选条件、统计口径、下载格式核对原实现。
4. Subject 工作台：逐绑定、布局、健康事件和聚合卡片核对。
5. 抖音本人登录态：Web/OAuth 的成功、失效、刷新、撤销与凭据查看；真实扫码和授权需真人参与。

这三批不新增 Worker 方法和 IPC 契约，不改变数据库 schema；不据此标记所有模块已迁移完毕。

## 前两批验证结果

- `scripts/activate-environment.ps1` 后执行 `check.cmd`：退出码 0。
- Node 共 206 项通过，其中新增 19 项（包含 6 项真实 Chromium 交互测试）。
- Python 23 项通过；TypeScript/mypy/Black/isort 检查和 Electron 生产构建通过。
- `git diff --check` 通过；原 B/S 仓库仍为上述基线且工作区干净。
- 本轮平台响应使用测试替身验证边界，没有重做真人扫码或新一轮真实平台端到端验收；安装包未重新生成。

## 第三批验证结果

- 审查修正后重跑 `check.cmd`：退出码 0；Node 共 216 项通过，Python 23 项通过，类型、格式和 Electron 生产构建通过。
- 第三批新增 10 项浏览器点击测试，连同 5 项既有直播页面测试通过。
- 生产 bundle 未包含 `liveFixture` / `followerFixture` 测试入口标记；测试浏览器已退出。
- 开发版客户端已优雅重启，窗口正常响应，Local Core 为单实例；未重建安装包。
- 原 B/S 仓库未改动；本轮未提交或推送代码，未进行新的真人登录/平台端到端验收。
- 独立代码复核发现 1 项 Important（改变对比选择后查询失败丢失已有曲线），已通过新增失败测试复现并修复；复核确认解决，未发现新增阻断。复核另行验证旧选择组合不会倒灌较旧曲线，删除缓存房间后不会显示或查询已删 ID。
