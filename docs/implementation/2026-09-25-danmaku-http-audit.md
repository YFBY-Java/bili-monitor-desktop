# 弹幕 HTTP 配置、请求存活与取消审计（2026-09-25）

## 范围和当前状态

用户要求“继续”后恢复迁移。客户端 HEAD `b2e5a89`，此前未提交的 Rank HTTP 增量完整保留；原 B/S HEAD `fa2faa6`、工作区干净，只读且未启动。本项针对 M08/M09 的 HTTP 消费者和必要生命周期，不代表全量弹幕业务迁移完成。

本项代码、独立只读复核和最终完整 `check.cmd` 均已完成，最终结果见收尾验证。未提交、推送、打包、重启安装应用或操作用户数据库。

## 原业务依据

原根目录 `D:\codex_work\BiliMonitor\social-data-monitor`：

- `backend/.../bilibili/live/config/BilibiliLiveMonitorProperties.java`：HTTP 默认 connect=5000ms、read=10000ms、原 UA、直播 Referer。
- `backend/.../live/danmaku/client/BilibiliLiveDanmuInfoClient.java`：DanmuInfo 使用上述四项配置。
- 同目录 `BilibiliAnonymousCookieProvider.java`、`BilibiliWbiSigner.java`：使用共同 connect/read/UA，但 Referer 固定为 `https://www.bilibili.com/`。
- 原读取超时是读取等待，不是整个请求总时长；0 不设置对应阶段期限。
- 本地参考库的 `docs/live/message_stream.md`、`docs/misc/buvid3_4.md`、`docs/misc/sign/wbi.md` 仅作接口资料，不代替当前平台实测。

## 本地实现

| 链路 | 实现和可验证结果 |
| --- | --- |
| 启动文件/env → Core | 复用已有16字段配置和四个原环境变量，默认弹幕源接收相同 HTTP 配置；不让 Renderer 传入任意地址/请求头 |
| Core → Realtime Worker | 共享 `BilibiliDanmakuWorkerStartSchema` 和 portable schema；可选 httpConfiguration 保持旧请求兼容，显式 null/注入/未知字段拒绝；输入错误不回显内容 |
| 三个 HTTP 请求 | 所有请求使用原默认/配置 UA；SPI/nav 固定首页 Referer，DanmuInfo 使用配置 Referer；缓存命中仍遵循原客户端已有缓存机制 |
| HTTP 期限 | `bilibili-http.ts` 用 Node HTTPS 独立管理连接期限和读取空闲期限，接收数据续读取期限；没有10秒总 AbortSignal，0仍可由AbortController取消 |
| HTTP 清理/安全 | 超时和取消销毁请求及响应；错误不回显Cookie/URL/body。支持 gzip/deflate/br，原始和解压结果均8MiB上限；HTTPS API主机/443白名单、最多20跳，跨origin移除Cookie/Authorization |
| 连接所有权 | manager 管理待连接和已连接状态；stop/stopAll/替换/退出均取消在途HTTP和认证，迟到连接关闭、不覆盖新连接；取消不再尝试下一个host/protocol |
| Core 手工停止 | 不排在任何房间的长start后；已连接房间、正在连接房间、尚排队的手工start均可停止。排队start立即返回取消，之后轮到也不启动；stop之后的新start不受旧取消标记影响 |
| Worker 存活 | start显式keepAlive才输出5秒存活帧；Core按id/type/connectionId匹配，帧不是成功结果；未应答时销毁Worker、拒绝所有在途请求，拒绝旧child的消息 |
| Main 存活 | 既有Core存活机制白名单加入 `bilibili-live.danmaku.start`，健康请求不会被固定90秒切断 |
| 有界请求 | Realtime transport start容量100，控制请求总容量120，饱和时保留有限stop/stopAll名额；manager最多100个连接/在途连接 |
| 父进程失联 | stdin关闭或stdout写入失败触发取消/退出；输出积压超过4MiB也终止，防止没有读者时无限积压 |

这里的连接阶段包含DNS/TCP/TLS；Java运行时对DNS和TLS阶段的具体计时边界不作逐字节等价保证。网络适配器使用有限体积/重定向安全边界，超限明确报错，不静默截断原始业务数据。依据：[Node request 超时](https://nodejs.org/api/http.html#requestsettimeouttimeout-callback)、[socket 空闲与0禁用语义](https://nodejs.org/api/net.html#socketsettimeouttimeout-callback)。

## 自动证据与实现过程

- 最初回归明确复现：WorkerSource不转发配置、三个请求仍用旧UA/Referer、Main start未opt-in；修复后原测试通过。
- 共享15组HTTP配置fixture由TypeScript与Python JSON Schema验证，另覆盖旧输入、null、额外URL、协议值和Cookie换行；这不是新增Python业务处理器。
- HTTP适配器、manager新文件首轮是模块尚不存在，不能算已复现旧业务失败；其后测试为新增行为覆盖。已明确区分，不把全部新增用例都描述为RED/GREEN。
- 连接测试复现取消输入仍实际连上；修复后补HTTP等待取消、WebSocket认证取消、既有Gift V2二进制/文本消费回归。
- 真实Core→NDJSON→独立Node进程→HTTP请求边界的磁盘/env两例先复现仍用默认UA/Referer，再修正默认源注入；业务解析、签名、管理器、Worker入口不替换，只有HTTPS/ws外部网络边界被合成响应替代。
- 真实Worker验证旧/false keepAlive没有额外帧、true时多帧仍在等待，stop返回取消且底层请求销毁；stdin关闭退出0、真实stdout读管道断开后退出1，均有请求destroy标记和PID消失断言。
- Realtime与Main虚拟时钟验证超过30/90秒的多个窗口仍等待真正业务结果；非法请求身份不续期、stop不能被alive续期；无响应销毁进程。
- 只读复核发现全局队列让房间A的stop受房间B长start阻塞。两项回归先失败，再修复所有手工stop绕开启动队列；又先复现排队start未立即结算，再用取消Promise和保留的队列标记修正。原登录联动/升级回归保持通过。
- 复核建议为stop预留容量，测试先复现饱和时stopAll进不了管道，修复为有界控制预留。无效重定向地址错误规范化也有单独RED/GREEN。
- 收尾补三种压缩、解压体积上限、同/跨origin重定向、Main长等待后的实际成功结果、同回合start/stop及随后重新start覆盖。UTF-8 BOM先复现原fetch可读而新适配器拒绝，再修正为读取前移除单个开头BOM。

## 未完成边界与下一项

- 未执行真人扫码、真实平台网络、已安装原生Electron/安装包验收；Main测试使用既有隔离替身，不冒充原生GUI验证。
- M09完整匿名回退顺序、缓存TTL配置、WBI编码、事件解析/去重/覆盖及所有弹幕配置仍按原台账继续；本轮只保留此前客户端的回退/缓存业务，不声称已逐项等价。
- M08 `storageEnabled`、原完整数值域/边缘解析、并发限流和API耗时定义仍未完成。下一独立项是跨直播/榜单/弹幕/场次的storageEnabled存储开关。
- 已只读定位下一项原 `@ConditionalOnProperty(... storage-enabled ...)` 涉及Controller、Repository、Service、Scheduler、Export/Insight等多个组件；不能直接脑补成“继续采集、只是不保存”。下一轮需逐个核对关闭时的接口可用性和依赖行为后再实施。
- M10–M18完整榜单、场次、导出、分析、用户工作台、抖音、适配器和最终验收范围不缩减。

## 收尾验证

- 最终完整 `check.cmd` 退出 0，仅本次进程设置 `VITEST_MAX_WORKERS=2`，所有测试执行：Node **853**（Contracts 199、Storage 19、Task 3、Core 326、Browser Worker 12、Realtime Worker 46、Desktop 248），Python **294**。
- 相比上次 Rank 子项的 Node 792 / Python 278，本项新增 Node 61 / Python 16；这包含补覆盖，不把全部新增用例都当作先失败再修复的证据。
- TypeScript、mypy、Black/isort、Electron 生产构建、D 盘路径检查通过。收尾补充压缩/BOM/重复启停边界后重新执行了整个检查，不沿用此前 Node 846 的第一轮结果。
- 独立只读复核已关闭队列阻塞、排队取消与控制容量问题，最终无剩余 Critical/Important；最后的 BOM 修正和本审计边界也已复核。
- `git diff --check`、新增文件行尾空白检查通过；最终 Realtime/Core 生产产物未发现本轮合成网络 fixture 标记，未发现本项目测试/Worker 残留进程。
- 原仓库仍为 `fa2faa6` 且工作区干净；客户端 HEAD 仍为 `b2e5a89`，暂存区为空，保留原有未提交 Rank 增量和本项改动。未提交或推送。
- 这只完成弹幕 HTTP/取消子项；下一项继续按原源码核对 `storageEnabled`，全量 M01–M18 目标及真人/原生验收仍未完成。
