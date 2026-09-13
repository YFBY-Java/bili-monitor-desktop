# M08 直播趋势迁移审计

## 原依据与范围

- 原仓库 `D:\codex_work\BiliMonitor`，`fa2faa6`，全程只读且不启动。
- 客户端基线 `9eb5602`。计划：`docs/superpowers/plans/2026-09-13-live-trend-migration.md`；本轮不提交/推送、不重新打包或重启已安装应用。
- 原 `social-data-monitor/frontend/src/views/bilibili-live/BilibiliLiveView.vue`：306–353趋势区，609–628选择/帮助，636–654重读，843–903选择/180ms刷新/规范化，960–993点回退/高度。
- 原 `frontend/src/components/charts/TrendChart.vue`：数值/时间轴padding、precise-compact万/亿、平滑线/面积/点、悬停提示、主题与resize。
- 本轮迁移原直播趋势业务，不改变Contract/Core/Worker/数据库；同页展示和客户端独立页签复用同一趋势组件。原Live没有粉丝页的拖动交换/缩放，不擅自新增。

## 逐项对应

| 原业务 | 客户端实现与证据 |
| --- | --- |
| 选择顺序/数量 | `BilibiliLiveTrendBoard`按selected IDs映射最新房间，不按列表顺序或旧trend.room排序；最多4间，首选直播中，无直播回退首房。既有505间选择/删除回归保留 |
| 1/2/3/4布局 | 高度420、320/320、420/200/200、240×4；三房左1.2fr占两行、右0.9fr，四房2×2；900px以下单列 |
| 同页趋势 | 直播间操作区下直接展示趋势；独立趋势页签有全房间复选框，两处共享选择、点集、错误与刷新状态 |
| 查询与范围 | typed `bilibiliLive.trends`使用最近500点，不伪称固定24小时。现有历史服务和时间升序不变；横轴真实时间，不按等间距序号画正常数据 |
| 点集优先级 | `liveChartSamples`严格fetched非空→recentTrend非空→当前onlineCount单点→空；0是已知值，undefined不是0。展示回退不制造endpoint、不写新快照；无lastSnapshotAt时明确单点使用展示时间 |
| 缺失热度 | 原`chartValues`为`onlineCount ?? 0`；现同样只在绘图时投影为0，原DTO保持缺失。空心点、图下注释和tooltip说明“原始值缺失”，不谎称实测0 |
| 坐标轴 | `trend-axis.ts`复用原幅度下限、range×2.2、1.18留白、非负值零下界；时间4%/30秒/60秒边距、单时间点±30分钟。精度按原precise-compact阈值，负数及Number.toFixed规则不私改 |
| 图表交互 | `LiveTrendChart`响应容器尺寸；曲线、主题透明面积、7px点、网格与真实首末时间。鼠标就近采样点及可见tooltip；Tab、左右/Home/End、Escape可操作，不仅依赖SVG title。辅助文本/轴14px，独立缩放明确披露 |
| 刷新与空选择 | 成功房间重读后规范化并刷新；主动清空保持到下次成功重读，失败重读不恢复默认。取消选择180ms内不查询空列表。沿用已有15秒本地房间投影重读，移除另一个30秒趋势轮询；不会调用平台refresh |
| 快速选房 | `useLiveTrendQuery`按180ms合并，每次选择发生有独立queued身份；A→B→A也等待最后一次选择完成，不因旧key匹配提前发请求 |
| 生产缓存/在途 | 显式staleTime=0、retry=false，不受生产15秒freshness阻挡。重读取消过时Query逻辑请求，bridge不可中断的迟到响应由AbortSignal丢弃；新请求不复用旧在途结果，500ms完成提示计时器可清理 |
| 错误/旧数据 | 请求失败显示真实错误和重试；按仍存在房间保留成功点集，新选择没有fetched时继续用原recent/current回退，不消失整张卡；显示当前房间标题与指标，不使用旧trend.room冒充新投影 |

## 测试、审查与修复

1. 首8项浏览器测试全部RED后实现：同页500点、原布局/选择顺序、时间轴/提示、精确数值、回退、缺失0提示、180ms合并、明暗/窄屏。另修改原clear断言，先复现成功重读不恢复live-first后修复。
2. 追加在途读测试，先复现同选择新重读仍只有1次请求，再取消旧Query，验证第二次400单点先返回后，第一批旧3点迟到不会覆盖。
3. 旧测试的“缺失热度断线”“新选房间失败就不显示卡片”“清空重读仍为空”不是原项目语义，已按原源码调整；错误测试现在验证同页仍显示趋势错误、事件页不显示该局部错误，没有删失败/删除/隔离断言。
4. fake clock到180ms时React仍需一次异步提交，测试保留179ms没有请求的严格断言，再条件等待提交；不是改变业务延迟。resize同样等待实际容器测量稳定，并返回越界元素定位，不放宽字体或溢出标准。
5. 截图检查发现旧`.live-chart-card p/span`的10px覆盖，新14px断言先失败再提高局部CSS选择器优先级；长名称超过两行的浏览器断言先失败再截断，保留完整title和可访问名称。
6. 独立只读审查实测生产默认staleTime=15000导致刷新仍3点，而夹具原staleTime=0掩盖缺陷；夹具改为生产freshness值（仅错误重试关闭），新增测试先RED后修复查询本身。另复现快切返回旧key在179ms前已请求，增加queued身份后通过。
7. 9项纯算法测试为实现后的补覆盖，不冒充RED/GREEN：回退/不可变输入、0与缺失、原高度、常值/小幅/大数/负值边界、时间padding、万亿阈值、时刻精度；共享粉丝轴算法及完整粉丝图表回归保持。
8. 独立复核无剩余Critical/Important，所报Minor快切合并问题也关闭。针对性6文件81项通过（直播趋势、直播Workspace、共用Widget、粉丝趋势和纯算法）。

## 视觉、技术适配与限制

frontend-design沿用既有樱花雾白token和字体，不引入新字体/视觉系统；Data visualization仅用于核对量纲、时间间距、独立轴提示和原始缺失解释。交付为现有纯客户端交互，不创建Data报告站点或业务HTTP服务。平滑SVG绘制沿用本地粉丝图表方式，移植原轴/格式/交互规则；没有声称Canvas/ECharts逐像素一致。

实际浏览器浅/深色和900/620/390px检查，截图位于D盘`.tools/temp/bmd-live-trend-{light,dark,narrow}.png`。图中为隔离测试数据，不是用户数据库或真人平台结果。Playwright/Vite仅随机测试端口，测试结束关闭；不把typed bridge夹具当原生Electron IPC或平台验收。

## 最终验证

完整命令：`. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`，退出0。Node636项（Contracts132、Storage19、Task3、Core241、Browser12、Realtime19、Desktop210），Python183项；TypeScript/mypy、Black/isort、Electron生产构建及D盘路径检查通过。相比基线新增20项（浏览器11、纯展示9）；全部测试仍执行，降低并发仅作用本次验证进程。

`git diff --check`通过；新增文件末尾空格扫描、生产fixture标记扫描均无命中，项目测试Node/Python/esbuild/Chromium进程数0。原仓库仍`fa2faa6`且干净。检查新文件时`git diff --no-index`的正常差异退出码1曾被误判为失败，未修改任何文件，随后用独立只读空白扫描确认。没有自动提交/推送、重新打包、启动原项目、访问真人平台/用户库或重启已安装客户端。

## 未完成项不变

- M08下一项为原loadAll对rooms/summary/events的原子赋值、错误状态与事件/汇总区。目前三个Query各自成功重读，趋势规范化跟随rooms成功；summary/events失败时的整体语义还不能视为与原loadAll等价。
- M08原数值域/边缘解析/配置、M11详情场次及同刻不同字符串判重启、M07真人/原生和M09–M18全量业务继续保留。趋势子项不是全部迁移完成。
