# 粉丝采集间隔输入与保存迁移（2026-10-05）

## 范围与依据

仅迁移 M06 的 `saveInterval` 与它依赖的输入/逐用户草稿/共享列表同步；不把整个粉丝模块或 M01–M18 标完成。

- 原 B/S：`D:/codex_work/BiliMonitor`，`fa2faa6`，只读。
- 原 `BilibiliView.vue:470–504,530–546,929–978,1136–1170`，实际安装 ElementPlus 2.14.1 的 InputNumber input/change/model watch/keydown 与实际加载的 CSS。
- 原 Follower API、Controller/Service settings 和 Repository `updateInterval:160–176`；历史本地 API 参考先读 `docs/user/info.md` 的 card 资料，仅作研究材料，不是当前协议或实网验收。
- 客户端起点仍 `b2e5a89`，开始时已有 226 项未提交增量、暂存区空；保留全部既有工作。不改 shared V2 契约、采集/数据库生产代码、调度或旧原项目。

## 已对齐的规则

保存顺序：夹取并捕获提交值 → 同值直接返回 → 标记该用户 saving/清旧错误 → settings → 用返回间隔覆盖整数 draft 并清显式 dirty → await 共享 list → 独立成功提示 → 解除该用户 saving。

- settings 失败不主动读列表，不重试、不清 draft/dirty，不发成功提示；允许原值重试。
- settings 成功后 list 失败仍确认成功，保留旧列表/展示读取错误；成功文案使用捕获的提交值，而非可能不同的返回值。
- list 复用在途请求，接受提交前旧快照，不强制 fresh、不加串行/锁/tombstone、不乐观改列表。成功读的草稿同步在请求兑现前排入状态队列。
- 草稿模型与原显式 dirty ID 等价：clean 可以和旧列表不同，读后覆盖 clean；dirty 即使暂时与服务器相等也不清原标记，之后不同的读仍保留草稿。移除用户后清其草稿。
- commit 前输入的新模型会被返回值覆盖；commit 后新编辑按当时旧 user.interval 决定 dirty。逐用户模型不串到新展开的用户；保存完成不关闭/清除其他用户草稿。
- saving 持续至 list 完成，不等待趋势；输入及刷新/暂停/删除仍可操作，不把 settings busy 扩为原不存在的业务锁。其他通用 action 流程未在本项改造。
- 每次输入父模型 `Math.round` 并夹至 `[1,2592000]`，空/0/负数归 1；focused raw 文本保持，change/blur 清缓存。外部 commit 不清 raw，native change 可重新提交 focused 文本；不能把模型覆盖说成聚焦文本立即消失。
- 动态 step 为 1/60/300/3600，键盘从 display 值相对步进，无强制倍数；鼠标原生微调按钮按原 controls=false 隐藏，聚焦滚轮不改变值。
- 保存开始清先前列表错误的可见状态；后续新读失败仍展示。Query 继续独占服务器数据/错误，仅增加 UI 错误可见性，不 reset/cache 丢弃旧列表或触发额外读。

## 实现边界

`BilibiliFollowerWorkspace.tsx` 的 Connected 层持有逐用户整数/显式 dirty、saving 和专用保存流程；presentation 受控消费草稿。`FollowerIntervalInput.tsx` 仅持有短命 raw/显示值并复刻真实事件；`follower-interval-draft.ts` 是纯 UI 同步/夹取/步长规则。样式只限定该 settings 输入，没有改添加表单或樱花雾白 token。

后端原语义已一致，本轮只补覆盖：ACTIVE 重排 now+interval，PAUSED 保留旧 next；同值仍写入/version/outbox；不清错误、计数、证据引用或历史，不请求平台、不新增快照。V2 保证返回完整间隔；没有为了测试原 nullish fallback 而破坏严格契约或伪造不合法 DTO。

## 测试与复审

- 首批 13 条实际 React/Query/Chromium 用例在生产改前均失败：输入/step/失败重读/其他 action 被锁/latent dirty 有明确断言；两项缺成功通知的观察超时。随后把成功文案轮询改为非阻塞 allTextContents，未放宽业务断言、预算或并发。
- 13 条修复后全过。独立复审指出原生鼠标 spinner，单独新增第 14 条 RED（appearance auto 而非 textfield），scope CSS 修正后 14 全过；真实右侧鼠标点击不改变 60，ArrowUp 得 120。
- 旧读错误保留补第 15 条 RED（旧 alert 1 而非 0），增加可见性清除后，新 15+既有 Workspace 25+AddFlow 15 共 55 条全过。
- 新纯规则 19 条、新 Core/SQLite V2 settings 4 条为补覆盖，不宣称都经历生产 RED/GREEN。较上一完整检查共新增 Node 38 项；Python 无改动。
- 新 suite 独立 D 盘 Vite cache，port 0；原 30 秒 beforeAll 内用真实 readyPage 确认挂载，case 全新页面且严格同源，没有浏览器外部请求/pageerror。不提高既有等待预算/并发、不用强制点击或虚构结果跳过实际业务。
- 独立源规则与 production/backend 只读核验完成；输入鼠标问题已关闭。完整自动检查和最终安全证据见下节，不把编译/bridge 合成验收当作原生或平台验收。

## 完整检查与交接

首轮完整 `check.cmd` 退出 1：Node 2021 总项，2020 通过/旧容量用例 1 超时；Desktop 49 文件 579/580，新 15 项全过，Contracts 461、Storage 53、Task 3、Core 866、NodeBrowser 12、NodeRealtime 46 全过。未进入后续类型/Python/build 阶段。失败日志保留于 D 盘忽略目录 `.tmp/2026-10-05-follower-interval-check.log`。

既有 2000 点容量用例的观测显示 setup 717ms ready/无资源 pending，body points ready1188、focus3597、End3710、Home4464ms，未进入 complete；不是新保存规则失败或挂载超时。原 5 秒预算下单独隔离容量用例通过（该文件测试阶段 2.05s）。没有因此修改预算、并发、真实点击/键盘或生产图表，也不把隔离 GREEN 写成并发根因修复。

复审 input handler 的 48 组纯内存比较发现强制传入 `1e309` 时原 verifyValue 与直接 clamp 有差异。随后实际本地 Chromium 原生 number 输入 carrier 验证 `1e309/-1e309` 的 value 和 input event 均为空，`1e308` 正常保留；该 Infinity 差异在测试原生输入不可达，不为此发明生产修补。没有平台请求、原生安装应用或原 B/S 启动。

新代码保持冻结，第二轮正常完整 `check.cmd` 退出 0：**Node2021/Python1003**，Desktop49文件580项、新15项全过；全部TypeScript、Black57/isort/mypy18、Main/Core/Worker、CommonJS Preload与Renderer生产构建以及D盘路径检查通过。最终日志 `.tmp/2026-10-05-follower-interval-final-check.log`。首轮失败和旧容量稳定性风险不关闭，不宣称一次正常复验证明根因修复。

独立只读复查未留下 Critical/Important，旧错误观察和鼠标 spinner 已用实际 RED/GREEN 关闭；不可达的 Infinity handler 差异仅作为核验记录。最后三个生产文件 SHA256 保持冻结：Workspace `69B728C5…`、Input `98FE2622…`、draft helper `D14F9A77…`。

2026-10-05 23:35:42 +08:00安全核验：项目Node/Python/Electron/Chromium/Java进程0、相关监听0、生产本轮fixture标记0、diff通过、新增文本尾空白0、CLAUDE仅`@AGENTS.md`。原B/S/API参考仍clean；客户端HEAD/index未改，234项增量含147新增文件全部保留。本项实现和完整自动检查完成，M06和完整M01–M18目标仍active。

下一独立业务核对原 `refreshUser:548–558`：失败是否重读、共享旧 list、成功确认与手动刷新忙状态。只记录队列，本项不跨入实现。

M06 默认共享 recycler、NDJSON 最终帧关联、HTTP 承载/编码异常、其它 JVM/Double/日志/数据库编码/完整属性源，以及旧 suite 间歇性初始化/容量性能风险全部保留；M08、M09–M18仍在完整目标内。真人平台、原生 Electron、系统保存/安装包验收单列。

本轮未提交/推送、安装工具、启动原 B/S 或安装客户端，未访问平台/用户运行库/真实凭据；所有新文件、工具缓存、临时数据库、浏览器与产物 D 盘。
