# 平台单次采集失败结果（2026-10-07）

## 原业务与差量

只读原 B/S `fa2faa6` 的 `BilibiliPlatformAdapter.fetchAccount`、`BilibiliApiClient`、`FetchResult`、`CollectTaskExecutor` 和 `GlobalExceptionHandler`。原 adapter 只捕获数值输入错误及 `BilibiliFetchException`，保留平台错误文案、重试标志和风险分类；其它内部异常是请求失败，不是 `MANUAL_REVIEW` 采集结果。原通用执行器不自动重试、不创建粉丝监控，其余七个数据类型仍是 unsupported。

客户端改两个既有源：已知七类 Worker 平台错误保留原文案/分类，显式识别 UNKNOWN；转换、契约、未知 Worker 和一般内部异常不再伪装成平台结果。内部异常安全包装为 `INTERNAL_ERROR`，cause 仅留在 Core，Main/Preload 不传递堆栈、SQL 或路径。固定安全文案是遵循项目错误规则的客户端适配，不复刻原全局处理器直接公开内部 exception message 的风险。

## 验证与范围

- 复用唯一既有 Platform Core case，真实 Python NDJSON 流程只回放 HTTPS I/O。首次 RED 复现七个业务断言差异；安全包装再 RED 复现三个内部错误差异。最终 GREEN 一项、Core 类型及既有 Preload 一项通过，未新增命名 case/测试文件/fixture 或削减旧断言。
- 真实 Worker 七次请求全部 attempt1；验证风控原文、转换异常、HTTP503、API500与无监控创建。契约、schema、依赖和 Worker 生产路径在本片不变。
- 两源真实 before、v2 冻结/diff 在 `.tools/temp/20261007-platform-failure-*`。限定只读复核 Critical/Important/Minor 均0；主代理收尾再次核对当前 hash/字节2/2一致。此冻结只代表本片版本，不要求后续业务增量仍匹配旧 hash。
- 标准 `check.cmd` session3284 已终态 exit1：Task3、Contracts511、Storage78、Realtime162、Browser12通过；Core1044/1047，仍有 Subject501（8289ms/5s）、最近弹幕501（5303ms/5s）、粉丝历史2004（34800ms/30s）三个规模超时。Desktop和后续未由该命令执行，不冒称全套绿色。
- 当前生产 build session22391 exit0。实际生产 Electron 在 D盘独立 `.tools/temp/bmd-platform-production-1N5rWB`，真实 Main/Preload/Core/Python 验证上述失败边界、五业务页、schema18、重启及正常退出自有PID0，session63689 exit0。前两轮失败分别是脚本桥接名笔误和空列表 selector，不改生产代码或删除业务断言；失败日志保留。

最终日志：`20261007-platform-failure-{green-final,core-types-final,bridge-final,phase-check,build}.log` 和 `20261007-platform-failure-production-final-v2.log`。未使用真实平台/凭据或用户数据库；不是真人扫码、原生保存或最新独立安装包验收。

## 接续

本片关闭的是失败结果分类及内部错误出口，不是完整 M16。原失败响应内容仍未通过 Worker 返回，平台输入仍限制正数 ASCII MID；继续迁移这些实际差异。工作台布局保存事务选择、规模性能、桌面稳定性、其它兼容和真人/原生/安装验收保持 OPEN；原 B/S只读、HEAD/累积改动/空index保持，无提交推送。
