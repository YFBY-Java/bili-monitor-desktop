# 榜单HTTP响应文本与内部异常传播迁移（2026-10-07）

## 原业务与实现范围

只读对照原B/S `fa2faa6` 的 `BilibiliLiveRankApiClient` 构造器/get方法，以及 `BilibiliLiveRankService.refresh/fetchKind/fetchWithLog`；先读取本地API资料 `docs/live/guard.md`。原三个服务捕获点均仅处理 `BilibiliFetchException`：平台失败可以记录日志、刷新WBI/回退或聚合部分失败；响应转换等内部异常应直接终止刷新。

响应String规则沿用[直播任务对应版本源码证据](2026-10-07-live-response-text-audit.md)：原Boot3.3.6/Framework6.1.15先验证响应头，再执行HTTP状态处理，成功后转换正文。没有启动或修改原项目，也没有新做JVM运行实验。

- 榜单三个端点复用已有共享转换器：显式charset优先，JSON默认UTF-8，其它/缺失类型默认Latin-1；替换解码作用于解析文本，CAS保留原始字节，成功空体仍为PARSE。
- 普通HTTP失败使用原 `Bilibili live rank HTTP <status> from <endpoint>` 文案，非429的4xx为UNKNOWN；非法响应头通过现有安全Worker错误返回，不输出上游正文、头或凭据。
- Core在失败日志入口前将转换错误映射INTERNAL_ERROR，绕过强制WBI/回退。刷新外层只聚合 `RankFetchFailure`，其它内部异常继续抛出；正常平台部分失败保持。
- 仅改六个既有文件：Rank Python客户端、Worker runtime、Core Rank service、现有Core配置集成测试、现有Python Rank测试及其HTTP夹具。没有schema/契约/UI/输入/分页/身份/分数/缓存/认证变更。
- 共享Node WBI/nav和Python nav没有纳入本项，仍OPEN；不据此声称完整M10已验收。

## 实施阶段验证记录

仅新增两个Python分组场景和一个实际Core/Node材料/Python/SQLite流程，复用已有用例，不铺矩阵、不运行阶段整套check。

1. Python初次执行包含一个请求字段缺失的测试设置错误，修正后两个行为RED分别复现Latin-1资料被替换、非法charset503错误优先级不符；实现后GREEN。
2. 实际Core流程先错误回退为成功；内部错误分支修正后仍被刷新外层聚合成正常“零成功、部分失败”。再次核对原三处仅捕获平台异常，沿同一测试确认精确拒绝RED，再补外层类型保护；未删除失败断言或新增测试项。
3. 最终Core两个文件8/8通过；Python新旧共34/34通过。实际流程包含八表逐行不变、CAS原字节保留、后续有效刷新、停机后只读重开；使用合成响应，无真实平台/用户库。
4. Core类型、两个生产Python源mypy、四文件Black/isort及最终Desktop web/node类型与生产构建均exit0。最初3个Core配置流程GREEN早于外层修正，最终8项覆盖修正后版本，不混用旧结果。
5. 新D盘 `.tools/temp/bmd-production-final-spIalG` 实际Main/Preload/Renderer/Core ready/schema16、精确Live/Subject桥接、真实平台注册表、单Core启动/重启与正常退出通过，自有PID残留0；首Core PID57176、重启PID13568。自动采集/OAuth关闭，不代表目录包、真人或原生安装验收。

## 限定审查与本次记录核对

独立只读审查通过，无可操作Critical/Important/Minor。复核原三处异常捕获、Worker安全错误、Core不记日志/回退及正常平台部分结果保持；审查者未运行测试/构建，执行结果由主代理提供。

任务前快照488个源路径/3,935,363字节，冻结差量6路径/34,426字节，材料在D盘 `.tools/temp/20261007-rank-response-text-{before,brief.md,review-v1.txt}` 及清单。用户要求记录进度时重新核对：6个源码SHA256与冻结清单一致，其余482源无漂移，原B/S/API库干净只读，暂存区为空，TEMP/TMP在项目D盘，项目进程0。

本次记录没有重复测试/构建或修改业务代码。当前功能已收尾，按用户此前要求暂停，不开始下一功能；正式状态见[交接快照](2026-09-13-migration-handoff.md#当前进度快照2026-10-07)。完整迁移、共享nav、其它字段/配置/JSONB/部分提交兼容、阶段回归/历史问题、性能、当前目录包及真人/原生验收仍未完成。无提交推送、安装或全局记忆写入。
