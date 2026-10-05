# 粉丝添加成功链与抽屉归属迁移（2026-10-05）

## 原依据与边界

- 原 B/S `fa2faa6` 只读，`frontend/src/views/bilibili/BilibiliView.vue:13–36,399–423,470–527,688–735`：添加写入成功后清空 UID，但不重置间隔；await 共享 `loadUsers`，成功读同步清理失效选择，然后按 raw ID 去重、检查4人上限并追加返回 ID，排队趋势、提示成功。列表失败在 `loadUsers` 内捕获，不撤销已成功的添加、不自动重新添加；趋势完成不阻塞成功确认。
- `loadUsers` 复用已经在途的旧读取，不保证新快照。原 `selectedTrendUsers` 只过滤展示，选择状态和趋势请求仍使用 raw ID；不能为了看起来立即出现而加强制fresh读取、删除tombstone或全局操作串行。
- 原 Follower Service:64–78 / Repository:81–97 每次添加先采集资料、再upsert，可能返回已存在的用户 ID，不保证每次新增。当前切片不修改已迁移的 Core、Python、SQLite 或共享 v2 契约。
- 历史本地 `bilibili-API-collect-new/docs/user/info.md:518–715` 的card资料已先读，只作材料，不是当下平台协议/采集成功证明。UID 精确输入沿用上一项用户确认的规则，见[UID审计](2026-10-05-follower-uid-input-audit.md)。

## 客户端实现

- `ConnectedBilibiliFollowerWorkspace` 对粉丝列表显式 `retry:false`；add成功后 `refetch({cancelRefetch:false})` 合并在途读，等待读取结束再判断选择上限。成功读取在 queryFn 返回之前入队清理 raw 选择，避免旧的 React data effect 在追加后又删掉新增选择。读失败保留缓存数据及 raw 选择。
- `useFollowerTrends` 接收 raw ID；用户条、计数和趋势显示名单才与当前列表相交。不改变既有有界缓存、同key请求合并和迟到响应过滤；读失败/旧列表缺少新用户时仍查询其历史，后续新列表出现该用户时保留选择。
- 添加 draft 升至持续挂载的 workspace：关闭重开抽屉不丢 UID/间隔。写入提交阶段只清 UID、保留间隔；busy延续到列表同步结束。成功可见状态为“已添加监控用户”，不等历史请求完成。
- 每个抽屉表单维护自己的错误和同步卸载归属。旧 A 请求可以完成业务写入/列表同步/选择更新，但不能清空、关闭或向新 B 抽屉附上旧错误。关闭抽屉不取消 Core 写入。
- 提交阶段清 UID 后、列表仍在途时，用户可以输入下一 UID；完成阶段不再次清空。调用局部 `didCommit` 标记保留自定义展示handler不提供提交回调的兼容路径，同时避免实际 Connected handler 的二次清空。

## 回归证据

- 独立源码审计以原 Vue 真实函数内存提取和合成依赖核验6场景全部通过；不是运行原B/S或访问平台。实现复审另以真实 Connected 回调与安装的 QueryClient/Observer 5.102.0、FIFO state updater核验3场景：旧读复用、prune后补选、读失败不重试且仍确认成功均通过。
- 新增 `BilibiliFollowerAddFlow.interaction.test.ts`，真实 React/Query/Chromium生命周期，仅窄化bridge响应合成。初12项先RED：9个业务断言失败、3个控制场景通过，无pageerror/外部请求。补第13项“列表失败、历史挂起仍确认成功”先RED，再与实现一起GREEN。
- 第14项“commit清UID后、list挂起时再输入66”复现本轮实现二次清空，RED为期望66/实际空串；最小 `didCommit` 修复后14/14通过。不通过延长超时或减并发掩盖。
- 14项覆盖真正新增、旧初始快照、后续恢复、成功读prune后第四人、真满四人、重复upsert去重/顺序、单次列表失败及历史独立读取、成功通知、不等待趋势、提交时清UID/保留间隔/持续busy、失败草稿/精确重试、旧抽屉迟到成功/错误和提交后的新草稿。
- opt-in fixture按调用时捕获list快照，add/list独立按index等待/释放/失败；默认旧fixture不变，opt-in默认retry1以核验生产query自行禁用重试。此fixture不声称完整模拟后端upsert/快照/调度，实际Core/SQLite回归另在完整检查中。
- 修复后定向3文件197项（新14、既有监控25、UID helper158）及另6文件68项（趋势交互/展示、监控/Long64/头像投影）通过，web TypeScript退出0。
- 独立实现复审7/7真实回调内存场景通过，无已确认Critical/Important；发现fixture在try前查找已删除ID会跳过finally，activeTrends计数泄漏。补第15项真实浏览器回归先RED（期望0/实际1），仅将result构造移入try，保留NOT_FOUND拒绝；新15项+既有趋势13项共28项通过。独立鲜验正常/缺失ID后active均0、finished2，Minor关闭，生产hash保持。初始旧读场景另明确断言list调用数仍为1。跨整个workspace卸载/重挂载和真实remove/add命令交错未补完整矩阵，不能由抽屉A/B回归替代。
- 第一次完整check在Node阶段退出1：Core862全过，Desktop新14项全过，但既有500点×4用户趋势测试超过5000ms，Worker取消add测试10秒内未出现HTTP启动标记（ENOENT）。记录失败，不把它算验收成功。两项定向运行通过；趋势逐步测量fixture-ready1369ms，填数据6ms，4次选择53/56/54/70ms，2000点就绪421ms，End/Home提示142/60ms，最终2000点、active0、趋势请求1。未修改预算/并发/生产业务；不能仅凭重跑就断言首次失败根因。
- Worker隔离单case1350ms、整文件9/9分别34.86s/38.69s；真实synthetic Worker spawn→ping1115–1153ms、ping→HTTP marker20–27ms。没有复现10s标记缺失。测试catch提前错误但到marker后才检查，早期Worker退出可能只表现为ENOENT；这项可观察性缺口保留，不能声称资源压力已证实为原因。
- 第二次完整check仍在Node阶段退出1：Core862通过，Desktop539/546通过，7个首次导航/启动超时分布于五个suite；不是功能断言错误，Worker9项全部通过。只补新suite失败时的有界阶段耗时/待完成资源pathname日志（不输出query或凭据），预算和并发未改，单独完整Desktop47文件546项通过；全TS、Black57/isort/mypy18、Python1003另通过。此处仍不是完整check已通过。
- 安装Vite7.3.6实际resolveConfig证明这五个suite默认共用 `apps/desktop/node_modules/.vite/deps`，四个Live suite已有独立缓存；默认扫描六个fixture HTML。D盘无浏览器、双实际server冷优化探针观察A在1386ms提交deps，B在1666–1667ms移走A的目录后提交自身deps，三次rename各1ms成功、9依赖/无错误。证明共享写入，未复现5s/10s阻塞；此前全部失败根因仍未确定。
- 对本轮新AddFlow实际createServer配置提取做路径归一化隔离断言先RED（与公共.vite相同；首次未归一化斜杠的比较不能算RED），再仅设置独立 `node_modules/.vite-follower-add-flow-test` 后GREEN，沿用Live既有方式；未改四个旧default suite、全局预算、并发、测试数或生产业务。只消除新suite的共享写入，不宣称一次重跑已证明全部首次失败修复。
- 第三次完整check：其余46个Desktop文件通过，新AddFlow最初4项超时。阶段日志明确HTML commit154–411ms，但添加按钮未挂载，私有cache中的React/Query/Zod等六个依赖资源仍pending；未进入任何添加业务步骤。说明仅listen了HTTP socket，未等冷依赖编译/夹具启动就开启业务用例计时；不能将缓存隔离本身写为启动问题已解决。
- 新suite在原30秒beforeAll启动预算内，用独立readyPage确认真实React夹具挂载，再关闭该页/上下文；各case仍创建全新页面，保留5秒预算和1.5秒轮询。启动页严格同源、error/blocked请求零、不执行add。失败诊断最多100阶段及100资源pathname+总数。独立复审Critical/Important/Minor均0，生产hash未变。启动修正后两次单独Desktop运行新15项均通过，但分别有既有趋势500点case超5秒、LiveOverview两个导航超2.5秒；未宣布整个自动验收已通过。
- 既有趋势容量case只补失败阶段记录，仍四次真实checkbox check、2000点/4个tabstop/End/Home精确值断言，不改预算、debounce或请求条件。只读探针表明串行点击可能触发正常中间绘图、每次四图有大量Intl格式器构建；HEAD/current 2000点SSR310/322ms，不能宣称Long64或本轮添加逻辑导致退化。相同列表prune返回新数组是可确认的无效state更新，但React batching/已有Query通知使实际额外commit尚未证实，未猜测性改生产性能代码。
- 最后代码/测试冻结后第四次 `check.cmd` 仍退出1：Node共1983项，1978通过/5失败（Desktop541/546；Contracts461、Storage53、Task3、Core862、NodeBrowser12、NodeRealtime46均通过），新AddFlow15项全过。五个失败均为既有FollowerTrendBoard、FollowerWorkspace、LiveDataWidget、LiveOverview、LiveWorkspace的beforeEach 10000ms超时；本次容量case尚未进入body，未产生volume阶段日志。不能把本次hook失败和前次容量body失败合并解释。
- 第四次检查时状态为**实现及定向回归通过，完整验收未完成**。随后先补既有初始化/导航的具体阶段观测，再运行第五次完整检查；不抹掉此前失败，也不擅改预算/并发/业务。
- 另外独立执行全TS、Black57、isort、mypy18、Python1003（2.70s）均退出0；最终 `pnpm build` 退出0，包含最新web/node类型检查、Main/Core/Worker、CommonJS Preload与Renderer生产构建。此为生产编译通过，不冒充完整check或安装包/原生验收。

## 完整检查收尾（2026-10-05 23:03）

- 五个此前失败的旧suite补每次setup独立的阶段/资源探针：创建页面、路由/时钟、导航、heading及必要的趋势就绪。仅失败时输出，最多100阶段、100个Request身份资源和100条失败，pathname最多256字符；不记录query、headers、请求体或完整错误。另观测清理后迟到page创建，不改变原业务测试体、等待条件、预算或并发。
- 三个失败的Live suite原本已有独立cache，故共享cache不能统一解释五个失败。安装版Vitest超时仅拒绝外层Promise并abort signal，Playwright隐含context/page创建不会因此取消；无浏览器deferred carrier实际证明迟到赋值风险可执行，但不是这五个真实失败的复现。不据此猜测性修改页面归属或生产代码。
- 第五次完整`check.cmd`当时退出0：Node1983/Python1003；复审补查发现三Live诊断将原全局page操作改为局部setupPage，改变了超时交错路径，列为Important。实际三文件receiver guard先RED（3个违规），仅将timeout/route/clock/goto/heading/poll恢复原page引用和原参数，资源监听仍捕获本页probe，guard再GREEN（0违规）；独立复审关闭Important，无残留同类变化。第五次日志保留为`.tmp/2026-10-05-add-flow-setup-check.log`，不是恢复后最终证据。
- 恢复后全部代码/测试再次冻结，第六次完整`check.cmd`退出0：**Node1983、Python1003**，Desktop47文件546项、新添加15项、旧页面setup/容量用例全过；全部TS、Black57、isort、mypy18和Main/Core/Worker、CommonJS Preload、Renderer生产构建通过。最终日志为D盘忽略目录`.tmp/2026-10-05-add-flow-final-check.log`。没有通过诊断修补改变原测试的等待归属来换取最终GREEN。
- 本次没有失败阶段日志或迟到建页告警，不能将一次GREEN写成旧间歇性超时根因已查明/稳定性风险已修复。此前四轮失败及Worker启动可观察性、setup取消/清理、图表容量性能线索继续保留；后续若再复现使用上述观测定位，不延长预算或绕过真实点击。
- 当前添加成功链的功能实现和完整自动检查通过；不是M06全量、原生客户端、真实平台或安装包验收。生产`BilibiliFollowerWorkspace.tsx` SHA256仍为`F650FEB6C761C48E20931739686A66B5DA36B3C4672D6D4743CEA557A430398F`，收尾未改业务实现。
- 2026-10-05 23:03:36 +08:00核验：项目进程/相关监听0，生产本轮fixture/诊断标记0，diff检查通过、`CLAUDE.md`仍为`@AGENTS.md`。原B/S `fa2faa6`和历史API `271b123`均clean，客户端仍`b2e5a89`、index空、226项增量含140新增全部保留；没有提交推送、安装工具、更新安装应用、访问平台/凭据/用户运行库或改动原B/S，新产物仅D盘。

## 后续与未验收

M06及完整M01–M18仍进行中，本项不宣称整个模块完成。下一独立交互核对原 `saveInterval:530–546` 的clamp、服务返回间隔同步、dirty草稿、写入失败与共享重读/成功提示；当前通用 `runUserAction` 的finally重读不能直接视作原规则等价。仅先记录，不在本项跨入实现；旧suite间歇性超时的诊断待办保留。

默认共享recycler/JSON跨模块缓存、其它JVM/charset-MIME异常链、Double文本/负零wire/数字message/API日志failureMeta、PG-SQLite/NUL/TEXT编码、完整属性源/JVM/cache/冲突/indexed及NDJSON最终帧关联等既有待办全部保留；随后继续M08、M09–M18。真人平台、系统密钥/剪贴板、原生Electron/保存与安装包验收单列，浏览器合成bridge不代替。

所有新文件/工具缓存/测试数据/产物D盘；未安装工具、提交推送、更新已安装客户端、启动或修改原B/S、访问用户运行库/凭据。第四次检查结束的2026-10-05 22:38:01 +08:00安全核验保留：项目进程/监听和生产fixture0，Main未外部化源码workspace包、CJS Preload存在，diff及140个新增文本尾空白通过，原B/S/API clean、客户端空index、225项增量保留。当时完整check仍失败，安全检查不能替代它；最新第六次完整检查和安全状态见上节。
