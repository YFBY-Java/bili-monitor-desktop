# 直播场次识别与恢复（2026-10-06）

## 本次完成

对照原 `BilibiliLiveSessionBoundaryService.java` 的 Instant 比较、已有场次恢复，以及 Repository 的身份/时间区间查找规则，客户端不再用 ISO 字符串拼写判断是否换场。同一个开播时间的 UTC、时区偏移和不同小数位表示复用同一场次；真正的纳秒差异仍视为新开播时间。

REST 和 LIVE 信号均可恢复已有关闭场次；事件归属、较旧信号保护、结束边界和最近观察时间按时间点比较。平台时间和事件时间查找兼容旧记录，同时间候选按原最新写入优先。无新数据库版本或采集协议。

SQLite 原起止时间约束按文本比较。正常 INSERT/UPDATE 仅将 `started_at`、`ended_at` 写成固定九位小数 UTC，使文本顺序等于时间顺序。身份字段、唯一键和其它时钟不改；不批量重写、合并或删除历史记录。

实现位于 `packages/core-runtime/src/bilibili-live-session-service.ts`、`packages/storage/src/control-database.ts` 和复用的 `bilibili-live-snapshot-values.ts`。

## 关键验证

仅新增两个代表性场景：同刻 REST/LIVE 复用与事件归属/同秒结束；已有场次恢复与真实新开播区分。复用两项原场次业务用例，共四项通过。真实 Core/SQLite 配合合成事件执行，不访问平台或用户数据库。SQLite 约束失败在同一个用例复现后修复，限定只读审查已关闭该 P1。

最终 Core/Storage 类型检查和桌面生产构建退出 0。未运行完整历史套件，旧整体回归缺口保留；这不代表 M11 或全部迁移完成。

## 下一完整功能

M11 数据中心查询与页面，对照原 `BilibiliLiveSessionQueryRepository.java` 和 `frontend/src/views/data/DataCenterView.vue`：

- 事件最新优先分页，汇总/用户统计不受客户端前 100,000 条事实截断影响。
- 筛选草稿用 Enter/按钮提交，页大小 25/50/100；同场次查询失败保留成功结果，事件和用户独立加载。
- 展示已有覆盖/连接/未解析互动与付费信息、事件数量、用户礼物和付费事件数，不增加臆造采集能力。

已实现的事件类型/关键词/UID/付费过滤、用户聚合、未知 UID、空场次和十秒刷新复用，不重做。每个功能仅补少量关键验证，阶段收尾再全量回归。

原 B/S 和 API 参考只读，临时数据及构建在 D 盘。没有提交、推送、安装或操作用户真实凭据。
