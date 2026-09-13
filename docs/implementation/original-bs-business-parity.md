# 原 B/S 项目业务复刻基线

基线版本：`D:\codex_work\BiliMonitor` commit `01200f3c21c264963f2ad92a23b991ced5b0c9c0`。

> 2026-09-13：本机原项目已更新至 `fa2faa6`。本文件保留旧基线接入记录；最新差异、逐功能顺序与验收状态以 [全量迁移台账](2026-09-13-full-migration-tracker.md) 为准。不能依据本文件的旧“已完成”描述判断当前全量业务等价。

> 2026-09-05 重新逐项复核：下表记录前期已接入的代码范围，不能作为“全部业务已验收”的结论。本轮在粉丝操作/调度和直播快照应用中复现了真实差异；修复、测试与后续待核对项见 [逐项迁移记录](2026-09-05-migration-progress.md)。其它模块继续按原前端、Service、Repository 一项一项验收。

本文只记录原项目已经形成真实闭环的业务。原项目中的 Dashboard Mock、采集任务 Mock、AI Mock、Identity 雏形、系统设置占位和通用多平台骨架，不属于当前桌面端复刻范围，也不能在桌面端标记为“已实现”。

## 完成判定

一个业务只有同时满足以下条件，才允许进入桌面端导航：

1. 共享 Contract 定义 Command、Query、Result、Error 和状态枚举。
2. Local Core 实现原 Service 的状态转换、限频、重试、调度和幂等规则。
3. SQLite migration、Repository、级联关系和唯一约束完整。
4. Python 或 Node Worker 完成真实平台调用，并保留可回放的原始证据。
5. Preload 只暴露窄化 IPC，Renderer 不直接访问 Node、数据库、凭据或浏览器 Profile。
6. UI 的新增、修改、删除、刷新、筛选、分页、导出和错误状态均可实际操作。
7. 单元测试、契约测试、录制响应回放、Core 集成测试和桌面 smoke test 通过。

## 总体迁移状态

| 业务闭环 | 原项目入口 | 当前桌面端状态 | 是否允许显示 |
| --- | --- | --- | --- |
| B站粉丝监控 | `/bilibili` | 主体已接入；2026-09-05 补齐启停/刷新并发、秒级调度、趋势选择、页面自动更新和错误反馈 | 是 |
| B站扫码登录态 | `/bilibili` 顶部 | 代码链路完成、真实二维码生成通过；真人扫码待手工验收 | 与粉丝页同屏 |
| B站直播间监控 | `/bilibili/live` | REST 主体已接入；2026-09-05 补齐快照事务、并发设置、旧结果及下播信号规则；卡片增改删/趋势/事件新增 10 项浏览器点击回归通过，真人平台验收与其它页签待续 | 是 |
| 直播弹幕与榜单 | `/bilibili/live`、Subject 工作台 | WebSocket、协议解析、登录态升级、昵称补全、榜单快照和真实房间 smoke 已完成 | 是，合并在直播与用户工作台 |
| 直播场次、数据中心、分析和导出 | `/bilibili/live`、`/data`、`/analytics` | 场次状态机、事实查询、洞察及 CSV/XLSX/ZIP 导出已完成自动回归 | 是，合并在直播页签 |
| 指定用户监控工作台 | `/subjects`、`/subjects/:id` | UID 首建、弱直播绑定、聚合工作台、趋势、榜单与布局持久化已完成 | 是 |
| 抖音本人登录态 | `/douyin` | Web/OAuth 独立凭据、Playwright、复验、导出、自定义协议回调和 UI 已完成；真人扫码/授权待手工验收 | 是 |

## 1. B站粉丝监控

### 原业务能力

- 输入正整数 UID 添加用户；添加前调用用户卡片接口校验并生成首条快照。
- 保存昵称、头像、空间地址、粉丝数和关注数。
- 多用户列表、暂停、恢复、删除、立即刷新、单用户采集间隔。
- 采集间隔范围 `1..2592000` 秒；短间隔只提示，不绕过全局限频。
- 定时扫描到期且启用的用户；每批最多 10 个。
- 原 Vue 页面另有每秒到期检查；桌面端改由 Core 每秒检查，页面每 2 秒读取本地投影，1.5 秒端点限频仍有效。
- 保存历史快照并支持单用户和最多 4 用户趋势对比。
- card 接口在可恢复的解析、网络或服务端错误下允许使用 relation/stat 回退；认证、风控和不可恢复错误不能强制回退。
- 删除用户级联删除全部历史；暂停保留原 nextCollectAt，恢复立即到期；修改启用用户间隔时重排下次采集。
- 失败按原规则记录错误并退避，不能伪造成功快照。
- “立即刷新”只更新观测结果，不改变 ACTIVE/PAUSED；显式再次添加已有 UID 才重新启用并应用输入间隔。
- 请求期间修改间隔/暂停/删除必须以最新本地配置为准；迟到结果不能重建已删除监控。

### 原接口

- `GET /api/bilibili/follower-monitor/users`
- `POST /api/bilibili/follower-monitor/users`
- `PATCH /api/bilibili/follower-monitor/users/{userId}/status`
- `PATCH|PUT /api/bilibili/follower-monitor/users/{userId}/settings`
- `POST /api/bilibili/follower-monitor/users/{userId}/refresh`
- `DELETE /api/bilibili/follower-monitor/users/{userId}`
- `GET /api/bilibili/follower-monitor/users/{userId}/history`
- `GET /api/bilibili/follower-monitor/trends`

### 本地映射

- Contract：`bilibili-followers:list/add/update-status/update-settings/refresh/delete/trend/trends`。
- Core：`BilibiliFollowerMonitorService`，拥有调度、状态和回退规则。
- Worker：Python `httpx`，只走 NDJSON stdio；访问 `x/web-interface/card` 和 `x/relation/stat`。
- Storage：`bilibili_follower_monitor`、`bilibili_follower_snapshot`、`bilibili_api_call`、`object_artifact`。
- Evidence：原始 JSON 按 SHA-256 写入本地 CAS。
- UI：真实列表、操作、错误、空态和趋势，禁止演示数据。

### 本轮发现

- CAS 中的 B站 UTF-8 JSON 正确，中文在 Python stdout 到 Node 的管道中损坏；Worker 启动环境现已强制 UTF-8，并有中文 NDJSON 回归测试。
- 头像缺少加载失败处理；现已保留本地 fallback，并在远程图片失败时隐藏破图元素。

## 2. B站扫码登录态

### 原业务能力

- 生成二维码，返回 loginId、二维码 URL、过期时间和轮询间隔。
- 状态机：`WAITING`、`SCANNED`、`EXPIRED`、`SUCCESS`、`FAILED`。
- 成功后从扫码 Cookie、`Set-Cookie` 和回调 URL 合并 `SESSDATA`、`bili_jct`、`DedeUserID`、`refresh_token` 等字段。
- 使用 `x/web-interface/nav` 校验登录态，保存账号信息和完整凭据。
- 支持状态查询、凭据查看、重新校验和撤销；应用重启后可恢复。
- 凭据激活后通知正在运行的匿名弹幕连接升级为登录态。
- 原 `/refresh` 只是 nav 重新校验，不是完整 Cookie 刷新，桌面端不能扩大其语义。

### 原接口

- `POST /api/bilibili/auth/qr/start`
- `GET /api/bilibili/auth/qr/{loginId}/status`
- `GET /api/bilibili/auth/status`
- `POST /api/bilibili/auth/refresh`
- `GET /api/bilibili/auth/credential`
- `DELETE /api/bilibili/auth`

### 本地实现要求

- Node Auth Worker 负责 passport/nav 网络会话；Renderer 只拿二维码投影和状态。
- Local Core 保存登录会话状态，凭据密文写 SQLite，密钥由 Electron 本机安全存储封装。
- Cookie、CSRF、refresh token 不写日志、不进入 React Query cache、不进入 CAS 原始证据。
- 撤销、过期、重新校验和进程恢复必须有状态机测试。

### 当前实现

- `bilibili-auth.v1` 同时发布 Zod 与语言中立 JSON Schema；6 个认证方法贯通 Renderer、Preload、Main、Core。
- Python Auth Worker 经 NDJSON stdio 调用 Passport generate/poll 与 `x/web-interface/nav`，不开放端口，也不把认证响应写入 CAS。
- Core 完整实现五态映射、终态缓存、最低 Cookie 门槛、稳定 Cookie Header、唯一 ACTIVE、重新校验和撤销。
- SQLite v4 只保存 AES-256-GCM 密文；随机 32 字节密钥由 Electron `safeStorage` 保护后写入 D 盘运行目录。
- UI 已覆盖未登录/已登录、扫码、自动轮询、过期重生成、重新校验、明确查看完整凭据和撤销。
- 自动测试和真实二维码生成 smoke 已通过；SUCCESS 的真人手机确认仍需手工验收，未把它标记为已完成验收。

## 3. B站直播间监控

### 原业务能力

- 按房间号或主播 UID 添加，解析真实长房间号与主播信息。
- 保存主播 UID、房间号/短号、昵称、头像、标题、封面、关键帧、分区、直播状态、热度、关注数和开播时间。
- 多房间列表、启停、删除、立即刷新、采集间隔 `1..2592000` 秒。
- 到期调度、请求限频、分批状态查询、失败退避。
- 保存直播间快照和 `LIVE`、`PREPARING`、轮播、标题变化等状态事件。
- 在线/热度历史趋势，最多 4 个房间对比。

### 原接口

- `GET|POST /api/bilibili/live-monitor/rooms`
- `PATCH|DELETE /api/bilibili/live-monitor/rooms/{roomMonitorId}`
- `POST /api/bilibili/live-monitor/rooms/{roomMonitorId}/refresh`
- `GET /api/bilibili/live-monitor/summary`
- `GET /api/bilibili/live-monitor/rooms/{roomMonitorId}/trends`
- `GET /api/bilibili/live-monitor/trends`
- `GET /api/bilibili/live-monitor/events`

### 当前本地实现

- Contract：`bilibili-live:list/add/update-status/update-settings/refresh/delete/summary/trend/trends/events`。
- Worker：Python `httpx` 经 NDJSON stdio 执行 `room_init`、`get_info`、`get_status_info_by_uids` 和 `getRoomInfoOld`，没有业务监听端口。
- Core：`BilibiliLiveMonitorService` 持有添加/回退、状态变化、重试、限频、批量到期调度和失败退避规则；每批最多 30 个房间。
- Storage：SQLite v5 的 `bilibili_live_room_monitor`、`bilibili_live_room_snapshot` 和 `bilibili_live_status_event`，支持秒级幂等快照、事务内事件派生和级联删除。
- Evidence：非认证原始响应按 SHA-256 写入本地 CAS；UI 不提供静态房间、热度或事件。
- UI：真实汇总、添加、列表、启停、删除、刷新、间隔、事件和最多 4 房间趋势；空态不会自动插入示例数据。
- 自动测试与 `LocalCoreRuntime -> Python Live Worker -> B站公开 API -> SQLite` 真实 smoke 已通过。

## 4. 直播弹幕与榜单

### 弹幕业务

- 手动启动/停止，自动协议兼容，也可指定 `protover=0/1/2/3`。
- 读取连接状态、认证模式、认证 UID、最近弹幕和分钟指标桶。
- 登录态可用时使用登录鉴权；失效、风控或不可用时回退匿名，不做验证码绕过。
- 登录态激活后，活动匿名连接异步重连。
- 保存正 UID；缺失 UID 不按昵称猜人。脱敏昵称只有在存在 UID 时才允许通过公开卡片补全，并缓存 12 小时。
- 解析并持久化支持的弹幕、礼物、醒目留言、上舰、直播边界、指标和通知事件。

### 弹幕接口

- `POST /rooms/{roomMonitorId}/danmaku/start`
- `POST /rooms/{roomMonitorId}/danmaku/stop`
- `GET /rooms/{roomMonitorId}/danmaku/status`
- `GET /rooms/{roomMonitorId}/danmaku/recent`
- `GET /rooms/{roomMonitorId}/danmaku/metrics`

### 榜单业务和接口

- 房间观众在线榜、进房榜、日/周/月榜；大航海周/月/陪伴榜。
- 手动刷新并保存快照，页面切换优先读取最近已保存快照。
- `GET /rooms/{roomMonitorId}/ranks/summary`
- `GET /rooms/{roomMonitorId}/ranks/latest`
- `POST /rooms/{roomMonitorId}/ranks/refresh`

### 本地实现要求

- Node WebSocket Worker 独占长连接、心跳、重连、二进制包解压和事件解析。
- Python HTTP Worker 负责榜单与昵称补全请求。
- Local Core 负责凭据投影、连接监督、强 ID 去重、弱事件逐条保留、分钟桶和快照。
- SQLite 迁移弹幕 session/metric/recent 与 rank snapshot/entry 的原约束。

### 当前本地实现

- Node Realtime Worker 通过 NDJSON stdio 持有真实 B站 WebSocket、心跳、重连、zlib/brotli 解包和事件解析；不开放端口。
- Local Core 支持匿名/登录鉴权、凭据激活后的异步升级、强 ID 去重、弱事件接收序列、分钟桶和最近弹幕投影。
- 脱敏昵称只在 DANMAKU 存在正 UID 时调用公开卡片补全；成功缓存 12 小时，失败回退缓存 10 分钟，失败不阻断写入。
- Python Rank Worker 与 SQLite 榜单快照覆盖房间观众、进房、日/周/月贡献和大航海榜；UI 的弹幕、观众榜、大航海三模式均调用真实 IPC。
- SQLite v6/v7 保存连接、事件、指标和榜单；房间 `21144080` 的真实 WebSocket smoke 已通过。

## 5. 直播场次、数据中心、分析和导出

### 场次边界与事实口径

- 状态：`OPEN`、`END_PENDING`、`CLOSED`、`INCOMPLETE`。
- REST 快照、WebSocket `LIVE/PREPARING` 和历史状态共同确定边界。
- `END_PENDING` 必须等待 REST 复核，不能因单个下播包直接关闭。
- 统计只代表应用运行后、WebSocket 在线期间成功解析并持久化的受支持事件，不代表平台全量历史。
- 强上游 ID 幂等；没有强 ID 的真实接收按传输 session 和接收序号保留。
- 身份人数只统计正 UID；缺失 UID 的互动、送礼和付费单列未解析数量。
- 金额统一为 `milli_yuan`；免费/银瓜子礼物不得混入人民币金额。

### 查询接口

- `GET /rooms/{monitorId}/sessions`
- `GET /sessions/{sessionId}`
- `GET /sessions/{sessionId}/users`
- `GET /sessions/{sessionId}/events?kind=&keyword=&userUid=&paid=&page=&size=`
- `GET /sessions/{sessionId}/insights?bucketSeconds=`

### 导出

- 单场 XLSX：固定“场次摘要、弹幕、礼物、用户”四个工作表，前两行为机器字段与中文说明，长 UID 使用文本单元格。
- CSV：UTF-8 BOM、CRLF、稳定列、公式注入防护。
- 完整 ZIP：`manifest.json`、`summary.csv`、`danmaku.csv`、`gifts.csv`、`users.csv`，schema version 2。
- 同次导出必须来自一致只读快照。
- 原接口：`GET /api/bilibili/live-monitor/sessions/{sessionId}/export?category=`。

### 数据中心和分析

- `/data`：房间/场次选择、事件类型/关键词/UID/付费筛选、分页、用户聚合、覆盖质量、导出。
- `/analytics`：互动、付费、参与深度、场内复购、历史复购、消费分层、礼物结构和规则洞察；支持 1/5/15 分钟桶与自动刷新。
- 桌面端不得把原 `/api/analytics/summary` 的 placeholder 当作分析业务；真实分析来自 live session insight 查询。

### 当前本地实现

- SQLite v8/v9 保存场次、覆盖窗口、统一事实、参与用户和导出快照；`OPEN -> END_PENDING -> CLOSED/INCOMPLETE` 由 REST 与 WebSocket 共同推进。
- 查询覆盖场次列表/详情、用户聚合、事件筛选分页和 1/5/15 分钟洞察；UI 以“直播场次、数据中心、场次分析”三个真实页签呈现。
- 导出由 Core 生成一致快照临时文件，Electron Main 弹出 D 盘默认保存对话框；取消会清理临时文件。
- XLSX/CSV/ZIP 的结构、UTF-8 BOM、公式注入防护、长 UID 文本和 manifest schema version 2 均有自动测试。

## 6. 指定用户监控工作台

### 原业务能力

- 输入 B站 UID 创建 Subject，自动查找或创建粉丝监控。
- 尝试查找或创建直播间；无可解析直播间时保留粉丝监控，不让整个创建失败。
- Subject 保存昵称、头像、状态；支持列表、详情、删除和资源绑定修改。
- 工作台聚合粉丝、热度、弹幕速率、采集健康、趋势、弹幕、观众榜和大航海榜。
- Widget layout 持久化；当前原项目仍保留“待添加模块”预留位，预留位不是已实现新功能。

### 原接口

- `GET|POST /api/subjects`
- `GET|PATCH|DELETE /api/subjects/{subjectId}`
- `POST|PATCH /api/subjects/{subjectId}/bilibili-binding`
- `GET /api/subjects/{subjectId}/workbench`
- `GET /api/subjects/{subjectId}/trends`
- `PUT /api/subjects/{subjectId}/layout`

### 本地实现要求

- 不能复用当前通用 `subject/account/policy` 演示骨架冒充完成；必须实现原自动创建/查找、弱失败、Bilibili binding、Workbench 聚合和 layout 语义。
- 依赖粉丝、直播、弹幕和榜单模块完成后再进入导航。

### 当前本地实现

- SQLite v10、`BilibiliSubjectService` 和窄化 IPC 已实现原 UID-first 创建、资源复用、直播弱失败、状态/间隔修改、删除与布局持久化。
- 工作台读取真实粉丝、直播、健康事件、弹幕、观众榜和大航海榜；弹幕协议和榜单刷新在工作台内可直接操作。
- 列表与工作台不注入演示 Subject、昵称、热度或榜单；原项目的“待添加模块”仍只作为预留语义，不冒充功能。

## 7. 抖音本人登录态

### 原业务边界

- 当前只获取和管理启动应用管理员本人的登录态，不采集抖音业务数据。
- Web 扫码：独立 Chromium、二维码、轮询、人工验证状态、成功后完整保存浏览器会话。
- 状态包含需要用户在可见浏览器完成滑块/确认的 `USER_ACTION_REQUIRED`，应用不得绕过。
- Web 登录态支持全新 Context 复验、查看、复制、JSON 导出和撤销。
- OAuth 为独立凭据路径，可 disabled/mock/live；桌面正式功能只允许 live 配置，mock 只能留在测试。
- Web 与 OAuth 凭据相互独立，也不能覆盖 Bilibili 凭据。

### 原接口

- `POST /api/douyin/auth/web/qr/start`
- `GET /api/douyin/auth/web/qr/{loginId}/image`
- `GET /api/douyin/auth/web/qr/{loginId}/status`
- `POST /api/douyin/auth/web/validate`
- `POST /api/douyin/auth/oauth/start`
- `POST /api/douyin/auth/oauth/refresh`
- `GET /api/douyin/auth/status`
- `GET /api/douyin/auth/credentials/{oauth|web}`
- `GET /api/douyin/auth/credentials/{oauth|web}/export`
- `DELETE /api/douyin/auth/credentials/{oauth|web}`

### 本地实现要求

- Node Playwright Auth Worker 使用项目 D 盘 Chromium 和 Profile；不启动业务 HTTP Server。
- OAuth 回调优先使用应用自定义协议或一次性 loopback callback，仅在 OAuth 授权期间临时监听随机端口，完成后立即关闭。
- Local Core 管登录 session、凭据版本、原子激活、复验和撤销；Renderer 不接触 Profile 文件。

### 当前本地实现

- SQLite v11 分别保存 `DOUYIN_WEB_SESSION` 与 `DOUYIN_OAUTH2`，每种类型最多一个 ACTIVE；替换、刷新和撤销保留历史且互不覆盖。
- Node Playwright Worker 使用项目 D 盘 Chromium，通过 NDJSON stdio 管理可见浏览器、二维码、`USER_ACTION_REQUIRED`、全新 Context 复验和完整会话捕获。
- 捕获字段包括 Cookie、逐 Origin 的 localStorage/sessionStorage/IndexedDB、Playwright storageState、Cookie Header 与浏览器上下文；敏感 JSON 以 AES-256-GCM 密文写 SQLite。
- Python Auth Worker 对接抖音官方 token、refresh 和 userinfo API；正式模式只有 disabled/live，mock 不进入产品。
- Electron 注册 `bilimonitor://douyin-oauth` 回调并校验 code/state；同时保留手工粘贴 code 的兼容入口。查看、复制、D 盘保存对话框导出和撤销均为真实操作。
- OAuth 拒绝、失败和过期会写回 SQLite 会话；冷启动或 Renderer 重载后可从状态查询恢复，不依赖瞬时 IPC 事件。
- 安装版从 `D:\BiliMonitor Desktop Data\config` 读取一次性配置，随后用 Electron `safeStorage` 加密并移除明文；client secret 不进入 Renderer、浏览器 Worker 或爬虫 Worker。
- 自动测试覆盖双凭据独立性、Token 轮换、Worker 状态机、完整存储捕获、深链回调和 UI；真人扫码、滑块与真实开放平台授权仍需手工验收。

## 实施顺序

1. 完成粉丝监控运行态纠错和验收。
2. B站扫码登录态。
3. 直播间 REST 监控、快照、状态事件和趋势。
4. 弹幕 WebSocket、认证升级和榜单。
5. 场次边界、事实查询、洞察和导出。
6. 指定用户聚合工作台。
7. 抖音本人 Web/OAuth 登录态。

每完成一项，先通过该项验收矩阵，再把对应入口加入导航。AI、Agent、知识库、模型路由和扩展平台在上述原业务全部完成前不进入当前开发范围。
