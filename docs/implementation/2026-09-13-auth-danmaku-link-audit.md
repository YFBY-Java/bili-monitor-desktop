# M07 登录与弹幕联动审计

## 范围与依据

原仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，只读且未启动；客户端起点 `e10cae8`。原依据均位于 `social-data-monitor/backend/src`：AuthService、BilibiliCredentialActivatedListener及测试、BilibiliLiveDanmakuService及测试、BilibiliLiveDanmuInfoClient。执行计划见 `docs/superpowers/plans/2026-09-13-auth-danmaku-link-migration.md`。

本项是登录到弹幕连接的本地适配，不代表完整M09弹幕业务、真人扫码或M18原生发布验收。测试未访问真实平台、用户数据库或凭据，也未改Renderer/UI。

## 逐项业务证据

| 原业务/本地边界 | 客户端实现 | 自动验证证据 |
| --- | --- | --- |
| 凭据激活事务提交后异步升级，不在每次扫码查询时重放 | AuthService保存凭据及Outbox、缓存SUCCESS后通知内部callback；Core直接返回扫码结果 | `bilibili-auth-danmaku-link.test.ts`：并发及缓存SUCCESS，Worker仍匿名时只升级一次；新建连接读取已提交Cookie/UID |
| 登录成功不等待WebSocket完成，失败登录不打断原连接 | callback只安排后台任务；异常使用固定代码诊断，不撤销已提交登录 | 慢建连gate仍能收到SUCCESS；空Cookie失败不升级；`bilibili-auth-activation.test.ts`验证监听失败不重复激活、不泄漏原始异常 |
| 激活事务失败不能发布升级事件 | callback位于真实SQLite事务返回后 | 已有凭据基础上制造Outbox主键冲突，证明事务回滚、旧凭据/Outbox不变且没有通知 |
| 仅升级当前有效匿名连接，已登录连接不重连 | 升级执行时筛选active ANONYMOUS并检查句柄身份 | `bilibili-danmaku-upgrade.test.ts`：三房间混合LOGIN/ANONYMOUS；LOGIN的sessionId保持不变 |
| 保留实际协议与自动/手动归属，单房失败继续 | 按原candidate保存protocolVersion/autoManaged；逐房间捕获并记录失败 | 协议0/2升级不改；失败房间ERROR，后续房间LOGIN；暂停自动房间后自动关闭，手动房间仍保留 |
| 原synchronized串行处理连接操作 | 本地有界串行队列，上限100；自动tick共用一次在途任务，真实凭据激活各自排队不丢事件 | 升级中stop最终STOPPED；协议切换不留旧连接；两次真实激活在匿名回退后依次使用99/100账号；队列满返回BUSY、失败后可继续；多tick等待同一建连 |
| 撤销仅停用凭据；已LOGIN连接不强制踢下线/切号 | 不新增远端退出或强制重连；之后创建连接读取当时有效凭据 | Core真实登录→撤销→重连变ANONYMOUS；升级关闭旧socket的等待中撤销后不带旧Cookie；换账号不替换已有LOGIN连接 |
| 本地退出立即禁止迟到写库 | Core首次await前同时停止Follower/Auth/Danmaku；Danmaku清理句柄、写STOPPED并停止source | `bilibili-danmaku-lifecycle.test.ts`：迟到credential/start成功/失败在真实DB关闭重开后均CORE_STOPPED，终态保持；Core等待Auth停止时弹幕已停止 |
| 停止时DB写入/投影异常也必须关socket | stopInternal的finally调用source.stop | 两项存储故障注入先复现未关连接，修复后实际fixture连接表为空；异常仍传给调用方 |
| 迟到事件/昵称查询不能绕过退出边界 | 两处事件落库入口验证stopped和句柄身份 | 保留旧listener，在真实DB关闭后发送heartbeat/closed/error不落库；遮罩昵称解析完成后不新增弹幕 |
| Worker不应答时也不能挂到30秒请求超时 | terminal WorkerSource直接关闭专属transport；transport清pending/timeout/listeners，禁止终止后重启 | `ndjson-realtime-worker-transport.test.ts`：两个真正Node子进程（正常控制应答/不应答），停止前PID存在、停止后ESRCH、在途start立即REALTIME_WORKER_STOPPED |

## 实现与审查记录

- 初始8项联动测试有3项真实差异失败，5项既有行为通过；随后7项服务生命周期和1项Core停止窗口在实现前失败。先修测试自身缺少Outbox参数、以及用stop作为屏障会掩盖重连竞态的问题，再确认业务RED。
- 独立审查指出停止的数据库异常可能跳过关socket，补两项失败回归后改为finally清理；复审关闭。
- 真实子进程先复现“杀掉Worker但请求仍挂到超时”，修复transport取消；复审进一步指出source先等stopAll ACK会阻挡取消，新增不应答子进程先失败，再改terminal source直接停止transport。单房间手动stop仍发送原stop命令；应用整体退出不承诺WebSocket优雅关闭握手，但负责终止自己拥有的进程、释放socket。
- 独立复审7个相关文件33项通过，无遗留Critical/Important/Minor；随后补充两次真实激活排队证据。本轮新增5个测试文件31项；两个子进程fixture使用仓库Node直接执行TypeScript，无新增语言或工具链。
- 完整验证结果及原仓库复验见全量迁移台账。没有自动提交、推送、重启已安装客户端、生成新安装包或真人平台验收。

## 剩余范围

- M07真人扫码、OS密钥与剪贴板、原生Electron/安装包链路仍保留。合成Auth source、SQLite与真实测试子进程不等于真人/原生端到端验收。
- M08直播REST业务继续逐操作核对；M09还要核对真实getDanmuInfo/WBI/匿名回退、自动房间优先级与容量、协议/心跳/事件/错误恢复全链路。当前登录联动测试不替代这些业务。
- 预检已见自动调度差异：原syncAutoConnections先跳过手动房间再填满自动容量，客户端仍先slice再跳过已有连接；在M09按原Repository查询和调度规则一起修正，不把本项“保留autoManaged”测试误作容量等价证明。
