# 榜单公开数值链路与历史兼容（2026-10-07）

## 原业务与实现范围

只读原 `BilibiliLiveRankApiClient.parseLong/parseInteger`、V8 SQL、Repository、Service 与原榜单组件：Long 是 signed64，Integer 是 Long.intValue 的 signed32；响应 UID 可以为 0/负数，不套请求房间 ID 的正数规则。文本数字去逗号、不 trim；原端点/字段选择、风控/WBI/备用规则及三阶段保存不变。

- 追加 Rank v2 TS/Python/portable 契约；count/score/响应 UID 使用精确十进制字符串，五个 Integer 字段使用 signed32。v1 契约不改。
- 实际 Python → NDJSON → Core → SQLite → Main/Preload → Renderer 都接 v2；生产 Worker Source 请求 `bilibili.live.rank.fetch.v2`。公开接口为 `bilibiliLiveRankV2.summary/latest/refresh`，缓存按 v2 隔离。
- SQLite 追加 v17，去除原客户端误加的正数 CHECK；保留历史行、rowid、索引、触发器、FK 和证据。count/score 写 INTEGER、CAST TEXT 读出；UID 仍为 canonical TEXT，不能混称相同物理类型。
- UI 用 BigInt 比较、格式化及精确提示；分数只差 1 的超安全整数能正确排序。旧 number 出口不返回舍入值，超域明确拒绝。

## 审阅发现与修复

v1 审阅发现旧 v16 可合法保存 `rankNo=4294967298` 等超 int32 值；v17 原样保留后，新 v2 schema 令新旧出口同时失败。扩展同一个既有 Core case 实际 RED，再修复为：旧 summary/latest/refresh 保留旧安全宽整数，新出口使用原 Java int 语义，数据库原值不改。

v2 审阅进一步发现排序/LIMIT 早于转换：历史值 4294967298（应转换为 2）和 3，limit=1 会错取 3。同一个 case 再 RED；最终把五个字段转换移到 SQL SELECT，ORDER/LIMIT 使用转换后的 rankNo，Core 去重之前已得到正确值。旧查询默认不转换，不全量读出或放宽条数。

v3 43 源文件 hash/字节与真实 before→current 差量重新核验一致；限定只读复核 C0/I0/Minor0，两个历史兼容问题闭合。此结论不是全量榜单、M01–M18 或发布验收。

## 验证与证据

本片只新增一个真实 Worker/Core/SQLite 数值主流程和一个旧数据库升级用例；其余契约、Python、Main/Preload、SSR、浏览器用例扩展已有 case，不扩矩阵。所有证据在项目 D 盘 `.tools/temp/20261007-rank-long64-*`。

- 原数值流程先被旧 wire、再被旧 SQLite CHECK 拒绝；最终实际 Worker/Core/SQLite 主流程通过，重启保留、API 日志、原始 CAS/hash 和 signed64 存储已验证。
- 最终历史兼容 Core 文件 5 项通过、升级 case 1 项通过；同一排序反例有 RED→GREEN。Storage/Core 类型检查 exit0。
- 原契约 3 项、Python 原 6 项、mypy 21 源、Main/Preload 及 SSR 3 项、既有实际浏览器榜单流程各自通过；历史证据保留各自运行版本，不累加重复执行次数。
- v3 标准 `check.cmd` 终态 **exit1**：Task3、Contracts511、Storage78、Realtime162、Browser12 通过；Core1044通过/3失败。Subject501 创建6115ms、最近弹幕501写入5015ms超原5秒，粉丝2004查询33253ms超原30秒。未改变预算、并发或同步持久性。Desktop 及后续阶段未由此命令执行，不宣称整套绿色。
- v3 当前 Desktop TS 与全部生产 bundle 构建 exit0。隔离实际生产 Electron 验证见 `20261007-rank-long64-history-production.log`：schema17、Rank精确真实Worker桥接、五业务页面、单Core重启保留、正常退出自有PID无残留；合成 HTTPS 边界，不使用用户库或真实凭据，不等同独立安装包/真人验收。

首次生产验证的 Worker 替身被 Main 启动配置覆盖，观众榜走原备用接口；失败日志保留，不当作成功。纠正验证入口后，只替换下一次真实 Core fork 的 HTTPS 边界，实际 Main/Preload/Core/Worker/SQLite 不替换业务处理器。

## 后续真实缺口

接续更新：以下归档缺口已由[榜单勋章与条目原文归档](2026-10-07-rank-entry-facts-audit.md)的v18切片关闭。下段保留本数值片收尾时状态，不作为当前待做项；最新阶段失败/生产版本见接续审计。

原 V8/Parser/Repository 还保存 `medal_ruid`、`medal_is_light`、`raw_entry_json`，当前客户端缺失；公开 DTO 本身不返回这三项，不能为了迁移新增 UI。下一片单独追加存储/抓取事实，历史未知不猜测补齐。本片只关闭公开数值与已发现历史读出兼容，不关闭这个缺口。

布局失败提交策略、既有性能/桌面异常、其它原业务边界、真人授权/原生保存/最新安装包仍 OPEN。原 B/S 不改，客户端 HEAD4c94959、累积工作区与空暂存区保持，无提交推送。
