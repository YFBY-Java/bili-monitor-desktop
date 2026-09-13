# M08 直播房间监控操作区审计

## 基线与范围

- 原仓库 `D:\codex_work\BiliMonitor`：`fa2faa6`，只读、不启动。
- 客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`：基线 `2896d1b`（上一轮生命周期已按用户要求提交）。本轮不自动提交/推送。
- 原依据 `social-data-monitor/frontend/src/views/bilibili-live/BilibiliLiveView.vue`：room-strip/room-detail、normalizeSelection、syncIntervalDrafts、submitAdd/saveInterval、collectProgress/nextCollectBrief/statusText、liveDurationText/missingFieldItems。
- 本轮是M08房间监控操作区，不是所有直播UI或完整迁移。没有修改业务契约、Core、Worker、数据库和原项目。

## 已适配行为

| 原操作/事实 | 客户端实现与证据 |
| --- | --- |
| 房间横向列表 | 原生按钮承载展开区域；Enter/Space切换详情，外链与趋势按钮独立，不触发展开。保留全部房间，既有505间回归仍执行 |
| 首次、重读、添加 | 默认展开首房；主动收起保留至下一成功重读；失效选择回退首房。添加/重复添加按返回的canonical房间ID展开，不假设最后一行 |
| 房间详情 | 封面先keyframe再cover；头像与图片加载失败有回退。展示UID、长/短房号、分区、标题；八字段包括在线、关注、开播时间/时长、最后成功、下次采集、来源与退避到期 |
| 状态/错误/完整性 | 暂停→异常→LIVE/轮播/未开播；仅有错误类型也显示“采集失败”。头像、封面、分区、在线、关注、标题、开播时间健康按原规则判断，0不当缺失，离线不要求开播时间 |
| 采集节奏 | 单一1000ms展示计时器；暂停进度0、异常100、未排程0，lastSnapshot优先lastSuccess，二者都无时按间隔回退；4%最小进度和向上取整秒/分/时/天。不写快照或触发采集 |
| 间隔草稿 | Workspace按房间ID保存草稿，跨收起/切房/页签保留；非脏值跟随本地持久值重读，脏值不被后台刷新覆盖，成功保存/删除清理；失败保留。小于120秒提示短间隔 |
| 范围/步进 | 四舍五入并夹取1..2592000，当前值对应步长1/60/300/3600；显式spinbutton语义与键盘相对加减。没有原生number基于min的错误步进或滚轮误编辑 |
| 原有命令与共用数据 | 保留立即刷新、暂停/恢复、删除确认及各房间忙碌锁/错误；共享弹幕/观众/大航海部件仍按房间ID隔离，切换和收起回归保留 |

可见状态取现有共享DTO，没有增加服务端、模拟业务或Renderer数据库访问。原页面的单页布局适配为现有客户端页签，草稿留在Workspace是为了切页签不丢失。继续沿用现有React局部状态约定，不另装状态库；这不是对项目状态管理规则的全局改写。

## 测试与审查过程

- 首6项浏览器回归全部先失败：默认详情、事实/健康、计时、草稿、范围、添加锁定。实现后通过。计时测试最初把模拟时钟安装在已挂载计时器之后，改为固定Date、保留实际每秒计时器；断言10秒→9秒→待采集及59分钟→1小时，不发起refresh。
- 独立只读审查发现原生`min=1/step=60`导致300按上键变301，实际组件回归先RED后修复；继续发现隐藏微调仍有滚轮300→301，再加RED并改为`type=text/inputMode=numeric/role=spinbutton`，补ARIA最小/最大/当前值与上下键处理，保留滚动与焦点。
- 长连续名称/分区导致共享标题溢出先RED后修复；局部CSS不覆盖共享部件的链接样式。1440/900/620/390窗口宽度均检查容器无横向溢出。
- 补8项纯展示边界覆盖与1项重复添加canonical房间覆盖；这些为实现后的补覆盖，不冒充新的RED/GREEN。
- 测试使用真实React组件/TanStack Query，通过测试专用typed bridge隔离外部业务依赖；不把它称为真人平台或原生Electron IPC验收。所有Vite随机端口/Chromium测试结束后关闭。
- 独立复审：键盘边界、滚轮与焦点、ARIA及长文本换行通过，无剩余Critical/Important。
- 更新旧路由测试：加载提示不再硬编码过时的SQLite v6；仍验证本地直播入口、页签、加载态和无演示/Agent导航。
- 完整检查第一轮仅旧SQLite v6文案断言失败，其他189项Desktop测试通过；同步断言后，第二轮esbuild出现`cannot allocate memory`，继发EPIPE/浏览器加载失败（不是新增业务断言失败）。等待该检查退出并确认项目测试进程全部消失后，检查本地Vitest已支持`VITEST_MAX_WORKERS`，以进程级`VITEST_MAX_WORKERS=2`重新执行完整`check.cmd`；不修改系统/依赖/测试集，不关闭其他应用。

## 视觉与客户端适配

frontend-design只用于遵循已有樱花雾白token、清晰层次和可访问操作；没有更换全局主题或增加装饰性面板。监控区辅助字14px、标题18/20px、数值22px；详情宽屏四列、窄屏双列，预览换行；样式只作用于监控区。

实际浏览器截图在D盘 `.tools/temp/bmd-live-monitor-light.png`、`bmd-live-monitor-dark.png`、`bmd-live-monitor-narrow.png`；不提交截图或合成运行数据。截图夹具显式设置主题背景与页面滚动，避免脱离真实桌面外壳时出现黑色透底和截图裁切。

## 最终验证

```powershell
. .\scripts\activate-environment.ps1
$env:VITEST_MAX_WORKERS = '2'
.\check.cmd
```

完整命令退出0：Node616（Contracts132、Storage19、Task3、Core241、Browser12、Realtime19、Desktop190），Python183；TypeScript/mypy、Black/isort、Electron生产构建与D盘路径检查通过。相比基线新增18项（浏览器10、纯展示8），既有测试没有跳过。

`git diff --check`通过；生产输出未检出新增夹具标记；项目测试Node/Python/esbuild/Chromium进程数为0；原仓库仍`fa2faa6`且干净。本轮没有提交/推送、安装包重建、应用重启或真人平台验收。降低并发仅作用于这次验证进程，常规`check.cmd`配置没有改写。

## 后续差异仍保留

1. M08趋势原1/2/3/4布局、选择顺序、交互坐标轴/提示、点集回退、刷新时机与清空后重读规范化仍需迁移；目前趋势测试里“清空后重读仍为空”“missing heat断线”是既有客户端行为，不能当原项目等价证据。原LiveView `chartValues` 对缺值显示0、原查询最近500点；需要连同共享TrendChart逐项审核，不改变持久化null事实。
2. 原loadAll同时读取rooms/summary/events后的赋值、最近事件汇总、事件主播名称/相对时间及其他表单细节需要后续M08实现；当前拆分Query状态不冒充原完整语义。
3. 详情内原LiveSessionPanel在M11，不能把已接入共享弹幕部件当成场次区域完成；场次同刻不同字符串判重启问题仍保留。
4. M08完整数值域/边缘解析/配置，M07真人/原生及M09–M18继续逐项迁移和验收。未启动/修改原Web，不访问用户数据库或凭据，不重新打包/重启安装客户端。
