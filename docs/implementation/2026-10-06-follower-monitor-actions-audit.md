# 粉丝暂停/恢复与删除原业务迁移审计（2026-10-06）

## 范围和基线

用户再次要求继续逐功能迁移，已恢复开发；本轮仅原粉丝`toggleUser/removeUser`及其必要共享读取/趋势缓存、V2持久化证明。客户端起点`4c94959`，分支`codex/follower-monitor-actions`；没有复制工程或向C盘安装工具。

原B/S：`D:\codex_work\BiliMonitor`、`fa2faa6`，开始时工作区clean，只读且未启动。基线开始前未发现客户端开发实例进程；测试使用D盘隔离目录，不访问用户数据库、平台或凭据。本轮不自动提交/推送。

## 原事实与差异

| 原源码 | 原业务事实 | 迁移前差异/状态 |
| --- | --- | --- |
| Vue `BilibiliView.vue:637–645` | status入口清错误，await PATCH→共享列表，不等history，无toast，无busy锁 | 旧generic wrapper锁按钮；旧read错误未同步隐藏。实际未复现额外history请求，不将其计作RED缺陷 |
| Vue`:647–667` | 确认取消不清错/不请求；成功先清选中、对应展开、该ID趋势缓存，再await共享列表，最终已删除提示 | 客户端仅清选中；详情依赖成功列表才收起，无删除成功通知，有额外操作锁；未实测额外history请求 |
| Vue`:470–504,929–943` | 已在途列表复用；旧快照允许回流；失败保留旧列表/吞异常；成功读才清不存在用户草稿 | 既有Query/草稿同步已对齐，动作不能重新套强制invalidate/freshness |
| Service`:81–98`、Repository`:146–179` | missing NOT_FOUND，暂停保留next/error；恢复next=now，不直接平台采集；delete只删资源 | Core/SQL主要已相同，补真实V2路由+SQLite证明，不重写 |
| SQL V2/V5 | 历史CASCADE、Subject绑定引用SET NULL；主体/MID/其他资源保留 | SQLite外键同规则，需要独立操作/重开回归 |

源路径以原仓库`social-data-monitor/`为根。原API wrapper只取HTTP data，异常上抛；客户端保留本地typed bridge适配，不新增服务器或原网页Number舍入缺陷。

历史API资料也已只读核对：`D:\codex_work\bilibili-API-collect-new`、`271b123`、clean，`docs/user/info.md:518`的card与`docs/user/status_number.md:3`的relation/stat。该库2026-01已归档，仅作合成源背景，不是当前协议/实网验收；本轮没有修改平台端点。

## 本轮基线复验（实现前）

`check.cmd`退出1：Node2039/2047、Desktop589/597。Contracts461、Storage53、Task3、Browser12、Realtime46、Core875均通过。失败8条分别位于旧AuthPanel、SubjectWorkspace、FollowerWorkspace、FollowerTrendBoard各2条，均在原10s `beforeEach`页面导航/依赖加载超时，而非业务断言；旧2000点键盘容量测试本轮通过。

只读检查确认这四套Vite server没有独立cacheDir，共享`apps/desktop/node_modules/.vite`，且没有readyPage；日志中6个预构建模块pending，失败请求0。开发进程在基线开始前为0，排除活跃dev同时争用。Vite源码存在优化提交目录重命名与processing等待路径，但没有优化时间线/rename错误证据，**不能据此声称具体竞争根因已证明**。键盘旧慢点也未证明为某个绘图算法瓶颈。

日志：`.tmp/2026-10-06-follower-actions-baseline-check.log`（D盘，ignored）。不增加预算/降低并发/换测试操作，不以单次绿色关闭旧稳定性风险。

## 实施和复审状态

- 暂停/恢复：生产修改前准确RED为4失败/5通过（按钮锁及旧列表错误未清）；最小实现后新交互10项、真实V2 router/Core/隔离SQLite9项通过。主代理连同既有添加、间隔、手动刷新运行5套66项全部通过；task独立复审Approved，无Critical/Important，冷启动hook波动作为Minor保留。最终全量已执行，既有Workspace/TrendBoard仍各有2条导航hook失败，不能将整组验收标为通过。
- 删除：最初2条明确业务RED后实施；完善夹具后用apply_patch暂时恢复自己的Task2修改（保留Task1），补充干净RED为6失败/3通过，包含独有历史缓存未清，不倒写执行顺序。恢复最小实现后新交互9项、真实V2/Core/SQLite5项通过；task复审Approved，无Critical/Important。主代理连同状态、添加、间隔、手动刷新与纯组件运行8套84项全部通过。
- 最终完整检查仍退出1，详情见下文；安全核验通过，整轮只读独立复审通过，无Critical/Important及需修改的新增Minor。不将新操作的定向通过或后续单独构建通过写成全量绿色。

## 实现与证明边界

- `BilibiliFollowerWorkspace.tsx`：状态命令采用专用方法，清共享错误后PATCH→共享列表；删除采用remove→清该ID选择/趋势缓存→成功回调收起当时对应详情→共享列表→`已删除`。清除不再使用的generic忙碌/invalidate代码；设置、添加、立即刷新及精确值域不回退。
- `use-follower-trends.ts`：只filter指定user的实际实例Query缓存，不整体清其他用户、不取消history、不建墓碑。独有666666/999999已清、另一用户777777仍保留；旧卡片回流及失败读保留草稿均有浏览器断言。
- 真正的V2 router/Core/SQLite验证暂停next/error/历史保持、重复恢复next=now及下一扫描、缺失/非法V2输入不改数据；删除CASCADE、仅工作台粉丝引用置null，MID/主体/直播资源/另一用户整对象不变，重加新ID且旧绑定不复接、重开持久化，以及四种自动采集在途结果。既有后台生产已同规则，因此没有重写后台或数据库migration。
- typed桥接传输及外部平台响应合成，Core/SQLite/React/Query/Chromium真实；不等于真人采集、原生Electron或安装包验收。调度内部错误具体文本依据源码，实测仅观察scheduler-failed/无snapshot事件及不复活，未声称API返回该文本。

## 旧suite缓存隔离

四个旧suite各只加1行自定位cacheDir，独立task复审Approved、无问题；主代理复核与新status/delete目录均不同。保留原全部操作、断言、5000ms测试预算/10000ms默认hook、个别既有30s启动hook及并发；不增加预热、不删缓存。仅隔离磁盘依赖产物，不消除CPU/esbuild/全局资源或同suite多份执行风险。完整检查仍有同8条旧hook失败：**缓存隔离没有消除本次问题，不能记为稳定性修复**。

只读补查Vite默认扫描root下全部6个fixture HTML，默认holdUntilCrawlEnd，依赖响应等待processing；私有metadata在10:38:56生成。唯一候选假设是冷预打包/crawl commit阻塞前两轮导航，但没有optimizer时间线，尚未证实。后续最小诊断是在一次既定运行加`DEBUG=vite:deps*`并记录时间；若commit早于pending窗口则否证。单页`optimizeDeps.entries`是未实现、未验证候选，不继续重跑求绿色，也不改预算/并发/真实操作。

## 测试日志

所有日志均为D盘ignored `.tmp`：`follower-status-red/green`（2026-10-06前缀）、`follower-delete-red-final/green`、`follower-status-regression`（66项）、`follower-actions-regression`（84项）、`follower-actions-baseline-check`与`follower-actions-final-check`。首轮不存在按钮/测试断言、BigInt inspection/live样例等夹具错误及cold hook波动在任务报告单列，不充作业务缺失或生产修复证据；中间有一份green日志被后续同命令覆盖，准确过程以任务报告与本对话输出为准。

## 最终检查与安全状态

- 10:36:57–10:39 +08:00正常`check.cmd`退出1：Node **2072/2080**、Desktop **622/630**（50文件通过、4失败），Core875、Contracts461、Storage53、Task3、Browser12、Realtime46通过。新增33项全部通过；失败仍为旧AuthPanel/SubjectWorkspace/FollowerWorkspace/TrendBoard各2项10s导航hook，未执行业务断言。日志仍是各自私有目录6个deps pending、请求失败0；旧2000点键盘本轮通过，不冒称旧稳定性问题关闭。
- Node中断后单独运行全部TypeScript、Black57/isort/mypy18、Python **1003**（2.82s）、Electron生产构建，退出0。Main/Core/Browser Worker/Realtime Worker、CommonJS Preload、Renderer均生成。日志`.tmp/2026-10-06-follower-actions-remaining-checks.log`；这是单独检查成功，不是`check.cmd`退出0。
- 10:43:06 +08:00安全检查：项目进程/监听0；生产输出中本轮测试标记0，Main/Core无外置源workspace包，CJS Preload存在；diff/7个新增候选空白检查通过，AGENTS/CLAUDE/工程规则未变，index空。
- 原B/S仍`fa2faa6`、API参考仍`271b123`，均clean只读。客户端HEAD仍`4c94959`、分支`codex/follower-monitor-actions`，没有自动提交/推送、安装工具、更新安装应用、真人平台/扫码或用户库操作；所有本轮产物位于D盘。
- 整轮只读独立复审：完整增量包及必要Query上下文审查通过，无Critical/Important及需修改的新增Minor。仅本轮status/delete代码增量Ready to merge，未授权自动提交/合并；整体Ready to ship为No。复审没有重跑测试或独立复核原B/S全文，执行事实以本轮主代理记录为准。

M06整体、M08及M09–M18和真人/原生/安装验收仍未整体完成。已有手动刷新等功能成果不回退。
