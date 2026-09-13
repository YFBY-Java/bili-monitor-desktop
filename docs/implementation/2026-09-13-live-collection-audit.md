# M08 直播采集与快照应用审计

## 范围及依据

原 B/S 仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`，本轮只读、不启动；客户端起点 `9e091f6`。本轮迁移 Core 的采集快照、初始化、失败和重试语义，不等于整个 M08、Worker parser 或场次业务已经验收。

原依据（均以 `social-data-monitor/backend/src/main/java/com/socialmonitor/` 为根）：

- `bilibili/live/service/BilibiliLiveMonitorService.java`：新增/详情组合、手动/批量采集、失败事件、重试、退避。
- `bilibili/live/service/BilibiliLiveSnapshotApplicationService.java`：初始化与采集两种事务次序、旧快照/待结束信号保护。
- `bilibili/live/domain/BilibiliFetchedLiveRoomSnapshot.java`：`mergeWith` 和 `withExistingProfile` 的字段优先级与原非空文本定义。
- `bilibili/live/repository/BilibiliLiveMonitorRepository.java`：重新激活 SQL 的 now() 优先级、成功/失败事件字段、同秒快照覆盖字段。
- `collector/service/RetryPolicy.java`、`bilibili/live/client/BilibiliLiveApiClient.java` 及上述服务/Repository 原测试；REST待结束时刻比较另查 `bilibili/live/session/service/BilibiliLiveSessionBoundaryService.java`。

## 逐项结果

| 原规则 | 客户端实现及验证 |
| --- | --- |
| 新采集只回填资料和关注，不补旧热度/开播时间 | Core在取得本次结果后用请求开始时room补资料；手动与批量均用真实SQLite确认当前热度/时间为空，原资料/关注保留 |
| 新初始化/重新添加不回填旧资料，也不产生成功状态事件 | 直接应用本次接口合并结果；重新激活和新间隔生效，旧错误/backoff清空，缺失资料清空；ERROR_RECOVERED/LIVE_STARTED/TITLE_CHANGED不误增 |
| 旧结果重新添加只更新设置 | 原SQL enabled=true覆盖入参时间为now；客户端间隔修改后激活，排程立即到期，旧快照、状态、错误/backoff和场次不改 |
| 采集成功事务先事件、再场次、再当前行/快照；初始化先当前行、再场次、再快照 | Storage接受同步boundary回调，均在同一Core事务内；回调看到原规定的previous/current和当时已落库内容；真实场次失败回滚所有业务写入 |
| 旧快照/新待结束信号保护比较时刻，不比较字符串 | 共用九位小数时刻比较，覆盖等价Z/.000Z/.000000Z和微秒；REST待结束保护在Core与Session两处一致；不重写存量时间 |
| 快照时间与事件发生时间不同 | 快照/排程仍以fetchedAt为准；事件和行updatedAt使用本次appliedAt。跨上海午夜回归确认今日开播数不按旧采集时间漏计 |
| ERROR_RECOVERED保留旧房间身份；状态/标题变化使用新快照身份 | 真实房间号变化+错误恢复回归；ERROR_OCCURRED使用请求捕获的上下文，不因并发新成功而把旧失败配上新状态 |
| 同秒快照覆盖不改原uid/room_id | 当前monitor可跟随新响应，但已存在秒桶的历史身份保留；其余观测字段更新。修改前已复现122被改成222 |
| 是否重试由原错误类别决定，日志仍保留raw retryable | 仅RATE_LIMITED/NETWORK_ERROR/SERVER_ERROR重试；默认最多3次，配置更大仍受原策略限制最多4次；最小100ms退避并翻倍 |
| 批缺UID为UNKNOWN/true，失败输出带来源 | 缺一房只失败该房，不发起详情补采；整批源失败保留可信endpoint与原60..900秒退避。旧接口无房按原UNKNOWN处理 |
| 内部数据库/场次失败不冒充平台失败 | `LiveFetchFailure`仅包裹source/响应校验失败；真实SQLite call_id唯一键冲突、场次回调异常、批内第二房失败均不错误记录平台失败或污染已成功房间 |

## 测试与审查证据

- 新增 `bilibili-live-collection-parity.test.ts` 33项：外部API响应为合成数据，服务、Repository、事件、Outbox和场次均为真实实现，SQLite位于D盘隔离临时目录。最后补重复显式失败各自留事件、旧直播状态1收到0时不回填的审计覆盖。
- 初轮新增26项中23项失败，加上纠正原stale re-add错误期望后旧测试1项失败。随后补待结束同刻格式、并发失败上下文和同秒历史身份，均先复现失败再修复。其余已存在行为的通过回归只作为审计覆盖，不冒充新增业务。
- 独立只读审查核对原真实SQL，指出同秒历史身份覆盖差异并复现；并发失败上下文和同秒历史身份两项修复均复查关闭，最终无未关闭的Critical/Important。独立运行3个定向文件42项通过。
- 新测试中两处场次状态曾误写为LIVE，按已有共享契约修正为OPEN；fixture的字面量泛型和ES2022不支持的findLast也已修正，没有改编译目标或生产状态定义。
- 最终完整 `check.cmd` 退出0：Node526项（契约89、Storage17、Task3、Core214、Browser12、Realtime19、Desktop172）、Python105项；TypeScript/mypy、Black/isort、Electron生产构建和D盘路径检查通过。`git diff --check`通过，生产包未发现本轮collection fixture，未发现测试Realtime Worker残留。原仓库仍为`fa2faa6`且工作区干净。

## 证据边界和后续

- `workerBoundary`回归实际使用`BilibiliLiveWorkerSource`的校验，成功payload/result做JSON往返；合成错误直接抛出，没有通过真实`NdjsonPythonWorkerTransport.parseError`。它不证明实际Python进程、NDJSON错误字节传输或真人接口已经验收；后续Worker子项必须补该链路。
- Python Live parser仍需逐字段迁移：0分区/short ID、昵称回退、旧接口空snapshot、错误分类、请求头与时间字段等。本轮Core修正不豁免这些差异。
- M08 Core退出取消/进程终止、直播页详情/汇总/倒计时/1–4趋势布局/拖动/图表、505房初始渲染性能仍未迁移完。
- M11另记：当前`changedIdentity`对platformLiveTime使用字符串不等，原按Instant比较；相同开播时刻的不同ISO格式仍可能被误判重启。这不同于本轮fetchedAt/pending保护，不宣称已修复所有场次时间比较。
- 不访问用户库/凭据，不启动原B/S，不重启已安装客户端或重打安装包，不自动提交/推送。真人、原生Electron/安装包、M09–M18仍需完整验收。
