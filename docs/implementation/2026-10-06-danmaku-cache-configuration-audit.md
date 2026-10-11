# WBI / Buvid 缓存时长迁移（2026-10-06）

本轮已接通原配置及弹幕、榜单的实际消费者。只新增 3 个代表性测试，新旧定点共执行 10 项通过；没有重复全历史回归。27 路径任务增量审查 Spec / Task quality PASS，无需修复，不代表 M09 或完整迁移完成。

## 原业务与实现

原 B/S `D:/codex_work/BiliMonitor` 为只读基线 `fa2faa6`。对照 Properties、application.yml、WbiSigner、AnonymousCookieProvider、DanmuInfoClient 与 RankApiClient；API 资料库仅作历史参考，无真实平台请求。

- `wbiCacheSeconds`、`buvidCacheSeconds` 均保留原 signed32 值，默认 43200 秒；只在成功解析后的缓存发布点消费至少 300 秒，到期相等也重取。
- 完整启动配置 11 → 13 项。独立可选 `cacheConfiguration` 贯通 loader → Core → Service/Source → NDJSON → Manager → Node；旧五字段连接配置和旧启动调用保持兼容。
- 登录过期回退匿名时保留有效 Buvid、强刷 WBI；风控才清两项。nav 不发送登录 Cookie，getDanmuInfo 的登录 Cookie 不变。Node 发布前检查取消，不添加测试 reset IPC。
- 原共享 WBI 属性同样用于榜单：Core 默认 RankSource → 直接 `wbiCacheSeconds` Worker 字段 → Python 严格整数模型 → 实际 WBI 获取。Python 不再写死一小时，也不从请求开始计算 TTL。

配置文件位于实际数据目录 `config/bilibili-live-danmaku.json`，只读加载、重启生效；[示例](../../config/bilibili-live-danmaku.example.json)已补两项。规范环境名 `APP_BILIBILI_LIVEMONITOR_DANMAKU_WBICACHESECONDS` / `APP_BILIBILI_LIVEMONITOR_DANMAKU_BUVIDCACHESECONDS` 优先于原别名 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WBI_CACHE_SECONDS` / `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUVID_CACHE_SECONDS`，再优先于文件。沿用原 numeric binder，不将 raw 配置提前钳制。

## 验证范围

仅新增三个命名用例：Node 两房复用/独立过期/成功后 TTL、Node 登录过期与风控刷新、Python Rank 的 TTL/floor/force。分别先复现实际行为差异再修正；初次 Node 夹具引用错误已修正后重新得到预期业务 RED，原记录保留。

GREEN 共执行 10 项：Node 3、Python 1、Contracts 1、Core 5；其中 7 项复用并补配置透传断言，包括真实 Core → 合成 Python Worker。定点选择未执行其余 120 个 TS 用例，不计作通过。三包类型检查、三个 Python 修改文件的 Black/isort 均 exit0。Main 唯一生产构建会话 35866 终态 exit0 / `CACHE_BUILD_EXIT=0`，生成 Main/Core/Realtime/Browser/preload CJS/renderer。独立审查逐一核对 27 路径与冻结哈希，不重跑验证；Spec / Task quality PASS，无 Critical / Important / 待处理 Minor。

没有 root/check.cmd、完整 touched-file suite、全历史 pytest、mypy、额外诊断矩阵或累计 dirty 分支审查。证据见 `.tmp/2026-10-06-danmaku-cache-implementation-report.md`、`*-build.log`、`*-frozen.json` 与 `*-task-review.md`。

## 保留差异与下一步

缓存时长迁移不等于全缓存架构等价：原 Java 跨弹幕/Rank 的共享单例，客户端仍是 Node/Python 独立进程缓存；原同步双检、完整多段风控回退重新 LOGIN 仍未迁移。本轮不重建跨 Worker 缓存服务。

原 15 项配置余 `bucketSeconds`、`listenProbeSeconds`；原 probe 没有消费者，不臆造监听任务。Node 额外 100 容量、其他 M09、完整 M01–M18、旧全量验证缺口、真人/原生/安装仍未完成。阶段收尾再全量检查，不用本轮局部绿色撤销历史失败。

原 B/S/API 仓库只读，全部旧修改保留，项目工具/临时数据/产物在 D 盘；未提交推送、安装、启动原项目或访问用户实际数据库/凭据。目标保持 active。最终工作区/冻结/环境/产物/进程核验见 `.tmp/2026-10-06-danmaku-cache-final-safety.json`。
