# 平台 account 单次采集输入（2026-10-07）

## 原规则与实现

原 B/S `fa2faa6` 的 `BilibiliPlatformAdapter.fetchAccount` 对原始字符串调用 `Long.parseLong`，不 trim：允许 ASCII 正负符号、前导零及已有 JDK20 基线的 BMP Character.digit 十进制字符，接受完整 signed64 范围，包括0和负数；小数、溢出、空白及补充平面数字不接受。是否合法 B站账号由 card 响应决定，不在通用 adapter 预先套用监控的正数域。本地 API参考 `docs/user/info.md` 用户名片章节说明 card 的 mid 参数；它不是当前平台协议或真人请求验证。

Core 复用已有 `parseJavaDecimalLong`，把原输入精确转换为 canonical signed64 字符串，再发一个 card 请求；输入解析失败保持原 PARSE_ERROR/LOW/不可重试结果且不调用 Worker。通用采集页面不再使用粉丝监控 normalize，而是原样发送文本；粉丝添加的用户确认输入规则不改。

新增共享 `BilibiliPlatformAccountFetchRequestV1` 和 NDJSON `bilibili.platform.fetch-account.v1`，响应/错误复用现有 v2 精确 DTO 与失败证据。Python 独立请求模型不继承正数 validator；TS/Python 的能力和 HTTP 保活名单都接新方法。Source 只在 PlatformService 显式传 `platform-account` purpose 时使用新请求，普通 card/relation/profile 仍用原请求并校验原正数域。复用同一 Worker/HTTP/CAS/取消生命周期，不新增服务端、实例或数据库 migration，不放宽已发布 v1/v2 监控契约。

## 验证与复核

- 复用唯一既有真实 Core/Python/NDJSON case，四个原有效输入全部被拒，实际 RED12个业务断言后 GREEN。验证全角+前导零、负数、MIN_LONG和负零，检查精确请求/返回；非法输入不发请求，既有错误/证据/unsupported/无监控/普通粉丝opt-out断言保留。相关三个既有 Core 文件最终9项通过。
- 复用唯一既有真实 UI 流程，负数被拦截、bridge调用0次实际 RED；修复后原样传 `-0001`、显示结果及原失败/页面恢复路径通过。没有新增命名 case、测试文件或提高15秒预算。
- 同一小共享 `platform-account-inputs.json` 在 Core、TS/Python/portable 校验中使用；既有 Contracts1（42过滤未执行）和Python raw1通过，旧请求仍拒绝0/负数。全workspace TS、mypy23个源、四个改动Python格式各有通过记录。
- v1只读复核发现 Important：原 capability 精确测试遗漏平台新方法。实际原case RED 后只同步严格整列表，并按真实 Runtime 补前片已有的 Rank v2 漏项；不改生产、不算新 Rank 修复、不放宽等式。最终既有 raw/capabilities/旧正数拒绝10项及格式通过。
- true-before 与 v1/v2 manifest/diff 位于 `.tools/temp/20261007-platform-mid-*`。最终15路径143844字节，主代理当前hash/大小15/15匹配；相对v1仅上述Python测试改变。v2限定复审 Critical/Important/Minor 均0，旧Important闭合；冻结仅代表本片收尾版本。
- 标准阶段 `check.cmd` session84193终态exit1：Task3、Contracts511、Storage78、Realtime162、Browser12通过；Core1043/1047。Subject501 6335ms/5s、最近弹幕501 5141ms/5s、粉丝历史2004 35637ms/30s及此前间歇的弹幕101容量6243ms/5s超时。Desktop及后续未由此命令执行；没有改预算、并发、持久性或工作量，也未再次重跑整套求绿。标准阶段在最后capability测试同步前，生产源与最终相同；该测试由最终10项另行覆盖。
- 当前Desktop类型与全部生产bundle构建 session22107 exit0。实际生产 smoke session3345 exit0，D盘 `.tools/temp/bmd-platform-production-NDrpJa`、schema18、Core25824→63712：真实 Main/Preload/Core/Python 精确输入/错误/证据、真实采集页面负数输入与空白失败、五业务页、Core重启后精确MIN_LONG与证据保留、无监控创建、正常退出自有PID0。仅回放HTTPS，不访问平台/用户库/真实凭据；不是独立安装包/真人/原生验收。

日志：同前缀 `core-red`、`ui-red`、`core-green`、`contract-green`、`python-green`、`ui-green`、`types`、`mypy`、`core-final`、`phase-check`、`capabilities-red`、`python-final-v2`、`build`、`production.log`，失败记录保留。

## 当前队列

本片关闭通用 account 的 signed 输入差异，[失败结果](2026-10-07-platform-failure-result-audit.md)及[失败证据](2026-10-07-platform-failure-evidence-audit.md)的限定成果保持。原七类 unsupported 不扩成新业务；不凭这三个切片标完整M16或全量迁移完成。接续当前生产目录包与实际内置Worker验收、剩余业务兼容/布局策略及规模/桌面稳定性；真人扫码/授权/获准目标、原生保存复制和安装验收仍需完成。

原B/S只读，全部新文件/数据在D盘，客户端HEAD `4c94959` / `codex/follower-monitor-actions`及累积未提交改动保留，未提交推送或改全局记忆。当前bundle已更新；旧schema16目录包不包含本片和后续源码，不能作为最新交付。
