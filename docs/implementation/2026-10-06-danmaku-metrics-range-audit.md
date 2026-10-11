# 弹幕指标时间范围迁移（2026-10-06）

原依据（只读）：`BilibiliLiveDanmakuController.java:54-59`、`BilibiliLiveDanmakuService.java:59,228-233,545-563`、`BilibiliLiveDanmakuRepository.java:249-267`，位于 `D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/danmaku/`。

## 已实现

契约不再提前正则拒绝或 JS trim；保留范围原文，省略/null 默认1h。Core按原Java规则解析外围ASCII控制空白、正负号、前导零及BMP十进制数字，用BigInt保留Long64精度。无效输入、Long溢出及Duration乘法溢出回退1h；有效非正数按至少1单位处理。

日期减法越界独立报错，不混入解析回退。固定+08原最小日期边界按OpenJDK源码推导；Java合法但下界早于JS Date.min时，只省略对合法持久桶恒真的下界谓词，不夹窗口或伪造PostgreSQL存储限制。正常窗口仍保持时间闭区间、房间隔离、最新2000后升序。未改变分桶/保留策略、UI、数据库版本或Python生产代码。

## 最小验证

仅2个新Core业务用例和1个共享契约fixture，先RED后GREEN；复用既有portable schema对齐。最终Core2、Contracts2、Python1定点通过，28项未选中不计通过。验证使用实际LocalCore/SQLite和合成平台源，非真人/原生验收。Contracts/Core/Storage类型检查及主代理一次生产构建均退出0。

8路径冻结差量只读审查通过，无Critical/Important或需阻断的Minor；未要求扩大测试量。最终117个无关增量及8个冻结SHA一致，原B/S/API干净、HEAD/空index保持；D盘环境与6个实际非空bundle、项目进程/监听0、diff空白检查通过。未运行完整历史套件或追加矩阵，旧整体验证失败/缺口仍保留，不代表完整M09或全量迁移完成。

## 后续

继续原M09事实写入时间、共享缓存/同步双检/fallback等，再按[全量台账](2026-09-13-full-migration-tracker.md)推进其它业务。全M01–M18、真人/原生/安装验收仍open，goal active。原B/S/API只读、所有工程输出D盘、旧增量保留；未提交推送、安装或访问用户真实配置/数据库/凭据。
