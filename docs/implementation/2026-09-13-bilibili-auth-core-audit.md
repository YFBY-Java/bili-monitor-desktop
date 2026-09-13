# M07 登录采集、会话与本地生命周期审计

## 范围

原 `D:\codex_work\BiliMonitor` 只读基线 `fa2faa6`；客户端起点 `b7ce839`。本轮对应原 `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/auth/` 的 PassportClient、AuthService、CookieState、QrLoginSessionStore、CredentialRepository 和配置/测试。

本文件记录代码与自动验证，不代表M07全部完成，更不代表M08–M18完成。真人扫码、实际OS密钥/剪贴板、原生Electron进程/安装包、登录与弹幕连接联动仍有独立验收项。未访问原项目运行时、真实平台、用户数据库或凭据。

## 原业务与客户端证据

| 原操作/规则 | 客户端实现 | 验证证据 |
| --- | --- | --- |
| 原CookieManager保存HTTP状态；原提取结果由jar、Set-Cookie及query补缺组成 | Python真实httpx CookieJar，WorkerPollResult兼容追加可选jarCookies；cookies仅供凭据保存/校验，jarCookies用于后续轮询 | Python `test_bilibili_auth_parity.py` 连续轮询；Core `bilibili-auth-parity.test.ts` 独立jar/空jar传递；同一 `auth-poll-cookies.json` 的TS/Python五例校验 |
| Set-Cookie覆盖旧值，query只补缺失；原值不二次解码或strip | `parse_qr_poll_response`、`merge_cookies`；展示字段仍按原COOKIE_ORDER白名单 | 同名HEADER/QUERY优先级、元数据和原值、非白名单/空白过滤测试 |
| HTTP会话保留生成时Cookie、有效作用域、到期及删除 | 生成返回完整有效jar，恢复Cookie对象保留属性；空值Max-Age=0由CookieJar执行，raw元数据不再覆盖会话 | 有旧值→删除→query补值；过期无替换；省略Domain/Path三种连续删除；非展示白名单HTTP Cookie保留 |
| nav发送原顺序完整Cookie Header，10秒请求/5秒连接，禁止重定向 | `_get`内nav使用显式Header；UA/Referer采用原默认值 | 真实HTTP请求构造+MockTransport，确认包含passport作用域字段、原值/顺序、timeout、302不跟随和429/503分类 |
| 生成前起算180秒，轮询五态；无Cookie成功返回FAILED，不缓存未知FAILED | `startQrLogin`、`pollSession`、`completeLogin` | 人工时钟下生成耗时170秒只剩10秒；空Cookie失败可再读取SCANNED；既有WAITING/SCANNED/EXPIRED测试 |
| 成功/过期缓存；旧会话每60秒清理，过期后再保留180秒 | Core内部清理定时器，stop清理；同会话共享在途Promise | 360秒边界仍可回读，420秒清理后NOT_FOUND；并发poll只产生一次nav和激活Outbox |
| 凭据取最早到期，加密保存并重新校验，refresh不刷新Cookie | Core按实际时间排序；真实Cipher/SQLite；保留原createdAt、refreshToken和账号 | `.100Z`/`Z`排序；隔离SQLite真正关闭重开后完整字段恢复；status/扫码/Outbox不暴露原文 |
| 原currentStatus只将BusinessException转过期 | 已知平台认证/网络/HTTP/API/解析错误维持原EXPIRED投影；未知source/storage异常保留记录并返回安全稳定错误 | `bilibili-auth-lifecycle.test.ts` 已知错误2例、未知错误2例，检查存储及Outbox不变 |
| 本地撤销/新登录后，旧校验不能恢复旧凭据 | 在异步返回和catch边界检查当前credentialId；撤销使旧会话/在途生成失效 | status/credential/refresh三路径、旧校验失败、新账号替换、生成/poll/nav三个撤销窗口 |
| 本地Core退出不能继续请求/写库 | AuthService先停标记并清理会话/计时器，再关闭source；Core首次await前同时停止粉丝和登录服务 | 迟到生成/poll/nav、stop幂等、成功/失败取消不改凭据；真实Core挂起另一Worker停止再释放nav，返回CORE_STOPPED |
| 原六类用户操作必须贯通，而非只模拟界面返回 | 实际Preload校验→Router→Core→SQLite；仅替换Electron传输和平台source | `apps/desktop/src/main/auth-workflow.integration.test.ts` 完整执行start/poll/status/credential/refresh/revoke，非法ID不触发source，两次重开证明保存与撤销持久化 |

## 审查与修复过程

- 初始Core新增19例中18例失败、1例既有恢复行为通过；不把通过的既有行为声称为新实现。Python初始10例中6例失败、4例已有HTTP分类通过。
- 独立审查发现未知错误误判EXPIRED及Core外层停机延迟，分别写失败回归再修正。对停止的保护不只停留在独立Service测试。
- Cookie删除的连续请求测试暴露“展示字段当作HTTP会话”的结构差异，最终分离jarCookies与cookies，而非给缺省Domain/Path随意补默认值。保留原展示字段语义和兼容旧v1 Worker，不改Renderer响应；同一五条fixture跨TS/Python验证。
- UI独立审查未发现重要问题；窄屏单列被后加载全局CSS覆盖的Minor已先复现双列，再提高局部选择器优先级，760px面板实测单列并复审关闭。没有全局换色或修改其他界面。
- Core/Worker复审的Critical/Important已关闭。定向Core28、Contracts8、Python26通过；全量最终结果见全量迁移台账。

## 下一项及未完成边界

原 `BilibiliCredentialActivatedListener` 在凭据激活事务提交后调度匿名弹幕连接升级；客户端目前在SUCCESS轮询返回后发起重连。下一项继续对照原DanmakuService/测试，逐项验证重复成功回读、并发升级、当前连接筛选、协议保持、部分失败、撤销与退出窗口，不从本轮登录存储测试推断连接业务已完成。

本轮没有实现Cookie自动刷新（原项目同样未完成），没有将其伪装为已实现功能。独立HTTP MockTransport、内存Worker替身及手工桥接不等同于真人扫码、真实HTTP或原生Electron端到端验收；这些仍在M07/M18台账中。
