# 功能缺口复核与榜单配置迁移（2026-10-11）

## 当前基线与范围

- 原 B/S：`D:\codex_work\BiliMonitor`，HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，本轮只读、未启动。
- 客户端：`D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `4c94959f81033eee544211cfce29a18c84fd602f`，保留开始时384项累积工作区变更；未提交、未推送。
- 用户本轮重新要求核对缺口并继续迁移，覆盖10月7日的暂停指令。不是全量迁移完成声明。
- 原 Controller、路由和当前共享 Preload/Core 入口重新核对；原业务语义继续以源码为准，不新增业务 HTTP 服务、外部数据库或 C/Rust 工具链。所有运行产物在 D 盘。

## 功能面与剩余事项

| 原业务 | 客户端当前情况 | 尚未关闭的事项 |
| --- | --- | --- |
| 粉丝监控、B站登录 | 有业务服务、Worker、SQLite与UI入口 | 登录启动配置仍未完整接入；真人扫码/凭据原生验收；大批量历史流程性能 |
| 直播监控、弹幕与观众/大航海榜 | 主流程和历史保存已有实现 | 本轮补齐榜单6项配置；其他完整兼容与授权真实房间验收 |
| 场次、数据中心、分析、CSV/XLSX/ZIP | 合并在直播页签，不是缺少业务页面 | 原生保存/导出、完整公式边界及真人数据验收 |
| 用户监控/工作台 | 绑定、聚合、趋势、健康和布局后端已接 | 批量性能；原布局失败时部分提交与客户端整体回滚的策略选择仍未得到用户答复 |
| 抖音 Web/OAuth 登录态 | 代码链路与客户端入口已有实现 | 真人二维码/挑战/OAuth、原生复制导出验收 |
| 平台注册表与单次采集 | account真实采集及unsupported返回已有实现 | 实际平台验收；其余7种能力原项目也返回unsupported，不擅自实现 |

原 `TasksView.vue` 只有2条固定Mock数据，“创建任务”没有处理逻辑；`AiAnalysisView.vue` 为Mock/预留；`IdentityView.vue`为未来模块；`SettingsView.vue`为Placeholder；`SystemController.overview`直接返回固定统计/趋势。它们不列成漏迁的真实功能，不恢复虚假可用菜单。JWT/服务端端口不作为纯客户端运行前提。

确认的下一条业务缺口：`BilibiliAuthProperties` 的 enabled、qrExpireSeconds、pollIntervalMs、sessionCleanupDelayMs、HTTP connect/request timeout、User-Agent和Referer未完整贯穿客户端启动配置。Core构造Auth未传这些配置，Python Auth仍固定5/10秒HTTP超时。原 `refreshCheckIntervalHours` 暂未查到业务消费者，不据属性名字新增自动刷新任务；原服务端加密密钥配置应与客户端已有OS保护方案区分，不直接迁移明文密钥。

## 本轮完成：榜单6项启动配置

原依据：`BilibiliLiveRankProperties.java`、`BilibiliLiveRankService.java`、`BilibiliLiveRankController.java`、`BilibiliLiveRankApiClient.java`与`application.yml`。本地API资料核对`D:\codex_work\bilibili-API-collect-new\docs\live\guard.md`，仅作历史接口参考，没有调整线上协议或访问真实平台。

- 增加只读 `config/bilibili-live-rank.json`；源码示例为 `config/bilibili-live-rank.example.json`。
- 6字段：enabled=true、pageSize=50、guardPageSize=30、maxPages=1、requestMinIntervalMs=1500、webLocation="444.8"。
- 规范 `APP_BILIBILI_LIVEMONITOR_RANK_<字段去连字符大写>` 优先于原6个`SOCIAL_MONITOR_BILIBILI_LIVE_RANK_*`别名，其次文件和默认值。复用现有属性查询、占位符、Boolean/int32转换。
- 原primitive enabled必须绑定；组件可用性按原raw ConditionalOnProperty：不trim的false关闭。关闭榜单不关闭直播、不删除历史；直播storage关闭优先既有storage错误。
- 配置非法在打开数据库/Worker前返回安全 `BILIBILI_LIVE_RANK_CONFIG_INVALID`；rank关闭返回 `BILIBILI_LIVE_RANK_DISABLED`，不返回假空成功。
- 默认页数在Core消费时限制1..5；显式请求页数优先，Main/Preload共享Schema不再提前填1。无配置时仍抓1页，原显式请求边界不变。
- audience每页1..100、guard1..30、在线fallback最多50；请求间隔至少0。配置int32原值保留至消费端，不在配置层错误拒绝负值。
- webLocation经Core→共享Worker请求→Python严格模型→实际WBI签名HTTP参数。新增Worker字段可选，旧请求仍默认444.8；v1/v2 portable Schema同步。
- 复核发现文件字符串直接嵌入placeholder fallback会改写`x}y`；既有case真实RED复现`xy}`，改为先选择配置来源再展开，未改共享旧解析器。
- 未新增数据库migration、依赖、业务菜单或平台请求；schema仍18。

## 验证与边界

新增命名case仅4个：Core2、Contracts1、Python1。其余复用原验证，不扩矩阵。

- 初始RED：Core抓2次而不是配置要求的4次、忽略非法配置；Contracts提前default1；Python拒绝新webLocation。
- 最终定向：Core3文件17项通过；Contracts4项；PythonRank7项；Main Router/Preload2文件12项。旧Preload提前填1断言实际失败后按新省略语义修正，其他断言不改。
- 修复复核字符串问题后Core17项再次通过，最终workspace typecheck与生产build通过；Python Black/isort通过、mypy23源通过。
- 单次标准`check.cmd`：session44385终态exit1。Task3、Contracts514、Storage78、Realtime162、Browser12通过；Core1048/1050，失败仍为原Subject501对象6383ms>5s及粉丝2004历史33869ms>30s。Desktop及之后阶段未由这次check执行。没有提高预算、减少数据、降低并发或改变持久性求绿。
- 该全量check运行于最后loader文字边界修复前；修复后以定向验证/类型/构建/生产IPC作为本切片证据，不重复全量检查或宣称整套绿色。
- 当前生产Main/Renderer/Preload/Core隔离IPC：规范env关闭榜单胜过相反旧alias；直播列表仍可读；Core重启后启用榜单（错误从关闭变为不存在房间）；配置文件字节保持、退出自有Main/Core PID0。无用户数据/真实平台/凭据访问。首次临时脚本写错API分组，不计为功能失败或成功证据；修为`bilibiliLiveRankV2.summary`后exit0。最后loader修复后的新构建和生产检查均exit0，最终`20261011-rank-config-production-v2.log`、隔离目录`bmd-rank-configuration-production-ImCGUB`，Core25384→10496，remainingPids=[]。
- 限定只读复核：初次C0/I0/Minor1；上述问题实际复现修复后C0/I0/Minor0。没有全面复审历史384项改动。
- 未更新独立目录包/NSIS，旧目录包不代表本轮源代码；真人扫码、原生剪贴板/保存/安装、大数据和冷启动稳定性仍OPEN。

证据位于`.tools/temp/20261011-rank-config-*.log`；生产脚本`.tools/temp/rank-configuration-production-smoke.mjs`仅使用新建D盘隔离目录。

下一业务优先B站登录启动配置。剩余事项按上表与主台账继续，不把本轮榜单配置完成等同全部迁移结束。
