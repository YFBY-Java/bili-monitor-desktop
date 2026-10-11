# 平台单次采集失败响应归档（2026-10-07）

## 原业务与客户端实现

对照原只读 B/S `fa2faa6` 的 `BilibiliPlatformAdapter.fetchAccount`、`BilibiliApiClient`、`BilibiliFetchException` 和 `FetchResult`：平台采集失败除分类、文案、风险和重试标志，还带有已经取得的响应内容；网络失败没有响应。原通用 Raw/Log/checkpoint 服务是空实现，本次不据此新增自动重试或监控。

通用 account 调用显式开启 `captureFailureEvidence`。Python 在原 HTTP/API/解析失败处保留实际 HTTPX 响应字节和首个 Content-Type，使用原 CAS 保存，NDJSON、Core 和公开结果只传共享 typed ObjectRef。TS/Python/portable Schema 使用同一 golden 样例，不向 UI 内联原文；响应转换及 CAS 写入等内部错误仍安全拒绝请求，不伪装平台失败。普通粉丝、profile 和旧 v1 默认不增加失败 CAS；成功归档路径不变。

这是本地安全适配：保存取得的响应字节，不声称复刻原 Java decoded String 在所有 charset 下的结果。没有改 schema18、历史数据、调度、重试、监控创建或依赖。

## 有限验证与复核

- 复用既有 Core 实际 Python/NDJSON 流程，三处失败证据引用原为 NULL，实际 RED 后 GREEN；检查文件正文、SHA-256、长度、非内联和普通粉丝 opt-out。最终相关两个既有文件8项通过。没有新增命名测试用例或矩阵。
- 复用既有 TS portable 及 Python raw-jsonb 流程：新请求/错误共享契约 RED→GREEN；实际 HTML503 的媒体类型错误再次 RED 后修复。最终 Python1、Contracts1（42项过滤未执行）、Contracts/Core/全workspace类型、mypy22个源及改动Python格式各有通过记录。
- 收尾发现新样例误加进旧平台 strict root。完整旧 root 校验实际 RED：`failureEvidence` 是禁止的额外属性。移到独立 `fixtures/follower-failure-evidence.json` 后 GREEN；旧平台 fixture 恢复任务前字节，旧 schema 完全不改。两个原测试读同一新文件，原断言不删、校验不放宽；最终 v2 Contracts1/Python1、格式和 Contracts 类型 exit0。
- true-before、v1/v2 差量与 manifest 位于 D盘 `.tools/temp/20261007-platform-failure-evidence-*`。最终13路径153462字节，当前 hash/大小13/13匹配；v2限定只读复核 Critical/Important/Minor 均0。冻结只代表本片收尾版本，不要求随后独立迁移修改的同名文件保持旧 hash。
- 标准阶段 `check.cmd` session48412 终态 exit1：Task3、Contracts511、Storage78、Realtime162、Browser12通过；Core1044/1047，仍是 Subject501、最近弹幕501、粉丝历史2004 三个既有规模超时，Desktop及后续未由此命令执行。没有放宽预算/并发/持久性或重跑整套求绿。该阶段加载的是样例移位前测试；最终移位另由上述定向验证覆盖，生产源码没有改变。
- 当前 Desktop 类型与全部生产 bundle 构建 session45468 exit0。实际生产 smoke session50441 exit0，隔离目录 `.tools/temp/bmd-platform-production-U6AHHi`、schema18、Core60964→54296：真实 Main/Preload/Core/Python 的三类失败证据文件核对、五业务页、Core重启后相同引用与内容、无监控创建、正常退出自有PID0。只回放 HTTPS I/O，不使用平台/用户库/真实凭据；不是最新独立安装包或真人/原生验收。

日志：同前缀 `red`、`contract-red`、`python-media-red`、`core-final`、`types`、`mypy`、`phase-check`、`build`、`fixture-root-red-compact`、`fixture-root-green`、`contract-final-v2`、`python-final-v2` 和 `production.log`。失败记录保留。

## 接续

本片关闭失败响应证据链，不是完整 M16。平台原 `Long.parseLong` 的 signed64/BMP数字输入仍未迁，继续该业务；已发布粉丝监控的正数请求不扩大。布局保存策略、规模性能/桌面稳定性、其他兼容、真人/原生和最新安装验收仍 OPEN。没有提交推送、启动/编辑原项目或更新全局记忆。
