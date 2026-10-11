# 直播热度、关注数精确迁移与暂停交接（2026-10-07）

当前功能已完成。按用户“迁移完这个功能就先停止”的要求，到此收尾；不启动下一功能。全量迁移尚未完成，未提交或推送代码。

## 原业务与实现

原 B/S `D:\codex_work\BiliMonitor` 保持 `fa2faa6` 干净只读。对照原直播计数解析、在线汇总的 `LongStream.sum`、Long 差值及工作台历史峰值规则，实现同一个端到端功能，而非只迁移解析器。

- Python 使用四个显式 Live v2 采集路由；热度、关注数转成精确十进制字符串，端点校验通过后再归档原响应。身份、直播状态、时间等独立数值域未扩大。
- Core/SQLite 以 signed64 bigint/INTEGER 保存房间、快照、状态事件计数；定时采集走精确链路。汇总和差值保留原 Java Long 的有符号溢出规则，null 不伪装成已采集值。
- Main/Preload/Renderer 接 Live v2、Subject v3；通信使用字符串、不传 bigint。工作台峰值只取有效历史，历史为空才回退当前值。图表保留相邻大整数差异、键盘提示和负值显示。
- 旧 Live v1、Subject v1/v2 契约保持原类型；安全值可正常投影，超出安全数值域返回 `LONG64_LEGACY_PRECISION_UNSUPPORTED`。旧响应投影失败不回滚此前已成功保存的采集事实。
- 修复复查发现的任意布局 JSON 误转换：只投影声明的 summary/liveRoom/trend points，layout.position/settings 原样保存返回。长轴标签按内容预留空间；汇总及两处差值补精确 title/aria，保留普通数值的简写和粉白主题。

无数据库空迁移、历史数据重写、CSS 改动、依赖安装或新服务端。当前仓库未发现独立的计数 outbox topic 消费者；新计数事件为 v2，旧历史不改。这不是未知外部消费者的兼容保证。

## 当前验证与审查

复用真实 Python/NDJSON/Core/SQLite 合成流程，验证相邻 `9007199254740992`、`9007199254740993`、signed64 边界、差值、原始证据字节与重开保留。另有旧库升级、窄桥接、契约及既有 UI 定点覆盖；没有每功能全量 `check.cmd` 或扩测试矩阵。

审查的一项 Important 和三项 Minor 均已修复：真实布局流程 RED→GREEN；实际浏览器验证两组轴标签边界、相邻点及键盘提示；精确可访问值和 EOF 检查通过。独立复查为 Spec compliant / Quality Approved，无当前任务未关闭问题。只审核本片真实任务前差量，不代表全分支或全量迁移验收。

- 修复后独立 Core/Desktop 类型检查通过。此前实施报告中，合并 PowerShell 单元的最后 exit 0 不能单独证明每条类型命令通过；报告已明确撤回那项推断，以当前独立结果为准。
- root 最终 `pnpm --filter @bmd/desktop build` exit 0，包含两套 Desktop tsc 检查与生产 Main/Preload/Renderer/Core 构建。
- root 实际生产客户端检查 exit 0：独立 D 盘 `.tools/temp/bmd-production-final-XGdKas`，schema16、真实平台注册表、Live v2 精确零值和 Subject v3 桥接存在，启动/重启各一个 Core，正常退出后记录 PID 残留 0。桥接存在不等同本检查验证了真实平台数据。
- 最终 431 个任务前源文件与 62 个本片冻结路径核验：无本片以外源文件漂移、冻结 hash 无变化、限定空白检查通过。客户端仍为 `4c94959` / `codex/follower-monitor-actions`，暂存区为空；原 B/S/API 参考库仍干净，运行环境及新数据/构建均在 D 盘。

复现材料保留于 D 盘 `.tools/temp/`：`20261007-live-long64-report.md`、`20261007-live-long64-rereview.md`、`20261007-live-long64-before/manifest.json`、`20261007-live-long64-rereview-package.txt` 及 manifest。

## 停止点与恢复入口

本功能已收尾，不再派发普通 Python Double 文本、NDJSON 最终帧关联、PG TEXT 或下一业务。后续须由用户明确恢复，再读[总台账](2026-09-13-full-migration-tracker.md)与[交接](2026-09-13-migration-handoff.md)，不要重派已经完成的导出、Rank 夹具或 Live Long64。

仍开放：其他独立数值/编码/配置/数据库边界、阶段全量回归及历史检查问题、性能与阻塞 SQL/文件写入、最新目录包、真人扫码/允许采集目标与原生保存/安装验收。只读设计不算实现；没有真实平台、用户数据库、凭据或原生对话框验收声明。
