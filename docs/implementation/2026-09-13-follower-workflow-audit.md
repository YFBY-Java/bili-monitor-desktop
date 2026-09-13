# M06 粉丝监控逐操作审计

## 依据与范围

- 原项目 `D:\codex_work\BiliMonitor`，只读基线 `fa2faa6`。依据为 `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/` 下 Follower Controller、Service、Repository、配置、请求 DTO，以及 `frontend/src/views/bilibili/BilibiliView.vue` / TrendChart。
- 客户端基线 `e014fa9`，本轮仅补本地生命周期保护和审计回归。此前查询/采集、监控 UI、趋势 UI 的实现及失败证据见全量台账和对应子计划。
- 下表证明代码和自动测试层面的迁移，不证明真人平台采集、原生 Electron IPC/安装包或真实用户数据库已经手工验收；这些仍归 M18。B站登录作为 M07 单独处理。

## 操作矩阵

客户端服务简称 `bilibili-follower-service.ts`，数据库为 `ControlDatabase`。测试路径前缀 `packages/core-runtime/src/`；UI 测试前缀 `apps/desktop/src/renderer/src/`。

| 原操作/规则 | 客户端实现 | 已检查的执行证据 |
| --- | --- | --- |
| 添加前校验卡片；失败不建用户/快照，不能改用 relation 初始建档 | `addUser` → WorkerSource → Python parser；事务写监控/快照/对象引用/Outbox | `bilibili-follower-collection-parity.test.ts` 初次失败用例；`main/follower-workflow.integration.test.ts` 通过 Preload 和 Core 真正执行失败再添加 |
| 正整数 UID，默认 3600 秒，间隔 1–2592000 秒 | 共享输入 schema，Preload 和 Core 双重校验；UID 字符串避免大整数精度丢失 | 契约回归、UI 输入回归；完整链路测试确认非法 UID 不到 source |
| 重复添加同 UID 复用记录，更新资料/间隔并启用 | 添加返回后重新检查 MID，SQLite upsert | `bilibili-follower-parity.test.ts` 重复/并发添加；完整链路测试确认 ID 不变且 ACTIVE |
| 暂停保留排程；启用排程设为现在 | `updateStatus` 与 SQLite CASE | 完整链路测试、collection-parity 暂停/启用用例 |
| 活跃用户改间隔重新排程；暂停改间隔不动旧排程 | `updateInterval` 与 SQLite CASE | 完整链路测试验证两种状态；UI 草稿跨用户/折叠/失败保持 |
| 手动刷新允许暂停用户，成功不能把暂停改为启用 | `refreshNow` → `persistSnapshot(mode=collect)` | 完整链路测试读取实际保存状态/增长率/历史；parity 测试覆盖请求期间暂停、改间隔和删除 |
| 删除监控并级联快照；后续查询不存在 | `deleteUser` 事务与外键级联；页面确认后清选择/详情 | 完整链路测试关闭 Core 后用只读 SQLite 确认快照为 0；UI 取消/确认删除交互 |
| 只取到期 ACTIVE、按排程排序、每批最多 10 位 | `collectDueUsers` + `findDueBilibiliFollowerMonitors` | collection-parity 12 位用户用例，确认第 12 位及暂停用户未采集 |
| 原页每秒到期检查适配成本地唯一 Core 定时器 | `LocalCoreRuntime.startFollowerScheduler`；Renderer 时钟只显示倒计时 | scheduler 测试验证 1 秒调度但平台调用仍受 1500ms 限流；UI 倒计时无平台刷新请求 |
| 网络/HTTP 限流/服务端错误重试；仅特定失败回退 relation | `fetchWithRetry` / `fetchForExistingUser` | collection-parity 覆盖错误类别、尝试次数、100ms 下限、指数等待、不能对风控/认证/限流强制回退 |
| 成功卡片无头像清旧值；relation 保留资料 | `persistSnapshot` | collection-parity 卡片/重复添加/回退资料回归 |
| 失败保留上次测量与成功时间，退避 max(300,min(interval,900))，错误截断 900 字 | `markFailure` + SQLite | collection-parity 的 1/600/3600 秒及错误长度用例；完整链路测试风控失败与后续成功清错 |
| 列表不默认截断；ACTIVE/粉丝数/插入顺序 | `listUsers` / SQLite | query-parity 505 人与插入顺序用例；实际浏览器选第 505 人回归 |
| history 默认/非正数 500，最多 2000，先取最近再升序，包含边界 | query schemas + SQLite 秒索引/小数比较键 | query-parity 2005 点、时区/微秒、同秒覆盖、隔离及前值 0 无增长率 |
| 同页最多 4 人趋势、布局/拖动/实际时间轴/失败保留 | Workspace、TrendBoard、Query hook | 已提交 `e014fa9` 的计算及 Connected 浏览器交互回归；不是自动选择所有用户 |
| 本地退出不能把悬挂任务留到数据库关闭后继续执行 | Service 停止标记、取消限流/重试计时器、每个异步边界检查；批次退出 | lifecycle 9 项（含 API 日志为空、立即移除定时器、错误传递微任务边界）；scheduler 真正 stop/重开同一个隔离库，保留原排程并恢复到期采集 |

## 完整本地业务链路测试

`apps/desktop/src/main/follower-workflow.integration.test.ts` 使用生产 `createDesktopBridge` 的入参/结果校验、`dispatchBusinessRequest`、`LocalCoreRuntime` 和真实 SQLite；仅替换 Electron 的传输连接及外部平台响应。

一次流程实际经过 8 类命令/查询：add、list、update-status、update-settings、refresh、trend、trends、delete。覆盖首次风控无建档、添加/暂停/编辑/手动刷新、重复添加、主动排程、失败保留/恢复、历史、Core 停止和重开，以及删除后数据库快照级联。

这不是 UI 点击 → 原生 Electron utilityProcess → 实际 Python HTTP 的全端到端测试；原生传输、真人扫码/采集和安装包生命周期仍需后续专门验证，不能用本测试替代。

## 本轮修复与审查

- 原 Service.stop 只停止 source，未取消限流/重试和旧批次。最初 6 项回归真实失败，显示停止后仍成功写快照、继续重试或消费下一位。
- 增加退出标记与计时器取消，拒绝新任务；迟到成功/失败都不写 API 日志、快照、失败状态或下一次排程。取消返回 `CORE_STOPPED`，不伪装为平台错误。
- 独立审查复现外层 add/display-name 错误传递中途退出仍返回平台风控错误；2 项微任务回归先失败，补 catch 检查后通过并复审关闭。
- 补充立即取消和手动在途失败断言；当前生命周期 9 项、Core 调度/重开 2 项、完整业务链路 1 项均已定向通过。
- 最终 `check.cmd` 退出 0：Node 378 项（contracts55/storage17/task3/Core118/browser12/realtime19/Desktop154），Python54项；TypeScript/mypy、Black/isort、生产构建、D盘路径检查通过。测试使用的 Promise.withResolvers 超出当前 TS lib，已换为普通 Promise gate，不改项目编译目标。
- `git diff --check` 和生产 bundle 的本轮 fixture 排查通过；原项目仍为 `fa2faa6` 且干净。本轮未提交/推送、未启动已安装客户端、未打包或访问真人平台。M06代码及自动闭环审计结束，M07–M18保持未完成。
