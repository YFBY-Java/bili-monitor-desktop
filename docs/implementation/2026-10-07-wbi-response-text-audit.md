# 共享 WBI/nav 响应文本与失败日志迁移（2026-10-07）

## 范围与结论

本切片已完成限定实现与收尾验收，不代表完整 M09/M10 或全量迁移完成。原 B/S `fa2faa6` 和 API 资料库 `271b123` 只读；客户端 HEAD `4c94959`、分支 `codex/follower-monitor-actions`，未提交推送。只使用现有 TypeScript/Python、本地 Core/SQLite/NDJSON，不新增业务服务端、依赖、数据库迁移或原生编译工具。

先读取本地 API 资料 `docs/misc/sign/wbi.md`、`docs/login/login_info.md`，再对照原 `BilibiliWbiSigner.fetchKeys/getKeys` 与 Rank `fetchWithLog`。资料用于定位，不作为现行实网协议或访问授权证明。

## 实现

- Node HTTP 增加内部显式 String 转换选项，仅 WBI/nav 开启；Python nav 复用已迁移解码器。先校验 MIME/charset，再分类 HTTP 失败，成功后解码/解析；保留 JSON UTF-8、缺省 Latin-1、有限显式字符集和替换解码行为。
- 响应头转换错误以固定安全 `BILIBILI_RESPONSE_CONVERSION_ERROR`/不可重试返回，不回传响应头、正文或密钥。Core 映射内部错误，绕过平台失败日志、强制 WBI、备用端点和假部分成功返回。
- nav 普通 HTTP 失败按原 UNKNOWN/可重试/原消息处理，保留安全白名单 nav 端点、100–599 状态码和布尔 retryable；旧 Worker 帧仍兼容。nav 保持匿名、主页 Referer；成功解析后才替换缓存，失败强刷不清掉已有成功缓存。
- 修复独立审查发现的日志问题：Core 仅在异常端点精确等于 `x/web-interface/nav` 时优先使用它，其余保持原请求端点选择。不接收任意上游端点文本。

## 有限验证与修复过程

只新增 Python 和真实 Core 各一个业务流程，复用既有用例，不铺编码/HTTP 矩阵。

1. 前轮最终 Python 两项、Node21项、Core5项及相关类型/格式通过。其源码未被本次日志修复改变；这些保留为前轮结果，不写成新完整检查。
2. v1只读审查发现 Important 1：nav 403失败被记到榜单端点。按原 Java 修正真实 Core 测试期望后，本次再次实际 RED：期望 nav，实得 `queryContributionRank`。
3. Core 最小修复后同一实际 Node/Python/Core/SQLite 流程 GREEN：1通过、3过滤未运行；Core类型检查exit0。流程保留内部错误拒绝、八表不变、失败日志、成功恢复、缓存保持、CAS原字节及停止后只读重开断言。
4. v2限定复查通过：Critical 0 / Important 0 / Minor 0。12个当前文件的SHA256/字节匹配；v1中其余10个文件不变，改动只有Core日志选择和测试期望。
5. 本次修复后 Desktop web/node类型与全部生产bundle构建exit0。新D盘 `.tools/temp/bmd-production-final-jOhL4a` 实际生产 Main/Preload/Renderer/Core：schema16、精确Live桥接、Subject v3、真实平台注册表、单Core重启、正常退出，自有PID残留0。自动平台/OAuth关闭，无用户库或真实凭据；不是安装包/真人验收。

任务前488源中12个声明路径含一个新增解码器；其余477源仅旧Storage bigint断言在另一项中修正，剩余476保持。该测试修正不混入WBI审查或生产行为。

## WBI收尾时的独立阶段检查修正（历史结果）

前轮一次完整 `check.cmd` 终态exit1，Task3/Contracts510通过，Storage76通过/1失败；旧测试期待Number `200`，实际已迁精确计数为 `200n`。本轮只同步 `control-database.test.ts` 一处期望，原用例定点GREEN 1通过/31未运行；生产计数、schema和其他断言不变。

原完整检查失败日志保留，后续Core/Desktop/Python/类型/构建阶段当时未执行。WBI收尾时没有重跑整套check；不能用该定点修正或单独构建关闭完整阶段检查、历史桌面异常退出/Worker启动/趋势超时。之后SPI/DanmuInfo切片完成并执行了一次阶段check：Storage77全部通过，但Core12项失败及2个未处理错误、后续未执行阶段仍开放，最新结果见[弹幕响应与阶段审计](2026-10-07-danmaku-response-text-audit.md)。

## 证据与接续

D盘临时证据（不随Git提交）：

- `20261007-wbi-response-text-before/manifest.json`、`20261007-wbi-response-text-brief.md`；v1/v2 `.txt`与`.txt.manifest.json`。
- `20261007-wbi-nav-endpoint-{red,green}.log`、`20261007-wbi-response-text-build.log`、`20261007-wbi-response-text-production-smoke.log`。
- `20261007-http-phase-check.log`、`20261007-storage-bigint-expectation-before.test.ts`及`20261007-storage-bigint-expectation-green.log`。

本文与总台账/交接文档保存WBI收尾时的持久结论，临时材料不是唯一交接入口。后续SPI/DanmuInfo限定String响应切片已完成，见上述新审计；后续修改了两个同名源文件，本文v2 hash仅对应WBI收尾版本。完整Java字符集/别名集、nav/SPI/DanmuInfo普通API字段/错误解析及其他字段/配置、JSONB/部分提交、性能/崩溃边界、最新schema16独立目录包与真人/原生验收仍开放。当前停止点及下次队列以交接快照为准，不重做已完成响应切片。少量关键验证，完整回归留阶段收尾；不自动提交推送、安装或访问真实平台。
