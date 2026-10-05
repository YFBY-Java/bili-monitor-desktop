# M08 HTTP 配置与请求存活：提交检查点

后续状态：榜单及其 WBI 配置、真实 Python 输出管道断开后的取消/退出，已在 [榜单 HTTP 后续审计](2026-09-13-rank-http-audit.md) 完成。本文以下仍保留 `b2e5a89` 提交时的历史范围和测试证据，不表示原生 Electron/真人平台验收完成。

本次按用户“提交代码”保存当前迁移增量，不表示 M08 或全量迁移完成。不启动原 B/S、不重启已安装客户端、不访问真实平台或用户数据库，不推送远程。

## 本次代码范围

- 保留并提交上一批八项采集策略、可取消的长等待及回归测试，详见 `2026-09-13-live-collection-policy-audit.md`。
- 四个直播 REST 端点接入 `connectTimeoutMs`、`readTimeoutMs`、`userAgent`、`referer`。使用同一 D 盘只读配置文件及原环境变量别名，不扩大 Worker 环境透传权限。
- 缺省值分别为 5000、10000、`SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)` 和 `https://live.bilibili.com/`。超时取 0 表示关闭对应 HTTPX 阶段超时，不把连接与读取之和当成总耗时预算。请求头只接受受支持的 ASCII/制表符值，拒绝换行和非 ASCII；不声称与所有 Spring 字符编码行为等价。
- 旧 Worker 请求不要求 `httpConfiguration`。`keepAlive` 是可选协议字段；仅列入白名单的直播请求启用。每 5 秒的存活帧不代表业务结果或采集进展；接收方校验请求 id、type、traceId、correlationId 后续期无响应看门狗。
- Python 单执行通道的有效存活也为排队直播请求续期。无有效消息超时会终止 Worker；Core 长请求无有效存活则由宿主终止。停止、最终响应或失败清理对应计时器。

## 提交前修正与测试边界

- 完整检查先复现默认值断言未包含四个新增字段；补齐精确期望，没有放宽断言。
- Python portable Schema 回归复现 `local\n` 请求头被接受：正则 `$` 在该验证器中可匹配末尾换行前的位置。改为禁止非法字符的 `not/pattern`，两份 portable Schema 一起修正；同一 TS/Python 夹具保持一致。
- HTTP/存活 Python 针对性测试 36 项通过，包含四个端点实际 HTTPX 请求的超时扩展和请求头、协议兼容、输出失败取消协程；网络边界使用合成响应。
- Core 配置测试通过实际 Python 子进程传输合成 HTTP 响应；宿主测试通过 Node Worker 适配器运行实际 Core 入口。长于 35/90 秒的存活、错误关联帧和清理使用虚拟时钟回归；这些不等同于原生 Electron 长连接实机验收。

## 保留的后续工作

- 真正关闭操作系统输出管道后的 Python 子进程退出集成验收仍待补充；当前有写入失败取消的协程回归，不能用它声称已完成真实管道断开验证。
- Rank、WBI、匿名 Cookie、弹幕信息的其他 HTTP 消费者尚未接入这四项配置。
- storageEnabled、完整原解析域、并发限流和 API 耗时定义仍在 M08 待办；M07 原生/真人验收及 M09–M18 继续保留。
- 本文记录提交检查点；原实现计划中未完成的验收项不因提交而自动勾选。

## 本次完整验证

提交前执行 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd`，退出码 0：Node 781（Contracts 183、Storage 19、Task 3、Core 307、Browser 12、Realtime 19、Desktop 238），Python 247；TypeScript/mypy、Black/isort（30 文件）、Electron 生产构建和 D 盘路径检查通过。

独立只读复核未发现本批新增 HTTP/请求存活改动的 Critical/Important 问题。未将模拟管道失败或 Node Worker 适配器验证描述成真实 Electron/操作系统管道断开验收。原 B/S 在提交前仍为 `fa2faa6` 且工作区干净。
