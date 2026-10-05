# 榜单 HTTP 配置与请求生命周期审计

## 边界与依据

本轮客户端基线 `b2e5a89`；原项目 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，仅只读对照，未启动。执行计划：`docs/superpowers/plans/2026-09-13-rank-http-configuration.md`。用户要求完成当前功能后结束，因此不开始弹幕 HTTP 或其他下一业务，不提交/推送本轮增量。

原路径以 `social-data-monitor/backend/src/main/java/com/socialmonitor/` 为根：

- `bilibili/live/rank/client/BilibiliLiveRankApiClient.java:48–63,418–423`：榜单三个端点的 connect/read/UA/Referer 均取直播配置。
- `bilibili/live/danmaku/client/BilibiliWbiSigner.java:47–59,213–217`：WBI nav 的 Referer 固定首页，另外三项取直播配置；不能把自定义直播 Referer 用在 nav。
- `bilibili/live/rank/service/BilibiliLiveRankService.java:94–191`：逐类型逐页采集、风控强制刷新 WBI、在线贡献榜备用接口路径。此次 HTTP 接入保持上述现有调用顺序；完整 Rank 业务复审仍是 M10，不能由本次测试代替。
- `bilibili/live/danmaku/client/BilibiliLiveDanmuInfoClient.java`、`BilibiliAnonymousCookieProvider.java`：已只读确认下一消费者链的来源；Node 弹幕实现本轮未修改。

## 已完成的配置链

实际数据目录 `config/bilibili-live-collection.json` 的四个已有字段以及原同名环境别名，现传入 REST 和 Rank 两个 Source；没有另建配置、数据库、服务端或任意请求头入口。

| 请求 | connect/read/UA | Referer |
| --- | --- | --- |
| `queryContributionRank` | 直播配置 | 直播配置 |
| `getOnlineGoldRank`（备用） | 直播配置 | 直播配置 |
| `topListNew` | 直播配置 | 直播配置 |
| Rank 依赖的 `x/web-interface/nav` | 直播配置 | 固定 `https://www.bilibili.com/` |

默认 connect=5000ms、read=10000ms、UA=`SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)`；配置 0 关闭对应 HTTPX 阶段超时。继续使用固定端点，不增加 Cookie/Authorization 透传。共享 HTTP 头值限制（ASCII/制表符、禁止换行）不变，未声称完整 Spring 绑定/编码等价。

Worker 请求追加可选 `httpConfiguration`；Zod、portable JSON Schema、Pydantic 使用共享配置夹具。旧请求省略时采用默认值，序列化不额外输出 null；显式 null 仍拒绝。新增 portable Schema 中的其他既有榜单字段不构成完整原数值/解析域已迁移的证明。

## 健康长请求与停止

- `bilibili.live.rank.fetch` / `bilibili-live.ranks.refresh` 纳入既有显式 opt-in 存活白名单。有效存活帧延长无响应看门狗，不作为业务结果；旧调用方未传 keepAlive 或传 false 时只收到原业务响应。
- 真实慢 HTTP 响应耗时 8 秒，传输看门狗设为 7 秒；开启存活后返回真实解析结果。虚拟时钟另覆盖超过 90 秒多个窗口的宿主请求。
- 真实 Python 子进程的父端 stdout 管道关闭后，下一个存活写入失败，活动 HTTP 协程执行取消清理，子进程非零退出。REST room-init 和 rank 两条路径均有实际进程验证，不是只用模拟输出对象。
- 原客户端 Rank stop 只停止 Source，不检查迟到响应。新增回归先复现 SQLite 关闭后继续写入的 `ERR_INVALID_STATE`，以及其他 Worker 停止前 Rank 未被通知。现 Rank 立即 Abort，采集入口、await 后、异常/fallback 分支及分页循环均检查 `CORE_STOPPED`；取消限流 timer，不继续备用、下页或其他榜单。
- Core 同时发起采集服务停止，包含 Rank，再等待关闭数据库。迟到成功/失败均不新增榜单快照或 API 日志。退出不是平台采集失败。

## 回归证据

- Task 1 首次 RED：共享 TS 5 项/Python 17 项失败，原因是请求不支持 HTTP 配置、仍使用旧默认/超时；真实 Core 配置 2 项失败定位到实际 HTTPX 收到旧 UA。实现后这些测试通过。
- Task 2 首次 RED：Core 4 项退出测试与 Worker 1 项存活测试失败；Desktop 2 项失败定位到 rank 尚未启用存活；真实进程 2 项失败分别为 7 秒提前超时与没有存活帧。已有 REST 管道断开测试首次即通过，属于补验证，不冒充修复。
- 额外旧调用兼容和 rank 生产输出存活测试为补覆盖，不冒充 RED。
- 真实 Core→Python 配置测试覆盖磁盘/环境两种来源、观众/WBI/大航海与在线贡献榜备用接口、SQLite 读回及配置文件字节不变。所有平台输入为合成响应，测试不使用用户凭据或数据。

## 仍未完成的业务

1. Node 弹幕连接的 DanmuInfo、SPI、WBI HTTP 配置及对应分阶段超时/取消链。当前 Node 仍是固定 UA 和 10 秒 AbortSignal 总期限。
2. M08 storageEnabled、完整原解析域、严格并发限流与 API duration 定义。
3. M10 完整榜单参数/默认/错误分类/缓存/签名编码/查询与 UI 一一对照；本次只完成 HTTP 配置、存活及必要退出边界。
4. 原生 Electron/安装包、真人平台与登录授权验收；Node Worker 适配器和真实 Python 管道验证不替代这些。
5. 全量 M01–M18 台账未删减；本次不标记全量完成。

## 收尾验证与停止

完整 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd` 退出 0：

- Node **792** 项：Contracts 183、Storage 19、Task 3、Core 316、Browser 12、Realtime 19、Desktop 240；较本轮基线新增 11 项。
- Python **278** 项，较基线新增 31 项；TypeScript、mypy、Black/isort（33 文件）通过。
- Electron 生产构建及 D 盘路径检查通过；这不是安装包或真人平台验收。
- 独立只读复核未发现本轮新增 Critical/Important；复核包含 HTTP 配置/Referer、旧协议兼容、停止守卫和真实 Python 生命周期测试。
- `git diff --check`、新增文件尾空白和生产夹具标记扫描无问题，匹配项目的测试/Worker 进程为 0。原 B/S `fa2faa6`，工作区干净。

按用户要求，**当前功能已完成并在此结束，不开始下一业务**。本轮代码、测试与文档留在工作区，未暂存、未提交、未推送；HEAD 仍为 `b2e5a89`。交接见 `2026-09-13-migration-handoff.md`。
