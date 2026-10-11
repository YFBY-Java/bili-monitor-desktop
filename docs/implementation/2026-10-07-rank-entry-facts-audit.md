# 榜单勋章身份、点亮状态与单条原文归档（2026-10-07）

## 原业务与本片范围

只读原 B/S `fa2faa6` 的 `BilibiliLiveRankApiClient.parseAudienceEntry/parseGuardEntry`、V8 DDL 和 `BilibiliLiveRankRepository.replaceEntries`。原项目保存 `medal_ruid`（signed64）、`medal_is_light`（Long.intValue 的 signed32）和 `raw_entry_json`（每条解析后 JSON 树，不是整个 HTTP 响应）。公开 EntryView 不返回三项，原 Repository 公开读出也不暴露实际单条原文，本片不新增 UI 或公开字段。

- Python 实际 fetch 生产路径新增三项事实及 JSONB 输入状态；保留原 medal 字段选择/firstPresent，不借用备用对象补字段。树序列化保留未知字段、精确整数、标量和数组，复用已有 JDK20 Double 文本算法；不改 HTTP 原字节 CAS。
- Fetched v2/portable schema/Python 验证新增可选归档字段；legacy wire 显式移除它们，公开 v2 summary/latest/refresh 仍只返回原公开字段。旧 parser 默认返回不变。
- Core.persist 接通实际 Worker → SQLite。追加 v18 可空列，历史未知保持 NULL；medal UID 用 INTEGER 精确保存、CAST TEXT 读取，点亮状态保持 signed32，raw JSON 文本按原编码/NUL 拒绝边界保存。
- 原 snapshot → DELETE → batch 三阶段独立提交不变。条目 JSONB 失败发生在 batch 内，成功 API 日志和原响应证据不回滚；存储异常不变成平台重试/备用请求。

本片 21 路径的真实 before 是公开数值 v3 已接受版本，位于 `.tools/temp/20261007-rank-entry-facts-before/manifest.json`；冻结为 `20261007-rank-entry-facts-review-v1.json/.diff`。只读复核 Critical/Important/Minor 均 0；主代理再次核对 21 当前 SHA256/字节数无漂移。仅接受本归档切片，不代表所有数值/JVM/JSONB 输入、完整榜单或全量迁移完成。

## 代表验证与失败诊断

没有新增测试文件或命名 case：扩展既有真实 HTTP Worker/Core/SQLite 数值流程、旧数据库升级、TS/Python 契约样例。共享 `rank-entry-facts.json` 包含 signed64 超安全整数/最小值、int32 转换、原主字段优先、未知字段、大整数/Double、标量/数组条目。

- 实际 Core 流程先 RED（缺少 medal_ruid），旧升级先 RED（schema17 不等于18）；实现后真实 Worker 保存五条归档事实，公开投影无新增字段，数据库重开保持。原 Core case 1 通过/8 过滤。
- Storage 7 文件78项、原 Contracts3项、原 Python6项、mypy22源及全 workspace TS 通过。首轮失败日志保留：Storage 旧版本夹具未清未来 migration 标记引发唯一键错误，只修夹具；契约样例沿用旧 number count，只改验证样例为 canonical string；旧 wire 验证改用真实 legacy 投影，不放宽生产 schema。
- 本片唯一一次标准 `check.cmd` session82158 已终态 **exit1**：Task3/Contracts511/Storage78/Realtime162/Browser12通过；Core1044通过/3失败。Subject501创建6752ms、最近弹幕501写入5260ms超原5秒，粉丝2004历史33733ms超原30秒。预算、并发、工作量和同步持久性未改；Desktop及后续未由该命令执行，不重复矩阵求绿。
- 当前 Desktop TS/Main/Preload/Core/Worker/Renderer 生产构建 exit0。实际生产 Electron 隔离验证 schema18，真实 Rank Worker/IPC、五条归档和重启保留、五业务页切换、单Core重启及正常退出自有PID无残留。首次验证仅因 SQLite 返回对象原型不同而断言失败；修验证脚本为普通对象后最终 session47238 exit0，数据断言保留，生产源未改。

日志均在 D 盘 `.tools/temp/20261007-rank-entry-facts-*`，最终采用 `core-green.log`、`storage-final.log`、`contracts-final.log`、`python-final.log`、`mypy.log`、`type.log`、`phase-check.log`、`build.log`、`production-final.log`。生产脚本为 `rank-entry-facts-production-smoke.mjs`，合成 HTTPS 边界，不访问真实平台、用户数据库或真实凭据；不是最新独立安装包、真人扫码或原生保存验收。

## 接续与未完成范围

公开数值片审计的“归档尚未实施”是该片收尾时的历史状态，由本片关闭，不再列作缺少功能。下一步先被动测量原三个规模失败的 SQL/提交/WAL 耗时，定位后再选择修复；不先改同步等级、合并原独立提交、放宽预算或删除用例。

工作台布局保存的原逐条提交/客户端原子替换选择仍未获回复；桌面历史异常、其他原业务兼容和真人/原生/最新安装包仍 OPEN。全量目标 active，原 B/S 只读；HEAD4c94959、累积工作区及空暂存区保持，无提交推送。
