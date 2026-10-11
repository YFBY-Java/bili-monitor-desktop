# Python 资料与错误消息数字文本迁移（2026-10-07）

本子项已实现并通过有限自动验收、独立任务复查和最终生产构建/启停；全量迁移仍未完成，继续下一项，不暂停。不提交或推送代码，原 B/S 与 API 参考库保持只读。

## 原业务与实现

对照原 `BilibiliApiClient` / `BilibiliLiveApiClient` 的 `JsonNode.asText(null)`、空白判断和各自错误消息路径，在 Python 内新增纯标准库 `java_scalar_text` / `jdk20_double_text`。字符串原样保留，bool 先于 int 并输出小写，int 十进制，float 使用精确有理数距离/even tie 和既有 Node 转换器的 JDK20 观测格式；null/容器返回缺失，由调用方维持原 fallback。

共享转换接入三个独立入口：Follower 资料、Follower 错误消息、Live 资料/错误消息。不改计数、ID、状态、时间、错误分类、重试、回退、URL/长度契约、持久化结构或 UI；没有新 RPC、JVM/Node 格式化子进程、依赖或服务端。

负浮点零保留 `-0.0`，浮点整数保留 `.0`；十进制阶小于 -3 或至少 7 使用大写 E、无指数加号。repr 只提供最短精度和 anchor：p=1 最多 5×99 个候选，p≥2 最多五个 exponent 的 floor/ceil 候选，roundtrip 后用精确距离和偶数规则选择；工作量不随原响应 token 长度增长。

## 验证与实际结果

暂停前已观察三轮实际 RED：真实 Worker/Core/SQLite 把 `1e7` 保存成 `10000000.0`，Follower/Live 独立错误消息把 `0.0001` 保持为 `0.0001`。恢复后沿用原差异证据与已落盘代码，不重新开发或重复 RED。

- 新增一条真实 Worker→NDJSON→Source→Core→SQLite 连续流程：资料为 `1.0E7` / `-0.0`；下一次 -101 数字错误消息为 `1.0E-4`；错误/monitor/API 元数据正确，历史/计数/资料保持，没有重试/relation 请求；关闭重开仍保留。最终该项 exit0。既有资料/原文 14 项已通过，新项修正期间没有重复整个文件。
- 共用 14 个原数字 token 字符串的 Node golden exit0；Python 定向 70 项 exit0，涵盖原文/blank/标量、资料及独立 message、负零、非法 JSON literal 和有限 Live 入口。过滤用例不计通过；没有全指数/BMP/JVM/随机矩阵。
- Core 与 Node 类型检查分别 exit0；Python 四个生产源 mypy、七个相关文件 Black/isort 最终均 exit0。早期 Black 提示三文件格式需要调整后仅机械格式化；新测试对既有 SQLite bigint 和 Core 错误前缀的预期错误已修正，不是修改生产计数/错误行为来求通过。
- 独立 10 路径任务差量复查：Spec compliant / Task quality Approved；Critical、Important、Minor 均无。复查核对了精确候选/距离/even、三入口及真实持久化证据，没有重跑套件。前置 Live 任务已先审阅冻结；此项不代表所有 JVM 或全量迁移通过。
- root 最终 `pnpm --filter @bmd/desktop build` exit0，包含 Desktop 两套 tsc 和生产 Main/Preload/Renderer/Core 构建。
- root 实际生产客户端启动检查 exit0：独立 D 盘 `.tools/temp/bmd-production-final-FXqJNf`，ready/schema16、真实平台注册表、Live v2 精确零值、Subject v3 桥接存在、启动/重启各一 Core，正常退出后记录 PID 残留 0。自动平台采集/OAuth 关闭；未访问用户库/真实凭据。这不是独立安装目录包或真人业务验收。

root 首次启动脚本错误地把分页列表预期成数组，exit1；读取共享 `items/total/snapshotAt` 契约后仅修验证脚本，再在新隔离目录通过，业务源码未改。不隐藏该失败，也不将旧 Live 启停结果作为本项结果。

## 冻结与交接

真实任务前 483 个源文件中只有声明的 7 个既有路径变化，另有 3 个新文件，共 10 个实现/测试文件。最终报告、审阅包及当前文件的 SHA256 全部一致，限定空白检查 exit0。客户端 HEAD `4c94959` / `codex/follower-monitor-actions`、空暂存区保持；工具/数据/构建均在 D 盘，无 Git 写入或原库改动。

完整命令、RED/GREEN、失败预期纠正及冻结 hash 在 D 盘 `.tools/temp/20261007-python-scalar-text-report.md`；同前缀 brief/design/before/review-package/review 保存任务范围、真实快照和复查记录。临时材料不随 Git 提交，本审计保留可交接结论。

继续处理 NDJSON 最终帧的请求类型、trace/correlation 及可选 causation 归属。本文只关闭普通 binary64 标量文本子域：原 pom target17 不证明实际 JVM runtime17，也不保证所有 Java 版本一致；增长率负零数值 wire、Live URL/长度域、病理长浮点/recycler、TEXT/JSONB、charset/HTTP 顺序和其他独立边界仍待核对。阶段完整回归/历史失败、大数据性能、最新目录包和真人/原生验收保持开放。
