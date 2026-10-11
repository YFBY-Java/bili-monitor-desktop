# 榜单与弹幕共享材料迁移（2026-10-06）

## 已实现

默认客户端的榜单和弹幕使用同一个 Node Realtime Worker 的 WBI provider；Buvid 供全部弹幕房间共享。两种材料各自串行获取，普通读取先检查缓存、进入锁后再次检查；强刷逐调用执行，失败保留旧缓存并允许下一等待者重试。成功完成后按原 floor300/配置 TTL 发布；clear 不额外引入版本隔离。

弹幕每个协议候选、每次两层回退入口重新读取 Core 当前 ACTIVE 登录态。AUTH_EXPIRED 转匿名并强刷 WBI，风控清空 WBI/Buvid；外层风控只再重试一次完整链路，可重新使用已切换的账号。Core/Worker 仅通过关联 start/request/connection 的窄消息传递凭据，不向 Renderer、日志或持久化缓存暴露 Cookie。

Python Rank 使用 Node 返回的 keys 签名，不再在默认桌面路径自行请求 nav；其旧缓存仅保留为独立 Worker 兼容路径。在线金榜、大航海及原 RankService 的回退顺序不变。材料请求有 keep-alive 与取消；Rank stop 只关闭所拥有的 Python Worker，Core 关闭共享 Node owner。迟到结果不会再发起 Python 请求或回复凭据。

原业务依据（只读）：`BilibiliWbiSigner.java`、`BilibiliAnonymousCookieProvider.java`、`BilibiliLiveDanmuInfoClient.java`、`BilibiliLiveRankApiClient.java`，位于原 `D:/codex_work/BiliMonitor/social-data-monitor/backend/`。历史 API 文档仅作参考。

## 最小验证与范围

仅新增三个代表场景：共享缓存的并发/失败/强刷；完整 A→匿名→B→匿名及协议重读；实际 NDJSON Worker 的共享、凭据握手和取消。新业务断言先 RED 后 GREEN。复用现有 Rank source、Python Rank 和两条 Core HTTP 配置用例，没有新矩阵。合成 HTTPS/Python 网络边界下执行生产代码，不访问真实平台或用户凭据。

Core/Contracts/Realtime 类型检查、相关 Python 格式/类型及一次桌面生产构建通过；限定功能只读审查没有 Critical/Important 阻断。验证夹具直接构建当前 Worker 源码到 D 盘临时目录，不依赖旧 out 文件。

最终检查：客户端 HEAD `4c94959`/原分支/空 index 保持；138 个未提交路径（132 个既有路径与本轮新增路径共同保留）。原 B/S 与 API 参考仓库均干净且 HEAD 不变，相关运行进程已退出；6 个构建入口存在且非空，diff 空白检查通过，TEMP/数据目录位于 D 盘。未进行累计增量哈希复审或完整测试。

一次误加参数分隔符的命令带出了历史套件，已中止。旧 Rank HTTP 夹具缺少共享 Node 接线的问题已在原两例中修复并复验；该中止运行显示的 scheduler/upgrade/gift ingestion/auto-target 失败未在本轮诊断或宣称修好。此前整体检查与真人/原生/安装缺口也仍保留，不能据此宣布全套通过。

## 后续

按[完整迁移台账](2026-09-13-full-migration-tracker.md)继续 M09 的其它生命周期时间、解析、覆盖窗口及 M01–M18 未完成业务。每次迁通一个完整功能，只验证主流程和关键异常，完整回归放在阶段收尾。原项目只读、输出 D 盘；本轮未提交、推送或安装。
